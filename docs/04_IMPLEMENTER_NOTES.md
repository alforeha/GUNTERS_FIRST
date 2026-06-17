# Implementer Notes

Specs for coding agents. Repo starts empty; PM handles Git.

## 0. Project conventions

- Vite + React 18 + TypeScript strict. Folders: `src/ui/` (React), `src/viewer/` (Three.js engine, no React imports), `src/core/` (SurfaceModel, parsers, exporters — no Three.js imports), `src/workers/`.
- Rule of dependencies: `ui → viewer → core`, never backwards. `core` is unit-testable in Node.
- State: Zustand store(s) in `src/state/`; viewer engine subscribes outside React.
- Test runner: Vitest. `_REFS/` files are test fixtures (read-only).

### 0.1 Normalized parser contract (PM directive — binding)

**Every parser (LandXML, Carlson DTM, DXF, future vendors) must output the same normalized contract regardless of source format.** Downstream code (viewer, draper, editor, exporter, compare) only ever consumes the contract. The contract clearly separates:

1. **Source metadata** — producer app, format/version, units, file name, original path hints
2. **Original coordinates** — Float64, full source precision, survey CRS values, never mutated by rendering
3. **Local rebased coordinates** — Float32 render copies derived from (2) + SceneOrigin; regenerable at any time
4. **Points** — with original ids preserved
5. **Faces** — triangle indices, visibility flags
6. **Edges** — derived unique edge set and/or source edge records
7. **Breakline relationships** — polylines, with source spelling noted (spec `<Breaklines>` vs Carlson `SourceData/DataPoints`)
8. **Boundary / inclusion / exclusion entities**
9. **Diagnostics / warnings** — the ImportReport, persisted with the dataset
10. **Provenance flags** — triangulation `source-explicit` vs `rebuilt-delaunay` vs `modified`

**Carlson-specific assumptions must be marked in code** with `// CARLSON-ASSUMPTION:` comments (e.g., breaklines under `SourceData/DataPoints`, N-E-Z point order interpretation tested only against Carlson output, DTM binary record layouts). This is how other vendor dialects get absorbed later without archaeology. Carlson is the active implementation/test basis — vendor samples beyond Carlson are currently unavailable, so build to the LandXML 1.2 schema and flag what's schema-derived vs sample-verified.

## 1. UI shell (Sprint 1 — Slice 1)

Layout per `00` §4: header (gunters.app title, File/View/Tools/About/Privacy/Contact — menus may stub), collapsible left/right panels (fixed-docked, animated collapse, remember state in-session), status bar (cursor N/E/Z placeholder, units, mode badge, progress area), full-bleed canvas between panels.

`ViewerEngine` (plain TS class):

- Owns renderer, scene, cameras, controls, render loop. React mounts it into a div and communicates only via methods/store subscription.
- Cameras: perspective orbit (OrbitControls) + orthographic top (rotation locked, pan/zoom only). Toggle preserves target point. `resetView()` frames active content bounds.
- **Origin rebasing:** `SceneOrigin` = first-loaded dataset's bbox center (Float64). All render positions = `source - origin`, Float32. Cursor readout converts back. Never put raw survey coords in a Float32 buffer.
- Z-up world (survey convention). Vertical exaggeration = scale on Z applied via matrix, not by mutating buffers.
- Dev flag `?testmesh=1000000` generates synthetic terrain (simplex noise over grid, at survey-magnitude coordinates ~N 1.5e6 / E 3.5e6) to prove the perf + precision gates.

Empty state: centered glyph + "Drop a LandXML or DXF file" hint; whole window is the drop target always (not only at empty state).

## 2. LandXML parser (Sprint 2 — Slice 2, parallelizable now)

Web Worker, streaming (chunked string scan or sax-style; **no DOMParser** — memory). Input: File. Output: `SurfaceModel[]` (transferable buffers) + `ImportReport`.

```ts
interface SurfaceModel {
  id: string; name: string;
  units: { linear: 'usSurveyFoot'|'foot'|'meter'; raw: string };
  positions: Float64Array;        // x=Easting, y=Northing, z=Elev (NOTE: LandXML <P> is N E Z — swap on read)
  sourcePointIds: Uint32Array;    // original ids — may be sparse/non-contiguous; preserve for export
  indices: Uint32Array | null;    // triangles, 0-based into positions; null => no faces in file
  faceVisibility: Uint8Array|null;// from <F i="1"> flags if present
  breaklines: Polyline3D[];       // from <Breaklines> OR Carlson <SourceData><DataPoints><PntList3D>
  boundaries: Boundary[];         // type: outer|inclusion|exclusion (untested in samples — implement from schema)
  provenance: 'source-explicit'|'rebuilt-delaunay'|'modified';
  dirty: boolean;
}
```

