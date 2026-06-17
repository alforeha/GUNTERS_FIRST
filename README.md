# gunters.app · TIN Viewer

Local-first, browser-based TIN surface viewer (becoming an editor). Sprint 4 state: DXF
import lands — parsed in a worker, normalized to per-layer polylines, and **draped over the
TIN** with live layer control; plus the breakline truth fix (the Carlson sample's "breaklines"
were paginated source points) and a derived outer-boundary overlay.

Project docs live in `docs/` (`00`–`08`). Reference datasets in `_REFS/` are read-only test fixtures.

## Run

```
npm install       # Sprint 4 adds dxf-parser — re-run after pulling
npm run dev       # dev server
npm test          # vitest (core parser tests + viewer geometry/fixture tests)
npm run build     # typecheck (tsc --noEmit) + production build
npm run lint      # eslint
```

## UI (Sprint 3 — docs/07)

- **Header:** title + About · Privacy · Contact only. No File/View/Tools — all workflow goes
  through the panels. Drag/drop stays global (whole window, always).
- **Panels share the viewport with the scene:** both closed = full-bleed canvas; one open =
  50/50; both open = thirds. Collapse via the chevron in each panel's top bar; closed panels
  leave a slim edge tab that reopens them.
- **Left panel = Display Control Center.** Top section (always visible): Open… · 3D/Top toggle ·
  Reset view, plus vertical-exaggeration and sun (altitude + azimuth) sliders. Below: SURFACE ·
  DXF · POINT tabs (POINT is a styled placeholder until the CSV sprint).
  - SURFACE tab: master quick-toggles (scene-level gates, ANDed with per-surface settings —
    non-destructive) and a two-line row per surface: line 1 = name · counts · size · ℹ notes ·
    ✕ remove; line 2 = swap-style element chips (show/hide · F E B O V L · color swatch) with an
    expandable region for per-element color/opacity, vertex display size, label content, and the
    mute override (Auto / Never / Always). The B (breaklines) chip and master gate hide entirely
    when nothing loaded defines breaklines; O is the boundary overlay (Sprint 4).
  - DXF tab (Sprint 4): master show/hide gate + densification setting (ft), then one expanding
    row per DXF — header shows entity/skip/drape/off-surface summary, body scrolls **layer rows:
    on/off · name · color · opacity · linetype · lineweight** driving the batched per-layer
    render objects live. A re-drape selector switches the target surface (or back to source
    elevations) on demand. ℹ reopens the import notes.
- **Right panel = Tool & Analytic Control Center.** Active-surface pill (click to switch —
  synced with left-panel selection), ghosted Edit Surface section (Sprint 6), Export placeholder
  pinned at the bottom (Sprint 7). The empty middle is reserved analytics room.
- **Status bar:** units · cursor N/E/Z (true survey coords, exaggeration-compensated) · label
  pause note · mode badge · progress.

## Scene controls (Sprint 3)

- **Vertical exaggeration** (1–10×): a single Z-scale matrix on the content group — buffers are
  never mutated; the cursor readout and labels show true elevations throughout.
- **Sun / shading:** hillshade-style directional light driven by altitude + azimuth sliders
  (no shadow mapping — shading only, cheap). Low sun makes terrain relief pop.
- **North gizmo:** corner overlay (separate render pass), live-rotates with the camera; clicking
  the N marker snaps to top view (north-up by construction).
- **Close zoom:** `zoomToCursor` dolly (speed proportional to distance under the cursor),
  dynamic near/far planes from scene bounds, minDistance ≈ 0.3 ft — full extents → single
  triangle → back works without lock-up or clipping.
- **Labels v1:** pooled troika-three-text vertex elevation labels, frustum + distance culled,
  hard cap 500 visible; above the cap they auto-pause with a status-bar note. Refreshed when
  the camera comes to rest. **Where the label toggle lives: the second-line `L` chip on each
  surface row — off by default.** Sprint 4 adds a per-surface label-content option in the
  expanded row: `Z` (default) or `N, E, Z` (serialized into `DisplaySettings`).

## Multi-surface (Sprint 3)

Multiple surfaces coexist; exactly ONE is active (drives cursor readout + right-panel pill).
Switch instantly from the left-panel row or the right-panel pill. Non-active surfaces default
to **muted** (desaturated + 0.4 opacity, still occluding); per-surface override in the expanded
row. All per-surface/per-element display state lives in one plain-JSON `DisplaySettings` object
per surface (in-memory only — session-only is a product constraint; it becomes the planned
settings-export file format later).

