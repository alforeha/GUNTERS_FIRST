import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { enqueueFiles, setActiveSurface } from '../importController';
import { DrapeSection } from './DrapeSubsection';
import { EditSection } from './EditSection';
import { ExportSection } from './ExportSection';
import styles from '../App.module.css';

const DRAPE_ACCEPT = '.dxf,.tif,.tiff,.geotiff,.pdf,.las,.laz';

export function SurfaceView() {
  const surfaces = useAppStore((s) => s.surfaces);
  const activeHandle = useAppStore((s) => s.activeHandle);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const [pillOpen, setPillOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const drapeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pillOpen) return;
    const close = (ev: PointerEvent) => {
      if (!pillRef.current?.contains(ev.target as Node)) setPillOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [pillOpen]);

  const active = surfaces.find((surface) => surface.handle === activeHandle) ?? null;

  return (
    <>
      <div className={styles.pillWrap} ref={pillRef}>
        <button
          type="button"
          className={styles.activePill}
          onClick={() => surfaces.length > 0 && !editSurfaceHandle && setPillOpen((value) => !value)}
          title={editSurfaceHandle ? 'Active surface is locked while editing' : 'Active surface - click to switch'}
        >
          <span className={styles.pillDot} />
          <span className={styles.pillName}>{active ? active.name : 'No active surface'}</span>
          {surfaces.length > 1 && !editSurfaceHandle && <span className={styles.pillCaret}>v</span>}
        </button>
        {pillOpen && (
          <div className={styles.pillDropdown}>
            {surfaces.map((surface) => (
              <button
                key={surface.handle}
                type="button"
                className={`${styles.menuDropdownItem} ${
                  surface.handle === activeHandle ? styles.pillItemActive : ''
                }`}
                onClick={() => {
                  setActiveSurface(surface.handle);
                  setPillOpen(false);
                }}
              >
                {surface.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {surfaces.length > 0 && (
        <>
          <DrapeSection onOpenImport={() => drapeInputRef.current?.click()} />
          <input
            ref={drapeInputRef}
            type="file"
            accept={DRAPE_ACCEPT}
            multiple
            hidden
            onChange={(ev) => {
              const files = ev.target.files;
              if (files && files.length > 0) enqueueFiles(files);
              ev.target.value = '';
            }}
          />
        </>
      )}

      <EditSection />

      <div className={styles.panelFlexSpacer} />

      <ExportSection active={active} />
    </>
  );
}
