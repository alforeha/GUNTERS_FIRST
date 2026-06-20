// src/state — Zustand store. UI reads reactively; the viewer engine and high-frequency
// readouts (cursor, fps) use transient subscriptions outside React renders.
// Engine side effects do NOT live here — src/ui/importController.ts pairs store updates
// with ViewerEngine calls so the store stays a plain data model.
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type {
  DetectedFormat,
  DxfDataset,
  GeotiffDataset,
  ImportReport,
  BorderCrop,
  BlockOutPolygon,
  PdfCalibration,
  PdfDocumentDataset,
  PdfMarkup,
  PdfNorthArrow,
  PdfScaleBar,
  PdfKnownDistance,
  PdfPlacement,
  PointCloudDataset,
  SourceMeta,
  SurfaceModel,
} from '../core';
import type { LasImportQuality } from '../workers/las.worker';

export type CameraMode = 'orbit' | 'top' | 'hover';
export type SceneMode = 'world3d' | 'pdf2d';
export type PdfSceneKind = 'group' | 'calibrate' | 'orient';

// ── per-surface display settings (07 Phase 3/5) ─────────────────────────────
// ONE plain-JSON-serializable object per surface — this becomes the backbone of the PM's
// planned settings-export/import config file. Session-only (product constraint): in-memory,
// no localStorage. Keep every member JSON-safe.

export interface ElementSettings {
  on: boolean;
  color: string; // '#rrggbb'
  opacity: number; // 0–1
}

export interface DisplaySettings {
  visible: boolean;
  /** mute/reference override: 'auto' = muted while non-active (default), or force. */
  mute: 'auto' | 'never' | 'always';
  faces: ElementSettings;
  edges: ElementSettings;
  breaklines: ElementSettings;
  /** derived outer boundary + file-defined <Boundaries> (docs/08 Phase 1) */
  boundary: ElementSettings;
  vertices: ElementSettings & { size: number }; // display size in px (07 ruling: Surface tab)
  labels: ElementSettings;
  /** label content (docs/08 Phase 6): elevation only (default) or full N, E, Z */
  labelContent: 'z' | 'nez';
}

export type ElementKind = 'faces' | 'edges' | 'breaklines' | 'boundary' | 'vertices' | 'labels';

/** Master quick-toggles (07 Phase 3 ruling): scene-level gates ANDed with per-surface
 *  settings — non-destructive; per-surface state survives gate off/on untouched. */
export type MasterGates = Record<ElementKind, boolean>;

// Defaults match the viewer's material constants (RenderSurface).
export function defaultDisplaySettings(hasFaces: boolean): DisplaySettings {
  return {
    visible: true,
    mute: 'auto',
    faces: { on: hasFaces, color: '#7d8f6e', opacity: 1 },
    edges: { on: false, color: '#53c7c0', opacity: 0.55 },
    breaklines: { on: false, color: '#d97757', opacity: 1 },
    boundary: { on: hasFaces, color: '#e84f8a', opacity: 1 }, // perimeter visible by default (08 Phase 1)
    vertices: { on: !hasFaces, color: '#e0b54a', opacity: 1, size: 3 },
    labels: { on: false, color: '#e8e2d0', opacity: 1 },
    labelContent: 'z',
  };
}

export interface SurfaceEntry {
  handle: string;
  name: string;
  points: number;
  faces: number;
  breaklines: number;
  /** file-defined <Boundaries> count */
  boundariesDefined: number;
  /** holes in the TIN (derived boundary loops beyond the outer; null = not computed) */
  holes: number | null;
  hasFaces: boolean;
  /** source file size in bytes (null for synthetic/testmesh datasets) */
  sizeBytes: number | null;
  dirty: boolean;
  display: DisplaySettings;
}

export interface EditSelection {
  surfaceHandle: string;
  vertexId: number;
  sourcePointId: number;
  e: number;
  n: number;
  z: number;
  precisionHint: number;
}

