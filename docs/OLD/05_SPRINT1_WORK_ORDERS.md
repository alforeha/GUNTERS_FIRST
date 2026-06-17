# Sprint 1 Work Orders — Agent A & Agent B

**Status:** Approved by PM 2026-06-10. Direction locked: Vite + React + TS, Three.js via imperative `ViewerEngine`, React out of the render loop, Web Worker parsing, Zustand, single canvas.

Read first: `04_IMPLEMENTER_NOTES.md` (§0 conventions, **§0.1 normalized parser contract — binding**). Reference: `00` §4 layout, `01` audit facts, `03` risks R1–R3.

The two work orders are independent. **Do not coordinate, do not share code beyond `src/core/contract.ts`** (defined below, written first, owned by Agent B, reviewed by PM before either agent builds on it). Convergence happens in Sprint 2.

---

## Shared foundation: `src/core/contract.ts` (write this FIRST)

Single file defining the normalized surface contract per `04` §0.1. No imports (pure types + tiny helpers). Both agents code against it; neither changes it without PM sign-off.

```ts
// src/core/contract.ts — THE normalized contract. All parsers emit this; all consumers read this.

export interface SourceMeta {            // 1. source metadata
  fileName: string; format: 'landxml' | 'carlson-dtm' | 'dxf' | 'synthetic';
  producer?: string;                     // e.g. "Carlson Survey 2021"
  formatVersion?: string;                // e.g. "LandXML-1.2", "DTM rev 24603"
  units: { linear: 'usSurveyFoot' | 'foot' | 'meter'; raw: string };
}

export interface SurfaceModel {
  id: string; name: string;
  meta: SourceMeta;
  positions: Float64Array;               // 2. ORIGINAL coords, x=Easting y=Northing z=Elev, full precision, never mutated by rendering
  precisionHint: number;                 //    max decimal places seen in source (for faithful export)
  sourcePointIds: Uint32Array;           // 4. original ids (may be sparse) — preserved for export
  indices: Uint32Array | null;           // 5. faces (0-based); null = no faces in file → requiresRebuild
  faceVisibility: Uint8Array | null;     //    from <F i="1"> flags
  edges: Uint32Array | null;             // 6. source-defined edge records (pairs), if format provides them (Carlson DTM does); derived render edges are computed downstream, not stored here
  breaklines: Breakline[];               // 7.
  boundaries: Boundary[];                // 8.
  report: ImportReport;                  // 9. diagnostics, persisted with dataset
  provenance: 'source-explicit' | 'rebuilt-delaunay' | 'modified'; // 10.
  dirty: boolean;
}
// 3. Local rebased Float32 coords are NOT stored on SurfaceModel — they are derived render
//    state owned by the viewer (RenderSurface), regenerated from positions + SceneOrigin.

export interface Breakline { pts: Float64Array; sourceSpelling: 'spec-breaklines' | 'carlson-sourcedata' | 'dxf' }
export interface Boundary  { pts: Float64Array; kind: 'outer' | 'inclusion' | 'exclusion' }
export interface ImportReport {
  counts: Record<string, number>;        // points, faces, breaklines, boundaries, skipped entities…
  triangulationPreserved: boolean;
  warnings: string[]; infos: string[]; unknownElements: Record<string, number>;
}
```

Carlson-specific interpretation anywhere in parser code gets a `// CARLSON-ASSUMPTION:` comment (see `04` §0.1).

---

## Work Order A — App shell + ViewerEngine + perf gate

**Owner:** Agent A · **Touches:** `src/ui/`, `src/viewer/`, `src/state/`, scaffold files. **Does not touch:** `src/core/` (except importing `contract.ts` types), `src/workers/`.

