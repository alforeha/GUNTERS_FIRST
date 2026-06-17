# Sprint 6.5 Work Order — Single-Action Cube: Don't Close Panel, Fully Exit on Completion

**Single agent. Two small, isolated fixes in `src/ui/importController.ts`. No git — work in files.** Read `15_SPRINT6_4_WORK_ORDER.md` and `NOTES.md`'s Sprint 6.4 section for context.

**PM's spec, restated plainly (2026-06-13) — this is the target behavior, full stop:**

Click an edit-tool cube in the right panel →
1. The panel **stays open, unchanged**. The clicked cube shows a highlighted/active state.
2. The canvas immediately shows edit-mode visuals (force-visible points/edges, callout on selection, etc. — all of this already exists from 6.1–6.3).
3. User performs **one change** — one Swap Edge, or one point edit/move.
4. On completion: the cube un-highlights, **and edit mode fully exits** — canvas returns to normal display (mute/force-visible overrides cleared, border/badge back to view-mode), same as if Exit had been pressed.

No separate canvas toolbar appears for this path (unchanged from 6.4 — that's correct and stays).

---

## Two bugs, both in `src/ui/importController.ts`

### Bug 1 — `triggerSingleEditTool` closes the panels (line ~489)

```ts
export function triggerSingleEditTool(tool: EditTool): void {
  const state = useAppStore.getState();
  const handle = state.editSurfaceHandle ?? state.activeHandle;
  if (!handle) return;
  if (!state.editSurfaceHandle) {
    state.setEditPanelSnapshot({ leftOpen: state.leftOpen, rightOpen: state.rightOpen });
    state.enterEditMode(handle);
    engineHolder.current?.setEditMode(handle);
    engineHolder.current?.setActiveSurface(handle);
    state.setPanels(false, false);   // <-- REMOVE: this is closing the right panel PM keeps seeing
  }
  ...
```

**Fix:** remove the `state.setPanels(false, false)` call (and the `setEditPanelSnapshot` line that exists solely to support restoring panel state after that close — if `editPanelSnapshot` isn't used anywhere else, remove it too; check for other readers first). The right (and left) panels should remain exactly as the user had them. This was presumably copied from the canvas-toolbar entry path (Phase 3 of 6.4, where auto-closing panels to maximize canvas space made sense for a multi-action session) — it does not belong on the single-action path.

Verify: clicking a panel cube no longer changes `leftOpen`/`rightOpen` state at all.

### Bug 2 — `finishSingleActionEdit` doesn't exit edit mode (line ~499-505)

```ts
export function finishSingleActionEdit(): void {
  const state = useAppStore.getState();
  if (!state.editSurfaceHandle || state.showCanvasToolbar) return;
  state.setEditTool('editPoint');
  state.setEditSelection(null);
  state.setEditMessage(null);
  // ... (check remaining lines)
}
```

This currently resets the tool to neutral and clears selection, but **stays in edit mode** (`editSurfaceHandle` remains set). PM wants the single-action path to **fully exit edit mode** on completion — equivalent to calling `exitEditMode()`.

**Fix:** when `finishSingleActionEdit` runs (i.e., a single-action session completes — triggered after one successful Swap Edge or one committed point edit), call the same exit path the "Exit edit mode" buttons use (`exitEditMode()` from the store / whatever `RightPanel.tsx`'s edit-mode-toggle and canvas-toolbar Exit button call). This should:
- Clear `editSurfaceHandle`, restore the non-active-surface mute overrides, restore the edit surface's own points/edges visibility (per 6.1's non-destructive override), revert border accent/status badge to view mode.
- Clear `editTool`, `editSelection`, `editUndoStack`-related transient state as `exitEditMode()` already does **except** — per Sprint 6.3 — edit history (`editUndoStack`, `editModifiedVertexIds`) must **persist** across this exit, same as any other exit. Confirm `exitEditMode()` still respects 6.3's persistence fix; do not regress it.
- Do **not** show the dirty-confirm prompt (`window.confirm(...)`) for this auto-exit — a single completed action isn't a reason to interrupt the user with "N points modified, exit?". The confirm prompt remains for *manual* exit (canvas toolbar Exit button, right-panel Edit Mode toggle) where the user is choosing to leave mid-session with possibly-uncommitted intent. Auto-exit after one clean completed action should be silent.

**Where `finishSingleActionEdit` is called from** — find all call sites (likely in `Viewport.tsx`'s edit-commit handlers, after a successful swap-edge or point-edit commit) and confirm it's called **only** after a *successful* completion (a failed swap — boundary edge — should not trigger exit; the user should be able to try again, consistent with 6.3's "stay active on failure" principle, now applied to "stay in edit mode on failure" for this path).

---

## Cube highlight (re-confirm, likely already correct or trivial)

6.4 removed highlight styling from panel cubes. Per PM's restated spec, the clicked cube **should show active/highlighted while its single-action session is in progress** (from click until `finishSingleActionEdit` fires). Since `triggerSingleEditTool` sets `editTool` to the clicked cube's tool, and that value is still readable in `RightPanel.tsx`, the simplest fix: **re-add the highlight class** (`styles.toolCubeActive` or equivalent) conditioned on `editTool === tool.id && editSurfaceHandle !== null` (i.e., highlighted only while *in* an active edit-mode session for that tool — not at rest, not when the canvas-toolbar path is active for a different reason). Once Bug 2's fix causes `editSurfaceHandle` to clear on completion, the highlight disappears automatically — no separate highlight-clearing logic needed.

Double check this doesn't reintroduce the original 6.4 complaint (a cube permanently highlighted at rest) — it shouldn't, because at rest `editSurfaceHandle` is `null`.

---

## Out of scope

- Canvas-toolbar (multi-action, sticky) path — unchanged, 6.4's behavior there is correct per PM.
- Add Point, Remove by Fence, Tag/Untag Breakline, real delete, redo — still parked.
- Sprint 7.

## Exit criteria

Click a panel cube: panel(s) stay open exactly as before, clicked cube highlights, canvas shows edit-mode visuals (force-visible points/edges, callout). Complete one swap-edge or one point edit: cube un-highlights, canvas returns to normal view-mode display (mute overrides cleared, border/badge revert), no confirm prompt. A failed action (e.g. boundary-edge swap) does not exit — user can retry. Edit history persists across this auto-exit (6.3 behavior intact) and remains undoable via the right panel's Undo button (6.4). Canvas-toolbar path (right panel's Edit Mode On/Off toggle) unchanged. Typecheck/lint/full test suite green, with tests for: panel state unchanged on cube click, full exit-mode state after single-action completion (including history persistence), no-exit on failure, highlight only during active single-action session.

## Deliverables

- Updated `NOTES.md`: Sprint 6.5 section — confirm the two bug fixes, the call-site(s) of `finishSingleActionEdit`, and the highlight-timing approach.
- Full test suite green.