export interface EditCommand {
  type: 'moveVertex' | 'swapEdge';
  surfaceId: string;
  sourcePointId?: number;
  vertexId?: number;
  oldXYZ?: [number, number, number];
  newXYZ?: [number, number, number];
  edgeVertices?: [number, number];
  beforeIndices?: [number, number, number, number, number, number];
  afterIndices?: [number, number, number, number, number, number];
}

function modifiedVertexIdsForSurface(commands: EditCommand[], surfaceId: string | null): number[] {
  if (!surfaceId) return [];
  const ids = new Set<number>();
  for (const command of commands) {
    if (command.surfaceId !== surfaceId || command.vertexId === undefined) continue;
    ids.add(command.vertexId);
  }
  return [...ids];
}

export type EditTool =
  | 'addPoint'
  | 'editPoint'
  | 'swapEdge'
  | 'removeFence'
  | 'tagBreakline'
  | 'untagBreakline';

export interface PanelSnapshot {
  leftOpen: boolean;
  rightOpen: boolean;
}

// ── DXF datasets (docs/08 Phases 3/4/5) ─────────────────────────────────────

/** Per-layer display state for a DXF — on/off · color · opacity (+ linetype/lineweight
 *  inherited from the file, shown read-only/best-effort). */
export interface DxfLayerState {
  name: string;
  on: boolean;
  color: string; // '#rrggbb'
  opacity: number;
  linetype: string;
  lineweight: number; // 1/100 mm; −3 = default
  entityCount: number;
  elevatedCount: number;
}

export interface DxfEntry {
  handle: string;
  name: string;
  sizeBytes: number | null;
  entityCount: number;
  pointCount: number;
  /** "TEXT ×72, ATTDEF ×60" — for the expanded-row header line */
  skippedSummary: string;
  /** target surface handle (null = no drape: native Z / flat) */
  drapeTarget: string | null;
  /** 'drape' to surface vs 'native' entity elevations (docs/08 Phase 3 choice) */
  zMode: 'drape' | 'native';
  offSurfaceCount: number;
  visible: boolean;
  layers: DxfLayerState[];
}

export interface GeotiffEntry {
  handle: string;
  name: string;
  sizeBytes: number | null;
  width: number;
  height: number;
  samplesPerPixel: number;
  crsText: string | null;
  pixelScale: [number, number] | null;
  worldBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  drapeTarget: string | null;
  visible: boolean;
  opacity: number;
}

export interface GeotiffGroup {
  id: string;
  name: string;
  handles: string[];
  visible: boolean;
  opacity: number;
  drapeTarget: string | null;
}

export interface PdfSheetEntry {
  handle: string;
  fileId: string;
  pageIndex: number;
  label: string;
  visible: boolean;
  groupId: string | null;
  calibration: PdfCalibration | null;
  orientation: number | null;
  placement: PdfPlacement | null;
  borderCrop: BorderCrop | null;
  blockOuts: BlockOutPolygon[];
  markups: PdfMarkup[];
  northArrow: PdfNorthArrow | null;
  scaleBar: PdfScaleBar | null;
  knownDistance: PdfKnownDistance | null;
  /** opacity of system markup overlays (north/scale) in 2D + 3D, 0-1, default 1 */
  markupOpacity: number;
  /** layer color for system markups (default PDF red-orange #d4380d) */
  markupColor: string;
  edgeVisible: boolean;
  edgeColor: string;
  opacityPct: number;
  whiteThreshold: number;
  draped: boolean;
  drapeTargetSurfaceId: string | null;
  widthPx150: number;
  heightPx150: number;
  flatOffsetPx: { x: number; y: number };
}

export interface PdfGroupEntry {
  id: string;
  label: string;
  sheetIds: string[];
  opacityPct: number;
}

export type PointCloudDisplayMode = 'rgb' | 'intensity' | 'elevation' | 'geotiff';

export interface PointCloudReturnsFilter {
  first: boolean;
  last: boolean;
  intermediate: boolean;
}

