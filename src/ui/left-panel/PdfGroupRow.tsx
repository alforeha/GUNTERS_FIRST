import { useAppStore, type PdfGroupEntry, type PdfSheetEntry } from '../../state/store';
import { setPdfGroupSheetOrder, setPdfVisible, openPdfGroupScene } from '../importController';
import { PdfPageRow } from './PdfPageRow';
import { RowShell } from './RowShell';
import styles from '../App.module.css';

export function PdfGroupRow({ group, entries, isExpanded, onToggle, sectionColor }: { group: PdfGroupEntry; entries: PdfSheetEntry[]; isExpanded: boolean; onToggle: () => void; sectionColor?: string }) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const visible = entries.some((entry) => entry.visible);
  const firstSheet = entries[0];
  const hasImportNotes = entries.some((entry) => importNotes[entry.handle]);
  const detailsText = firstSheet
    ? `${entries.length} PDF${entries.length !== 1 ? 's' : ''}, ${firstSheet.widthPx150.toLocaleString()}x${firstSheet.heightPx150.toLocaleString()} px`
    : `${entries.length} PDF${entries.length !== 1 ? 's' : ''}`;
  const moveSheet = (handle: string, dir: 1 | -1): void => {
    const idx = group.sheetIds.indexOf(handle);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= group.sheetIds.length) return;
    const next = [...group.sheetIds];
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setPdfGroupSheetOrder(group.id, next);
  };
  const handleRemoveGroup = () => {
    if (window.confirm(`Remove group "${group.label}"?`)) {
      useAppStore.getState().removePdfGroup(group.id);
    }
  };
  return (
    <RowShell className={styles.listRow} onToggle={onToggle}>
      <div className={styles.listRowTop}>
        <button
          type="button"
          className={`${styles.typePill} ${styles.typePillPdf} ${visible ? '' : styles.typePillOff}`}
          title={`${visible ? 'Hide' : 'Show'} group sheets`}
          onClick={() => entries.forEach((entry) => setPdfVisible(entry.handle, !visible))}
        >
          PDF
        </button>
        <div className={styles.listRowName}>{group.label}</div>
        <span className={styles.listRowMeta}>{detailsText}</span>
        {hasImportNotes && (
          <button
            type="button"
            className={styles.iconBtn}
            title="Import notes"
            aria-label="Import notes"
            onClick={() => setNotesHandle(firstSheet!.handle)}
          >
            i
          </button>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          title="Remove group"
          aria-label="Remove group"
          onClick={handleRemoveGroup}
        >
          x
        </button>
      </div>
      {isExpanded && (
        <div className={styles.rowExpand} onClick={(ev) => ev.stopPropagation()} style={{ position: 'relative', ...(sectionColor ? { borderTopColor: sectionColor } : {}) }}>
          <div className={styles.listRowTop} style={{ gap: 4, marginBottom: 6 }}>
            <button type="button" className={styles.elemChip} title="Open group in PDF Scene" onClick={() => openPdfGroupScene(group.id)}>
              Open
            </button>
            <button type="button" className={styles.elemChip} title="Place in group scene (placeholder)" onClick={() => { /* PLACE no-op */ }}>
              Place
            </button>
          </div>
          {entries.map((entry, index) => (
            <PdfPageRow
              key={entry.handle}
              page={entry}
              containerPosition={index + 1}
              showReorder
              isFirst={index === 0}
              isLast={index === entries.length - 1}
              onMoveUp={() => moveSheet(entry.handle, -1)}
              onMoveDown={() => moveSheet(entry.handle, 1)}
              groupAction="remove"
            />
          ))}
          {sectionColor && (
            <button
              type="button"
              title="Collapse"
              onClick={onToggle}
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                transform: 'translate(-50%, -50%)',
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `1px solid ${sectionColor}`,
                background: 'var(--bg-inset)',
                color: sectionColor,
                fontSize: 12,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              v
            </button>
          )}
        </div>
      )}
    </RowShell>
  );
}
