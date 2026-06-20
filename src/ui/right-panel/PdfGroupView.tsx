import { useAppStore } from '../../state/store';
import { returnToWorldScene } from '../importController';
import styles from '../App.module.css';

export function PdfGroupView() {
  const handle = useAppStore((s) => s.activeSceneObjectHandle);
  const group = useAppStore((s) => s.pdfGroups.find((g) => g.id === handle) ?? null);
  const sheetCount = useAppStore((s) =>
    s.pdfGroups.find((g) => g.id === handle)?.sheetIds.length ?? 0,
  );
  const sheets = useAppStore((s) => {
    const g = s.pdfGroups.find((gr) => gr.id === handle);
    if (!g) return [] as { handle: string; label: string; visible: boolean }[];
    return g.sheetIds
      .map((id) => s.pdfSheets.find((sh) => sh.handle === id))
      .filter((sh): sh is NonNullable<typeof sh> => !!sh)
      .map((sh) => ({ handle: sh.handle, label: sh.label, visible: sh.visible }));
  });

  return (
    <div className={styles.section}>
      <h2 className={styles.panelTitle}>PDF Group Scene</h2>
      <div className={styles.listRow}>
        <div className={styles.listRowName}>{group?.label ?? 'Unknown'}</div>
        <div className={styles.listRowMeta}>{sheetCount} sheets</div>
        <div className={styles.listRowMeta}>group arrangement view</div>
      </div>
      {sheets.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {sheets.map((sh) => (
            <div key={sh.handle} className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: sh.visible ? 'var(--accent)' : 'var(--dim)' }} />
              <span>{sh.label}</span>
            </div>
          ))}
        </div>
      )}
      <button type="button" className={styles.actionBtn} onClick={returnToWorldScene}>
        Return to 3D
      </button>
    </div>
  );
}
