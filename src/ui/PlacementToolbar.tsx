import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import { engineHolder } from './engineHolder';
import { setPdfPlacement } from './importController';
import styles from './App.module.css';

type Phase = 'pick-pdf' | 'pick-world' | 'ready';

interface Point3 { x: number; y: number; z: number; }
interface Point2 { x: number; y: number; }

function worldToSheetPx(world: Point3, wcx: number, wcy: number, ppf: number, sheetW: number, sheetH: number, orientationDeg: number): Point2 {
  const a = (orientationDeg * Math.PI) / 180;
  const dx = world.x - wcx;
  const dy = world.y - wcy;
  const rx = dx * Math.cos(a) - dy * Math.sin(a);
  const ry = dx * Math.sin(a) + dy * Math.cos(a);
  return { x: rx * ppf + sheetW / 2, y: -ry * ppf + sheetH / 2 };
}

export function PlacementToolbar({ container }: { container: HTMLElement | null }) {
  const placingPdfHandle = useAppStore((s) => s.placingPdfHandle);
  const setPlacingPdfHandle = useAppStore((s) => s.setPlacingPdfHandle);
  const setCameraMode = useAppStore((s) => s.setCameraMode);
  const preMode = useAppStore((s) => s.prePlacementCameraMode);
  const sheet = useAppStore((s) => s.pdfSheets.find((sh) => sh.handle === placingPdfHandle) ?? null);

  const [phase, setPhase] = useState<Phase>('pick-pdf');
  const pickedPdfWorldRef = useRef<Point3 | null>(null);
  const pickedPdfSheetPxRef = useRef<Point2 | null>(null);
  const targetWorldRef = useRef<Point3 | null>(null);
  const [, forceRender] = useState(0);

  const exit = () => {
    setPlacingPdfHandle(null);
    setCameraMode(preMode);
  };

  const onConfirm = () => {
    const engine = engineHolder.current;
    if (!engine || !sheet || !pickedPdfWorldRef.current || !targetWorldRef.current) return;
    const ppf = sheet.calibration?.pixelsPerUnit ?? 100;
    const pos = engine.getPdfGroupPositionScenePx(sheet.handle);
    const wcx = pos ? pos.x / ppf : sheet.flatOffsetPx.x / ppf;
    const wcy = pos ? pos.y / ppf : sheet.flatOffsetPx.y / ppf;
    const pw = pickedPdfWorldRef.current;
    const tw = targetWorldRef.current;
    const origin = engine.getSceneOrigin();
    setPdfPlacement(sheet.handle, {
      pairs: [{ pdf: pickedPdfSheetPxRef.current ?? { x: 0, y: 0 }, world: { x: tw.x, y: tw.y, z: tw.z } }],
      translation: { x: origin[0] + wcx + (tw.x - pw.x), y: origin[1] + wcy + (tw.y - pw.y), z: 0 },
      rotationDeg: sheet.orientation ?? 0,
      scale: 1.0,
      residualFt: null,
    });
    exit();
  };

  useEffect(() => {
    if (!container) return;
    const canvas = container.querySelector('canvas');
    if (!canvas) return;

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0 || ev.shiftKey) return;
      const target = ev.target as HTMLElement | null;
      if (target?.closest('button, input, label, select, textarea')) return;

      const engine = engineHolder.current;
      if (!engine || !sheet) return;
      const pt = engine.pickWorldPointAtPointer();
      if (!pt) return;

      if (phase === 'pick-pdf') {
        const ppf = sheet.calibration?.pixelsPerUnit ?? 100;
        const pos = engine.getPdfGroupPositionScenePx(sheet.handle);
        const wcx = pos ? pos.x / ppf : sheet.flatOffsetPx.x / ppf;
        const wcy = pos ? pos.y / ppf : sheet.flatOffsetPx.y / ppf;
        const sheetPx = worldToSheetPx({ x: pt.x, y: pt.y, z: pt.z }, wcx, wcy, ppf, sheet.widthPx150, sheet.heightPx150, sheet.orientation ?? 0);
        pickedPdfWorldRef.current = { x: pt.x, y: pt.y, z: pt.z };
        pickedPdfSheetPxRef.current = sheetPx;
        setPhase('pick-world');
        forceRender((n) => n + 1);
      } else if (phase === 'pick-world') {
        targetWorldRef.current = { x: pt.x, y: pt.y, z: pt.z };
        setPhase('ready');
        forceRender((n) => n + 1);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown, true);
    return () => canvas.removeEventListener('pointerdown', onPointerDown, true);
  }, [container, phase, sheet]);

  const statusText =
    phase === 'pick-pdf' ? 'Pick a point on the PDF' :
    phase === 'pick-world' ? 'Pick the target location in the scene' :
    'Ready — Confirm or Cancel';

  return (
    <div className={styles.canvasModeBar} style={{ top: 0, bottom: 'auto', left: 8, right: 8, width: 'auto', maxWidth: 500, margin: '12px auto 0', justifySelf: 'center', zIndex: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--fg, #e8e2d0)', flex: '1 0 auto', minWidth: 180 }}>{statusText}</span>
        <button type="button" className={styles.canvasToolBtn} disabled={phase !== 'ready'} onClick={onConfirm}>
          Confirm
        </button>
        <button type="button" className={styles.canvasToolBtn} onClick={exit}>
          Cancel
        </button>
        {phase !== 'pick-pdf' && (
          <button type="button" className={styles.canvasToolBtn} onClick={() => {
            pickedPdfWorldRef.current = null;
            pickedPdfSheetPxRef.current = null;
            targetWorldRef.current = null;
            setPhase('pick-pdf');
            forceRender((n) => n + 1);
          }}>
            Reset pick
          </button>
        )}
      </div>
    </div>
  );
}
