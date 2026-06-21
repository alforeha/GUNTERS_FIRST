// src/ui/importController.ts — the import pipeline (docs/06 C1) and the single place where
// store updates are paired with ViewerEngine calls. Components never talk to the worker.
//
// Flow per file: sniffFormat → landxml: worker parse w/ progress → findings → confirm/cancel;
// other formats: friendly routing message. Multiple dropped files queue, one dialog each.
//
// Sprint 3 (07): this file also owns DISPLAY RESOLUTION — master gates ANDed with
// per-surface DisplaySettings + mute state, pushed to the engine as one ResolvedDisplay.
import { sniffFormat, SNIFF_RULES, type BorderCrop, type PdfNorthArrow, type PdfPlacement, type PdfScaleBar, type PdfKnownDistance, type SurfaceModel, writeLandXML } from '../core';
import type { WorkerParseMessage, WorkerParseRequest } from '../workers/parse.worker';
import type { DxfWorkerMessage, DxfWorkerRequest } from '../workers/dxf.worker';
import type { GeotiffOpenRequest, GeotiffWorkerMessage } from '../workers/geotiff.worker';
import type { PdfOpenRequest, PdfWorkerMessage } from '../workers/pdf.worker';
import type { LasImportQuality, LasWorkerMessage, LasWorkerRequest } from '../workers/las.worker';
import type { DxfLayerDisplay, ResolvedDisplay } from '../viewer';
import {
  useAppStore,
  defaultDisplaySettings,
  type DisplaySettings,
  type DxfEntry,
  type DxfLayerState,
  type EditCommand,
  type EditTool,
  type ElementKind,
  type ElementSettings,
  type GeotiffEntry,
  type GeotiffGroup,
  type MasterGates,
  type PdfGroupEntry,
  type PdfSheetEntry,
  type PointCloudEntry,
  type SurfaceEntry,
} from '../state/store';
import { engineHolder } from './engineHolder';

// Language rule (docs/06 C1): never "tin support" — the Carlson copy says "DTM path".
const ROUTING_COPY: Record<string, string> = {
  'carlson-dtm': 'Carlson-tested DTM path arrives in a later sprint — export LandXML meanwhile',
  dwg: "DWG can't be read in the browser — export DXF from your CAD software",
};

const UNITS_LABEL: Record<string, string> = {
  usSurveyFoot: 'US Survey Ft',
  foot: 'Ft',
  meter: 'm',
  unknown: 'Unknown',
};

async function readLasHeaderPointCount(file: File): Promise<number | undefined> {
  try {
    const header = await file.slice(0, 375).arrayBuffer();
    const view = new DataView(header);
    if (
      view.byteLength < 111 ||
      String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)) !== 'LASF'
    ) {
      return undefined;
    }
    const versionMinor = view.getUint8(25);
    if (versionMinor >= 4 && view.byteLength >= 255) return Number(view.getBigUint64(247, true));
    return view.getUint32(107, true);
  } catch {
    return undefined;
  }
}

function modifiedVertexCountForSurface(handle: string, commands: EditCommand[]): number {
  const ids = new Set<number>();
  for (const command of commands) {
    if (command.surfaceId !== handle) continue;
    if (command.vertexId !== undefined) {
      ids.add(command.vertexId);
      continue;
    }
    if (command.beforeIndices) {
      for (const vertexId of command.beforeIndices) ids.add(vertexId);
    }
    if (command.afterIndices) {
      for (const vertexId of command.afterIndices) ids.add(vertexId);
    }
  }
  return ids.size;
}

function surfaceExportSummary(handle: string): { modifiedVertexCount: number | null; modified: boolean } {
  const state = useAppStore.getState();
  const entry = state.surfaces.find((item) => item.handle === handle);
  const modifiedCount = modifiedVertexCountForSurface(handle, state.editUndoStack);
  return {
    modifiedVertexCount: modifiedCount > 0 ? modifiedCount : entry?.dirty ? null : 0,
    modified: entry?.dirty ?? false,
  };
}

function exportFileName(sourceName: string): string {
  const dot = sourceName.lastIndexOf('.');
  const stem = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  const safeStem = stem.replace(/[^\w.-]+/g, '_');
  return `${safeStem}_edited.xml`;
}

interface QueuedImport {
  file: File;
  worldFile?: File | null;
}

const queue: QueuedImport[] = [];
let activeWorker: Worker | null = null;
let msgId = 0;
const pdfSourceFiles = new Map<string, File>();

const store = useAppStore;

/** Entry point for the window drop target and the left-panel Open… picker. */
export function enqueueFiles(files: ArrayLike<File>): void {
  const incoming = Array.from({ length: files.length }, (_, i) => files[i] as File);
  const worldFiles = new Map<string, File>();
  for (const file of incoming) {
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
    if (ext === 'tfw') worldFiles.set(file.name.slice(0, dot).toLowerCase(), file);
  }
  for (const file of incoming) {
    const dot = file.name.lastIndexOf('.');
    const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
    if (ext === 'tfw') continue;
    const stem = dot >= 0 ? file.name.slice(0, dot).toLowerCase() : file.name.toLowerCase();
    const worldFile = ext === 'tif' || ext === 'tiff' || ext === 'geotiff' ? worldFiles.get(stem) : undefined;
    queue.push({ file, worldFile: worldFile ?? null });
  }
  if (!store.getState().importJob) processNext();
}

function processNext(): void {
  const next = queue.shift();
  const file = next?.file;
  if (!file || !next) return;
  store
    .getState()
    .setImportJob({ fileName: file.name, fileSize: file.size, sourceFile: file, phase: 'identifying', format: null });

  void sniffFormat(file).then((format) => {
    const { importJob, patchImportJob } = store.getState();
    if (!importJob || importJob.fileName !== file.name) return; // cancelled meanwhile

    if (format === 'landxml') {
      patchImportJob({ format, phase: 'progress', progress: { label: 'reading…', pct: 0 } });
      parseInWorker(file);
      return;
    }
    if (format === 'dxf') {
      patchImportJob({ format, phase: 'progress', progress: { label: 'reading…', pct: null } });
      parseDxfInWorker(file);
      return;
    }
    if (format === 'geotiff') {
      patchImportJob({ format, phase: 'progress', progress: { label: 'reading metadata…', pct: null } });
      parseGeotiffInWorker(file, next.worldFile ?? null);
      return;
    }
    if (format === 'pdf') {
      patchImportJob({ format, phase: 'progress', progress: { label: 'reading PDF...', pct: null } });
      parsePdfInWorker(file);
      return;
    }
    if (format === 'las') {
      patchImportJob({ format, phase: 'findings', pointCloudQuality: 'fast' });
      void readLasHeaderPointCount(file).then((pointCloudPointCount) => {
        const latest = store.getState().importJob;
        if (!latest || latest.fileName !== file.name || latest.format !== 'las') return;
        store.getState().patchImportJob({ pointCloudPointCount });
      });
      return;
    }
    const message =
      format === 'unknown'
        ? `Unrecognized file. We looked for: ${SNIFF_RULES.map((r) => r.lookedFor).join('; ')}.`
        : (ROUTING_COPY[format] as string);
    patchImportJob({ format, phase: 'message', message });
  });
}

