# Sprint 6.4 Work Order — Two Tool Surfaces, One Model

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** Read `14_SPRINT6_3_WORK_ORDER.md`, `13_SPRINT6_2_WORK_ORDER.md`, `12_SPRINT6_1_WORK_ORDER.md`, and `NOTES.md`'s Sprint 6.x sections for current state.

**Current state (verified):** 6.1–6.3 shipped. Right panel (`src/ui/RightPanel.tsx`) has an "Edit Tools" grid of cubes (`TOOL_CUBES`, driven by `editTool`), a separate "Edit Mode On/Off" toggle, and an "Edit History" list with no Undo button. The canvas toolbar (`src/ui/Viewport.tsx`, `TOOLBAR_TOOLS`) also reads/writes `editTool` and has its own Undo button. **Both UIs currently drive the same `editTool` store value, which is the source of the confusion this sprint fixes.**

**PM's clarified model (verbatim intent, 2026-06-13):**

> When I'm in edit mode, the canvas toolbar shows the user selecting which edit action they want to complete, and it does that action until they swap actions or exit. The side panel — I just want these buttons, and when I click them it goes to a single edit mode where there's no toolbar, just the canvas displaying like it's in edit mode, and I can complete a single change. The edit history also needs an Undo button.

In short: **two different tool surfaces, two different interaction models, sharing the same underlying edit machinery.**

---

## Phase 1 — Canvas toolbar: revert the swap-edge auto-revert

6.3 Phase 5 made a successful Swap Edge automatically set `editTool` back to `'editPoint'`. PM has now clarified that **for the canvas toolbar, sticky selection is correct and desired** — a tool stays active across repeated uses until the user explicitly picks another tool or exits edit mode.