export interface PointCloudEntry {
  handle: string;
  name: string;
  sizeBytes: number | null;
  pointCount: number;
  pointFormat: number;
  lasVersion: string;
  bounds: PointCloudDataset['bounds'];
  pointDensityPerSqFt: number | null;
  visible: boolean;
  pointSize: number;
  /** render-time density percentage, 10-100. Does not change the retained octree. */
  density: number;
  /** active display mode (Milestone 3). */
  displayMode: PointCloudDisplayMode;
  /** whether the source LAS carried real RGB (RGB option only enabled when true). */
  hasRgb: boolean;
  /** classification codes present in the file (for the filter toggle list). */
  presentClasses: number[];
  /** per-class enabled map (code → on). Missing = on. */
  classFilter: Record<number, boolean>;
  /** return numbers present; length>1 (or maxReturnCount>1) means multi-return. */
  presentReturns: number[];
  /** true when the file has more than one return per pulse. */
  multiReturn: boolean;
  returnsFilter: PointCloudReturnsFilter;
  /** chosen GeoTIFF handle for geotiff color mode (null = none / auto). */
  geotiffSource: string | null;
}

/** Findings persisted per dataset — reopenable via the left panel "Import notes" affordance (C2). */
export interface ImportNote {
  fileName: string;
  surfaceName: string;
  meta: SourceMeta;
  report: ImportReport;
}

export type ImportPhase = 'identifying' | 'progress' | 'findings' | 'message';

/** The one in-flight import dialog (files queue sequentially — C1). */
export interface ImportJob {
  fileName: string;
  /** source file size in bytes — carried into the surface row (07 Phase 3 line 1) */
  fileSize?: number;
  sourceFile?: File;
  phase: ImportPhase;
  format: DetectedFormat | null;
  /** friendly routing copy for non-LandXML formats — informational, never error-styled */
  message?: string;
  progress?: { label: string; pct: number | null };
  /** parsed surfaces awaiting confirm (findings phase) */
  surfaces?: SurfaceModel[];
  /** per-surface include checkboxes, parallel to surfaces (default all true) */
  checked?: boolean[];
  /** parsed DXF awaiting confirm (docs/08 Phase 3) */
  dxf?: DxfDataset;
  /** drape choices shown in the DXF findings phase (render only when applicable) */
  dxfTarget?: string | null;       // target surface handle (default: active surface)
  dxfZMode?: 'drape' | 'native';   // only offered when entities carry nonzero Z
  /** parsed GeoTIFF awaiting confirm (Phase 3) */
  geotiff?: GeotiffDataset;
  geotiffTarget?: string | null;
  /** parsed PDF awaiting confirm (Phase 4) */
  pdf?: PdfDocumentDataset;
  pdfLoadMode?: 'group' | 'individual';
  /** parsed LAS awaiting confirm (Phase 5 Milestone 1) */
  pointCloud?: PointCloudDataset;
  pointCloudQuality?: LasImportQuality;
  pointCloudPointCount?: number;
}

export interface ExportJob {
  surfaceHandle: string;
  fileName: string;
  surfaceName: string;
  modifiedVertexCount: number | null;
  triangulationPreserved: boolean;
  breaklineCount: number;
  boundaryCount: number;
  contourCount: number;
}

export interface CursorPos {
  e: number;
  n: number;
  z: number;
}

export type LeftTab = 'surface' | 'dxf' | 'point';

interface AppState {
  // panels (default collapsed per 00 §4; auto-open on first load)
  leftOpen: boolean;
  rightOpen: boolean;
  toggleLeft: () => void;
  toggleRight: () => void;
  openPanels: () => void;
  setPanels: (leftOpen: boolean, rightOpen: boolean) => void;
  leftTab: LeftTab;
  setLeftTab: (t: LeftTab) => void;