function parseInWorker(file: File): void {
  const id = ++msgId;
  const worker = new Worker(new URL('../workers/parse.worker.ts', import.meta.url), {
    type: 'module',
  });
  activeWorker = worker;

  worker.onmessage = (e: MessageEvent<WorkerParseMessage>) => {
    const msg = e.data;
    if (msg.id !== id) return;
    const { patchImportJob, setProgress } = store.getState();

    if (msg.type === 'progress') {
      const pct = msg.bytesTotal > 0 ? Math.round((msg.bytesProcessed / msg.bytesTotal) * 100) : null;
      const label = msg.phase === 'building' ? 'building surfaces…' : `${msg.phase}…`;
      patchImportJob({ progress: { label, pct } });
      setProgress(pct === null ? `parsing ${file.name}` : `parsing ${file.name} — ${pct}%`);
      return;
    }

    // result
    finishWorker();
    setProgress(null);
    if (!msg.ok) {
      patchImportJob({ phase: 'message', message: `This file could not be read (${msg.error}).` });
      return;
    }
    if (msg.surfaces.length === 0) {
      patchImportJob({ phase: 'message', message: 'No surfaces found in this LandXML file.' });
      return;
    }
    patchImportJob({
      phase: 'findings',
      surfaces: msg.surfaces,
      checked: msg.surfaces.map(() => true),
    });
  };

  worker.onerror = (err) => {
    finishWorker();
    store.getState().setProgress(null);
    store.getState().patchImportJob({
      phase: 'message',
      message: `This file could not be read (${err.message || 'worker error'}).`,
    });
  };

  const req: WorkerParseRequest = { id, fileName: file.name, payload: file };
  worker.postMessage(req);
}

function finishWorker(): void {
  activeWorker?.terminate();
  activeWorker = null;
}

function parseDxfInWorker(file: File): void {
  const id = ++msgId;
  const worker = new Worker(new URL('../workers/dxf.worker.ts', import.meta.url), {
    type: 'module',
  });
  activeWorker = worker;

  worker.onmessage = (e: MessageEvent<DxfWorkerMessage>) => {
    const msg = e.data;
    if (msg.id !== id) return;
    const state = store.getState();

    if (msg.type === 'progress') {
      state.patchImportJob({ progress: { label: msg.label, pct: null } });
      state.setProgress(`parsing ${file.name}`);
      return;
    }

    finishWorker();
    state.setProgress(null);
    if (!msg.ok) {
      state.patchImportJob({ phase: 'message', message: `This file could not be read (${msg.error}).` });
      return;
    }
    const dataset = msg.dataset;
    if (dataset.entities.length === 0 && dataset.points.length === 0) {
      state.patchImportJob({
        phase: 'message',
        message: 'No drawable linework found in this DXF.',
      });
      return;
    }
    // Choices (docs/08 Phase 3): target = active surface by default; Z-mode only offered
    // when entities carry nonzero Z — default 'drape' (plan linework Z is often garbage),
    // remembered per session.
    const anyZ = dataset.entities.some((en) => en.hasZ);
    const defaultZMode = state.activeHandle
      ? anyZ
        ? (state.lastDxfZMode ?? 'drape')
        : 'drape'
      : 'native';
    state.patchImportJob({
      phase: 'findings',
      dxf: dataset,
      dxfTarget: state.activeHandle,
      dxfZMode: defaultZMode,
    });
  };

  worker.onerror = (err) => {
    finishWorker();
    store.getState().setProgress(null);
    store.getState().patchImportJob({
      phase: 'message',
      message: `This file could not be read (${err.message || 'worker error'}).`,
    });
  };

  const req: DxfWorkerRequest = { id, fileName: file.name, payload: file };
  worker.postMessage(req);
}

function parseGeotiffInWorker(file: File, worldFile: File | null): void {
  const id = ++msgId;
  const worker = new Worker(new URL('../workers/geotiff.worker.ts', import.meta.url), {
    type: 'module',
  });
  activeWorker = worker;

  worker.onmessage = (e: MessageEvent<GeotiffWorkerMessage>) => {
    const msg = e.data;
    if (msg.id !== id) return;
    const state = store.getState();

    if (msg.type === 'progress') {
      state.patchImportJob({ progress: { label: msg.label, pct: null } });
      state.setProgress(`reading ${file.name}`);
      return;
    }

    finishWorker();
    state.setProgress(null);
    if (msg.type === 'result' && !msg.ok) {
      state.patchImportJob({ phase: 'message', message: `This file could not be read (${msg.error}).` });
      return;
    }
    if (msg.type !== 'opened' || !msg.ok) {
      state.patchImportJob({ phase: 'message', message: 'This file could not be read (unexpected GeoTIFF worker response).' });
      return;
    }
    state.patchImportJob({
      phase: 'findings',
      geotiff: msg.dataset,
      geotiffTarget: state.activeHandle,
    });
  };

  worker.onerror = (err) => {
    finishWorker();
    store.getState().setProgress(null);
    store.getState().patchImportJob({
      phase: 'message',
      message: `This file could not be read (${err.message || 'worker error'}).`,
    });
  };

  const req: GeotiffOpenRequest = {
    kind: 'open',
    id,
    fileName: file.name,
    payload: file,
    worldFileText: null,
  };
  if (worldFile) {
    void worldFile.text().then((text) => {
      req.worldFileText = text;
      worker.postMessage(req);
    });
    return;
  }
  worker.postMessage(req);
}

function parsePdfInWorker(file: File): void {
  const id = ++msgId;
  const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
    type: 'module',
  });
  activeWorker = worker;

  worker.onmessage = (e: MessageEvent<PdfWorkerMessage>) => {
    const msg = e.data;
    if (msg.id !== id) return;
    const state = store.getState();

    if (msg.type === 'progress') {
      state.patchImportJob({ progress: { label: msg.label, pct: null } });
      state.setProgress(`reading ${file.name}`);
      return;
    }

    finishWorker();
    state.setProgress(null);
    if (msg.type === 'result' && !msg.ok) {
      state.patchImportJob({ phase: 'message', message: `This file could not be read (${msg.error}).` });
      return;
    }
    if (msg.type !== 'opened' || !msg.ok) {
      state.patchImportJob({ phase: 'message', message: 'This file could not be read (unexpected PDF worker response).' });
      return;
    }
    state.patchImportJob({
      phase: 'findings',
      pdf: msg.dataset,
      pdfLoadMode: msg.dataset.pageCount > 1 ? 'group' : 'individual',
    });
  };

  worker.onerror = (err) => {
    finishWorker();
    store.getState().setProgress(null);
    store.getState().patchImportJob({
      phase: 'message',
      message: `This file could not be read (${err.message || 'worker error'}).`,
    });
  };

  const req: PdfOpenRequest = {
    kind: 'open',
    id,
    fileName: file.name,
    payload: file,
  };
  worker.postMessage(req);
}

