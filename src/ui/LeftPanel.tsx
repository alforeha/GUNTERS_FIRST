import { useRef, useState } from 'react';
import { useAppStore, type PdfSheetEntry } from '../state/store';
import { enqueueFiles } from './importController';
import { DatasetSection } from './left-panel/DatasetSection';
import { TopSection } from './left-panel/TopSection';
import { SurfaceMasterBar } from './left-panel/SurfaceMasterBar';
import { SurfaceRow } from './left-panel/SurfaceRow';
import { DxfMasterBar } from './left-panel/DxfMasterBar';
import { DxfRow } from './left-panel/DxfRow';
import { GeotiffGroupRow } from './left-panel/GeotiffGroupRow';
import { GeotiffRow } from './left-panel/GeotiffRow';
import { PdfGroupRow } from './left-panel/PdfGroupRow';
import { PdfSheetRow } from './left-panel/PdfSheetRow';
import { PointCloudRow } from './left-panel/PointCloudRow';
import { GeotiffBatchModal } from './left-panel/modals/GeotiffBatchModal';
import { PdfGroupModal } from './left-panel/modals/PdfGroupModal';
import styles from './App.module.css';

const ACCEPT = '.xml,.landxml,.dxf,.dwg,.tin,.tif,.tiff,.geotiff,.tfw,.pdf,.las';

export function LeftPanel({ sizeClass }: { sizeClass: string }) {
  const open = useAppStore((s) => s.leftOpen);
  const toggleLeft = useAppStore((s) => s.toggleLeft);
  const surfaces = useAppStore((s) => s.surfaces);
  const dxfs = useAppStore((s) => s.dxfs);
  const geotiffs = useAppStore((s) => s.geotiffs);
  const geotiffGroups = useAppStore((s) => s.geotiffGroups);
  const pdfSheets = useAppStore((s) => s.pdfSheets);
  const pdfGroups = useAppStore((s) => s.pdfGroups);
  const pointClouds = useAppStore((s) => s.pointClouds);
  const [batchOpen, setBatchOpen] = useState(false);
  const [pdfGroupOpen, setPdfGroupOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const groupedHandles = new Set(geotiffGroups.flatMap((group) => group.handles));
  const ungroupedGeotiffs = geotiffs.filter((entry) => !groupedHandles.has(entry.handle));
  const groupedPdfSheets = new Set(pdfGroups.flatMap((group) => group.sheetIds));
  const ungroupedPdfSheets = pdfSheets.filter((entry) => !groupedPdfSheets.has(entry.handle));

  return (
    <aside
      className={`${styles.panel} ${styles.panelLeft} ${open ? sizeClass : styles.panelCollapsed}`}
    >
      <div className={styles.panelHeaderRow}>
        <h2 className={styles.panelTitle}>Display Control Center</h2>
        <button type="button" className={styles.chevronBtn} onClick={toggleLeft} title="Collapse panel">
          {'<'}
        </button>
      </div>
      <div className={styles.panelInner}>
        <TopSection onOpenClick={() => inputRef.current?.click()} />
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(ev) => {
            const files = ev.target.files;
            if (files && files.length > 0) enqueueFiles(files);
            ev.target.value = '';
          }}
        />

        {surfaces.length === 0 && dxfs.length === 0 && geotiffs.length === 0 && pdfSheets.length === 0 && pointClouds.length === 0 ? (
          <p className={styles.dimNote}>Nothing loaded yet.</p>
        ) : (
          <>
            {surfaces.length > 0 && (
              <DatasetSection title="Surfaces">
                <SurfaceMasterBar />
                {surfaces.map((entry) => (
                  <SurfaceRow key={entry.handle} entry={entry} />
                ))}
              </DatasetSection>
            )}
            {dxfs.length > 0 && (
              <DatasetSection title="DXF Files">
                <DxfMasterBar />
                {dxfs.map((entry) => (
                  <DxfRow
                    key={entry.handle}
                    entry={entry}
                    surfaces={surfaces.map((surface) => ({ handle: surface.handle, name: surface.name }))}
                  />
                ))}
              </DatasetSection>
            )}
            {geotiffs.length > 0 && (
              <DatasetSection
                title="GeoTIFFs"
                action={
                  geotiffs.length >= 2 ? (
                    <button type="button" className={styles.sectionActionBtn} onClick={() => setBatchOpen(true)}>
                      Batch
                    </button>
                  ) : null
                }
              >
                {geotiffGroups.map((group) => (
                  <GeotiffGroupRow
                    key={group.id}
                    group={group}
                    entries={geotiffs.filter((entry) => group.handles.includes(entry.handle))}
                    surfaces={surfaces.map((surface) => ({ handle: surface.handle, name: surface.name }))}
                  />
                ))}
                {ungroupedGeotiffs.map((entry) => (
                  <GeotiffRow
                    key={entry.handle}
                    entry={entry}
                    surfaces={surfaces.map((surface) => ({ handle: surface.handle, name: surface.name }))}
                  />
                ))}
              </DatasetSection>
            )}
            {pdfSheets.length > 0 && (
              <DatasetSection
                title="PDFs"
                action={
                  ungroupedPdfSheets.length >= 2 ? (
                    <button type="button" className={styles.sectionActionBtn} onClick={() => setPdfGroupOpen(true)}>
                      Group
                    </button>
                  ) : null
                }
              >
                {pdfGroups.map((group) => (
                  <PdfGroupRow
                    key={group.id}
                    group={group}
                    entries={group.sheetIds
                      .map((id) => pdfSheets.find((entry) => entry.handle === id))
                      .filter((entry): entry is PdfSheetEntry => !!entry)}
                  />
                ))}
                {ungroupedPdfSheets.map((entry) => (
                  <PdfSheetRow key={entry.handle} entry={entry} />
                ))}
              </DatasetSection>
            )}
            {pointClouds.length > 0 && (
              <DatasetSection title="Point Clouds">
                {pointClouds.map((entry) => (
                  <PointCloudRow key={entry.handle} entry={entry} />
                ))}
              </DatasetSection>
            )}
          </>
        )}
      </div>
      {batchOpen && (
        <GeotiffBatchModal
          geotiffs={ungroupedGeotiffs}
          groupCount={geotiffGroups.length}
          onClose={() => setBatchOpen(false)}
        />
      )}
      {pdfGroupOpen && (
        <PdfGroupModal
          sheets={ungroupedPdfSheets}
          groupCount={pdfGroups.length}
          onClose={() => setPdfGroupOpen(false)}
        />
      )}
    </aside>
  );
}
