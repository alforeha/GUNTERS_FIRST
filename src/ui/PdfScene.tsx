import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
import { useAppStore, type PdfSheetEntry } from '../state/store';
import { DEFAULT_PIXELS_PER_FOOT, pixelsPerFootForSheet } from '../viewer/RenderPdf';
import type { BorderCrop, CropRect, PdfNorthArrow, PdfScaleBar, PdfKnownDistance } from '../core/contract';
import type { PdfDecodeTileRequest, PdfOpenRequest, PdfWorkerMessage } from '../workers/pdf.worker';
import {
  getPdfSourceFile,
  returnToWorldScene,
  setPdfBorderCrop,
  setPdfCalibration,
  setPdfFlatOffset,
  setPdfOrientation,
  setNorthArrow,
  setScaleBar,
  setKnownDistance,
  setWhiteThreshold,
} from './importController';
import { engineHolder } from './engineHolder';
import styles from './App.module.css';

const TILE_SIZE_PX = 1024;
const MAX_CONCURRENT = 4;

// Indeterminate loading bar: bar width as fraction of track, cycle duration in ms.
const LOADING_BAR_WIDTH = 0.35;
const LOADING_BAR_CYCLE_MS = 1400;

// N-circle: 1 inch diameter at 150 dpi = 150px.
const NORTH_ARROW_RADIUS = 75; // px in sheet space
const NORTH_ARROW_HIT_CENTER = 20; // px screen-space hit radius for center drag
const NORTH_ARROW_HIT_TIP = 18;   // px screen-space hit radius for tip drag
// Scale bar: 150 sheet-px wide = 1 inch at 150 dpi
const SCALE_BAR_LEN_PX = 150;
const CROP_STROKE_COLOR = '#53c7c0';
const CROP_HANDLE_RADIUS = 40;
const CROP_MIDPOINT_RADIUS = 20;
const CROP_HIT_RADIUS = 50;

type ToolMode = 'scale-bar' | 'known-distance' | 'north';
type NorthDragKind = 'move' | 'rotate';
type LoadingState = 'opening' | 'rendering' | 'ready';

interface TileCache {
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

interface Point2 {
  x: number;
  y: number;
}

function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Arrow tip position in sheet-px space given center + angleDeg. */
function northTipInPage(center: Point2, angleDeg: number): Point2 {
  const rad = (angleDeg - 90) * Math.PI / 180; // 0deg = up = -Y in canvas
  return {
    x: center.x + Math.cos(rad) * NORTH_ARROW_RADIUS,
    y: center.y + Math.sin(rad) * NORTH_ARROW_RADIUS,
  };
}

/** Compute angle from center to a drag point, in our north-angle convention (0=up, CW). */
function angleFromCenterToPoint(center: Point2, p: Point2): number {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  return ((deg % 360) + 360) % 360;
}

function computeVisibleTileWindows(
  pan: Point2,
  zoom: number,
  viewportW: number,
  viewportH: number,
  sheetW: number,
  sheetH: number,
): [number, number, number, number][] {
  const toSheetX = (sx: number) => (sx - pan.x) / zoom + sheetW / 2;
  const toSheetY = (sy: number) => (sy - pan.y) / zoom + sheetH / 2;
  const visX0 = Math.max(0, Math.floor(toSheetX(0)));
  const visY0 = Math.max(0, Math.floor(toSheetY(0)));
  const visX1 = Math.min(sheetW, Math.ceil(toSheetX(viewportW)));
  const visY1 = Math.min(sheetH, Math.ceil(toSheetY(viewportH)));
  const windows: [number, number, number, number][] = [];
  for (let ty = Math.floor(visY0 / TILE_SIZE_PX) * TILE_SIZE_PX; ty < visY1; ty += TILE_SIZE_PX) {
    for (let tx = Math.floor(visX0 / TILE_SIZE_PX) * TILE_SIZE_PX; tx < visX1; tx += TILE_SIZE_PX) {
      windows.push([tx, ty, Math.min(sheetW, tx + TILE_SIZE_PX), Math.min(sheetH, ty + TILE_SIZE_PX)]);
    }
  }
  return windows;
}

function makeTileCanvas(tile: { width: number; height: number; rgba: Uint8ClampedArray }): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = tile.width;
  canvas.height = tile.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const pixels = new Uint8ClampedArray(tile.rgba.length);
  pixels.set(tile.rgba);
  ctx.putImageData(new ImageData(pixels, tile.width, tile.height), 0, 0);
  return canvas;
}

function drawLoadingOverlay(
  ctx: CanvasRenderingContext2D,
  rectX: number,
  rectY: number,
  rectW: number,
  rectH: number,
  label: string,
): void {
  ctx.save();
  ctx.strokeStyle = '#2a2f35';
  ctx.lineWidth = Math.max(4, Math.min(rectW, rectH) * 0.005);
  ctx.strokeRect(rectX, rectY, rectW, rectH);
  const barTrackW = rectW * 0.75;
  const barH = Math.max(8, Math.min(48, rectH * 0.08));
  const barTrackX = rectX + (rectW - barTrackW) / 2;
  const barTrackY = rectY + rectH / 2 - barH / 2;
  const t = (performance.now() % LOADING_BAR_CYCLE_MS) / LOADING_BAR_CYCLE_MS;
  const barW = barTrackW * LOADING_BAR_WIDTH;
  const leadX = barTrackX + (barTrackW + barW) * t;
  const barX = leadX - barW;
  ctx.fillStyle = '#1e2226';
  ctx.fillRect(barTrackX, barTrackY, barTrackW, barH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(barTrackX, barTrackY, barTrackW, barH);
  ctx.clip();
  ctx.fillStyle = '#3a4149';
  ctx.fillRect(barX, barTrackY, barW, barH);
  ctx.restore();
  const fontSize = Math.max(12, Math.min(64, rectH * 0.04));
  ctx.font = `${fontSize}px sans-serif`;
  ctx.fillStyle = '#5a6270';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(label, rectX + rectW / 2, barTrackY - Math.max(4, fontSize * 0.4));
  ctx.restore();
}

/** Draw the N-circle markup in screen space. center/tip are already in screen coords. */
function drawNorthArrow(
  ctx: CanvasRenderingContext2D,
  center: Point2,
  tip: Point2,
  color: string,
  radiusPx: number,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  // Circle
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  // Arrow shaft from center to tip
  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

  // Arrowhead at tip
  const dx = tip.x - center.x;
  const dy = tip.y - center.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    const ux = dx / len;
    const uy = dy / len;
    const headLen = 10;
    const headW = 5;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(tip.x - ux * headLen - uy * headW, tip.y - uy * headLen + ux * headW);
    ctx.lineTo(tip.x - ux * headLen + uy * headW, tip.y - uy * headLen - ux * headW);
    ctx.closePath();
    ctx.fill();
  }

  // N label at center
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', center.x, center.y);

  // Tip handle dot
  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Draw north arrow directly in sheet-pixel space (used by PdfSheetCanvas group view). */
function drawNorthArrowSheetPx(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angleDeg: number,
  color: string,
): void {
  const rad = (angleDeg - 90) * Math.PI / 180;
  const tip: Point2 = {
    x: x + Math.cos(rad) * NORTH_ARROW_RADIUS,
    y: y + Math.sin(rad) * NORTH_ARROW_RADIUS,
  };
  drawNorthArrow(ctx, { x, y }, tip, color, NORTH_ARROW_RADIUS);
}

/** Draw a double-arrow horizontal line in sheet-px space (scale bar markup in group view). */
function drawScaleBarSheetPx(
  ctx: CanvasRenderingContext2D,
  sb: PdfScaleBar,
): void {
  const { x, y, color, realWorldFt } = sb;
  const half = SCALE_BAR_LEN_PX / 2;
  const x0 = x - half;
  const x1 = x + half;
  const headLen = 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  // line
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  // left arrowhead
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x0 + headLen, y - 5);
  ctx.lineTo(x0 + headLen, y + 5);
  ctx.closePath();
  ctx.fill();
  // right arrowhead
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x1 - headLen, y - 5);
  ctx.lineTo(x1 - headLen, y + 5);
  ctx.closePath();
  ctx.fill();
  // label
  if (realWorldFt !== null) {
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`1" = ${realWorldFt}ft`, x, y + 8);
  }
  ctx.restore();
}

