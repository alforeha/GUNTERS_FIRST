# TIN Viewer/Editor — Project Status & Priority-Setting Brief

*Prepared for product design / project management review — June 2026*

---

## Purpose of this document

The core import → edit → export loop for the TIN Viewer/Editor is now complete and verified end to end: a surface can be imported from LandXML, edited in the 3D viewer, exported back to LandXML, and re-imported into Carlson with the expected results. This document summarizes what was built, the current state of the application, and a backlog of parked feature ideas, so that a product designer and manager can help build a prioritized plan for the next round of work.

## Where things stand

| Stage | Outcome |
|---|---|
| Sprint 1-3 | Import pipeline, surface model contract, base viewer |
| Sprint 4 | LandXML breakline/source-data investigation and contract rev 1.2 fix |
| Sprint 5 | Carlson .tin support — permanently skipped (pre-existing decision) |
| Sprint 6 – 6.5 | Edit mode: move-point editing (N/E/Z), swap edge, undo/history, canvas + panel UX |
| Sprint 7 | LandXML export, round-trip tested |
| Sprint 7.1 | Export button fix — moved to right panel, wired to active surface |

## What was built (Sprints 6–7.1)

After the import pipeline and surface model were stabilized in earlier sprints, this round of work focused on closing the loop: letting a user edit a TIN surface in the viewer and get a usable LandXML file back out.

### Edit mode (Sprint 6 – 6.5)

Edit mode went through several rounds of UX refinement before landing on the model below — this iteration is itself useful context for the design conversation, since it surfaced a number of UX questions worth carrying into future tool design.

- **Move Point**: drag a vertex (or its on-canvas callout) to change its Northing, Easting, and Elevation. Edits go through a single write path with normal recomputation and BVH refit, with a guard that blocks moves which would invert a triangle's orientation.
- **Swap Edge**: flip the shared diagonal between two triangles on an interior edge; rejects boundary edges with an inline message.
- **In-canvas callout**: a draggable card anchored to the selected vertex (with a connector line) showing point ID and N/E/Z with +/- nudge controls and a delete-with-confirm stub.
- **Edit history**: a running, session-persistent list of every edit, with a single Undo button usable whether or not the user is currently in edit mode.
- **Two distinct edit-tool surfaces, by design**:
  - Right-panel "Edit Tools" cubes — momentary, single-action. Click once, make one change (e.g. one point move or one edge swap), and the app automatically returns to normal view.
  - In-canvas toolbar — entered via the right panel's "Edit Mode" toggle, for sticky multi-action sessions (e.g. swapping several edges in a row without re-selecting the tool).
- While in edit mode, points and edges are forced visible regardless of the surface's normal display settings, so there's always something to click.

### LandXML export (Sprint 7 – 7.1)

- Exports the active surface to LandXML 1.2, preserving source point IDs, point order, numeric precision, face order/visibility, units, breaklines, boundaries, and contours.
- An export findings dialog shows what changed before download — how many points were modified, and whether the original triangulation was preserved — writing to `<original>_edited.xml`.
- The export trigger lives in the right panel ("Export to LandXML"), operating on whichever surface is currently active; an early placeholder and a pair of misplaced buttons on DXF rows were removed in 7.1.
- Round-trip verified by PM: import → edit → export → re-import into Carlson, with expected results.

### Known open items (not blockers)

- Real local retriangulation when a moved point crosses into a neighboring triangle is not implemented — the app currently blocks the move at that boundary as a safe default. True retriangulation would be a future enhancement.
- Several edit tools are visible but intentionally stubbed/disabled: Add Point, Remove Triangles by Fence, Tag/Untag Breakline. Real point deletion and Redo are also not yet built.
- A breaklines question from Carlson (the "11 source data point lists" display) was investigated and confirmed to be expected behavior under the current LandXML contract, not a bug — logged with an option to revisit if matching Carlson's display is wanted later.

## v1.0 plan (confirmed June 2026)

Following a prioritization session, the project's vision expanded considerably beyond the original parked backlog — toward a "project real-world simulator" that layers imagery (GeoTIFF, PDF, point clouds) on the TIN surface for richer plan review, alongside a longer-term field/work-order workflow system. The work below is the agreed v1.0 scope: a sequence of 7 phases, ending with a re-scoped editor-completion pass and a clearly deferred v2/v3 backlog.

### Phase 1 — Viewer/camera fixes (formerly "Cluster C")

- **View mode switching (Top / 3D / Hover)**: switching modes should reorient the camera/controls in place, not reset the view to a different position. Currently switching to 3D or back to Top changes the whole view rather than just turning the camera.
- **Hover mode**: first-person, game-style navigation (standard game controls). On entry, the user selects a starting point on the surface model. Hover button joins the other view-nav controls as part of this phase.
- **Zoom / pan "stuck" bug**: a common issue in 3D renderers where scroll/pan appears to lock up. Mitigation ideas include a zoom slider as a manual override; hover mode may also reduce reliance on scroll-zoom and partially mitigate this.
- **Vertical exaggeration scaling**: investigate why exaggeration appears much more dramatic on the example surface than on a user-created topo surface — likely a bug where exaggeration is scaled relative to the dataset's elevation range/extent rather than applied as an absolute multiplier on elevation delta (e.g., a 6" curb head should look the same height at 10x regardless of overall site relief).

### Phase 2 — Panel/layout restructure

