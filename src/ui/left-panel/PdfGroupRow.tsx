import { useState } from 'react';
import { type PdfGroupEntry, type PdfSheetEntry } from '../../state/store';
import { setPdfGroupSheetOrder, setPdfVisible, openPdfGroupScene } from '../importController';
import { PdfSheetRow } from './PdfSheetRow';
import styles from '../App.module.css';

export function PdfGroupRow({ group, entries }: { group: PdfGroupEntry; entries: PdfSheetEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  const visible = entries.some((entry) => entry.visible);
  const moveSheet = (handle: string, dir: 1 | -1): void => {
    const idx = group.sheetIds.indexOf(handle);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= group.sheetIds.length) return;
    const next = [...group.sheetIds];
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setPdfGroupSheetOrder(group.id, next);
  };
  return (
    <div className={styles.listRow}>
      <div className={styles.listRowTop}>
        <button type="button" className={styles.iconBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'v' : '>'}
        </button>
        <div className={styles.listRowName}>{group.label}</div>
        <span className={styles.listRowMeta}>{entries.length} PDFs</span>
        <span className={styles.rowSpacer} />
        <button
          type="button"
          className={`${styles.elemChip} ${visible ? '' : styles.elemChipOff}`}
          title={`${visible ? 'Hide' : 'Show'} group sheets`}
          onClick={() => entries.forEach((entry) => setPdfVisible(entry.handle, !visible))}
        >
          PDF
        </button>
        <button type="button" className={styles.elemChip} title="Open group in PDF Scene" onClick={() => openPdfGroupScene(group.id)}>
          Open
        </button>
      </div>
      {expanded && (
        <div className={styles.rowExpand}>
          {entries.map((entry, index) => (
            <div key={entry.handle} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6 }}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Move sheet up"
                  disabled={index === 0}
                  onClick={() => moveSheet(entry.handle, -1)}
                >
                  ^
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Move sheet down"
                  disabled={index === entries.length - 1}
                  onClick={() => moveSheet(entry.handle, 1)}
                >
                  v
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PdfSheetRow entry={entry} compact grouped />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
