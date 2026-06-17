# Sprint 6.2 Work Order — Edit Callout Redesign + Edit History + Swap Edge

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** This document is self-contained: read it, then `12_SPRINT6_1_WORK_ORDER.md` (the rework this builds on) and `09_SPRINT6_WORK_ORDER.md` (original Z-edit design), plus `04_IMPLEMENTER_NOTES.md` §5 and `NOTES.md`'s Sprint 6 / 6.1 sections for current state.

**Sequencing note (PM, 2026-06-13):** PM had assumed most of this was already part of Sprint 6's scope. It wasn't — the original order was deliberately Z-first/no-half-edge to prove the loop with minimum risk (`04` §5, R7 in the risk register). This sprint (6.2) is where that gets extended: the callout becomes a real interactive card, an edit-history list is added, and **Swap Edge** — the risk register's explicitly-named "good candidate #2" topology edit — gets built. **Add point, remove-triangles-by-fence, and tag/untag breakline are logged as parked for Sprint 6.3+ (see §6 below)** so this sprint stays shippable; do not attempt all of them at once.

**Depends on:** Sprint 6.1 (canvas toolbar, in-canvas callout, force-visible points/edges, panel auto-close — all assumed shipped and working before this starts).

---

## Phase 1 — Callout card redesign (draggable, +/- controls, delete)

Replace Sprint 6.1's basic callout with the layout PM specified:

- **Row 1:** point id (`PNT #...`) + a **close (×) button** that deselects the vertex (does not delete it — just dismisses the callout).
- **Row 2:** Northing value + **+/- buttons** (small step, e.g. matching `precisionHint` or a sensible default like 0.01 — confirm a step size and document it in NOTES.md; PM can adjust later).
- **Row 3:** Easting value + +/- buttons, same pattern.
- **Row 4:** Elevation (Z) value + +/- buttons — this replaces Sprint 6's numeric `<input>` but keep numeric entry too if it's cheap (click the value to type directly, +/- for nudges) since direct entry was already working and PM didn't ask to remove it, just augment it.
- **Row 5:** **Delete** (with confirm — reuse the existing `window.confirm` pattern from exit-edit-mode) and **Move point** — see Phase 2.
- All edits to N/E/Z go through the **same Float64→Float32→normals→BVH-refit write path** Sprint 6 already built for Z — generalize that path to accept any of the three axes rather than duplicating it. This is the first time N/E (not just Z) get edited, so double-check the write path doesn't assume Z-only (e.g. normal recompute and BVH refit must trigger on N/E changes too, not just Z).
- **Card drag:** the callout card itself should be click-and-draggable by the user to reposition it on screen (so it doesn't obscure the point it's describing). This is a **UI repositioning drag** — separate from "Move point" (Phase 2), which drags the *vertex in the scene*. Add a small drag handle or make the PNT row draggable; once user-repositioned, the card can either stay screen-fixed or keep tracking-with-offset — pick whichever is simpler and document the choice. A toggle/button to re-enable "snap back to point" is a nice-to-have if trivial, not required.

## Phase 2 — Move Point: real XY+Z click-drag with orientation guard