export function startPointCloudBuild(quality: LasImportQuality): void {
  const job = store.getState().importJob;
  const file = job?.sourceFile;
  if (!job || job.format !== 'las' || !file) return;
  store.getState().patchImportJob({
    pointCloudQuality: quality,
    phase: 'progress',
    progress: { label: `building ${qualityLabel(quality)} octree...`, pct: 0 },
  });
  parseLasInWorker(file, quality);
}

function qualityLabel(quality: LasImportQuality): string {
  if (quality === 'fast') return 'Fast';
  if (quality === 'all-detail') return 'All Detail';
  return 'Balanced';
}

function parseLasInWorker(file: File, quality: LasImportQuality): void {
  const id = ++msgId;
  const worker = new Worker(new URL('../workers/las.worker.ts', import.meta.url), {
    type: 'module',
  });
  activeWorker = worker;

  worker.onmessage = (e: MessageEvent<LasWorkerMessage>) => {
    const msg = e.data;
    if (msg.id !== id) return;
    const state = store.getState();

    if (msg.type === 'progress') {
      state.patchImportJob({ progress: { label: msg.label, pct: msg.pct } });
      state.setProgress(`reading ${file.name}`);
      return;
    }

    finishWorker();
    state.setProgress(null);
    if (!msg.ok) {
      state.patchImportJob({ phase: 'message', message: `This file could not be read (${msg.error}).` });
      return;
    }
    state.patchImportJob({
      phase: 'findings',
      pointCloud: msg.dataset,
    });
  };

  worker.onerror = (err) => {
    finishWorker();
    store.getState().setProgress(null);
    store.getState().patchImportJob({
      phase: 'message',
      message: `This file could not be read (${err.message || 'worker error'}).`,
    });
  };

  const req: LasWorkerRequest = { id, fileName: file.name, payload: file, quality };
  worker.postMessage(req);
}

/** Findings phase: Confirm → addSurface per checked surface → close → left panel opens (C2). */
export function confirmImport(): void {
  const state = store.getState();
  const job = state.importJob;
  const engine = engineHolder.current;
  if (!job || !job.surfaces || !engine) return;

  let firstAdded: SurfaceModel | null = null;
  job.surfaces.forEach((model, i) => {
    if (!job.checked?.[i]) return;
    firstAdded ??= model;
    addSurfaceToScene(model, job.fileName, job.fileSize ?? null);
  });
  if (firstAdded) {
    const m = firstAdded as SurfaceModel;
    state.setUnits(UNITS_LABEL[m.meta.units.linear] ?? m.meta.units.raw);
    state.openPanels();
  }
  state.setImportJob(null);
  processNext();
}

/** Shared by the import confirm and the ?testmesh path: engine add + store entry + note. */
export function addSurfaceToScene(
  model: SurfaceModel,
  fileName: string,
  sizeBytes: number | null = null,
): string | null {
  const engine = engineHolder.current;
  if (!engine) return null;
  const handle = engine.addSurface(model);
  const hasFaces = model.indices !== null;
  // Derived boundary (08 Phase 1): computed on demand in the RenderSurface and cached there;
  // we read the hole count once for the expanded row. Skipped above 500k faces to keep huge
  // testmesh loads snappy (the overlay itself still builds lazily when toggled on).
  const faces = model.report.counts['faces'] ?? 0;
  const holes = hasFaces && faces <= 500_000 ? (engine.derivedBoundaryInfo(handle)?.holeCount ?? null) : null;
  const entry: SurfaceEntry = {
    handle,
    name: model.name,
    points: model.report.counts['points'] ?? 0,
    faces,
    breaklines: model.breaklines.length,
    boundariesDefined: model.boundaries.length,
    holes,
    hasFaces,
    sizeBytes,
    dirty: model.dirty,
    display: defaultDisplaySettings(hasFaces),
  };
  useAppStore.getState().addSurfaceEntry(entry, {
    fileName,
    surfaceName: model.name,
    meta: model.meta,
    report: model.report,
  });
  engine.setActiveSurface(handle);
  applyAllDisplays(); // active just changed — mute states of the others change too (Phase 5)
  return handle;
}

/** DXF findings confirm (docs/08 Phase 3): engine add → drape per choices → store entry. */
export function confirmDxfImport(): void {
  const state = store.getState();
  const job = state.importJob;
  const engine = engineHolder.current;
  const dataset = job?.dxf;
  if (!job || !dataset || !engine) return;

  const handle = engine.addDxf(dataset, state.dxfDensify);
  const zMode = job.dxfZMode ?? 'drape';
  const target = zMode === 'drape' ? (job.dxfTarget ?? state.activeHandle) : null;
  const drape = engine.drapeDxf(handle, target, state.dxfDensify);

  if (job.dxfZMode) state.setLastDxfZMode(zMode); // session memory (Phase 3)

  // per-layer miss counts → import notes (Phase 4)
  if (drape && drape.offSurfaceVertices > 0) {
    const per = Object.entries(drape.perLayerMisses)
      .map(([l, n]) => `${l}: ${n}`)
      .join(', ');
    dataset.report.warnings.push(
      `${drape.offSurfaceVertices.toLocaleString()} draped vertices off-surface (dimmed + dashed) — ${per}`,
    );
  }

  const skipped = Object.entries(dataset.report.counts)
    .filter(([k]) => k.startsWith('skipped:'))
    .map(([k, v]) => `${k.slice(8)} ×${v}`)
    .join(', ');

  const layerStats = new Map<string, { entityCount: number; elevatedCount: number }>();
  for (const entity of dataset.entities) {
    const stats = layerStats.get(entity.layer) ?? { entityCount: 0, elevatedCount: 0 };
    stats.entityCount += 1;
    if (entity.hasZ) stats.elevatedCount += 1;
    layerStats.set(entity.layer, stats);
  }

  const entry: DxfEntry = {
    handle,
    name: dataset.name,
    sizeBytes: job.fileSize ?? null,
    entityCount: dataset.entities.length,
    pointCount: dataset.points.length,
    skippedSummary: skipped,
    drapeTarget: target ?? null,
    zMode,
    offSurfaceCount: drape?.offSurfaceVertices ?? 0,
    visible: true,
    layers: dataset.layers.map(
      (l): DxfLayerState => ({
        name: l.name,
        on: !l.hidden,
        color: `#${l.colorRGB.toString(16).padStart(6, '0')}`,
        opacity: 1,
        linetype: l.linetype,
        lineweight: l.lineweight,
        entityCount: layerStats.get(l.name)?.entityCount ?? 0,
        elevatedCount: layerStats.get(l.name)?.elevatedCount ?? 0,
      }),
    ),
  };
  state.addDxfEntry(entry, {
    fileName: job.fileName,
    surfaceName: dataset.name,
    meta: dataset.meta,
    report: dataset.report,
  });
  applyDxfDisplay(handle);
  state.openPanels();
  state.setLeftTab('dxf');
  state.setImportJob(null);
  processNext();
}

