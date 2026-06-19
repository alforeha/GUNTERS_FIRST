import {
  useAppStore,
  type DxfEntry,
} from '../../state/store';
import {
  setDxfVisible,
  removeDxf,
  redrapeDxf,
  patchDxfLayerDisplay,
} from '../importController';
import { formatBytes } from './shared';
import { RowShell } from './RowShell';
import styles from '../App.module.css';

export function DxfRow({
  entry,
  surfaces,
  isExpanded,
  onToggle,
}: {
  entry: DxfEntry;
  surfaces: { handle: string; name: string }[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const targetName = surfaces.find((surface) => surface.handle === entry.drapeTarget)?.name;

  return (
    <RowShell className={styles.listRow} style={{ cursor: 'default' }} onToggle={onToggle}>
      <div className={styles.listRowTop}>
        <span className={styles.dxfIcon}>DXF</span>
        <div className={styles.listRowName}>{entry.name}</div>
        <span className={styles.listRowMeta}>{formatBytes(entry.sizeBytes)}</span>
        <button
          type="button"
          className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
          title={entry.visible ? 'Hide DXF' : 'Show DXF'}
          onClick={() => setDxfVisible(entry.handle, !entry.visible)}
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
          aria-label="Remove DXF"
          onClick={() => {
            if (window.confirm(`Remove "${entry.name}" from the scene?`)) removeDxf(entry.handle);
          }}
        >
          x
        </button>
      </div>

      {isExpanded && (
        <div className={styles.rowExpand}>
          <div className={styles.listRowMeta}>
            {entry.entityCount.toLocaleString()} polylines
            {entry.pointCount > 0 ? ` · ${entry.pointCount} points (not rendered)` : ''}
            {entry.skippedSummary ? ` · skipped: ${entry.skippedSummary}` : ''}
          </div>
          <div className={styles.listRowMeta}>
            {entry.zMode === 'drape' && targetName ? `draped onto ${targetName}` : 'source elevations (no drape)'}
            {entry.offSurfaceCount > 0 ? ` · ${entry.offSurfaceCount.toLocaleString()} vertices off-surface` : ''}
          </div>

          {surfaces.length > 0 && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Drape onto</span>
              <select
                className={styles.selectCtl}
                value={entry.zMode === 'drape' ? (entry.drapeTarget ?? '') : ''}
                onChange={(ev) => redrapeDxf(entry.handle, ev.target.value || null)}
              >
                <option value="">- source elevations -</option>
                {surfaces.map((surface) => (
                  <option key={surface.handle} value={surface.handle}>
                    {surface.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className={styles.layerScroll}>
            {entry.layers.map((layer) => (
              <div key={layer.name} className={styles.layerRow}>
                <input
                  type="checkbox"
                  checked={layer.on}
                  title={`${layer.name} ${layer.on ? 'on' : 'off'}`}
                  onChange={(ev) => patchDxfLayerDisplay(entry.handle, layer.name, { on: ev.target.checked })}
                />
                <span className={styles.layerName} title={layer.name}>
                  {layer.name}
                </span>
                <input
                  type="color"
                  className={styles.miniSwatch}
                  title={`${layer.name} color`}
                  value={layer.color}
                  onChange={(ev) => patchDxfLayerDisplay(entry.handle, layer.name, { color: ev.target.value })}
                />
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  title={`${layer.name} opacity`}
                  value={layer.opacity}
                  onChange={(ev) =>
                    patchDxfLayerDisplay(entry.handle, layer.name, { opacity: Number(ev.target.value) })
                  }
                />
                <span className={styles.layerMeta} title={`linetype ${layer.linetype} · lineweight ${layer.lineweight === -3 ? 'default' : `${layer.lineweight / 100} mm`}`}>
                  {layer.linetype.toLowerCase()} · {layer.lineweight === -3 ? 'def' : `${layer.lineweight / 100}mm`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </RowShell>
  );
}