- Extend Sprint 6's Z-drag to full **XY+Z drag**: clicking "Move point" arms drag mode for the selected vertex; dragging in the canvas moves the vertex in all three axes live (screen-to-world projection on the surface plane for XY, existing vertical-drag behavior for Z — or a combined approach if that's cleaner; use your judgment but keep it predictable).
- **Orientation-check guard (per the original Sprint 6 ruling — still the right call here):** before committing each drag-update, check incident triangle orientations. If a move would flip/invert a triangle's winding (point crosses to the "other side" of an opposite edge), **block that specific update** — the vertex simply doesn't move past that boundary, with a brief inline message via the existing `editMessage` mechanism (e.g. "can't cross triangle boundary here").
- **On retriangulation, PM's curiosity:** do **not** implement real local retriangulation this sprint — that's the half-edge-adjacent work R7 explicitly deferred, and "blocked at the boundary" is the documented safe default. If you want to give PM something to look at, a short NOTES.md note explaining *why* a true crossing would require re-triangulating the local neighborhood (and roughly what that'd take) is welcome — but don't build it.
- Undo must capture the full `{oldXYZ, newXYZ}` for XY+Z moves (the command stack shape from Sprint 6 already supports this — verify it actually records X/Y deltas now, not just Z).

## Phase 3 — Edit history list (right panel)

- Below the edit-action buttons in the right panel (the "tool cubes" area from Sprint 6.1), add a **scrollable list** of edits made this session.
- Each entry: point id, what changed (e.g. "Z: 4185.80 → 4186.10", or "N/E/Z moved"), and — minimum — a way to identify/select that entry. Clicking an entry could re-select that vertex in the canvas (nice-to-have, do if cheap).
- Source this from the **existing undo command stack** (Sprint 6's `editUndoStack`) — don't build a parallel history structure. If the undo stack is currently capped at "single-level minimum, design for N" (per Sprint 6 §4), this is the moment N actually matters: extend it to retain full session history (undo pops the top as before; the history list shows everything, including entries below the current undo pointer if you implement redo — redo is **not required**, but don't architect the list in a way that makes it impossible later).
- List should be scrollable and not push the action buttons off-panel — fixed-height with overflow, consistent with other panel sections.

## Phase 4 — Canvas toolbar: Swap Edge + tool slots

- The in-canvas toolbar (Sprint 6.1) should list, with **active-tool indication** (highlight/pressed state) for whichever is selected:
  - **Add Point** — stub/disabled this sprint (parked, §6).
  - **Edit Point** — this is Sprint 6/6.1's Move Point tool, renamed/reframed as the "selection + edit" tool per PM's toolbar list. When active, **points display larger** (increase point-sprite size on the active surface's vertex overlay while this tool is selected) to make picking easier — this directly addresses PM's "points are sometimes difficult to click" note. Revert size on tool switch/exit.
  - **Swap Edge** — **build this one**. Behavior: user clicks an interior edge (shared by exactly two triangles — boundary edges can't be swapped, reject with `editMessage`); the two triangles sharing that edge get their diagonal flipped (the shared edge is replaced by the other diagonal of the resulting quad). Update `indices`, recompute normals for the affected faces, refit BVH, push an undo entry (`{type: 'swapEdge', faceIds/edgeKey, before/after indices}` — extend the undo command shape; don't shoehorn this into the point-move shape). Picking an edge: raycast against the edges overlay (or derive nearest-edge from a triangle raycast hit + the click point) — reuse BVH where possible.
  - **Remove Triangles by Fence** — stub/disabled this sprint (parked, §6).
  - **Tag Breakline** / **Untag Breakline** — stub/disabled this sprint (parked, §6).
  - **Undo** and **Exit** — already exist from Sprint 6.1, keep them.
- "Active tool" must be visually obvious (consistent with the safe/destructive convention from Sprint 6 §5) — extend that convention to cover Swap Edge (likely "destructive-ish" since it changes topology, but reversible via undo — PM/lead can adjust labeling, just be consistent).

## Phase 5 — Bigger points in Edit Point mode

- Covered functionally in Phase 4 (Edit Point tool) — call out as its own checklist item for the PM walkthrough since it's a small, easy-to-verify visual change with outsized usability impact.

## Phase 6 — Parked for Sprint 6.3+ (do not build, log only)

Add to `docs/11_DECISIONS_LOG.md` parked list (or a new "Sprint 6.x parked" subsection):

- **Add Point** — requires deciding how a new point gets triangulated into the existing mesh (nearest-triangle split at minimum) — topology-adjacent, same family as retriangulation concerns in Phase 2.
- **Remove Triangles by Fence** — user draws a fence/lasso in the canvas; triangles fully inside get removed. Needs a 2D-in-3D fence-selection interaction (new) plus the removal mutates `indices` (straightforward) but may create holes/non-manifold edges — derived-boundary (Sprint 4) hole detection becomes relevant here.
- **Tag/Untag Breakline** — was in the original post-Sprint-3 parked ideas (downgrade selected linework to/from a breakline). Needs UI for selecting a chain of edges/points and writing to `SurfaceModel.breaklines` — contract is rev 1.2-stable for this (breaklines are `Polyline3D`-shaped already), so this is mostly a selection-UI problem, not a contract change.

---

## Out of scope (explicitly, do not build)

- Real local retriangulation on Move Point crossing (Phase 2 — guard/block only).
- Add Point, Remove by Fence, Tag/Untag Breakline implementations (Phase 6 — log only).
- Redo (nice-to-have only if trivial; not required).
- Hover mode, world view, and all other items in `11_DECISIONS_LOG.md`'s parked backlog — still post-Sprint-7.
- Sprint 7 (export) — still blocked until edit tooling is where PM wants it; reassess after this sprint whether 6.x continues or Sprint 7 starts.

## Exit criteria

Callout card matches the specified layout (PNT/close, N/E/Z rows with +/- buttons, delete-with-confirm, Move Point), is user-draggable on screen, and N/E edits go through the generalized write path with correct normals/BVH refit. Move Point supports XY+Z drag with the orientation guard blocking boundary-crossing moves (inline message, no crash, no topology corruption). Right panel has a scrollable edit-history list sourced from the undo stack. Canvas toolbar shows Add Point / Edit Point / Swap Edge / Remove by Fence / Tag Breakline / Untag Breakline / Undo / Exit, with clear active-tool indication; Add Point, Remove by Fence, and Tag/Untag Breakline are visibly present but disabled/stubbed. Edit Point mode renders points larger on the active surface. Swap Edge works on an interior edge (visual flip, correct normals, undo restores prior diagonal), rejects boundary edges with a message. All Sprint 6/6.1 behavior intact. Typecheck/lint/full test suite green — add tests for: generalized N/E/Z write path, XY orientation guard (including a case that correctly blocks), swap-edge mutation + undo, history-list data derivation.

## Deliverables

- Updated `NOTES.md`: Sprint 6.2 section — deviations, the step-size choice for +/- buttons, the retriangulation explainer note for PM, and an updated PM walkthrough checklist covering every item in the exit criteria.
- Updated `docs/11_DECISIONS_LOG.md` with the Sprint 6.3+ parked items from Phase 6.
- Full test suite green.