export function confirmGeotiffImport(): void {
  const state = store.getState();
  const job = state.importJob;
  const engine = engineHolder.current;
  const dataset = job?.geotiff;
  if (!job || !dataset || !job.sourceFile || !engine) return;

  const target = job.geotiffTarget ?? state.activeHandle;
  const handle = engine.addGeotiff(dataset, job.sourceFile, target);
  const entry: GeotiffEntry = {
    handle,
    name: dataset.name,
    sizeBytes: job.fileSize ?? null,
    width: dataset.width,
    height: dataset.height,
    samplesPerPixel: dataset.samplesPerPixel,
    crsText: dataset.crsText,
    pixelScale: dataset.geoTransform?.pixelScale ?? null,
    worldBounds: dataset.worldBounds,
    drapeTarget: target,
    visible: true,
    opacity: 1,
  };
  state.addGeotiffEntry(entry, {
    fileName: job.fileName,
    surfaceName: dataset.name,
    meta: dataset.meta,
    report: dataset.report,
  });
  state.openPanels();
  state.setImportJob(null);
  processNext();
}

export function confirmPdfImport(): void {
  const state = store.getState();
  const job = state.importJob;
  const dataset = job?.pdf;
  if (!job || !dataset) return;

  const fileStamp = Date.now().toString(36);
  const fileId = `pdf-file-${fileStamp}-${Math.random().toString(36).slice(2, 8)}`;
  const sheets: PdfSheetEntry[] = dataset.pages.map((page) => {
    const handle = `pdf-${fileStamp}-${page.pageIndex + 1}-${Math.random().toString(36).slice(2, 6)}`;
    return {
      handle,
      fileId,
      pageIndex: page.pageIndex,
      label: dataset.pageCount === 1 ? dataset.name : `${dataset.name} p.${page.pageIndex + 1}`,
      visible: true,
      groupId: null,
      calibration: null,
      orientation: null,
      placement: null,
      northArrow: null,
      scaleBar: null,
      knownDistance: null,
      markupOpacity: 1,
      markupColor: '#d4380d',
      edgeVisible: false,
      edgeColor: '#d4380d',
      borderCrop: null,
      blockOuts: [],
      markups: [],
      opacityPct: 100,
      whiteThreshold: 240,
      draped: false,
      drapeTargetSurfaceId: null,
      widthPx150: page.widthPx150,
      heightPx150: page.heightPx150,
      relativeLayoutPx: { x: 0, y: 0 },
    };
  });
  let group: PdfGroupEntry | null = null;
  if (dataset.pageCount > 1 && job.pdfLoadMode === 'group') {
    const groupId = `pdf-group-${fileStamp}-${Math.random().toString(36).slice(2, 8)}`;
    for (const sheet of sheets) sheet.groupId = groupId;
    group = {
      id: groupId,
      label: dataset.name,
      sheetIds: sheets.map((sheet) => sheet.handle),
      opacityPct: 100,
    };
    applyPdfGroupDefaultLayout(sheets, group);
  }
  state.addPdfSheets(sheets, group, {
    fileName: job.fileName,
    surfaceName: dataset.name,
    meta: dataset.meta,
    report: dataset.report,
  });
  pdfSourceFiles.set(fileId, job.sourceFile as File);
  for (let i = 0; i < sheets.length; i++) {
    engineHolder.current?.addPdf(sheets[i]!, job.sourceFile as File);
    engineHolder.current?.setPdfRenderOrder(sheets[i]!.handle, i);
  }
  state.openPanels();
  state.setImportJob(null);
  processNext();
}

export function confirmPointCloudImport(): void {
  const state = store.getState();
  const job = state.importJob;
  const engine = engineHolder.current;
  const dataset = job?.pointCloud;
  if (!job || !dataset || !engine) return;

  const handle = engine.addPointCloud(dataset);
  const octree = dataset.octree;
  const presentClasses = octree?.presentClasses ?? [];
  const presentReturns = octree?.presentReturns ?? [];
  const multiReturn = (octree?.maxReturnCount ?? 1) > 1 || presentReturns.length > 1;
  const entry: PointCloudEntry = {
    handle,
    name: dataset.name,
    sizeBytes: job.fileSize ?? null,
    pointCount: dataset.pointCount,
    pointFormat: dataset.pointFormat,
    lasVersion: dataset.lasVersion,
    bounds: dataset.bounds,
    pointDensityPerSqFt: dataset.pointDensityPerSqFt,
    visible: true,
    pointSize: 2,
    density: 100,
    displayMode: dataset.attributes.hasRgb ? 'rgb' : 'elevation',
    hasRgb: dataset.attributes.hasRgb,
    presentClasses,
    classFilter: Object.fromEntries(presentClasses.map((c) => [c, true])),
    presentReturns,
    multiReturn,
    returnsFilter: { first: true, last: true, intermediate: true },
    geotiffSource: null,
  };
  state.addPointCloudEntry(entry, {
    fileName: job.fileName,
    surfaceName: dataset.name,
    meta: dataset.meta,
    report: dataset.report,
  });
  state.openPanels();
  state.setLeftTab('point');
  state.setImportJob(null);
  processNext();
}

/** Cancel (any phase) discards parsed buffers and moves to the next queued file. */
export function cancelImport(): void {
  finishWorker();
  store.getState().setProgress(null);
  store.getState().setImportJob(null);
  processNext();
}

export function beginSurfaceExport(handle: string): void {
  const state = useAppStore.getState();
  const entry = state.surfaces.find((item) => item.handle === handle);
  const model = engineHolder.current?.getSurfaceModel(handle);
  if (!entry || !model) return;
  const summary = surfaceExportSummary(handle);
  state.setExportJob({
    surfaceHandle: handle,
    fileName: exportFileName(model.meta.fileName || entry.name),
    surfaceName: entry.name,
    modifiedVertexCount: summary.modifiedVertexCount,
    triangulationPreserved: model.provenance === 'source-explicit',
    breaklineCount: model.breaklines.filter((item) => item.sourceSpelling === 'spec-breaklines').length,
    boundaryCount: model.boundaries.length,
    contourCount: model.contours?.length ?? 0,
  });
}

export function cancelSurfaceExport(): void {
  useAppStore.getState().setExportJob(null);
}

export function confirmSurfaceExport(): void {
  const state = useAppStore.getState();
  const job = state.exportJob;
  if (!job) return;
  const model = engineHolder.current?.getSurfaceModel(job.surfaceHandle);
  if (!model) {
    state.setExportJob(null);
    return;
  }
  const summary = surfaceExportSummary(job.surfaceHandle);
  const { xml } = writeLandXML(model, {
    surfaceSummaries: {
      [model.id]: summary,
    },
  });
  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = job.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  state.setExportJob(null);
}

// ── display resolution (07 Phase 3/5) ─────────────────────────────────────────
// masterGates ∧ per-surface settings ∧ mute → ResolvedDisplay, pushed to the engine.
// The gates are NON-DESTRUCTIVE: per-surface state is never written by a gate toggle.

