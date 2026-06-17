# Phase 1 Work Order — Viewer/Camera Fixes

**Status:** Scoped 2026-06-15, confirmed with AL. Ready for implementer assignment.

Read first: `TIN_Viewer_PM_Handoff.md` (Phase 1 section), `TIN_Viewer_Project_Summary.md` (Phase 1 section), `04_IMPLEMENTER_NOTES.md` for conventions. Current camera/exaggeration code lives in `src/viewer/ViewerEngine.ts`.

---

## 1. View mode switching (Top / 3D / Hover) — preserve position in place

**Decision (AL, 2026-06-15):** Camera **position is always preserved** across mode switches. Look-at/orientation adjusts per target mode using common-sense defaults:

- **3D → Top**: keep camera position (X/Y), reorient to look straight down (orthographic top, rotation locked per existing `topControls` behavior). Do not re-frame/reset to content bounds.
- **Top → 3D**: keep camera position, restore a perspective look direction (e.g. last 3D orientation if available, else a reasonable default angle looking at the previous target).
- **2D/3D → Hover**: see §2 — hover has its own entry flow, but once active, the canvas's "up" direction should align with the direction the user is looking (i.e., screen-up = forward-facing-up, standard FPS convention), not world-Z-up necessarily mapped to screen-up.
- **Hover → 2D/3D (returning)**: keep the hover camera's position as the new camera position; reorient per the Top/3D rules above.

**Acceptance:**
- [ ] Switching Top↔3D never changes camera X/Y/Z position, only orientation/projection.
- [ ] No mode switch triggers `resetView()` / re-framing — only explicit "Reset View" does.
- [ ] Returning from Hover lands the camera at the hover position, oriented per target mode.

---

## 2. Hover mode — entry, controls, and UI

**Entry (AL, 2026-06-15):** Click anywhere on the currently active/selected surface (in Top or 3D view) to set the hover entry point, then activate Hover. Implementer should propose the exact two-step interaction (e.g. click arms a "Hover" cursor mode, click on surface confirms and enters; or click-then-press-Hover-button) — confirm with AL only if genuinely ambiguous, otherwise use judgment.

**Controls (AL, 2026-06-15):** WASD + mouse-look, standard FPS scheme, pointer-lock capture on entry (click to lock, Esc to release — match conventional browser FPS UX).

**Hover button placement (AL, 2026-06-15):**
- Joins the existing Top/3D toggle group, same visual treatment/size/style as those buttons.
- A **"Hover Height"** textbox appears next to or on top of the zoom bar when Hover mode is active — lets the user set/adjust camera height above the surface while hovering. Numeric input, survey units (feet), live-editable.

**Acceptance:**
- [ ] Hover button matches Top/3D button styling, added to the same group.
- [ ] Clicking on the active surface (per the two-step flow above) sets entry point and enters Hover at that XY, height = "Hover Height" value above the surface at that point.
- [ ] WASD moves camera horizontally relative to look direction; mouse-look rotates view; pointer lock engages on click, releases on Esc.
- [ ] "Hover Height" textbox is visible only in Hover mode, positioned near the zoom bar; editing it updates camera Z live (surface-relative, not absolute world Z).
- [ ] Canvas "up" in Hover mode corresponds to the user's local up (away from the surface at that point / world-Z-up is fine for v1.0 given flat-Earth assumption — confirm no special handling needed beyond standard FPS camera-up = world Z).

---

## 3. Zoom/pan "stuck" bug — zoom slider (build regardless)

**Decision (AL, 2026-06-15):** Build the zoom slider as a permanent control, independent of Hover mode's effect on the underlying bug.

- Add a zoom slider control to the viewport (orbit and top modes at minimum; visible alongside Hover Height in Hover mode per §2).
- Slider provides a manual override for zoom distance/scale, giving users an escape hatch if scroll-zoom appears stuck.
- Implementer: investigate the underlying stuck-zoom cause (likely OrbitControls min/max distance or damping interaction) as a secondary item — fix if straightforward, but the slider is the required deliverable regardless of root-cause fix status.

**Acceptance:**
- [ ] Zoom slider visible in viewport, functional in both Top and 3D modes.
- [ ] Slider and scroll-zoom stay in sync (slider reflects scroll-driven zoom changes and vice versa).
- [ ] NOTES.md documents findings on the stuck-zoom root cause, whether fixed or not.

---

## 4. Vertical exaggeration scaling — investigation required

**AL's report:** the example reference surface looks much more exaggerated than a user-created topo surface at the same multiplier. Expectation: a 6" curb should look ~5ft tall at 10x exaggeration, **regardless of overall site relief**.

**Decision (AL, 2026-06-15):** Investigate before locking a formula — do not assume.

**Starting point for implementer:** `ViewerEngine.setVerticalExaggeration()` already applies exaggeration as a single Z-scale matrix on `contentGroup` (see `04_IMPLEMENTER_NOTES.md` §3, "Vertical exaggeration: scene-level Z scale"), which on its face is delta-based (uniform Z scale = elevation deltas scale uniformly, independent of dataset extent). So the bug is likely **not** in the exaggeration formula itself. Investigate:

- Is each surface's content positioned/rebased differently such that Z-scaling about a different effective origin makes the *visual* effect look different per-surface (e.g. if one surface's local origin Z is far from its actual elevation range, scaling about that origin could exaggerate apparent displacement)?
- Is there a per-surface or per-dataset exaggeration value being applied inconsistently, vs. one global value?
- Compare the example reference surface and a user-created topo surface directly: load both, apply the same exaggeration, measure a known feature (e.g. the 6" curb) in both — is the *rendered* ratio actually different, or is this a perception issue from differing site relief/zoom level?

**Acceptance:**
- [ ] Root cause documented in NOTES.md with before/after screenshots comparing the two reference surfaces at the same exaggeration value.
- [ ] If a fix is needed, propose the exact formula change and confirm with AL before implementing broadly (do not silently change exaggeration math without sign-off, since it affects all existing surfaces).
- [ ] If no bug is found (perception issue only), document the explanation clearly for AL.

---

## Out of scope for Phase 1

- Panel/layout restructure (Phase 2).
- DXF, GeoTIFF, PDF, point cloud work (Phases 3–5).
- Any retriangulation/editing changes (Phase 6).

## Definition of done

PR with passing tests/checks, README/NOTES.md updates per area, before/after screenshots for camera-mode switching, Hover mode demo, zoom slider, and the exaggeration investigation. PM (this session) reviews and summarizes back to AL per the handoff doc's phase-end protocol before Phase 2 begins.