### A1. Scaffold
Vite + React 18 + TypeScript strict. ESLint + Prettier defaults. Vitest. Folder structure per `04` §0 with dependency rule `ui → viewer → core` enforced by convention (comment in each folder's index).

### A2. Layout shell
Per `00` §4: header (title "gunters.app · TIN Viewer", menu stubs File/View/Tools/About/Privacy/Contact — render, no-op), left panel + right panel (collapsible, animated, default **collapsed**, state in Zustand), status bar (units · cursor N/E/Z · mode badge · progress slot), canvas fills remaining space and resizes correctly on panel collapse. Whole window is a drop target (visual hint only this sprint; drop handler stubs to console). Empty state: centered glyph + "Drop a LandXML or DXF file".

Dark, neutral, low-chrome styling; the canvas is the product. No component library needed — plain CSS modules or tailwind (agent's choice, note it in README).

### A3. ViewerEngine (`src/viewer/ViewerEngine.ts`)
Plain TS class, zero React imports. Public surface (keep minimal):

```ts
constructor(container: HTMLElement)
dispose()
setCameraMode(mode: 'orbit' | 'top')      // top = orthographic, rotation locked, preserves target
resetView()                                // frames current content bounds
addSurface(model: SurfaceModel): string    // builds RenderSurface (rebase + mesh); returns handle
removeSurface(handle: string)
setOverlay(handle: string, overlay: 'edges' | 'vertices', on: boolean)
onCursorPosition(cb: (pos: {e: number; n: number; z: number} | null) => void)  // original coords, not rebased
```

Internals: WebGL2 renderer, Z-up scene, perspective camera + OrbitControls, orthographic top camera (pan/zoom only), shared target; render-on-demand loop (render only when controls/scene dirty — battery matters for field laptops).

**SceneOrigin / rebasing (risk R1 — exit-gated):** first `addSurface` sets `SceneOrigin` = bbox center (Float64). RenderSurface = Float32 positions of `original − origin`. Cursor readout raycasts the surface and converts back to original coords for the status bar. Raw survey-magnitude values must never enter a Float32 buffer.

Overlays per `04` §3: edges = unique-edge `LineSegments` (one draw call, built from indices — not `EdgesGeometry`); vertices = `THREE.Points` sharing the position buffer.

### A4. Synthetic perf gate
`?testmesh=N` (default 1,000,000) generates simplex-noise terrain **at survey magnitudes** (center ≈ E 3,510,000 / N 1,511,000 / Z 4,190, extents ~5,000 ft) as a `SurfaceModel` with `meta.format: 'synthetic'`, then `addSurface`s it. This is both the perf fixture and the first consumer proving the contract works end-to-end.

### A5. Acceptance (Sprint 1 exit criteria, `02` S1)
- [ ] Layout matches spec; panels collapse/expand; canvas resizes without distortion
- [ ] Orbit/pan/zoom smooth; top mode locks rotation and preserves target; reset frames content
- [ ] 1M-vertex synthetic: ≥60 fps orbit, ≥30 fps with edges overlay (mid-range desktop GPU)
- [ ] **Zero vertex jitter** while zoomed to a ~10 ft window at survey coordinates (visual check + screenshot in PR)
- [ ] Cursor readout shows correct original E/N/Z (spot-check against generated values)
- [ ] `dispose()` leaks nothing (re-mount in dev StrictMode works)

### A6. Out of scope for A
File parsing, import dialog, real datasets, labels, color/transparency controls, vertical exaggeration (stub the right-panel slots), any `src/core` logic.

---

## Work Order B — LandXML worker parser

**Owner:** Agent B · **Touches:** `src/core/`, `src/workers/`. **Does not touch:** `src/ui/`, `src/viewer/`. **No DOM, no Three.js** — everything must run in Node (Vitest) and in a Worker.

### B1. `src/core/contract.ts`
Write it first, exactly as above (plus small helpers like `emptyReport()`). PR it separately and early — Agent A consumes it.

### B2. Parser (`src/core/landxml/parse.ts`)
Streaming scan (chunked string processing or minimal sax-style tokenizer; **no DOMParser** — R11). Pure function `parseLandXML(text: string | ReadableStream): { surfaces: SurfaceModel[] }`. Worker wrapper (`src/workers/parse.worker.ts`) handles File → stream → transferable-buffer postMessage; keep the wrapper thin so all logic is Node-testable.

Must handle (sample-verified vs schema-derived per `04` §2):
- `<Pnts>/<P id>` in **N E Z order** → store as x=E, y=N, z=Z *(sample-verified)*
- `<Faces>/<F>` 1-based ids → 0-based indices; `i="1"` invisible flags; ignore `n1..n3` *(flags schema-derived)*
- Breaklines BOTH spellings: spec `<Breaklines>` *(schema-derived)* and Carlson `<SourceData><DataPoints><PntList3D>` *(sample-verified)* — `// CARLSON-ASSUMPTION:` comment on the latter
- `<Boundaries>` with inclusion/exclusion kinds *(schema-derived)*
- Multiple `<Surface>` per file; metric and imperial `<Units>`; sparse/non-contiguous point ids
- Points without faces → `indices: null`, `triangulationPreserved: false`, warning "no faces — triangulation rebuild required"
- Namespace prefixes; unknown elements → counted in `report.unknownElements`, **never throw**
- `precisionHint` captured from source decimal places

### B3. Acceptance — unit tests against `_REFS/CO23012_TOPO.XML`
- [ ] 1 surface, name `CO23012_NW1_TOPO`, units usSurveyFoot, producer "Carlson Survey"
- [ ] 2,782 points; first point E 3510094.284 / N 1511101.218 / Z 4185.801; ids 1…2782
- [ ] 5,020 faces; first face indices (3, 4, 2) zero-based; `faceVisibility === null`
- [ ] 11 breaklines, all `sourceSpelling: 'carlson-sourcedata'`
- [ ] 0 boundaries; provenance `source-explicit`; `triangulationPreserved: true`
- [ ] Synthetic fixtures: metric file, two-surface file, faceless file, file with `<Breaklines>` spelling, file with junk unknown elements — all parse per rules above
- [ ] 100 MB synthetic LandXML (generator script in `tests/fixtures/`): parses in worker without exceeding ~3× file size peak memory; main-thread wrapper never blocks
- [ ] Every Carlson-specific interpretation carries a `// CARLSON-ASSUMPTION:` comment (grep check)

### B4. Out of scope for B
Rendering, import dialog UI, DXF, Carlson DTM binary (that's the Sprint 5 spike), Delaunay rebuild (stub: warning only), export.

---

## Convergence (Sprint 2 preview — not this sprint)

Drop handler → worker parse → `ImportReport` drives the import dialog → on confirm, `SurfaceModel` → `ViewerEngine.addSurface` → left-panel dataset list. The only interface between A's and B's work is `contract.ts` — if both work orders pass acceptance, integration is wiring, not negotiation.

## Definition of done (both)
PR with: passing tests/checks, README section for your area, screenshots (A) or test output (B), and a short NOTES.md listing any deviations from this order with reasons. PM handles merge.
