import { type PdfSheetEntry } from '../../state/store';
import { setScaleBar, setNorthArrow } from '../importController';
import styles from '../App.module.css';

export function PdfMarkupManager({ entry }: { entry: PdfSheetEntry }) {
  return (
    <div className={styles.rowExpand} style={{ marginTop: 8 }}>
      <div className={styles.listRowMeta} style={{ fontWeight: 600, marginBottom: 4 }}>Markup Manager</div>
      <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span>Scale bar</span>
        <button
          type="button"
          className={`${styles.elemChip} ${entry.scaleBar?.visible ? '' : styles.elemChipOff}`}
          title={entry.scaleBar?.visible ? 'Hide scale bar' : 'Show scale bar'}
          onClick={() => {
            if (entry.scaleBar) {
              setScaleBar(entry.handle, { ...entry.scaleBar, visible: !entry.scaleBar.visible });
            }
          }}
        >
          {entry.scaleBar?.visible ? 'Visible' : 'Hidden'}
        </button>
      </div>
      {entry.orientation !== null && (
        <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Orient</span>
          <span>{entry.orientation.toFixed(1)}&deg;</span>
          <button
            type="button"
            className={`${styles.elemChip} ${entry.northArrow?.visible ? '' : styles.elemChipOff}`}
            title={entry.northArrow?.visible ? 'Hide north arrow' : 'Show north arrow'}
            onClick={() => {
              if (entry.northArrow) {
                setNorthArrow(entry.handle, { ...entry.northArrow, visible: !entry.northArrow.visible });
              }
            }}
          >
            {entry.northArrow?.visible ? 'Visible' : 'Hidden'}
          </button>
        </div>
      )}
      {/* ITEM24 slot: Edge border show/hide row (group+3D scoped, hidden by default) */}
    </div>
  );
}
