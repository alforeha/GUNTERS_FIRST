import { useState } from 'react';
import {
  useAppStore,
  type GeotiffEntry,
} from '../../state/store';
import {
  setGeotiffVisible,
  setGeotiffTarget,
  setGeotiffOpacity,
  removeGeotiff,
} from '../importController';
import { formatBytes } from './shared';
import styles from '../App.module.css';

export function GeotiffRow({
  entry,
  surfaces,
  groupName,
  memberRow = false,
}: {
  entry: GeotiffEntry;
  surfaces: { handle: string; name: string }[];
  groupName?: string;
  memberRow?: boolean;
}) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const [expanded, setExpanded] = useState(false);
  const targetName = surfaces.find((surface) => surface.handle === entry.drapeTarget)?.name;

  return (
    <div className={`${styles.listRow} ${memberRow ? styles.groupMemberRow : ''}`} style={{ cursor: 'default' }}>
      <div className={styles.listRowTop}>
        <div className={styles.listRowName}>{entry.name}</div>
        <span className={styles.dxfIcon}>{groupName ?? 'TIF'}</span>
        <span className={styles.listRowMeta}>
          {entry.width.toLocaleString()} x {entry.height.toLocaleString()} · {formatBytes(entry.sizeBytes)}
        </span>
        {!memberRow && (
          <button
            type="button"
            className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
            title={entry.visible ? 'Hide GeoTIFF' : 'Show GeoTIFF'}
            onClick={() => setGeotiffVisible(entry.handle, !entry.visible)}
          >
            Eye
          </button>
        )}
        {importNotes[entry.handle] && (
          <button
            type="button"
            className={styles.iconBtn}
            title="Import notes"
            aria-label="Import notes"
            onClick={() => setNotesHandle(entry.handle)}
          >
            i
          </button>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          title="Remove"
          aria-label="Remove GeoTIFF"
          onClick={() => {
            if (window.confirm(`Remove "${entry.name}" from the scene?`)) removeGeotiff(entry.handle);
          }}
        >
          x
        </button>
        {!memberRow && (
          <button
            type="button"
            className={styles.iconBtn}
            title={expanded ? 'Collapse' : 'Metadata'}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '^' : 'v'}
          </button>
        )}
      </div>

      {(expanded || memberRow) && (
        <div className={styles.rowExpand}>
          <div className={styles.listRowMeta}>
            {entry.samplesPerPixel} bands
            {entry.crsText ? ` · ${entry.crsText}` : ' · no CRS text found'}
          </div>
          <div className={styles.listRowMeta}>
            {entry.pixelScale
              ? `resolution ${Math.abs(entry.pixelScale[0]).toFixed(6)} x ${Math.abs(entry.pixelScale[1]).toFixed(6)}`
              : 'no georeference found'}
            {targetName ? ` · target ${targetName}` : ''}
          </div>
          {!memberRow && surfaces.length > 0 && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Drape onto</span>
              <select
                className={styles.selectCtl}
                value={entry.drapeTarget ?? ''}
                onChange={(ev) => setGeotiffTarget(entry.handle, ev.target.value || null)}
              >
                <option value="">- no target -</option>
                {surfaces.map((surface) => (
                  <option key={surface.handle} value={surface.handle}>
                    {surface.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!memberRow && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Opacity</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                title="GeoTIFF opacity"
                value={entry.opacity}
                onChange={(ev) => setGeotiffOpacity(entry.handle, Number(ev.target.value))}
              />
            </div>
          )}
          {entry.worldBounds && (
            <div className={styles.listRowMeta}>
              X {entry.worldBounds.minX.toFixed(3)} to {entry.worldBounds.maxX.toFixed(3)} · Y{' '}
              {entry.worldBounds.minY.toFixed(3)} to {entry.worldBounds.maxY.toFixed(3)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
