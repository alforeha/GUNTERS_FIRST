import { useCallback, useEffect, useRef, useState } from 'react';
import { type PdfSheetEntry } from '../state/store';
import type { BorderCrop, CropRect } from '../core/contract';
import type { PdfDecodeTileRequest, PdfOpenRequest, PdfWorkerMessage } from '../workers/pdf.worker';
import { getPdfSourceFile } from './importController';

const TILE_SIZE_PX = 1024;
const MAX_CONCURRENT = 4;

const LOADING_BAR_WIDTH = 0.35;
const LOADING_BAR_CYCLE_MS = 1400;

export const NORTH_ARROW_RADIUS = 75;
export const NORTH_ARROW_HIT_CENTER = 20;
export const NORTH_ARROW_HIT_TIP = 18;
export const SCALE_BAR_LEN_PX = 150;

export type ToolMode = 'scale-bar' | 'known-distance' | 'north';
export type NorthDragKind = 'move' | 'rotate';
export type LoadingState = 'opening' | 'rendering' | 'ready';

export interface Point2 {
  x: number;
  y: number;
}

interface TileCache {
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
}

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function northTipInPage(center: Point2, angleDeg: number): Point2 {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return {
    x: center.x + Math.cos(rad) * NORTH_ARROW_RADIUS,
    y: center.y + Math.sin(rad) * NORTH_ARROW_RADIUS,
  };
}

export function computeVisibleTileWindows(
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

export function drawLoadingOverlay(
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

export function drawNorthArrow(
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

  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(center.x, center.y);
  ctx.lineTo(tip.x, tip.y);
  ctx.stroke();

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

  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', center.x, center.y);

  ctx.beginPath();
  ctx.arc(tip.x, tip.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function defaultRectCrop(sheet: Pick<PdfSheetEntry, 'widthPx150' | 'heightPx150'>): CropRect {
  return { kind: 'rect', x: 0, y: 0, width: sheet.widthPx150, height: sheet.heightPx150 };
}

export function cropPoints(crop: BorderCrop): Point2[] {
  if (crop.kind === 'polygon') return crop.points.map(([x, y]) => ({ x, y }));
  return [
    { x: crop.x, y: crop.y },
    { x: crop.x + crop.width, y: crop.y },
    { x: crop.x + crop.width, y: crop.y + crop.height },
    { x: crop.x, y: crop.y + crop.height },
  ];
}

export function traceBorderCropSheetPx(
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

export function drawBorderCropSheetPx(
  ctx: CanvasRenderingContext2D,
  crop: BorderCrop,
): void {
  traceBorderCropSheetPx(ctx, crop);
  ctx.stroke();
}

export function usePdfTileCache(sheet: PdfSheetEntry) {
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
