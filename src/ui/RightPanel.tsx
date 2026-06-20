import { useAppStore } from '../state/store';
import { PdfGroupView } from './right-panel/PdfGroupView';
import { PdfSingleView } from './right-panel/PdfSingleView';
import { SurfaceView } from './right-panel/SurfaceView';
import styles from './App.module.css';

export function RightPanel({ sizeClass }: { sizeClass: string }) {
  const open = useAppStore((s) => s.rightOpen);
  const toggleRight = useAppStore((s) => s.toggleRight);
  const sceneMode = useAppStore((s) => s.sceneMode);
  const activePdfSceneKind = useAppStore((s) => s.activePdfSceneKind);

  const asideCls = `${styles.panel} ${styles.panelRight} ${open ? sizeClass : styles.panelCollapsed}`;
  const innerCls = `${styles.panelInner} ${styles.panelInnerColumn}`;

  return (
    <aside className={asideCls}>
      <div className={styles.panelHeaderRow}>
        <button type="button" className={styles.chevronBtn} onClick={toggleRight} title="Collapse panel">
          {'>'}
        </button>
        <h2 className={styles.panelTitle}>Tool and Analytic Control Center</h2>
      </div>
      <div className={innerCls}>
        {sceneMode === 'pdf2d' ? (
          activePdfSceneKind === 'group' ? <PdfGroupView /> : <PdfSingleView />
        ) : (
          <SurfaceView />
        )}
      </div>
    </aside>
  );
}