  // view
  sceneMode: SceneMode;
  activePdfSceneKind: PdfSceneKind | null;
  activeSceneObjectHandle: string | null;
  openPdfScene: (handle: string, kind: PdfSceneKind) => void;
  returnToWorldScene: () => void;
  cameraMode: CameraMode;
  setCameraMode: (m: CameraMode) => void;
  hoverArmed: boolean;
  setHoverArmed: (armed: boolean) => void;
  hoverHeight: number;
  setHoverHeight: (height: number) => void;
  hoverSpeed: number;
  setHoverSpeed: (speed: number) => void;

  // scene controls (07 Phase 2/3)
  exaggeration: number; // 1–10×, Z-scale matrix in the engine
  setExaggeration: (k: number) => void;
  sunAzimuth: number; // compass degrees
  sunAltitude: number; // degrees above horizon
  setSun: (azimuth: number, altitude: number) => void;
  masterGates: MasterGates;
  setMasterGate: (k: ElementKind, on: boolean) => void;

  // scene
  surfaces: SurfaceEntry[];
  activeHandle: string | null;
  importNotes: Record<string, ImportNote>;
  addSurfaceEntry: (s: SurfaceEntry, note?: ImportNote) => void;
  removeSurfaceEntry: (handle: string) => void;

  // DXF datasets (docs/08 Phases 3/4/5)
  dxfs: DxfEntry[];
  addDxfEntry: (d: DxfEntry, note?: ImportNote) => void;
  removeDxfEntry: (handle: string) => void;
  patchDxfEntry: (handle: string, patch: Partial<Omit<DxfEntry, 'handle' | 'layers'>>) => void;
  patchDxfLayer: (handle: string, layer: string, patch: Partial<Omit<DxfLayerState, 'name'>>) => void;
  geotiffs: GeotiffEntry[];
  addGeotiffEntry: (g: GeotiffEntry, note?: ImportNote) => void;
  removeGeotiffEntry: (handle: string) => void;
  patchGeotiffEntry: (handle: string, patch: Partial<Omit<GeotiffEntry, 'handle'>>) => void;
  geotiffGroups: GeotiffGroup[];
  addGeotiffGroup: (group: GeotiffGroup) => void;
  removeGeotiffGroup: (id: string) => void;
  patchGeotiffGroup: (id: string, patch: Partial<Omit<GeotiffGroup, 'id' | 'handles'>>) => void;
  pdfSheets: PdfSheetEntry[];
  pdfGroups: PdfGroupEntry[];
  addPdfSheets: (sheets: PdfSheetEntry[], group?: PdfGroupEntry | null, note?: ImportNote) => void;
  addPdfGroup: (group: PdfGroupEntry) => void;
  removePdfSheet: (handle: string) => void;
  patchPdfSheet: (handle: string, patch: Partial<Omit<PdfSheetEntry, 'handle'>>) => void;
  patchPdfGroup: (id: string, patch: Partial<Omit<PdfGroupEntry, 'id' | 'sheetIds'>>) => void;
  reorderPdfGroupSheets: (groupId: string, nextSheetIds: string[]) => void;
  removePdfGroup: (id: string) => void;
  pointClouds: PointCloudEntry[];
  addPointCloudEntry: (entry: PointCloudEntry, note?: ImportNote) => void;
  removePointCloudEntry: (handle: string) => void;
  patchPointCloudEntry: (handle: string, patch: Partial<Omit<PointCloudEntry, 'handle'>>) => void;
  /** DXF tab quick controls: master gate + densification (ft) — scene-level, non-destructive */
  dxfMasterOn: boolean;
  setDxfMasterOn: (on: boolean) => void;
  dxfDensify: number;
  setDxfDensify: (ft: number) => void;
  /** session memory for the Z-handling choice (docs/08 Phase 3) */
  lastDxfZMode: 'drape' | 'native' | null;
  setLastDxfZMode: (m: 'drape' | 'native') => void;
  setActive: (handle: string) => void;
  editSurfaceHandle: string | null;
  editSelection: EditSelection | null;
  editUndoStack: EditCommand[];
  editModifiedVertexIds: number[];
  editMessage: string | null;
  editDragging: boolean;
  editTool: EditTool;
  showCanvasToolbar: boolean;
  editPanelSnapshot: PanelSnapshot | null;
  enterEditMode: (handle: string) => void;
  exitEditMode: () => void;
  setEditSelection: (selection: EditSelection | null) => void;
  pushEditCommand: (command: EditCommand) => void;
  popEditCommand: () => EditCommand | null;
  popEditCommandForSurface: (surfaceId: string) => EditCommand | null;
  setEditMessage: (message: string | null) => void;
  setEditDragging: (dragging: boolean) => void;
  setEditTool: (tool: EditTool) => void;
  setShowCanvasToolbar: (show: boolean) => void;
  setEditPanelSnapshot: (snapshot: PanelSnapshot | null) => void;
  patchEntry: (handle: string, patch: Partial<Omit<SurfaceEntry, 'handle' | 'display'>>) => void;
  patchDisplay: (handle: string, patch: Partial<DisplaySettings>) => void;
  patchElement: (
    handle: string,
    element: ElementKind,
    patch: Partial<ElementSettings & { size: number }>,
  ) => void;
  units: string;
  setUnits: (u: string) => void;

