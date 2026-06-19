import { useState } from 'react';
import { type PdfSheetEntry } from '../../../state/store';
import { createPdfGroup } from '../../importController';
import styles from '../../App.module.css';

export function PdfGroupModal({
  sheets,
  groupCount,
  onClose,
}: {
  sheets: PdfSheetEntry[];
  groupCount: number;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(sheets.map((sheet) => [sheet.handle, true])),
  );
  const selectedHandles = sheets.filter((sheet) => selected[sheet.handle]).map((sheet) => sheet.handle);
  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Group PDFs">
        <div className={styles.dialogHeader}>
          <div className={styles.dialogFile}>
            <span className={styles.dialogFileName}>Group PDFs</span>
            <span className={styles.formatChip}>PDF</span>
          </div>
          <div className={styles.dialogMeta}>Cross-file groups overlap by default. Same-source page groups stack edge-to-edge.</div>
        </div>
        <div className={styles.batchList}>
          {sheets.map((sheet) => (
            <label key={sheet.handle} className={styles.batchItem}>
              <input
                type="checkbox"
                checked={selected[sheet.handle] ?? false}
                onChange={(ev) => setSelected((prev) => ({ ...prev, [sheet.handle]: ev.target.checked }))}
              />
              <span className={styles.listRowName}>{sheet.label}</span>
              <span className={styles.listRowMeta}>page {sheet.pageIndex + 1}</span>
            </label>
          ))}
        </div>
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={selectedHandles.length < 2}
            onClick={() => {
              createPdfGroup(`PDF Group ${groupCount + 1}`, selectedHandles);
              onClose();
            }}
          >
            Group {selectedHandles.length} PDFs
          </button>
        </div>
      </div>
    </div>
  );
}
