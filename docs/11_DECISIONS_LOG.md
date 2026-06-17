# Decisions Log

Running log of PM questions/decisions handled between sprints, outside formal work orders.

---

## 2026-06-17 -- Phase 4 PDF Scene polish decisions (continued)

**Sheet reorder field (confirmed AL):** ^ / v reorder buttons write to sheetIds
directly. zOrder field is dead scaffolding -- remove it. Page number is not
meaningful once imported. Group membership (add/remove sheet) is a separate
future track.

**Transparency toggle in PDF Scene (confirmed AL):** floating toolbar button
per selected sheet that removes white background (same as 3D white-threshold).
Helps with overlay alignment work.

**Opacity slider in left panel:** parked / low priority. Per-sheet opacity
affecting both PDF Scene and 3D view. To be added in a later beautification
round alongside grouped overlay controls.

**Sheet alignment feature:** parked. Snap/align sheets at edges -- schedule
after drape work.

**Left panel row display:** single-page and multi-page PDF rows currently
display differently. Uniform interface is a beautification round item -- parked.

---

## 2026-06-17 -- Phase 4 PDF Scene polish decisions

**Y-axis convention (confirmed):** flatOffsetPx is model/world space, positive Y
up/north. 3D scene was correct. 2D PDF Scene was inverted. Fix applied to 2D
only (PdfScene.tsx). RenderPdf.ts and importController.ts untouched.

**Crop scope (confirmed AL):** polygon/rhombus crop implemented in same pass as
rectangular corner handles. borderCrop type upgraded to BorderCrop = CropRect |
CropPolygon in contract.ts. 3D tile clipping uses polygon bounding box for now
(exact polygon mask parked).

**zOrder field:** confirmed dead scaffolding as of this session. Not wired into
either render path. Parked -- do not schedule without AL confirmation.

**Drag rotate in group scene:** parked. Implement after selection/toolbar model
is stable. In-scene drag rotate already proven in SingleSheetScene; group scene
needs its own pointer-dispatch logic to avoid conflicting with sheet-move drag.

**Floating toolbar anchor:** screen-space overlay (not inside rotated sheet div).
Anchor computed from pan/zoom/flatOffsetPx, clamped 8px from viewport edges.
Rotation not factored into anchor in this pass (toolbar tracks center-top of
unrotated bounding box). Width-aware clamp for edge cases parked.

---

## 2026-06-15 — DXF drape multiplicity clarification

The project summary's "one-DXF-at-a-time drape" language is a misstatement. The correct model (confirmed AL 2026-06-15): **multiple DXFs can be draped simultaneously**; the constraint is that each individual DXF dataset is draped to only one surface at a time. This is already how Phase 2 was implemented (one drape-target per dataset row). No code change needed — just correcting the record so the summary doc isn't misread during Phase 6 DXF work.

---

## 2026-06-15 — Phase reorder (confirmed with AL)

Original phases 3–5 are re-sequenced. New v1.0 order after Phase 2:

- **Phase 3 — GeoTIFF drape** (pulled forward from original Phase 5, priority 1). Rationale: highest immediate value; GeoTIFF texture pipeline also likely reusable for DXF hatching, so it makes sense to build it first.
- **Phase 4 — PDF texture drape** (original Phase 5, priority 2 — reuses GeoTIFF pipeline).
- **Phase 5 — Point cloud viewer** (original Phase 5, priority 3 — view-only).
- **Phase 6 — DXF drape correctness** (original Phase 3 — pushed after imagery phases; hatching may reuse the texture engine built in Phase 3).
- **Phase 7 — Canvas annotation display** (original Phase 4 — pushed after DXF).
- **Phase 8 — Editor completion** (original Phase 6 — unchanged in content, renumbered).
- **Phase 9 — v2/v3 backlog** (original Phase 7 — unchanged).

DXF density control: AL confirmed this does not belong in the left panel. It is a display/render control and belongs in the right panel.

---

## 2026-06-15 — Phase 1 close-out: two open items parked for later phases

**1. Zoom slider edge case near DXF-at-Z=0 geometry (parked, not a blocker)**

