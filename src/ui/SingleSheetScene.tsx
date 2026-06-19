import { useCallback, useEffect, useRef, useState } from 'react';
import { type PdfSheetEntry } from '../state/store';
import type { PdfNorthArrow, PdfScaleBar, PdfKnownDistance } from '../core/contract';
import {
  returnToWorldScene,
  setPdfCalibration,
  setPdfOrientation,
  setNorthArrow,
  setScaleBar,
  setKnownDistance,
} from './importController';
import {
  type Point2,
  type ToolMode,
  type NorthDragKind,
  NORTH_ARROW_RADIUS,
  NORTH_ARROW_HIT_CENTER,
  NORTH_ARROW_HIT_TIP,
  SCALE_BAR_LEN_PX,
  distance,
  northTipInPage,
  computeVisibleTileWindows,
  drawLoadingOverlay,
  drawNorthArrow,
  usePdfTileCache,
} from './pdfSceneShared';
import styles from './App.module.css';

function angleFromCenterToPoint(center: Point2, p: Point2): number {
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  const deg = Math.atan2(dy, dx) * 180 / Math.PI + 90;
  return ((deg % 360) + 360) % 360;
}

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

export function SingleSheetScene({ sheet, kind }: { sheet: PdfSheetEntry; kind: 'calibrate' | 'orient' }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { tilesRef, status, loadingState, requestVisibleTiles } = usePdfTileCache(sheet);
  const requestVisibleTilesRef = useRef(requestVisibleTiles);
  useEffect(() => { requestVisibleTilesRef.current = requestVisibleTiles; }, [requestVisibleTiles]);

  const [toolMode, setToolMode] = useState<ToolMode>(kind === 'orient' ? 'north' : 'scale-bar');
  const [zoom, setZoom] = useState(0.18);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState(status);

  const [northDraft, setNorthDraft] = useState<NorthArrowDraft>(() => defaultNorthArrow(sheet));

  const defaultSbCenter = (): Point2 => ({ x: sheet.widthPx150 / 2, y: sheet.heightPx150 / 2 });
  const [sbCenter, setSbCenter] = useState<Point2>(() => sheet.scaleBar ? { x: sheet.scaleBar.x, y: sheet.scaleBar.y } : defaultSbCenter());
  const [sbFtInput, setSbFtInput] = useState<string>(sheet.scaleBar?.realWorldFt != null ? String(sheet.scaleBar.realWorldFt) : '');
  const sbDragRef = useRef<{ startPage: Point2; startCenter: Point2 } | null>(null);

  const [kdPhase, setKdPhase] = useState<'idle' | 'placed-begin' | 'placed-end'>(
    sheet.knownDistance ? 'placed-end' : 'idle',
  );
  const [kdBegin, setKdBegin] = useState<Point2 | null>(sheet.knownDistance ? sheet.knownDistance.begin : null);
  const [kdEnd, setKdEnd] = useState<Point2 | null>(sheet.knownDistance ? sheet.knownDistance.end : null);
  const [kdFtInput, setKdFtInput] = useState<string>(sheet.knownDistance?.realWorldFt != null ? String(sheet.knownDistance.realWorldFt) : '');
  const [kdHover, setKdHover] = useState<Point2 | null>(null);

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
    const fpi = 150 / cal.pixelsPerUnit;
    return SCALE_OPTIONS.find((o) => Math.abs(o.feetPerInch - fpi) < 0.5)?.feetPerInch ?? null;
  };

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
      setZoom(0.18);
      setPan({ x: 0, y: 0 });
    }
  }, [sheet]);

  const northDragRef = useRef<{ kind: NorthDragKind; startAngle: number } | null>(null);
  const northDraftRef = useRef(northDraft);
  northDraftRef.current = northDraft;

  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  panRef.current = pan;
  zoomRef.current = zoom;

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
        ctx.globalAlpha = sheet.opacityPct / 100;
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

        if (kind === 'calibrate') {
          if (toolMode === 'scale-bar') {
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
            ctx.beginPath();
            ctx.moveTo(sc0.x, sc0.y);
            ctx.lineTo(sc0.x + headLen, sc0.y - 5);
            ctx.lineTo(sc0.x + headLen, sc0.y + 5);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(sc1.x, sc1.y);
            ctx.lineTo(sc1.x - headLen, sc1.y - 5);
            ctx.lineTo(sc1.x - headLen, sc1.y + 5);
            ctx.closePath();
            ctx.fill();
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
                ctx.beginPath();
                ctx.moveTo(bs.x, bs.y);
                ctx.lineTo(bs.x + ux * headLen - uy * headW, bs.y + uy * headLen + ux * headW);
                ctx.lineTo(bs.x + ux * headLen + uy * headW, bs.y + uy * headLen - ux * headW);
                ctx.closePath();
                ctx.fill();
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

        if (kind === 'orient') {
          const d = northDraftRef.current;
          const centerSc = pageToScreen({ x: d.x, y: d.y });
          const tipPage = northTipInPage({ x: d.x, y: d.y }, d.angleDeg);
          const tipSc = pageToScreen(tipPage);
          const radiusSc = NORTH_ARROW_RADIUS * zoom;
          ctx.save();
          drawNorthArrow(ctx, centerSc, tipSc, d.color, radiusSc);
          ctx.restore();

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
  }, [kind, pageToScreen, pan, sheet.heightPx150, sheet.opacityPct, sheet.widthPx150, tilesRef, toolMode, zoom]);

  function commitScaleBar(): void {
    const ft = Number(sbFtInput);
    if (!Number.isFinite(ft) || ft <= 0) { setMessage('Enter a valid distance in feet'); return; }
    const ppf = SCALE_BAR_LEN_PX / ft;
    const next: PdfScaleBar = { x: sbCenterRef.current.x, y: sbCenterRef.current.y, realWorldFt: ft, color: '#53c7c0', visible: true };
    setScaleBar(sheet.handle, next);
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