/** Draw a double-arrow line between two points in sheet-px space (known distance markup). */
function drawKnownDistanceSheetPx(
  ctx: CanvasRenderingContext2D,
  kd: PdfKnownDistance,
): void {
  const { begin, end, color, realWorldFt } = kd;
  const dx = end.x - begin.x;
  const dy = end.y - begin.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = 10;
  const headW = 5;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(begin.x, begin.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
  // begin arrowhead
  ctx.beginPath();
  ctx.moveTo(begin.x, begin.y);
  ctx.lineTo(begin.x + ux * headLen - uy * headW, begin.y + uy * headLen + ux * headW);
  ctx.lineTo(begin.x + ux * headLen + uy * headW, begin.y + uy * headLen - ux * headW);
  ctx.closePath();
  ctx.fill();
  // end arrowhead
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(end.x - ux * headLen - uy * headW, end.y - uy * headLen + ux * headW);
  ctx.lineTo(end.x - ux * headLen + uy * headW, end.y - uy * headLen - ux * headW);
  ctx.closePath();
  ctx.fill();
  // label at midpoint
  if (realWorldFt !== null) {
    const measuredIn = len / 150;
    const mx = (begin.x + end.x) / 2;
    const my = (begin.y + end.y) / 2;
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${measuredIn.toFixed(2)}" = ${realWorldFt}ft`, mx, my - 4);
  }
  ctx.restore();
}

function defaultRectCrop(sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>): CropRect {
  return { kind: 'rect', x: 0, y: 0, width: sheet.widthPx150, height: sheet.heightPx150 };
}

function effectiveCrop(crop: BorderCrop | null, sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>): BorderCrop {
  return crop ?? defaultRectCrop(sheet);
}

function cropPoints(crop: BorderCrop): Point2[] {
  if (crop.kind === 'polygon') return crop.points.map(([x, y]) => ({ x, y }));
  return [
    { x: crop.x, y: crop.y },
    { x: crop.x + crop.width, y: crop.y },
    { x: crop.x + crop.width, y: crop.y + crop.height },
    { x: crop.x, y: crop.y + crop.height },
  ];
}

function traceBorderCropSheetPx(
  ctx: CanvasRenderingContext2D,
  crop: BorderCrop,
): void {
  ctx.beginPath();
  if (crop.kind === 'rect') {
    ctx.rect(crop.x, crop.y, crop.width, crop.height);
    return;
  }
  const points = cropPoints(crop);
  if (points.length < 2) return;
  ctx.moveTo(points[0]!.x, points[0]!.y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i]!.x, points[i]!.y);
  }
  ctx.closePath();
}

function drawBorderCropSheetPx(
  ctx: CanvasRenderingContext2D,
  crop: BorderCrop,
): void {
  traceBorderCropSheetPx(ctx, crop);
  ctx.stroke();
}

function cropMidpoints(crop: BorderCrop): Array<Point2 & { insertIndex: number }> {
  const points = cropPoints(crop);
  const midpoints: Array<Point2 & { insertIndex: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    midpoints.push({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      insertIndex: i + 1,
    });
  }
  return midpoints;
}

function pointInPolygon(point: Point2, polygon: Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && (point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || Number.EPSILON) + a.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function clampSheetPoint(p: Point2, sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>): Point2 {
  return {
    x: Math.max(0, Math.min(sheet.widthPx150, p.x)),
    y: Math.max(0, Math.min(sheet.heightPx150, p.y)),
  };
}

function pointTuple(p: Point2): [number, number] {
  return [p.x, p.y];
}

function moveCropVertex(
  crop: BorderCrop | null,
  vertexIndex: number,
  nextPoint: Point2,
  sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>,
): BorderCrop {
  const base = effectiveCrop(crop, sheet);
  const points = cropPoints(base).map((point) => ({ ...point }));
  if (!points[vertexIndex]) return base;
  points[vertexIndex] = clampSheetPoint(nextPoint, sheet);
  return { kind: 'polygon', points: points.map(pointTuple) };
}

function insertCropVertex(
  crop: BorderCrop | null,
  insertIndex: number,
  nextPoint: Point2,
  sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>,
): { crop: BorderCrop; vertexIndex: number } {
  const base = effectiveCrop(crop, sheet);
  const points = cropPoints(base).map((point) => ({ ...point }));
  const clampedPoint = clampSheetPoint(nextPoint, sheet);
  const vertexIndex = Math.max(0, Math.min(points.length, insertIndex));
  points.splice(vertexIndex, 0, clampedPoint);
  return {
    crop: { kind: 'polygon', points: points.map(pointTuple) },
    vertexIndex,
  };
}

function drawCropOverlay(
  ctx: CanvasRenderingContext2D,
  crop: BorderCrop | null,
  sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>,
  showHandles: boolean,
): void {
  const activeCrop = effectiveCrop(crop, sheet);
  const points = cropPoints(activeCrop);
  ctx.clearRect(0, 0, sheet.widthPx150, sheet.heightPx150);
  if (showHandles) {
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(0, 0, sheet.widthPx150, sheet.heightPx150);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 1)';
    traceBorderCropSheetPx(ctx, activeCrop);
    ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.strokeStyle = CROP_STROKE_COLOR;
  ctx.fillStyle = CROP_STROKE_COLOR;
  ctx.lineWidth = 4;
  ctx.globalAlpha = crop ? 1 : 0.45;
  drawBorderCropSheetPx(ctx, activeCrop);
  if (showHandles) {
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, CROP_HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.lineWidth = 2;
    for (const midpoint of cropMidpoints(activeCrop)) {
      ctx.beginPath();
      ctx.arc(midpoint.x, midpoint.y, CROP_MIDPOINT_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function usePdfTileCache(sheet: PdfSheetEntry) {
  const file = getPdfSourceFile(sheet.fileId);
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef(new Map<number, (msg: PdfWorkerMessage) => void>());
  const tilesRef = useRef(new Map<string, TileCache>());
  const loadingRef = useRef(new Set<string>());
  const inFlightCountRef = useRef(0);
  const messageIdRef = useRef(0);
  const workerReadyRef = useRef(false);
  const [, bump] = useState(0);
  const [status, setStatus] = useState('PDF Scene');
  const [loadingState, setLoadingState] = useState<LoadingState>('opening');

  const dispatchTile = useCallback((window: [number, number, number, number]): void => {
    const worker = workerRef.current;
    if (!worker || !workerReadyRef.current) return;
    const key = `${window[0]}:${window[1]}`;
    if (tilesRef.current.has(key) || loadingRef.current.has(key)) return;
    if (inFlightCountRef.current >= MAX_CONCURRENT) return;
    loadingRef.current.add(key);
    inFlightCountRef.current++;
    const id = ++messageIdRef.current;
    const req: PdfDecodeTileRequest = {
      kind: 'decodeTile',
      id,
      pageIndex: sheet.pageIndex,
      window,
      whiteThreshold: sheet.whiteThreshold,
    };
    pendingRef.current.set(id, (msg) => {
      pendingRef.current.delete(id);
      loadingRef.current.delete(key);
      inFlightCountRef.current = Math.max(0, inFlightCountRef.current - 1);
      if (msg.type === 'tile' && msg.ok) {
        tilesRef.current.set(key, {
          x: msg.tile.x,
          y: msg.tile.y,
          width: msg.tile.width,
          height: msg.tile.height,
          canvas: makeTileCanvas(msg.tile),
        });
        setLoadingState('ready');
        bump((value) => value + 1);
      } else if (msg.type === 'result' && !msg.ok) {
        setStatus(`Tile decode failed: ${msg.error}`);
      }
    });
    worker.postMessage(req);
  }, [sheet.pageIndex, sheet.whiteThreshold]);

  const requestVisibleTiles = useCallback((visibleWindows: [number, number, number, number][]): void => {
    for (const window of visibleWindows) {
      if (inFlightCountRef.current >= MAX_CONCURRENT) break;
      dispatchTile(window);
    }
  }, [dispatchTile]);

  useEffect(() => {
    if (!file) {
      setStatus('PDF source file is no longer available in this session.');
      return;
    }
    // Clear any tiles from a previous page before opening/reopening the worker.
    // This handles the case where two sheets share the same source file but differ
    // in pageIndex (multi-page PDF) -- the worker is shared per file but tile cache
    // must be scoped to (file, pageIndex).
    tilesRef.current.clear();
    loadingRef.current.clear();
    inFlightCountRef.current = 0;
    workerReadyRef.current = false;
    setLoadingState('opening');
    const pending = pendingRef.current;
    const tiles = tilesRef.current;
    const loading = loadingRef.current;
    const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;
    worker.onmessage = (e: MessageEvent<PdfWorkerMessage>) => {
      const resolver = pending.get(e.data.id);
      if (resolver) resolver(e.data);
    };
    const id = ++messageIdRef.current;
    const req: PdfOpenRequest = { kind: 'open', id, fileName: file.name, payload: file };
    pending.set(id, (msg) => {
      if (msg.type === 'progress') { setStatus(msg.label); return; }
      pending.delete(id);
      if (msg.type === 'opened' && msg.ok) {
        setStatus('PDF ready');
        workerReadyRef.current = true;
        setLoadingState('rendering');
        bump((v) => v + 1);
      } else if (msg.type === 'result' && !msg.ok) {
        setStatus(`PDF open failed: ${msg.error}`);
      }
    });
    worker.postMessage(req);
    return () => {
      worker.terminate();
      workerRef.current = null;
      workerReadyRef.current = false;
      inFlightCountRef.current = 0;
      pending.clear();
      tiles.clear();
      loading.clear();
    };
  }, [file, sheet.pageIndex, sheet.whiteThreshold]);

  return { tilesRef, status, loadingState, requestVisibleTiles };
}

interface PdfSheetCanvasHandle {
  requestVisibleTiles(windows: [number, number, number, number][]): void;
}

const PdfSheetCanvas = forwardRef<PdfSheetCanvasHandle, { sheet: PdfSheetEntry; cropActive: boolean }>(
  function PdfSheetCanvas({ sheet, cropActive }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const { tilesRef, status, loadingState, requestVisibleTiles } = usePdfTileCache(sheet);

    useImperativeHandle(ref, () => ({ requestVisibleTiles }), [requestVisibleTiles]);

    useEffect(() => {
      let raf = 0;
      const draw = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
          if (canvas.width !== sheet.widthPx150) canvas.width = sheet.widthPx150;
          if (canvas.height !== sheet.heightPx150) canvas.height = sheet.heightPx150;
          if (cropActive) {
            if (sheet.whiteThreshold !== 0) {
              ctx.clearRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            }
            for (const tile of tilesRef.current.values()) {
              ctx.drawImage(tile.canvas, tile.x, tile.y, tile.width, tile.height);
            }
          } else if (sheet.borderCrop) {
            ctx.clearRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            ctx.save();
            traceBorderCropSheetPx(ctx, sheet.borderCrop);
            ctx.clip();
            if (sheet.whiteThreshold !== 0) {
              ctx.clearRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            }
            for (const tile of tilesRef.current.values()) {
              ctx.drawImage(tile.canvas, tile.x, tile.y, tile.width, tile.height);
            }
            if (loadingState !== 'ready') {
              drawLoadingOverlay(ctx, 0, 0, sheet.widthPx150, sheet.heightPx150, status);
            }
            ctx.restore();
          } else {
            if (sheet.whiteThreshold !== 0) {
              ctx.clearRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            } else {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, sheet.widthPx150, sheet.heightPx150);
            }
            for (const tile of tilesRef.current.values()) {
              ctx.drawImage(tile.canvas, tile.x, tile.y, tile.width, tile.height);
            }
          }
          if (loadingState !== 'ready' && (cropActive || !sheet.borderCrop)) {
            drawLoadingOverlay(ctx, 0, 0, sheet.widthPx150, sheet.heightPx150, status);
          }
          if (sheet.borderCrop) {
            ctx.save();
            ctx.strokeStyle = '#53c7c0';
            ctx.lineWidth = 8;
            drawBorderCropSheetPx(ctx, sheet.borderCrop);
            ctx.restore();
          }
          if (sheet.northArrow?.visible || sheet.scaleBar?.visible || sheet.knownDistance?.visible) {
            if (sheet.borderCrop) {
              ctx.save();
              traceBorderCropSheetPx(ctx, sheet.borderCrop);
              ctx.clip();
            }
            if (sheet.northArrow?.visible) {
              drawNorthArrowSheetPx(ctx, sheet.northArrow.x, sheet.northArrow.y, sheet.northArrow.angleDeg, sheet.northArrow.color);
            }
            if (sheet.scaleBar?.visible) {
              drawScaleBarSheetPx(ctx, sheet.scaleBar);
            }
            if (sheet.knownDistance?.visible) {
              drawKnownDistanceSheetPx(ctx, sheet.knownDistance);
            }
            if (sheet.borderCrop) {
              ctx.restore();
            }
          }
        }
        raf = window.requestAnimationFrame(draw);
      };
      draw();
      return () => window.cancelAnimationFrame(raf);
    }, [cropActive, loadingState, sheet.borderCrop, sheet.heightPx150, sheet.knownDistance, sheet.northArrow, sheet.scaleBar, sheet.widthPx150, status, tilesRef]);

    return <canvas ref={canvasRef} width={sheet.widthPx150} height={sheet.heightPx150} />;
  },
);

function PdfCropOverlayCanvas({ sheet, active }: { sheet: PdfSheetEntry; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (canvas.width !== sheet.widthPx150) canvas.width = sheet.widthPx150;
    if (canvas.height !== sheet.heightPx150) canvas.height = sheet.heightPx150;
    if (!active) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    drawCropOverlay(ctx, sheet.borderCrop, sheet, active);
  }, [active, sheet]);

  return (
    <canvas
      ref={canvasRef}
      width={sheet.widthPx150}
      height={sheet.heightPx150}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}

export function PdfScene() {
  const activeHandle = useAppStore((s) => s.activeSceneObjectHandle);
  const activeKind = useAppStore((s) => s.activePdfSceneKind);
  const pdfSheets = useAppStore((s) => s.pdfSheets);
  const pdfGroups = useAppStore((s) => s.pdfGroups);
  const directSheet = pdfSheets.find((entry) => entry.handle === activeHandle) ?? null;
  const group = pdfGroups.find((entry) => entry.id === activeHandle) ?? null;
  const groupSheets = useMemo(
    () => group ? group.sheetIds.map((id) => pdfSheets.find((sheet) => sheet.handle === id)).filter((sheet): sheet is PdfSheetEntry => !!sheet && sheet.visible) : [],
    [group, pdfSheets],
  );

  if (activeKind === 'group') {
    const sheets = group ? groupSheets : directSheet ? [directSheet] : [];
    if (sheets.length === 0) return null;
    return <GroupPdfScene label={group?.label ?? directSheet?.label ?? 'PDF Scene'} sheets={sheets} />;
  }
  if (!directSheet) return null;
  return <SingleSheetScene sheet={directSheet} kind={activeKind === 'orient' ? 'orient' : 'calibrate'} />;
}

function ptSegDist(p: {x:number,y:number}, a: {x:number,y:number}, b: {x:number,y:number}): number {
  const dx=b.x-a.x, dy=b.y-a.y;
  const lenSq=dx*dx+dy*dy;
  if(lenSq===0) return Math.hypot(p.x-a.x, p.y-a.y);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/lenSq));
  return Math.hypot(p.x-(a.x+t*dx), p.y-(a.y+t*dy));
}