After several investigation/fix rounds, the zoom slider was simplified back to reading `camera.position.distanceTo(orbitControls.target)` — the same value OrbitControls actually enforces — so read and write are now consistent and the stutter/divergence regression introduced by the raycast-based slider is gone. The original edge case (slider falsely reads "maxed in" when cursor-zooming near DXF elements at Z=0 pulls `orbitControls.target` to Z=0 while the camera is still far from the surface) is still present but infrequent and manageable. AL notes the Reset View control already mitigates it. **Flagged for revisit during Phase 3 DXF enhancements** — a DXF-aware zoom/target handler (e.g. exclude Z=0 DXF hits from `zoomToCursor` target computation, or clamp target to surface elevation band) would be a natural addition when DXF drape correctness is being worked anyway.

**2. Reset View in Hover mode jumps out of entry orientation (parked)**

AL noted that clicking Reset View while in Hover mode exits hover or snaps the camera to an unexpected orientation rather than returning to the hover entry point/orientation. No fix applied in Phase 1 — parked for Phase 1 cleanup or Phase 2 depending on priority. When addressed: Reset View in Hover should either (a) snap back to hover-entry position + orientation (most intuitive), or (b) be disabled/hidden while in Hover mode if "reset" in that context isn't meaningful.

---

## 2026-06-13 — Breakline display question (post-Sprint-4)

**PM observation:** On the surface PM knows has breaklines (visible in Carlson), the app now shows "no breaklines defined" and "11 source-data point lists" — wanted to confirm whether breaklines are missing/lost vs. expected.

**Resolution: expected behavior, not a bug.** This is the Sprint 4 Phase 0 / contract rev 1.2 fix working as designed:

- The investigation (Sprint 4, data-verified) found the 11 `SourceData/DataPoints/PntList3D` lists in `CO23012_TOPO.XML` are 10×256 + 222 = 2,782 points — the **entire surface point inventory**, chunked into 256-point pages. Not breaklines. Rendering them as polylines was the "spaghetti effect" PM previously reported as a bug.
- Contract rev 1.2 reclassified this data as `sourceDataPointLists` (count + total points, informational only, never rendered) and removed `'carlson-sourcedata'` as a valid `Breakline.sourceSpelling`. The only remaining breakline source is the spec `<Breaklines>` element.
- This file's `<Breaklines>` element is empty/absent — hence "no breaklines defined," and the breakline toggle correctly hides itself (Sprint 4 Phase 0 item 3).
- The "11 entries" PM sees in Carlson's UI as breaklines are very likely Carlson's own *display* of the `SourceData/DataPoints` pagination (same 11 lists) — i.e., Carlson may be showing the same underlying chunks as something breakline-like in its own UI, which is a separate question from what the LandXML schema defines as `<Breaklines>`.

