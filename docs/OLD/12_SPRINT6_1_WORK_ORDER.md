# Sprint 6.1 Work Order — Edit UX Rework (canvas toolbar + callouts)

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** This document is self-contained: read it, then `09_SPRINT6_WORK_ORDER.md` (the original order this revises), `04_IMPLEMENTER_NOTES.md` §5, and `NOTES.md`'s Sprint 6 section for current state.

**Current state (verified):** Sprint 6 functionally works — edit mode, vertex pick, Z-edit via numeric input + drag, undo, dirty flag, 87/87 tests green. **This sprint is a UX/placement rework, not new editing logic.** The underlying Z-write path (Float64→Float32→normals→BVH refit), undo stack, and dirty-flag plumbing from Sprint 6 are correct and should be reused/relocated, not rebuilt.

**PM feedback driving this rework (2026-06-13):**

1. PM does not want the "Edit surface" / "Enter edit mode" button in the **Display Control Center** (left panel). That slot is reserved for the future **hover-mode** pill (parked, post-Sprint-7 — do not build hover mode now, just don't occupy its spot).
2. Edit entry should live in the **right tool panel** instead.
3. PM remembers a set of **edit-action buttons ("cubes")** that have disappeared — only a single "Enter edit mode" button remains. PM wants those buttons back, each representing a **single-action edit tool** (move point is one of them).
4. Separately, an **"Edit Mode" toggle** should open a **canvas toolbar** (in-viewport, not panel-based) and probably **auto-close the side panel** to maximize canvas space.
5. The right-panel point-detail card should become an **in-canvas callout/blurb** anchored at the selected point, not a panel card.
6. While in edit mode, **points and edges must be force-visible** on the edit surface — override that surface's own display settings (non-destructively, same override pattern as the existing master-toggle/mute conventions) so there's always something to click.
7. **Z-edit interaction feel itself is acceptable for now** — PM explicitly wants to defer polishing the drag/numeric-entry feel to a later pass. Do not spend this sprint tuning drag sensitivity etc.

---

## Phase 1 — Remove left-panel edit entry; reserve the slot

- In `src/ui/LeftPanel.tsx`, remove the "Edit surface" / "Exit edit" button entirely (the block currently calling `enterEditMode` / `exitEditMode` near the active-surface pill).
- Leave a clear, minimal placeholder comment (`// reserved for future hover-mode toggle pill — see docs/11_DECISIONS_LOG.md item 1`) so the next sprint that builds hover mode knows where it goes. Do not build any hover-mode UI now.
- Edit mode must remain fully reachable without this button (Phase 2 covers the replacement entry point) — verify no dead state.

## Phase 2 — Right-panel edit tools: action buttons + Edit Mode toggle

- In `src/ui/RightPanel.tsx`, replace the current single "Enter edit mode" button with:
  - A small set of **edit-action buttons** ("tool cubes" — icon + label, grid or row layout). This sprint needs at minimum **Move point (Z)** — the only tool that exists today. Add the others as **disabled/stubbed placeholders** if PM's "a few cubes" implies more were planned (check `04_IMPLEMENTER_NOTES.md` §5 and the parked-ideas list in `docs/11_DECISIONS_LOG.md` for candidates — e.g. tag/untag breakline, fill hole — but do **not** implement their logic, just reserve the slots as visibly-disabled with a tooltip like "coming in a later sprint"). Confirm with PM if the exact prior cube set isn't recoverable from history — note the assumption in NOTES.md rather than guessing silently.
  - Clicking **Move point** is a single action: it selects that tool as active (highlight state) — it does not by itself enter "Edit Mode" in the toolbar sense. Tool selection determines what clicking in the canvas does once Edit Mode (below) is on.
  - A separate **"Edit Mode" toggle button**. Turning it on:
    - Enters the existing `editSurfaceHandle` state machine (reuse `enterEditMode(activeSurface.handle)` from Sprint 6 — same store action, same force-mute-others behavior).
    - Opens the **canvas toolbar** (Phase 3).
    - Auto-closes the right (and/or left, whichever is open) panel to maximize canvas — reuse the existing panel collapse mechanism from Sprint 3's panel-sizing system (don't build a new collapse path). Re-opening a panel manually while in Edit Mode should be allowed (don't lock panels closed), but Edit Mode should not require them open.
  - Turning Edit Mode off: reuse Sprint 6's exit flow (dirty-check confirm via `editModifiedVertexIds`), close the canvas toolbar, restore panel state to whatever it was before auto-close.

## Phase 3 — In-canvas edit toolbar

- New small floating toolbar rendered over the viewport (plain DOM overlay, positioned via CSS over the canvas — same approach as any existing HUD/status-badge overlay; do not put it inside the Three.js scene).
- Shows: the active edit tool (from Phase 2's cube selection — Move point for now), **Undo** button (reuse Sprint 6's `undoEdit()`), and **Exit edit mode** (reuse Sprint 6's exit-with-confirm flow).
- Keep it minimal — this is the toolbar PM described as appearing "in the canvas" when Edit Mode turns on; it replaces the right-panel edit controls block (Exit/Undo buttons) that Sprint 6 added to `RightPanel.tsx`'s edit section.

## Phase 4 — In-canvas point callout (replaces right-panel point card)

- Remove the `editCard` block from `RightPanel.tsx` (the Point/N/E/Z card with the Z `<input>`, lines ~147–187 in the current file).
- Replace with an **in-canvas callout/blurb** anchored to the selected vertex's screen position (project the vertex's world position to screen space each frame the selection is active, same pattern as any existing screen-space overlay/label positioning in `ViewerEngine.ts`).
- Callout content: point id, N, E, Z (display, matching `precisionHint`) plus the **Z numeric input** and the "Dragging Z live…" / "Click a vertex to select it" status line — same data/behavior as Sprint 6's card, just relocated and reanchored.
- Callout follows the vertex if the camera moves (reposition each frame while visible); hides when no vertex is selected or Edit Mode is off.
- `editMessage` (e.g. orientation-check warnings, if/when XY edits land) should also surface near the callout rather than in the right panel.

## Phase 5 — Force-visible points/edges in edit mode

- While `editSurfaceHandle` is set, the edit surface's **points and edges overlays must render regardless of that surface's own visibility settings** — implement as a scene-level override layered on top of the per-surface settings, following the **same non-destructive override pattern** used for Sprint 3's master toggles and Sprint 6's force-mute-others (toggling edit mode off restores the surface's own point/edge visibility exactly as the user had it).
- This override applies only to the **edit surface** — other (muted) surfaces are unaffected.
- If the surface's points/edges were already visible, this is a no-op; if hidden, edit mode temporarily shows them.

---

## Out of scope (explicitly, do not build)

- Hover mode itself (Phase 1 only reserves the slot).
- New edit tools' actual logic beyond Move point (Z) — placeholders/disabled only.
- Z-edit drag/numeric-entry feel polish — deferred per PM, future pass.
- XY moves / orientation-check guard — still optional/future per Sprint 6's original scope, unaffected by this rework.
- Sprint 7 (export) — do not start until this rework is accepted.

## Exit criteria

Left panel (Display Control Center) has no edit-mode button; the vacated spot is clearly reserved (commented) for hover mode. Right panel shows edit-action buttons (Move point live, others stubbed/disabled) plus an "Edit Mode" toggle. Toggling Edit Mode on: enters edit state (force-mute others as before), opens an in-canvas toolbar (active tool, Undo, Exit), auto-closes the open panel. Selecting a vertex shows an in-canvas callout (point id, N/E/Z, Z input, status) anchored at the point and tracking camera movement — no right-panel point card remains. While in edit mode, the edit surface's points and edges render regardless of its own visibility settings, and those settings are restored on exit. All Sprint 6 edit logic (Z-write path, undo, dirty flag, exit-confirm) behaves identically, just reachable/displayed through the new UI. Typecheck/lint/full test suite green — update/relocate Sprint 6's UI-level tests (`src/viewer/editing.test.ts`, `src/state/store.test.ts`) to match new entry points; store-level logic tests should be largely unaffected.

## Deliverables

- Updated `NOTES.md`: append a Sprint 6.1 section — what moved where, the assumption made about the stubbed tool-cube set (flag for PM confirmation), and an updated PM walkthrough checklist (left-panel slot empty/reserved, right-panel tools + Edit Mode toggle, canvas toolbar, canvas callout, force-visible points/edges, exit restores prior state).
- Full test suite green; note any test files moved/renamed.
