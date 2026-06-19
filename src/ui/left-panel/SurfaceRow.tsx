import {
  useAppStore,
  type ElementKind,
  type SurfaceEntry,
} from '../../state/store';
import {
  patchSurfaceElement,
  setActiveSurface,
  setSurfaceVisible,
  setSurfaceLabelContent,
  setSurfaceMute,
  removeSurface,
} from '../importController';
import { formatBytes, ELEMENT_META } from './shared';
import { RowShell } from './RowShell';
import styles from '../App.module.css';

export function SurfaceRow({ entry, isExpanded, onToggle }: { entry: SurfaceEntry; isExpanded: boolean; onToggle: () => void }) {
  const activeHandle = useAppStore((s) => s.activeHandle);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);

  const active = entry.handle === activeHandle;
  const d = entry.display;

  const elementAvailable = (kind: ElementKind): boolean => {
    if (kind === 'faces' || kind === 'edges') return entry.hasFaces;
    if (kind === 'breaklines') return entry.breaklines > 0;
    if (kind === 'boundary') return entry.hasFaces || entry.boundariesDefined > 0;
    return true;
  };

  return (
    <RowShell
      className={`${styles.listRow} ${active ? styles.listRowActive : ''}`}
      onToggle={onToggle}
      onRowClick={() => {
        if (!editSurfaceHandle || editSurfaceHandle === entry.handle) setActiveSurface(entry.handle);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(ev) => {
        if ((ev.key === 'Enter' || ev.key === ' ') && (!editSurfaceHandle || editSurfaceHandle === entry.handle)) {
          setActiveSurface(entry.handle);
        }
      }}
    >
      <div className={styles.listRowTop}>
        <div className={styles.listRowName}>{entry.name}</div>
        <span className={styles.listRowMeta}>
          {entry.points.toLocaleString()} pts · {entry.faces.toLocaleString()} faces · {formatBytes(entry.sizeBytes)}
        </span>
        {importNotes[entry.handle] && (
          <button
            type="button"
            className={styles.iconBtn}
            title="Import notes"
            aria-label="Import notes"
            onClick={(ev) => {
              ev.stopPropagation();
              setNotesHandle(entry.handle);
            }}
          >
            i
          </button>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          title="Remove"
          aria-label="Remove surface"
          onClick={(ev) => {
            ev.stopPropagation();
            if (window.confirm(`Remove "${entry.name}" from the scene?`)) removeSurface(entry.handle);
          }}
        >
          x
        </button>
      </div>

      <div className={styles.listRowIcons} onClick={(ev) => ev.stopPropagation()}>
        <button
          type="button"
          className={`${styles.elemChip} ${d.visible ? '' : styles.elemChipOff}`}
          title={d.visible ? 'Hide surface' : 'Show surface'}
          onClick={() => setSurfaceVisible(entry.handle, !d.visible)}
        >
          Eye
        </button>
        {ELEMENT_META.map(({ kind, chip, label }) =>
          elementAvailable(kind) ? (
            <button
              key={kind}
              type="button"
              className={`${styles.elemChip} ${d[kind].on ? '' : styles.elemChipOff}`}
              title={`${label} ${d[kind].on ? 'on' : 'off'}`}
              onClick={() => patchSurfaceElement(entry.handle, kind, { on: !d[kind].on })}
            >
              {chip}
            </button>
          ) : null,
        )}
        <input
          type="color"
          className={styles.miniSwatch}
          title="Surface color"
          value={d.faces.color}
          onChange={(ev) => patchSurfaceElement(entry.handle, 'faces', { color: ev.target.value })}
        />
      </div>

      {isExpanded && (
        <div className={styles.rowExpand} onClick={(ev) => ev.stopPropagation()}>
          {ELEMENT_META.filter(({ kind }) => elementAvailable(kind)).map(({ kind, label }) => (
            <div key={kind} className={styles.elemRow}>
              <span className={styles.elemRowLabel}>{label}</span>
              <input
                type="color"
                className={styles.miniSwatch}
                title={`${label} color`}
                value={d[kind].color}
                onChange={(ev) => patchSurfaceElement(entry.handle, kind, { color: ev.target.value })}
              />
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                title={`${label} opacity`}
                value={d[kind].opacity}
                onChange={(ev) =>
                  patchSurfaceElement(entry.handle, kind, { opacity: Number(ev.target.value) })
                }
              />
            </div>
          ))}
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Vertex size</span>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              title="Vertex display size (px)"
              value={d.vertices.size}
              onChange={(ev) =>
                patchSurfaceElement(entry.handle, 'vertices', { size: Number(ev.target.value) })
              }
            />
            <span className={styles.listRowMeta}>{d.vertices.size}px</span>
          </div>
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Label text</span>
            <span className={styles.segmented}>
              {(
                [
                  ['z', 'Z'],
                  ['nez', 'N, E, Z'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.segmentedBtn} ${d.labelContent === value ? styles.segmentedBtnActive : ''}`}
                  title={value === 'z' ? 'Elevation only' : 'Northing, Easting, Elevation'}
                  onClick={() => setSurfaceLabelContent(entry.handle, value)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
          {entry.holes !== null && entry.holes > 0 && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Boundary</span>
              <span className={styles.listRowMeta}>outer + holes ({entry.holes})</span>
            </div>
          )}
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Mute</span>
            <span className={styles.segmented}>
              {(
                [
                  ['auto', 'Auto'],
                  ['never', 'Never'],
                  ['always', 'Always'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={`${styles.segmentedBtn} ${d.mute === value ? styles.segmentedBtnActive : ''}`}
                  title={
                    value === 'auto'
                      ? 'Muted while another surface is active'
                      : value === 'never'
                        ? 'Always full shading'
                        : 'Always muted (reference)'
                  }
                  onClick={() => setSurfaceMute(entry.handle, value)}
                >
                  {label}
                </button>
              ))}
            </span>
          </div>
        </div>
      )}
    </RowShell>
  );
}
