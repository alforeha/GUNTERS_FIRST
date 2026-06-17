# Phase 2 Work Order — Panel/Layout Restructure

**Status:** Scoped 2026-06-15, confirmed with AL. Ready for implementer assignment.

Read first: `TIN_Viewer_PM_Handoff.md` (Phase 2 section), `TIN_Viewer_Project_Summary.md`, `00_DESIGN_HANDOFF.md` §4 (original layout spec). Current panel code: `src/ui/LeftPanel.tsx`, `src/ui/RightPanel.tsx`.

This phase is foundational — Phases 3–8 each add a new layer type or capability into the structure established here. Get it right before any new layer type is built on top of it.

---

## Left panel — grouped sections, collapsible rows

Replace the current tabbed layout with a single scrollable view containing **type-grouped sections**. Section order: Surfaces → DXFs → GeoTIFFs → (future: PDFs, Point Clouds). Sections only render when at least one dataset of that type is loaded — no empty placeholders.

**Each section** has a header label (e.g. "Surfaces", "DXF Files") and contains one collapsible row per loaded file.

**Each collapsible row** (collapsed state) shows:
- File name
- Visibility toggle (eye icon)
- If the dataset is draped to a surface: a small label noting which surface (e.g. "→ CO23012_NW1_TOPO") — read-only in the left panel; drape management lives in the right panel
- Expand chevron

**Each collapsible row** (expanded state) shows type-specific content:

- **Surface rows:** existing per-surface display controls (color, opacity, mute, active/lock, dirty indicator). This is largely what exists today, just moved out of tabs into this structure.
- **DXF rows:** list of DXF layers/elements with their types (e.g. "LWPOLYLINE × 491", "INSERT × 5", "MULTILEADER × 4") and per-layer visibility toggles. Elevation values per element shown where available. No density control here — that moves to right panel.
- **GeoTIFF rows:** file name, resolution/bounds info if readable, visibility toggle. Full drape/placement controls are in the right panel.

**The left panel is view/visibility control only.** No drape assignment, no import triggers, no density or render-quality controls — those all live in the right panel.

---

## Right panel — drape section below selector pill

The existing selector pill (Display / Edit Tools) stays. Below it, add a **Drape** section that is always visible once any surface is loaded (it's the entry point for all draping workflows).

**Drape section contains:**

1. **"Add drape layer" button** — opens the existing import dialog, pre-configured for drape content (DXF, GeoTIFF, PDF, point cloud). This is the primary import entry point for anything that gets layered onto a surface. The existing import flow already has a drape-target option — keep that, just surface it from here.

2. **List of currently draped datasets** — one row per draped dataset (DXF, GeoTIFF, etc.) showing:
   - Dataset name
   - Type badge (DXF / GeoTIFF / PDF / etc.)
   - Current drape target surface (dropdown to reassign — datasets can only drape to one surface at a time)
   - Remove/undock button

3. **Dataset-specific drape controls** — expand inline when a draped dataset row is selected/active:
   - DXF: density control (moved here from left panel), layer visibility (mirrors left panel toggles for convenience)
   - GeoTIFF: placement/opacity controls (specifics defined in Phase 3 work order)
   - PDF: placement/scale/crop/transparency (Phase 4)
   - Point cloud: (Phase 5, view-only)

The right panel's Display section (vertical exaggeration, color, sun/lighting) and Edit Tools section remain unchanged — just reorganized to sit below the new Drape section in a logical order.

---

## Phase reorder note (logged in decisions log 2026-06-15)

Per AL's direction, the new phase sequence after Phase 2 is:
- Phase 3: GeoTIFF drape (pulled forward — highest value, texture engine reusable for DXF hatching)
- Phase 4: PDF texture drape
- Phase 5: Point cloud viewer
- Phase 6: DXF drape correctness (hatching may reuse Phase 3 texture engine)
- Phase 7: Canvas annotation display
- Phase 8: Editor completion

Build the right panel's Drape section with this order in mind — GeoTIFF rows and controls need to be ready for Phase 3 to land into, even if they're mostly empty/stubbed in this phase.

---

## What does NOT change in this phase

- Import dialog flow and logic — no changes, just the entry point moves to the right panel Drape section
- ViewerEngine — no camera/render changes
- Edit mode — no changes to edit tools or undo/history
- Export flow — no changes

---

## Acceptance

- [ ] Left panel: no tabs; type-grouped sections render only when datasets of that type are loaded
- [ ] Each loaded dataset has a collapsible row; collapsed shows name + visibility + drape target label (if draped); expanded shows type-specific controls
- [ ] DXF density control is gone from the left panel; it exists in the right panel Drape section under DXF drape controls
- [ ] Right panel Drape section visible once any surface is loaded; contains "Add drape layer" button, draped dataset list, drape target dropdown per dataset
- [ ] Existing surface display controls (exaggeration, color, sun) and Edit Tools section still present and functional in right panel
- [ ] No regressions: existing import, drape, edit, export flows all still work
- [ ] Both panels still collapsible; canvas resize on collapse/expand still correct

## Definition of done

PR with passing build/tests, before/after screenshots of both panels with the reference dataset loaded (surface + DXF), NOTES.md entry documenting any deviations. PM reviews visually before Phase 3 begins.
