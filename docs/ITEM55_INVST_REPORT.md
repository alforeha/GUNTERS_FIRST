# ITEM55 INVST — GROUP SCENE / 3D DIVERGENCE WHEN PLACED GROUPS ARE REARRANGED

STATUS: DESIGN-COMPLETE. RECOMMENDATION: CANDIDATE A (COMPOSE / ANCHOR MODEL).
AWAITING AL LOCK BEFORE ANY BUILD.

---

## 1. DIVERGENCE MECHANISM — PROOF

### The mutual exclusivity

`src/viewer/RenderPdf.ts:385-408` (`applyTransform`):

```
if (placement) {
  // PLACED BRANCH — uses placement.translation, IGNORES relativeLayoutPx
  position = placement.translation - origin         (line 388-392)
} else {
  // UNPLACED BRANCH — uses relativeLayoutPx/ppf
  position = relativeLayoutPx / ppf                 (line 400-404)
}
```

These branches are **mutually exclusive**. A sheet with `placement !== null`
always takes the first branch. `relativeLayoutPx` is dead for 3D positioning
on any placed sheet.

### The rearrangement path

`src/ui/PdfScene.tsx:854` (group-scene drag):
```
setPdfFlatOffset(drag.handle, { x: newX, y: newY })
```

`src/ui/importController.ts:1362` (`setPdfFlatOffset`):
```
patchPdfSheet(handle, { relativeLayoutPx: layout })
→ engine.updatePdfSheet(sheet)                    (line 1365)
→ RenderPdf.updateSheet                             (line 222)
→ applyTransform()                                   (line 222)
→ placed branch → uses placement.translation       (line 388-392)
→ 3D position UNCHANGED
```

The same applies to orient-Done at `PdfScene.tsx:985`, which also calls
`setPdfFlatOffset`.

### Worked example: 2-page placed group, then rearrange

**Initial state** — two pages in a group, both PLACED:
```
Sheet A: relativeLayoutPx=(0, 0),    placement.translation=(10.0, 5.0, 0)
Sheet B: relativeLayoutPx=(8.5, 0),  placement.translation=(10.5, 5.0, 0)
  (8.5" = letter width at 1:1 scale, as placed with ITEM54 per-member deltas)
```

In 3D: A at (10,5,0), B at (10.5,5,0). Group scene shows A left of B.
Group == 3D. Correct.

**User drags page B DOWN in group scene** to relativeLayoutPx=(8.5, 11.0):
1. `setPdfFlatOffset("B", {x:8.5, y:11.0})` writes store.
2. `engine.updatePdfSheet(sheetB)` → `applyTransform()`.
3. Placed branch: position = `placement.translation` - origin = still (10.5, 5.0, 0).
4. **3D position of B unchanged.** Group scene shows B below A.

**Result: DIVERGENCE.** Group scene: A above B. 3D: A next to B horizontally.
They are out of sync until the user re-places.

---

## 2. CANDIDATE A — COMPOSE (ANCHOR MODEL)

### Concept

Placement stores a **single group anchor** (translation + rotation), not a
frozen per-member world translation. Each member's 3D world position is
dynamically derived:
```
member_3D_world = anchor + per_member_offset_from_relativeLayoutPx
```

When `relativeLayoutPx` changes (drag/orient in group scene), the member's
3D position recomputes from the live `relativeLayoutPx` → GROUP ALWAYS == 3D.

### Store / placement shape change

`src/core/contract.ts:164` — `PdfPlacement` changes from:
```ts
export interface PdfPlacement {
  pairs: PdfPlacementPointPair[];
  translation: { x: number; y: number; z: number };  // REMOVED
  rotationDeg: number;                                 // becomes anchor
  scale: number;
  residualFt: number | null;
}
```
to:
```ts
export interface PdfPlacement {
  pairs: PdfPlacementPointPair[];
  anchorTranslation: { x: number; y: number; z: number };  // group anchor in world
  anchorRotationDeg: number;                                // group-level rotation
  scale: number;
  residualFt: number | null;
}
```

The anchor belongs to the group conceptually. For single-sheet non-group
placements, the anchor acts as the sheet's own anchor (relativeLayoutPx
determines offset from anchor — for a singleton this is just the sheet's
position).

### applyTransform change

