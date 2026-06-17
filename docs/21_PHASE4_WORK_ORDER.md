# Phase 4 Work Order — PDF Texture Drape

**Status:** Scoped 2026-06-16, confirmed with AL. Ready for implementer assignment.

Read first: `TIN_Viewer_PM_Handoff.md` (Phase 4 section), `docs/11_DECISIONS_LOG.md`, `NOTES.md` in full, `docs/20_PHASE3_WORK_ORDER.md` (the GeoTIFF pipeline this phase extends).
Reference files: `_REFS/BATCH_2/A-BASIN TOPO-REVISED.pdf` (topo survey, 1 page), `_REFS/BATCH_2/` (second PDF is an orthomosaic — inspect before starting, both will be used for testing).

---

## Overview

Phase 4 adds PDF import and drape onto terrain surfaces. PDFs have no georef data — placement is fully manual via a calibration → orientation → placement workflow. The rendering foundation reuses the GeoTIFF texture pipeline from Phase 3 (`RenderGeotiff.ts`). A new **PDF Scene** (2D top-down canvas) provides the editing environment for calibration, cropping, markup, and placement — PDF editing does not happen inside the 3D viewport.

This is a substantial phase. Read the full work order before estimating or starting any section.

---

## Reference file notes

Two PDFs are in `_REFS/BATCH_2/`:

**A-BASIN TOPO-REVISED.pdf** — 1-page engineering survey. White background, dense contour line work, title block on right side, survey notes across top. Coordinate system: Colorado State Plane, NAD83, NAVD88. Scale bar is printed on the sheet. Survey control is shown on ortho, meaning real-world coordinates are embedded in the content — but not as PDF georef metadata. This is the primary test file for calibration and placement.

**Second PDF (orthomosaic)** — inspect before starting. This will be used to test grouped multi-file overlay, z-order control, and transparency blending.

Inspect both files in the PDF Scene before committing to rendering assumptions. Report pixel dimensions, page count, and any embedded metadata in NOTES.md before proceeding.

---

## Architecture: PDF Scene

PDF editing (calibration, crop, orientation, placement, markup) happens in a dedicated **PDF Scene** — a 2D top-down canvas mode, not an overlay on the 3D viewport. This is a new scene type alongside the existing 3D scene.

Scene switching:
- PDF Scene activates when the user opens a PDF for editing (from the left panel expanded row or during import flow).
- The existing 3D scene state is preserved — returning from PDF Scene restores the 3D view exactly.
- PDF Scene shows only the selected PDF sheet at full canvas. No terrain, no other datasets.

PDF Scene controls:
- Pan and zoom the PDF canvas (mouse wheel + drag).
- All PDF editing tools (calibrate, orient, crop, place, markup) live in the right panel when PDF Scene is active. Left panel is read-only visibility in PDF Scene (same rule as 3D scene).
- "Return to 3D" button exits PDF Scene and returns to 3D view.

This scene architecture is being built for PDF first. DXF Scene and TIFF Scene will follow the same pattern in later phases — design the scene-switching system to be extensible, not PDF-specific. Do not hardcode PDF assumptions into the scene-switching layer.

---

## 1. Import and multi-page handling

### File load
- Accept `.pdf` extension from the existing import dialog.
- On load, use `pdfjs-dist` (Mozilla PDF.js, see §10 for npm details) in a Web Worker to decode the PDF.
- Detect page count.

### Multi-page prompt
If the PDF has more than one page, immediately prompt the user (modal or inline in import dialog):

> **"This PDF has N pages. How would you like to load it?"**
> - Load all pages as a group
> - Load pages individually

Both options proceed to the same per-page processing — the only difference is whether the pages start grouped or as independent entries.

### Per-page representation
Each page is an independent object in the app:
- Has its own entry in the left panel PDFs section (same collapsible row pattern as Surfaces and DXFs from Phase 2).
- Has its own calibration, orientation, crop, and markup state.
- Has its own scale — do not assume pages share a scale even if they come from the same file.

### Grouping
- Pages loaded as a group are linked together under a group entry in the left panel (collapsible group row, pages listed beneath it).
- Individual pages can be **removed from a group** at any time (ungrouped back to standalone entries).
- Standalone pages can be **added to an existing group** (drag into group, or right-click → Add to group).
- Groups behave as a single drape source for z-order and transparency purposes, but each page retains its own calibration and crop.

---

## 2. PDF rendering pipeline

