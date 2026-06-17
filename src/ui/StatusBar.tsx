// Status bar: units · cursor N/E/Z · mode badge · progress slot (00 §4).
// Cursor + fps are HIGH-FREQUENCY: written straight to the DOM via transient store
// subscriptions — no React re-render per pointermove (React stays out of the render loop).
import { useEffect, useRef } from 'react';
import { useAppStore } from '../state/store';
import styles from './App.module.css';

const EMPTY_CURSOR = 'N -  E -  Z -';

function formatCursor(c: { e: number; n: number; z: number }): string {
  return `N ${c.n.toFixed(2)}  E ${c.e.toFixed(2)}  Z ${c.z.toFixed(2)}`;
}

export function StatusBar() {
  const units = useAppStore((s) => s.units);
  const cameraMode = useAppStore((s) => s.cameraMode);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const progress = useAppStore((s) => s.progress);
  const labelNote = useAppStore((s) => s.labelNote);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const unsubCursor = useAppStore.subscribe(
      (s) => s.cursor,
      (c) => {
        if (cursorRef.current) cursorRef.current.textContent = c ? formatCursor(c) : EMPTY_CURSOR;
      },
    );
    const unsubFps = useAppStore.subscribe(
      (s) => s.fps,
      (f) => {
        if (fpsRef.current) fpsRef.current.textContent = f === null ? '' : `${f.toFixed(0)} fps`;
      },
    );
    return () => {
      unsubCursor();
      unsubFps();
    };
  }, []);

  return (
    <footer className={styles.statusBar}>
      <span>{units}</span>
      <span className={styles.statusCursor} ref={cursorRef}>
        {EMPTY_CURSOR}
      </span>
      <span className={styles.statusSpacer} />
      {labelNote && <span className={styles.labelNote}>{labelNote}</span>}
      <span ref={fpsRef} />
      <span className={`${styles.modeBadge} ${editSurfaceHandle ? styles.modeBadgeEdit : ''}`}>
        {editSurfaceHandle ? 'EDIT' : 'VIEW'} ·{' '}
        {cameraMode === 'top' ? 'TOP' : cameraMode === 'hover' ? 'HOVER' : 'ORBIT'}
      </span>
      <span className={styles.progressSlot}>{progress ?? ''}</span>
    </footer>
  );
}
