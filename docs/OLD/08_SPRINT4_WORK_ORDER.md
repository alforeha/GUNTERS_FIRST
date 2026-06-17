# Sprint 4 Work Order — DXF Draped Underlay (+ breakline fix, derived boundary)

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** This document is self-contained: read it, then `04_IMPLEMENTER_NOTES.md` (§0/§0.1/§3/§4) and `NOTES.md`/`README.md` for current state. Layout/UX baseline is the shipped Sprint 3 UI.

**Current state (verified):** Sprints 1–3 green. LandXML-only import (PM decision: `.tin` path skipped permanently for now — routing message stays), Display Control Center with SURFACE tab live and DXF/POINT tabs as placeholders, viewer has exaggeration/sun/gizmo/BVH picking, 58/58 tests.

**Standing constraints (unchanged):** `ui → viewer → core` dependency rule; core stays DOM-and-Three-free; raw survey coords never in Float32 buffers; React out of the render loop; `// CARLSON-ASSUMPTION:` markers; contract frozen except where this order amends it; session-only, no localStorage.

**Fixtures:** `_REFS/CO23012_TOPO.XML` · four DXFs in `_REFS` — original pair (491 LWPOLYLINE / 4 layers / 5 INSERT / 4 MULTILEADER), `_EXPLODED.dxf` (1,033 LWPOLYLINE, **397 INSERT, 62 HATCH**, ATTRIB, 38 layers), `_EXPLODED_ALL.dxf` (**20,290 LINE**, 332 ELLIPSE, 261 ARC, 72 TEXT, 60 ATTDEF, 26 HATCH, **24 3DFACE**, 5 POINT, 33 layers). Audit details: `01_FILE_AUDIT.md` §3 + §6.

---

## Phase 0 — Breakline truth fix (bug, ship first)

**Discovery (lead, data-verified):** the sample's 11 `SourceData/DataPoints/PntList3D` lists are 10×256 + 222 = 2,782 points — the **entire surface point inventory chunked in 256-point pages**, not breaklines. Rendering them as polylines produced the breakline spaghetti the PM reported. The file defines no true breaklines.

Changes:

1. Parser: `SourceData/DataPoints` is **never** classified as breaklines. Reclassify as `sourceDataPoints` — count + total points go to the ImportReport (ℹ "11 source-data point lists (2,782 points) — informational, not rendered"). Spec `<Breaklines>` handling is unchanged and remains the only breakline source. Update the `// CARLSON-ASSUMPTION:` comment to record the corrected interpretation.
2. Contract amendment (rev 1.2, lead-approved): `Breakline.sourceSpelling` loses `'carlson-sourcedata'`; optional `sourceDataPointLists?: { count: number; totalPoints: number }` added to SurfaceModel. Migrate tests.
3. UI: breakline toggle (row icon + master gate) hides when a surface has zero breaklines; the Carlson sample now imports with "no breaklines defined" and no breakline icon.
4. Synthetic `<Breaklines>` fixture stays the toggle's test case.

Acceptance: Carlson sample shows no breakline spaghetti, dialog reports source data honestly, spec-breaklines fixture still renders.

## Phase 1 — Derived outer boundary

