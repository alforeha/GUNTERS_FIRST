import { useEffect, useMemo, useRef, useState } from 'react';
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
const PDF_TYPE_COLOR = '#d4380d';

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
  const [expandedHandle, setExpandedHandle] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const groupedHandles = new Set(geotiffGroups.flatMap((group) => group.handles));
  const ungroupedGeotiffs = geotiffs.filter((entry) => !groupedHandles.has(entry.handle));
  const groupedPdfSheets = new Set(pdfGroups.flatMap((group) => group.sheetIds));
  const ungroupedPdfSheets = pdfSheets.filter((entry) => !groupedPdfSheets.has(entry.handle));

  const ungroupedPdfDocs = new Map<string, PdfSheetEntry[]>();
  for (const sheet of ungroupedPdfSheets) {
    const list = ungroupedPdfDocs.get(sheet.fileId);
    if (list) list.push(sheet);
    else ungroupedPdfDocs.set(sheet.fileId, [sheet]);
  }

  const toggleExpand = (handle: string) => {
    setExpandedHandle((prev) => (prev === handle ? null : handle));
  };

  const anyExpanded = expandedHandle !== null;

  const surfaceHandles = new Set(surfaces.map((s) => s.handle));
  const dxfHandles = new Set(dxfs.map((d) => d.handle));
  const geotiffGroupHandles = new Set(geotiffGroups.map((g) => g.id));
  const geotiffHandles = new Set(ungroupedGeotiffs.map((g) => g.handle));
  const pdfGroupHandles = new Set(pdfGroups.map((g) => g.id));
  const pdfDocHandles = new Set([...ungroupedPdfDocs.values()].map((pages) => pages[0]!.handle));
  const pointCloudHandles = new Set(pointClouds.map((p) => p.handle));

  const surfaceSectionExpanded = anyExpanded && surfaceHandles.has(expandedHandle!);
  const dxfSectionExpanded = anyExpanded && dxfHandles.has(expandedHandle!);
  const geotiffSectionExpanded = anyExpanded && (geotiffGroupHandles.has(expandedHandle!) || geotiffHandles.has(expandedHandle!));
  const pdfSectionExpanded = anyExpanded && (pdfGroupHandles.has(expandedHandle!) || pdfDocHandles.has(expandedHandle!));
  const pointCloudSectionExpanded = anyExpanded && pointCloudHandles.has(expandedHandle!);

  const allValidExpandedHandles = useMemo(() => {
    const set = new Set<string>();
    for (const s of surfaces) set.add(s.handle);
    for (const d of dxfs) set.add(d.handle);
    for (const g of geotiffGroups) set.add(g.id);
    const geoGrouped = new Set(geotiffGroups.flatMap((g) => g.handles));
    for (const g of geotiffs) {
      if (!geoGrouped.has(g.handle)) set.add(g.handle);
    }
    for (const g of pdfGroups) set.add(g.id);
    const pdfGrouped = new Set(pdfGroups.flatMap((g) => g.sheetIds));
    const seenPdfFiles = new Set<string>();
    for (const s of pdfSheets) {
      if (!pdfGrouped.has(s.handle) && !seenPdfFiles.has(s.fileId)) {
        set.add(s.handle);
        seenPdfFiles.add(s.fileId);
      }
    }
    for (const p of pointClouds) set.add(p.handle);
    return set;
  }, [surfaces, dxfs, geotiffGroups, geotiffs, pdfGroups, pdfSheets, pointClouds]);

  useEffect(() => {
    if (expandedHandle !== null && !allValidExpandedHandles.has(expandedHandle)) {
      setExpandedHandle(null);
    }
  }, [expandedHandle, allValidExpandedHandles]);

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
              <div style={anyExpanded && !surfaceSectionExpanded ? { display: 'none' } : undefined}>
                <DatasetSection
                  title="Surfaces"
                  sectionExpanded={surfaceSectionExpanded}
                  onSectionCollapse={() => setExpandedHandle(null)}
                >
                  <div style={anyExpanded ? { display: 'none' } : undefined}>
                    <SurfaceMasterBar />
                  </div>
                  {surfaces.map((entry) => (
                    <div key={entry.handle} style={anyExpanded && expandedHandle !== entry.handle ? { display: 'none' } : undefined}>
                      <SurfaceRow
                        entry={entry}
                        isExpanded={expandedHandle === entry.handle}
                        onToggle={() => toggleExpand(entry.handle)}
                      />
                    </div>
                  ))}
                </DatasetSection>
              </div>
            )}
            {dxfs.length > 0 && (
              <div style={anyExpanded && !dxfSectionExpanded ? { display: 'none' } : undefined}>
                <DatasetSection
                  title="DXF Files"
                  sectionExpanded={dxfSectionExpanded}
                  onSectionCollapse={() => setExpandedHandle(null)}
                >
                  <div style={anyExpanded ? { display: 'none' } : undefined}>
                    <DxfMasterBar />
                  </div>
                  {dxfs.map((entry) => (
                    <div key={entry.handle} style={anyExpanded && expandedHandle !== entry.handle ? { display: 'none' } : undefined}>
                      <DxfRow
                        entry={entry}
                        surfaces={surfaces.map((surface) => ({ handle: surface.handle, name: surface.name }))}
                        isExpanded={expandedHandle === entry.handle}
                        onToggle={() => toggleExpand(entry.handle)}
                      />
                    </div>
                  ))}
                </DatasetSection>
              </div>
            )}
            {geotiffs.length > 0 && (
              <div style={anyExpanded && !geotiffSectionExpanded ? { display: 'none' } : undefined}>
                <DatasetSection
                  title="GeoTIFFs"
                  action={
                  geotiffs.length >= 2 ? (
                    <button type="button" className={styles.sectionActionBtn} onClick={() => setBatchOpen(true)}>
                      Batch
                    </button>
                  ) : null
                }
                sectionExpanded={geotiffSectionExpanded}
                onSectionCollapse={() => setExpandedHandle(null)}
              >
                {geotiffGroups.map((group) => (
                  <div key={group.id} style={anyExpanded && expandedHandle !== group.id ? { display: 'none' } : undefined}>
                    <GeotiffGroupRow
                      group={group}
                      entries={geotiffs.filter((entry) => group.handles.includes(entry.handle))}
                      surfaces={surfaces.map((surface) => ({ handle: surface.handle, name: surface.name }))}
                      isExpanded={expandedHandle === group.id}
                      onToggle={() => toggleExpand(group.id)}
                    />
                  </div>
                ))}
                {ungroupedGeotiffs.map((entry) => (
                  <div key={entry.handle} style={anyExpanded && expandedHandle !== entry.handle ? { display: 'none' } : undefined}>
                    <GeotiffRow
                      entry={entry}
                      surfaces={surfaces.map((surface) => ({ handle: surface.handle, name: surface.name }))}
                      isExpanded={expandedHandle === entry.handle}
                      onToggle={() => toggleExpand(entry.handle)}
                    />
                  </div>
                ))}
              </DatasetSection>
              </div>
            )}
            {pdfSheets.length > 0 && (
              <div style={anyExpanded && !pdfSectionExpanded ? { display: 'none' } : undefined}>
                <DatasetSection
                  title="PDFs"
                  action={
                  ungroupedPdfSheets.length >= 2 ? (
                    <button type="button" className={styles.sectionActionBtn} onClick={() => setPdfGroupOpen(true)}>
                      Group
                    </button>
                  ) : null
                }
                sectionExpanded={pdfSectionExpanded}
                onSectionCollapse={() => setExpandedHandle(null)}
                sectionColor={PDF_TYPE_COLOR}
              >
                {pdfGroups.map((group) => (
                  <div key={group.id} style={anyExpanded && expandedHandle !== group.id ? { display: 'none' } : undefined}>
                    <PdfGroupRow
                      group={group}
                      entries={group.sheetIds
                        .map((id) => pdfSheets.find((entry) => entry.handle === id))
                        .filter((entry): entry is PdfSheetEntry => !!entry)}
                      isExpanded={expandedHandle === group.id}
                      onToggle={() => toggleExpand(group.id)}
                      sectionColor={PDF_TYPE_COLOR}
                    />
                  </div>
                ))}
                {[...ungroupedPdfDocs.values()].map((pages) => {
                  const docHandle = pages[0]!.handle;
                  return (
                    <div key={docHandle} style={anyExpanded && expandedHandle !== docHandle ? { display: 'none' } : undefined}>
                      <PdfSheetRow
                        entry={pages[0]!}
                        pages={pages}
                        isExpanded={expandedHandle === docHandle}
                        onToggle={() => toggleExpand(docHandle)}
                        sectionColor={PDF_TYPE_COLOR}
                        surfaces={surfaces.map((s) => ({ handle: s.handle, name: s.name }))}
                      />
                    </div>
                  );
                })}
              </DatasetSection>
              </div>
            )}
            {pointClouds.length > 0 && (
              <div style={anyExpanded && !pointCloudSectionExpanded ? { display: 'none' } : undefined}>
                <DatasetSection
                  title="Point Clouds"
                  sectionExpanded={pointCloudSectionExpanded}
                  onSectionCollapse={() => setExpandedHandle(null)}
                >
                  {pointClouds.map((entry) => (
                    <div key={entry.handle} style={anyExpanded && expandedHandle !== entry.handle ? { display: 'none' } : undefined}>
                      <PointCloudRow
                        entry={entry}
                        isExpanded={expandedHandle === entry.handle}
                        onToggle={() => toggleExpand(entry.handle)}
                      />
                    </div>
                  ))}
                </DatasetSection>
              </div>
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