`src/viewer/RenderPdf.ts:385-396` — placed branch:
```
if (placement) {
  const ppf = pixelsPerFoot();
  const ax = placement.anchorTranslation.x;
  const ay = placement.anchorTranslation.y;
  const az = placement.anchorTranslation.z;
  const rad = MathUtils.degToRad(placement.anchorRotationDeg);
  const rx = sheet.relativeLayoutPx.x / ppf;
  const ry = sheet.relativeLayoutPx.y / ppf;
  const cz = Math.cos(rad);
  const sz = Math.sin(rad);
  this.group.position.set(
    ax + rx * cz - ry * sz - origin[0],
    ay + rx * sz + ry * cz - origin[1],
    az - origin[2],
  );
  const sheetRotRad = MathUtils.degToRad(sheet.orientation ?? 0);
  this.group.rotation.set(0, 0, rad + sheetRotRad);
  this.group.scale.setScalar(1);
  this.group.visible = this.visibleAll;
  return;
}
```

The rotation composes: anchor rotation + sheet's own orientation within group.

### How ITEM37/39 exact-alignment is preserved

The placement tool (raw survey mode) currently computes `translation` and
`rotationDeg` from the point-pair regression (pdf↔world). Same math, same
`pairs[]`, same `residualFt`. The only change: the computed world position
becomes `anchorTranslation` instead of `translation`, and the computed rotation
becomes `anchorRotationDeg` instead of `rotationDeg`. The per-member offsets
(relativeLayoutPx) are the exact relative positions within the group — they
are preserved as-is. The anchor is the group's world transform; the surveyed
point-pairs define that transform. Nothing about the survey math changes.

### How ITEM54 rigid-place is preserved

`src/ui/PlacementToolbar.tsx:39-68` — `onConfirm`:

Current: per-member `translation = origin + (wcx,wcy) + delta`.
New: single group `anchor = origin + (wcx_picked,wcy_picked) + delta`.

The picked sheet's `wcx, wcy` defines where in the group's relative layout
the "grab point" sits. The anchor is computed so that the picked sheet lands
exactly at the target world point. Non-picked members maintain their
relativeLayoutPx offsets, so they shift by the same delta → rigid group
movement preserved.

### Re-placing re-sets the anchor

When user places again: new anchor computed from new pick+target, same as
initial placement. RelativeLayoutPx unchanged (they define arrangement).
Group moves as a unit.

### Worked example (same 2-page group)

**Initial placed state** (anchor at group origin by convention):
```
anchorTranslation = (10.0, 5.0, 0), anchorRotationDeg = 0
Sheet A: relativeLayoutPx=(0, 0)     → 3D = (10.0, 5.0, 0)
Sheet B: relativeLayoutPx=(8.5, 0)   → 3D = (10.5, 5.0, 0)
```
Group == 3D.

**Drag B down** in group scene to relativeLayoutPx=(8.5, 11.0):
```
applyTransform() reads new relativeLayoutPx:
  Sheet B 3D = (10.0 + 8.5, 5.0 + 11.0, 0) = (10.5, 6.17, 0) [at ppf=100]
  (actual ppf depends on calibration, math is illustrative)
```
Group scene shows B below A. 3D shows B below A. **SYNC PRESERVED.**

---

## 3. CANDIDATE B — CLEAR-ON-EDIT

### Concept

When `relativeLayoutPx` changes on a placed sheet, clear `placement` → sheet
reverts to unplaced branch → 3D follows `relativeLayoutPx/ppf`. User must
re-place after any rearrange.

### Detection point

`src/ui/importController.ts:1362` (`setPdfFlatOffset`):
```
export function setPdfFlatOffset(handle, layout) {
  const sheet = store.getState().pdfSheets.find(s => s.handle === handle);
  const patch = sheet?.placement
    ? { relativeLayoutPx: layout, placement: null }  // CLEAR placement
    : { relativeLayoutPx: layout };
  store.getState().patchPdfSheet(handle, patch);
  ...
}
```

Also needed in orient-Done (PdfScene.tsx:985) — same guard.

### UX flow

1. User places a 2-page group. Group == 3D. Satisfied.
2. User opens group scene, drags page B.
3. Placement is cleared silently. 3D jumps: sheets move from anchored world
   positions to their relativeLayoutPx positions (which may be far from the
   original placement).
4. User notices the 3D change, re-opens placement toolbar, re-surveys.
5. User must re-place after EVERY rearrange of a placed group.