function resolveElement(el: ElementSettings, gate: boolean): { on: boolean; color: string; opacity: number } {
  return { on: el.on && gate, color: el.color, opacity: el.opacity };
}

function resolveDisplay(
  entry: SurfaceEntry,
  gates: MasterGates,
  activeHandle: string | null,
  surfaceCount: number,
  editSurfaceHandle: string | null,
  editTool: EditTool,
): ResolvedDisplay {
  const d = entry.display;
  // Non-active surfaces default muted (Phase 5); per-surface override wins.
  const mutedBySelection =
    d.mute === 'always' ||
    (d.mute === 'auto' && surfaceCount > 1 && entry.handle !== activeHandle);
  const forcedEditMute = editSurfaceHandle !== null && entry.handle !== editSurfaceHandle;
  return {
    visible: forcedEditMute ? true : d.visible,
    muted: forcedEditMute || mutedBySelection,
    faces: resolveElement(d.faces, gates.faces),
    edges:
      editSurfaceHandle === entry.handle
        ? { ...resolveElement(d.edges, true), on: true }
        : resolveElement(d.edges, gates.edges),
    breaklines: resolveElement(d.breaklines, gates.breaklines),
    boundary: resolveElement(d.boundary, gates.boundary),
    vertices: {
      ...resolveElement(d.vertices, editSurfaceHandle === entry.handle ? true : gates.vertices),
      on: editSurfaceHandle === entry.handle ? true : d.vertices.on && gates.vertices,
      size: editSurfaceHandle === entry.handle && editTool === 'editPoint' ? Math.max(d.vertices.size, 6) : d.vertices.size,
    },
    labels: { ...resolveElement(d.labels, gates.labels), content: d.labelContent },
  };
}

function applySurfaceDisplay(handle: string): void {
  const s = store.getState();
  const entry = s.surfaces.find((e) => e.handle === handle);
  if (!entry) return;
  engineHolder.current?.applyDisplay(
    handle,
    resolveDisplay(entry, s.masterGates, s.activeHandle, s.surfaces.length, s.editSurfaceHandle, s.editTool),
  );
}

export function applyAllDisplays(): void {
  const s = store.getState();
  for (const entry of s.surfaces) {
    engineHolder.current?.applyDisplay(
      entry.handle,
      resolveDisplay(entry, s.masterGates, s.activeHandle, s.surfaces.length, s.editSurfaceHandle, s.editTool),
    );
  }
}

// ── scene mutations (store + engine, kept in lockstep) ────────────────────────

export function setMasterGate(kind: ElementKind, on: boolean): void {
  useAppStore.getState().setMasterGate(kind, on);
  applyAllDisplays(); // gates are scene-level ANDs — per-surface state untouched
}

export function patchSurfaceElement(
  handle: string,
  element: ElementKind,
  patch: Partial<ElementSettings & { size: number }>,
): void {
  useAppStore.getState().patchElement(handle, element, patch);
  applySurfaceDisplay(handle);
}

/** Label content option (docs/08 Phase 6): Z (default) or N, E, Z. */
export function setSurfaceLabelContent(handle: string, content: DisplaySettings['labelContent']): void {
  useAppStore.getState().patchDisplay(handle, { labelContent: content });
  applySurfaceDisplay(handle);
}

export function setSurfaceMute(handle: string, mute: DisplaySettings['mute']): void {
  useAppStore.getState().patchDisplay(handle, { mute });
  applySurfaceDisplay(handle);
}

export function setSurfaceVisible(handle: string, on: boolean): void {
  useAppStore.getState().patchDisplay(handle, { visible: on });
  applySurfaceDisplay(handle);
}

export function setActiveSurface(handle: string): void {
  useAppStore.getState().setActive(handle);
  engineHolder.current?.setActiveSurface(handle);
  applyAllDisplays(); // mute state of every auto surface depends on who's active (Phase 5)
}

export function enterEditMode(handle: string): void {
  const state = useAppStore.getState();
  state.setEditPanelSnapshot({ leftOpen: state.leftOpen, rightOpen: state.rightOpen });
  state.setShowCanvasToolbar(true);
  state.enterEditMode(handle);
  engineHolder.current?.setEditMode(handle);
  engineHolder.current?.setActiveSurface(handle);
  state.setPanels(false, false);
  applyAllDisplays();
}

export function exitEditMode(): void {
  const state = useAppStore.getState();
  const snapshot = state.editPanelSnapshot;
  state.exitEditMode();
  if (snapshot) state.setPanels(snapshot.leftOpen, snapshot.rightOpen);
  engineHolder.current?.setEditMode(null);
  applyAllDisplays();
}

export function commitVertexZEdit(handle: string, vertexId: number, z: number): EditCommand | null {
  const command = engineHolder.current?.commitVertexEdit(handle, vertexId, undefined, undefined, z) ?? null;
  if (!command) return null;
  const state = useAppStore.getState();
  state.pushEditCommand(command);
  state.patchEntry(handle, { dirty: true });
  return command;
}

export function commitVertexEdit(
  handle: string,
  vertexId: number,
  nextE?: number,
  nextN?: number,
  nextZ?: number,
): EditCommand | null {
  const command = engineHolder.current?.commitVertexEdit(handle, vertexId, nextE, nextN, nextZ) ?? null;
  if (!command) return null;
  const state = useAppStore.getState();
  state.pushEditCommand(command);
  state.patchEntry(handle, { dirty: true });
  return command;
}

export function setEditTool(tool: EditTool): void {
  const state = useAppStore.getState();
  if (state.editTool === tool) return;
  state.setEditTool(tool);
  state.setEditSelection(null);
  engineHolder.current?.setEditTool(tool);
  engineHolder.current?.clearEditSelection();
}

export function triggerSingleEditTool(tool: EditTool): void {
  const state = useAppStore.getState();
  const handle = state.editSurfaceHandle ?? state.activeHandle;
  if (!handle) return;
  if (!state.editSurfaceHandle) {
    state.enterEditMode(handle);
    engineHolder.current?.setEditMode(handle);
    engineHolder.current?.setActiveSurface(handle);
  }
  state.setShowCanvasToolbar(false);
  state.setEditTool(tool);
  state.setEditSelection(null);
  engineHolder.current?.setEditTool(tool);
  engineHolder.current?.clearEditSelection();
  applyAllDisplays();
}

export function finishSingleActionEdit(): void {
  const state = useAppStore.getState();
  if (!state.editSurfaceHandle || state.showCanvasToolbar) return;
  state.exitEditMode();
  engineHolder.current?.setEditMode(null);
  applyAllDisplays();
}

export function clearEditSelection(): void {
  useAppStore.getState().setEditSelection(null);
  engineHolder.current?.clearEditSelection();
}

export function swapSelectedEdge(): void {
  const command = engineHolder.current?.swapSelectedEdge() ?? null;
  if (!command) return;
  const state = useAppStore.getState();
  state.pushEditCommand(command);
  state.patchEntry(command.surfaceId, { dirty: true });
}