### Perf / precision gate

Open the dev server with `?testmesh` (default 1,000,000 vertices) or `?testmesh=250000`:

```
http://localhost:5173/?testmesh
```

This generates simplex-noise terrain **at survey magnitudes** (center ≈ E 3,510,000 /
N 1,511,000 / Z 4,190, ~5,000 ft extents) and renders it through the normal `addSurface` path.
An fps readout appears in the status bar (render-on-demand: fps is only meaningful while
interacting). Checks: orbit ≥60 fps, edges overlay on ≥30 fps, zero vertex jitter zoomed to a
~10 ft window, cursor N/E/Z readout shows original survey coordinates, labels auto-pause note.

## Architecture (binding decisions — see docs/04 §0)

- Folders: `src/ui/` (React) → `src/viewer/` (Three.js, **zero React imports**) → `src/core/`
  (data model + parsers, **zero Three.js imports**, Node-testable). Dependencies point only in
  that direction. `src/workers/` hosts worker entry points.
- `src/core/contract.ts` is THE normalized surface contract (PM change-controlled). All parsers
  emit it; all consumers read it. Sprint 4 = rev 1.2: `Breakline.sourceSpelling` loses
  `'carlson-sourcedata'`, `SurfaceModel.sourceDataPointLists?` added, `DxfDataset` family added.
- **Origin rebasing (risk R1):** `SurfaceModel.positions` are Float64 original survey coords and
  are never mutated by rendering. The first loaded dataset's bbox center becomes the `SceneOrigin`;
  the viewer derives Float32 `source − origin` buffers (`RenderSurface`). Raw survey-magnitude
  values never enter a Float32 buffer. Cursor readout converts back to original coords.
- Render-on-demand loop (renders only when controls/scene are dirty). Hover picking is a
  separate raycast-only pass — pointer movement never triggers a full scene re-render, and
  picking is skipped while the camera is in motion (Sprint 3 lag fix).
- Edges overlay = unique-edge `LineSegments` (one draw call, shared position buffer); vertices
  overlay = `THREE.Points` sharing the same buffer. Picking is BVH-accelerated (three-mesh-bvh).
- Display resolution lives in the UI layer (`src/ui/importController.ts`): master gates ∧
  per-surface `DisplaySettings` ∧ mute state → one `ResolvedDisplay` pushed to the engine.
- State: Zustand. The viewer engine is bridged via transient subscriptions; high-frequency values
  (cursor, fps) are written straight to the DOM — React never re-renders per frame.

## Styling

Plain CSS (one global sheet + one CSS module) — no component library, no Tailwind. Dark, neutral,
low-chrome; the canvas is the product.

## Import pipeline (Sprint 2 — docs/06 Work Order C)

Drop any file on the window (multiple files queue, one dialog each) or use the left panel's
Open… button:

- `sniffFormat()` (`src/core/detect.ts`) identifies the format content-first (extension as
  fallback): `<LandXML` in the first 4 KB → LandXML (Carlson exports `.XML`); `#Carlson DTM`
  magic → Carlson DTM; DXF `0/SECTION` or AutoCAD header → DXF; `AC10xx` magic → DWG.
- LandXML parses in the worker with streamed progress (status bar + dialog); DXF parses in its
  own worker (Sprint 4) and gets a findings dialog with drape choices; other formats get honest
  routing messages (Carlson-DTM: later sprint; DWG: export DXF from CAD; unknown: what we
  looked for).
- The import dialog reports per-surface findings (points/faces/breaklines, triangulation
  preserved or rebuild-required warning, skipped/unknown elements) with file-level diagnostics
  shown once. Multi-surface files get per-surface checkboxes. Findings persist — reopen them
  any time via the ℹ icon in the surface row.

## DXF import + draped underlay (Sprint 4 — docs/08)

- **Parse + normalize** (`src/core/dxf/`): `dxf-parser` in a dedicated worker
  (`src/workers/dxf.worker.ts`), extended with custom entity handlers for HATCH (boundary
  linework), ATTRIB and MULTILEADER (skip + count). LWPOLYLINE (incl. group-42 bulge arcs),
  POLYLINE, LINE, ARC, CIRCLE, ELLIPSE and SPLINE tessellate to polylines at ~0.1 ft chord
  tolerance; INSERTs explode recursively through their full transforms (cycle-guarded);
  3DFACE → closed outline with real Z; POINT entities are stored (future POINT tab), never
  rendered; TEXT/MTEXT/ATTDEF/DIMENSION skip + count; paper space is ignored with a note.
  Colors resolve ByLayer/ByBlock → RGB; layer linetype/lineweight are recovered by a
  supplemental TABLES scan (dxf-parser drops them).
