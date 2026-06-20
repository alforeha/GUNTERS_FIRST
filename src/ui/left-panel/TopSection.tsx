import { useAppStore } from '../../state/store';
import { setExaggeration, setSun } from '../importController';
import styles from '../App.module.css';

export function TopSection({ onOpenClick }: { onOpenClick: () => void }) {
  const exaggeration = useAppStore((s) => s.exaggeration);
  const sunAzimuth = useAppStore((s) => s.sunAzimuth);
  const sunAltitude = useAppStore((s) => s.sunAltitude);

  return (
    <div className={styles.topSection}>
      <div className={styles.topRow}>
        <button type="button" className={styles.actionBtn} onClick={onOpenClick}>
          Open...
        </button>
      </div>
      <div className={styles.sliderRow}>
        <label className={styles.sliderLabel} title="Vertical exaggeration (Z scale)">
          VE {exaggeration.toFixed(1)}x
          <input
            type="range"
            min={1}
            max={10}
            step={0.5}
            value={exaggeration}
            onChange={(ev) => setExaggeration(Number(ev.target.value))}
          />
        </label>
        <label className={styles.sliderLabel} title="Sun altitude">
          Sun {sunAltitude.toFixed(0)} deg
          <input
            type="range"
            min={5}
            max={85}
            step={1}
            value={sunAltitude}
            onChange={(ev) => setSun(sunAzimuth, Number(ev.target.value))}
          />
        </label>
        <label className={styles.sliderLabel} title="Sun azimuth">
          Az {sunAzimuth.toFixed(0)} deg
          <input
            type="range"
            min={0}
            max={360}
            step={5}
            value={sunAzimuth}
            onChange={(ev) => setSun(Number(ev.target.value), sunAltitude)}
          />
        </label>
      </div>
    </div>
  );
}