- Replace the current tabbed-view data display with a single view containing expandable sections — one section per loaded dataset, with rows that expand based on data type.
- Driven by feedback that earlier sprints had poor UI placements (e.g., export button location); this phase establishes a clearer layout convention before layer-specific UI (DXF, GeoTIFF, PDF, point cloud) is added on top of it.
- Foundational for Phases 3–5: each data type (DXF, GeoTIFF, PDF, point cloud) is conceptually an "imaginary layer" alongside the others, and the new panel needs to accommodate that model from the start.

### Phase 3 — DXF drape correctness (formerly "Cluster A")

- **Native hatching**: render DXF hatch patterns directly instead of requiring the user to explode hatches in CAD before import.
- **One-DXF-at-a-time drape**: DXF draping is scoped to one active DXF at a time, with right-panel UX updated accordingly (within the new Phase 2 layout).
- **Elevation/floating-element fix**: drape elements without elevation currently retain their original elevation — correct for imported contours, but causes other DXF elements (text, blocks, etc.) to appear floating above or below the surface inconsistently. Needs investigation into DXF elements to confirm behavior and define a clearer per-element-type rule.

### Phase 4 — Canvas annotation display (formerly "Cluster B")

- Display multileaders, text, and points from DXF/plan data directly in the 3D canvas as an app element (not just geometry).
- Motivation: typical plan review is exhausting and leads to missed issues from "autopiloting" on flat 2D paper. Surfacing leaders/text/annotations in the 3D view, alongside the 3D context itself (escaping the "everything is flat on paper" problem), is intended to catch issues that 2D mapping/contour settings can hide — e.g., 1-foot contour intervals skipping low points outside their range.

### Phase 5 — Imagery layers (formerly "Cluster D, Stage 1")

In priority order:

1. **GeoTIFF drape**: auto-place GeoTIFF (from a larger batch of 20+ orthomosaic/imagery tiles) and texture-drape onto the surface.
2. **PDF texture drape**: reuse the GeoTIFF drape pipeline to drape a PDF page as an image texture, with user-controlled placement and scale, cropping (to trim sheet edges/title blocks/callouts that would distort the drape), and white-background-to-transparent conversion when not in PDF-edit mode.
3. **Point cloud viewer**: display LAS point cloud data in the canvas. Scoped to *viewing* only for v1.0 — procedural point-cloud-to-environment rendering is deferred to v2/v3.

A second batch of reference files (DXF, PDF, XML, LAS point cloud, GeoTIFF) representing a complete project deliverable set has been added to support development and testing of this phase.

### Phase 6 — Editor completion (re-scoped from former item 7)

Deferred until after Phase 5 (PDF implementation) so it can be informed by DXF-editing considerations surfaced in Phases 3–5, since editor completion is expected to expand into DXF editing beyond COGO/surface considerations.

- Add Point — requires deciding how a new point gets triangulated into the existing mesh (nearest-triangle split at minimum).
- Remove Triangles by Fence — needs a new fence/lasso selection interaction; removing triangles may create holes that interact with existing boundary-detection logic.
- Tag/Untag Breakline — mostly a selection-UI problem; the underlying data model already supports it.
- Real point deletion (currently a confirm-and-stub) and Redo (currently not implemented).
- Real local retriangulation when a moved point crosses into a neighboring triangle (currently blocked as a safe default).

### Phase 7 — v2/v3 backlog (explicitly deferred)

- **Procedural point-cloud environments**: generating game-like environments from point cloud data (build on Phase 5's point cloud viewer).
- **PDF stack / sheet joining**: importing a PDF downloads each page independently; combining pages joins them into one canvas object the user can move to align at match lines.
- **Coordinate system handling**: a state coordinate system database (Cartesian ↔ world/geographic) or manual placement/transform, needed to support world-view/satellite-imagery underlays.
- **World view / map underlay / satellite imagery**: generate or import satellite/aerial imagery within a drawn boundary, draped as face color. Lower priority than Phase 5's imagery layers since it depends on coordinate system handling.
- **AR / photoreal ground view ("video game environment")**: long-range vision combining Phase 1 hover mode, Phase 5 imagery layers, and procedural point-cloud rendering — higher-definition rendering, automatic linework extraction from orthomosaic imagery, automatic feature recognition (power poles, trees). Its own scoping/feasibility pass required.
- **PDF-to-DXF digitizing engine**: import a PDF and digitize it to DXF, possibly with standard templates to ignore exterior borders and identify common blocks.
- **Work order / field workflow engine**: work order placement and execution forms; export a zip with field info, crew chief appends data and exports a report. Addresses that creating points is fast but plotting/cut-fill sheets/proof-of-work documentation is effort-intensive and often skipped. Likely requires a codelist and linework generation system, evolving into a DXF engine where the survey tech's full CAD environment (with xrefs, etc.) is saved as a DXF for crew chief use. Explicitly waits until most of the visualization work (Phases 1–5) is established.
- **Cross-layer data merging**: combining surfaces, joining DXFs — builds on the "imaginary layers" model established in Phase 2, becomes more relevant once individual layer types are mature.
- **DXF drape scope across multiple surfaces**: should DXF draping apply only to the active surface or all loaded surfaces? More relevant once a "merge surface" capability (above) exists.

## Open layout questions for design/PM

- Confirm exact layout of the new single-view, expandable-sections panel (Phase 2) before Phase 3 layer UI is built on top of it.
- Confirm per-element-type elevation rules for DXF drape (Phase 3).
- Confirm GeoTIFF auto-placement assumptions and PDF placement/scale UX (Phase 5).
- Confirm hover-mode entry UX (surface-model point selection) and whether any view-nav button layout changes are needed beyond adding Hover (Phase 1).
