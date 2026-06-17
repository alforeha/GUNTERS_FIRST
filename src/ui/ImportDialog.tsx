// src/ui/ImportDialog.tsx — modal import feedback (docs/06 C2). One component, phases:
// identifying → progress → findings (confirm/cancel). Routing messages for non-LandXML
// formats render here too (informational, never error-styled), and the same findings
// renderer powers the read-only "Import notes" view for already-loaded datasets.
// Sprint 4 (docs/08 Phase 3): DXF findings + drape choices.
import type { DxfDataset, GeotiffDataset, ImportReport, PdfDocumentDataset, PointCloudDataset, SourceMeta } from '../core';
import { useAppStore } from '../state/store';
import {
  cancelImport,
  confirmDxfImport,
  confirmGeotiffImport,
  confirmImport,
  confirmPdfImport,
  confirmPointCloudImport,
  startPointCloudBuild,
} from './importController';
import { engineHolder } from './engineHolder';
import styles from './App.module.css';

const UNITS_LABEL: Record<string, string> = {
  usSurveyFoot: 'US Survey Ft',
  foot: 'Ft',
  meter: 'm',
  unknown: 'Unknown',
};

const FORMAT_CHIP: Record<string, string> = {
  landxml: 'LandXML',
  'carlson-dtm': 'Carlson DTM',
  dxf: 'DXF',
  dwg: 'DWG',
  geotiff: 'GeoTIFF',
  pdf: 'PDF',
  las: 'LAS',
  unknown: 'Unknown',
};

type Severity = 'ok' | 'warn' | 'note';
interface Finding {
  severity: Severity;
  text: string;
}

const SEVERITY_GLYPH: Record<Severity, string> = { ok: '✓', warn: '⚠', note: 'ℹ' };

// docs/06 C2 copy for the faceless path (replaces the parser's terse internal warning).
const REBUILD_COPY =
  'No faces found — triangulation rebuild required; rebuild is not yet supported, ' +
  'surface will load as points only';

/** Severity-iconed findings for a DXF dataset's report (docs/08 Phase 3: entity census,
 *  per-type skip counts, layer count, block/explode summary, paper-space note, points). */
