# Sprint 6.3 Work Order — Callout Anchor, Tool Behavior, Swap-Edge History, Persistent History

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** Read `13_SPRINT6_2_WORK_ORDER.md` (what this fixes/extends), `12_SPRINT6_1_WORK_ORDER.md`, `09_SPRINT6_WORK_ORDER.md`, and `NOTES.md`'s Sprint 6/6.1/6.2 sections for current state.

**Current state (verified):** 89/89 tests, build/lint green. Right panel has tool cubes + Edit Mode toggle + session history; viewport has the floating canvas toolbar and draggable in-canvas callout; generalized N/E/Z write path, XY orientation guard, and swap-edge are implemented.

**This sprint is fixes + behavior clarification, not new features.** Five items from PM's walkthrough, in priority/dependency order:

---

## Phase 1 — Swap Edge must enter undo/history (bug fix, do first)

**Root cause (confirmed in code):** in `src/viewer/ViewerEngine.ts`, the pointer-up handler (~line 761-769) calls `this.swapSelectedEdge()` but **discards its return value**. `swapSelectedEdge()` (line 560) correctly builds and returns a `VertexEditCommand` of type `'swapEdge'`, but nothing passes it to `editCommitCb`, so `pushEditCommand` (and therefore `editUndoStack` / the right-panel history list / `editModifiedVertexIds`) never sees swap-edge actions.

Fix: capture the return value and emit it the same way `moveVertex` commands are emitted (compare to the `applyVertexCommand`/commit path around line 744, where `editCommitCb?.({ type: 'moveVertex', ... })` fires). i.e.:

```ts
if (this.editTool === 'swapEdge') {
  const edge = this.pickNearestEdge();
  if (!edge) {
    this.editMessageCb?.('pick an interior edge to swap');
  } else {
    this.selectedEdge = edge;
    const command = this.swapSelectedEdge();
    if (command) this.editCommitCb?.(command);
  }
}
```

Verify: `editCommitCb` → `store.pushEditCommand` → appears in `editUndoStack` and the right-panel history list (Phase 4 of this sprint). Verify **Undo** correctly reverses a swap (re-applies `beforeIndices`, recomputes normals, refits BVH) — `applyVertexCommand`'s `inverse` path for `swapEdge` should already handle this (line 553/1060); confirm with a test that undo after swap restores the original two triangles.

Add a test: swap an interior edge → command appears in `editUndoStack` with `type: 'swapEdge'` → undo restores `beforeIndices`.

## Phase 2 — Callout needs a visible anchor/tail to its vertex

PM: "thinking would have a tail or something to make it more obvious which it's going to."

- The callout (`EditCallout` in `src/ui/Viewport.tsx`) currently renders as a floating card with no visual link to the vertex it describes. Add a **connector line or pointer/tail** from the card to the vertex's screen position.
- Simplest approach: render a short SVG line (or a small absolutely-positioned div rotated to point) from the card's anchor edge to the vertex's projected screen coordinates (`screen.x`/`screen.y`, already computed for positioning — reuse that). If the card has been **dragged away** (Phase 3 changes what dragging means, but the card may still reposition), the tail should stretch/redraw to follow both ends.
- Keep this cheap — a single SVG `<line>` or `<svg>` overlay element repositioned each frame the callout is visible, same update cadence as the existing screen-projection effect (~line 124-135).

## Phase 3 — Clarify Move Point vs Edit Point: callout drag IS the move

PM's actual mental model, stated directly: *"when I click the Move Point I can move the callout around and that is how the in-canvas move works."* Currently there's a disconnect — PM sees an "Edit Point active — drag in canvas" helper message but the in-canvas vertex drag is hard to use, while the callout itself is already draggable (Phase 1 of 6.2, for repositioning the card).

**Resolution — make the callout drag double as the Move Point interaction:**

