import { useAppStore } from '../../state/store';
import { setDxfMasterOn, setDxfDensify } from '../importController';
import styles from '../App.module.css';

export function DxfMasterBar() {
  const masterOn = useAppStore((s) => s.dxfMasterOn);
  const densify = useAppStore((s) => s.dxfDensify);

  return (
    <div className={styles.quickBar} title="DXF master toggle - per-layer settings are preserved">
      <span className={styles.quickBarLabel}>All:</span>
      <button
        type="button"
        className={`${styles.elemChip} ${masterOn ? '' : styles.elemChipOff}`}
        title={`All DXF linework - master ${masterOn ? 'on' : 'off'}`}
        onClick={() => setDxfMasterOn(!masterOn)}
      >
        Eye
      </button>
      <span className={styles.rowSpacer} />
      <label className={styles.quickBarLabel} title="Densify segments before draping">
        densify
        <input
          type="number"
          className={styles.numberCtl}
          min={0.5}
          max={100}
          step={0.5}
          value={densify}
          onChange={(ev) => {
            const value = Number(ev.target.value);
            if (Number.isFinite(value) && value > 0) setDxfDensify(value);
          }}
        />
        ft
      </label>
    </div>
  );
}
