# TIN Viewer/Editor — PM Handoff (v2.0)

*Updated end of session — June 15, 2026*

---

## How to use this document

Read `TIN_Viewer_Project_Summary.md` first for full project history and the v1.0 plan. Read `docs/11_DECISIONS_LOG.md` for every confirmed decision made during and between sessions — it is the authoritative record of anything that diverged from the original plan.

**Your role per phase:**

1. Read the phase work order doc in `docs/` (numbered sequentially — Phase 3 is `20_PHASE3_WORK_ORDER.md`).
2. Work through any remaining "Confirm with AL" questions — the work order will flag what's already confirmed vs. still open.
3. Hand the work order to the implementer. Do not modify scope mid-sprint without flagging AL first.
4. When the implementer reports back, do a visual pass with AL before closing the phase.
5. Log any decisions or deviations in `docs/11_DECISIONS_LOG.md` (append, dated).

**Key rule the previous session learned the hard way:** if the work order doesn't explicitly say to remove or move something, it stays where it is. Flag scope ambiguity to AL before implementing, not after.

---

## Current state — end of Phase 2 (June 15, 2026)

Phases 1 and 2 are complete. The core import→edit→export loop was already working before this session. This session added:

- **Phase 1:** Top/3D/Hover camera switching (preserves position), Hover mode (WASD + click-drag mouse-look, pointer follows surface, Hover Height and Speed controls in HUD), zoom slider (always visible in 3D/Top, hidden in Hover), Reset View.
- **Phase 2:** Left panel restructured to type-grouped sections (Surfaces, DXF Files) with collapsible rows per dataset; existing view/display controls stay above the sections in the left panel. Right panel gains a Drape section (Add drape layer button + flat DXF drape rows with target reassignment and remove). DXF density control moved from left panel to right panel Drape section.

**Two open items from Phase 1 logged in decisions log:**
- Zoom slider occasionally reads "maxed in" near DXF-at-Z=0 geometry — manageable, revisit during Phase 6 DXF work.
- Reset View in Hover mode jumps to unexpected orientation — low priority, address before or during Phase 3.

---

## Phase reorder — confirmed with AL (June 15, 2026)

The original phase numbering has changed. New sequence:

| Phase | Work order | Goal |
|---|---|---|
| 1 | `18_PHASE1_WORK_ORDER.md` | ✅ Done — viewer/camera fixes |
| 2 | `19_PHASE2_WORK_ORDER.md` | ✅ Done — panel/layout restructure |
| 3 | `20_PHASE3_WORK_ORDER.md` | **Next** — GeoTIFF drape |
| 4 | `21_PHASE4_WORK_ORDER.md` | PDF texture drape |
| 5 | *(to be written)* | Point cloud viewer |
| 6 | *(to be written)* | DXF drape correctness + hatching |
| 7 | *(to be written)* | Canvas annotation display |
| 8 | *(to be written)* | Editor completion |
| 9 | — | v2/v3 backlog (explicitly deferred) |

Rationale for reorder: GeoTIFF is highest immediate value; its texture pipeline will likely be reused for DXF hatching in Phase 6, so it makes sense to build it first. DXF and annotation phases pushed to after imagery phases.

---

## Phase 3 — GeoTIFF drape

**Work order:** `docs/20_PHASE3_WORK_ORDER.md` — fully written, ready to hand to implementer now.

**Already confirmed with AL (no further questions needed before handing off):**
- Auto-place from georef data — yes, use embedded GeoTIFF tags / `.tfw` world file.
- Multi-tile stitching — yes, v1.0 scope. Multiple tiles from the same orthomosaic batch should render seamlessly adjacent on the surface. Each tile remains a separate entry in the right panel Drape section.
- Single drape target per dataset — each GeoTIFF drapes to one surface at a time, reassignable from right panel.

**Critical finding already in the work order (read before implementer starts):** the reference GeoTIFF (`_REFS/BATCH_2/ortho_7_...tif`) is 564 MB / 16,000 × 8,818 px. Tiling/LOD is mandatory — cannot load as a single texture. The coordinate system is NAD83(2011) / Colorado Central (ftUS) but the numeric range differs from the surface's LandXML coordinates — implementer must investigate the axis/offset mapping before implementing auto-placement and report findings in NOTES.md first.

**What the implementer needs to add to npm:** `geotiff` package for Worker-side TIFF decoding.

**Confirm with AL during Phase 3 (not before — these will be clearer once the implementer reports the coordinate investigation):**
- If the coordinate systems don't align cleanly, confirm the minimal v1.0 assumption with AL before implementing a workaround.
- Opacity slider default and range — 100% default is assumed; confirm if AL wants a different default once they see the texture on the surface.

---

## Phase 4 — PDF texture drape

**Work order:** `docs/21_PHASE4_WORK_ORDER.md` — fully scoped 2026-06-16, confirmed with AL. Ready for implementer assignment.