- In `src/viewer/ViewerEngine.ts` (and/or wherever the auto-revert was added per 6.3's NOTES.md), **remove the auto-revert to `editPoint` after a successful Swap Edge**. Swap Edge should remain the active tool after a swap, so the user can immediately swap another edge.
- The "stay active on failure" behavior from 6.3 (boundary edge → message, tool unchanged) needs no change — it's already correct and is now simply the *only* behavior (success or failure, tool stays).
- Edit Point remains the default tool when entering edit mode and when no other tool is selected — unchanged.
- This reverts the specific "one-shot tool" convention 6.3 introduced for the **canvas toolbar only**. Note in NOTES.md that the one-shot convention may still apply to the *right panel* (Phase 2) — the two surfaces are intentionally different now.
- Update/remove the test added in 6.3 that asserted Swap Edge reverts `editTool` — replace with a test asserting it does **not** revert.

## Phase 2 — Right panel "Edit Tools" cubes become momentary triggers, decoupled from canvas toolbar state

This is the core fix. The right-panel cubes (`TOOL_CUBES` in `RightPanel.tsx`) currently render `editTool === tool.id` as an active/highlighted state — meaning whatever the canvas toolbar's current tool is, the matching panel cube also lights up, and since `editPoint` is the default, a cube is *always* highlighted at rest. PM does not want any persistent highlight in the panel.

- **Remove the active/highlight styling from the right-panel cubes entirely** (`styles.toolCubeActive` usage on these buttons). They should look the same whether or not their corresponding tool is "active" anywhere else.
- **Clicking a panel cube is a momentary trigger**, not a toggle into a persistent panel state:
  1. If not already in edit mode for the active surface, enter edit mode (reuse `enterEditMode`).
  2. Set `editTool` to that cube's tool (so the canvas/engine knows what action to perform) — this still uses the shared `editTool` state under the hood (the engine needs to know what to do), but **the right panel itself shows no reflection of this** (no highlight, no "current tool" label in the panel).
  3. The canvas should now visually read as "in edit mode for a single change": per PM, **no canvas toolbar** is shown for this entry path — just the edit-mode visual treatment (border accent / status badge from Sprint 6, force-visible points/edges from 6.1, larger points in Edit Point mode from 6.2, the callout when a vertex is picked). The canvas toolbar (`TOOLBAR_TOOLS`, with its sticky multi-action selection) is the *other* entry path (Phase 3) and should not appear here.
  4. After the user completes one action (e.g. picks a vertex and adjusts it via the callout, or performs one swap), the panel-cube-triggered session should return to a neutral state — **do not auto-exit edit mode entirely** (the user may still want to undo, see history, etc.) but `editTool` can fall back to a neutral/default and no canvas toolbar should pop up as a side effect.
- **Open implementation question — flag, don't guess silently:** the canvas toolbar and the panel cubes both ultimately set `editTool`, and the engine's pointer-handling reads `editTool` to decide behavior (swap-edge picking, move-point, etc.) regardless of which UI set it. The simplest correct split is: **the presence/absence of the canvas toolbar is its own independent piece of state** (e.g. a new `showCanvasToolbar: boolean`, distinct from `editTool` itself), defaulting to `false`. The canvas toolbar (Phase 3) sets it `true` on entry and the user can dismiss it; panel-cube clicks (this phase) leave it `false`. `editTool` continues to drive engine behavior either way. Implement this way unless inspection of the current code reveals a cleaner seam — document the chosen approach in NOTES.md.

## Phase 3 — Canvas toolbar entry point (multi-action session)

- The canvas toolbar (`EditCanvasToolbar` in `Viewport.tsx`) represents the "do several edits without re-clicking each time" workflow — sticky tool selection (Phase 1), visible while active.
- Determine/confirm how a user reaches this mode: likely the existing "Edit Mode On/Off" toggle in the right panel (`RightPanel.tsx` ~line 116-134) is the entry point for *this* — i.e., **"Edit Mode On" via that toggle shows the canvas toolbar** (sets `showCanvasToolbar: true` from Phase 2), while **a panel cube click is the single-action path and does not show it**.
- Both paths share the same underlying `editSurfaceHandle` edit-mode state (force-mute others, force-visible points/edges, etc.) — only the toolbar's visibility and `editTool`'s stickiness-vs-momentary framing differ.
- Exiting edit mode (via the canvas toolbar's Exit button, or the right panel's "Edit Mode On" toggle clicked again) clears `showCanvasToolbar` back to `false` along with the existing exit cleanup.

## Phase 4 — Undo button on the Edit History list

- Add a visible **Undo** button directly associated with the "Edit History" section in `RightPanel.tsx` (~line 137-150) — e.g. in the section header row, next to "Edit History", or immediately above/below the list.
- Wire it to the existing `undoEdit()` (same function the canvas toolbar's Undo button calls) — no new undo logic needed, just expose it here too.
- Disabled when `editUndoStack` is empty (matches the canvas toolbar Undo's disabled condition) — but since history is now session-persistent (6.3), this Undo should be usable **even when not currently in edit mode** (PM: "user could always undo action"). Confirm `undoEdit()` doesn't implicitly require `editSurfaceHandle` to be set for the surface whose command is being popped — if it does, that's a bug to fix here: undoing the most recent command for its `surfaceId` should work regardless of which surface (if any) is currently being edited. If this requires re-entering edit mode on that surface first, do so transparently (enter, apply undo, leave UI state otherwise unchanged) — document whichever approach is taken.

---

## Out of scope (explicitly, do not build)

- Add Point, Remove by Fence, Tag/Untag Breakline — still parked.
- Real point deletion — still a stub.
- Redo.
- Sprint 7 (export).

## Exit criteria

Canvas toolbar (reached via the right panel's Edit Mode toggle): Swap Edge stays active after a successful swap, repeated swaps work without re-selecting the tool. Right-panel "Edit Tools" cubes show no active/highlighted state ever; clicking one enters edit mode for a single action with the canvas showing edit-mode visuals (border/badge/force-visible points/edges/callout) and **no canvas toolbar**. The right panel's "Edit Mode On/Off" toggle is the entry point for the canvas-toolbar (multi-action) workflow. Edit History section has a working Undo button, usable regardless of current edit-mode state, correctly popping the most recent command (scoped per 6.3's surface-scoping). All Sprint 6/6.1/6.2/6.3 behavior intact otherwise. Typecheck/lint/full test suite green, with tests updated/added for: swap-edge non-revert (canvas toolbar), panel-cube momentary trigger + no-highlight, `showCanvasToolbar` (or equivalent) state transitions, and the new Undo button's behavior in and out of edit mode.

## Deliverables

- Updated `NOTES.md`: Sprint 6.4 section explaining the two-surface model (canvas toolbar = sticky multi-action; panel cubes = momentary single-action), the implementation approach for separating toolbar visibility from `editTool`, and the Undo-outside-edit-mode approach.
- Full test suite green.
