import { useRef, useState, type ReactNode } from 'react';
import {
  useAppStore,
  type DxfEntry,
  type ElementKind,
  type GeotiffEntry,
  type GeotiffGroup,
  type PdfGroupEntry,
  type PdfSheetEntry,
  type PointCloudEntry,
  type SurfaceEntry,
} from '../state/store';
import {
  createGeotiffGroup,
  createPdfGroup,
  enqueueFiles,
  patchDxfLayerDisplay,
  patchSurfaceElement,
  redrapeDxf,
  removeDxf,
  removeGeotiff,
  removePdfSheet,
  removePointCloud,
  removeSurface,
  openPdfCalibrationScene,
  openPdfGroupScene,
  openPdfOrientationScene,
  setActiveSurface,
  setDxfDensify,
  setDxfMasterOn,
  setDxfVisible,
  setExaggeration,
  setGeotiffOpacity,
  setGeotiffGroupVisible,
  setGeotiffTarget,
  setGeotiffVisible,
  setMasterGate,
  setPointCloudClassFilter,
  setPointCloudDensity,
  setPointCloudDisplayMode,
  setPointCloudGeotiffSource,
  setPointCloudPointSize,
  setPointCloudReturnFilter,
  setPointCloudVisible,
  setPdfGroupSheetOrder,
  setPdfVisible,
  setNorthArrow,
  setScaleBar,
  setKnownDistance,
  setSun,
  setSurfaceLabelContent,
  setSurfaceMute,
  setSurfaceVisible,
} from './importController';
import { engineHolder } from './engineHolder';
import { classLabel } from '../viewer/pointCloudLod';
import styles from './App.module.css';

const DISPLAY_MODE_LABELS: { mode: PointCloudEntry['displayMode']; label: string }[] = [
  { mode: 'rgb', label: 'RGB' },
  { mode: 'intensity', label: 'Intensity' },
  { mode: 'elevation', label: 'Elevation' },
  { mode: 'geotiff', label: 'GeoTIFF' },
];

const ACCEPT = '.xml,.landxml,.dxf,.dwg,.tin,.tif,.tiff,.geotiff,.tfw,.pdf,.las';

const ELEMENT_META: { kind: ElementKind; chip: string; label: string }[] = [
  { kind: 'faces', chip: 'F', label: 'Faces' },
  { kind: 'edges', chip: 'E', label: 'Edges' },
  { kind: 'breaklines', chip: 'B', label: 'Breaklines' },
  { kind: 'boundary', chip: 'O', label: 'Boundary' },
  { kind: 'vertices', chip: 'V', label: 'Vertices' },
  { kind: 'labels', chip: 'L', label: 'Labels' },
];

