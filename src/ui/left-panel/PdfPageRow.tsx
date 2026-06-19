import { useState } from 'react';
import { useAppStore, type PdfSheetEntry } from '../../state/store';
import {
  setPdfVisible,
  setPdfOpacity,
  openPdfCalibrationScene,
  openPdfOrientationScene,
  openPdfGroupScene,
  removeSheetFromGroup,
} from '../importController';
import { AddToGroupPicker } from './AddToGroupPicker';
import styles from '../App.module.css';

export function PdfPageRow({
  page,
  containerPosition,
  showReorder = false,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  groupAction,
}: {
  page: PdfSheetEntry;
  containerPosition: number;
  showReorder?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
  groupAction: 'add' | 'remove';
}) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const [addToGroupOpen, setAddToGroupOpen] = useState(false);

  const calLabel = page.calibration
    ? `${page.calibration.label}`
    : 'Calibrate';
  const orientLabel = page.orientation !== null
    ? `${page.orientation.toFixed(1)} deg`
    : 'Orient';

  const handleRemove = () => {
    if (window.confirm(`Remove "${page.label}" from group?`)) {
      removeSheetFromGroup(page.handle);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      {showReorder && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, paddingTop: 4 }}>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={isFirst}
            title="Move page up"
            onClick={onMoveUp}
          >
            ^
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            disabled={isLast}
            title="Move page down"
            onClick={onMoveDown}
          >
            v
          </button>
        </div>
      )}
      <div className={styles.listRow} style={{ flex: 1, minWidth: 0, marginBottom: 4 }}>
        <div className={styles.listRowTop}>
          <button
            type="button"
            className={`${styles.typePill} ${styles.typePillPdf} ${page.visible ? '' : styles.typePillOff}`}
            title={page.visible ? 'Hide page' : 'Show page'}
            onClick={() => setPdfVisible(page.handle, !page.visible)}
          >
            {containerPosition}
          </button>
          <div className={styles.listRowName}>{page.label}</div>
          <span className={styles.listRowMeta}>Transparency</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            title="PDF transparency"
            value={page.opacityPct}
            onChange={(ev) => {
              setPdfOpacity(page.handle, Number(ev.target.value));
            }}
            style={{ width: 80 }}
          />
          <span className={styles.listRowMeta}>{page.opacityPct}%</span>
          {importNotes[page.handle] && (
            <button
              type="button"
              className={styles.iconBtn}
              title="Import notes"
              aria-label="Import notes"
              onClick={() => setNotesHandle(page.handle)}
            >
              i
            </button>
          )}
          {groupAction === 'add' ? (
            <button
              type="button"
              className={styles.iconBtn}
              title="Add to group"
              aria-label="Add to group"
              onClick={() => setAddToGroupOpen(true)}
            >
              +
            </button>
          ) : (
            <button
              type="button"
              className={styles.iconBtn}
              title="Remove from group"
              aria-label="Remove from group"
              onClick={handleRemove}
            >
              x
            </button>
          )}
        </div>
        <div className={styles.listRowTop} style={{ marginTop: 4 }}>
          <button type="button" className={styles.elemChip} title={calLabel} onClick={() => openPdfCalibrationScene(page.handle)}>
            {calLabel}
          </button>
          <button type="button" className={styles.elemChip} title={orientLabel} onClick={() => openPdfOrientationScene(page.handle)}>
            {orientLabel}
          </button>
          <span className={styles.rowSpacer} />
          <span className={styles.listRowMeta}>
            {page.widthPx150.toLocaleString()} x {page.heightPx150.toLocaleString()} px
          </span>
          <button type="button" className={styles.elemChip} title="Open markup scene" onClick={() => openPdfGroupScene(page.handle)}>
            Markup
          </button>
        </div>
        {addToGroupOpen && (
          <AddToGroupPicker
            handles={[page.handle]}
            onClose={() => setAddToGroupOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