**Confirmed with AL (2026-06-16):**
- Reuses the GeoTIFF drape pipeline as rendering foundation.
- No georef metadata — placement is fully manual via calibration → orientation → placement workflow.
- Each page is an independent object; grouping is a convenience layer, not a merge.
- Multi-page load: prompt user to group or load individually; ungrouping always available.
- Calibration: three methods — direct scale entry, scale bar pick, or known feature distance.
- Orientation: north arrow pick sets world rotation angle.
- Placement: 2- or 3-point matching between PDF canvas and 3D scene (picks from point cloud, surface, or GeoTIFF).
- Each of calibrate / orient / place is independently re-runnable from the left panel expanded row.
- White-to-transparent threshold: default 240 (R/G/B), user-adjustable slider.
- Border crop: drag edges/corners of a rectangle per sheet.
- Block-out: arbitrary polyline mask per sheet, multiple polygons allowed, each with visibility toggle.
- Grouped overlay: z-order control (drag-reorder), per-sheet opacity, group opacity.
- Markup tools (baked into texture): highlight, polyline, callout note. Per-markup visibility toggle.
- PDF Scene: new 2D canvas mode for all PDF editing — not overlaid on 3D viewport. Extensible for DXF Scene and TIFF Scene in later phases.
- npm dependency: `pdfjs-dist` (Mozilla PDF.js).

**Open items for implementer (not PM):**
- Inspect both reference PDFs and confirm `pdfjs-dist` Worker setup in Vite before proceeding past import.
- Determine if topo PDF at 150 DPI exceeds GPU texture limits; report before implementing tiling (if needed).

---

## Phase 5 — Point cloud viewer

**Work order:** not yet written. Write it after Phase 4 closes.

**Confirmed with AL:**
- View-only for v1.0 — no editing, no point-cloud-to-surface conversion.
- Reference file: `_REFS/BATCH_2/CO25013_PNT CLD_250903.las`.

**Confirm with AL before writing the work order:**
- Expected interaction — pan/zoom/rotate only like other layers?
- Point count in the reference LAS file — implementer should inspect and report before committing to a rendering approach (potree-style octree vs. simple points budget).
- Coloring — RGB from LAS if available, or elevation-based colormap?
- Z-ordering when point cloud coexists with GeoTIFF and DXF on the same surface.

---

## Phase 6 — DXF drape correctness + hatching

**Work order:** not yet written. Write it after Phase 5 closes.

**Confirmed with AL:**
- Multiple DXFs can be draped simultaneously — the "one at a time" language in the original project summary was a misstatement. Each DXF drapes to one surface at a time (reassignable), but multiple DXFs can be active/draped concurrently.
- DXF hatching may reuse the texture engine built in Phase 3 — confirm this assumption with the implementer once Phase 3 is done.
- DXF density control now lives in the right panel Drape section (moved in Phase 2).

**Confirm with AL before writing the work order:**
- Native hatching fidelity expectation vs. AutoCAD/Carlson rendering.
- Elevation/floating-element fix: catalog which element types float above/below with the BATCH_2 DXF before proposing a per-type rule.
- Whether the zoom slider edge case near DXF-at-Z=0 geometry should be addressed here (logged in decisions log as a candidate for this phase).

---

## Phase 7 — Canvas annotation display

**Work order:** not yet written. Write it after Phase 6 closes.

**Confirm with AL before writing the work order:**
- Which DXF entity types in scope: multileaders and text confirmed; MTEXT, dimensions, others TBD.
- Billboard vs. original DXF orientation in 3D.
- Read-only or selectable/toggleable.
- Walk AL through a concrete example from the BATCH_2 DXF/PDF to confirm the feature addresses the "autopiloting on flat paper" problem as intended.

---

## Phase 8 — Editor completion

**Work order:** not yet written. Write it after Phase 7 closes — DXF editing considerations from Phases 6–7 will shape scope.

**Confirmed with AL (from original project summary):**
- Add Point, Remove Triangles by Fence, Tag/Untag Breakline, real point deletion, Redo, real local retriangulation.
- Scope may expand into DXF editing once Phases 6–7 surface specific needs.

---

## Phase 9 — v2/v3 backlog (explicitly deferred)

Do not pull items forward without an explicit re-prioritization conversation with AL. Full list in `TIN_Viewer_Project_Summary.md`. Includes: procedural point-cloud environments, PDF stack/sheet joining, coordinate system handling, world view/satellite imagery, AR/photoreal ground view, PDF-to-DXF digitizing, work order/field workflow engine, cross-layer data merging.

---

## Working norms AL cares about

- **Left panel = view/visibility controls.** Display toggles, per-dataset visibility, per-layer color/opacity. Nothing else.
- **Right panel = tools and value-added.** Drape management, drape-target assignment, edit tools, export. Not a mirror of the left panel.
- **Never move or remove existing controls without explicit direction from AL.** Flag ambiguity before implementing.
- **Flag deviations in NOTES.md immediately**, not buried in a PR description.
- **Visual review with AL before closing any phase.** Build/test passing is not sufficient — AL needs to see it running.
- **DXF clarification:** multiple DXFs can be draped simultaneously; each individual DXF drapes to one surface at a time.
