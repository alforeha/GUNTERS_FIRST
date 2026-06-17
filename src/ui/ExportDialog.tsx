import { useAppStore } from '../state/store';
import { cancelSurfaceExport, confirmSurfaceExport } from './importController';
import styles from './App.module.css';

function exportFindings(job: NonNullable<ReturnType<typeof useAppStore.getState>['exportJob']>) {
  const modified =
    job.modifiedVertexCount === 0
      ? 'no changes - exporting unedited copy'
      : job.modifiedVertexCount === null
        ? 'surface modified - exporting edited copy'
        : `${job.modifiedVertexCount.toLocaleString()} points modified`;
  return [
    modified,
    job.triangulationPreserved ? 'triangulation preserved from source' : 'triangulation rebuilt',
    `${job.breaklineCount.toLocaleString()} breaklines re-emitted`,
    `${job.boundaryCount.toLocaleString()} boundaries re-emitted`,
    job.contourCount > 0
      ? `${job.contourCount.toLocaleString()} contours re-emitted`
      : 'no contours stored in source',
  ];
}

export function ExportDialog() {
  const job = useAppStore((state) => state.exportJob);
  if (!job) return null;

  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Export surface">
        <div className={styles.dialogHeader}>
          <div className={styles.dialogFile}>
            <span className={styles.dialogFileName}>{job.surfaceName}</span>
            <span className={styles.formatChip}>Export</span>
          </div>
          <div className={styles.dialogMeta}>{job.fileName}</div>
        </div>
        <div className={styles.dialogSection}>
          <h3 className={styles.dialogSectionTitle}>What this export contains</h3>
          <ul className={styles.findings}>
            {exportFindings(job).map((line) => (
              <li key={line} className={styles.finding}>
                <span className={`${styles.findingIcon} ${styles.sev_ok}`}>✓</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.actionBtn} onClick={cancelSurfaceExport}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            onClick={confirmSurfaceExport}
          >
            Download LandXML
          </button>
        </div>
      </div>
    </div>
  );
}