function dxfFindings(report: ImportReport): Finding[] {
  const out: Finding[] = [];
  const counts = report.counts;
  // entity census — "LWPOLYLINE ×491, INSERT ×5, …"
  const census = Object.entries(counts)
    .filter(([k]) => k.startsWith('entity:'))
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k.slice(7)} ×${v.toLocaleString()}`)
    .join(', ');
  if (census) out.push({ severity: 'ok', text: census });
  out.push({
    severity: 'ok',
    text: `${(counts['normalizedPolylines'] ?? 0).toLocaleString()} drawable polylines across ${counts['layers'] ?? 0} layers`,
  });
  for (const w of report.warnings) out.push({ severity: 'warn', text: w });
  for (const i of report.infos) out.push({ severity: 'note', text: i });
  return out;
}

/** Severity-iconed findings for one surface's report (also used for persisted notes). */
function surfaceFindings(report: ImportReport): Finding[] {
  const out: Finding[] = [];
  const counts = report.counts;
  const points = counts['points'] ?? 0;
  const faces = counts['faces'] ?? 0;
  out.push({ severity: 'ok', text: `${points.toLocaleString()} points` });
  if (report.triangulationPreserved) {
    out.push({ severity: 'ok', text: `${faces.toLocaleString()} faces — original triangulation preserved` });
  } else {
    out.push({ severity: 'warn', text: REBUILD_COPY });
  }
  if ((counts['breaklines'] ?? 0) > 0) {
    out.push({ severity: 'ok', text: `${counts['breaklines']} breaklines` });
  } else {
    out.push({ severity: 'note', text: 'no breaklines defined' });
  }
  if ((counts['boundaries'] ?? 0) > 0) {
    out.push({ severity: 'ok', text: `${counts['boundaries']} boundaries` });
  } else if (report.triangulationPreserved) {
    out.push({
      severity: 'note',
      text: 'No boundary defined in file — outer boundary derived from mesh edge',
    });
  }
  for (const w of report.warnings) {
    if (w.startsWith('no faces')) continue; // replaced by REBUILD_COPY above
    out.push({ severity: 'warn', text: w });
  }
  for (const i of report.infos) out.push({ severity: 'note', text: i });
  for (const [el, n] of Object.entries(report.unknownElements)) {
    out.push({ severity: 'note', text: `skipped unknown <${el}>${n > 1 ? ` ×${n}` : ''}` });
  }
  return out;
}

function overlapsSurface(geotiff: GeotiffDataset, surfaceHandle: string | null): boolean {
  if (!surfaceHandle || !geotiff.worldBounds) return true;
  const surface = engineHolder.current?.getSurfaceModel(surfaceHandle);
  if (!surface) return true;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < surface.positions.length; i += 3) {
    const x = surface.positions[i]!;
    const y = surface.positions[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return !(
    geotiff.worldBounds.maxX < minX ||
    geotiff.worldBounds.minX > maxX ||
    geotiff.worldBounds.maxY < minY ||
    geotiff.worldBounds.minY > maxY
  );
}

function geotiffFindings(dataset: GeotiffDataset, fileSize?: number): Finding[] {
  const out: Finding[] = [];
  if (fileSize !== undefined) {
    out.push({
      severity: 'note',
      text: `${(fileSize / (1024 * 1024)).toFixed(1)} MB`,
    });
  }
  out.push({ severity: 'ok', text: `${dataset.width.toLocaleString()} x ${dataset.height.toLocaleString()} px` });
  out.push({
    severity: 'ok',
    text: `${dataset.samplesPerPixel} band${dataset.samplesPerPixel === 1 ? '' : 's'} · ${dataset.bitsPerSample.join('/')} bit`,
  });
  if (dataset.crsText) out.push({ severity: 'ok', text: `CRS: ${dataset.crsText}` });
  if (dataset.geoTransform) {
    out.push({
      severity: 'ok',
      text: `pixel resolution ${Math.abs(dataset.geoTransform.pixelScale[0]).toFixed(6)} x ${Math.abs(dataset.geoTransform.pixelScale[1]).toFixed(6)}`,
    });
    if (dataset.worldBounds) {
      out.push({
        severity: 'note',
        text:
          `world bounds X ${dataset.worldBounds.minX.toFixed(3)} to ${dataset.worldBounds.maxX.toFixed(3)} · ` +
          `Y ${dataset.worldBounds.minY.toFixed(3)} to ${dataset.worldBounds.maxY.toFixed(3)}`,
      });
    }
  }
  for (const w of dataset.report.warnings) out.push({ severity: 'warn', text: w });
  for (const i of dataset.report.infos) {
    if (!out.some((finding) => finding.text === i)) out.push({ severity: 'note', text: i });
  }
  return out;
}

function pdfFindings(dataset: PdfDocumentDataset, fileSize?: number): Finding[] {
  const out: Finding[] = [];
  if (fileSize !== undefined) out.push({ severity: 'note', text: `${(fileSize / (1024 * 1024)).toFixed(1)} MB` });
  out.push({ severity: 'ok', text: `${dataset.pageCount} page${dataset.pageCount === 1 ? '' : 's'}` });
  for (const page of dataset.pages) {
    out.push({
      severity: Math.max(page.widthPx150, page.heightPx150) > 4096 ? 'warn' : 'ok',
      text:
        `page ${page.pageIndex + 1}: ${page.widthPx150.toLocaleString()} x ${page.heightPx150.toLocaleString()} px ` +
        `at 150 DPI`,
    });
  }
  if (dataset.title) out.push({ severity: 'note', text: `title: ${dataset.title}` });
  if (dataset.creator) out.push({ severity: 'note', text: `creator: ${dataset.creator}` });
  if (dataset.producer) out.push({ severity: 'note', text: `producer: ${dataset.producer}` });
  for (const w of dataset.report.warnings) {
    if (!out.some((finding) => finding.text === w)) out.push({ severity: 'warn', text: w });
  }
  return out;
}

function pointCloudFindings(dataset: PointCloudDataset, fileSize?: number): Finding[] {
  const out: Finding[] = [];
  if (fileSize !== undefined) out.push({ severity: 'note', text: `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB` });
  out.push({ severity: 'ok', text: `LAS ${dataset.lasVersion} · point format ${dataset.pointFormat}` });
  out.push({ severity: 'ok', text: `${dataset.pointCount.toLocaleString()} points · ${dataset.pointRecordLength} bytes/point` });
  out.push({
    severity: 'note',
    text:
      `X ${dataset.bounds.minX.toFixed(3)} to ${dataset.bounds.maxX.toFixed(3)} · ` +
      `Y ${dataset.bounds.minY.toFixed(3)} to ${dataset.bounds.maxY.toFixed(3)} · ` +
      `Z ${dataset.bounds.minZ.toFixed(3)} to ${dataset.bounds.maxZ.toFixed(3)}`,
  });
  if (dataset.pointDensityPerSqFt !== null) {
    out.push({ severity: 'ok', text: `${dataset.pointDensityPerSqFt.toFixed(1)} points/sq ft average density` });
  }
  const attrs = dataset.attributes;
  const attributeNames = [
    attrs.hasIntensity ? 'intensity' : null,
    attrs.hasReturns ? 'returns' : null,
    attrs.hasClassification ? 'classification' : null,
    attrs.hasClassificationFlags ? 'classification flags' : null,
    attrs.hasUserData ? 'user data' : null,
    attrs.hasScanAngle ? 'scan angle' : null,
    attrs.hasPointSourceId ? 'point source ID' : null,
    attrs.hasGpsTime ? 'GPS time' : null,
    attrs.hasRgb ? 'RGB' : null,
  ].filter(Boolean);
  out.push({ severity: 'ok', text: `attributes: ${attributeNames.join(', ')}` });
  if (attrs.intensityRange) out.push({ severity: 'ok', text: `sample intensity ${attrs.intensityRange[0]} to ${attrs.intensityRange[1]}` });
  if (attrs.rgbRange) {
    out.push({
      severity: 'ok',
      text: `sample RGB ${attrs.rgbRange[0].join('/')} to ${attrs.rgbRange[1].join('/')}`,
    });
  }
  const classes = Object.entries(attrs.classificationCounts)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([k, v]) => `${k}: ${v.toLocaleString()}`)
    .join(', ');
  if (classes) out.push({ severity: 'note', text: `classification sample (${attrs.sampledPoints.toLocaleString()} pts): ${classes}` });
  for (const w of dataset.report.warnings) out.push({ severity: 'warn', text: w });
  for (const i of dataset.report.infos) {
    if (!out.some((finding) => finding.text === i)) out.push({ severity: 'note', text: i });
  }
  return out;
}

function FindingsList({ findings }: { findings: Finding[] }) {
  return (
    <ul className={styles.findings}>
      {findings.map((f, i) => (
        <li key={i} className={styles.finding}>
          <span className={`${styles.findingIcon} ${styles[`sev_${f.severity}`]}`}>
            {SEVERITY_GLYPH[f.severity]}
          </span>
          <span>{f.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** File-level diagnostics — rendered ONCE, above per-surface sections (C3 design rule). */
function FileLevelSection({ fileLevel }: { fileLevel: NonNullable<ImportReport['fileLevel']> }) {
  const findings: Finding[] = [
    ...fileLevel.warnings.map((w): Finding => ({ severity: 'warn', text: w })),
    ...fileLevel.infos.map((i): Finding => ({ severity: 'note', text: i })),
    ...Object.entries(fileLevel.unknownElements).map(
      ([el, n]): Finding => ({ severity: 'note', text: `skipped unknown <${el}>${n > 1 ? ` ×${n}` : ''}` }),
    ),
  ];
  if (findings.length === 0) return null;
  return (
    <div className={styles.dialogSection}>
      <h3 className={styles.dialogSectionTitle}>File</h3>
      <FindingsList findings={findings} />
    </div>
  );
}

function HeaderMeta({ fileName, format, meta }: { fileName: string; format: string | null; meta?: SourceMeta }) {
  return (
    <div className={styles.dialogHeader}>
      <div className={styles.dialogFile}>
        <span className={styles.dialogFileName}>{fileName}</span>
        {format && <span className={styles.formatChip}>{FORMAT_CHIP[format] ?? format}</span>}
      </div>
      {meta && (
        <div className={styles.dialogMeta}>
          {[meta.producer, meta.formatVersion, UNITS_LABEL[meta.units.linear] ?? meta.units.raw]
            .filter(Boolean)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}

/** DXF findings + drape choices (docs/08 Phase 3) — choices render only when applicable. */
function DxfFindings({
  dxf,
  target,
  zMode,
  onTarget,
  onZMode,
}: {
  dxf: DxfDataset;
  target: string | null;
  zMode: 'drape' | 'native';
  onTarget: (t: string | null) => void;
  onZMode: (m: 'drape' | 'native') => void;
}) {
  const surfaces = useAppStore((s) => s.surfaces);
  const anyZ = dxf.entities.some((e) => e.hasZ);
  const noSurface = surfaces.length === 0;

  return (
    <>
      <div className={styles.dialogSection}>
        <h3 className={styles.dialogSectionTitle}>{dxf.name}</h3>
        <FindingsList findings={dxfFindings(dxf.report)} />
        {noSurface && (
          <FindingsList
            findings={[
              {
                severity: 'warn',
                text: 'no surface to drape onto — showing at source elevations',
              },
            ]}
          />
        )}
      </div>

      {/* Target surface — only shown when ≥1 surface is loaded */}
      {!noSurface && (
        <div className={styles.dialogSection}>
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Target surface</span>
            <select
              className={styles.selectCtl}
              value={target ?? ''}
              onChange={(ev) => onTarget(ev.target.value || null)}
            >
              {surfaces.map((s) => (
                <option key={s.handle} value={s.handle}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Z handling — only when entities carry nonzero Z (docs/08 Phase 3) */}
          {anyZ && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Elevations</span>
              <span className={styles.segmented}>
                <button
                  type="button"
                  className={`${styles.segmentedBtn} ${zMode === 'drape' ? styles.segmentedBtnActive : ''}`}
                  title="Project linework onto the target surface (recommended — plan linework Z is often unreliable)"
                  onClick={() => onZMode('drape')}
                >
                  Drape to surface
                </button>
                <button
                  type="button"
                  className={`${styles.segmentedBtn} ${zMode === 'native' ? styles.segmentedBtnActive : ''}`}
                  title="Keep the Z values the entities carry (contours / 3D faces)"
                  onClick={() => onZMode('native')}
                >
                  Keep entity elevations
                </button>
              </span>
            </div>
          )}
        </div>
      )}

      <div className={styles.dialogButtons}>
        <button type="button" className={styles.actionBtn} onClick={cancelImport}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={confirmDxfImport}
        >
          Load DXF
        </button>
      </div>
    </>
  );
}

function GeotiffFindings({
  geotiff,
  target,
  fileSize,
  onTarget,
}: {
  geotiff: GeotiffDataset;
  target: string | null;
  fileSize?: number;
  onTarget: (t: string | null) => void;
}) {
  const surfaces = useAppStore((s) => s.surfaces);
  const noSurface = surfaces.length === 0;
  const overlaps = overlapsSurface(geotiff, target);

  return (
    <>
      <div className={styles.dialogSection}>
        <h3 className={styles.dialogSectionTitle}>{geotiff.name}</h3>
        <FindingsList findings={geotiffFindings(geotiff, fileSize)} />
        {noSurface && (
          <FindingsList
            findings={[
              {
                severity: 'warn',
                text: 'no surface loaded — metadata will be imported, drape placement begins in the next milestone',
              },
            ]}
          />
        )}
        {!noSurface && !overlaps && (
          <FindingsList
            findings={[
              {
                severity: 'warn',
                text: 'GeoTIFF bounds do not overlap the selected surface; placement would be off-surface until you retarget it.',
              },
            ]}
          />
        )}
      </div>

      {!noSurface && (
        <div className={styles.dialogSection}>
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Target surface</span>
            <select
              className={styles.selectCtl}
              value={target ?? ''}
              onChange={(ev) => onTarget(ev.target.value || null)}
            >
              {surfaces.map((s) => (
                <option key={s.handle} value={s.handle}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className={styles.dialogButtons}>
        <button type="button" className={styles.actionBtn} onClick={cancelImport}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={confirmGeotiffImport}
        >
          Load GeoTIFF
        </button>
      </div>
    </>
  );
}

function PdfFindings({
  pdf,
  loadMode,
  fileSize,
  onLoadMode,
}: {
  pdf: PdfDocumentDataset;
  loadMode: 'group' | 'individual';
  fileSize?: number;
  onLoadMode: (mode: 'group' | 'individual') => void;
}) {
  return (
    <>
      <div className={styles.dialogSection}>
        <h3 className={styles.dialogSectionTitle}>{pdf.name}</h3>
        <FindingsList findings={pdfFindings(pdf, fileSize)} />
      </div>

      {pdf.pageCount > 1 && (
        <div className={styles.dialogSection}>
          <h3 className={styles.dialogSectionTitle}>This PDF has {pdf.pageCount} pages. How would you like to load it?</h3>
          <div className={styles.elemRow}>
            <span className={styles.elemRowLabel}>Pages</span>
            <span className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${loadMode === 'group' ? styles.segmentedBtnActive : ''}`}
                onClick={() => onLoadMode('group')}
              >
                Load all pages as a group
              </button>
              <button
                type="button"
                className={`${styles.segmentedBtn} ${loadMode === 'individual' ? styles.segmentedBtnActive : ''}`}
                onClick={() => onLoadMode('individual')}
              >
                Load pages individually
              </button>
            </span>
          </div>
        </div>
      )}

      <div className={styles.dialogButtons}>
        <button type="button" className={styles.actionBtn} onClick={cancelImport}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={confirmPdfImport}
        >
          Load PDF
        </button>
      </div>
    </>
  );
}

