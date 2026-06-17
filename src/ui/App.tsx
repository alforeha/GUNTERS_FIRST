// src/ui — React shell. DEPENDENCY RULE: ui → viewer → core, never backwards.
import { useEffect, useState } from 'react';
import { useAppStore } from '../state/store';
import { ExportDialog } from './ExportDialog';
import { Header } from './Header';
import { ImportDialog } from './ImportDialog';
import { LeftPanel } from './LeftPanel';
import { RightPanel } from './RightPanel';
import { StatusBar } from './StatusBar';
import { Viewport } from './Viewport';
import { enqueueFiles } from './importController';
import styles from './App.module.css';

export function App() {
  const leftOpen = useAppStore((s) => s.leftOpen);
  const rightOpen = useAppStore((s) => s.rightOpen);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const toggleRight = useAppStore((s) => s.toggleRight);

  // Whole window is the drop target, always (00 §4). Sprint 2: drops feed the import
  // pipeline (sniff → route → parse worker → dialog); multiple files queue sequentially.
  const [dragOver, setDragOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const onDragEnter = (ev: DragEvent) => {
      ev.preventDefault();
      depth++;
      setDragOver(true);
    };
    const onDragOver = (ev: DragEvent) => ev.preventDefault();
    const onDragLeave = () => {
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragOver(false);
    };
    const onDrop = (ev: DragEvent) => {
      ev.preventDefault();
      depth = 0;
      setDragOver(false);
      const files = ev.dataTransfer?.files;
      if (files && files.length > 0) enqueueFiles(files);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // Panel math (07 Phase 1): both closed = full-bleed canvas; ONE open = 50/50;
  // both open = thirds. Sizes animate; the canvas ResizeObserver keeps the render correct.
  const bothOpen = leftOpen && rightOpen;
  const sizeClass = (bothOpen ? styles.panelThird : styles.panelHalf) ?? '';

  return (
    <div className={styles.app}>
      <Header />
      <main className={styles.main}>
        <LeftPanel sizeClass={sizeClass} />
        <Viewport />
        <RightPanel sizeClass={sizeClass} />
        {/* Closed panels collapse to a slim edge tab that reopens them (07 Phase 1). */}
        {!leftOpen && (
          <button
            type="button"
            className={`${styles.collapseTab} ${styles.collapseTabLeft}`}
            onClick={toggleLeft}
            title="Open display panel"
          >
            ▸
          </button>
        )}
        {!rightOpen && (
          <button
            type="button"
            className={`${styles.collapseTab} ${styles.collapseTabRight}`}
            onClick={toggleRight}
            title="Open tools panel"
          >
            ◂
          </button>
        )}
        {dragOver && <div className={styles.dropOverlay}>Drop a supported survey, CAD, raster, PDF, or point cloud file</div>}
      </main>
      <StatusBar />
      <ImportDialog />
      <ExportDialog />
    </div>
  );
}
