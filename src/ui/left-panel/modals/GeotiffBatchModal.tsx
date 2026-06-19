import { useState } from 'react';
import { type GeotiffEntry } from '../../../state/store';
import { createGeotiffGroup } from '../../importController';
import styles from '../../App.module.css';

export function GeotiffBatchModal({
  geotiffs,
  groupCount,
  onClose,
}: {
  geotiffs: GeotiffEntry[];
  groupCount: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(`Mosaic ${groupCount + 1}`);
  const [checked, setChecked] = useState<Set<string>>(new Set(geotiffs.slice(0, 2).map((entry) => entry.handle)));
  const canCreate = name.trim().length > 0 && checked.size >= 2;

  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" aria-labelledby="geotiff-batch-title">
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <div className={styles.dialogFile}>
            <span className={styles.formatChip}>GeoTIFF</span>
            <span id="geotiff-batch-title" className={styles.dialogFileName}>
              Create mosaic group
            </span>
          </div>
          <div className={styles.dialogMeta}>Select two or more ungrouped GeoTIFFs.</div>
        </div>
        <div className={styles.dialogSection}>
          <label className={styles.dialogSectionTitle} htmlFor="geotiff-group-name">
            Group name
          </label>
          <input
            id="geotiff-group-name"
            className={styles.textCtl}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.dialogSection}>
          <div className={styles.dialogSectionTitle}>Ungrouped GeoTIFFs</div>
          {geotiffs.length < 2 ? (
            <div className={styles.historyEmpty}>Need at least two ungrouped GeoTIFFs.</div>
          ) : (
            <div className={styles.batchList}>
              {geotiffs.map((entry) => (
                <label key={entry.handle} className={styles.batchItem}>
                  <input
                    type="checkbox"
                    checked={checked.has(entry.handle)}
                    onChange={(ev) => {
                      setChecked((current) => {
                        const next = new Set(current);
                        if (ev.target.checked) next.add(entry.handle);
                        else next.delete(entry.handle);
                        return next;
                      });
                    }}
                  />
                  <span className={styles.layerName}>{entry.name}</span>
                  <span className={styles.listRowMeta}>
                    {entry.width.toLocaleString()} x {entry.height.toLocaleString()}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={!canCreate}
            onClick={() => {
              if (!canCreate) return;
              createGeotiffGroup(name.trim(), [...checked]);
              onClose();
            }}
          >
            Create group
          </button>
        </div>
      </div>
    </div>
  );
}