function PointCloudQualityStep({
  quality,
  onQuality,
  pointCount,
}: {
  quality: 'fast' | 'balanced' | 'all-detail';
  onQuality: (quality: 'fast' | 'balanced' | 'all-detail') => void;
  pointCount?: number;
}) {
  const estimates = pointCloudQualityEstimates(pointCount);
  const selectedEstimate = estimates.find((item) => item.quality === quality);
  return (
    <>
      <div className={styles.dialogSection}>
        <h3 className={styles.dialogSectionTitle}>Import quality</h3>
        <div className={styles.elemRow}>
          <span className={styles.elemRowLabel}>Preset</span>
          <select
            className={styles.selectCtl}
            value={quality}
            onChange={(ev) => onQuality(ev.target.value as 'fast' | 'balanced' | 'all-detail')}
          >
            <option value="fast">Fast</option>
            <option value="balanced">Balanced</option>
            <option value="all-detail">All Detail</option>
          </select>
        </div>
        <p className={styles.dialogInfo}>Higher detail = longer import, more memory. Can re-import to change.</p>
        <FindingsList
          findings={estimates.map((item) => ({
            severity: item.bytes > 1.5 * 1024 * 1024 * 1024 ? 'warn' : 'note',
            text: `${item.label}: ${item.retained.toLocaleString()} retained pts est. · ${formatEstimateBytes(item.bytes)} render buffers`,
          }))}
        />
        {selectedEstimate && selectedEstimate.bytes > 1.5 * 1024 * 1024 * 1024 && (
          <p className={styles.dialogInfo}>⚠ May crash on some machines. Fast is recommended for files this size.</p>
        )}
      </div>
      <div className={styles.dialogButtons}>
        <button type="button" className={styles.actionBtn} onClick={cancelImport}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={() => startPointCloudBuild(quality)}
        >
          Build Point Cloud
        </button>
      </div>
    </>
  );
}