### Worker decoding
In a Web Worker (follow the pattern in `src/workers/geotiff.worker.ts`):
- Use `pdfjs-dist` to render each PDF page to an `OffscreenCanvas` at an appropriate resolution (see §2 below for resolution strategy).
- Extract RGBA `ImageData` from the canvas.
- Transfer the pixel buffer to the main thread for texture creation.

### Resolution strategy
PDF pages should be rasterized at sufficient resolution for the draped texture to read clearly at typical zoom levels. Start at 150 DPI equivalent for v1.0 and report the resulting pixel dimensions and file size in NOTES.md. If the topo reference PDF at 150 DPI produces a texture that exceeds GPU limits (typically 4096×4096 px), tile it using the same tiling/LOD strategy from Phase 3. Flag if tiling is needed.

### Texture creation
Feed the decoded RGBA buffer into `THREE.DataTexture` using the same pipeline as `RenderGeotiff.ts`. The PDF is then a textured plane draped onto the terrain mesh via BVH raycast (same as GeoTIFF).

---

## 3. White-to-transparent conversion

Apply white background removal to the decoded RGBA buffer before creating the texture:
- Any pixel where R ≥ threshold AND G ≥ threshold AND B ≥ threshold → set A = 0 (transparent).
- **Default threshold: 240.** This handles anti-aliased edges on text and linework without eating into the actual map content.
- Expose the threshold as a slider in the right panel (PDF Scene, per-sheet) so the user can adjust it. Range: 200–255. Default: 240.
- Apply conversion in the Worker, not the main thread.

---

## 4. Calibration

Calibration gives the PDF sheet a real-world unit size. It is the first step of the placement workflow and must be completed before placement is meaningful.

### Three calibration methods (user picks one):

**Method A — Enter scale value directly**
User types a known scale (e.g. 1:500, or "1 inch = 50 feet"). The system computes the sheet's real-world dimensions from the rasterized pixel dimensions + DPI.

**Method B — Measure the scale bar**
1. User clicks two points on the printed scale bar in the PDF canvas.
2. User enters the real-world distance that the bar represents (e.g. "50 feet").
3. System computes pixels-per-foot from the click distance.

**Method C — Known feature distance**
1. User clicks two identifiable points on the PDF (e.g. two survey control marks).
2. User enters the real-world distance between them.
3. System computes pixels-per-foot from the click distance.

All three methods produce the same output: a **pixels-per-foot** (or pixels-per-meter) ratio stored on the sheet. This ratio is used in orientation and placement steps.

### Re-calibrate
After initial load, the user can re-run calibration from the expanded PDF row in the left panel (button: **Calibrate**). Re-calibrating does not reset orientation or placement — it updates the ratio and recomputes dependent values.

---

## 5. Orientation

Orientation sets the sheet's rotation relative to world north. It is independent of calibration and placement — it can be re-run at any time.

### Method — north arrow identification
1. User opens the sheet in PDF Scene.
2. User clicks the tip of the north arrow on the sheet, then clicks the tail (or just the tip if the arrow direction is clear).
3. System computes the angle from that vector to screen-up.
4. User confirms or adjusts with a rotation dial/input (degrees, snaps to 1°).

Result: a **world rotation angle** (degrees from north) stored on the sheet. Used during placement to orient the draped texture correctly.

### Re-orient
Re-runnable from expanded left panel row (button: **Orient**). Does not reset calibration or placement.

---

## 6. Placement

Placement maps PDF sheet coordinates to real-world scene coordinates. Requires calibration to be set first (placement uses the pixels-per-foot ratio to scale correctly).

### Method — 2 or 3 point matching
1. User selects 2 or 3 points on the PDF sheet (clicks in PDF Scene).
2. User selects the corresponding real-world points in the 3D scene (clicks in 3D viewport — can pick from point cloud points, surface mesh faces, or GeoTIFF pixels).
3. System solves a rigid transform (translation + rotation + uniform scale) from the point pairs and applies it to the sheet's placement in scene space.

With 2 points: solves translation + rotation + uniform scale.
With 3 points: overdetermined — use least-squares best fit; report residual error to the user ("average placement error: X feet") so they can judge quality.

### Pick flow
The pick flow alternates between PDF Scene (pick PDF point) and 3D scene (pick world point). The UI must make this clear — e.g. "Click point 1 on the PDF" → user clicks → "Now click the matching point in the 3D view" → repeat. A numbered marker overlays each picked point.

### Re-place
Re-runnable from expanded left panel row (button: **Place**). Clears previous placement and runs the pick flow again.

---

## 7. Cropping

