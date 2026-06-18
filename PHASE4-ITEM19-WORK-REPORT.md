# Work Report — PHASE4-ITEM19 (PDF Rotate)

**Date:** 2026-06-18
**Files in scope:** `src/ui/PdfScene.tsx` (GroupPdfScene), `src/viewer/ViewerEngine.ts`

---

## Summary

Investigated why the PDF "rotate about a placed pivot" interaction rotates around the
sheet center instead of the chosen pivot. Root cause identified. Two cosmetic fixes
were drafted. A separate infrastructure problem (a stale file mirror in the Cowork
session) blocked verification and wasted most of the session before being diagnosed.
Work has been handed off to the Claude Code VS Code extension, which edits the real
files directly and avoids the blocker.

---

## What we figured out

### 1. Root cause of "rotates around the center" (the real bug)
`previewPdfOrientation` in `ViewerEngine.ts` does only:

    pdf.group.rotation.z = THREE.MathUtils.degToRad(orientationDeg);

Setting `rotation.z` rotates the group about its own origin (center). It ignores the
pivot point entirely. The placed pivot is only applied in the CSS/DOM transform inside
`PdfScene.tsx` (the `translate -> rotate -> translate` chain on the sheet div). So the
DOM preview and the 3D engine rotate about different centers, and the committed
geometry always rotates about center. **This is the source of the reported symptom.**

Fix direction (handed to the next implementer): make `previewPdfOrientation` rotate
about the pivot — translate the group so the pivot sits at the origin, apply the z
rotation, translate back — and pass the pivot coordinates from the `onPointerMove`
rotate block in `PdfScene.tsx` (the call site that currently passes only
`handle, newOrientation`).

### 2. Two secondary fixes drafted (PdfScene.tsx)
- **Overlay canvas blank on mount:** used `canvas.offsetWidth/offsetHeight`, which are
  0 before layout. Changed to read `parent.clientWidth/clientHeight` with a null guard.
- **Live orientation only applied during active drag:** the `liveOrient` condition was
  gated on `rotateDragRef.current`, so the sheet snapped back between drags. Broadened
  to apply whenever `liveOrientDeg` is non-null and the sheet is selected.

### 3. Additional findings flagged during investigation (not yet fixed)
- Overlay pivot/direction markers are drawn from offsets captured at placement and never
  updated during drag, and live inside the rotating sheet div, so they swing with the
  sheet instead of staying on the screen-fixed pivot line.
- Two parallel pivot representations exist (`rotateDragRef.pivotOffsetX/Y` vs
  `pivotOffsetRef`/`dirOffsetRef`); neither reaches the engine.
- "Done" can be a silent no-op: if the user places pivot + direction but never drags,
  `lastPreviewedOrientRef.current` stays null and nothing commits.

---

## What blocked us (process issue worth raising)

The Cowork session reads/writes project files through a mounted mirror of the repo. For
`PdfScene.tsx`, that mirror got stuck on a **stale, truncated snapshot** (72,818 bytes,
1,867 lines, cut off mid-token) while the real file on disk was complete (75,588 bytes,
1,950 lines, compiling clean). Consequences:

- Edits intended for the file were written into the stale mirror, so they did not appear
  in VS Code, and the user could not see the changes despite controlling commits/pushes.
- `tsc` and file reads in the session reported truncation errors that did not exist in the
  real file, sending the investigation down a false "file is truncated" path more than once.
- A corrupt git index (`bad signature 0x00000000`) was also present and was rebuilt with
  `del /f .git\index` + `git reset`, but that did not refresh the stale mirror.

The mirror cannot be force-refreshed from inside the session (cache drop is denied in the
sandbox). The reliable reset is a fresh session/remount.

**Important for the manager:** no broken content was pushed. The user's real files and
commits were always the correct, complete versions. The desync was confined to the
session's read/write mirror, not the repo.

---

## Current status / handoff

- Diagnosis complete; fix direction documented above.
- Work handed to the **Claude Code VS Code extension**, which operates on the real files
  in-editor (no mount, changes visible immediately). The next implementer received the
  root cause and the three fixes to apply.
- The two cosmetic fixes are simple drop-ins; the rotate-about-pivot fix in
  `previewPdfOrientation` is the substantive one and the priority.

## Recommendations

1. Do the rotate work in the Claude Code extension (or a fresh Cowork session) — not the
   current session, whose mirror is stale for this file.
2. Treat the rotate-about-pivot engine fix as the actual deliverable for ITEM19; the
   overlay/marker and commit-no-op items are follow-ups.
3. Process: when session edits don't appear in VS Code, check file size on disk
   (`dir <file>`) vs what the session reports before trusting session-side `tsc` output.
