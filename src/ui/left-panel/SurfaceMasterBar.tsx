import { useAppStore } from '../../state/store';
import { setMasterGate } from '../importController';
import { ELEMENT_META } from './shared';
import styles from '../App.module.css';

export function SurfaceMasterBar() {
  const surfaces = useAppStore((s) => s.surfaces);
  const masterGates = useAppStore((s) => s.masterGates);
  const anyBreaklines = surfaces.some((surface) => surface.breaklines > 0);

  return (
    <div className={styles.quickBar} title="Master toggles - per-surface settings are preserved">
      <span className={styles.quickBarLabel}>All:</span>
      {ELEMENT_META.filter(({ kind }) => kind !== 'breaklines' || anyBreaklines).map(({ kind, chip, label }) => (
        <button
          key={kind}
          type="button"
          className={`${styles.elemChip} ${masterGates[kind] ? '' : styles.elemChipOff}`}
          title={`${label} - master ${masterGates[kind] ? 'on' : 'off'}`}
          onClick={() => setMasterGate(kind, !masterGates[kind])}
        >
          {chip}
        </button>
      ))}
    </div>
  );
}