**Open follow-up (not scheduled):** if PM wants those 11 chunks/lines actually drawn (matching what's seen in Carlson), that would require either (a) confirming Carlson treats `SourceData/DataPoints` as renderable linework in its own right (separate from the breakline-truth fix) and adding a new, honestly-labeled render category for it — not reusing the breakline label — or (b) sourcing a fixture where `<Breaklines>` is actually populated to confirm the spec path renders correctly (synthetic `spec-breaklines.xml` already covers this in tests). No action taken; flag if PM wants this revisited.

---

## 2026-06-13 — Sprint sequencing confirmed

- Sprint 5 (Carlson .tin) remains **permanently skipped** (pre-existing PM decision, `02_SPRINT_PLAN.md`).
- Sprint 6 = move-point Z editing (work order: `09_SPRINT6_WORK_ORDER.md`).
- Sprint 7 = LandXML export, closes import→edit→export loop (work order: `10_SPRINT7_WORK_ORDER.md`).
- **Hover/ground-view mode and all other new-feature ideas below are parked until after Sprint 7.** PM wants a dial-in/use period post-Sprint-7 before deciding whether the next round is feature work or polish/beta-interface work.
- Note: no git repo exists for this project — all work is file-based; PM may initialize git later.

---

## 2026-06-13 — Sprint 6.x sequencing (callout redesign, history, edit tools)

PM had assumed the fuller edit-tool set (move with retriangulation, swap edge, add point,
remove-by-fence, tag/untag breakline, edit history list, redesigned draggable callout) was
already in Sprint 6's scope. It wasn't — Sprint 6 was deliberately Z-first/no-half-edge
(`04` §5, risk R7) to prove the loop cheaply. Rather than relitigate, the remaining items are
being sequenced to land "close to what PM thought scope was" without blowing up a single
sprint:

- **Sprint 6.1** (`12_SPRINT6_1_WORK_ORDER.md`) — UX rework only: canvas toolbar, in-canvas
  callout, force-visible points/edges, panel auto-close. (Pre-existing, unchanged by this note.)
- **Sprint 6.2** (`13_SPRINT6_2_WORK_ORDER.md`) — callout redesign (draggable, N/E/Z +/-,
  delete), generalized N/E/Z write path, Move Point as real XY+Z drag with an
  orientation-check guard (no retriangulation — see below), edit-history list, and
  **Swap Edge** (risk register's "good candidate #2" topology edit).
- **Sprint 6.3+ (parked, not yet ordered):** Add Point, Remove Triangles by Fence,
  Tag/Untag Breakline — each needs its own design pass (triangulation-on-insert,
  fence-selection UI, breakline-selection UI respectively). Logged below.

**Retriangulation-on-crossing (PM's curiosity):** explicitly NOT built in 6.2. When a dragged
point would cross into a neighboring triangle, true retriangulation means re-triangulating
the local neighborhood around the moved point — this is the half-edge-adjacent work R7
deferred. 6.2 instead blocks the move at the boundary (safe default, already the documented
fallback). NOTES.md from 6.2 will include a short explainer on what real retriangulation
would involve, for PM's understanding — not a commitment to build it.

### Sprint 6.3+ parked edit tools

- **Add Point** — requires deciding how a new point gets triangulated into the existing mesh
  (nearest-triangle split at minimum).
- **Remove Triangles by Fence** — 2D-in-3D fence/lasso selection (new interaction) + mutates
  `indices`; may create holes — Sprint 4's derived-boundary hole detection becomes relevant.
- **Tag/Untag Breakline** — from the original post-Sprint-3 parked list; contract (rev 1.2)
  already shapes breaklines as `Polyline3D[]`, so this is mostly a selection-UI problem.

---

## Parked feature backlog (for post-Sprint-7 priority discussion)

Logged from PM sidebar, 2026-06-13. Not scheduled, no sprint assigned.

1. **Hover mode / ground-view camera.** PM's original framing: a mode useful for construction/civil managers to view the project from an augmented ground-level view. UI concept (AL's framing): in the Display Control Center top section, add a pill next to the selection pill with a checkbox to toggle the mode and a textbox for camera altitude above the surface; may also need a "go to point" control to snap the camera onto the surface to begin. PM specifically floated doing this *before* Sprint 6 editing — sequencing decision made 2026-06-13 to do it *after* Sprint 7 instead.

2. **Optional world view / map underlay / satellite imagery generation within a drawn boundary.** Goal: drape engine applies the generated imagery as color to faces. PM's proposed draw order, top to bottom: vertex, edge, face, DXF, PDF, aerial imagery.

3. **Coordinate system handling.** PM raised needing a state coordinate system database (Cartesian ↔ world/geographic) to support #2, but also wants a manual placement/transform option as a fallback or alternative — open question on which to build first or whether both are needed.

4. **Long-range: AR/photoreal ground view ("video game environment").** Builds on #1 (hover mode) + face imagery/pixelation from #2. Further ambitions: higher-definition rendering, automatic extraction of linework from orthomosaic imagery, automatic recognition of features like power poles or trees via pattern recognition. PM explicitly frames this as **its own project** — wants a rough scoping/feasibility estimate at some point, but not now. Editing this content is a separate, later consideration from just viewing it.

5. **PDF-to-DXF digitizing engine.** Import a PDF, digitize it to DXF; possibly ship with standard templates to help ignore exterior borders and identify blocks.

6. **DXF drape scope question.** Open question from PM, not yet decided: should DXF draping apply only to the *active* surface, or to all loaded surfaces? Relevant once "merge surface" (unify databases into a single source) exists — at that point draping the merged surface once would suffice. Until then, unclear whether per-surface draping on multiple surfaces is a meaningful performance drag, or manageable as long as surfaces don't overlap. No data yet — flag for investigation if multi-surface draping becomes relevant before merge-surface ships.

---

*(Append future PM sidebar items / decisions below, dated, in the same format.)*

---

## 2026-06-17 — PDF font rendering / square box characters (parked)

Square box characters appearing in PDF Scene where text is expected. AL is not concerned — linework and symbols are higher value than text fidelity. Likely cause is pdfjs-dist not locating embedded fonts in the Worker context.

AL noted a potential future feature: hide-text toggle per sheet. Also noted that some PDF text may be flattened into raster at export time (Carlson's pdfplot renderer) and therefore not recoverable as text by PDF.js regardless. Block-out polygons (already in Phase 4 scope) are the intended workaround for masking title blocks, legends, and text-heavy areas. Font rendering fix and hide-text feature parked for a later phase.

---

## 2026-06-17 — Phase 4 remaining work sequence (confirmed with AL)

After PDF rendering stabilized, AL confirmed the remaining Phase 4 sequence:

1. Calibration and orientation — test and validate with reference topo PDF
2. PDF Scene polish — cropping, rotating, and aligning pages in the group workspace
3. World placement and drape onto terrain — closes Phase 4

White-to-transparent threshold, block-out polygons, markup tools, and grouped overlay controls follow placement per the work order.

---

## 2026-06-17 — PDF base canvas caching (parked for later phase)

The PDF worker renders a full-page base canvas before any tiles can be decoded. For large PDFs (30MB ortho) this causes a multi-second blank before tiles appear. Current fix is a two-pass approach (lo-res placeholder → hi-res upgrade) implemented in Phase 4.

The correct long-term fix is to cache the rendered base canvas so repeat loads skip the expensive PDF.js render entirely. Two levels of caching to implement in a later phase:

1. **Session cache via Zustand store** — store the rendered base canvas (as a Blob or ImageBitmap) in app state after first render. Second open of the same PDF within a session is instant. No new infrastructure — fits existing store pattern.
2. **Persistent cache via IndexedDB** — cache rendered base canvas keyed by file name + size + modified date. Survives page reload. First load still pays the render cost; every subsequent load is instant. Requires adding an IndexedDB layer (new infrastructure, not currently in the app).

AL confirmed both are worth doing. Parked for Phase 9 or a dedicated performance phase after Phase 4 workflow is proven out.

---

## 2026-06-16 — Phase 4 PDF drape scoping (confirmed with AL)

Full work order in `docs/21_PHASE4_WORK_ORDER.md`. Key decisions:

**Multi-page / multi-file handling:** each PDF page is an independent object with its own calibration, orientation, crop, and markup state. On load of a multi-page PDF, user is prompted to load as group or individually. Pages can be grouped and ungrouped freely at any time. Groups are a convenience layer for placement and overlay control — not a merge.

**Calibration workflow:** three methods (direct scale entry, scale bar pick, known feature distance). All produce a pixels-per-foot ratio stored per sheet. Re-runnable independently from the left panel expanded row without resetting orientation or placement.

**Orientation:** user picks the north arrow on the PDF canvas to set world rotation angle. Re-runnable independently.

**Placement:** 2- or 3-point matching between PDF canvas picks and 3D viewport picks (point cloud, surface face, or GeoTIFF). 3-point uses least-squares fit and reports residual error. Re-runnable independently.

**Cropping — two features:** (1) border crop via draggable rectangle edges/corners; (2) block-out via arbitrary closed polyline, multiple polygons per sheet, each with visibility toggle.

**White-to-transparent threshold:** default 240 on R/G/B channels, user-adjustable slider per sheet.

**Grouped overlay controls:** z-order (drag-reorder), per-sheet opacity, group opacity.

**Markup tools:** highlight, polyline, callout note — baked into texture in Worker. Per-markup visibility toggle. Base raster cached to avoid re-decoding PDF on re-bake.

**PDF Scene:** new 2D canvas editing mode, separate from 3D viewport. Scene-switching architecture must be extensible — DXF Scene and TIFF Scene will follow the same pattern in later phases. Do not hardcode PDF assumptions into the scene-switching layer.

**Active dataset model context:** AL is moving toward a model where any dataset type (surface, DXF, GeoTIFF, PDF, point cloud) can be the active/selected object, with tools in the right panel changing based on what is selected. Phase 4 PDF Scene and its per-sheet tool buttons are designed with this in mind. Left panel beautification and active-selection model formalization is deferred to a later pass — AL wants to see the PDF scene working first before formalizing the broader pattern.

**npm dependency:** `pdfjs-dist` (Mozilla PDF.js). Vite setup for Worker script path needs to be documented by implementer in NOTES.md.