PM wants boundary visibility even when the file defines none (this one doesn't).

- `core/derivedBoundary.ts`: pure function `boundaryEdges(indices) → Uint32Array` — edges referenced by exactly one triangle (sort/count pass; trivially fast at 5k faces, fine at 1M with typed arrays). Holes in the TIN fall out for free as additional closed loops — label the longest loop "outer", the rest "holes (N)". This is *derived* display data: computed on demand, never stored on SurfaceModel, never exported.
- Viewer: `'boundary'` overlay (LineSegments, distinct color, polygonOffset). Surface-row icon + master gate. Expanded row shows hole count when > 0 — quiet setup for the parked **fill hole** edit tool.
- Import dialog: ℹ "No boundary defined in file — outer boundary derived from mesh edge" (and file-defined `<Boundaries>` still render as contract boundaries when present; same overlay, differentiated color).

Acceptance: sample shows a clean perimeter line; synthetic fixture with a hole shows outer + hole loops; toggle works.

## Phase 2 — DXF parse + normalize (core/worker)

Per `04` §4, against all four fixtures. `dxf-parser` in the parse worker; normalize to `DxfDataset` (contract addition rev 1.2, lead-approved — shape per `04` §4 plus below).

- Entities → polylines: LWPOLYLINE (incl. bulge/group-42 arc segments), POLYLINE, LINE, ARC, CIRCLE, **ELLIPSE**, SPLINE — tessellated at ~0.1 ft chord tolerance.
- INSERT: recursive explode through full transform (cycle-guarded, attribute entities skipped) — `_EXPLODED.dxf`'s 397 inserts are the stress test.
- HATCH: render **boundary linework only** (hatch fill on faces is parked); count in report.
- **POINT entities → `DxfDataset.points`** (id, XYZ, layer): stored + counted, *not rendered this sprint* — they feed the future POINT tab/CSV track. Zero-elevation counts reported (ℹ "5 points, 3 at zero elevation") — sets up the PM's planned default-filter idea without building it.
- 3DFACE → polyline outline, `hasZ: true` (they carry real elevations).
- TEXT/MTEXT/ATTRIB/ATTDEF/MULTILEADER: skip + count. Paper space: skip, note in report ("paper-space entities present: ignored").
- Layers: name, color (resolve ByLayer/ByBlock → RGB), linetype, lineweight inherited.
- Performance: `_EXPLODED_ALL.dxf` (20k LINEs) must parse in the worker without UI freeze; merge per-layer geometry into batched buffers (one LineSegments per layer, not per entity — non-negotiable at this entity count).

Acceptance: unit tests per fixture asserting the census numbers from `01` §6; unknown-entity junk fixture never throws.

## Phase 3 — DXF import dialog + drape choice

Same three-phase dialog (identifying → progress → findings). Findings: entity census, per-type skip counts, layer count, block/explode summary, paper-space note, point summary. Choices (render only when applicable):

- **Target surface** (default: active surface; only shown when ≥1 surface loaded; with no surfaces, DXF loads flat at native Z with ⚠ "no surface to drape onto — showing at source elevations").
- **Z handling** when entities carry nonzero Z (original pair's contours, 3DFACEs): "Drape to surface" (default) vs "Keep entity elevations". Remember choice per session.

## Phase 4 — Drape engine (viewer/core)

Per `04` §4: densify segments to max-edge-length (default 5 ft, exposed in DXF tab quick controls) → BVH vertical raycast per vertex against target surface → z = surface + 0.05 ft offset (exaggeration-aware). Misses keep last-known Z and render **dimmed + dashed** (PM-ratified off-surface style); per-layer miss counts to the report. DXF keeps source XY forever; drape is a recompute — switching target surface re-drapes on demand (single drape instance per DXF this sprint).

Acceptance: 200-ft straight test segment follows terrain, not a chord; contours drape onto the sample surface; off-surface linework visibly distinct.

## Phase 5 — DXF tab UI (replaces placeholder; spec from `07`)

Quick controls: all-on/off (non-destructive gates, same pattern as Surface tab) · densification setting · re-drape target selector. Asset rows: single-line (DXF icon, name, size, ∨) expanding to fill the tab — header line: entity count, skipped summary, drape target, off-surface count; scroll body: **layer rows — on/off · name · color · opacity · linetype · lineweight**. Layer visibility/color drive the batched per-layer render objects live. ℹ reopens import notes (same pattern as surfaces).

## Phase 6 — Label content option (small)

Per-surface label setting: content = `Z` (default) | `N, E, Z`. Lives in the expanded surface row next to label color/size; serializes into `DisplaySettings`. (Closes the PM's "X,Y,Z label" expectation — and note in README where the label toggle lives: second-line icon on each surface row, off by default.)

## Phase 7 — Acceptance walkthrough

- [ ] Phase 0/1: sample imports with no breakline spaghetti, honest source-data note, derived perimeter renders + toggles
- [ ] Original DXF: drapes with layers/colors; Z-choice offered (contours carry Z); MULTILEADER skip reported
- [ ] `_EXPLODED.dxf`: 397 inserts explode correctly; 62 hatch boundaries render; 38 layers listed and controllable
- [ ] `_EXPLODED_ALL.dxf`: parses without freeze; layer batching keeps scene interactive; TEXT/ATTDEF skips counted; 5 POINTs stored + reported (not rendered); 3DFACE Z honored under "keep elevations"
- [ ] Densification: straight segment follows terrain; setting changes take effect on re-drape
- [ ] Off-surface linework dimmed/dashed with per-layer miss counts in notes
- [ ] DXF with no surface loaded: flat at native Z with the warning
- [ ] Labels: content option works; toggle location documented
- [ ] All Sprint 2–3 behavior intact (import dialogs, panels, multi-surface, labels, fixtures)

**Definition of done:** typecheck/lint/tests/build green; README + NOTES.md (deviations + any DXF oddities found in the fixtures); PM runs Phase 7 in browser — the money shot is the exploded DXF draped over the topo with layers toggling.