- When **Move Point** mode is active for the selected vertex (this may be `editTool === 'editPoint'` with the vertex selected — confirm against current tool naming; PM's toolbar lists "Edit Point" as the toolbar tool, and the callout's "Move point" affordance from 6.2's spec as the action within it), **dragging the callout card** moves the **vertex** (N/E/Z live update via the existing write path), not just the card's screen position.
- The direct in-canvas vertex drag (clicking the 3D point itself and dragging) becomes the **secondary/advanced** path — keep it working (don't remove), but it's no longer the primary instruction in the helper text.
- Update the helper text (~line 228-232 in `Viewport.tsx`) to describe the callout-drag-to-move workflow as primary: something like *"Edit Point active — drag this card to move the point, or drag the point directly in the canvas."*
- If "drag the callout" conflicts with "drag the callout to reposition the card" (6.2 Phase 1's card-repositioning drag), resolve by: **a modifier or a distinct drag handle**. Suggested split — dragging the **header row** (PNT # / close button area) repositions the *card* on screen (as 6.2 built); dragging **anywhere else on the card body**, or a dedicated small "move" handle/icon, moves the *vertex*. Pick whichever split is least confusing and document the choice in NOTES.md. The card should visually distinguish its two drag zones (cursor style change on hover is enough — `grab` vs `move` or similar).
- The tail from Phase 2 becomes especially useful here — as the card (or vertex) moves, the tail visibly shows the live link.

## Phase 4 — Callout closes on tool switch

PM: "the callout stays open when I switch actions and I think it should close."

- In `src/ui/Viewport.tsx`, when `editTool` changes (e.g. user clicks a different toolbar tool — Swap Edge, etc. — away from Edit Point), clear `editSelection` via `clearEditSelection()` (same function the callout's close button already calls) so the callout disappears.
- Watch for the case where switching *back* to Edit Point shouldn't auto-reopen a stale callout — selection should require a fresh pick, which `clearEditSelection()` already ensures.
- Add/update a test in `editing.test.ts` or `store.test.ts`: setting `editTool` to a different value clears `editSelection`.

## Phase 5 — Tool button click behavior: momentary action vs. sticky mode

PM: "the edit tool buttons look like it has a selected action but I was thinking user could click one and then it would turn to edit mode for a single change."

This is a **UX model clarification**, not necessarily a bug — the current implementation (sticky `editTool` selection, persists until another tool is clicked) is a reasonable and common pattern, but PM's mental model is closer to "click a tool → perform one action → tool returns to a neutral/default state (e.g. back to Edit Point) afterward."

**Resolution for this sprint:** implement the **"single action then revert"** behavior for tools that represent a discrete one-shot operation:

- **Swap Edge:** after a successful swap (Phase 1's fix fires), automatically set `editTool` back to `'editPoint'` (the default/neutral tool). If the swap fails (boundary edge, `editMessageCb` fires a message), stay in `swapEdge` so the user can try another edge without re-clicking the tool — only revert on **success**.
- **Edit Point** remains the persistent/neutral "select and inspect/move" mode — it's not a one-shot action, so it stays sticky (this is the mode the others revert *to*).
- Future one-shot tools (Add Point, Tag/Untag Breakline once built) should follow the same "perform once, revert to Edit Point" pattern — note this convention in NOTES.md so 6.4+ work orders inherit it without re-deriving it.
- Keep the active-tool visual indication (Phase 4 of 6.2) — it's correct and useful, just confirm it now also reflects the auto-revert (active highlight moves back to Edit Point after a successful swap).

## Phase 6 — Edit history persists across exit/re-entry of edit mode

PM: "after I exit edit mode the edit history seems to reset and I want it to persist so user could always undo action."

- **Root cause (confirmed in code):** `src/state/store.ts` — both `enterEditMode` (line 333-343) and `exitEditMode` (line 344-354) reset `editUndoStack: []` and `editModifiedVertexIds: []`. Also, `removeSurfaceEntry` (line 303-323) clears them when the edited surface is removed (that part is correct — a removed surface has no history to keep).
- Fix: **stop clearing `editUndoStack` and `editModifiedVertexIds` in `enterEditMode` and `exitEditMode`.** History should persist for the life of the session (or until the surface is removed, which already correctly clears it).
- Consider: history is currently a single flat stack presumably scoped to "whatever surface is being edited" implicitly. With persistence across mode toggles, and potentially across **switching which surface is being edited**, decide and document: is history **per-surface** or **global/session-wide**? Given `EditCommand` already carries `surfaceId`/`surfaceObservable` fields, the cleanest fix is likely: keep the stack global, but the right-panel history list (and Undo button) should filter/operate on entries — clarify whether Undo while editing surface A should be able to undo an edit made earlier to surface B. **Recommended for this sprint: Undo only pops/affects commands matching the *currently active edit surface*** (filter by `command.surfaceId === editSurfaceHandle` when popping) — simplest, avoids cross-surface undo surprises, while the history *list* can still show everything if desired. Document whichever choice is made.
- Re-entering edit mode on the same surface should show its prior history (not reset to empty) and Undo should still work on those older entries.
- Add a test: push a command, exit edit mode, re-enter edit mode (same surface), `editUndoStack` still contains the command; Undo still works.

---

## Out of scope (explicitly, do not build)

- Add Point, Remove by Fence, Tag/Untag Breakline implementations — still Sprint 6.3+/parked per `13_SPRINT6_2_WORK_ORDER.md` §6 (note: this document is "Sprint 6.3" in numbering but does not unpark those items — they remain logged in `11_DECISIONS_LOG.md`).
- Real point deletion — still a documented stub.
- Redo.
- Sprint 7 (export).

## Exit criteria

Swap Edge actions appear in `editUndoStack` and the right-panel history list, and Undo correctly reverses a swap. The callout shows a visible tail/connector to its vertex, updating live as either moves. Dragging the callout (per the documented drag-zone split) moves the vertex via the existing write path; helper text reflects this as the primary workflow. Switching `editTool` clears the open callout/selection. Swap Edge auto-reverts `editTool` to `editPoint` after a successful swap (stays active on failure); the convention is documented for future one-shot tools. Edit history (`editUndoStack`, `editModifiedVertexIds`) survives exit/re-entry of edit mode for the same surface; Undo is scoped to the active edit surface's commands. All Sprint 6/6.1/6.2 behavior intact. Typecheck/lint/full test suite green, with new tests for each fix above.

## Deliverables

- Updated `NOTES.md`: Sprint 6.3 section covering each fix, the drag-zone split chosen for the callout (Phase 3), and the one-shot-tool convention (Phase 5).
- Full test suite green.
