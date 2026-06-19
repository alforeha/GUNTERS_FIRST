import { useAppStore, type PointCloudEntry } from '../../state/store';
import {
  setPointCloudVisible,
  setPointCloudPointSize,
  setPointCloudDensity,
  setPointCloudDisplayMode,
  setPointCloudGeotiffSource,
  setPointCloudClassFilter,
  setPointCloudReturnFilter,
  removePointCloud,
} from '../importController';
import { classLabel } from '../../viewer/pointCloudLod';
import { formatBytes, DISPLAY_MODE_LABELS } from './shared';
import { RowShell } from './RowShell';
import styles from '../App.module.css';

export function PointCloudRow({ entry, isExpanded, onToggle }: { entry: PointCloudEntry; isExpanded: boolean; onToggle: () => void }) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const geotiffs = useAppStore((s) => s.geotiffs);
  const hasGeotiff = geotiffs.length > 0;

  return (
    <RowShell className={styles.listRow} style={{ cursor: 'default' }} onToggle={onToggle}>
      <div className={styles.listRowTop}>
        <div className={styles.listRowName}>{entry.name}</div>
        <span className={styles.dxfIcon}>LAS</span>
        <span className={styles.listRowMeta}>
          {entry.pointCount.toLocaleString()} pts · {formatBytes(entry.sizeBytes)}
        </span>
        <button
          type="button"
          className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
          title={entry.visible ? 'Hide point cloud' : 'Show point cloud'}
          onClick={() => setPointCloudVisible(entry.handle, !entry.visible)}
        >
          Eye
        </button>
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
          aria-label="Remove point cloud"
          onClick={() => {
            if (window.confirm(`Remove "${entry.name}" from the scene?`)) removePointCloud(entry.handle);
          }}
        >
          x
        </button>
      </div>

      {isExpanded && (
        <div className={styles.rowExpand}>
          <div className={styles.listRowMeta}>
            LAS {entry.lasVersion} · format {entry.pointFormat}
            {entry.pointDensityPerSqFt !== null ? ` · ${entry.pointDensityPerSqFt.toFixed(1)} pts/sq ft` : ''}
          </div>
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Point size</span>
            <input
              type="range"
              min={1}
              max={5}
              step={0.5}
              title="Point cloud point size"
              value={entry.pointSize}
              onChange={(ev) => setPointCloudPointSize(entry.handle, Number(ev.target.value))}
            />
            <span className={styles.listRowMeta}>{entry.pointSize}px</span>
          </div>
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Density</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              title="Rendered point density"
              value={entry.density}
              onChange={(ev) => setPointCloudDensity(entry.handle, Number(ev.target.value))}
            />
            <span className={styles.listRowMeta}>{entry.density}%</span>
          </div>
          <div className={styles.listRowMeta}>
            X {entry.bounds.minX.toFixed(3)} to {entry.bounds.maxX.toFixed(3)} · Y {entry.bounds.minY.toFixed(3)} to{' '}
            {entry.bounds.maxY.toFixed(3)} · Z {entry.bounds.minZ.toFixed(3)} to {entry.bounds.maxZ.toFixed(3)}
          </div>

          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Display</span>
            <div className={styles.segmented}>
              {DISPLAY_MODE_LABELS.map(({ mode, label }) => {
                const disabled =
                  (mode === 'rgb' && !entry.hasRgb) || (mode === 'geotiff' && !hasGeotiff);
                const active = entry.displayMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    className={`${styles.segmentedBtn} ${active ? styles.segmentedBtnActive : ''}`}
                    style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                    disabled={disabled}
                    title={
                      mode === 'geotiff' && !hasGeotiff
                        ? 'Load a GeoTIFF to enable GeoTIFF color'
                        : mode === 'rgb' && !entry.hasRgb
                          ? 'No RGB in this file'
                          : `Color by ${label}`
                    }
                    onClick={() => setPointCloudDisplayMode(entry.handle, mode)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {entry.displayMode === 'geotiff' && geotiffs.length > 1 && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Sample from</span>
              <select
                value={entry.geotiffSource ?? geotiffs[0]?.handle ?? ''}
                onChange={(ev) => setPointCloudGeotiffSource(entry.handle, ev.target.value || null)}
              >
                {geotiffs.map((g) => (
                  <option key={g.handle} value={g.handle}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {entry.presentClasses.length > 0 && (
            <div className={styles.rowExpand}>
              <div className={styles.elemRowLabel}>Classification</div>
              {entry.presentClasses.map((code) => {
                const on = entry.classFilter[code] !== false;
                return (
                  <button
                    key={code}
                    type="button"
                    className={`${styles.elemChip} ${on ? '' : styles.elemChipOff}`}
                    title={`${on ? 'Hide' : 'Show'} ${classLabel(code)}`}
                    onClick={() => setPointCloudClassFilter(entry.handle, code, !on)}
                  >
                    {classLabel(code)}
                  </button>
                );
              })}
            </div>
          )}

          <div className={styles.rowExpand}>
            <div className={styles.elemRowLabel}>Returns</div>
            {entry.multiReturn ? (
              (['first', 'last', 'intermediate'] as const).map((key) => {
                const on = entry.returnsFilter[key];
                const label = key === 'first' ? 'First return' : key === 'last' ? 'Last return' : 'Intermediate';
                return (
                  <button
                    key={key}
                    type="button"
                    className={`${styles.elemChip} ${on ? '' : styles.elemChipOff}`}
                    title={`${on ? 'Hide' : 'Show'} ${label}`}
                    onClick={() => setPointCloudReturnFilter(entry.handle, key, !on)}
                  >
                    {label}
                  </button>
                );
              })
            ) : (
              <span className={styles.listRowMeta} style={{ opacity: 0.5 }}>
                Single return only
              </span>
            )}
          </div>
        </div>
      )}
    </RowShell>
  );
}
