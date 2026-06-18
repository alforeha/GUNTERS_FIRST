# TIN VIEWER — PM HANDOFF
## Session close: 2026-06-17 (ITEM17 transparency complete)

---

## ROLE

You are the project coordinator (chat/PM role) for GUNTERS_FIRST TIN Viewer — a browser-based
survey visualization tool built in React + Three.js + Zustand. AL (the PM) communicates in
all-caps and wants concise responses. You do NOT write code directly except for small targeted
fixes or emergencies. All implementation work goes through handoff documents sent to separate
implementers (imps).

---

## COMMUNICATION RULES

- AL writes in all-caps; match his energy, be direct and concise
- Handoffs must be single markdown codeblocks
- Always start implementation items with an investigation handoff (INVST) first.
  Never jump straight to a fix unless root cause is already confirmed from a prior imp report.
  AL: "I LIKE STARTING IMPS WITH AN INVESTIGATION"
- When AL pastes an imp report, read it, then produce the next handoff (FIX or INVST).
  Do NOT re-read code independently after receiving an imp report. The imp already did that.
  Do NOT re-investigate. Just read the report and write the handoff.
- Format: `[TYPE] HANDOFF: PHASE4-ITEM[N]-[TYPE_SHORTHAND]-[COUNT]`
  Types: INVST, FIX, IMPLM
- Do not draw conclusions from code — delegate investigation to imps

---

## STANDING RESTRICTIONS (all handoffs)

- cmd.exe only, no PowerShell
- ASCII only
- Python `open().write()` for full file writes >~8KB
- Targeted Edit tool (old_string/new_string) for partial changes — provide enough surrounding
  context to make old_string unique in the file
- `npx tsc --noEmit` for build verification — NOT `npm run build` (EPERM in imp sandbox)
- No `npm run build`
- MANDATORY before every Edit: `grep -c "old_string" file` — must return 1.
  If not 1, widen old_string with more surrounding context until unique. Do not proceed if count != 1.
- After every Edit: `grep -n` to confirm change landed at expected line number.
- Do not chain Edits without verifying each one landed first.
- tsc errors outside the file being edited: ask the user before touching them.
- Never rewrite a file from HEAD via python — if a file needs restoring, use `git restore`.
- If `grep` returns "binary file matches", use `grep -a` and move on — it is not corruption.
- When pre-existing errors are confirmed as pre-existing, trust it and stop re-testing.
- NEVER declare a file truncated based on a tsc error alone. Read the file to its actual
  final line before making any claim about truncation. Report the true final line number.
- All handoffs must specify exact line numbers for every change. Imps must read those
  exact lines before editing — no searching, no guessing.

---

## GIT

Repo initialized 2026-06-17. Remote: https://github.com/alforeha/GUNTERS_FIRST.git
Initial commit: `4a133ca` on branch `main`
After each completed item AL runs: `git add . && git commit -m "phase4: ITEM[N] — description"`

**COMMIT COMMANDS FOR ITEM17:**

```
git add -A
git commit -m "phase4: ITEM17 — PDF transparency toggle (2D + 3D)"
git push origin main
```

---

## IMMEDIATE NEXT ITEM — ITEM18: DRAWN ELEMENTS OUTSIDE CROP

**Status: Not started. Start with INVST handoff.**

AL observed that drawn elements (north arrow, scale bar, known distance markups) are showing
outside cropped areas. They should be masked/clipped to the crop boundary.

Relevant files:
- src/viewer/RenderPdf.ts — overlay Groups (north arrow, scale bar, known distance)
- src/core/contract.ts — BorderCrop = CropRect | CropPolygon
- src/ui/PdfScene.tsx — 2D canvas overlay rendering

Start with INVST handoff. Imp should determine:
1. Where each drawn element is rendered (3D overlay Groups vs 2D canvas)
2. Whether crop clipping is currently applied to overlays at all
3. What the correct fix approach is (scissor test, canvas clip path, stencil, etc.)

---