### Worked example (same 2-page group)

**Initial**: Same as A — placed, synced.
**Drag B down**: `setPdfFlatOffset` detects `placement !== null`, clears it.
Sheet B now unplaced → 3D position = relativeLayoutPx/ppf = (8.5, 11.0)/ppf.
Sheet A is still placed (not dragged). **Now A is placed, B is unplaced.**
Group scene shows both in new arrangement. 3D shows A at old placement, B at
new relative. **Still diverged, but differently — and B lost placement data.**
User must re-place the GROUP (both sheets) to restore sync.

---

## 4. COMPARISON: A vs B

| Dimension | A (COMPOSE) | B (CLEAR-ON-EDIT) |
|---|---|---|
| _Always-match_ satisfaction | Yes — transparent, automatic | Yes — but requires manual re-place every time |
| Risk to ITEM53/54 model | Medium — placement contract changes (`translation`→`anchorTranslation`) | Low — placement shape unchanged |
| Risk to ITEM37/39 exactness | Needs validation that anchor math preserves the residual. The point-pair regression is unchanged; only the output field name changes. Risk is LOW. | Zero — no change to placement math |
| Risk to placement loss | Low — anchor persists across edits, recalculated on re-place | High — placement silently cleared on ANY layout edit; user may not notice |
| Simplicity | ~3 files changed, contract change | ~1 line guard in 1-2 files |
| User frustration | None — it just works | User must re-place after every arrange; AL's "rearranging moves pages relatively in 3D, then he RE-PLACES to realign" pattern REQUIRES the re-place step |
| Failure mode | Anchor math uses wrong convention (world vs local) → all placed sheets mispositioned | Silent placement loss → user doesn't know placement was cleared; may save/close without re-placing |
| Partial-place edge case | Each member has its own placement? Or shared group placement? **Each member has its own** — a group member could be individually placed outside the group. Need to handle "some placed, some not" in a group. | Same edge case: clearing one member's placement on drag doesn't affect others |

### Edge case note for Candidate A

Currently, each `PdfSheetEntry` has its own `placement` field. In the COMPOSE
model, each placed member stores its own anchor. For a group, all members
SHOULD share the same anchor — but the store allows per-member placement.
This already exists today (per-member `translation` in ITEM54). The new model
stores per-member `anchorTranslation`; for group members, they all get the
same anchor values from `PlacementToolbar.onConfirm`. This is not a new
problem — it's the same per-member model ITEM54 introduced.

**Graceful handling**: If a group has mixed placed/unplaced members, placed
ones use anchor+relativeLayoutPx, unplaced ones use relativeLayoutPx/ppf
directly. This is the same branching that exists today.

---

## 5. RECOMMENDATION

**CANDIDATE A (COMPOSE / ANCHOR MODEL).**

Rationale:
1. It actually satisfies "always match" without user friction. B introduces
   a mandatory re-place step that AL may be fine with, but "they must never
   be out of sync" is the invariant — B allows a transient unsync window
   (user drags → placement cleared → 3D jumps to new position that may not
   be intended → user must fix).