Must handle (per audit + schema, even where samples lack coverage): multiple `<Surface>`; metric units; `<P>` with/without id attrs; faces with `i`/`n1..n3` attrs (ignore neighbors, honor invisible); points-without-faces → `indices: null` + report `requiresRebuild`; `<Contours>` in source data (store, don't render yet); namespace prefixes; both breakline spellings. Unknown elements: count → `ImportReport.unknowns`, never throw.

`ImportReport`: per-surface counts (points, faces, breaklines, boundaries), triangulation-preserved bool, warnings[], infos[], unknowns[]. Drives the import dialog verbatim.

Unit tests against `_REFS/CO23012_TOPO.XML`: 2,782 points, 5,020 faces, 11 breaklines, first point (E 3510094.284, N 1511101.218, Z 4185.801), first face (3,4,2 zero-based), provenance `source-explicit`.

## 3. Rendering surfaces (Sprint 2–3)

- One `THREE.Mesh` per surface: indexed BufferGeometry, computed vertex normals, `MeshLambert/Standard` flat-ish shading; default colormap = single material color + slope-shaded lighting (no texture pass needed for MVP).
- Edges overlay: `THREE.LineSegments` built from unique edge set (Uint32 pair buffer) — NOT `EdgesGeometry` per-face (duplicates, memory). One draw call.
- Vertices overlay: `THREE.Points` reusing the position buffer with a cheap round sprite shader.
- Breaklines: `LineSegments`, distinct color, slight depth-offset (polygonOffset) to win z-fighting.
- Labels: troika-three-text instances, pooled; render only vertices within K units of camera AND in frustum, hard cap (e.g. 500 visible); auto-off with status note when over cap.
- Per-surface state (visibility/color/opacity/mute) maps to material params — muting = desaturate + opacity 0.4 + `depthWrite` kept on.
- Build a `three-mesh-bvh` BVH per surface after load (worker if slow); used for picking and draping.
- Vertical exaggeration: scene-level Z scale; labels and cursor readout must compensate.

## 4. DXF import + draping (Sprint 4)

Parse with `dxf-parser` (worker). Normalize to:

```ts
interface DxfDataset { id; name; layers: DxfLayer[]; entities: NormalizedEntity[]; report: ImportReport }
type NormalizedEntity = { layer: string; colorRGB: number;  // resolved ByLayer/ByBlock → RGB
  kind: 'polyline'; pts: Float64Array /* x,y,z triplets */; closed: boolean; hasZ: boolean }
```

Normalization rules: LWPOLYLINE/POLYLINE/LINE/ARC/CIRCLE/SPLINE → polylines (tessellate arcs incl. bulge group 42, ~chord tolerance 0.1 ft); INSERT → explode block contents through full transform (recursive, cycle-guarded); TEXT/MTEXT/MULTILEADER/HATCH/POINT → skip + count in report (TEXT rendering is a later nice-to-have); paper space ignored.

Draping: for each polyline, first **densify** segments to max-edge-length (default 5 ft, setting exposed), then per vertex cast vertical ray (BVH) against target surface; hit → z = surface + small offset (0.05 ft, exaggeration-aware); miss → keep last z, increment `offSurfaceCount` in report. If `hasZ` and entity zs are nonzero, import dialog offers "keep entity elevations" vs "drape to surface" (sample contours carry real Z — default to drape, since plan linework Z is often garbage; remember choice per import).

Layer panel: visibility + color override per layer; draped result re-usable against a different target surface later (store source XY, recompute drape on demand).

## 5. Editing architecture (Sprint 6 — design notes now, build later)

- Edit mode is a store state machine: `view ↔ edit(surfaceId)`. Entering: snapshot undo baseline, force-mute others, swap right panel. Exiting with `dirty && !exported`: confirm prompt.
- Move point: raycast pick (BVH, vertex snap radius in screen-space px) → highlight → drag along Z (or numeric input) → write position (Float64 source first, then rebased Float32 buffer), recompute normals for incident faces only (build vertex→face adjacency once per surface on first edit), refit BVH node (three-mesh-bvh `refit()`).
- XY moves: run incident-triangle orientation check; if any triangle flips, block with message (safe default) — no auto-retriangulation in first pass.
- Undo: command stack `{vertexId, oldXYZ, newXYZ}`; single-level minimum, design for N.
- Do NOT build half-edge yet. When add/delete/swap arrives, implement `EditableSurface` adapter behind SurfaceModel; viewer/exporter stay untouched.

## 6. LandXML export (Sprint 7)

Writer in `core/`, no DOM. Emit LandXML 1.2: Units (from source), Project/Application (note app name + provenance comment: "exported by gunters.app TIN editor; N vertices modified; triangulation preserved from source"), Pnts with **original ids** and N E Z order at full precision (match source decimal places — store per-surface precision hint at parse), Faces in original order. Round-trip test: parse → export → parse, assert value equality (not byte equality — whitespace may differ). Breaklines: re-emit as parsed (same element style as source where feasible).

## 7. Suggested build order for agents

1. **Agent A (S1):** shell + ViewerEngine + synthetic mesh gates (§1).
2. **Agent B (parallel):** LandXML worker parser + tests (§2) — no UI needed.
3. Integrate (S2): drop → worker → import dialog → render; toggles; dataset list.
4. Then S3 → S4 → S5 spike → S6 → S7 per `02_SPRINT_PLAN.md`.
