# TIN VIEWER -- PM HANDOFF (NEXT COORDINATOR)
## Session close: 2026-06-18 (ITEM19 rotate complete; concept session for ITEM20+)

This handoff sits ON TOP of TIN_Viewer_PM_Handoff.md. Read that file first for
ROLE, COMMUNICATION RULES, STANDING RESTRICTIONS, GIT, KEY FILES, and the
completed-item history (ITEM13-19). Nothing here overrides those rules.

---

## STATE AT CLOSE

- ITEM19 (rotate mechanism) is DONE and committed/pushed (commit fcfb028).
  Root cause of its long bug chain: sceneToSheetPoint / sheetPointToScene had
  wrong matrix math; every placement/draw/hit-test/preview/commit path inherited
  it. Fixed at the source via a full coordinate audit (INVST-20) AFTER six
  targeted fixes failed. LESSON, now standing guidance: when tweaks keep trading
  one bug for another, STOP patching and audit the foundation with fresh eyes.
- No handoff is currently out. Next item is ITEM20 (see ROADMAP).

---

## LOCKED MENTAL MODEL (decided with AL this session)

Two scenes, two DIFFERENT editors with different jobs:

- GROUP SCENE = the HOLDER / ASSEMBLY EDITOR. Sheets are CUT (crop) and PLACED
  together here. It mirrors what becomes the 3D draped product. Draping is the
  end goal; placing is the next element built toward it.
- SINGLE PAGE SCENE = the SINGLE-SHEET EDITOR. A page is CALIBRATED, ORIENTED,
  and MARKED UP here so it can (a) play well with others in the group and (b)
  carry its own annotations.

Consequences (use these as boundary rules):
- MARKUPS are PAGE-LEVEL ONLY. There are NO markups on the group doc -- the
  group's final output will eventually be traced as a DXF off the 3D view. So the
  markup manager lives in the single-sheet editor.
- CROP is a HOLDER-EDITOR operation. It must NOT constrain interaction in the
  single-sheet editor. (This is the root of the "can't place calibration outside
  crop / element disappears" bug AL saw in single-page view.)
- Per-page state (visibility, etc.) must be honored consistently by BOTH
  renderers. Show-hide currently works in 3D but NOT in the group scene -- same
  bug class as the crop leak: one renderer honors per-page state, another ignores
  it.

---

## ROADMAP (priority order, decided with AL)

### ITEM20 -- SCALE PROPAGATION (open FIRST). Start with INVST.
The spine for placing and draping. 3D respects page calibration; the PDF/group
scene does NOT. Goal: the group scene carries each page's real-world scale
(pixelsPerFoot) so pages render at true relative size and a 1:10 sheet can
overlay/adjoin a 1:50 sheet correctly. Until the group scene speaks a shared
real-world unit (feet), placing is meaningless and draping can't proceed.
INVST should map: where calibration/pixelsPerFoot is read in 3D vs the group
scene, what unit the group scene currently renders in, and what must change so
the group scene converts each page's pixels into shared feet. Touches the render
core -- expect care.

### ITEM21 -- SCENE-BOUNDARY FIXES. Start with INVST (likely one investigation,
two symptoms).
1. Crop must not affect single-sheet-editor interaction (calibration placement
   blocked / element disappears outside crop in single-page view).
2. Show-hide must apply in the GROUP SCENE to match 3D (single scene is out of
   scope for this thought).
Both are "per-page state one renderer honors and another ignores." Investigate
together; they may share plumbing.

### ITEM22 -- LEFT-PANEL ROW ARCHITECTURE + UX. Start with INVST.
AL decision: let the IMP RECOMMEND component-per-type (each data type its own row
component on a shared contract) vs single-row-with-type-branches. Row internals
differ a lot per type (PDF has nested pages; DXF/LAS don't), so it's a real
trade-off. Acceptance bar = the uniform behaviors below must be cheap to uphold.

Required uniform behavior:
- One row expands -> all OTHER rows AND other sections hide; only the expanded
  row + its section header show.
- Click anywhere in the row (outside buttons) to expand. When expanded, the top
  section gets a bottom border with a 'v' in the middle indicating click-to-
  collapse.

Standard row layout:
- LEFT: TYPE pill (acts as the show/hide 'eye', like PDF works now) + FILE NAME
  in bold. Each data type gets a DIFFERENT colored pill. When hidden: pill greyed
  + strikethrough (as DXF/LAS indicate now).
- RIGHT: SELECT DETAILS, INFO button, REMOVE button (with confirm/catch).
- Adopt the DXF/LAS colored-pill-shows-file-type idea into EVERY row, and use it
  as the eye.

PDF specifics:
- PDF needs an INFO popup (currently missing).
- Remove parity: only single-page PDFs have remove today; treat single and multi
  the same.
- PDF SELECT DETAILS = # pages and file size.
- Expanded PDF row: first line = a row with OPEN and PLACE buttons. Then one row
  per PAGE.
- Page row: if multipage, has '^'/'v' controls. Page-number pill (like the PDF
  pill) with same show/hide. Page name next to pill. RIGHT side details: page
  size, page data size. Click a page row -> it expands and the OTHER page rows
  hide while expanded.
- Expanded page row top = buttons: CALIBRATE, ORIENT, MARKUP (placeholder), plus
  TRANSPARENCY slider. When calibrated, the set scale displays in the CALIBRATE
  button text. When oriented, ORIENT displays degrees off north.
- Under the page rows: a MARKUP MANAGER (page-level). To start, show a row for
  the SCALE BAR and a row for the ORIENT (when set) with show/hide.

### ITEM23 -- FILE COMPARTMENTALIZATION. Largely FALLS OUT of ITEM22 if done
component-first. PdfScene.tsx ~1965 lines, LeftPanel ~1445; AL wants files split
to keep cases small as they grow. Sequence as the row work lands; revisit any
remaining large files (PdfScene render core) separately.

---

## PARKED / FUTURE
- CSV data type (a new row type) -- ON HOLD, will be needed eventually.
- Carry over remaining parked items from TIN_Viewer_PM_Handoff.md (opacity slider,
  sheet alignment post-drape, toolbar horizontal clamp, global renderOrder audit,
  crop cursor polish, add-point-to-crop-polygon [beta pass given]).

---

## WORKING REMINDERS FOR THE COORDINATOR
- Always open a new item with an INVST handoff. Long leash: let the imp own
  scope and root cause; do NOT pre-diagnose to a single cause.
- After an imp report, read it and write the next handoff. Do not re-investigate.
- Handoffs are single markdown codeblocks with exact line numbers; imps read the
  exact lines before editing.
- AL writes all-caps, wants concise/direct. Match his energy.