export function undoEdit(): void {
  const state = useAppStore.getState();
  const surfaceId = state.editSurfaceHandle;
  const command = surfaceId ? state.popEditCommandForSurface(surfaceId) : state.popEditCommand();
  if (!command) return;
  engineHolder.current?.applyVertexCommand(command, true);
}

export function removeSurface(handle: string): void {
  const editingThis = useAppStore.getState().editSurfaceHandle === handle;
  useAppStore.getState().removeSurfaceEntry(handle);
  const engine = engineHolder.current;
  if (engine) {
    if (editingThis) engine.setEditMode(null);
    engine.removeSurface(handle);
    // re-read: the store just picked the successor active handle
    engine.setActiveSurface(useAppStore.getState().activeHandle);
    applyAllDisplays();
    // DXFs draped onto the removed surface fall back to native elevations (docs/08 Phase 4)
    for (const d of useAppStore.getState().dxfs) {
      if (d.drapeTarget === handle) redrapeDxf(d.handle, null);
    }
    for (const g of useAppStore.getState().geotiffs) {
      if (g.drapeTarget === handle) setGeotiffTarget(g.handle, null);
    }
    for (const p of useAppStore.getState().pdfSheets) {
      if (p.drapeTargetSurfaceId === handle) setPdfDrapeTarget(p.handle, null);
    }
    for (const group of useAppStore.getState().geotiffGroups) {
      if (group.drapeTarget === handle) {
        useAppStore.getState().patchGeotiffGroup(group.id, { drapeTarget: null });
      }
    }
  }
}

// ── DXF display + scene mutations (docs/08 Phases 4/5) ───────────────────────

/** dxfMasterOn ∧ entry.visible ∧ per-layer state → engine. Gates are non-destructive. */
export function applyDxfDisplay(handle: string): void {
  const s = store.getState();
  const entry = s.dxfs.find((d) => d.handle === handle);
  if (!entry) return;
  const layers = new Map<string, DxfLayerDisplay>();
  for (const l of entry.layers) {
    layers.set(l.name, { on: l.on, color: l.color, opacity: l.opacity });
  }
  engineHolder.current?.applyDxfDisplay(handle, s.dxfMasterOn && entry.visible, layers);
}

export function applyAllDxfDisplays(): void {
  for (const d of store.getState().dxfs) applyDxfDisplay(d.handle);
}

export function setDxfMasterOn(on: boolean): void {
  store.getState().setDxfMasterOn(on);
  applyAllDxfDisplays();
}

export function setDxfVisible(handle: string, on: boolean): void {
  store.getState().patchDxfEntry(handle, { visible: on });
  applyDxfDisplay(handle);
}

export function patchDxfLayerDisplay(
  handle: string,
  layer: string,
  patch: Partial<Omit<DxfLayerState, 'name'>>,
): void {
  store.getState().patchDxfLayer(handle, layer, patch);
  applyDxfDisplay(handle);
}

/** Re-drape against a (new) target surface — recompute on demand; source XY untouched. */
export function redrapeDxf(handle: string, targetHandle: string | null): void {
  const s = store.getState();
  const engine = engineHolder.current;
  if (!engine) return;
  const result = engine.drapeDxf(handle, targetHandle, s.dxfDensify);
  s.patchDxfEntry(handle, {
    drapeTarget: targetHandle,
    zMode: targetHandle ? 'drape' : 'native',
    offSurfaceCount: result?.offSurfaceVertices ?? 0,
  });
  applyDxfDisplay(handle); // rebuilt objects need the cached display re-applied
}

/** Densification setting (DXF tab quick control) — re-densify + re-drape every DXF. */
export function setDxfDensify(ft: number): void {
  const s = store.getState();
  s.setDxfDensify(ft);
  const engine = engineHolder.current;
  if (!engine) return;
  for (const d of s.dxfs) {
    const result = engine.drapeDxf(d.handle, d.zMode === 'drape' ? d.drapeTarget : null, ft);
    s.patchDxfEntry(d.handle, { offSurfaceCount: result?.offSurfaceVertices ?? 0 });
    applyDxfDisplay(d.handle);
  }
}

export function removeDxf(handle: string): void {
  store.getState().removeDxfEntry(handle);
  engineHolder.current?.removeDxf(handle);
}

export function setGeotiffVisible(handle: string, on: boolean): void {
  store.getState().patchGeotiffEntry(handle, { visible: on });
  const entry = store.getState().geotiffs.find((item) => item.handle === handle);
  engineHolder.current?.setGeotiffDisplay(handle, on, entry?.opacity ?? 1);
}

export function setGeotiffOpacity(handle: string, opacity: number): void {
  store.getState().patchGeotiffEntry(handle, { opacity });
  const entry = store.getState().geotiffs.find((item) => item.handle === handle);
  engineHolder.current?.setGeotiffDisplay(handle, entry?.visible ?? true, opacity);
}

export function setGeotiffTarget(handle: string, targetHandle: string | null): void {
  store.getState().patchGeotiffEntry(handle, { drapeTarget: targetHandle });
  engineHolder.current?.setGeotiffTarget(handle, targetHandle);
}

export function removeGeotiff(handle: string): void {
  store.getState().removeGeotiffEntry(handle);
  engineHolder.current?.removeGeotiff(handle);
}

export function setPdfVisible(handle: string, on: boolean): void {
  store.getState().patchPdfSheet(handle, { visible: on });
  const entry = store.getState().pdfSheets.find((sheet) => sheet.handle === handle);
  engineHolder.current?.setPdfDisplay(handle, on, entry?.opacityPct ?? 100);
}

export function setPdfOpacity(handle: string, opacityPct: number): void {
  store.getState().patchPdfSheet(handle, { opacityPct });
  const entry = store.getState().pdfSheets.find((sheet) => sheet.handle === handle);
  if (entry) {
    engineHolder.current?.setPdfDisplay(handle, entry.visible, opacityPct);
  }
}

function applyPdfGroupDefaultLayout(sheets: PdfSheetEntry[], group: PdfGroupEntry): void {
  const members = group.sheetIds
    .map((id) => sheets.find((sheet) => sheet.handle === id))
    .filter((sheet): sheet is PdfSheetEntry => !!sheet);
  if (members.length === 0) return;
  const sameSource = members.every((sheet) => sheet.fileId === members[0]!.fileId);
  if (!sameSource) {
    for (const sheet of members) { sheet.relativeLayoutPx = { x: 0, y: 0 }; }
    return;
  }
  let centerY = 0;
  let previousHeight = members[0]!.heightPx150;
  for (let i = 0; i < members.length; i++) {
    const sheet = members[i]!;
    if (i > 0) centerY -= previousHeight / 2 + sheet.heightPx150 / 2;
    sheet.relativeLayoutPx = { x: 0, y: centerY };
    previousHeight = sheet.heightPx150;
  }
}

export function removePdfSheet(handle: string): void {
  const entry = store.getState().pdfSheets.find((sheet) => sheet.handle === handle);
  store.getState().removePdfSheet(handle);
  engineHolder.current?.removePdf(handle);
  if (entry && !store.getState().pdfSheets.some((sheet) => sheet.fileId === entry.fileId)) {
    pdfSourceFiles.delete(entry.fileId);
  }
}