function formatBytes(n: number | null): string {
  if (n === null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

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

function PdfGroupRow({ group, entries }: { group: PdfGroupEntry; entries: PdfSheetEntry[] }) {
  const [expanded, setExpanded] = useState(true);
  const visible = entries.some((entry) => entry.visible);
  const moveSheet = (handle: string, dir: 1 | -1): void => {
    const idx = group.sheetIds.indexOf(handle);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= group.sheetIds.length) return;
    const next = [...group.sheetIds];
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setPdfGroupSheetOrder(group.id, next);
  };
  return (
    <div className={styles.listRow}>
      <div className={styles.listRowTop}>
        <button type="button" className={styles.iconBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'v' : '>'}
        </button>
        <div className={styles.listRowName}>{group.label}</div>
        <span className={styles.listRowMeta}>{entries.length} PDFs</span>
        <span className={styles.rowSpacer} />
        <button
          type="button"
          className={`${styles.elemChip} ${visible ? '' : styles.elemChipOff}`}
          title={`${visible ? 'Hide' : 'Show'} group sheets`}
          onClick={() => entries.forEach((entry) => setPdfVisible(entry.handle, !visible))}
        >
          PDF
        </button>
        <button type="button" className={styles.elemChip} title="Open group in PDF Scene" onClick={() => openPdfGroupScene(group.id)}>
          Open
        </button>
      </div>
      {expanded && (
        <div className={styles.rowExpand}>
          {entries.map((entry, index) => (
            <div key={entry.handle} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 6 }}>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Move sheet up"
                  disabled={index === 0}
                  onClick={() => moveSheet(entry.handle, -1)}
                >
                  ^
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Move sheet down"
                  disabled={index === entries.length - 1}
                  onClick={() => moveSheet(entry.handle, 1)}
                >
                  v
                </button>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <PdfSheetRow entry={entry} compact grouped />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PdfSheetRow({ entry, compact = false, grouped = false }: { entry: PdfSheetEntry; compact?: boolean; grouped?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={styles.listRow} style={compact ? { marginLeft: 10 } : undefined}>
      <div className={styles.listRowTop}>
        <button type="button" className={styles.iconBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'v' : '>'}
        </button>
        <div className={styles.listRowName}>{entry.label}</div>
        <span className={styles.listRowMeta}>
          page {entry.pageIndex + 1} · {entry.widthPx150.toLocaleString()} x {entry.heightPx150.toLocaleString()}
        </span>
        <span className={styles.rowSpacer} />
        <button
          type="button"
          className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
          title={entry.visible ? 'Hide PDF' : 'Show PDF'}
          onClick={() => setPdfVisible(entry.handle, !entry.visible)}
        >
          PDF
        </button>
        {!grouped && (
          <button type="button" className={styles.elemChip} title="Open in PDF Scene" onClick={() => openPdfGroupScene(entry.handle)}>
            Open
          </button>
        )}
        <button type="button" className={styles.elemChip} title="Calibrate PDF sheet" onClick={() => openPdfCalibrationScene(entry.handle)}>
          Calibrate
        </button>
        <button type="button" className={styles.elemChip} title="Orient PDF sheet" onClick={() => openPdfOrientationScene(entry.handle)}>
          Orient
        </button>
      </div>
      {expanded && (
        <div className={styles.rowExpand}>
          {!grouped && (
            <button type="button" className={styles.actionBtn} title="Remove PDF" onClick={() => removePdfSheet(entry.handle)}>
              Remove PDF
            </button>
          )}
          <div className={styles.listRowMeta}>Block-outs: {entry.blockOuts.length}</div>
          <div className={styles.listRowMeta}>Markups: {entry.markups.length}</div>
          {entry.northArrow && (
            <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>North arrow</span>
              <button
                type="button"
                className={`${styles.elemChip} ${entry.northArrow.visible ? '' : styles.elemChipOff}`}
                title={entry.northArrow.visible ? 'Hide north arrow' : 'Show north arrow'}
                onClick={() => setNorthArrow(entry.handle, { ...entry.northArrow!, visible: !entry.northArrow!.visible })}
              >
                {entry.northArrow.visible ? 'Visible' : 'Hidden'}
              </button>
              <input
                type="color"
                value={entry.northArrow.color}
                title="North arrow color"
                onChange={(ev) => setNorthArrow(entry.handle, { ...entry.northArrow!, color: ev.target.value })}
                style={{ width: 24, height: 24, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
              />
              <span>{entry.northArrow.angleDeg.toFixed(1)}&deg;</span>
            </div>
          )}
          {entry.scaleBar && (
            <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Scale bar</span>
              <button
                type="button"
                className={`${styles.elemChip} ${entry.scaleBar.visible ? '' : styles.elemChipOff}`}
                title={entry.scaleBar.visible ? 'Hide scale bar' : 'Show scale bar'}
                onClick={() => setScaleBar(entry.handle, { ...entry.scaleBar!, visible: !entry.scaleBar!.visible })}
              >
                {entry.scaleBar.visible ? 'Visible' : 'Hidden'}
              </button>
              {entry.scaleBar.realWorldFt !== null && (
                <span>1&quot;={entry.scaleBar.realWorldFt}ft</span>
              )}
              <button
                type="button"
                className={styles.elemChip}
                onClick={() => setScaleBar(entry.handle, null)}
                title="Remove scale bar"
              >
                Remove
              </button>
            </div>
          )}
          {entry.knownDistance && (
            <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Known distance</span>
              <button
                type="button"
                className={`${styles.elemChip} ${entry.knownDistance.visible ? '' : styles.elemChipOff}`}
                title={entry.knownDistance.visible ? 'Hide' : 'Show'}
                onClick={() => setKnownDistance(entry.handle, { ...entry.knownDistance!, visible: !entry.knownDistance!.visible })}
              >
                {entry.knownDistance.visible ? 'Visible' : 'Hidden'}
              </button>
              {entry.knownDistance.realWorldFt !== null && (
                <span>{(Math.hypot(
                  entry.knownDistance.end.x - entry.knownDistance.begin.x,
                  entry.knownDistance.end.y - entry.knownDistance.begin.y,
                ) / 150).toFixed(2)}&quot;={entry.knownDistance.realWorldFt}ft</span>
              )}
              <button
                type="button"
                className={styles.elemChip}
                onClick={() => setKnownDistance(entry.handle, null)}
                title="Remove known distance"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PdfGroupModal({
  sheets,
  groupCount,
  onClose,
}: {
  sheets: PdfSheetEntry[];
  groupCount: number;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(sheets.map((sheet) => [sheet.handle, true])),
  );
  const selectedHandles = sheets.filter((sheet) => selected[sheet.handle]).map((sheet) => sheet.handle);
  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Group PDFs">
        <div className={styles.dialogHeader}>
          <div className={styles.dialogFile}>
            <span className={styles.dialogFileName}>Group PDFs</span>
            <span className={styles.formatChip}>PDF</span>
          </div>
          <div className={styles.dialogMeta}>Cross-file groups overlap by default. Same-source page groups stack edge-to-edge.</div>
        </div>
        <div className={styles.batchList}>
          {sheets.map((sheet) => (
            <label key={sheet.handle} className={styles.batchItem}>
              <input
                type="checkbox"
                checked={selected[sheet.handle] ?? false}
                onChange={(ev) => setSelected((prev) => ({ ...prev, [sheet.handle]: ev.target.checked }))}
              />
              <span className={styles.listRowName}>{sheet.label}</span>
              <span className={styles.listRowMeta}>page {sheet.pageIndex + 1}</span>
            </label>
          ))}
        </div>
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={selectedHandles.length < 2}
            onClick={() => {
              createPdfGroup(`PDF Group ${groupCount + 1}`, selectedHandles);
              onClose();
            }}
          >
            Group {selectedHandles.length} PDFs
          </button>
        </div>
      </div>
    </div>
  );
}

function PointCloudRow({ entry }: { entry: PointCloudEntry }) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const geotiffs = useAppStore((s) => s.geotiffs);
  const [expanded, setExpanded] = useState(false);
  const hasGeotiff = geotiffs.length > 0;

  return (
    <div className={styles.listRow} style={{ cursor: 'default' }}>
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
        <button
          type="button"
          className={styles.iconBtn}
          title={expanded ? 'Collapse' : 'Metadata'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '^' : 'v'}
        </button>
      </div>

      {expanded && (
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

          {/* Display mode (RGB / Intensity / Elevation / GeoTIFF) — Milestone 3 */}
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

          {/* GeoTIFF source picker — only when geotiff mode is active and >1 GeoTIFF loaded */}
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

          {/* Classification filter */}
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

          {/* Returns filter — greyed for single-return files */}
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
    </div>
  );
}

function DatasetSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.datasetSection}>
      <div className={styles.datasetSectionHeaderRow}>
        <div className={styles.datasetSectionHeader}>{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}

function TopSection({ onOpenClick }: { onOpenClick: () => void }) {
  const cameraMode = useAppStore((s) => s.cameraMode);
  const setCameraMode = useAppStore((s) => s.setCameraMode);
  const hoverArmed = useAppStore((s) => s.hoverArmed);
  const setHoverArmed = useAppStore((s) => s.setHoverArmed);
  const exaggeration = useAppStore((s) => s.exaggeration);
  const sunAzimuth = useAppStore((s) => s.sunAzimuth);
  const sunAltitude = useAppStore((s) => s.sunAltitude);

  return (
    <div className={styles.topSection}>
      <div className={styles.topRow}>
        <button type="button" className={styles.actionBtn} onClick={onOpenClick}>
          Open...
        </button>
        <span className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segmentedBtn} ${cameraMode === 'orbit' ? styles.segmentedBtnActive : ''}`}
            onClick={() => {
              setHoverArmed(false);
              setCameraMode('orbit');
            }}
          >
            3D
          </button>
          <button
            type="button"
            className={`${styles.segmentedBtn} ${cameraMode === 'top' ? styles.segmentedBtnActive : ''}`}
            onClick={() => {
              setHoverArmed(false);
              setCameraMode('top');
            }}
          >
            Top
          </button>
          <button
            type="button"
            className={`${styles.segmentedBtn} ${
              cameraMode === 'hover' || hoverArmed ? styles.segmentedBtnActive : ''
            }`}
            onClick={() => {
              if (cameraMode === 'hover') return;
              setHoverArmed(!hoverArmed);
            }}
            title={hoverArmed ? 'Click the active surface in the canvas to enter hover mode' : 'Arm hover mode entry'}
          >
            Hover
          </button>
        </span>
        <button
          type="button"
          className={styles.actionBtn}
          onClick={() => engineHolder.current?.resetView()}
        >
          Reset view
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

function SurfaceMasterBar() {
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

function DxfMasterBar() {
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

function SurfaceRow({ entry }: { entry: SurfaceEntry }) {
  const activeHandle = useAppStore((s) => s.activeHandle);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const [expanded, setExpanded] = useState(false);

  const active = entry.handle === activeHandle;
  const d = entry.display;

  const elementAvailable = (kind: ElementKind): boolean => {
    if (kind === 'faces' || kind === 'edges') return entry.hasFaces;
    if (kind === 'breaklines') return entry.breaklines > 0;
    if (kind === 'boundary') return entry.hasFaces || entry.boundariesDefined > 0;
    return true;
  };

  return (
    <div
      className={`${styles.listRow} ${active ? styles.listRowActive : ''}`}
      onClick={() => {
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
        <span className={styles.rowSpacer} />
        <button
          type="button"
          className={styles.iconBtn}
          title={expanded ? 'Collapse' : 'Per-element settings'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '^' : 'v'}
        </button>
      </div>

      {expanded && (
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
    </div>
  );
}

function DxfRow({
  entry,
  surfaces,
}: {
  entry: DxfEntry;
  surfaces: { handle: string; name: string }[];
}) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const [expanded, setExpanded] = useState(false);
  const targetName = surfaces.find((surface) => surface.handle === entry.drapeTarget)?.name;

  return (
    <div className={styles.listRow} style={{ cursor: 'default' }}>
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
        <button
          type="button"
          className={styles.iconBtn}
          title={expanded ? 'Collapse' : 'Layers'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '^' : 'v'}
        </button>
      </div>

      {expanded && (
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
    </div>
  );
}

function GeotiffBatchModal({
  geotiffs,
  groupCount,
  onClose,
}: {
  geotiffs: GeotiffEntry[];
  groupCount: number;
  onClose: () => void;
}) {
  const [name, setName] = useState(`Mosaic ${groupCount + 1}`);
  const [checked, setChecked] = useState<Set<string>>(new Set(geotiffs.slice(0, 2).map((entry) => entry.handle)));
  const canCreate = name.trim().length > 0 && checked.size >= 2;

  return (
    <div className={styles.dialogBackdrop} role="dialog" aria-modal="true" aria-labelledby="geotiff-batch-title">
      <div className={styles.dialog}>
        <div className={styles.dialogHeader}>
          <div className={styles.dialogFile}>
            <span className={styles.formatChip}>GeoTIFF</span>
            <span id="geotiff-batch-title" className={styles.dialogFileName}>
              Create mosaic group
            </span>
          </div>
          <div className={styles.dialogMeta}>Select two or more ungrouped GeoTIFFs.</div>
        </div>
        <div className={styles.dialogSection}>
          <label className={styles.dialogSectionTitle} htmlFor="geotiff-group-name">
            Group name
          </label>
          <input
            id="geotiff-group-name"
            className={styles.textCtl}
            value={name}
            onChange={(ev) => setName(ev.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.dialogSection}>
          <div className={styles.dialogSectionTitle}>Ungrouped GeoTIFFs</div>
          {geotiffs.length < 2 ? (
            <div className={styles.historyEmpty}>Need at least two ungrouped GeoTIFFs.</div>
          ) : (
            <div className={styles.batchList}>
              {geotiffs.map((entry) => (
                <label key={entry.handle} className={styles.batchItem}>
                  <input
                    type="checkbox"
                    checked={checked.has(entry.handle)}
                    onChange={(ev) => {
                      setChecked((current) => {
                        const next = new Set(current);
                        if (ev.target.checked) next.add(entry.handle);
                        else next.delete(entry.handle);
                        return next;
                      });
                    }}
                  />
                  <span className={styles.layerName}>{entry.name}</span>
                  <span className={styles.listRowMeta}>
                    {entry.width.toLocaleString()} x {entry.height.toLocaleString()}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className={styles.dialogButtons}>
          <button type="button" className={styles.actionBtn} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={!canCreate}
            onClick={() => {
              if (!canCreate) return;
              createGeotiffGroup(name.trim(), [...checked]);
              onClose();
            }}
          >
            Create group
          </button>
        </div>
      </div>
    </div>
  );
}

function GeotiffGroupRow({
  group,
  entries,
  surfaces,
}: {
  group: GeotiffGroup;
  entries: GeotiffEntry[];
  surfaces: { handle: string; name: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const targetName = surfaces.find((surface) => surface.handle === group.drapeTarget)?.name;

  return (
    <div className={styles.listRow} style={{ cursor: 'default' }}>
      <div className={styles.listRowTop}>
        <button
          type="button"
          className={styles.iconBtn}
          title={expanded ? 'Collapse group' : 'Expand group'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '^' : 'v'}
        </button>
        <div className={styles.listRowName}>{group.name}</div>
        <span className={styles.dxfIcon}>{group.name}</span>
        <span className={styles.listRowMeta}>{entries.length} GeoTIFFs</span>
        <button
          type="button"
          className={`${styles.elemChip} ${group.visible ? '' : styles.elemChipOff}`}
          title={group.visible ? 'Hide group' : 'Show group'}
          onClick={() => setGeotiffGroupVisible(group.id, !group.visible)}
        >
          Eye
        </button>
      </div>
      <div className={styles.listRowMeta}>
        {targetName ? `target ${targetName}` : 'no target'} · opacity {Math.round(group.opacity * 100)}%
      </div>
      {expanded && (
        <div className={styles.groupMemberList}>
          {entries.map((entry) => (
            <GeotiffRow
              key={entry.handle}
              entry={entry}
              surfaces={surfaces}
              groupName={group.name}
              memberRow
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GeotiffRow({
  entry,
  surfaces,
  groupName,
  memberRow = false,
}: {
  entry: GeotiffEntry;
  surfaces: { handle: string; name: string }[];
  groupName?: string;
  memberRow?: boolean;
}) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const [expanded, setExpanded] = useState(false);
  const targetName = surfaces.find((surface) => surface.handle === entry.drapeTarget)?.name;

  return (
    <div className={`${styles.listRow} ${memberRow ? styles.groupMemberRow : ''}`} style={{ cursor: 'default' }}>
      <div className={styles.listRowTop}>
        <div className={styles.listRowName}>{entry.name}</div>
        <span className={styles.dxfIcon}>{groupName ?? 'TIF'}</span>
        <span className={styles.listRowMeta}>
          {entry.width.toLocaleString()} x {entry.height.toLocaleString()} · {formatBytes(entry.sizeBytes)}
        </span>
        {!memberRow && (
          <button
            type="button"
            className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
            title={entry.visible ? 'Hide GeoTIFF' : 'Show GeoTIFF'}
            onClick={() => setGeotiffVisible(entry.handle, !entry.visible)}
          >
            Eye
          </button>
        )}
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
          aria-label="Remove GeoTIFF"
          onClick={() => {
            if (window.confirm(`Remove "${entry.name}" from the scene?`)) removeGeotiff(entry.handle);
          }}
        >
          x
        </button>
        {!memberRow && (
          <button
            type="button"
            className={styles.iconBtn}
            title={expanded ? 'Collapse' : 'Metadata'}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? '^' : 'v'}
          </button>
        )}
      </div>

      {(expanded || memberRow) && (
        <div className={styles.rowExpand}>
          <div className={styles.listRowMeta}>
            {entry.samplesPerPixel} bands
            {entry.crsText ? ` · ${entry.crsText}` : ' · no CRS text found'}
          </div>
          <div className={styles.listRowMeta}>
            {entry.pixelScale
              ? `resolution ${Math.abs(entry.pixelScale[0]).toFixed(6)} x ${Math.abs(entry.pixelScale[1]).toFixed(6)}`
              : 'no georeference found'}
            {targetName ? ` · target ${targetName}` : ''}
          </div>
          {!memberRow && surfaces.length > 0 && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Drape onto</span>
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
            </div>
          )}
          {!memberRow && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Opacity</span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                title="GeoTIFF opacity"
                value={entry.opacity}
                onChange={(ev) => setGeotiffOpacity(entry.handle, Number(ev.target.value))}
              />
            </div>
          )}
          {entry.worldBounds && (
            <div className={styles.listRowMeta}>
              X {entry.worldBounds.minX.toFixed(3)} to {entry.worldBounds.maxX.toFixed(3)} · Y{' '}
              {entry.worldBounds.minY.toFixed(3)} to {entry.worldBounds.maxY.toFixed(3)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
