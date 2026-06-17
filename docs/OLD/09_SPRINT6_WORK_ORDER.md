# Sprint 6 Work Order — Editing Architecture + Move Point (Z-first)

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** This document is self-contained: read it, then `04_IMPLEMENTER_NOTES.md` (§0/§0.1/§5) and `NOTES.md`/`README.md` for current state. Layout/UX baseline is the shipped Sprint 4 UI.

**Current state (verified):** Sprints 0–4 green. 74/74 tests, DXF draped underlay shipped, contract at rev 1.2 (no `carlson-sourcedata` breaklines; `sourceDataPointLists` informational). Sprint 5 (Carlson .tin) is **permanently skipped** — LandXML-only.

**Standing constraints (unchanged):** `ui → viewer → core` dependency rule; core stays DOM-and-Three-free; raw survey coords (Float64) never mutated by rendering, never live in Float32 buffers; React out of the render loop; `// CARLSON-ASSUMPTION:` markers where relevant; contract frozen except where this order amends it; session-only, no localStorage.

**Goal:** prove the viewer→editor loop end to end with one convincing, low-risk live edit. This sprint is explicitly a **proof of concept** — minimum geometry risk, maximum confidence that the edit→render→undo→export(next sprint) chain works.

**Fixtures:** `_REFS/CO23012_TOPO.XML` (2,782 points, 5,020 faces) remains the primary test surface. `?testmesh=` synthetic surfaces usable for perf/undo checks.

---

## Phase 1 — Edit-mode state machine

- Store state machine: `view ↔ edit(surfaceId)`. Add to the existing Zustand store(s) in `src/state/` — do not create a parallel state system.
- **Entry:** explicit button (left panel, on the active surface's row or top section — pick the spot consistent with Sprint 3's Display Control Center layout). On entry: snapshot undo baseline (empty stack is fine — see Phase 4), force-mute all non-active surfaces (reuse the existing mute styling: desaturate + opacity 0.4, `depthWrite` on), swap right panel content to the edit tool (Phase 3).
- **Exit:** explicit button/control, always visible while in edit mode. If `dirty === true`, confirm-prompt before exiting ("N point(s) modified — exit edit mode?" or similar; export isn't built until Sprint 7, so the prompt should not promise export, just confirm intent).
- **Visual mode indicators (must be visible in ≥2 places, per the design ruling):** canvas border accent color change + a status badge (status bar or panel header). Mode must never be ambiguous — verify both indicators update together and persist through panel resizing.
- Non-active surfaces stay muted for the duration of edit mode regardless of their own visibility toggles; restore their prior state exactly on exit (same non-destructive-override pattern as the Sprint 3 master toggles).

## Phase 2 — Vertex picking

- Reuse the per-surface `three-mesh-bvh` BVH built at load (Sprint 2/3). Raycast on pointer events, restricted to the active surface's mesh only (other surfaces are muted/non-interactive in edit mode).
- Snap radius in **screen-space pixels** (not world units) — convert to a world-space tolerance per-frame based on camera distance, consistent with the close-zoom fix's distance-adaptive approach from Sprint 3.
- Hover highlight: nearest vertex within snap radius gets a distinct highlight (color/size change on the existing `THREE.Points` vertex overlay, or a small separate marker sprite — pick whichever is cheaper to keep at 60fps on the 2,782-point fixture and a `?testmesh=1000000` surface).
- Throttle hover raycast to rAF (same pattern as Sprint 3's large-dataset triage) — do not raycast on every raw pointermove.
- Click/tap selects the vertex (sticky selection, independent of hover) and opens the info card (Phase 3).

## Phase 3 — Selected-vertex info card + Z edit

- Right panel (in edit mode) shows a card: source point id, N, E, Z (current values, full precision display — match the surface's `precisionHint`).
- **Z edit only, this sprint** (per the lead ruling — XY moves are out of scope until the orientation-check guard below is proven, and even then are a stretch goal, not required for exit criteria):
  - Numeric entry field for Z, plus vertical drag on the selected vertex (drag along world Z while held/dragging — use the same gizmo/axis-constraint pattern as any existing Three.js drag helpers, or implement a simple screen-Y-to-world-Z mapping if none exists yet).
  - On commit (field blur/enter, or drag release): write to **Float64 source positions first**, then update the rebased Float32 render buffer for that vertex, recompute vertex normals for incident faces only (build a vertex→face adjacency map once per surface lazily on first edit — cache it on the surface's runtime/viewer-side state, not on `SurfaceModel` itself), call `refit()` on the BVH (do not rebuild from scratch).
  - Live update must be visible immediately — no re-render of the whole mesh, only the affected geometry attributes (`position`, `normal`) marked `needsUpdate`.
- **XY move stretch goal (optional, only if Z-edit + undo + dirty flag are solid with time remaining):** numeric XY entry or horizontal drag; before committing, run an orientation check on incident triangles (cross-product sign flip test); if any triangle would flip, block the edit with an inline message — no auto-retriangulation. Do not let this stretch goal put the Z-edit exit criteria at risk.

## Phase 4 — Undo + dirty flag

- Command stack: `{ surfaceId, vertexId, oldXYZ, newXYZ }`. **Single-level minimum required**, but design the stack so N-level is a trivial extension later (push/pop, no special-casing for "the one slot").
- Undo button/shortcut while in edit mode, visible alongside the mode controls. Undo re-applies the inverse of Phase 3's write path (Float64 source → Float32 buffer → normals → BVH refit) — do not special-case undo as a different code path from a normal edit.
- Dirty flag: `SurfaceModel.dirty` (field already exists in the contract per `04` §0.1 item 10 / contract.ts) flips to `true` on first edit this session, stays true through undo-to-original-state (simplicity over perfection — do not attempt to detect "back to baseline = clean again" unless trivial). Surface this as a small indicator (e.g. `●`) on the surface's row in the left panel, consistent with how other per-surface state is shown.

## Phase 5 — Safe/destructive labeling convention

- Establish (and document in NOTES.md) a simple convention for labeling edit actions/buttons as safe vs destructive (e.g., color or icon convention) — this sprint only needs **move point** labeled, but the convention itself should be reusable for Sprint 7+ edit tools (tag/untag breakline, fill hole, etc. — parked ideas).

---

## Out of scope (explicitly, do not build)

- Half-edge / topology structure — not needed for move point, do not introduce it preemptively (per `04` §5 ruling).
- Add/remove point, edge swap, breakline enforcement — later edit sprints.
- Export — Sprint 7.
- Multi-level undo beyond the single-level minimum (design for it, don't build it).
- Hover/ground-view camera mode — parked for after Sprint 7 per PM.

## Exit criteria

User enters edit mode (visible in ≥2 places) → picks a vertex on the active surface (others muted) → sees the info card with N/E/Z → changes Z via numeric entry or drag → sees faces update live (normals correct, BVH refit, no full re-render) → undoes (mesh returns to original state) → dirty flag reflects edit history → exits edit mode (confirm if dirty). All Sprint 0–4 behavior intact (imports, panels, DXF drape, multi-surface, labels, `?testmesh`). Typecheck/lint/tests green; add tests for: vertex pick math, Z-write path (Float64→Float32→normals→BVH refit), undo command stack, dirty-flag transitions.

## Deliverables

- Updated `NOTES.md` with deviations (if any), the safe/destructive convention chosen, and a Phase-checklist for PM's browser walkthrough (same format as Sprint 4's Phase 7 checklist).
- Any new test files alongside existing `tests/` suite; full suite green.