function GroupPdfScene({ label, sheets }: { label: string; sheets: PdfSheetEntry[] }) {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(0.18);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [selectedHandle, setSelectedHandle] = useState<string | null>(null);
  const [cropMode, setCropMode] = useState(false);
  const [rotateMode, setRotateMode] = useState<'idle'|'pivot'|'direction'|'placed'>('idle');
  const [liveOrientDeg, setLiveOrientDeg] = useState<number|null>(null);
  const [ghostDirScreen, setGhostDirScreen] = useState<{x:number,y:number}|null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement|null>(null);
  const rotateDragRef = useRef<{
    baselineOrientation: number;
    handle: string;
    pivotOffsetX: number;
    pivotOffsetY: number;
    baseDirOffsetX: number;
    baseDirOffsetY: number;
  } | null>(null);
  const lastPreviewedOrientRef = useRef<number|null>(null);
  const originalOrientRef = useRef<number|null>(null);
  const pivotOffsetRef = useRef<{x:number,y:number}|null>(null);
  const dirOffsetRef = useRef<{x:number,y:number}|null>(null);
  const dragRef = useRef<
    | { kind: 'sheet'; pointerX: number; pointerY: number; offset: Point2; handle: string }
    | { kind: 'crop-corner'; handle: string; cornerIndex: number }
    | { kind: 'crop-midpoint'; handle: string; vertexIndex: number }
    | { kind: 'pan'; pointerX: number; pointerY: number; pan: Point2 }
    | null
  >(null);
  const sheetCanvasRefs = useRef(new Map<string, PdfSheetCanvasHandle>());
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;
  const selected = sheets.find((sheet) => sheet.handle === selectedHandle) ?? null;

  useEffect(() => {
    if (selectedHandle === null) return;
    if (sheets.some((sheet) => sheet.handle === selectedHandle)) return;
    setSelectedHandle(null);
  }, [selectedHandle, sheets]);

  useEffect(() => {
    setCropMode(false);
    setRotateMode('idle');
    setGhostDirScreen(null);
    rotateDragRef.current = null;
    lastPreviewedOrientRef.current = null;
    pivotOffsetRef.current = null;
    dirOffsetRef.current = null;
  }, [selectedHandle]);

  const scaleFactorForSheet = (sheet: PdfSheetEntry): number => {
    const ppf = pixelsPerFootForSheet(sheet);
    return DEFAULT_PIXELS_PER_FOOT / ppf;
  };

  const minZoomRef = useRef(0.001);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const vw = rect.width || 1;
    const vh = rect.height || 1;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const sheet of sheets) {
      const sf = scaleFactorForSheet(sheet);
      const w = sheet.widthPx150 * sf;
      const h = sheet.heightPx150 * sf;
      const cx = sheet.flatOffsetPx.x * sf;
      const cy = sheet.flatOffsetPx.y * sf;
      minX = Math.min(minX, cx - w / 2);
      maxX = Math.max(maxX, cx + w / 2);
      minY = Math.min(minY, cy - h / 2);
      maxY = Math.max(maxY, cy + h / 2);
    }
    const bbW = Math.max(1, maxX - minX);
    const bbH = Math.max(1, maxY - minY);
    const fitZoom = Math.min(vw / bbW, vh / bbH) * 0.9;
    minZoomRef.current = Math.max(fitZoom * 0.25, 0.001);
    setZoom(fitZoom);
    setPan({ x: vw / 2 - (minX + bbW / 2) * fitZoom, y: vh / 2 + (minY + bbH / 2) * fitZoom });
  }, []);

  // Draw rotate-mode overlay on the overlay canvas (sheet-local px)
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    canvas.width = parent.clientWidth;
    canvas.height = parent.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (rotateMode === 'idle' || !pivotOffsetRef.current) return;
    const sfOv = selected ? scaleFactorForSheet(selected) : 1;
    const px = pivotOffsetRef.current.x;
    const py = pivotOffsetRef.current.y;
    ctx.beginPath();
    ctx.arc(px, py, 5 / sfOv, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6600';
    ctx.fill();
    if (!dirOffsetRef.current) {
      if (ghostDirScreen && sceneRef.current && selected) {
        const rect = sceneRef.current.getBoundingClientRect();
        const p = panRef.current;
        const z = zoomRef.current;
        const sx = (ghostDirScreen.x - rect.left - p.x) / z;
        const sy = -(ghostDirScreen.y - rect.top - p.y) / z;
        const gp = sceneToSheetPoint(selected, { x: sx, y: sy });
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(gp.x, gp.y);
        ctx.strokeStyle = 'rgba(255, 102, 0, 0.45)';
        ctx.lineWidth = 2 / z / sfOv;
        ctx.setLineDash([6, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      return;
    }
    const dx2 = dirOffsetRef.current.x;
    const dy2 = dirOffsetRef.current.y;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(dx2, dy2);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2 / zoom / sfOv;
    ctx.setLineDash([6, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(dx2, dy2, 5 / sfOv, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6600';
    ctx.fill();
    return () => {
      const c = overlayCanvasRef.current;
      if (!c) return;
      const cx = c.getContext('2d');
      if (cx) cx.clearRect(0, 0, c.width, c.height);
    };
  }, [rotateMode, ghostDirScreen, zoom, liveOrientDeg]);

  const screenToScene = (clientX: number, clientY: number): Point2 => {
    const rect = sceneRef.current?.getBoundingClientRect();
    const x = clientX - (rect?.left ?? 0);
    const y = clientY - (rect?.top ?? 0);
    return { x: (x - pan.x) / zoom, y: -(y - pan.y) / zoom };
  };

  const sceneToSheetPoint = (sheet: PdfSheetEntry, scenePoint: Point2): Point2 => {
    const sf = scaleFactorForSheet(sheet);
    const a = (sheet.orientation ?? 0) * Math.PI / 180;
    const sx = scenePoint.x / sf;
    const sy = scenePoint.y / sf;
    const dx = sx - sheet.flatOffsetPx.x;
    const dy = sy - sheet.flatOffsetPx.y;
    return {
      x: dx * Math.cos(a) - dy * Math.sin(a) + sheet.widthPx150 / 2,
      y: -dx * Math.sin(a) - dy * Math.cos(a) + sheet.heightPx150 / 2,
    };
  };

  const clientToSheetPoint = (sheet: PdfSheetEntry, clientX: number, clientY: number): Point2 =>
    sceneToSheetPoint(sheet, screenToScene(clientX, clientY));

  const sheetPointToScene = (sheet: PdfSheetEntry, sp: Point2): Point2 => {
    const sf = scaleFactorForSheet(sheet);
    const a = (sheet.orientation ?? 0) * Math.PI / 180;
    const A = sp.x - sheet.widthPx150 / 2;
    const B = sp.y - sheet.heightPx150 / 2;
    return {
      x: (A * Math.cos(a) - B * Math.sin(a) + sheet.flatOffsetPx.x) * sf,
      y: (-A * Math.sin(a) - B * Math.cos(a) + sheet.flatOffsetPx.y) * sf,
    };
  };

  const sheetPointToScreen = (sheet: PdfSheetEntry, sp: Point2): Point2 => {
    const scene = sheetPointToScene(sheet, sp);
    const rect = sceneRef.current?.getBoundingClientRect();
    const p = panRef.current;
    const z = zoomRef.current;
    return {
      x: (rect?.left ?? 0) + p.x + scene.x * z,
      y: (rect?.top ?? 0) + p.y - scene.y * z,
    };
  };

  const hitSheet = (clientX: number, clientY: number): PdfSheetEntry | null => {
    const p = screenToScene(clientX, clientY);
    for (let i = sheets.length - 1; i >= 0; i--) {
      const sheet = sheets[i]!;
      const sf = scaleFactorForSheet(sheet);
      const a = (sheet.orientation ?? 0) * Math.PI / 180;
      const sx = p.x / sf;
      const sy = p.y / sf;
      const dx = sx - sheet.flatOffsetPx.x;
      const dy = sy - sheet.flatOffsetPx.y;
      const localX = dx * Math.cos(a) - dy * Math.sin(a);
      const localY = -dx * Math.sin(a) - dy * Math.cos(a);
      if (Math.abs(localX) <= sheet.widthPx150 / 2 && Math.abs(localY) <= sheet.heightPx150 / 2) {
        if (sheet.borderCrop) {
          const sheetX = localX + sheet.widthPx150 / 2;
          const sheetY = localY + sheet.heightPx150 / 2;
          const crop = effectiveCrop(sheet.borderCrop, sheet);
          if (crop.kind === 'rect') {
            if (
              sheetX < crop.x
              || sheetX > crop.x + crop.width
              || sheetY < crop.y
              || sheetY > crop.y + crop.height
            ) continue;
          } else if (!pointInPolygon({ x: sheetX, y: sheetY }, crop.points.map(([x, y]) => ({ x, y })))) {
            continue;
          }
        }
        return sheet;
      }
    }
    return null;
  };

  const hitSelectedCropHandle = (clientX: number, clientY: number):
    | { kind: 'corner'; cornerIndex: number }
    | { kind: 'midpoint'; insertIndex: number; point: Point2 }
    | null => {
    if (!selected) return null;
    const localPoint = clientToSheetPoint(selected, clientX, clientY);
    const crop = effectiveCrop(selected.borderCrop, selected);
    const corners = cropPoints(crop);
    for (let i = 0; i < corners.length; i++) {
      if (distance(localPoint, corners[i]!) <= CROP_HIT_RADIUS) return { kind: 'corner', cornerIndex: i };
    }
    const midpoints = cropMidpoints(crop);
    for (const midpoint of midpoints) {
      if (distance(localPoint, midpoint) <= CROP_HIT_RADIUS) {
        return { kind: 'midpoint', insertIndex: midpoint.insertIndex, point: { x: midpoint.x, y: midpoint.y } };
      }
    }
    return null;
  };

  const sheetsRef = useRef(sheets);
  sheetsRef.current = sheets;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = sceneRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const vw = rect.width;
        const vh = rect.height;
        const p = panRef.current;
        const z = zoomRef.current;
        for (const sheet of sheetsRef.current) {
          const handle = sheetCanvasRefs.current.get(sheet.handle);
          if (!handle) continue;
          const sheetPan: Point2 = { x: p.x + sheet.flatOffsetPx.x * scaleFactorForSheet(sheet) * z, y: p.y - sheet.flatOffsetPx.y * scaleFactorForSheet(sheet) * z };
          const visWindows = computeVisibleTileWindows(
            sheetPan,
            z,
            vw,
            vh,
            sheet.widthPx150,
            sheet.heightPx150,
          );
          handle.requestVisibleTiles(visWindows);
        }
      }
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const el = sceneRef.current;
    if (!el) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;
      const before = {
        x: (ev.clientX - rect.left - currentPan.x) / currentZoom,
        y: (ev.clientY - rect.top - currentPan.y) / currentZoom,
      };
      const nextZoom = Math.max(minZoomRef.current, Math.min(2.5, currentZoom * (ev.deltaY < 0 ? 1.12 : 0.88)));
      setZoom(nextZoom);
      setPan({
        x: ev.clientX - rect.left - before.x * nextZoom,
        y: ev.clientY - rect.top - before.y * nextZoom,
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setSelectedHandle(null);
    };
    window.addEventListener('keydown', onKeyDown, { capture: false });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: false });
  }, []);

  const selectedToolbarAnchor = useMemo(() => {
    if (!selected) return null;
    const rect = sceneRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const sf = scaleFactorForSheet(selected);
    const rawX = pan.x + selected.flatOffsetPx.x * sf * zoom;
    const rawY = pan.y - (selected.flatOffsetPx.y * sf + selected.heightPx150 / 2) * zoom - 12;
    return {
      x: Math.max(8, Math.min(rect.width - 8, rawX)),
      y: Math.max(8, rawY),
    };
  }, [pan.x, pan.y, selected, zoom]);

  return (
    <div
      ref={sceneRef}
      className={styles.pdfScene}
      onPointerDown={(ev) => {
        // PIVOT placement
        if (rotateMode === 'pivot' && ev.button === 0 && !ev.shiftKey && selected) {
          setRotateMode('direction');
          pivotOffsetRef.current = clientToSheetPoint(selected, ev.clientX, ev.clientY);
          return;
        }
        // DIRECTION placement
        if (rotateMode === 'direction' && ev.button === 0 && !ev.shiftKey && pivotOffsetRef.current && selected) {
          setGhostDirScreen(null);
          setRotateMode('placed');
          dirOffsetRef.current = clientToSheetPoint(selected, ev.clientX, ev.clientY);
          return;
        }
        // PLACED -- hit test line, start drag or ignore
        if (rotateMode === 'placed' && ev.button === 0 && !ev.shiftKey && pivotOffsetRef.current && dirOffsetRef.current && selected) {
          const pivotScr = sheetPointToScreen(selected, pivotOffsetRef.current);
          const useOrient = liveOrientDeg !== null ? liveOrientDeg : (selected.orientation ?? 0);
          const a = useOrient * Math.PI / 180;
          const du = (dirOffsetRef.current.x - pivotOffsetRef.current.x) * Math.cos(a) - (dirOffsetRef.current.y - pivotOffsetRef.current.y) * Math.sin(a);
          const dv = (dirOffsetRef.current.x - pivotOffsetRef.current.x) * Math.sin(a) + (dirOffsetRef.current.y - pivotOffsetRef.current.y) * Math.cos(a);
          const rsfHit = scaleFactorForSheet(selected);
          const dirScr = {
            x: pivotScr.x + du * rsfHit * zoomRef.current,
            y: pivotScr.y + dv * rsfHit * zoomRef.current,
          };
          if (ptSegDist({ x: ev.clientX, y: ev.clientY }, pivotScr, dirScr) < 10) {
            rotateDragRef.current = {
              baselineOrientation: liveOrientDeg ?? selected.orientation ?? 0,
              handle: selected.handle,
              pivotOffsetX: pivotOffsetRef.current.x,
              pivotOffsetY: pivotOffsetRef.current.y,
              baseDirOffsetX: dirOffsetRef.current.x,
              baseDirOffsetY: dirOffsetRef.current.y,
            };
            ev.currentTarget.setPointerCapture(ev.pointerId);
          }
          return;
        }

        const shouldPan = (ev.button === 2 || (ev.button === 0 && ev.shiftKey));
        if (shouldPan) {
          dragRef.current = { kind: 'pan', pointerX: ev.clientX, pointerY: ev.clientY, pan };
          ev.currentTarget.setPointerCapture(ev.pointerId);
          ev.preventDefault();
          return;
        }
        if (cropMode && selected) {
          const cropHandle = hitSelectedCropHandle(ev.clientX, ev.clientY);
          if (cropHandle) {
            if (cropHandle.kind === 'corner') {
              dragRef.current = { kind: 'crop-corner', handle: selected.handle, cornerIndex: cropHandle.cornerIndex };
            } else {
              const inserted = insertCropVertex(selected.borderCrop, cropHandle.insertIndex, cropHandle.point, selected);
              setPdfBorderCrop(selected.handle, inserted.crop);
              dragRef.current = { kind: 'crop-midpoint', handle: selected.handle, vertexIndex: inserted.vertexIndex };
            }
            ev.currentTarget.setPointerCapture(ev.pointerId);
            return;
          }
        }
        const sheet = hitSheet(ev.clientX, ev.clientY);
        if (!sheet) {
          if (rotateMode === 'idle') setSelectedHandle(null);
          return;
        }
        if (rotateMode !== 'idle' || cropMode) return;
        setSelectedHandle(sheet.handle);
        dragRef.current = { kind: 'sheet', pointerX: ev.clientX, pointerY: ev.clientY, offset: sheet.flatOffsetPx, handle: sheet.handle };
        ev.currentTarget.setPointerCapture(ev.pointerId);
      }}
      onPointerMove={(ev) => {
        if (rotateMode === 'direction' && pivotOffsetRef.current) {
          setGhostDirScreen({ x: ev.clientX, y: ev.clientY });
        }
        if (rotateDragRef.current) {
          const state = rotateDragRef.current;
          if (!selected) return;
          const pivotScr = sheetPointToScreen(selected, { x: state.pivotOffsetX, y: state.pivotOffsetY });
          const currentAngleRad = Math.atan2(ev.clientY - pivotScr.y, ev.clientX - pivotScr.x);
          const phi = Math.atan2(state.baseDirOffsetY - state.pivotOffsetY, state.baseDirOffsetX - state.pivotOffsetX);
          const newOrientation = ((currentAngleRad - phi) * 180 / Math.PI % 360 + 360) % 360;
          lastPreviewedOrientRef.current = newOrientation;
          setLiveOrientDeg(newOrientation);
          const rsfDrag = scaleFactorForSheet(selected);
          const pivotScenePx = sheetPointToScene(selected, { x: state.pivotOffsetX, y: state.pivotOffsetY });
          engineHolder.current?.previewPdfOrientation(state.handle, newOrientation, { x: pivotScenePx.x / rsfDrag, y: pivotScenePx.y / rsfDrag }, state.baselineOrientation, selected.flatOffsetPx);
          const a = newOrientation * Math.PI / 180;
          const dx = (ev.clientX - pivotScr.x) / zoomRef.current / rsfDrag;
          const dy = (ev.clientY - pivotScr.y) / zoomRef.current / rsfDrag;
          dirOffsetRef.current = {
            x: state.pivotOffsetX + dx * Math.cos(a) + dy * Math.sin(a),
            y: state.pivotOffsetY - dx * Math.sin(a) + dy * Math.cos(a),
          };
          return;
        }

        const drag = dragRef.current;
        if (!drag) return;

        if (drag.kind === 'pan') {
          setPan({
            x: drag.pan.x + ev.clientX - drag.pointerX,
            y: drag.pan.y + ev.clientY - drag.pointerY,
          });
          return;
        }
        if (drag.kind === 'crop-corner' || drag.kind === 'crop-midpoint') {
          const sheet = sheetsRef.current.find((entry) => entry.handle === drag.handle);
          if (!sheet) return;
          const localPoint = clampSheetPoint(clientToSheetPoint(sheet, ev.clientX, ev.clientY), sheet);
          const vertexIndex = drag.kind === 'crop-corner' ? drag.cornerIndex : drag.vertexIndex;
          setPdfBorderCrop(sheet.handle, moveCropVertex(sheet.borderCrop, vertexIndex, localPoint, sheet));
          return;
        }
        const sheet2 = sheetsRef.current.find((entry) => entry.handle === drag.handle);
        const dsf = sheet2 ? scaleFactorForSheet(sheet2) : 1;
        setPdfFlatOffset(drag.handle, {
          x: drag.offset.x + (ev.clientX - drag.pointerX) / zoom / dsf,
          y: drag.offset.y - (ev.clientY - drag.pointerY) / zoom / dsf,
        });
      }}
      onPointerUp={(ev) => {
        if (rotateDragRef.current) {
          rotateDragRef.current = null;
          if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
          // do NOT commit, do NOT exit -- user can drag again
          return;
        }
        dragRef.current = null;
        if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
      }}
      onPointerCancel={(ev) => {
        dragRef.current = null;
        if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
      }}
      onContextMenu={(ev) => ev.preventDefault()}
    >
      <div className={styles.pdfSceneContent} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
        {sheets.map((sheet) => (
          <div
            key={sheet.handle}
            className={`${styles.pdfSheetLayer} ${sheet.handle === selected?.handle ? styles.pdfSheetLayerSelected : ''} ${sheet.borderCrop ? styles.pdfSheetLayerCropped : ''}`}
            style={{
              width: sheet.widthPx150,
              height: sheet.heightPx150,
              cursor: selected?.handle === sheet.handle && cropMode
                ? 'crosshair'
                : selected?.handle === sheet.handle && rotateMode !== 'idle'
                  ? 'crosshair'
                  : sheet.borderCrop ? 'default' : 'move',
              transformOrigin: rotateMode === 'placed' && selected?.handle === sheet.handle && pivotOffsetRef.current
                ? `${pivotOffsetRef.current.x}px ${pivotOffsetRef.current.y}px`
                : undefined,
              transform: (() => {
                const liveOrient = liveOrientDeg !== null && selected?.handle === sheet.handle ? liveOrientDeg : (sheet.orientation ?? 0);
                const usePivot = rotateMode === 'placed' && selected?.handle === sheet.handle && pivotOffsetRef.current;
                let tx: number;
                let ty: number;
                if (usePivot && pivotOffsetRef.current) {
                  const px = pivotOffsetRef.current.x;
                  const py = pivotOffsetRef.current.y;
                  const a0 = (sheet.orientation ?? 0) * Math.PI / 180;
                  const sfP = scaleFactorForSheet(sheet);
                  const A = px - sheet.widthPx150 / 2;
                  const B = py - sheet.heightPx150 / 2;
                  tx = (A * Math.cos(a0) - B * Math.sin(a0) + sheet.flatOffsetPx.x) * sfP - px;
                  ty = (A * Math.sin(a0) + B * Math.cos(a0) - sheet.flatOffsetPx.y) * sfP - py;
                } else {
                  tx = sheet.flatOffsetPx.x * scaleFactorForSheet(sheet) - sheet.widthPx150 / 2;
                  ty = -sheet.flatOffsetPx.y * scaleFactorForSheet(sheet) - sheet.heightPx150 / 2;
                }
                const sf2 = scaleFactorForSheet(sheet);
                return `translate(${tx}px, ${ty}px) rotate(${liveOrient}deg) scale(${sf2}, ${sf2})`;
              })(),
            }}
          >
            <PdfSheetCanvas
              ref={(handle) => {
                if (handle) sheetCanvasRefs.current.set(sheet.handle, handle);
                else sheetCanvasRefs.current.delete(sheet.handle);
              }}
              sheet={sheet}
              cropActive={cropMode && sheet.handle === selected?.handle}
            />
            <PdfCropOverlayCanvas sheet={sheet} active={sheet.handle === selected?.handle && cropMode} />
            {rotateMode !== 'idle' && selected?.handle === sheet.handle && (
              <canvas
                ref={overlayCanvasRef}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  pointerEvents: 'none',
                  zIndex: 10,
                }}
              />
            )}
          </div>
        ))}
      </div>
      {selected && selectedToolbarAnchor ? (
        <div
          className={styles.pdfSheetToolbar}
          style={{ left: selectedToolbarAnchor.x, top: selectedToolbarAnchor.y }}
          onPointerDown={(e) => { if (rotateMode === 'idle') e.stopPropagation(); }}
        >
          <span className={styles.listRowMeta}>{selected.label}</span>
          {rotateMode === 'idle' ? (
            <button
              type="button"
              className={styles.canvasToolBtn}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                originalOrientRef.current = selected?.orientation ?? 0;
                lastPreviewedOrientRef.current = null;
                setCropMode(false);
                setRotateMode('pivot');
              }}
            >
              Rotate
            </button>
          ) : (
            <>
              <button
                type="button"
                className={styles.canvasToolBtn}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (selected && lastPreviewedOrientRef.current !== null) {
                    const newOrient = lastPreviewedOrientRef.current;
                    const oldOrient = originalOrientRef.current ?? 0;
                    if (pivotOffsetRef.current && newOrient !== oldOrient) {
                      const rsf = scaleFactorForSheet(selected);
                      const ppScene = sheetPointToScene(selected, pivotOffsetRef.current);
                      const fpx = selected.flatOffsetPx;
                      const deltaRad = (oldOrient - newOrient) * Math.PI / 180;
                      const dx = ppScene.x - fpx.x * rsf;
                      const dy = ppScene.y - fpx.y * rsf;
                      const cosD = Math.cos(deltaRad);
                      const sinD = Math.sin(deltaRad);
                      const newRawX = (ppScene.x - (cosD * dx - sinD * dy)) / rsf;
                      const newRawY = (ppScene.y - (sinD * dx + cosD * dy)) / rsf;
                      setPdfFlatOffset(selected.handle, { x: newRawX, y: newRawY });
                    }
                    setPdfOrientation(selected.handle, newOrient);
                  }
                  setRotateMode('idle');
                  setGhostDirScreen(null);
                  rotateDragRef.current = null;
                  lastPreviewedOrientRef.current = null;
                  pivotOffsetRef.current = null;
                  dirOffsetRef.current = null;
                  setLiveOrientDeg(null);
                }}
              >
                Done
              </button>
              <button
                type="button"
                className={styles.canvasToolBtn}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  if (selected && originalOrientRef.current !== null) {
                    setPdfOrientation(selected.handle, originalOrientRef.current);
                    engineHolder.current?.previewPdfOrientation(selected.handle, originalOrientRef.current);
                  }
                  setRotateMode('idle');
                  setGhostDirScreen(null);
                  rotateDragRef.current = null;
                  lastPreviewedOrientRef.current = null;
                  pivotOffsetRef.current = null;
                  dirOffsetRef.current = null;
                  setLiveOrientDeg(null);
                }}
              >
                Cancel
              </button>
            </>
          )}
          <button
            type="button"
            className={`${styles.canvasToolBtn} ${cropMode ? styles.canvasToolBtnActive : ''}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => {
              setRotateMode('idle');
              rotateDragRef.current = null;
              lastPreviewedOrientRef.current = null;
              pivotOffsetRef.current = null;
              dirOffsetRef.current = null;
              setCropMode((value) => !value);
            }}
          >
            Crop
          </button>
          <button type="button" className={styles.canvasToolBtn} onPointerDown={(e) => e.stopPropagation()} onClick={() => setPdfBorderCrop(selected.handle, null)}>
            Clear Crop
          </button>
          <button
            type="button"
            className={`${styles.canvasToolBtn} ${selected.whiteThreshold === 0 ? '' : styles.canvasToolBtnActive}`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setWhiteThreshold(
              selected.handle,
              selected.whiteThreshold === 0 ? 240 : 0,
            )}
          >
            Transparency
          </button>
        </div>
      ) : null}
      <div className={styles.pdfSceneToolbar}>
        <div className={styles.pdfSceneTitle}>
          <strong>{label}</strong>
          <span>{selected ? 'drag sheets to move them' : 'click a sheet to select'}</span>
        </div>
        <button type="button" className={styles.canvasToolBtn} onClick={returnToWorldScene}>
          Return to 3D
        </button>
      </div>
    </div>
  );
}

// ── Orient-scene local state for the north arrow markup ──────────────────────
// The north arrow lives in sheet-pixel space. We track a local draft (x, y, angleDeg,
// color) while the user is interacting; on Set it is committed to the store.
// angleDeg: 0 = arrow pointing up (north), clockwise positive.

interface NorthArrowDraft {
  x: number;
  y: number;
  angleDeg: number;
  color: string;
}

function defaultNorthArrow(sheet: PdfSheetEntry): NorthArrowDraft {
  return sheet.northArrow
    ? { x: sheet.northArrow.x, y: sheet.northArrow.y, angleDeg: sheet.northArrow.angleDeg, color: sheet.northArrow.color }
    : { x: sheet.widthPx150 / 2, y: sheet.heightPx150 / 2, angleDeg: 0, color: '#e84f8a' };
}

function SingleSheetScene({ sheet, kind }: { sheet: PdfSheetEntry; kind: 'calibrate' | 'orient' }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { tilesRef, status, loadingState, requestVisibleTiles } = usePdfTileCache(sheet);
  const requestVisibleTilesRef = useRef(requestVisibleTiles);
  useEffect(() => { requestVisibleTilesRef.current = requestVisibleTiles; }, [requestVisibleTiles]);

  const [toolMode, setToolMode] = useState<ToolMode>(kind === 'orient' ? 'north' : 'scale-bar');
  const [zoom, setZoom] = useState(0.18);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState(status);

  // North arrow draft — initialized from sheet.northArrow or sheet center
  const [northDraft, setNorthDraft] = useState<NorthArrowDraft>(() => defaultNorthArrow(sheet));

  // ── Calibrate state ──
  // Scale bar: center in sheet-px (placed at sheet center initially), ft input, committed flag
  const defaultSbCenter = (): Point2 => ({ x: sheet.widthPx150 / 2, y: sheet.heightPx150 / 2 });
  const [sbCenter, setSbCenter] = useState<Point2>(() => sheet.scaleBar ? { x: sheet.scaleBar.x, y: sheet.scaleBar.y } : defaultSbCenter());
  const [sbFtInput, setSbFtInput] = useState<string>(sheet.scaleBar?.realWorldFt != null ? String(sheet.scaleBar.realWorldFt) : '');
  const sbDragRef = useRef<{ startPage: Point2; startCenter: Point2 } | null>(null);

  // Known distance: begin / end in sheet-px, ft input, phase
  const [kdPhase, setKdPhase] = useState<'idle' | 'placed-begin' | 'placed-end'>(
    sheet.knownDistance ? 'placed-end' : 'idle',
  );
  const [kdBegin, setKdBegin] = useState<Point2 | null>(sheet.knownDistance ? sheet.knownDistance.begin : null);
  const [kdEnd, setKdEnd] = useState<Point2 | null>(sheet.knownDistance ? sheet.knownDistance.end : null);
  const [kdFtInput, setKdFtInput] = useState<string>(sheet.knownDistance?.realWorldFt != null ? String(sheet.knownDistance.realWorldFt) : '');
  // Hover pos for the "begin" crosshair before first click
  const [kdHover, setKdHover] = useState<Point2 | null>(null);

  // Dropdown scale: null = unset, number = feet per inch
  const SCALE_OPTIONS: { label: string; feetPerInch: number }[] = [
    { label: '1in=10ft', feetPerInch: 10 },
    { label: '1in=20ft', feetPerInch: 20 },
    { label: '1in=40ft', feetPerInch: 40 },
    { label: '1in=50ft', feetPerInch: 50 },
    { label: '1in=100ft', feetPerInch: 100 },
  ];
  const getScaleFromCalibration = (): number | null => {
    const cal = sheet.calibration;
    if (!cal || cal.method !== 'scale-value') return null;
    // pixelsPerUnit = 150/fpi => fpi = 150/ppf
    const fpi = 150 / cal.pixelsPerUnit;
    return SCALE_OPTIONS.find((o) => Math.abs(o.feetPerInch - fpi) < 0.5)?.feetPerInch ?? null;
  };

  // Re-sync draft + reset viewport when sheet changes
  const prevHandleRef = useRef(sheet.handle);
  useEffect(() => {
    if (prevHandleRef.current !== sheet.handle) {
      prevHandleRef.current = sheet.handle;
      setNorthDraft(defaultNorthArrow(sheet));
      setSbCenter(sheet.scaleBar ? { x: sheet.scaleBar.x, y: sheet.scaleBar.y } : { x: sheet.widthPx150 / 2, y: sheet.heightPx150 / 2 });
      setSbFtInput(sheet.scaleBar?.realWorldFt != null ? String(sheet.scaleBar.realWorldFt) : '');
      setKdPhase(sheet.knownDistance ? 'placed-end' : 'idle');
      setKdBegin(sheet.knownDistance ? sheet.knownDistance.begin : null);
      setKdEnd(sheet.knownDistance ? sheet.knownDistance.end : null);
      setKdFtInput(sheet.knownDistance?.realWorldFt != null ? String(sheet.knownDistance.realWorldFt) : '');
      // Reset pan/zoom so tile windows are computed correctly for the new sheet dimensions
      setZoom(0.18);
      setPan({ x: 0, y: 0 });
    }
  }, [sheet]);

  // North arrow drag state
  const northDragRef = useRef<{ kind: NorthDragKind; startAngle: number } | null>(null);
  const northDraftRef = useRef(northDraft);
  northDraftRef.current = northDraft;

  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;

  // Keep current calibrate refs accessible in RAF without stale closures
  const sbCenterRef = useRef(sbCenter);
  sbCenterRef.current = sbCenter;
  const kdPhaseRef = useRef(kdPhase);
  kdPhaseRef.current = kdPhase;
  const kdBeginRef = useRef(kdBegin);
  kdBeginRef.current = kdBegin;
  const kdEndRef = useRef(kdEnd);
  kdEndRef.current = kdEnd;
  const kdHoverRef = useRef(kdHover);
  kdHoverRef.current = kdHover;

  useEffect(() => setMessage(status), [status]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
      canvas.height = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
      setPan((prev) => (
        prev.x === 0 && prev.y === 0
          ? { x: canvas.width / window.devicePixelRatio / 2, y: canvas.height / window.devicePixelRatio / 2 }
          : prev
      ));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const pageToScreen = useCallback((p: Point2): Point2 => ({
    x: pan.x + (p.x - sheet.widthPx150 / 2) * zoom,
    y: pan.y + (p.y - sheet.heightPx150 / 2) * zoom,
  }), [pan.x, pan.y, sheet.heightPx150, sheet.widthPx150, zoom]);

  const screenToPage = useCallback((x: number, y: number): Point2 => ({
    x: (x - pan.x) / zoom + sheet.widthPx150 / 2,
    y: (y - pan.y) / zoom + sheet.heightPx150 / 2,
  }), [pan.x, pan.y, sheet.heightPx150, sheet.widthPx150, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const currentPan = panRef.current;
      const currentZoom = zoomRef.current;
      const before = {
        x: (ev.clientX - rect.left - currentPan.x) / currentZoom + sheet.widthPx150 / 2,
        y: (ev.clientY - rect.top - currentPan.y) / currentZoom + sheet.heightPx150 / 2,
      };
      const nextZoom = Math.max(0.03, Math.min(2.5, currentZoom * (ev.deltaY < 0 ? 1.12 : 0.88)));
      setZoom(nextZoom);
      setPan({
        x: ev.clientX - rect.left - (before.x - sheet.widthPx150 / 2) * nextZoom,
        y: ev.clientY - rect.top - (before.y - sheet.heightPx150 / 2) * nextZoom,
      });
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [sheet.heightPx150, sheet.widthPx150]);

  const loadingStateRef = useRef(loadingState);
  loadingStateRef.current = loadingState;
  const statusRef = useRef(status);
  statusRef.current = status;

  // Compute screen-space north arrow positions for hit testing and drawing
  const northCenterScreen = useCallback(
    () => pageToScreen({ x: northDraftRef.current.x, y: northDraftRef.current.y }),
    [pageToScreen],
  );
  const northTipScreen = useCallback(() => {
    const d = northDraftRef.current;
    const tip = northTipInPage({ x: d.x, y: d.y }, d.angleDeg);
    return pageToScreen(tip);
  }, [pageToScreen]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio;
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#111417';
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);
        ctx.translate(-sheet.widthPx150 / 2, -sheet.heightPx150 / 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, sheet.widthPx150, sheet.heightPx150);
        for (const tile of tilesRef.current.values()) {
          ctx.drawImage(tile.canvas, tile.x, tile.y, tile.width, tile.height);
        }
        if (loadingStateRef.current !== 'ready') {
          drawLoadingOverlay(ctx, 0, 0, sheet.widthPx150, sheet.heightPx150, statusRef.current);
        }
        ctx.restore();

        // Draw calibration markup (calibrate mode)
        if (kind === 'calibrate') {
          if (toolMode === 'scale-bar') {
            // Scale bar: 150px centered on sbCenterRef
            const sc = sbCenterRef.current;
            const sc0 = pageToScreen({ x: sc.x - SCALE_BAR_LEN_PX / 2, y: sc.y });
            const sc1 = pageToScreen({ x: sc.x + SCALE_BAR_LEN_PX / 2, y: sc.y });
            const scC = pageToScreen(sc);
            const headLen = 10;
            ctx.save();
            ctx.strokeStyle = '#53c7c0';
            ctx.fillStyle = '#53c7c0';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(sc0.x, sc0.y);
            ctx.lineTo(sc1.x, sc1.y);
            ctx.stroke();
            // left arrowhead
            ctx.beginPath();
            ctx.moveTo(sc0.x, sc0.y);
            ctx.lineTo(sc0.x + headLen, sc0.y - 5);
            ctx.lineTo(sc0.x + headLen, sc0.y + 5);
            ctx.closePath();
            ctx.fill();
            // right arrowhead
            ctx.beginPath();
            ctx.moveTo(sc1.x, sc1.y);
            ctx.lineTo(sc1.x - headLen, sc1.y - 5);
            ctx.lineTo(sc1.x - headLen, sc1.y + 5);
            ctx.closePath();
            ctx.fill();
            // blurb below center — only draw if no blurb DOM element (handled by overlay)
            ctx.font = '12px sans-serif';
            ctx.fillStyle = '#53c7c0';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText('drag to move', scC.x, scC.y + 8);
            ctx.restore();
          }

          if (toolMode === 'known-distance') {
            const phase = kdPhaseRef.current;
            const begin = kdBeginRef.current;
            const end = kdEndRef.current;
            const hover = kdHoverRef.current;
            ctx.save();
            ctx.strokeStyle = '#f5a623';
            ctx.fillStyle = '#f5a623';
            ctx.lineWidth = 2;
            const headLen = 10;
            const headW = 5;
            if (phase === 'idle' && hover) {
              // crosshair preview
              const hs = pageToScreen(hover);
              ctx.beginPath();
              ctx.arc(hs.x, hs.y, 6, 0, Math.PI * 2);
              ctx.stroke();
              ctx.beginPath();
              ctx.moveTo(hs.x - 10, hs.y); ctx.lineTo(hs.x + 10, hs.y);
              ctx.moveTo(hs.x, hs.y - 10); ctx.lineTo(hs.x, hs.y + 10);
              ctx.stroke();
            }
            if (begin) {
              const bs = pageToScreen(begin);
              ctx.beginPath();
              ctx.arc(bs.x, bs.y, 5, 0, Math.PI * 2);
              ctx.fill();
              if (phase === 'placed-begin' && hover) {
                // rubber band line to hover
                const hs = pageToScreen(hover);
                ctx.beginPath();
                ctx.moveTo(bs.x, bs.y);
                ctx.lineTo(hs.x, hs.y);
                ctx.stroke();
              }
            }
            if (begin && end) {
              const bs = pageToScreen(begin);
              const es = pageToScreen(end);
              const dx = es.x - bs.x;
              const dy = es.y - bs.y;
              const len = Math.hypot(dx, dy);
              if (len > 2) {
                const ux = dx / len;
                const uy = dy / len;
                ctx.beginPath();
                ctx.moveTo(bs.x, bs.y);
                ctx.lineTo(es.x, es.y);
                ctx.stroke();
                // begin arrow
                ctx.beginPath();
                ctx.moveTo(bs.x, bs.y);
                ctx.lineTo(bs.x + ux * headLen - uy * headW, bs.y + uy * headLen + ux * headW);
                ctx.lineTo(bs.x + ux * headLen + uy * headW, bs.y + uy * headLen - ux * headW);
                ctx.closePath();
                ctx.fill();
                // end arrow
                ctx.beginPath();
                ctx.moveTo(es.x, es.y);
                ctx.lineTo(es.x - ux * headLen - uy * headW, es.y - uy * headLen + ux * headW);
                ctx.lineTo(es.x - ux * headLen + uy * headW, es.y - uy * headLen - ux * headW);
                ctx.closePath();
                ctx.fill();
              }
            }
            ctx.restore();
          }
        }

        // Draw north arrow markup (orient mode)
        if (kind === 'orient') {
          const d = northDraftRef.current;
          const centerSc = pageToScreen({ x: d.x, y: d.y });
          const tipPage = northTipInPage({ x: d.x, y: d.y }, d.angleDeg);
          const tipSc = pageToScreen(tipPage);
          const radiusSc = NORTH_ARROW_RADIUS * zoom;
          ctx.save();
          drawNorthArrow(ctx, centerSc, tipSc, d.color, radiusSc);
          ctx.restore();

          // Blurb next to tip — intentionally outside clip so it is always readable
          const blurbX = tipSc.x + 14;
          const blurbY = tipSc.y - 10;
          ctx.save();
          ctx.fillStyle = 'rgba(17,20,23,0.82)';
          ctx.beginPath();
          ctx.roundRect(blurbX - 4, blurbY - 14, 120, 22, 4);
          ctx.fill();
          ctx.fillStyle = '#e8e2d0';
          ctx.font = '12px sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(`${d.angleDeg.toFixed(1)} deg from N`, blurbX, blurbY - 10);
          ctx.restore();
        }

        const visWindows = computeVisibleTileWindows(
          pan,
          zoom,
          w,
          h,
          sheet.widthPx150,
          sheet.heightPx150,
        );
        requestVisibleTilesRef.current(visWindows);
      }
      raf = window.requestAnimationFrame(draw);
    };
    draw();
    return () => window.cancelAnimationFrame(raf);
  }, [kind, pageToScreen, pan, sheet.heightPx150, sheet.widthPx150, tilesRef, toolMode, zoom]);

  function commitScaleBar(): void {
    const ft = Number(sbFtInput);
    if (!Number.isFinite(ft) || ft <= 0) { setMessage('Enter a valid distance in feet'); return; }
    const ppf = SCALE_BAR_LEN_PX / ft;
    const next: PdfScaleBar = { x: sbCenterRef.current.x, y: sbCenterRef.current.y, realWorldFt: ft, color: '#53c7c0', visible: true };
    setScaleBar(sheet.handle, next);
    // clear known distance
    setKnownDistance(sheet.handle, null);
    setKdPhase('idle'); setKdBegin(null); setKdEnd(null); setKdFtInput('');
    setPdfCalibration(sheet.handle, { method: 'scale-bar', pixelsPerUnit: ppf, unit: 'foot', label: `1"=${ft}ft` });
    setMessage(`Scale bar set: 1" = ${ft}ft`);
  }

  function commitKnownDistance(): void {
    if (!kdBeginRef.current || !kdEndRef.current) return;
    const ft = Number(kdFtInput);
    if (!Number.isFinite(ft) || ft <= 0) { setMessage('Enter a valid distance in feet'); return; }
    const lenPx = distance(kdBeginRef.current, kdEndRef.current);
    const measuredIn = lenPx / 150;
    const ppf = lenPx / ft;
    const next: PdfKnownDistance = { begin: kdBeginRef.current, end: kdEndRef.current, realWorldFt: ft, color: '#f5a623', visible: true };
    setKnownDistance(sheet.handle, next);
    // clear scale bar
    setScaleBar(sheet.handle, null);
    setPdfCalibration(sheet.handle, { method: 'known-distance', pixelsPerUnit: ppf, unit: 'foot', label: `${measuredIn.toFixed(2)}"=${ft}ft` });
    setMessage(`Distance set: ${measuredIn.toFixed(2)}" = ${ft}ft`);
  }

  function commitNorthArrow(): void {
    const d = northDraftRef.current;
    const next: PdfNorthArrow = { x: d.x, y: d.y, angleDeg: d.angleDeg, color: d.color, visible: true };
    setNorthArrow(sheet.handle, next);
    setPdfOrientation(sheet.handle, d.angleDeg);
    setMessage(`Orientation set: ${d.angleDeg.toFixed(1)} deg`);
  }

  // Pointer handlers for the north arrow drag (orient mode only)
  function handleNorthPointerDown(ev: React.PointerEvent<HTMLCanvasElement>): boolean {
    if (kind !== 'orient') return false;
    const rect = ev.currentTarget.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    const center = northCenterScreen();
    const tip = northTipScreen();
    const distTip = Math.hypot(sx - tip.x, sy - tip.y);
    const distCenter = Math.hypot(sx - center.x, sy - center.y);
    if (distTip <= NORTH_ARROW_HIT_TIP) {
      northDragRef.current = { kind: 'rotate', startAngle: northDraftRef.current.angleDeg };
      ev.currentTarget.setPointerCapture(ev.pointerId);
      return true;
    }
    if (distCenter <= NORTH_ARROW_HIT_CENTER) {
      northDragRef.current = { kind: 'move', startAngle: northDraftRef.current.angleDeg };
      ev.currentTarget.setPointerCapture(ev.pointerId);
      return true;
    }
    return false;
  }

  function handleNorthPointerMove(ev: React.PointerEvent<HTMLCanvasElement>): void {
    const drag = northDragRef.current;
    if (!drag) return;
    const rect = ev.currentTarget.getBoundingClientRect();
    const sx = ev.clientX - rect.left;
    const sy = ev.clientY - rect.top;
    if (drag.kind === 'move') {
      const p = screenToPage(sx, sy);
      setNorthDraft((d) => ({ ...d, x: p.x, y: p.y }));
    } else {
      const center = northCenterScreen();
      const angleDeg = angleFromCenterToPoint(center, { x: sx, y: sy });
      setNorthDraft((d) => ({ ...d, angleDeg }));
    }
  }

  function handleNorthPointerUp(ev: React.PointerEvent<HTMLCanvasElement>): void {
    if (!northDragRef.current) return;
    northDragRef.current = null;
    ev.currentTarget.releasePointerCapture(ev.pointerId);
    commitNorthArrow();
  }

  return (
    <div className={styles.pdfScene}>
      <canvas
        ref={canvasRef}
        className={styles.pdfSceneCanvas}
        onPointerDown={(ev) => {
          // Pan: right-click or shift+left
          if (ev.button === 2 || (ev.button === 0 && ev.shiftKey)) {
            dragRef.current = { x: ev.clientX, y: ev.clientY, panX: pan.x, panY: pan.y };
            ev.currentTarget.setPointerCapture(ev.pointerId);
            ev.preventDefault();
            return;
          }
          if (kind === 'orient') {
            handleNorthPointerDown(ev);
            return;
          }
          // calibrate mode
          const rect = ev.currentTarget.getBoundingClientRect();
          const sx = ev.clientX - rect.left;
          const sy = ev.clientY - rect.top;
          if (toolMode === 'scale-bar') {
            const center = pageToScreen(sbCenterRef.current);
            const dist = Math.hypot(sx - center.x, sy - center.y);
            if (dist <= 30) {
              sbDragRef.current = { startPage: screenToPage(sx, sy), startCenter: { ...sbCenterRef.current } };
              ev.currentTarget.setPointerCapture(ev.pointerId);
            }
          } else if (toolMode === 'known-distance') {
            const p = screenToPage(sx, sy);
            if (kdPhaseRef.current === 'idle' || kdPhaseRef.current === 'placed-end') {
              setKdBegin(p);
              setKdEnd(null);
              setKdPhase('placed-begin');
              setKdHover(null);
            } else if (kdPhaseRef.current === 'placed-begin') {
              setKdEnd(p);
              setKdPhase('placed-end');
              setKdHover(null);
            }
          }
        }}
        onPointerMove={(ev) => {
          if (northDragRef.current) {
            handleNorthPointerMove(ev);
            return;
          }
          const drag = dragRef.current;
          if (drag) {
            setPan({ x: drag.panX + ev.clientX - drag.x, y: drag.panY + ev.clientY - drag.y });
            return;
          }
          if (sbDragRef.current) {
            const rect = ev.currentTarget.getBoundingClientRect();
            const sx = ev.clientX - rect.left;
            const sy = ev.clientY - rect.top;
            const delta = screenToPage(sx, sy);
            const startPage = sbDragRef.current.startPage;
            const startCenter = sbDragRef.current.startCenter;
            setSbCenter({ x: startCenter.x + (delta.x - startPage.x), y: startCenter.y + (delta.y - startPage.y) });
            return;
          }
          if (toolMode === 'known-distance' && kdPhaseRef.current === 'placed-begin') {
            const rect = ev.currentTarget.getBoundingClientRect();
            setKdHover(screenToPage(ev.clientX - rect.left, ev.clientY - rect.top));
          }
        }}
        onPointerUp={(ev) => {
          if (northDragRef.current) {
            handleNorthPointerUp(ev);
            return;
          }
          if (sbDragRef.current) {
            sbDragRef.current = null;
            ev.currentTarget.releasePointerCapture(ev.pointerId);
            return;
          }
          dragRef.current = null;
          if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
        }}
        onPointerCancel={(ev) => {
          northDragRef.current = null;
          sbDragRef.current = null;
          dragRef.current = null;
          if (ev.currentTarget.hasPointerCapture(ev.pointerId)) ev.currentTarget.releasePointerCapture(ev.pointerId);
        }}
        onPointerLeave={() => { setKdHover(null); }}
        onContextMenu={(ev) => ev.preventDefault()}
      />
      <div className={styles.pdfSceneToolbar}>
        <div className={styles.pdfSceneTitle}>
          <strong>{sheet.label}</strong>
          <span>{message}</span>
        </div>
        <button type="button" className={styles.canvasToolBtn} onClick={returnToWorldScene}>
          Return to 3D
        </button>
        {kind === 'calibrate' ? (
          <>
            <button
              type="button"
              className={`${styles.canvasToolBtn} ${toolMode === 'scale-bar' ? styles.canvasToolBtnActive : ''}`}
              onClick={() => setToolMode('scale-bar')}
            >
              Scale Bar
            </button>
            <button
              type="button"
              className={`${styles.canvasToolBtn} ${toolMode === 'known-distance' ? styles.canvasToolBtnActive : ''}`}
              onClick={() => { setToolMode('known-distance'); setKdPhase('idle'); setKdBegin(null); setKdEnd(null); setKdHover(null); }}
            >
              Known Distance
            </button>
            <select
              className={styles.selectCtl}
              value={getScaleFromCalibration() ?? ''}
              onChange={(ev) => {
                const fpi = Number(ev.target.value);
                if (!fpi) return;
                const ppf = 150 / fpi;
                const opt = SCALE_OPTIONS.find((o) => o.feetPerInch === fpi);
                setPdfCalibration(sheet.handle, { method: 'scale-value', pixelsPerUnit: ppf, unit: 'foot', label: opt?.label ?? `1in=${fpi}ft` });
                setMessage(`Scale set: 1in = ${fpi}ft`);
              }}
            >
              <option value="">-- Dropdown scale --</option>
              {SCALE_OPTIONS.map((o) => (
                <option key={o.feetPerInch} value={o.feetPerInch}>{o.label}</option>
              ))}
            </select>
            {toolMode === 'scale-bar' && (
              <>
                <input
                  className={styles.numberCtl}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="ft"
                  value={sbFtInput}
                  onChange={(ev) => setSbFtInput(ev.target.value)}
                  aria-label="Scale bar real-world feet"
                />
                <button
                  type="button"
                  className={styles.canvasToolBtn}
                  onClick={commitScaleBar}
                >
                  Set Scale Bar
                </button>
              </>
            )}
            {toolMode === 'known-distance' && (
              <>
                <input
                  className={styles.numberCtl}
                  type="number"
                  min={0}
                  step="any"
                  placeholder="ft"
                  value={kdFtInput}
                  onChange={(ev) => setKdFtInput(ev.target.value)}
                  aria-label="Known distance real-world feet"
                />
                <button
                  type="button"
                  className={styles.canvasToolBtn}
                  disabled={kdPhase !== 'placed-end'}
                  onClick={commitKnownDistance}
                >
                  Set Distance
                </button>
         
              </>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className={styles.canvasToolBtn}
              onClick={commitNorthArrow}
            >
              Set North
            </button>
            <span className={styles.listRowMeta}>{northDraft.angleDeg.toFixed(1)}&deg;</span>
          </>
        )}
      </div>
    </div>
  );
}