  // import pipeline (C1/C2)
  importJob: ImportJob | null;
  setImportJob: (job: ImportJob | null) => void;
  patchImportJob: (patch: Partial<ImportJob>) => void;
  exportJob: ExportJob | null;
  setExportJob: (job: ExportJob | null) => void;
  /** read-only findings view for an already-loaded dataset (left panel notes icon) */
  notesHandle: string | null;
  setNotesHandle: (h: string | null) => void;

  // status bar
  progress: string | null;
  setProgress: (p: string | null) => void;
  /** label auto-off note (07 Phase 6): "Labels paused — too many vertices in view" */
  labelNote: string | null;
  setLabelNote: (n: string | null) => void;
  cursor: CursorPos | null; // transient — subscribe, don't select in render
  setCursor: (c: CursorPos | null) => void;
  fps: number | null; // transient — only populated when ?testmesh is active
  setFps: (f: number | null) => void;
}

export const useAppStore = create<AppState>()(
  subscribeWithSelector((set) => ({
    leftOpen: false,
    rightOpen: false,
    toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
    toggleRight: () => set((s) => ({ rightOpen: !s.rightOpen })),
    openPanels: () => set({ leftOpen: true, rightOpen: true }),
    setPanels: (leftOpen, rightOpen) => set({ leftOpen, rightOpen }),
    leftTab: 'surface',
    setLeftTab: (t) => set({ leftTab: t }),

    sceneMode: 'world3d',
    activePdfSceneKind: null,
    activeSceneObjectHandle: null,
    openPdfScene: (handle, kind) => set({ sceneMode: 'pdf2d', activePdfSceneKind: kind, activeSceneObjectHandle: handle }),
    returnToWorldScene: () => set({ sceneMode: 'world3d', activePdfSceneKind: null, activeSceneObjectHandle: null }),

    cameraMode: 'orbit',
    setCameraMode: (m) => set({ cameraMode: m }),
    hoverArmed: false,
    setHoverArmed: (armed) => set({ hoverArmed: armed }),
    hoverHeight: 5,
    setHoverHeight: (height) => set({ hoverHeight: height }),
    hoverSpeed: 15,
    setHoverSpeed: (speed) => set({ hoverSpeed: speed }),

    exaggeration: 1,
    setExaggeration: (k) => set({ exaggeration: k }),
    sunAzimuth: 315, // NW — classic hillshade default (matches engine DEFAULT_SUN)
    sunAltitude: 45,
    setSun: (azimuth, altitude) => set({ sunAzimuth: azimuth, sunAltitude: altitude }),
    masterGates: { faces: true, edges: true, vertices: true, breaklines: true, boundary: true, labels: true },
    setMasterGate: (k, on) => set((s) => ({ masterGates: { ...s.masterGates, [k]: on } })),

    surfaces: [],
    activeHandle: null,
    importNotes: {},
    addSurfaceEntry: (entry, note) =>
      set((s) => ({
        surfaces: [...s.surfaces, entry],
        activeHandle: entry.handle, // newest load becomes active (exactly one active — C3)
        importNotes: note ? { ...s.importNotes, [entry.handle]: note } : s.importNotes,
      })),
    removeSurfaceEntry: (handle) =>
      set((s) => {
        const surfaces = s.surfaces.filter((e) => e.handle !== handle);
        const importNotes = { ...s.importNotes };
        delete importNotes[handle];
        const activeHandle =
          s.activeHandle === handle ? (surfaces[0]?.handle ?? null) : s.activeHandle;
        const editingThis = s.editSurfaceHandle === handle;
        return {
          surfaces,
          importNotes,
          activeHandle,
          notesHandle: s.notesHandle === handle ? null : s.notesHandle,
          editSurfaceHandle: editingThis ? null : s.editSurfaceHandle,
          editSelection: editingThis ? null : s.editSelection,
          editUndoStack: editingThis ? [] : s.editUndoStack,
          editModifiedVertexIds: editingThis ? [] : s.editModifiedVertexIds,
          editMessage: editingThis ? null : s.editMessage,
          editDragging: editingThis ? false : s.editDragging,
          showCanvasToolbar: editingThis ? false : s.showCanvasToolbar,
        };
      }),
    setActive: (handle) => set({ activeHandle: handle }),
    editSurfaceHandle: null,
    editSelection: null,
    editUndoStack: [],
    editModifiedVertexIds: [],
    editMessage: null,
    editDragging: false,
    editTool: 'editPoint',
    showCanvasToolbar: false,
    editPanelSnapshot: null,
    enterEditMode: (handle) =>
      set((s) => ({
        activeHandle: handle,
        editSurfaceHandle: handle,
        editSelection: null,
        editModifiedVertexIds: modifiedVertexIdsForSurface(s.editUndoStack, handle),
        editMessage: null,
        editDragging: false,
        editTool: 'editPoint',
        showCanvasToolbar: s.showCanvasToolbar,
      })),
    exitEditMode: () =>
      set({
        editSurfaceHandle: null,
        editSelection: null,
        editMessage: null,
        editDragging: false,
        editTool: 'editPoint',
        showCanvasToolbar: false,
        editPanelSnapshot: null,
      }),
    setEditSelection: (selection) => set({ editSelection: selection }),
    pushEditCommand: (command) =>
      set((s) => {
        const editUndoStack = [...s.editUndoStack, command];
        return {
          editUndoStack,
          editModifiedVertexIds:
            s.editSurfaceHandle === command.surfaceId
              ? modifiedVertexIdsForSurface(editUndoStack, s.editSurfaceHandle)
              : s.editModifiedVertexIds,
        };
      }),
    popEditCommand: () => {
      let popped: EditCommand | null = null;
      set((s) => {
        if (s.editUndoStack.length === 0) return {};
        popped = s.editUndoStack[s.editUndoStack.length - 1] ?? null;
        const editUndoStack = s.editUndoStack.slice(0, -1);
        return {
          editUndoStack,
          editModifiedVertexIds: modifiedVertexIdsForSurface(editUndoStack, s.editSurfaceHandle),
        };
      });
      return popped;
    },
    popEditCommandForSurface: (surfaceId) => {
      let popped: EditCommand | null = null;
      set((s) => {
        let index = -1;
        for (let i = s.editUndoStack.length - 1; i >= 0; i--) {
          if (s.editUndoStack[i]?.surfaceId === surfaceId) {
            index = i;
            break;
          }
        }
        if (index < 0) return {};
        popped = s.editUndoStack[index] ?? null;
        const editUndoStack = s.editUndoStack.slice(0, index).concat(s.editUndoStack.slice(index + 1));
        return {
          editUndoStack,
          editModifiedVertexIds: modifiedVertexIdsForSurface(editUndoStack, s.editSurfaceHandle),
        };
      });
      return popped;
    },
    setEditMessage: (message) => set({ editMessage: message }),
    setEditDragging: (dragging) => set({ editDragging: dragging }),
    setEditTool: (tool) => set({ editTool: tool }),
    setShowCanvasToolbar: (show) => set({ showCanvasToolbar: show }),
    setEditPanelSnapshot: (snapshot) => set({ editPanelSnapshot: snapshot }),

    dxfs: [],
    addDxfEntry: (entry, note) =>
      set((s) => ({
        dxfs: [...s.dxfs, entry],
        importNotes: note ? { ...s.importNotes, [entry.handle]: note } : s.importNotes,
      })),
    removeDxfEntry: (handle) =>
      set((s) => {
        const importNotes = { ...s.importNotes };
        delete importNotes[handle];
        return {
          dxfs: s.dxfs.filter((d) => d.handle !== handle),
          importNotes,
          notesHandle: s.notesHandle === handle ? null : s.notesHandle,
        };
      }),
    patchDxfEntry: (handle, patch) =>
      set((s) => ({
        dxfs: s.dxfs.map((d) => (d.handle === handle ? { ...d, ...patch } : d)),
      })),
    patchDxfLayer: (handle, layer, patch) =>
      set((s) => ({
        dxfs: s.dxfs.map((d) =>
          d.handle === handle
            ? { ...d, layers: d.layers.map((l) => (l.name === layer ? { ...l, ...patch } : l)) }
            : d,
        ),
      })),
    geotiffs: [],
    geotiffGroups: [],
    addGeotiffEntry: (entry, note) =>
      set((s) => ({
        geotiffs: [...s.geotiffs, entry],
        importNotes: note ? { ...s.importNotes, [entry.handle]: note } : s.importNotes,
      })),
    removeGeotiffEntry: (handle) =>
      set((s) => {
        const importNotes = { ...s.importNotes };
        delete importNotes[handle];
        return {
          geotiffs: s.geotiffs.filter((g) => g.handle !== handle),
          geotiffGroups: s.geotiffGroups
            .map((group) => ({ ...group, handles: group.handles.filter((item) => item !== handle) }))
            .filter((group) => group.handles.length > 1),
          importNotes,
          notesHandle: s.notesHandle === handle ? null : s.notesHandle,
        };
      }),
    patchGeotiffEntry: (handle, patch) =>
      set((s) => ({
        geotiffs: s.geotiffs.map((g) => (g.handle === handle ? { ...g, ...patch } : g)),
      })),
    addGeotiffGroup: (group) =>
      set((s) => ({
        geotiffGroups: [...s.geotiffGroups, group],
      })),
    removeGeotiffGroup: (id) =>
      set((s) => ({
        geotiffGroups: s.geotiffGroups.filter((group) => group.id !== id),
      })),
    patchGeotiffGroup: (id, patch) =>
      set((s) => ({
        geotiffGroups: s.geotiffGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
      })),
    pdfSheets: [],
    pdfGroups: [],
    addPdfSheets: (sheets, group, note) =>
      set((s) => {
        const importNotes = { ...s.importNotes };
        if (note) {
          for (const sheet of sheets) importNotes[sheet.handle] = note;
        }
        return {
          pdfSheets: [...s.pdfSheets, ...sheets],
          pdfGroups: group ? [...s.pdfGroups, group] : s.pdfGroups,
          importNotes,
        };
      }),
    addPdfGroup: (group) =>
      set((s) => ({
        pdfGroups: [...s.pdfGroups, group],
      })),
    removePdfSheet: (handle) =>
      set((s) => {
        const importNotes = { ...s.importNotes };
        delete importNotes[handle];
        return {
          pdfSheets: s.pdfSheets.filter((sheet) => sheet.handle !== handle),
          pdfGroups: s.pdfGroups
            .map((group) => ({
              ...group,
              sheetIds: group.sheetIds.filter((id) => id !== handle),
            }))
            .filter((group) => group.sheetIds.length > 1),
          importNotes,
          activeSceneObjectHandle: s.activeSceneObjectHandle === handle ? null : s.activeSceneObjectHandle,
          activePdfSceneKind: s.activeSceneObjectHandle === handle ? null : s.activePdfSceneKind,
          sceneMode: s.activeSceneObjectHandle === handle ? 'world3d' : s.sceneMode,
          notesHandle: s.notesHandle === handle ? null : s.notesHandle,
        };
      }),
    patchPdfSheet: (handle, patch) =>
      set((s) => ({
        pdfSheets: s.pdfSheets.map((sheet) => (sheet.handle === handle ? { ...sheet, ...patch } : sheet)),
      })),
    patchPdfGroup: (id, patch) =>
      set((s) => ({
        pdfGroups: s.pdfGroups.map((group) => (group.id === id ? { ...group, ...patch } : group)),
      })),
    reorderPdfGroupSheets: (groupId, nextSheetIds) =>
      set((s) => ({
        pdfGroups: s.pdfGroups.map((group) =>
          group.id === groupId ? { ...group, sheetIds: nextSheetIds } : group,
        ),
      })),
    removePdfGroup: (id) =>
      set((s) => ({
        pdfGroups: s.pdfGroups.filter((group) => group.id !== id),
      })),
    pointClouds: [],
    addPointCloudEntry: (entry, note) =>
      set((s) => ({
        pointClouds: [...s.pointClouds, entry],
        importNotes: note ? { ...s.importNotes, [entry.handle]: note } : s.importNotes,
      })),
    removePointCloudEntry: (handle) =>
      set((s) => {
        const importNotes = { ...s.importNotes };
        delete importNotes[handle];
        return {
          pointClouds: s.pointClouds.filter((cloud) => cloud.handle !== handle),
          importNotes,
          notesHandle: s.notesHandle === handle ? null : s.notesHandle,
        };
      }),
    patchPointCloudEntry: (handle, patch) =>
      set((s) => ({
        pointClouds: s.pointClouds.map((cloud) => (cloud.handle === handle ? { ...cloud, ...patch } : cloud)),
      })),
    dxfMasterOn: true,
    setDxfMasterOn: (on) => set({ dxfMasterOn: on }),
    dxfDensify: 5, // ft — docs/04 §4 default
    setDxfDensify: (ft) => set({ dxfDensify: ft }),
    lastDxfZMode: null,
    setLastDxfZMode: (m) => set({ lastDxfZMode: m }),
    patchEntry: (handle, patch) =>
      set((s) => ({
        surfaces: s.surfaces.map((e) => (e.handle === handle ? { ...e, ...patch } : e)),
      })),
    patchDisplay: (handle, patch) =>
      set((s) => ({
        surfaces: s.surfaces.map((e) =>
          e.handle === handle ? { ...e, display: { ...e.display, ...patch } } : e,
        ),
      })),
    patchElement: (handle, element, patch) =>
      set((s) => ({
        surfaces: s.surfaces.map((e) =>
          e.handle === handle
            ? { ...e, display: { ...e.display, [element]: { ...e.display[element], ...patch } } }
            : e,
        ),
      })),
    units: 'US Survey Ft',
    setUnits: (u) => set({ units: u }),

    importJob: null,
    setImportJob: (job) => set({ importJob: job }),
    patchImportJob: (patch) =>
      set((s) => (s.importJob ? { importJob: { ...s.importJob, ...patch } } : {})),
    exportJob: null,
    setExportJob: (job) => set({ exportJob: job }),
    notesHandle: null,
    setNotesHandle: (h) => set({ notesHandle: h }),

    progress: null,
    setProgress: (p) => set({ progress: p }),

    labelNote: null,
    setLabelNote: (n) => set({ labelNote: n }),
    cursor: null,
    setCursor: (c) => set({ cursor: c }),
    fps: null,
    setFps: (f) => set({ fps: f }),
  })),
);