export function createPdfGroup(label: string, handles: string[]): void {
  const state = store.getState();
  const members = state.pdfSheets.filter((sheet) => handles.includes(sheet.handle));
  if (members.length === 0) return;
  const group: PdfGroupEntry = {
    id: `pdf-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    sheetIds: members.map((sheet) => sheet.handle),
    opacityPct: 100,
  };
  const nextMembers = members.map((sheet) => ({ ...sheet, groupId: group.id }));
  applyPdfGroupDefaultLayout(nextMembers, group);
  state.addPdfGroup(group);
  for (const sheet of nextMembers) {
    state.patchPdfSheet(sheet.handle, { groupId: group.id, relativeLayoutPx: sheet.relativeLayoutPx });
    engineHolder.current?.updatePdfSheet(sheet);
  }
}

export function removeSheetFromGroup(handle: string): void {
  const s0 = store.getState();
  const sheet = s0.pdfSheets.find((s) => s.handle === handle);
  if (!sheet || !sheet.groupId) return;
  const group = s0.pdfGroups.find((g) => g.id === sheet.groupId);
  if (!group) return;
  const nextSheetIds = group.sheetIds.filter((id) => id !== handle);

  if (nextSheetIds.length === 0) {
    store.getState().patchPdfSheet(handle, { groupId: null, relativeLayoutPx: { x: 0, y: 0 } });
    store.getState().removePdfGroup(group.id);
    const updated = store.getState().pdfSheets.find((s) => s.handle === handle);
    if (updated) engineHolder.current?.updatePdfSheet(updated);
    return;
  }

  const clones = s0.pdfSheets
    .filter((s) => nextSheetIds.includes(s.handle))
    .map((s) => ({ ...s }));
  const updatedGroup: PdfGroupEntry = { ...group, sheetIds: nextSheetIds };
  applyPdfGroupDefaultLayout(clones, updatedGroup);

  store.getState().patchPdfSheet(handle, { groupId: null, relativeLayoutPx: { x: 0, y: 0 } });
  store.getState().reorderPdfGroupSheets(group.id, nextSheetIds);
  for (const clone of clones) {
    store.getState().patchPdfSheet(clone.handle, { relativeLayoutPx: clone.relativeLayoutPx });
  }
  for (const clone of clones) {
    const fresh = store.getState().pdfSheets.find((s) => s.handle === clone.handle);
    if (fresh) engineHolder.current?.updatePdfSheet(fresh);
  }
  const removed = store.getState().pdfSheets.find((s) => s.handle === handle);
  if (removed) engineHolder.current?.updatePdfSheet(removed);
}

export function addSheetsToGroup(groupId: string, handles: string[]): void {
  const s0 = store.getState();
  const group0 = s0.pdfGroups.find((g) => g.id === groupId);
  if (!group0 || handles.length === 0) return;

  for (const h of handles) {
    const sheet = s0.pdfSheets.find((s) => s.handle === h);
    if (!sheet) continue;
    if (sheet.groupId && sheet.groupId !== groupId) {
      removeSheetFromGroup(h);
    }
  }

  const s1 = store.getState();
  const group = s1.pdfGroups.find((g) => g.id === groupId);
  if (!group) return;
  const clean: string[] = [];
  for (const h of handles) {
    if (!group.sheetIds.includes(h) && !clean.includes(h)) {
      clean.push(h);
    }
  }
  if (clean.length === 0) return;

  const nextSheetIds = [...group.sheetIds, ...clean];
  for (const h of clean) {
    store.getState().patchPdfSheet(h, { groupId: group.id });
  }

  const s2 = store.getState();
  const clones = s2.pdfSheets
    .filter((s) => nextSheetIds.includes(s.handle))
    .map((s) => ({ ...s }));
  const updatedGroup: PdfGroupEntry = { ...group, sheetIds: nextSheetIds };
  applyPdfGroupDefaultLayout(clones, updatedGroup);

  store.getState().reorderPdfGroupSheets(group.id, nextSheetIds);
  for (const clone of clones) {
    store.getState().patchPdfSheet(clone.handle, { relativeLayoutPx: clone.relativeLayoutPx });
  }
  for (const clone of clones) {
    const fresh = store.getState().pdfSheets.find((s) => s.handle === clone.handle);
    if (fresh) engineHolder.current?.updatePdfSheet(fresh);
  }
}

export function openPdfGroupScene(handle: string): void {
  store.getState().openPdfScene(handle, 'group');
}

export function setPdfGroupSheetOrder(
  groupId: string,
  nextSheetIds: string[],
): void {
  const state = useAppStore.getState();
  state.reorderPdfGroupSheets(groupId, nextSheetIds);
  const sheets = state.pdfSheets.filter((sheet) => nextSheetIds.includes(sheet.handle));
  for (let i = 0; i < nextSheetIds.length; i++) {
    const sheet = sheets.find((entry) => entry.handle === nextSheetIds[i]);
    if (sheet) engineHolder.current?.setPdfRenderOrder(sheet.handle, i);
  }
}

export function openPdfCalibrationScene(handle: string): void {
  store.getState().openPdfScene(handle, 'calibrate');
}

export function openPdfOrientationScene(handle: string): void {
  store.getState().openPdfScene(handle, 'orient');
}

export function returnToWorldScene(): void {
  store.getState().returnToWorldScene();
}

export function getPdfSourceFile(fileId: string): File | null {
  return pdfSourceFiles.get(fileId) ?? null;
}

export function setPdfCalibration(
  handle: string,
  calibration: { method: 'scale-value' | 'scale-bar' | 'known-distance'; pixelsPerUnit: number; unit: 'foot' | 'meter'; label: string },
): void {
  store.getState().patchPdfSheet(handle, { calibration });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setPdfOrientation(handle: string, orientation: number): void {
  store.getState().patchPdfSheet(handle, { orientation });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setWhiteThreshold(handle: string, threshold: number): void {
  const state = useAppStore.getState();
  const sheet = state.pdfSheets.find((entry) => entry.handle === handle);
  if (!sheet) return;
  const next = { ...sheet, whiteThreshold: threshold };
  state.patchPdfSheet(handle, { whiteThreshold: threshold });
  engineHolder.current?.updatePdfSheet(next);
}

export function setNorthArrow(handle: string, northArrow: PdfNorthArrow | null): void {
  store.getState().patchPdfSheet(handle, { northArrow });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setScaleBar(handle: string, scaleBar: PdfScaleBar | null): void {
  store.getState().patchPdfSheet(handle, { scaleBar });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setKnownDistance(handle: string, knownDistance: PdfKnownDistance | null): void {
  store.getState().patchPdfSheet(handle, { knownDistance });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setEdge(handle: string, patch: { visible?: boolean; color?: string }): void {
  const state = store.getState();
  const sheet = state.pdfSheets.find((item) => item.handle === handle);
  if (!sheet) return;
  state.patchPdfSheet(handle, {
    edgeVisible: patch.visible ?? sheet.edgeVisible,
    edgeColor: patch.color ?? sheet.edgeColor,
  });
  const updated = state.pdfSheets.find((item) => item.handle === handle);
  if (updated) engineHolder.current?.updatePdfSheet(updated);
}

export function setPdfFlatOffset(handle: string, layout: { x: number; y: number }): void {
  store.getState().patchPdfSheet(handle, { relativeLayoutPx: layout });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setPdfPlacement(handle: string, placement: PdfPlacement): void {
  store.getState().patchPdfSheet(handle, { placement });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setPdfDrapeTarget(handle: string, targetHandle: string | null): void {
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (!sheet) return;
  store.getState().patchPdfSheet(handle, {
    drapeTargetSurfaceId: targetHandle,
    draped: targetHandle !== null,
  });
  engineHolder.current?.setPdfDrapeTarget(handle, targetHandle);
}

export function setPdfBorderCrop(
  handle: string,
  borderCrop: BorderCrop | null,
): void {
  store.getState().patchPdfSheet(handle, { borderCrop });
  const sheet = store.getState().pdfSheets.find((item) => item.handle === handle);
  if (sheet) engineHolder.current?.updatePdfSheet(sheet);
}

export function setPointCloudVisible(handle: string, on: boolean): void {
  store.getState().patchPointCloudEntry(handle, { visible: on });
  const entry = store.getState().pointClouds.find((cloud) => cloud.handle === handle);
  engineHolder.current?.setPointCloudDisplay(handle, on, entry?.pointSize ?? 2);
}

export function setPointCloudPointSize(handle: string, pointSize: number): void {
  const clamped = Math.min(5, Math.max(1, pointSize));
  store.getState().patchPointCloudEntry(handle, { pointSize: clamped });
  const entry = store.getState().pointClouds.find((cloud) => cloud.handle === handle);
  engineHolder.current?.setPointCloudDisplay(handle, entry?.visible ?? true, clamped);
}

export function setPointCloudDensity(handle: string, density: number): void {
  const clamped = Math.min(100, Math.max(10, density));
  store.getState().patchPointCloudEntry(handle, { density: clamped });
  engineHolder.current?.setPointCloudDensity(handle, clamped / 100);
}

function pushPointCloudFilter(handle: string): void {
  const entry = store.getState().pointClouds.find((cloud) => cloud.handle === handle);
  if (!entry) return;
  engineHolder.current?.setPointCloudFilter(handle, {
    classes: entry.classFilter,
    returns: entry.returnsFilter,
  });
}

export function setPointCloudDisplayMode(handle: string, mode: PointCloudEntry['displayMode']): void {
  store.getState().patchPointCloudEntry(handle, { displayMode: mode });
  engineHolder.current?.setPointCloudDisplayMode(handle, mode);
  // GeoTIFF mode needs an overview source wired; (re)apply the chosen / first available source.
  if (mode === 'geotiff') applyPointCloudGeotiffSource(handle);
}

export function setPointCloudClassFilter(handle: string, code: number, on: boolean): void {
  const entry = store.getState().pointClouds.find((cloud) => cloud.handle === handle);
  if (!entry) return;
  const classFilter = { ...entry.classFilter, [code]: on };
  store.getState().patchPointCloudEntry(handle, { classFilter });
  pushPointCloudFilter(handle);
}

export function setPointCloudReturnFilter(
  handle: string,
  key: keyof PointCloudEntry['returnsFilter'],
  on: boolean,
): void {
  const entry = store.getState().pointClouds.find((cloud) => cloud.handle === handle);
  if (!entry) return;
  const returnsFilter = { ...entry.returnsFilter, [key]: on };
  store.getState().patchPointCloudEntry(handle, { returnsFilter });
  pushPointCloudFilter(handle);
}

export function setPointCloudGeotiffSource(handle: string, geotiffHandle: string | null): void {
  store.getState().patchPointCloudEntry(handle, { geotiffSource: geotiffHandle });
  applyPointCloudGeotiffSource(handle);
}

/** Resolve which GeoTIFF feeds the point cloud's geotiff color mode and wire it to the engine. */
function applyPointCloudGeotiffSource(handle: string): void {
  const state = store.getState();
  const entry = state.pointClouds.find((cloud) => cloud.handle === handle);
  if (!entry) return;
  const available = state.geotiffs;
  const chosen =
    entry.geotiffSource && available.some((g) => g.handle === entry.geotiffSource)
      ? entry.geotiffSource
      : available[0]?.handle ?? null;
  engineHolder.current?.setPointCloudGeotiffSource(handle, chosen);
}

export function removePointCloud(handle: string): void {
  store.getState().removePointCloudEntry(handle);
  engineHolder.current?.removePointCloud(handle);
}

export function createGeotiffGroup(name: string, handles: string[]): void {
  const state = store.getState();
  const members = state.geotiffs.filter((entry) => handles.includes(entry.handle));
  if (members.length < 2) return;
  const group: GeotiffGroup = {
    id: `geotiff-group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    handles: members.map((entry) => entry.handle),
    visible: members.every((entry) => entry.visible),
    opacity: members.reduce((sum, entry) => sum + entry.opacity, 0) / members.length,
    drapeTarget: members.every((entry) => entry.drapeTarget === members[0]?.drapeTarget)
      ? (members[0]?.drapeTarget ?? null)
      : null,
  };
  state.addGeotiffGroup(group);
  for (const handle of group.handles) {
    setGeotiffVisible(handle, group.visible);
    setGeotiffOpacity(handle, group.opacity);
    setGeotiffTarget(handle, group.drapeTarget);
  }
}