Two independent crop features per sheet. Both are applied to the texture before draping (non-destructive — original raster is preserved, crop is a mask applied on render).

### Feature A — Border crop
- In PDF Scene, the sheet displays with a resizable rectangular border overlay.
- User drags edges or corners to trim title blocks, margins, sheet borders, etc.
- Outside the rectangle is masked transparent.
- Default: full sheet extent (no crop).

### Feature B — Block-out areas
- User draws a closed polyline (arbitrary polygon) over an area to mask out (e.g. a legend box, north arrow, title block not removed by the border crop).
- Pixels inside the polygon are masked transparent.
- Multiple block-out polygons can exist per sheet.
- Each polygon is a separate entry in a "Block-outs" sub-list under the sheet in the left panel, with a visibility toggle and a delete button.
- Block-out polygons are drawn in PDF Scene using a polyline drawing tool (click vertices, double-click or close to finish).

---

## 8. Grouped multi-file overlay controls

When PDFs from different files (or ungrouped individual pages) are placed in a group:

- **Z-order (stack order):** drag-to-reorder in the group list in the left panel, or up/down arrow controls. Higher in the list = renders on top.
- **Per-sheet opacity slider:** 0–100%, default 100%. In the right panel Drape section when the group or a sheet within it is selected.
- **Group opacity:** affects all sheets in the group simultaneously. Separate from per-sheet opacity.

This is the mechanism by which the topo PDF and orthomosaic PDF can be overlaid and blended, with the user controlling which is on top and how transparent each is.

---

## 9. Markup tools

Markups are drawn in PDF Scene and baked into the texture (not 3D scene annotations). They render as part of the draped texture on the terrain.

### Three markup types:
- **Highlight** — user draws a filled semi-transparent polygon over an area. Color and opacity adjustable.
- **Polyline** — user draws a multi-segment line. Color and line weight adjustable.
- **Callout note** — user clicks a point on the sheet, types a note. Renders as a leader line with a text box. Font size and color adjustable.

### Markup layer control
Each markup entry has:
- A visibility toggle (show/hide without deleting).
- A label (auto-generated or user-editable: "Highlight 1", "Note: drainage", etc.).
- Listed in a "Markups" sub-list under the sheet in the left panel.

### Baking
When the sheet's texture is sent to the GPU, markups are composited onto the raster in the Worker before texture creation. If a markup's visibility changes, the texture is re-baked. Cache the base raster (without markups) in the Worker so re-bakes only re-composite the markup layer — do not re-decode the PDF on every markup change.

---

## 10. State and data contracts

### Store additions (`src/state/store.ts`)
Add PDF-specific state following the existing GeoTIFF group pattern:

```typescript
interface PdfSheet {
  id: string;
  fileId: string;         // source file
  pageIndex: number;      // 0-based page index within the source file
  label: string;
  visible: boolean;
  groupId: string | null;
  calibration: PdfCalibration | null;
  orientation: number | null;  // degrees from north
  placement: PdfPlacement | null;
  borderCrop: Rect | null;
  blockOuts: BlockOutPolygon[];
  markups: PdfMarkup[];
  opacityPct: number;
  whiteThreshold: number;
  draped: boolean;
  drapeTargetSurfaceId: string | null;
}

interface PdfGroup {
  id: string;
  label: string;
  sheetIds: string[];
  zOrder: string[];        // sheetIds in render order, first = bottom
  opacityPct: number;
}
```

Add `pdfSheets: PdfSheet[]` and `pdfGroups: PdfGroup[]` to the store. Follow the existing pattern for immutable updates.

### Contract additions (`src/core/contract.ts`)
Add `PdfCalibration`, `PdfPlacement`, `BlockOutPolygon`, `PdfMarkup` types. Keep them in `contract.ts` alongside the GeoTIFF types.

---

## 11. Left panel — PDF section

Add a **PDFs** section to the left panel, following the Surfaces and DXF Files sections from Phase 2.

- Collapsible section header: "PDFs"
- Each standalone sheet: collapsible row with visibility toggle, label, and expand chevron.
- Each group: collapsible group row (group label + visibility toggle) with member sheets listed beneath (indented).
- Expanded sheet row shows action buttons: **Calibrate**, **Orient**, **Place**, and a **Open in PDF Scene** button.
- Expanded sheet row shows sub-lists for Block-outs and Markups (each entry with visibility toggle and delete).
- Do not add any new controls to the left panel beyond visibility toggles and the action buttons above. All parameter controls (threshold slider, opacity, etc.) live in the right panel.

---

## 12. Right panel — PDF drape section

