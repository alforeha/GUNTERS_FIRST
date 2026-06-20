import { useAppStore } from '../../state/store';
import {
  dissolveGeotiffGroup,
  redrapeDxf,
  removeDxf,
  removeGeotiff,
  setDxfVisible,
  setGeotiffGroupOpacity,
  setGeotiffGroupTarget,
  setGeotiffGroupVisible,
  setGeotiffOpacity,
  setGeotiffTarget,
  setGeotiffVisible,
} from '../importController';
import styles from '../App.module.css';

export function DrapeSection({ onOpenImport }: { onOpenImport: () => void }) {
  const surfaces = useAppStore((s) => s.surfaces);
  const dxfs = useAppStore((s) => s.dxfs);
  const geotiffs = useAppStore((s) => s.geotiffs);
  const geotiffGroups = useAppStore((s) => s.geotiffGroups);
  const groupedHandles = new Set(geotiffGroups.flatMap((group) => group.handles));
  const dxfRows = dxfs.filter((entry) => entry.drapeTarget !== null);
  const geotiffRows = geotiffs.filter((entry) => !groupedHandles.has(entry.handle));
  const hasRows = dxfRows.length > 0 || geotiffGroups.length > 0 || geotiffRows.length > 0;

  return (
    <div className={styles.section}>
      <h2 className={styles.panelTitle}>Drape</h2>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={onOpenImport}
      >
        Add drape layer
      </button>
      <div className={styles.drapeList}>
        {!hasRows ? (
          <div className={styles.historyEmpty}>No draped datasets yet.</div>
        ) : (
          <>
            {dxfRows.map((entry) => (
            <div key={entry.handle} className={styles.listRow}>
              <div className={styles.drapeFlatRow}>
                <div className={styles.datasetRowTitleWrap}>
                  <div className={styles.listRowName}>{entry.name}</div>
                  <div className={styles.listRowMeta}>DXF</div>
                </div>
                <button
                  type="button"
                  className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
                  title={entry.visible ? 'Hide dataset' : 'Show dataset'}
                  onClick={() => setDxfVisible(entry.handle, !entry.visible)}
                >
                  Eye
                </button>
                <select
                  className={styles.selectCtl}
                  value={entry.drapeTarget ?? ''}
                  onChange={(ev) => redrapeDxf(entry.handle, ev.target.value || null)}
                >
                  {surfaces.map((surface) => (
                    <option key={surface.handle} value={surface.handle}>
                      {surface.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Remove drape dataset"
                  onClick={() => {
                    if (window.confirm(`Remove "${entry.name}" from the scene?`)) {
                      removeDxf(entry.handle);
                    }
                  }}
                >
                  x
                </button>
              </div>
            </div>
            ))}
            {geotiffGroups.map((group) => (
              <div key={group.id} className={styles.listRow}>
                <div className={styles.drapeFlatRow}>
                  <div className={styles.datasetRowTitleWrap}>
                    <div className={styles.listRowName}>{group.name}</div>
                    <div className={styles.listRowMeta}>{group.handles.length} GeoTIFFs</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.elemChip} ${group.visible ? '' : styles.elemChipOff}`}
                    title={group.visible ? 'Hide group' : 'Show group'}
                    onClick={() => setGeotiffGroupVisible(group.id, !group.visible)}
                  >
                    Eye
                  </button>
                  <select
                    className={styles.selectCtl}
                    value={group.drapeTarget ?? ''}
                    onChange={(ev) => setGeotiffGroupTarget(group.id, ev.target.value || null)}
                  >
                    <option value="">- no target -</option>
                    {surfaces.map((surface) => (
                      <option key={surface.handle} value={surface.handle}>
                        {surface.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={group.opacity}
                    title="GeoTIFF group opacity"
                    onChange={(ev) => setGeotiffGroupOpacity(group.id, Number(ev.target.value))}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Remove group"
                    onClick={() => dissolveGeotiffGroup(group.id)}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
            {geotiffRows.map((entry) => (
              <div key={entry.handle} className={styles.listRow}>
                <div className={styles.drapeFlatRow}>
                  <div className={styles.datasetRowTitleWrap}>
                    <div className={styles.listRowName}>{entry.name}</div>
                    <div className={styles.listRowMeta}>GeoTIFF</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
                    title={entry.visible ? 'Hide dataset' : 'Show dataset'}
                    onClick={() => setGeotiffVisible(entry.handle, !entry.visible)}
                  >
                    Eye
                  </button>
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
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={entry.opacity}
                    title="GeoTIFF opacity"
                    onChange={(ev) => setGeotiffOpacity(entry.handle, Number(ev.target.value))}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Remove drape dataset"
                    onClick={() => {
                      if (window.confirm(`Remove "${entry.name}" from the scene?`)) removeGeotiff(entry.handle);
                    }}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