export function setGeotiffGroupVisible(id: string, on: boolean): void {
  const group = store.getState().geotiffGroups.find((item) => item.id === id);
  if (!group) return;
  store.getState().patchGeotiffGroup(id, { visible: on });
  for (const handle of group.handles) setGeotiffVisible(handle, on);
}

export function setGeotiffGroupOpacity(id: string, opacity: number): void {
  const group = store.getState().geotiffGroups.find((item) => item.id === id);
  if (!group) return;
  store.getState().patchGeotiffGroup(id, { opacity });
  for (const handle of group.handles) setGeotiffOpacity(handle, opacity);
}

export function setGeotiffGroupTarget(id: string, targetHandle: string | null): void {
  const group = store.getState().geotiffGroups.find((item) => item.id === id);
  if (!group) return;
  store.getState().patchGeotiffGroup(id, { drapeTarget: targetHandle });
  for (const handle of group.handles) setGeotiffTarget(handle, targetHandle);
}

export function dissolveGeotiffGroup(id: string): void {
  store.getState().removeGeotiffGroup(id);
}

export function setExaggeration(k: number): void {
  useAppStore.getState().setExaggeration(k);
  engineHolder.current?.setVerticalExaggeration(k);
}

export function setSun(azimuth: number, altitude: number): void {
  useAppStore.getState().setSun(azimuth, altitude);
  engineHolder.current?.setSun(azimuth, altitude);
}