- **Drape** (`src/viewer/RenderDxf.ts`): segments densify to a max edge length (default 5 ft,
  DXF-tab setting) → BVH vertical raycast per vertex against the target surface → z = surface
  + 0.05 ft. Misses keep last-known Z and render **dimmed + dashed**, with per-layer miss
  counts in the import notes. Source XY is kept forever — switching the target surface (or
  the densification) is a recompute, never a mutation.
- **Batching:** geometry merges into per-layer buffers — at most two LineSegments per layer
  (solid + off-surface dashed), which is what keeps the 20k-LINE fixture interactive.
- **Import dialog:** entity census, per-type skip counts, layer count, explode summary,
  paper-space note, point summary; choices (when applicable): target surface (default: active)
  and "Drape to surface" vs "Keep entity elevations" (session-remembered). With no surface
  loaded the DXF shows flat at source elevations with a warning.
- **Derived boundary** (`src/core/derivedBoundary.ts`): edges referenced by exactly one
  triangle → outer perimeter + hole loops, rendered as the O overlay (file-defined
  `<Boundaries>` share the overlay in a differentiated color). Hole counts appear in the
  expanded surface row — quiet setup for the parked fill-hole tool.

## Sprint scope notes

- POINT tab arrives with CSV import (DXF POINTs are already stored + counted for it).
  Edit mode: Sprint 6. Export: Sprint 7. Hatch *fill* on faces: parked (boundaries render).
- `SurfaceModel.contours` (contract rev 1.1) stores `<Contours>` source data — not rendered yet.
- Sprint 4 Phase 0: `SourceData/DataPoints` is **never** classified as breaklines (it is the
  point inventory paginated at 256/chunk — see docs/01 §1). Spec `<Breaklines>` remains the
  only breakline source; the Carlson sample now reports "no breaklines defined".
- Dependency audit disposition lives in `NOTES.md` (D4): all findings are dev-toolchain only;
  the vite/vitest major bump is a scheduled later-sprint chore. Do not run `npm audit fix --force`.

## LandXML worker parser (`src/core/landxml/`, `src/workers/`) — Work Order B

Streaming LandXML 1.2 → normalized `SurfaceModel` (see `src/core/contract.ts`). No DOMParser
(risk R11), no DOM, no Three.js — everything runs in Node (Vitest) and in a Web Worker.

- `src/core/landxml/sax.ts` — minimal chunked tokenizer; tolerates splits anywhere (incl.
  mid-number), strips namespace prefixes, never throws on malformed input.
- `src/core/landxml/parse.ts` — `parseLandXML(text | ReadableStream, { fileName, onProgress,
  bytesTotal })` → `Promise<{ surfaces: SurfaceModel[] }>`. Handles: N E Z point order (swapped
  to x=E, y=N, z=Z), 1-based→0-based faces with `<F i="1">` visibility, both breakline spellings
  (spec `<Breaklines>` + Carlson `<SourceData><DataPoints>`), boundaries
  (outer/inclusion/exclusion), contours (stored — contract rev 1.1), multiple surfaces,
  metric/imperial units, sparse/missing point ids, faceless files (`indices: null` + rebuild
  warning), unknown elements → counted in `report.unknownElements` (file-scope diagnostics in
  `report.fileLevel` on the FIRST surface only), `precisionHint` from source decimal places.
  Carlson-specific interpretation is marked with `// CARLSON-ASSUMPTION:` comments (greppable;
  enforced by a test).
- `src/workers/parse.worker.ts` — thin wrapper: `File`/`Blob` → stream → parse → `postMessage`
  with transferable buffers; progress relayed as messages. Logic stays Node-testable.
- Tests: `tests/landxml.test.ts`, `tests/detect.test.ts`, `tests/perf-large.test.ts`
  (100 MB gate; skip with `SKIP_PERF=1`).
Sprint 6 state: DXF underlay remains live, and the first proof-of-concept edit loop is now in
place: enter edit mode, pick a vertex on the active surface, adjust **Z only** by numeric entry
or vertical drag, undo, see the dirty indicator, and exit with confirmation.
