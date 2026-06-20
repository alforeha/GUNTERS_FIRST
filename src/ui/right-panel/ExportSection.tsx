import { beginSurfaceExport } from '../importController';
import styles from '../App.module.css';

export function buildSurfaceExportAction(
  active: { handle: string; name: string } | null,
): {
  disabled: boolean;
  title: string;
  onClick: () => void;
} {
  return {
    disabled: !active,
    title: active ? `Export ${active.name} to LandXML` : 'Select a surface to export',
    onClick: () => {
      if (active) beginSurfaceExport(active.handle);
    },
  };
}

export function ExportSection({ active }: { active: { handle: string; name: string } | null }) {
  const action = buildSurfaceExportAction(active);

  return (
    <div className={styles.exportSection}>
      <h2 className={styles.panelTitle}>Export</h2>
      <button
        type="button"
        className={styles.actionBtn}
        disabled={action.disabled}
        title={action.title}
        onClick={action.onClick}
      >
        Export to LandXML
      </button>
    </div>
  );
}