Extend the right panel Drape section (established in Phase 2) with PDF rows:

- Per-sheet row: label, drape target surface dropdown, opacity slider, white threshold slider, visibility toggle.
- Per-group row: group label, stack order controls (up/down per member), group opacity slider.
- When PDF Scene is active, the right panel shows PDF Scene tools (calibrate, orient, crop, markup tools) instead of the normal drape controls.

---

## npm dependency

**`pdfjs-dist`** — Mozilla PDF.js distribution package. Renders PDF pages to canvas/ImageData in a Worker, produces RGBA pixel data compatible with the existing `DataTexture` pipeline.

```
npm install pdfjs-dist
```

PDF.js requires its worker script to be available at a known path. Configure Vite to copy `pdfjs-dist/build/pdf.worker.min.js` to the public directory, or use the `pdfjs-dist` Vite plugin if one is available. Document the setup in NOTES.md. Verify this works in a Worker context before committing to the approach.

---

## Standing restrictions for all Phase 4 implementation handoffs

- cmd.exe only
- ASCII characters only
- When writing or rewriting source files, use Python (`open(..., 'w').write(...)`) rather than shell heredocs. Shell heredocs truncate silently on files longer than ~8KB or containing special characters. Targeted Edit tool (old_string/new_string) calls are unaffected and remain preferred for partial changes.
- For build verification use `npx tsc --noEmit` — do not use `npm run build`. The vite bundle step fails in the implementer sandbox with EPERM on the read-only `dist/` folder. tsc catches all the same type errors.

---

## Out of scope for Phase 4

- Automatic georef placement (PDF has no coordinate metadata — all placement is manual)
- Full CRS reprojection (Phase 9)
- DXF Scene (later phase, same architecture)
- TIFF Scene (later phase, same architecture)
- PDF-to-DXF digitizing (Phase 9 backlog)
- Saving/exporting markup annotations as a separate file

---

## Implementer: report before proceeding past §1

Before implementing anything beyond PDF import and Worker decode:
1. Inspect both reference PDFs — report page counts, raster dimensions at 150 DPI, and whether `pdfjs-dist` Worker setup works correctly in the Vite build.
2. Confirm the tiling question: does the topo PDF at 150 DPI exceed GPU texture limits? If yes, propose a tiling approach before implementing.
3. Log findings in NOTES.md. Get PM confirmation before proceeding.

---

## Acceptance criteria

- [ ] PDF import accepted from import dialog; multi-page PDF prompts group-or-individual choice
- [ ] Each page renders as a visible draped texture on the terrain surface in 3D view
- [ ] White-to-transparent conversion applied; threshold slider adjusts result in real time
- [ ] PDF Scene activates from left panel; 3D scene state preserved and restored on return
- [ ] Calibration: all three methods (direct scale, scale bar, known feature) produce correct pixels-per-foot
- [ ] Orientation: north arrow pick sets world rotation; draped texture rotates correctly
- [ ] Placement: 2-point and 3-point flows complete; draped texture lands at correct real-world position; 3-point residual error reported
- [ ] Re-calibrate, Re-orient, Re-place each independently re-runnable from left panel row without affecting each other
- [ ] Border crop: drag corners/edges masks sheet borders; default is full extent
- [ ] Block-out: closed polyline masks arbitrary interior areas; multiple polygons per sheet; each has visibility toggle and delete
- [ ] Grouping: pages can be grouped and ungrouped; z-order drag-reorder works; per-sheet and group opacity sliders work
- [ ] Topo PDF and orthomosaic PDF overlay correctly when grouped; z-order and transparency blend as expected
- [ ] Markup tools: highlight, polyline, and callout note all draw and bake into texture; per-markup visibility toggle works; re-bake does not re-decode PDF
- [ ] Left panel PDFs section: sheet rows, group rows, block-out sub-list, markups sub-list all correct
- [ ] Right panel: drape target, opacity, threshold controls functional per sheet and per group
- [ ] `npm test`, `npm run build`, `npm run lint` all pass
- [ ] No regressions on existing surface/DXF/GeoTIFF/point cloud/edit/export flows
- [ ] NOTES.md: documents reference file findings, tiling decision, pdfjs-dist Worker setup, any deviations from this work order

## Definition of done

Build and tests pass. AL visual review in PDF Scene (calibrate + place the topo PDF onto the surface, verify it lands in the right location relative to the terrain contours) and in 3D scene (both PDFs grouped and blended on the surface). NOTES.md entry complete. PM signs off before Phase 6 begins.