function pointCloudQualityEstimates(pointCount?: number): {
  quality: 'fast' | 'balanced' | 'all-detail';
  label: string;
  retained: number;
  bytes: number;
}[] {
  const count = pointCount ?? 0;
  const rows: { quality: 'fast' | 'balanced' | 'all-detail'; label: string; stride: number }[] = [
    { quality: 'fast', label: 'Fast', stride: 128 },
    { quality: 'balanced', label: 'Balanced', stride: 16 },
    { quality: 'all-detail', label: 'All Detail', stride: 2 },
  ];
  return rows.map((row) => {
    const retained = count > 0 ? Math.ceil(count / row.stride) : 0;
    return { ...row, retained, bytes: retained * 24 };
  });
}

function formatEstimateBytes(bytes: number): string {
  if (bytes <= 0) return 'calculating...';
  const gib = bytes / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(2)} GB est.`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB est.`;
}

function PointCloudFindings({ pointCloud, fileSize }: { pointCloud: PointCloudDataset; fileSize?: number }) {
  return (
    <>
      <div className={styles.dialogSection}>
        <h3 className={styles.dialogSectionTitle}>{pointCloud.name}</h3>
        <FindingsList findings={pointCloudFindings(pointCloud, fileSize)} />
      </div>

      <div className={styles.dialogButtons}>
        <button type="button" className={styles.actionBtn} onClick={cancelImport}>
          Cancel
        </button>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
          onClick={confirmPointCloudImport}
        >
          Load Point Cloud
        </button>
      </div>
    </>
  );
}