2. The per-member `translation` is ALREADY known to be mutually exclusive
   with `relativeLayoutPx` (that's the bug). Fixing the model to compose them
   instead of choosing one is the structural fix.
3. AL's stated tolerance ("rearranging moves pages relatively in 3D, then he
   RE-PLACES to realign") works with EITHER model — but A gives the "moves
   pages relatively in 3D" part automatically, making re-placing intentional
   (to realign to world) rather than mandatory (to resync).
4. B's silent placement clearing is a data-loss risk that creates new bugs
   (placement disappearing unexpectedly).

---

## 6. SLICE PLAN FOR CANDIDATE A

This is design-bearing — structural contract change. Slice into verification
gates.

### Slice 1: Contract change (no behavior)

**File**: `src/core/contract.ts:164-170`

Rename `PdfPlacement.translation` → `anchorTranslation`, `rotationDeg` →
`anchorRotationDeg`. This is a pure rename that tsc will catch everywhere.
Change the field names; fix ALL tsc errors throughout the codebase to use
new names. NO behavior change — all placed sheets should render identically
in 3D. Zero runtime difference at this slice.

**Verify**: tsc clean. In-app: place a group → 3D positions unchanged from
before. This proves the rename is complete and no semantic change yet.

### Slice 2: applyTransform composition (behavior)

**File**: `src/viewer/RenderPdf.ts:385-396`

Replace the placed branch to derive position from `anchorTranslation +
relativeLayoutPx/ppf` rotated by `anchorRotationDeg`, plus sheet's own
`orientation` rotation composed in.

**Verify in-app**:
- Place a 2-page group. Confirm 3D positions match pre-change (slice 1
  produces identical positions since anchorTranslation == old translation
  and relativeLayoutPx offsets are already baked into the per-member
  translations from ITEM54 — but AFTER this slice, the anchor is set to a
  SINGLE group anchor, and relative offsets are derived. This WILL change
  positions unless PlacementToolbar is also updated. So:
  - **Actually**: Slice 2 and Slice 3 must be done together, or Slice 2
    needs a temporary compatibility path.
- **Revised**: Do Slice 1 (rename only, zero behavior change, tsc gate).
  Then do Slice 2+3 together as one behavioral change.

### Slice 2+3 combined: applyTransform COMPOSE + PlacementToolbar anchor write

**Files**:
- `src/viewer/RenderPdf.ts:385-396` — compose position from anchor + relativeLayoutPx
- `src/ui/PlacementToolbar.tsx:39-68` — write `anchorTranslation` + `anchorRotationDeg`
  per member (same anchor for all group members), derived from picked sheet's
  world-center + delta

**Key math** in PlacementToolbar:
```
// Current (per-member frozen translation):
translation = { x: origin[0] + wcx + deltaX, y: origin[1] + wcy + deltaY, z: 0 }

// New (group anchor):
// The anchor is the world point that corresponds to the group's (0,0) in
// relative layout. For the picked sheet at world-center (wcx,wcy), and its
// relativeLayoutPx = (rlpx, rlpy):
//   anchor = world_target - (relativeLayoutPx_picked / ppf)
//        ...rotated by anchorRotationDeg (but initially 0 for placement).
// Simplified for the common case (anchorRotationDeg = orientation?):
anchorTranslation = {
  x: origin[0] + wcx + deltaX - (pickedSheet.relativeLayoutPx.x / ppf),
  y: origin[1] + wcy + deltaY - (pickedSheet.relativeLayoutPx.y / ppf),
  z: 0,
}
// All group members get the same anchor.
```

**Verify in-app**:
1. Unplaced group: drag pages in group scene → 3D moves proportionally
   (same as current unplaced behavior).
2. Place the group: pick on page A, target on world → confirm all pages
   move to world positions that match relative layout. Confirm group == 3D.
3. After placing, drag page B in group scene → confirm B moves in 3D
   immediately. Confirm group == 3D at all times.
4. Re-place after rearrange: pick new target → confirm anchor updates and
   whole group shifts. Confirm group == 3D.
5. Single non-group placement: confirm works same as before (singleton
   is just a group of 1 — anchor + 0 offset = sheet position).
6. ITEM37/39 regression: raw survey placement with multiple point pairs →
   confirm residual unchanged from prior behavior.

### Verification checklist

Each gate is IN-APP, not tsc-only:
- [ ] Place group → 3D matches group scene layout
- [ ] Drag placed page in group scene → 3D moves live, stays synced
- [ ] Re-place after rearrange → 3D jumps to new world position, stays synced
- [ ] Single-sheet placement (no group) → unchanged behavior
- [ ] Raw-survey placement (ITEM37/39 path) → residual preserved
- [ ] Multiple groups, each independently placed → no cross-talk
- [ ] Mixed placed/unplaced members in a group → placed members use anchor,
      unplaced use relativeLayoutPx/ppf

### Files touched (total)

| File | Change |
|---|---|
| `src/core/contract.ts:164-170` | PdfPlacement field rename |
| `src/viewer/RenderPdf.ts:385-396` | applyTransform placed branch rewrite |
| `src/ui/PlacementToolbar.tsx:39-68` | onConfirm anchor computation |
| `src/ui/importController.ts:1368-1372` | setPdfPlacement unchanged (pass-through) |
| `src/viewer/ViewerEngine.ts:614-619` | getPdfGroupPositionScenePx unchanged |

---

## 7. OUT OF SCOPE

- Drape behavior on placed groups (ITEM52 path, not touched)
- Parked items
- Any code implementation (this is design-bearing, awaiting AL lock)

---

(End of ITEM55 INVST report)