## ITEM AFTER ITEM18 — ROTATE MECHANISM

AL wants to change the rotate mechanism. Details TBD — AL will describe at session start.
Start with INVST handoff.

---

## PHASE 4 COMPLETED ITEMS

- ITEM13: 2D/3D Y-axis inversion — 4 negations in PdfScene.tsx. PM passed.
- ITEM14: Null selection, floating toolbar, polygon crop handles, crop display. PM passed.
- ITEM15: Sheet rotation direction. CSS negated, 3D correct (positive). PM passed.
- ITEM16: 3D polygon crop texture masking via DataTexture per-pixel alpha. PM passed.
- ITEM17: PDF transparency toggle — 2D clearRect fix, 3D always-transparent, Viewport re-hydration. PM passed.

---

## PARKED ITEMS

- Crop cursor polish (pointermove-based, not static CSS)
- Drag rotate in group PDF Scene
- Floating toolbar horizontal clamp near edges
- Opacity slider in left panel
- Sheet alignment feature (post-drape)
- Left panel row UI uniformity
- Global renderOrder audit across all draped dataset types
- Add point to crop polygon (AL gave beta pass)

---

## KEY FILES

| File | Notes |
|---|---|
| src/ui/PdfScene.tsx | ~1430 lines. clearRect/fillRect branches fixed in ITEM17. |
| src/ui/LeftPanel.tsx | ~1445 lines. Clean. |
| src/state/store.ts | reorderPdfGroupSheets present. Clean. |
| src/core/contract.ts | BorderCrop = CropRect or CropPolygon. Clean. |
| src/ui/importController.ts | setWhiteThreshold at lines 1227-1234. Clean. |
| src/viewer/RenderPdf.ts | requestRender after clearLoadedTiles; whiteThreshold fallback 240 in decodeTile. Clean. |
| src/viewer/ViewerEngine.ts | setPdfRenderOrder public method. Clean. |
| src/workers/pdf.worker.ts | applyWhiteThreshold with sentinel 0 skip. Clean. |
| src/ui/Viewport.tsx | PDF re-hydration loop added after engineHolder.current = engine. Clean. |
| src/ui/App.module.css | pdfSheetLayer bg transparent, pdfSheetToolbar, pdfSheetLayerCropped. |

---

## KEY TECHNICAL FACTS

- flatOffsetPx: model/world coords — positive Y = north/up (NOT CSS down)
- CSS sheet transform: `translate(x, -y)` — Y must be negated
- Three.js renderOrder: scene-global, not scoped to parent Groups
- whiteThreshold sentinel: 0 = disabled (skip entirely), active = clamped 200-255
- 3D view ALWAYS uses transparent PDFs — threshold forced to 240 in decodeTile if store value is 0
- 2D PDF Scene toggle (0 vs 240) only affects 2D canvas rendering
- White fillRect in renderBasePage (worker) is INTENTIONAL — PDF.js compositing requires opaque base. Do not remove.
- PDF tile pipeline: worker decodes RGBA tiles from shared base canvas cache
- BorderCrop: CropRect | CropPolygon — both must be handled in all crop code paths
- usePdfTileCache deps: [file, sheet.pageIndex, sheet.whiteThreshold]
- 3D rotation: positive degrees = correct in Three.js; CSS must negate
- React StrictMode double-invoke: engine can be null during confirmPdfImport — Viewport re-hydration loop handles this

---

## DECISIONS LOG

See docs/11_DECISIONS_LOG.md. Key decisions:
- Y-axis: flatOffsetPx positive Y = north/up; CSS must negate Y
- Crop: polygon crop in 2D; 3D uses bounding box approximation (exact mask parked)
- zOrder removed: draw order = sheetIds array position + explicit renderOrder values
- Transparency: whiteThreshold sentinel 0 = no-op, not a threshold value
- Reorder field: sheetIds array is canonical; zOrder removed from PdfGroupEntry
- 3D transparency: always on regardless of 2D toggle (forced threshold 240 in RenderPdf.ts decodeTile)