export function ImportDialog() {
  const job = useAppStore((s) => s.importJob);
  const notesHandle = useAppStore((s) => s.notesHandle);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const importNotes = useAppStore((s) => s.importNotes);
  const patchImportJob = useAppStore((s) => s.patchImportJob);

  // Read-only findings view for a loaded dataset (left panel "Import notes" — C2).
  if (!job && notesHandle) {
    const note = importNotes[notesHandle];
    if (!note) return null;
    return (
      <div className={styles.dialogBackdrop}>
        <div className={styles.dialog} role="dialog" aria-label="Import notes">
          <HeaderMeta fileName={note.fileName} format={note.meta.format} meta={note.meta} />
          {note.report.fileLevel && <FileLevelSection fileLevel={note.report.fileLevel} />}
          <div className={styles.dialogSection}>
            <h3 className={styles.dialogSectionTitle}>{note.surfaceName}</h3>
            <FindingsList
              findings={
                note.meta.format === 'dxf'
                  ? dxfFindings(note.report)
                  : note.meta.format === 'geotiff' || note.meta.format === 'pdf' || note.meta.format === 'las'
                    ? [
                        ...note.report.infos.map((text) => ({ severity: 'note' as const, text })),
                        ...note.report.warnings.map((text) => ({ severity: 'warn' as const, text })),
                      ]
                    : surfaceFindings(note.report)
              }
            />
          </div>
          <div className={styles.dialogButtons}>
            <button type="button" className={styles.actionBtn} onClick={() => setNotesHandle(null)}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!job) return null;

  const meta = job.surfaces?.[0]?.meta ?? job.dxf?.meta ?? job.geotiff?.meta ?? job.pdf?.meta ?? job.pointCloud?.meta;
  const multi = (job.surfaces?.length ?? 0) > 1;
  const anyChecked = job.checked?.some(Boolean) ?? false;

  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Import">
        <HeaderMeta fileName={job.fileName} format={job.format} meta={meta} />

        {job.phase === 'identifying' && <p className={styles.dialogInfo}>Identifying file…</p>}

        {job.phase === 'progress' && (
          <div className={styles.dialogSection}>
            <p className={styles.dialogInfo}>{job.progress?.label ?? 'working…'}</p>
            <div className={styles.progressTrack}>
              <div
                className={`${styles.progressFill} ${job.progress?.pct === null ? styles.progressIndeterminate : ''}`}
                style={job.progress?.pct != null ? { width: `${job.progress.pct}%` } : undefined}
              />
            </div>
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.actionBtn} onClick={cancelImport}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {job.phase === 'message' && (
          <>
            <p className={styles.dialogInfo}>{job.message}</p>
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.actionBtn} onClick={cancelImport}>
                Close
              </button>
            </div>
          </>
        )}

        {job.phase === 'findings' && job.dxf && (
          <DxfFindings
            dxf={job.dxf}
            target={job.dxfTarget ?? null}
            zMode={job.dxfZMode ?? 'drape'}
            onTarget={(t) => patchImportJob({ dxfTarget: t })}
            onZMode={(m) => patchImportJob({ dxfZMode: m })}
          />
        )}

        {job.phase === 'findings' && job.geotiff && (
          <GeotiffFindings
            geotiff={job.geotiff}
            target={job.geotiffTarget ?? null}
            fileSize={job.fileSize}
            onTarget={(t) => patchImportJob({ geotiffTarget: t })}
          />
        )}

        {job.phase === 'findings' && job.pdf && (
          <PdfFindings
            pdf={job.pdf}
            loadMode={job.pdfLoadMode ?? 'individual'}
            fileSize={job.fileSize}
            onLoadMode={(mode) => patchImportJob({ pdfLoadMode: mode })}
          />
        )}

        {job.phase === 'findings' && job.pointCloud && (
          <PointCloudFindings pointCloud={job.pointCloud} fileSize={job.fileSize} />
        )}

        {job.phase === 'findings' && job.format === 'las' && !job.pointCloud && (
          <PointCloudQualityStep
            quality={job.pointCloudQuality ?? 'fast'}
            onQuality={(quality) => patchImportJob({ pointCloudQuality: quality })}
            pointCount={job.pointCloudPointCount}
          />
        )}

        {job.phase === 'findings' && job.surfaces && (
          <>
            {job.surfaces[0]!.report.fileLevel && (
              <FileLevelSection fileLevel={job.surfaces[0]!.report.fileLevel} />
            )}
            {job.surfaces.map((s, i) => (
              <div key={s.id} className={styles.dialogSection}>
                <div className={styles.surfaceRow}>
                  {multi && (
                    <input
                      type="checkbox"
                      checked={job.checked?.[i] ?? true}
                      onChange={(ev) => {
                        const checked = [...(job.checked ?? [])];
                        checked[i] = ev.target.checked;
                        patchImportJob({ checked });
                      }}
                    />
                  )}
                  <h3 className={styles.dialogSectionTitle}>{s.name}</h3>
                  <span className={styles.surfaceRowMeta}>
                    {(s.report.counts['points'] ?? 0).toLocaleString()} pts ·{' '}
                    {(s.report.counts['faces'] ?? 0).toLocaleString()} faces
                  </span>
                </div>
                <FindingsList findings={surfaceFindings(s.report)} />
              </div>
            ))}
            <div className={styles.dialogButtons}>
              <button type="button" className={styles.actionBtn} onClick={cancelImport}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
                onClick={confirmImport}
                disabled={!anyChecked}
              >
                Load {multi ? `${job.checked?.filter(Boolean).length ?? 0} surface(s)` : 'surface'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
