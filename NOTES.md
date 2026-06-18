# NOTES — ITEM17 PDF transparency toggle — 2026-06-17

Status: COMPLETE. PM passed.

## What changed

- **src/viewer/RenderPdf.ts** — two edits:
  1. Added `this.requestRender()` after `clearLoadedTiles()` in the `thresholdChanged` branch so the 3D render loop immediately re-runs `updateVisible` and re-fetches tiles.
  2. In `decodeTile` (~line 777): force 3D to always use an active threshold: `whiteThreshold: this.sheet.whiteThreshold !== 0 ? this.sheet.whiteThreshold : 240`. 3D view always shows transparent PDFs regardless of the 2D toggle.

- **src/ui/PdfScene.tsx** — fixed three draw-loop branches in `PdfSheetCanvas` that were painting a white `fillRect` behind tiles every frame, covering transparent pixels. Each branch now does `clearRect` when `sheet.whiteThreshold !== 0`, otherwise `fillRect` (opaque white). Applied to: `cropActive` branch, `borderCrop` branch (inside clip), and default branch.

- **src/ui/Viewport.tsx** — PDF re-hydration after engine mount to handle React StrictMode double-invoke (PDFs silently dropped when engine was null during `confirmPdfImport`). After `engineHolder.current = engine`: iterates `state.pdfSheets`, calls `engine.addPdf(sheet, file)` and `engine.updatePdfSheet(sheet)` for each.

## Key decisions

- 3D view ALWAYS shows transparent PDF backgrounds (threshold forced to 240 if store value is 0)
- 2D PDF Scene toggle controls 2D scene only
- White `fillRect` in `renderBasePage` (worker) is intentional for PDF.js compositing -- NOT removed
- `applyWhiteThreshold` sentinel 0 = early return (disabled) -- correct, unchanged

---

# NOTES — Phase 4 PDF Scene polish (ITEM13 + ITEM14) — 2026-06-17

## ITEM13: 2D/3D Y-axis inversion fix

Root cause: flatOffsetPx is model/world space (positive Y = up/north). The 3D
scene used it correctly. The 2D PDF Scene applied it directly to CSS translateY
where negative Y moves upward, inverting the page stack and drag direction.

Fix (FIX-1, PdfScene.tsx only):
- screenToScene: negated Y term -> -(y - pan.y) / zoom
- visible tile scheduling: sheetPan.y uses p.y - sheet.flatOffsetPx.y * z
- sheet drag delta: subtracts pointer Y delta
- CSS translate: uses -sheet.flatOffsetPx.y - sheet.heightPx150 / 2

tsc clean. PM confirmed visual pass: page order and drag direction now match 3D.

## ITEM14: PDF Scene selection, floating toolbar, crop handles

Three sequential passes, all tsc clean. No browser check by implementer;
PM to visually confirm on next session open.

FIX-1 -- True null selection (PdfScene.tsx, GroupPdfScene):
- selectedHandle is now string | null; selected is PdfSheetEntry | null
- Fallback effect no longer resets intentional null to sheets[0]
- Click empty space -> deselects; Escape -> deselects
- Toolbar buttons disabled when null; title shows neutral prompt

IMPLM-1 -- Floating contextual toolbar (PdfScene.tsx + App.module.css):
- Top bar reduced to scene label + Return to 3D only
- New pdfSheetToolbar class: screen-space absolute, blur background,
  translateX(-50%) centering, clamped 8px from edges
- Toolbar anchored to top-center of selected sheet in screen coords
- Contains: sheet label, Rotate -, Rotate +, Crop In, Crop Out, Clear Crop
- Hidden when selected is null; does not scale with zoom

IMPLM-2 -- Crop handles + polygon crop (contract.ts, store.ts,
importController.ts, PdfScene.tsx, RenderPdf.ts):
- BorderCrop = CropRect | CropPolygon added to contract.ts
- borderCrop upgraded from Rect | null to BorderCrop | null throughout
- 2D overlay canvas per sheet layer: corner handles, midpoint ghost handles
- Dragging corner reshapes crop; midpoint drag inserts new vertex
- CropRect auto-converts to CropPolygon on first independent vertex move
- Crop In / Crop Out buttons removed; Clear Crop remains in floating toolbar
- 3D tile clipping uses bounding box of polygon crop (approximate) -- exact
  polygon mask in 3D is parked

## Parked items added this session
- Exact polygon crop mask in 3D tile clipping (bounding-box approximation in use);
  PM wants 3D crop lines to match the polygon as drawn in PDF Scene -- needs
  RenderPdf.ts work to pass exact polygon points to tile clipping path
- Floating toolbar horizontal clamp is width-unaware for wide content near edges
- Drag rotate in group PDF Scene (in-scene rotate handle, not buttons)
- Cursor polish (low priority): cropped sheet cursor stays default over cropped
  area instead of switching to move; uncropped sheet move cursor hit area feels
  too small -- both need hover/pointermove-based cursor logic rather than static
  CSS on the div

---

# NOTES — Phase 5 Milestone 3 (point cloud LOD, display modes, filters)

Status: implemented and tests green (129/129). Blocking regression fixed. Ready for PM visual review.

## What was fixed this pass

1. **Black-points regression fixed.** Root cause: `Uint8BufferAttribute(normalized=true)` filled post-construction with `needsUpdate=true` does not reliably re-upload/normalize on the GPU in this three.js version. Fix: replaced with a plain `Float32BufferAttribute` (values 0–1). All `colorFor()` paths updated accordingly — RGB divides source `Uint8` values by 255, intensity is already 0–1 from the worker, elevation and GeoTIFF ramp values divided by 255. No other logic changed.

2. **All three temp diagnostics removed** from `RenderPointCloud.ts`: `[PC pack]` log + `loggedPack` static, `[PC setDisplayMode]` log, `[PC pass]` log + `loggedPass` static.

3. **`vite.config.ts` `server.hmr` block reverted** — was added chasing a wrong theory, confirmed unnecessary.

4. **Two pre-existing test failures fixed** in `tests/pointcloud-lod.test.ts`:
   - LOD thinning test: the far node gets `stride: 0` (dropped entirely, which is coarser than any positive stride). Fixed assertion to treat stride 0 as `Infinity` for the comparison.
   - Multi-class worker test: the fixture alternated classes by `i % 2`, but the root-node sample stride is 4096, so only even indices (class 1) were ever sampled. Fixed to alternate by block-of-4096 so index 4096 (the second sampled point) is class 2.

## [PC pass] diagnostic — NOT captured

The handoff required capturing the `[PC pass]` console output before removing it. That log was never triggered in a browser session by the prior IMP either. **PM needs to run the app with the reference LAS loaded and note the pass numbers** (scoredInFrustum, selected, totalNodes, totalSampledPoints, drawnNodes, drawnPoints) to diagnose whether density is limited by frustum rejection, LOD node selection, or the octree sample cap. The diagnostic code has been removed; if needed it can be re-added temporarily from the handoff doc.

## Acceptance status after this pass

- [x] RGB renders correctly — **fix shipped, awaiting PM visual confirm**
- [ ] Closer zoom loads denser nodes — implemented (LOD), **needs PM visual confirm**
- [ ] LOD switches on camera settle — implemented, **needs PM visual confirm**
- [x] Display mode selector: RGB, intensity, elevation, GeoTIFF-sampled — implemented
- [x] GeoTIFF color option greyed when no GeoTIFF loaded — implemented
- [x] Classification toggles use LAS spec names, filter without re-parsing — implemented
- [x] Returns filter present, greyed with note for single-return file — implemented
- [x] No temp diagnostic logs remaining in code
- [x] `vite.config.ts` `server.hmr` block reverted
- [x] `npm test` 129/129, `npm run lint` 0 errors
- [ ] `npm run build` — run on PM machine to confirm
- [ ] PM visual review

---

# NOTES — Sprint 6.5 (docs/16: single-action cube exit polish)

Status: implemented. This was the small controller pass to make the right-panel single-action
path actually behave like a one-and-done loop instead of a hidden variant of full edit mode.

1. **Cube-triggered edits no longer close the panels.** `triggerSingleEditTool()` was still
   carrying the panel-collapse behavior copied from the canvas-toolbar entry path. That call was
   removed, so clicking a cube leaves left/right panel open state untouched.
2. **Single-action completion now fully exits edit mode.** `finishSingleActionEdit()` had only
   been resetting the tool/selection, which left `editSurfaceHandle` active and kept all edit
   overlays/badges/mute overrides alive. It now uses the normal edit-mode exit state path
   silently, without the manual-exit dirty confirmation.
3. **History persistence remains intact.** The auto-exit still goes through the same 6.3 store
   semantics where `exitEditMode()` clears transient edit-mode state but does not wipe
   `editUndoStack` or `editModifiedVertexIds`, so the right-panel Undo button still works after
   the single action completes.
4. **`finishSingleActionEdit()` call site remains the shared commit callback in `Viewport.tsx`.**
   That means it runs only after a successful committed edit command (swap or point move). Failed
   actions still do not exit, so the PM can retry immediately.
5. **Cube highlight is back only during the active single-action session.** The panel cubes now
   use `toolCubeActive` only when `editSurfaceHandle` is set, `showCanvasToolbar` is false, and
   the cube's tool matches `editTool`. That avoids the old "always highlighted at rest" problem
   while restoring visible feedback during a live one-shot edit.

---

# NOTES - Phase 1 viewer/camera pass (docs/18)

Status: initial implementation landed. `npm run build` and `npm test` are green after this pass.

1. **Top / 3D / Hover now share one camera-state flow.** `ViewerEngine` now supports a third
   `hover` mode in addition to the existing orbit/top modes. The left-panel segmented control
   includes `Hover`; entering hover is a two-step flow: click `Hover`, then click the active
   surface in the canvas. Leaving hover is done by clicking `3D` or `Top`, which preserves the
   current hover position and reorients the destination mode in place.
2. **Zoom slider and Hover Height live as floating canvas controls.** The viewport now owns a
   floating HUD in the lower-right corner. Zoom is always visible there; `Hover Height` appears
   beside it only while hover mode is active, matching the Phase 1 decision to keep both controls
   in-canvas rather than in the side panels.
3. **Hover mode uses FPS-style movement with pointer lock.** On hover entry the camera snaps to
   the clicked XY plus the requested `Hover Height`, then uses WASD for planar movement and
   mouse-look while the pointer is locked. Pressing `Esc` releases pointer lock via the browser's
   normal path; clicking the canvas re-locks it.
4. **Zoom slider root-cause note:** the old "stuck zoom" report does not appear to be a damping
   problem in the current code path because OrbitControls damping is disabled. The more likely
   underlying trigger is state drift near control distance/zoom limits or a user getting stranded
   in an awkward camera/target configuration. The new slider is intentionally a permanent manual
   override even if that deeper repro ends up being intermittent.
5. **Vertical exaggeration investigation (code-level finding):** `setVerticalExaggeration()` is
   still a single Z-scale applied to `contentGroup`, so exaggeration is globally delta-based and
   not keyed to dataset relief/range. That makes a formula bug unlikely in the current engine.
   The remaining likely explanations are visual/perceptual differences between datasets, or a
   dataset-origin/presentation issue elsewhere in the import/render path. Manual side-by-side
   screenshot verification against the two reference surfaces is still pending; no exaggeration
   math was changed in this pass.
6. **Fixture-path regression fixed while validating the pass.** The repo's `_REFS` files now
   live under batch subfolders, so tests that still assumed flat `_REFS/<file>` paths were
   failing unrelated to the viewer work. A small `tests/refs.ts` helper now resolves fixtures
   from `_REFS`, `_REFS/BATCH_1`, or `_REFS/BATCH_2` so the suite stays aligned with the current
   reference-file layout.

---

# NOTES — Sprint 6.4 (docs/15: two tool surfaces, one edit model)

Status: implemented. This pass separates "which edit tool the engine should use" from "which UI
surface launched the session," which was the source of the PM's confusion in 6.1-6.3.

1. **`editTool` and toolbar visibility are now separate state.** A new
   `showCanvasToolbar` flag carries the entry-path distinction: the right-panel Edit Mode toggle
   turns it on for the sticky multi-action workflow, while right-panel tool cubes leave it off
   for the single-action workflow. The engine still reads only `editTool`.
2. **Canvas-toolbar sessions stay sticky.** The 6.3 auto-revert after a successful Swap Edge
   was removed. In toolbar mode, Swap Edge now stays selected after success or failure until the
   user explicitly changes tools or exits edit mode.
3. **Right-panel cubes are now momentary triggers.** They no longer show any active/highlighted
   state. Clicking one enters edit mode if needed, keeps canvas edit visuals active, sets the
   shared `editTool`, and intentionally does not show the canvas toolbar.
4. **Single-action sessions reset after one successful commit.** For panel-cube entry, the
   shared edit commit path now returns the session to a neutral state by clearing selection,
   hiding the callout, and restoring the default `editPoint` tool while staying in edit mode so
   history and undo remain available.
5. **Undo is exposed from the Edit History section.** The new right-panel Undo button uses the
   same `undoEdit()` path as the canvas toolbar. In edit mode it remains surface-scoped per 6.3;
   outside edit mode it undoes the most recent session command overall, so the PM can always back
   out the latest edit without re-entering edit mode first.

---

# NOTES — Sprint 6.3 (docs/14: edit-mode polish + undo persistence)

Status: implemented. The Sprint 6.3 pass focused on making the point-edit workflow behave the
way the PM has been describing it in walkthroughs, while closing a few state-management holes
from 6.1 and 6.2.

1. **Swap Edge now enters history correctly.** The bug was exactly what the work order called
   out: `ViewerEngine` executed `swapSelectedEdge()` on click but dropped the returned command.
   Successful swaps now flow through `editCommitCb`, appear in `editUndoStack`, mark the
   surface dirty, and can be undone back to the original two triangles.
2. **One-shot tool convention is live.** A successful Swap Edge automatically returns the UI to
   `Edit Point`; failed swaps leave `Swap Edge` active so the user can retry. This is now the
   pattern to follow for future one-shot edit tools.
3. **Callout drag matches the PM’s mental model.** The header still repositions the card, but
   dragging the callout body now drives the selected vertex through the same live engine edit
   path as canvas dragging. That keeps the triangle-orientation guard, dirty/provenance flags,
   and undo command shape consistent no matter how the point is moved.
4. **The callout is visually anchored.** A live SVG connector now links the card to the vertex
   screen position and updates as either the card or the point moves.
5. **Tool switches clear stale selections.** `setEditTool()` now clears the current point
   selection/callout whenever the tool actually changes, so switching away from point editing
   never leaves an orphaned card on screen and switching back requires a fresh pick.
6. **Undo is now surface-scoped and history survives exit/re-entry.** Entering or leaving edit
   mode no longer wipes `editUndoStack`. Undo pops the newest command for the active edit
   surface only, while the history list can continue to show the full session stack.
7. **Direct drag commit bug fixed as part of the same pass.** Canvas drag commits now record any
   XYZ delta, not just Z-only changes, so flat XY moves also enter undo/history correctly.

---

# NOTES — Sprint 4 (docs/08: DXF draped underlay + breakline fix + derived boundary)

Status: complete. typecheck / lint / 74 tests (incl. the 100 MB perf gate) / build all green.
Phases 0–6 shipped per the work order; Phase 7 checklist below is ready for the PM's browser
walkthrough. Deviations and findings, with reasons:

1. **dxf-parser is used as directed, but extended.** v1.1.2 has no HATCH, ATTRIB or
   MULTILEADER support (it silently drops them), and its LAYER table parser skips linetype
   (code 6) and lineweight (370). Rather than replace it, custom entity handlers are
   registered through its own `registerEntityHandler` API (`src/core/dxf/parse.ts`): a real
   HATCH boundary-path parser (polyline paths + line/arc/ellipse edges; spline edges
   approximate via their control points), and skip+count stubs for ATTRIB/MULTILEADER/MLEADER.
   Layer linetype/lineweight come from a supplemental one-pass scan of the TABLES text.
2. **Layer-list semantics (audit alignment).** The CAD LAYER table holds 41–45 layers in the
   fixtures, but docs/01 counts 4/38/33 — those are layers referenced by top-level model-space
   entities. The dataset's layer list uses exactly that definition, and **exploded block
   content is attributed to its INSERT's layer for display control** (one layer row toggles a
   whole symbol — how surveyors expect symbol blocks to behave), while ByLayer colors still
   resolve through the child entity's own layer. Without this, the original pair would list
   ~35 layers (its block internals span 30+ layers) and the audit numbers would be wrong.
3. **Skip counts are model-space.** The dialog reports per-type skip counts for top-level
   entities (matches the audit: MULTILEADER ×4 etc.); annotation buried inside exploded blocks
   rolls into one `skippedInBlocks` aggregate count. `insertsExploded` counts every nested
   explosion (the "5 INSERT" original explodes 90 nested inserts; `_EXPLODED` 397+).
4. **Unknown entity types cannot be name-counted.** dxf-parser skips entities it has no
   handler for without exposing them, so junk types don't appear in the census (they never
   crash — verified by test). Acceptable per "skip-and-report, never crash"; revisit only if
   the PM needs exact unknown-entity names.
5. **DXF units are assumed drawing units** (`usSurveyFoot` raw-tagged `dxf-unitless`):
   `$INSUNITS` is widely wrong in the wild, and the fixtures carry none worth trusting. The
   DXF adopts the scene's coordinate frame as-is — correct for this project's paired exports.
6. **Drape offset under exaggeration:** the draped linework lives in the same Z-scaled content
   group as the surface, so the +0.05 ft offset scales identically and the lines stay glued at
   any exaggeration ("exaggeration-aware" by construction; no re-drape needed on VE change).
7. **Drape misses with no prior hit** keep their native Z (the order says "last-known Z" —
   before any hit exists there is none; native Z is the honest fallback). Off-surface segments
   = any segment with a missed endpoint; they render dimmed (×0.35 opacity) + dashed.
8. **Derived-boundary hole count is skipped above 500k faces** at import time (`?testmesh`
   loads stay snappy); the boundary overlay itself still builds lazily when first shown.
9. **Phase 0 contract migration:** `'carlson-sourcedata'` removed from `Breakline`, optional
   `SurfaceModel.sourceDataPointLists` added (count + totalPoints only — the lists are never
   stored), tests migrated; the synthetic `spec-breaklines.xml` fixture remains the breakline
   toggle's test case. The B chip and its master gate hide when nothing has breaklines.
10. **Repo hygiene:** `package.json` gains `dxf-parser` — **run `npm install` after pulling.**

DXF fixture oddities found while testing: the original pair's block definitions span 30+
layers and contain nested INSERTs (90 explosions from 5 top-level inserts); `_EXPLODED.dxf`'s
62 HATCHes are all polyline-path boundaries (no edge-list hatches in any fixture — that code
path is schema-derived, junk-guarded); the EXPLODED pair's LAYER tables (45) carry ~7–12
unused layers each.

## Sprint 4 acceptance (Phase 7) — PM browser walkthrough checklist

- [ ] Phase 0/1: sample imports with no breakline spaghetti, honest source-data note
      ("11 source-data point lists (2,782 points)"), derived perimeter renders + toggles (O chip)
- [ ] Original DXF: drapes with layers/colors; Z-choice offered (contours carry Z);
      MULTILEADER ×4 skip reported
- [ ] `_EXPLODED.dxf`: 397 inserts explode; 62 hatch boundaries render; 38 layers listed/controllable
- [ ] `_EXPLODED_ALL.dxf`: parses without freeze; layer batching keeps the scene interactive;
      TEXT ×72 / ATTDEF ×60 skips counted; 5 POINTs stored + reported (not rendered);
      3DFACE Z honored under "keep elevations"
- [ ] Densification: straight segment follows terrain; setting change re-drapes
- [ ] Off-surface linework dimmed/dashed; per-layer miss counts in the import notes
- [ ] DXF with no surface loaded: flat at native Z with the warning
- [ ] Labels: content option (Z / N, E, Z) works; toggle location documented in README
- [ ] All Sprint 2–3 behavior intact (import dialogs, panels, multi-surface, labels, ?testmesh)

Test summary (vitest, 2026-06-12): 74/74 — `tests/dxf.test.ts` (19: census per fixture,
layers 4/38/33, hatch/insert/point handling, junk robustness, tessellation math, worker
plumbing), `tests/derivedBoundary.test.ts` (5: single-tri/shared-edge/grid-with-hole loops,
Carlson perimeter, degenerate inputs), `tests/landxml.test.ts` (20, migrated for rev 1.2),
detect/geometry/synthetic suites, `tests/perf-large.test.ts` (115.6 MB · parse 3.9 s ·
peak ΔRSS within budget).

---

# NOTES — Work Order B (LandXML worker parser)

Status: complete. All §B3 acceptance criteria pass (33/33 tests across the repo, 22 of them
Agent B's incl. the perf gate). Deviations from the work order, with reasons:

1. **`parseLandXML` returns a `Promise`.** The order's sketch shows a sync-looking signature;
   `ReadableStream` input is inherently async, and one signature for both inputs keeps a single
   code path. String input resolves on the microtask queue — no behavioral cost.
2. **`emptyReport()` / `mergeReports()` helpers live in `parse.ts`, not `contract.ts`.** B1 says
   "plus small helpers", but `contract.ts` is also consumed by Agent A, who scaffolded it
   byte-identical to the PM-approved block in docs/05 while this order was being executed. To
   keep the shared file exactly canonical (and avoid cross-agent write collisions mid-sprint),
   the helpers moved next to their only consumer. PM may bless moving them into `contract.ts`
   at convergence.
3. **File-level diagnostics are merged into every surface's report.** `ImportReport` lives on
   `SurfaceModel`, but unknown elements/units fallbacks can occur outside any `<Surface>`. With
   multiple surfaces this duplicates file-level entries per surface — acceptable for the import
   dialog; flagging for the Sprint 2 dialog design.
4. **Boundary `bndType` mapping is schema-derived and lenient:** `outer`→outer,
   `island`/`include`/`inclusion`→inclusion, `void`/`exclude`/`exclusion`→exclusion; unknown
   values warn and default to outer (never throw). No boundary samples exist in `_REFS` to
   verify against.
5. **`<Contours>` are counted (`report.counts.contours` + info), not stored.** docs/04 §2 says
   "store, don't render yet", but the approved contract has no field for them; storing would
   mean changing `contract.ts` (PM sign-off required). Counted for the import dialog; raising
   at convergence.
6. **Generator writes ~116 MB for the "100 MB" gate** (row-granular sizing rounds up). The
   memory budget in the test uses the actual file size. Measured: parse 2.8–3.1 s, peak
   ΔRSS ≈ 122–159 MB ≈ 1.1–1.4× file size (budget 3×), streamed via 1 MB chunks.
7. **Worker E2E (real `postMessage` in a browser) is not unit-tested** — Node has no Web Worker.
   The wrapper is 30 lines; `handleParseRequest` + transferable collection are fully tested in
   Node. Browser wiring is Sprint 2 integration (drop handler → worker → import dialog).
8. **`vitest.config.ts` added** (test include patterns + Node environment). It also picks up
   Agent A's `src/**/*.test.ts` viewer tests — no other build files touched.

## Acceptance test output (vitest, 2026-06-11)

    tests/landxml.test.ts — 21 passed
      CO23012_TOPO.XML: 1 surface "CO23012_NW1_TOPO", usSurveyFoot, producer "Carlson Survey",
        LandXML-1.2 · 2,782 points, first point E 3510094.284 / N 1511101.218 / Z 4185.801,
        ids 1…2782 · 5,020 faces, first face (3,4,2) 0-based, faceVisibility null ·
        11 breaklines all carlson-sourcedata · 0 boundaries · provenance source-explicit ·
        triangulationPreserved true · precisionHint 8 · identical result when byte-streamed
      synthetic fixtures: metric ✓ two-surface(sparse ids) ✓ faceless ✓ spec-breaklines+
        boundaries ✓ junk-unknowns ✓ ns-prefix ✓ · edge cases: no-id <P> ✓ unknown face id ✓
        3-byte chunk splits ✓ no <Units> ✓ garbage input ✓ · worker handler + transferables ✓ ·
        CARLSON-ASSUMPTION grep ✓ (5 occurrences in parse.ts)
    tests/perf-large.test.ts — 1 passed
      [perf] file 115.6 MB · 963,000 pts · 1,922,076 faces · parse 2.8 s ·
      peak ΔRSS 159 MB (budget 347 MB)

Typecheck: `tsc --noEmit` clean for `src/core/contract.ts`, `src/core/landxml/*`,
`src/workers/parse.worker.ts` under the project's strict flags.

---

# NOTES — Sprint 2 (docs/06: convergence, import pipeline, dialog, panels)

Status: complete. 58/58 tests pass (PM-verified 2026-06-11: detect 18 · landxml 28 ·
perf gate w/ progress · viewer 11). Real-file demo verified: `CO23012_TOPO.XML` drops,
parses in the worker, and renders true faces.

## Deviations from the work order, with reasons

1. **`sniffFormat` is sync for `{name, firstBytes}` and async (Promise) for `File`.** The order
   sketches one signature; a browser `File` can only be sliced asynchronously. Overloads keep
   the Node-testable path sync — same precedent as the Sprint 1 `parseLandXML` ruling.
2. **Dialog phase order is identifying → progress → findings.** C2 lists
   "identifying → findings → progress"; findings come FROM the parse, so progress (parse
   streaming) must precede them. Same three phases, one component, chronological order.
3. **Zero-surface LandXML drops file-level diagnostics.** Contract rev 1.1 puts `fileLevel`
   on the first surface's report; with no surfaces there is nowhere to emit it. The dialog
   shows "No surfaces found in this LandXML file." A `fileLevel` slot on the parse result
   itself can be added later if the dialog needs the detail.
4. **Report helpers removed from `contract.ts`** (now pure types) per the Sprint 1 lead ruling;
   they live only in `parse.ts`. `mergeReports` is currently unused (the rev 1.1 fileLevel
   emission replaced the per-surface merge) but kept exported for exporters/rebuild paths.
5. **Breakline z-fighting is solved from both sides:** the surface fill material gets
   `polygonOffset` `+1/+1` (pushed back) and the breakline `LineBasicMaterial` gets `-2/-2`.
   GL polygon offset alone does not affect `GL_LINES` rasterization, so offsetting only the
   lines (as C5 literally reads) would not reliably win.
6. **`resetView()` reframes on every add/remove** (C5 as written). When the LAST dataset is
   removed the SceneOrigin is cleared so the next load re-anchors it (risk R1).
7. **`?testmesh` path now goes through `addSurfaceToScene`** — the same entry/notes/active
   bookkeeping as real imports, so the panels exercise identical code.

## D4 — dependency audit disposition (2026-06-11)

`npm audit`: 5 findings, one dev-toolchain cluster. **Nothing shipped to the browser is
affected** — production deps (react, react-dom, three, three-mesh-bvh, zustand) are clean.

| Package | Severity | Advisory | Shipped? | Disposition |
| --- | --- | --- | --- | --- |
| vitest 2.1.9 | **critical** | GHSA-5xrq-8626-4rwp — arbitrary file read/execute **when the Vitest UI server is listening** | dev-only | Not exploitable here: we never run `vitest --ui` (`npm test` = `vitest run`). Fix is vitest ≥3.2.6 (major). Pinned; documented. |
| esbuild 0.21.5 | moderate | GHSA-67mh-4wv8-2f99 — any website can read dev-server responses | dev-only | Dev server only; don't run `npm run dev` on untrusted networks. Fix requires esbuild ≥0.25 via vite ≥6 (major). |
| vite 5.4.21 | moderate | GHSA-4w7w-66w2-5vf9 — path traversal in optimized-deps `.map` handling | dev-only | Same exposure window as above (dev server). Fixed in vite ≥6.x line. |
| vite-node 2.1.9 | moderate | inherits vulnerable vite | dev-only | Rides the vitest/vite bump. |
| @vitest/mocker 2.1.9 | moderate | inherits vulnerable vite | dev-only | Rides the vitest/vite bump. |

**No patch/minor fixes exist within the current majors.** `npm audit fix --force` would jump
to vite 8 blindly — NOT taken (per the work order). **Recommendation:** schedule a deliberate
`vite 6/7 + vitest 3` major bump as its own chore in a later sprint; until then, mitigation is
operational (no `--ui`, dev server on trusted networks only).

Leftover npm temp dirs (`node_modules/.<pkg>-<hash>` fresh-install artifacts noted by
Agent A) are deleted as part of this chore.

---

# NOTES — Sprint 3 (docs/07: UI restructure + scene controls)

Status: complete. Phases 1–7 implemented in order. Verified green (2026-06-11): typecheck
(`tsc --noEmit`), eslint, 58/58 tests (57 + perf gate skipped via `SKIP_PERF=1`; perf file
unchanged this sprint), production build. **`npm install` required** — Sprint 3 adds one
runtime dependency (`troika-three-text`, labels).

## Hover-lag triage (Phase 2.5 — required findings)

**What caused it.** Three compounding costs in the Sprint 2 input path:

1. **Every `pointermove` requested a full scene re-render.** Under the render-on-demand loop,
   hovering was the most expensive thing you could do: each mouse move re-drew the entire
   multi-million-triangle scene even with a stationary camera.
2. **The hover raycast ran inside the same frames** — one BVH raycast per rendered frame
   while the pointer moved.
3. **While orbiting, both costs stacked** on top of the camera-driven redraws: pointermove
   fires alongside drag, so each orbit frame paid render + raycast + a second
   pointermove-triggered render request.

**What changed** (`ViewerEngine`):

- The pick pass is **decoupled from the render pass**. `pointermove` now schedules a
  raycast-only rAF (cursor readout needs no redraw); it never requests a scene render.
- Raycasts are **throttled to ≤1 per animation frame** (single coalescing flag).
- Picking is **skipped entirely while the camera is moving** (OrbitControls `start`/`end`
  events cover drag, pan, and wheel) and while any button is down; one pick fires when the
  camera settles, so the readout is correct the moment interaction ends.
- BVH `firstHitOnly` fast path retained from Sprint 2.

**Residual at multi-million scale.** The raycast itself is O(log n) and negligible. What
remains is the inherent GPU cost of re-drawing a multi-million-triangle mesh during orbit;
on weak GPUs that can still dip below 60 fps. That is R3 territory — the next lever is the
decimated *preview* LOD (explicitly not this sprint). Hover itself no longer contributes:
with the camera at rest, moving the mouse costs one raycast and zero draws.

## Deviations from the work order, with reasons

1. **Distance-adaptive dolly is OrbitControls `zoomToCursor`, not a custom wheel handler.**
   With `zoomToCursor: true` the dolly step is multiplicative on the camera→cursor-point
   distance — exactly "speed proportional to camera→surface distance" by construction
   (three r166 built-in). Combined with `minDistance: 0.3` and per-frame dynamic near/far
   from scene bounds + camera distance, the repro case (full extents → single triangle →
   back) is covered without forking controls.
2. **Click-N hit test is a projected-marker radius (16 px) inside the gizmo viewport.**
   The gizmo is a separate overlay scene; DOM hit-testing doesn't apply. The N marker's
   position is projected through the gizmo camera per click. Snap goes through the store
   (`setCameraMode('top')`) — the ortho top camera is north-up by construction, so "snap
   to top-view north-up" and the existing top mode are the same state (no second code path).
3. **Labels refresh when the camera comes to rest** (120 ms debounce after controls `end` /
   scene changes), not per frame. Re-syncing ~500 troika Text instances per frame is not
   viable; at-rest refresh matches how elevations are actually read. Billboarding is applied
   at refresh time (labels don't counter-rotate during an orbit drag — accepted for v1).
4. **Label pools live OUTSIDE the exaggeration-scaled content group.** Text under a Z-scale
   matrix would stretch glyphs; instead label *positions* compensate (z × exaggeration) and
   the text strings are TRUE elevations from the Float64 source. Distance-cull radius is
   2.5× the camera→target distance in orbit mode; frustum-only in top mode (the ortho
   frustum already bounds candidates laterally).
5. **Mute applies only when more than one surface is loaded** (`mute: 'auto'`). A single
   loaded surface is always active, so auto-muting it would just dim the product. The
   'always' override still mutes regardless (reference-surface use case).
6. **Master gates are resolved in the UI layer, not the engine.** `importController` ANDs
   gates ∧ per-surface settings ∧ mute into one `ResolvedDisplay` and pushes it; the engine
   stays a dumb applier. Gate toggles never write per-surface state (the 07 ruling's
   non-destructive requirement falls out of the data flow).
7. **`SurfaceEntry` restructured** — Sprint 2's `visible`/`color`/`overlays` fields are
   replaced by one plain-JSON `DisplaySettings` object per surface (07 requirement; the
   future settings-export file format). In-memory only — no localStorage (session-only is
   a product constraint).
8. **`troika-three-text` ships no TypeScript types** (v0.52.4) — a minimal local declaration
   (`src/viewer/troika-three-text.d.ts`) covers the members we use.
9. **Legacy `RenderSurface.setOverlay` retained** alongside `applyDisplay` for the
   faceless-model auto-vertices path in the constructor (runs before any display state
   exists). Harmless duplication; candidate for cleanup when the rebuild path lands.
10. **Vertex display size is in pixels** (`PointsMaterial.size`, `sizeAttenuation: false`),
    range 1–10 px — consistent with the Sprint 2 vertex rendering, and survey users think
    in screen legibility, not world-feet, for point markers.
11. **Row expansion state is component-local**, not in `DisplaySettings` — it's transient
    UI posture, not display configuration, so it stays out of the future export file.
12. **Sun control is two sliders** (altitude in the spec'd "shadow adjustment" role, azimuth
    as the second slider — the drag-ring alternative was offered as either/or). Defaults
    az 315° / alt 45° (classic hillshade NW sun).

## Phase 7 walkthrough — agent-side status

Code-verified and unit-tested: panel math classes, gate AND-ing (non-destructive by
construction), exaggeration readout compensation (z ÷ k before origin re-add), label cap
auto-off path, Sprint 2 parser/detect/fixture suites all green (58/58), production build.
The interactive items (zoom repro feel, hover-on-large-dataset feel, two-surface comparison
demo with the Carlson sample loaded twice, label visuals on `?testmesh`) need the PM's
browser run — this environment has no WebGL. Everything those flows call is exercised by
the compiled, tested paths above.

## Environment note for the PM

The sandbox's mounted view of the repo served stale/truncated file content mid-sprint
(virtiofs cache; new files synced fine, edited files lagged indefinitely). All verification
(tsc/eslint/vitest/build) was run against a byte-accurate mirror assembled from the real
file contents. The repo files themselves are authoritative and complete; if anything looks
odd locally, `npm install && npm test && npm run build` should confirm green.
# NOTES â€” Sprint 6 (docs/09: Editing architecture + move point, Z-first)

Status: implemented. `npm run build`, `npm run lint`, and `npm test` are green (87/87 tests).
Edit mode is now live end-to-end: mode state in the existing Zustand store, active-surface-only
vertex picking, selected-point info card, Z edit by numeric entry or vertical drag, single-step
undo via a stack-shaped command model, dirty indicators, and edit-mode entry/exit prompts.

## Deviations from the work order, with reasons

1. **Edit entry/exit are exposed in two places, not one.** The work order allowed choosing a
   spot in the Display Control Center; the implementation keeps an `Edit surface` button in the
   left top bar and mirrors the controls in the right panel so exit stays visible while the
   selected-point card is open.
2. **Vertex snap uses BVH hit + hidden point-layer refinement.** Pointer picks still start on the
   active surface mesh's BVH raycast as ordered, then candidate vertices are refined through an
   invisible `THREE.Points` pick layer and resolved in screen space. This keeps the snap radius
   honest in pixels without scanning the full vertex set on every move.
3. **Vertical drag uses screen-Y to world-Z mapping.** No drag helper existed in the codebase, so
   the allowed fallback path was used: pixel delta converts to local Z delta from the current
   camera framing, compensating for vertical exaggeration so the source Float64 coordinates stay
   truthful.
4. **Undo stack is multi-entry internally even though the UI only exposes Undo.** The work order
   asked for single-level minimum but requested a stack shape. The store now pushes/pops an array
   of `{ surfaceId, vertexId, oldXYZ, newXYZ }`, so expanding beyond one visible step later is
   straightforward.
5. **XY move stretch goal was intentionally left out.** Z edit, drag, undo, dirty state, and the
   incremental geometry path fit cleanly in the sprint; XY orientation checks were not added so
   the proof-of-concept path stayed low-risk as directed.

## Safe vs destructive convention

- **Safe edit actions** use an outlined terracotta accent and explicit "Safe" copy in the tool
  area. `Move point` is labeled this way in Sprint 6.
- **Destructive edit actions** are reserved for solid warning styling plus direct verb labels
  (`Delete point`, `Remove`, etc.). No new destructive geometry tool ships in this sprint.

## Sprint 6 acceptance checklist

- [ ] Enter edit mode from the left top bar or right panel; canvas border and status badge both
      switch to edit state and stay synced through panel resize/collapse
- [ ] Non-active surfaces stay visible-but-muted while editing one active surface; leaving edit
      mode restores their previous display state
- [ ] Hover near a vertex on the active surface and see the hover marker snap within the pixel
      radius; click to select and populate the right-panel card
- [ ] Confirm the card shows source point id plus N / E / Z at the surface precision hint
- [ ] Change Z by typing a value and committing on blur/Enter; mesh updates immediately
- [ ] Drag the selected vertex vertically in the canvas; release to commit the move
- [ ] Undo returns the vertex to its prior position and leaves the dirty dot/history intact
- [ ] Exit edit mode; if the surface is dirty, the confirmation prompt reports the modified-point count
- [ ] Existing Sprint 2-4 behavior still works: imports, DXF drape, panels, labels, multi-surface, `?testmesh`

---
# NOTES â€” Sprint 6.2 (docs/13: callout redesign + history + swap edge)

Status: implemented. `npm run build`, `npm run lint`, and `npm test` are green (89/89 tests).

1. **The 6.1/6.2 tool set was unified early.** Rather than build one temporary cube set in 6.1
   and then reshuffle it in 6.2, the right-panel tool grid and the canvas toolbar were aligned
   to the 6.2 list immediately: Add Point, Edit Point, Swap Edge, Remove by Fence, Tag
   Breakline, Untag Breakline, plus Undo/Exit in the canvas toolbar. The non-shipping tools are
   visibly disabled/stubbed.
2. **N/E/Z callout step size is `0.01` for precision hints of 2+ decimals, else `0.1`.** That
   keeps the +/- buttons useful on survey data instead of stepping by microscopic values such as
   `1e-8`. Direct numeric entry remains available on all three axes.
3. **Delete in the callout is a confirmed stub, not topology deletion.** The work order asked for
   the control in the card layout, but actual point deletion is topology work that belongs with
   the parked 6.3+ tools. The button confirms, then reports that deletion is parked for Sprint 6.3+.
4. **Move Point uses a combined screen-plane drag.** Horizontal/vertical pointer motion updates
   N/E from camera-aligned planar vectors, while vertical motion also drives Z modestly. This was
   the cleanest "predictable combined approach" that fit the order without adding a separate gizmo.
5. **Orientation guard remains the safe default.** If an XY move would invert an incident
   triangle, that update is blocked and the inline message reports that the point cannot cross the
   triangle boundary there. True retriangulation is still deferred.
6. **Swap Edge is implemented as the first reversible topology edit.** Interior-edge clicks flip
   the shared diagonal of the two incident triangles, boundary edges are rejected, normals update,
   the BVH is rebuilt/refit, and undo works by swapping the opposite diagonal back.

### PM walkthrough checklist

- [ ] Left top bar has no edit button; that slot remains reserved for future hover mode
- [ ] Right panel shows the tool cubes and an Edit Mode toggle; turning Edit Mode on auto-collapses
      panels and turning it off restores the prior panel state
- [ ] In edit mode, the active surface always shows points and edges even if its own toggles were off
- [ ] Canvas toolbar appears in the viewport with tool buttons, Undo, and Exit
- [ ] Selecting a point opens the draggable in-canvas callout; close (X) only dismisses selection
- [ ] N/E/Z rows allow direct typing and +/- nudges
- [ ] Delete prompts and reports that real deletion is parked for Sprint 6.3+
- [ ] Edit Point mode makes active-surface points larger for easier picking
- [ ] Dragging a point updates N/E/Z live; crossing an incident triangle boundary is blocked with a message
- [ ] Swap Edge works on an interior edge and rejects boundary edges
- [ ] Right-panel edit history fills from the undo stack

**Retriangulation explainer for PM:** when a moved vertex crosses outside its incident-triangle
fan, the local triangle neighborhood has to be re-tessellated around the new point position.
That means maintaining explicit local connectivity, replacing multiple faces/edges at once, and
validating the resulting fan against holes/non-manifold cases. That is exactly the half-edge-
adjacent topology work Sprint 6 intentionally deferred, so 6.2 still blocks those crossings.

---

# NOTES â€” Sprint 6.1 (docs/12: edit UX rework)

Status: implemented as part of the 6.2 landing above. The Sprint 6 geometry path was kept and
relocated rather than rebuilt: edit entry moved out of the left panel, the viewport now owns the
toolbar and callout overlays, and edit-mode overlays force points/edges visible non-destructively.

---
# NOTES — Sprint 7 (docs/10: LandXML export loop)

Status: implemented. `tsc --noEmit`, `eslint src`, `vitest run` (95 tests, including the new
round-trip writer coverage and the existing 100 MB perf gate), and `vite build` are green.

1. **LandXML 1.2 export now lives in core.** `src/core/landxml/write.ts` string-builds a
   browser- and Node-safe LandXML 1.2 document from one or more `SurfaceModel`s, preserving the
   source point ids, point order, point precision, face order, face visibility flags, file
   units, spec breaklines, boundaries, and stored contours. Sparse ids round-trip by mapping
   face vertex indices back through `sourcePointIds`, not by assuming `vertexId + 1`.
2. **Export provenance is session-aware but honest about missing history.** The writer accepts a
   per-surface summary from the UI/controller layer. If the undo stack still carries commands for
   that surface, the export comment reports the distinct touched-vertex count; if history is gone
   but the surface is still dirty, the export falls back to a simple "surface modified" note.
   Triangulation is reported as preserved only when `provenance === 'source-explicit'`.
3. **Per-surface export is wired into the left panel.** Each surface row now has an export
   action that opens a findings-style modal before download. The dialog reports preserved vs.
   modified state, triangulation status, and re-emitted breakline/boundary/contour counts, then
   downloads a LandXML file as `<original>_edited.xml`.
4. **Round-trip coverage is automated.** `tests/landxml-write.test.ts` covers:
   untouched Carlson sample round-trip value equality for ids/positions/faces/visibility/units,
   an edited-Z export that re-imports with only the targeted vertex changed and a provenance
   comment containing the modified-point count, and a no-crash pass across the earlier synthetic
   fixtures (sparse ids, faceless, breaklines/boundaries, contours).
5. **Writer deviation log:** `SourceData/DataPoints` is still treated as informational-only on
   export, matching contract rev 1.2 and the Sprint 7 order. Only spec `<Breaklines>` are
   re-emitted as LandXML breaklines. Export comments are added for provenance; byte-for-byte
   identity is not attempted or required.
6. **PM manual verification step remains pending by design.** Automated criteria are complete,
   but the PM still needs to export a surface from the app and open that file in Carlson to
   confirm downstream acceptance as valid LandXML. Do not treat this as an automated blocker.

---
# NOTES — Sprint 7.1 (docs/17: export button placement fix)

Status: implemented. This was a small corrective pass on top of Sprint 7 to put the export
trigger where the PM actually wanted it and remove a copy/paste wiring mistake.

1. **Bogus DXF export buttons removed from the left panel.** `DxfRow` had picked up two
   duplicate `EX` buttons that called `beginSurfaceExport(entry.handle)` on a `DxfEntry`
   handle. Since `beginSurfaceExport()` is surface-only, those buttons could never have worked
   correctly. Both were deleted.
2. **Export now lives in the right panel on the active surface.** The old Sprint 6-era
   `Export - Sprint 7` placeholder in `RightPanel.tsx` was replaced with a real
   `Export to LandXML` button wired to the currently active surface.
3. **No extra edit-mode guard was needed.** `beginSurfaceExport()` and `ExportDialog.tsx`
   only read the current surface entry/model and populate `exportJob`; `confirmSurfaceExport()`
   writes the current model state without assuming edit mode is inactive, so the button can stay
   enabled while editing.
4. **Regression coverage added for the new entry point.** `src/ui/RightPanel.test.ts` verifies
   the export action is disabled when there is no active surface and calls
   `beginSurfaceExport()` with the active surface handle when available.

---
# NOTES - Phase 2 panel/layout restructure (docs/19)

Status: implemented for the current surface + DXF feature set. The new panel structure is in
place and ready for Phase 3 to add GeoTIFF/PDF/point-cloud rows without reworking the shell.

1. **Left panel is now a single grouped dataset view.** The old `SURFACE / DXF / POINT` tabs
   were removed from [src/ui/LeftPanel.tsx](/C:/Users/Owner/Desktop/git/GUNTERS_FIRST/src/ui/LeftPanel.tsx).
   Loaded data now renders in type-grouped sections (`Surfaces`, `DXF Files`) with one
   collapsible row per dataset.
2. **Surface rows keep display-only controls; DXF rows lost drape management.** Surface rows
   still expose the existing per-element color/opacity/mute/label controls when expanded.
   DXF rows now focus on visibility plus per-layer visibility summaries, and the old left-panel
   drape target selector + density control were removed.
3. **Right panel gained a dedicated `Drape` section and absorbed the display controls.**
   [src/ui/RightPanel.tsx](/C:/Users/Owner/Desktop/git/GUNTERS_FIRST/src/ui/RightPanel.tsx)
   now hosts:
   `Add drape layer`, a list of currently draped DXFs, per-drape target reassignment, inline
   density + layer visibility controls, and the old view/reset/exaggeration/sun controls under
   a `Display` section.
4. **Implementation deviation worth keeping visible:** the work order references an existing
   `Display / Edit Tools` selector pill, but this codebase did not actually have that control.
   The active-surface pill was preserved instead, and the new `Drape`, `Display`, and
   `Edit Tools` sections were stacked beneath it.
5. **Phase-3 readiness work was added to the DXF state shape.** Each DXF layer now carries
   parsed `entityCount` and `elevatedCount` metadata so both panels can show lightweight
   read-only layer summaries without reparsing.

Verification: `npm test`, `npm run build`, and `npm run lint` all pass after the restructure.

---
# NOTES - Phase 2 regression fix

Status: implemented. This corrective pass restores the pre-Phase-2 left-panel behavior while
keeping the new grouped dataset layout and the added right-panel Drape section.

1. **Left-panel view/display controls were restored.** `Open...`, `3D / Top / Hover`,
   `Reset view`, `VE`, and `Sun` controls are back at the top of
   [src/ui/LeftPanel.tsx](/C:/Users/Owner/Desktop/git/GUNTERS_FIRST/src/ui/LeftPanel.tsx).
   They were removed by mistake in the first Phase 2 pass and now remain where users already
   expected them.
2. **Surface and DXF rows regained their original controls.** Surface master gates and
   per-surface display controls remain in the left panel. DXF rows again expose the original
   per-layer visibility, color, opacity, and drape-target controls, along with the DXF master
   toggle and densify control above the section.
3. **Right-panel Drape rows were flattened.** The Drape section in
   [src/ui/RightPanel.tsx](/C:/Users/Owner/Desktop/git/GUNTERS_FIRST/src/ui/RightPanel.tsx)
   now only adds `Add drape layer`, a flat per-dataset row, target reassignment, and remove.
   No inline expansion or duplicated DXF layer controls remain there.
4. **The rest of the right panel stayed in place.** Edit tools, edit history, export, active
   surface switching, and panel collapse behavior were not relocated again during the fix.

Verification: `npm test`, `npm run build`, and `npm run lint` all pass after the regression fix.

---
# NOTES - Phase 3 Milestone 1 (GeoTIFF import + coordinate audit)

Status: implemented as a Milestone 1 stopping point. `.tif/.tiff` now enters the import flow,
parses in a Worker via `geotiff`, and lands in the app as a first-class GeoTIFF dataset with
metadata, notes, visibility, opacity, and target-surface state ready for Milestone 2 draping.

1. **GeoTIFF import is now real, not just an accepted extension.** The import pipeline now
   detects TIFF magic / `.tif` / `.tiff`, parses metadata in
   [src/workers/geotiff.worker.ts](/C:/Users/Owner/Desktop/git/GUNTERS_FIRST/src/workers/geotiff.worker.ts),
   and shows a GeoTIFF-specific findings dialog. Embedded GeoTIFF tags are read first; if the
   user selects a matching `.tfw` alongside the image, that companion world file is paired and
   used as a fallback transform.
2. **Phase 2’s dormant GeoTIFF shell is now wired into state/UI.** GeoTIFFs have their own
   normalized metadata contract + store entry, show up in the left panel `GeoTIFFs` section,
   persist import notes, and appear in the right panel `Drape` list with visibility, opacity,
   and target-surface controls. No rendering/draping happens yet in this milestone.
3. **Coordinate investigation finding (logged before placement code): the BATCH 2 orthomosaic
   does not align with `CO23012_TOPO.XML`, but it *does* align with the BATCH 2 LandXMLs on the
   normal Easting/X/Northing/Y axis.** Measured from the reference files:
   `CO23012_TOPO.XML` spans roughly E `3507519.887` to `3510561.922`, N `1510901.407` to
   `1512627.100`, while the GeoTIFF spans X `2894617.897` to `2894959.513`, Y `1659244.214`
   to `1659432.487` from the `.tfw`. Swapping axes does **not** reconcile that gap. By contrast,
   the BATCH 2 surfaces (`CO25013_ABASIN EARLY RISER*.XML`) span E about `2893814` to `2895893`
   and N about `1658191` to `1659566`, which overlaps the GeoTIFF cleanly on the standard
   X=Easting / Y=Northing interpretation. Conclusion: for auto-placement, use the normal
   Easting/Northing mapping; the apparent mismatch in the work order comes from comparing the
   orthomosaic to the older BATCH 1 surface, not from an axis swap.
4. **Build note:** Vite needed `worker.format = 'es'` in `vite.config.ts` once the GeoTIFF
   worker and decoder chunks were added. Without that, the production build failed on worker
   code-splitting.

Verification: `npm test` and `npm run build` both pass after this Milestone 1 pass.

---

# NOTES - Phase 3 Milestone 2 investigation (GeoTIFF drape stall)

Status: investigation only, logged before any Milestone 2 fix work. The prior implementer did
get part of the drape renderer into the codebase, but the "image loads and never appears"
report is real and traceable to a mix of silent overlap gating and unfinished Milestone 2 work.

1. **Milestone 2 render code does exist in source.** The GeoTIFF path no longer stops at
   metadata/decode. `ViewerEngine.addGeotiff()` now creates a `RenderGeotiff`, stores it in the
   scene graph, and adds its group to `contentGroup`. `RenderGeotiff.updateVisible()` frustum-
   checks tile bounds, `decodeTile()` requests raster windows from `geotiff.worker.ts`, and
   `buildTileMesh()` creates a `THREE.Mesh` + `DataTexture` per tile and adds it to the group.
   So the stall is not "nothing was wired" - it is "wired, but gated / incomplete."
2. **Coordinate placement matches the Milestone 1 finding.** The renderer uses the normal
   X=Easting / Y=Northing interpretation from the GeoTIFF transform and rebases by subtracting
   the app `SceneOrigin`. No axis swap is happening in the current code. That is correct for the
   BATCH_2 surfaces and confirms the Milestone 1 investigation result still holds.
3. **The current no-show failure is most likely silent overlap rejection.** `RenderGeotiff`
   computes `overlap` against the selected target surface and hides the whole drape when the
   GeoTIFF bounds do not overlap that surface's XY extents. There is currently no console/UI
   warning when this happens. If the orthomosaic is targeted at `CO23012_TOPO.XML` (BATCH_1) or
   any other non-overlapping surface, the file imports successfully but never appears.
4. **UVs are not explicitly assigned yet.** The current implementation relies on the default
   `PlaneGeometry` UVs and only rewrites vertex Z during draping. That can work for a perfectly
   rectangular, untrimmed tile, but it does not satisfy the Milestone 2 requirement to derive UVs
   from each vertex's world position relative to the GeoTIFF bounds. This needs to be corrected
   before LOD/partial-coverage work.
5. **Current tiling exists, but LOD does not.** The renderer slices the image into 1024 px tile
   windows and loads/unloads those tiles by frustum visibility, but every decode currently comes
   from full-resolution image 0. There is no distance-tier selection, no overview use, and no
   camera-settle-only LOD switching yet.
6. **Reference TIFF structure check:** both BATCH_2 TIFFs are stripped, not tiled, and neither
   contains embedded overviews. `ortho_7_...tif` reports imageCount 1, overviewCount 0,
   16000 x 8818 px, block 16000 x 1. `ortho_12_...tif` also reports imageCount 1,
   overviewCount 0, 16000 x 15999 px, block 16000 x 1. Milestone 2 therefore needs a client-side
   image pyramid rather than relying on TIFF overviews.
7. **The "smaller added TIFF" assumption does not match the repo contents.** The additional file
   in `_REFS/BATCH_2/` is `ortho_12_8e5134b4-4700-44f5-9250-774def31056b.tif`, but it is larger
   than `ortho_7_...tif` (about 1.024 GB vs. about 564 MB). The smaller of the two remains
   `ortho_7_...tif`.
8. **Hidden datasets still influence framing/zoom limits.** `ViewerEngine.contentBounds()`
   currently unions all surface, DXF, and GeoTIFF bounds without checking whether the dataset is
   visible. That confirms the known camera-bounds issue: hidden layers, including DXF geometry at
   zero elevation, still affect reset-view framing and zoom/clipping limits.

---

# NOTES - Phase 3 Milestone 2 implementation follow-up (GeoTIFF drape fixes)

Status: renderer follow-up pass implemented after the investigation above. `npm test`,
`npm run build`, and `npm run lint` are green after this pass.

1. **Silent overlap rejection is now called out explicitly.** The renderer still rejects a
   GeoTIFF when its world bounds do not overlap the selected target surface, but it now logs a
   clear console warning with the dataset name, target surface name, and offending bounds instead
   of failing silently. The import dialog's existing overlap warning remains the current UI note.
2. **Explicit UV assignment is now in the tile build path.** Each draped tile vertex computes UV
   from its world XY relative to the GeoTIFF geotransform rather than relying on `PlaneGeometry`'s
   default UV layout. This makes the texture mapping robust before further LOD / partial-coverage
   work.
3. **Out-of-surface fallback already matched spec and was retained.** The Milestone 2 code path
   was already doing the right thing here: BVH misses flatten tile vertices to the target
   surface's minimum Z, not world Z=0.
4. **Camera/zoom bounds now honor visibility at the dataset level.** `ViewerEngine.contentBounds()`
   only unions visible surfaces, DXFs, and GeoTIFFs now, and scene metrics refresh when those
   visibility states change. Hidden datasets no longer influence reset-view framing or zoom-limit
   calculations.
5. **LOD without TIFF overviews is now a client-side decode pyramid.** Because both reference
   TIFFs are stripped and expose `imageCount = 1`, the worker now decodes three resolution tiers
   from the same raster window (`1x`, `1/2x`, `1/4x`) by requesting resampled `readRasters()`
   output per tile window. Tier choice is based on camera distance to each tile center.
6. **LOD switching is settle-based, not per-frame churn.** While the camera is moving, newly
   visible tiles load at the coarse tier and already-loaded tiles keep their current tier. When the
   camera settles, visible tiles reload to the appropriate tier (`full`, `half`, or `quarter`) for
   their current distance. That keeps orbit/pan responsive while still allowing close inspection to
   sharpen.

---

# NOTES - Phase 3 Milestone 2 overlap check follow-up

Status: investigated after a proposed one-line `computeOverlap()` rebase fix was suggested.
That specific change was **not applied** because it would put the overlap test into mixed
coordinate spaces.

1. **`SurfaceModel.positions` remain in original world coordinates.** The contract still defines
   `positions` as original survey coordinates, and `RenderSurface` only rebases those into local
   render-space inside `positionAttr`. `computeOverlap()` currently compares `dataset.worldBounds`
   (world coordinates) against `target.model.positions` (also world coordinates), which is the
   correct pairing.
2. **The scene-local data lives elsewhere.** The rebased/local values are on `RenderSurface`'s
   `positionAttr`, `localXYZ()`, and derived `bounds`, not on `model.positions`.
3. **Rebasing only the GeoTIFF bounds inside `computeOverlap()` would be incorrect.** That would
   compare local GeoTIFF XY against world-coordinate surface XY and would force false negatives
   for real overlaps instead of fixing them.
4. **No production code change was made in this follow-up pass.** A small regression test was
   added to lock in the coordinate-space assumption so this confusion does not reappear later.

---

# NOTES - Phase 3 Milestone 2 frustum-box follow-up

Status: implemented after a follow-up investigation into why visible-overlap GeoTIFFs could
still fail to load tiles into view.

1. **The overlap check remained unchanged.** The earlier coordinate-space concern was rechecked;
   `computeOverlap()` still correctly compares world-space GeoTIFF bounds against world-space
   `SurfaceModel.positions`.
2. **The frustum test was simplified to stop depending on the parent exaggeration transform.**
   `updateVisible()` used to start from the tile's local XY box, inject unexaggerated surface Z,
   then run that box through `group.matrixWorld`, which inherits the content-group vertical
   exaggeration scale. That was mathematically close to correct, but it made the visibility test
   harder to reason about and easier to misdiagnose.
3. **Tiles now build their frustum test box directly in rendered/world space.** The visibility
   check uses tile local XY as-is and combines it with `surfaceBounds.min.z/max.z * exaggeration`
   directly, rather than applying the group matrix afterward. This keeps the frustum box aligned
   with what the camera actually sees and removes ambiguity around parent transforms.
4. **Regression coverage was added.** A small unit test now locks in the rendered-Z frustum-box
   calculation so future exaggeration changes do not quietly reintroduce transform confusion.

---

# NOTES - Phase 3 Milestone 2 worker open-path follow-up

Status: implemented after confirming the Worker was still forcing `File` payloads through
`arrayBuffer()` before `geotiff.js` ever saw them.

1. **Large GeoTIFFs were paying the full upfront memory cost on open.** `handleOpen()` was
   converting every `Blob`/`File` payload into one giant `ArrayBuffer` before calling
   `fromArrayBuffer()`. That defeats `geotiff.js`'s Blob-backed lazy read path and is exactly the
   wrong behavior for the 564 MB and ~1.0 GB BATCH_2 orthomosaics.
2. **The worker now uses `fromBlob()` for `Blob`/`File` payloads.** `ArrayBuffer` requests still
   use `fromArrayBuffer()`, but normal browser imports now stay Blob-backed so `geotiff.js` can
   read metadata and tile windows lazily from the same handle.
3. **Tile decode path stayed unchanged.** `readRasters({ window, width, height, ... })` continues
   to decode only the requested tile window; the fix was only about the initial file-open path.
4. **No extra debug logging needed removal in this pass.** The only GeoTIFF console output still
   present is the deliberate non-overlap warning added earlier for wrong-target diagnosis.

---
# NOTES - Phase 5 Milestone 1 (LAS import and header parsing)

Status: implemented. `npm test`, `npm run lint`, and `npm run build` are green after this
Milestone 1 pass.

1. **LAS is now a detected import format.** `sniffFormat()` recognizes the `LASF` signature and
   `.las` extension; `.laz` remains out of scope and is not parsed.
2. **Worker-side metadata parsing is in place.** `src/workers/las.worker.ts` reads the LAS
   header plus a bounded initial point sample, then `src/core/las/metadata.ts` emits a
   normalized `PointCloudDataset` with LAS version, point format, point count, point record
   length, scale/offset, bounds, density estimate, and sampled attribute summaries. No external
   dependency was added.
3. **Import dialog findings are wired.** The dialog now shows LAS file size, point count, point
   format, coordinate bounds, density, detected attributes, sampled intensity/RGB ranges, and
   sampled classification counts. Confirming import stores the point cloud metadata and import
   notes without creating render objects.
4. **Left panel has a Point Clouds section.** Loaded LAS files appear as metadata rows with
   visibility and point-size state reserved for Milestone 2. Rendering, octree construction,
   frustum culling, and GPU residency are intentionally not implemented in Milestone 1.

# NOTES - Phase 5 reference LAS inspection (Point Cloud Viewer)

Status: completed before Milestone 1 implementation, per Phase 5 work order. Inspection used
the full LAS header plus a sequential point-record pass over
`_REFS/BATCH_2/CO25013_PNT CLD_250903.las` for classification/attribute distributions.

1. **Header:** LASF, LAS 1.4, point format 7, 36 bytes/point, 381,812,261 points, point data
   starts at byte 4,819 after 2 VLRs. Header scale/offset is X scale
   `0.0000029464794921875`, Y scale `0.0000009359776000976562`, Z scale
   `0.0000005053129272460937`, offsets `2890000 / 1660000 / 10000`.
2. **Bounds:** X `2,893,803.843` to `2,895,892.959`, Y `1,658,128.045` to
   `1,659,595.099`, Z `10,741.812` to `11,010.626`. This matches BATCH_2 Easting/Northing
   orientation with no axis swap.
3. **Attributes present beyond XYZ/RGB:** intensity is populated (`0` to `65,280`,
   381,587,678 nonzero); return number and number-of-returns are present but always `1`;
   classification is populated; classification flags are always `0`; user data is always `0`;
   scan angle is always `0`; point source ID is always `0`; GPS time is always `0`.
4. **Classification distribution:** class `1` (unclassified) = `119,777,558` points
   (`31.37%`); class `2` (ground) = `262,034,703` points (`68.63%`). No other
   classifications were present.
5. **RGB check:** RGB is real photogrammetric color, not a placeholder. Channels span
   `0` to `64,512`, only `332,463` points are pure black, and a downsampled uniqueness check
   hit 10,000 unique RGB triplets quickly. Values are 16-bit LAS color values that appear to be
   8-bit orthomosaic colors scaled by 256.
6. **Point density estimate:** XY footprint is about `3,064,845 sq ft`, so average density is
   about `124.6 points/sq ft`.

---
# NOTES - Phase 5 Milestone 3 closing pass

Status: implementation complete; PM/browser preset benchmark still pending before Phase 5 close.
`npm test`, `npm run lint`, and `npm run build` are green after this pass.

1. **LAS import quality preset is now shown before octree build starts.** After LAS sniffing,
   the import dialog stops at an `Import quality` step with `Fast`, `Balanced`, and `All Detail`.
   `Balanced` is the default. The dialog includes the required note:
   "Higher detail = longer import, more memory. Can re-import to change."
2. **Preset tuning is worker-driven.** `Fast` uses the prior sampling behavior
   (`sampleStride: max(128, 4096>>depth)`, node cap 50k). `Balanced` uses
   `sampleStride: max(16, 512>>depth)`, node cap 50k. `All Detail` uses
   `sampleStride: max(1, 64>>depth)`, node cap 200k. The chosen preset is recorded in import
   notes alongside octree node/sample counts.
3. **Memory estimate in the LAS preset step was recalibrated.** The first rough
   `pointCount x tiny multiplier` estimate understated real risk, so the dialog now estimates
   retained render buffers from current stride behavior at close-detail depth and multiplies
   retained points by 24 bytes (`XYZ float32` + render RGB float32). For the reference
   `381,812,261` point LAS this gives approximately:
   `Fast` stride 128 = `2,982,909` retained points = `0.07 GB`;
   `Balanced` stride 16 = `23,863,267` retained points = `0.53 GB`;
   `All Detail` stride 2 = `190,906,131` retained points = `4.27 GB`.
   The dialog warns when the selected estimate exceeds `1.5 GB`, which flags `All Detail` on
   the reference file.
4. **Runtime Density slider added.** The expanded Point Clouds row now has a `Density` slider
   from 10% to 100%, default 100%. It is render-time only: it multiplies the existing LOD budget
   window in `RenderPointCloud` and does not rebuild or mutate the retained octree.
5. **Existing Milestone 3 point-cloud controls remain wired.** The left panel still exposes
   RGB / intensity / elevation / GeoTIFF display modes, class filters for class 1
   `Unclassified` and class 2 `Ground` when present, and the returns filter stays greyed with
   `Single return only` for the reference file.
6. **Reference-LAS benchmark still needs PM/browser run.** The benchmark target is
   `_REFS/BATCH_2/CO25013_PNT CLD_250903.las` (`13,745,246,215` bytes; 381,812,261 points).
   The requested memory values require Browser Task Manager, and the "All Detail shows overhead
   lines/fine features" result requires visual review at close zoom.

Preset benchmark table to fill during PM run:

| Preset | Approx. build time | Approx. browser memory | Close-zoom fine features |
| --- | --- | --- | --- |
| Fast | pending PM/browser run | pending PM/browser run | pending PM visual review |
| Balanced | pending PM/browser run | pending PM/browser run | pending PM visual review |
| All Detail | pending PM/browser run | pending PM/browser run | pending PM visual review |

---
# NOTES - Phase 4 PDF import/decode gate

Status: gated first slice implemented. PDF is now detected by `%PDF-` magic / `.pdf`
extension, parsed in `src/workers/pdf.worker.ts`, shown in the import dialog, and stored as
per-page PDF sheet state. This stops before PDF Scene, calibration, placement, and 3D drape
rendering per `docs/21_PHASE4_WORK_ORDER.md`'s "report before proceeding past §1" gate.

1. **Reference PDF inspection:** `_REFS/BATCH_2/A-BASIN TOPO-REVISED.pdf` is 1 page,
   1,088,982 bytes, PDF 1.7, title `COVERSHEET 24x36`, creator
   `Carlson Survey 2024 2024 (24.1)`, producer `pdfplot16.hdi 16.01.051.00000`,
   created/modified `D:20251029171714`. Page rotation is 270 degrees; page size is
   2592 x 1728 pt (36 x 24 in). At 150 DPI the raster is 5400 x 3601 px, about 74.2 MiB RGBA.
2. **Second PDF inspection:** `_REFS/BATCH_2/CO25013_ORTHO4.pdf` is the orthomosaic PDF. It is
   1 page, 31,063,891 bytes, PDF 1.7, title `ORTHO`, creator
   `Carlson Survey 2025 2025 (24.1)`, producer `pdfplot16.hdi 16.01.051.00000`,
   created/modified `D:20250904081438`. Page rotation is 270 degrees; page size is also
   2592 x 1728 pt (36 x 24 in). At 150 DPI the raster is 5400 x 3601 px, about 74.2 MiB RGBA.
3. **Tiling decision:** both reference PDFs exceed a typical 4096 px max texture dimension at
   150 DPI (5400 px wide), including the topo sheet. Do not create a single PDF texture for
   these pages. Use tiled decode/render, aligned with the Phase 3 GeoTIFF approach; the first
   worker decode API is tile-oriented (`decodeTile`) and applies white-to-transparent conversion
   per tile.
4. **PDF.js worker setup:** `pdfjs-dist` is installed. Vite production build emits a dedicated
   `pdf.worker-*.js` chunk from `src/workers/pdf.worker.ts`. PDF.js' own
   `WorkerMessageHandler` is imported into that app worker and exposed as `globalThis.pdfjsWorker`,
   so PDF.js uses its in-bundle fake-worker handler instead of spawning/fetching a second worker.
   `GlobalWorkerOptions.workerSrc` is still set to a non-empty value to satisfy PDF.js' guard
   before the fake-worker path is chosen. Direct module probing opened the topo reference PDF
   successfully after this fix. Node does not expose `OffscreenCanvas`, so tile render/decode
   must be confirmed in the PM browser sandbox.
5. **Current implementation boundary:** import creates `PdfSheetEntry` records with default
   `whiteThreshold: 240`, `opacityPct: 100`, independent calibration/orientation/placement/crop
   and markup fields, and optional `PdfGroupEntry` state for multi-page group imports. Left panel
   shows a PDFs section with visibility, notes, remove, and gated action buttons.

Verification: `npm run build`, `npm test` (133/133), and `npm run lint` pass locally. PM browser
sandbox still needs to confirm runtime tile rendering with OffscreenCanvas before proceeding into
PDF Scene / placement / drape implementation.

---
# NOTES - Phase 4 PDF Scene + flat tiled render slice

Status: implemented through orientation, stopping before placement and terrain drape rendering
per PM instruction. `npm run build`, `npm test` (133/133), and `npm run lint` are green.

1. **Flat PDF render without a surface:** PDF sheets now render in the world scene even when no
   TIN/surface exists. The renderer is `src/viewer/RenderPdf.ts`, a sibling to `RenderGeotiff`.
   It opens the PDF in the existing PDF worker, indexes 1024 px tiles, decodes visible tiles,
   creates one `THREE.DataTexture` per tile, and draws a flat sheet near the current scene
   origin at Z=0. This intentionally does not raycast to terrain yet.
2. **Tiling path:** the reference 5400 x 3601 px pages are handled as tiles. The same
   `decodeTile` worker API is used for both the 3D flat sheet and the PDF Scene canvas. Tiles
   are frustum-loaded in the world renderer; PDF Scene decodes the sheet into tile canvases for
   pan/zoom editing. No single 5400 px GPU texture is created.
3. **Scene switching:** app state now has generic `sceneMode` (`world3d` / `pdf2d`) plus an
   active scene-object handle. Opening a PDF row enters PDF Scene while the Three.js world scene
   stays mounted underneath, so returning to 3D preserves camera/view state. The right panel
   switches to a PDF Scene summary/return control while in PDF Scene.
4. **PDF Scene:** `src/ui/PdfScene.tsx` provides a 2D canvas view of the selected sheet with
   wheel zoom and drag pan. The left-panel `Open in PDF Scene`, `Calibrate`, and `Orient`
   buttons activate it. The right panel reports calibration/orientation state while active.
5. **Calibration:** all three required methods are wired. Direct scale accepts values such as
   `1:500`, `1 inch = 50 feet`, or a raw pixels-per-foot number. Scale-bar and known-distance
   modes accept two canvas picks plus a real distance in feet. Each method stores a
   `PdfCalibration` on the sheet and updates the flat world renderer scale without resetting
   orientation or placement.
6. **Orientation:** north-arrow mode accepts two picks: tip, then tail. It computes degrees from
   sheet north using the picked vector and stores `orientation` on the sheet. The flat world
   renderer rotates the sheet group live. Orientation is independent and re-runnable.
7. **Deferred:** placement, 2/3 point world matching, terrain drape, crop masks, block-outs, and
   markup baking remain for later Phase 4 slices after PM reviews this calibration/orientation
   UX in the browser sandbox.

---
# NOTES - Phase 4 PDF left-panel/grouping fixes

Status: implemented. `npm run build`, `npm test` (133/133), and `npm run lint` are green.

1. **Group default layout:** PDF sheets now carry a render-only `flatOffsetPx`. Same-source
   groups, such as multi-page plansets loaded as a group, stack pages edge-to-edge vertically:
   page 1 bottom to page 2 top, continuing down the set. Cross-file groups keep every sheet at
   the same origin by default so topo + ortho overlays start overlapped for manual alignment.
2. **Cross-file grouping path:** the PDFs section now shows a `Group` action when at least two
   ungrouped sheets are available. The modal creates a PDF group from selected sheets and applies
   the same-source vs. cross-file default layout rule immediately.
3. **Open Scene placement:** grouped PDFs open PDF Scene from the group row. Group member sheet
   rows no longer show PDF Scene / Calibrate / Orient buttons in the left panel. Ungrouped sheets
   still open PDF Scene from their own row.
4. **Collapsed row controls:** collapsed PDF group and ungrouped-sheet rows now keep the visible
   controls to `PDF` visibility and `Open`. Import notes and remove actions live in the expanded
   row for ungrouped sheets so the collapsed-row layout does not shift.
5. **PDF Scene group workspace:** opening a group enters PDF Scene as a group workspace with a
   sheet selector. Calibration and orientation remain per-sheet inside that scene, matching the
   current Phase 4 boundary.

---
# NOTES - Phase 4 PDF Scene bug-fix and scope clarification

Status: bug-fix pass implemented. `npm run build`, `npm test` (133/133), and `npm run lint`
are green.

1. **Blank PDF Scene fix:** the worker no longer tries to render each tile by applying a
   translated PDF viewport render. That path was fragile with rotated pages and could produce
   blank white tile canvases. The worker now renders the selected PDF page once to a cached
   full-page `OffscreenCanvas` at 150 DPI, then crops requested tiles from that canvas and
   applies white-to-transparent conversion to each tile copy.
2. **Visible per-sheet tools:** PDF Scene now exposes explicit `Pan`, `Calibrate Scale Bar`,
   `Calibrate Distance`, and `Orient` buttons. The toolbar wraps so controls do not disappear
   when a group sheet selector is present. Selecting a sheet in a group remains stable while
   calibration/orientation updates sheet state.
3. **Import Notes removal:** the PDF row `Import notes` button came from the generic earlier
   import-notes affordance being copied into the new PDF rows. It has been removed from PDF rows;
   it was not part of AL's requested PDF workflow.
4. **Scope clarification for next slice:** group PDF Scene needs a clear split between
   **Group view** and **Per-sheet view**. Group view should show all pages/sheets together with
   controls for crop, move, rotate, and relative placement between sheets, so the group can be
   arranged as a whole. Per-sheet view should handle calibration and orientation for one selected
   sheet. This bug-fix pass keeps the current per-sheet canvas with group sheet selector; the
   all-sheets group view and move/rotate/crop controls are the follow-on Phase 4 slice.

---
# NOTES - Phase 4 white-page bug fix

Status: implemented. Build 133/133, lint, tests green. PM visual confirm: PDF content now visible in PDF Scene. Resolver log fired: "worker ready; requesting 24 tile windows."

Root cause: `PdfScene.tsx` open resolver called `pending.delete(id)` on the first message, which was a `progress` message — consuming the handler before the final `opened` response arrived. Fix: guard added at line 141 to ignore `progress` messages before deleting. Matches `RenderPdf.ts` pattern. Readiness log added at line 166 prints tile window count on open.

PM visual notes (to fix next):
- PDF Scene overflows the viewport — overlaps both panels and the header. Must be confined to the viewport area between the panels.
- When side panels are collapsed in PDF Scene, the expand buttons are not showing. Panel collapse/expand behavior is broken in PDF Scene.
- No pan in PDF Scene. AL wants right-click or shift+left-click pan, matching the 3D viewport convention.

---

# NOTES - Phase 4 PDF Scene layout and pan fixes

Status: implemented and PM visual confirmed. Build/lint/tests green (133/133).

1. `.viewport` now has `overflow: hidden` (App.module.css line 234) — PDF Scene no longer bleeds over panels or header.
2. `.collapseTab` raised to `z-index: 30` (App.module.css line 205) — panel reopen tabs now visible over PDF Scene.
3. Group PDF Scene: right-click and shift+left-click pan the background canvas (PdfScene.tsx line 302). Context menu suppressed (line 338).
4. Single-sheet PDF Scene: right-click and shift+left-click pan regardless of active tool mode (PdfScene.tsx line 524). Context menu suppressed (line 543).

---

# NOTES - Phase 4 PDF Scene tiling / viewport-gated load

Status: implemented. Build/lint/tests green (133/133). Awaiting PM visual review.

1. `pdf.worker.ts` — added `renderingPages: Map<number, Promise<OffscreenCanvas>>` to `openState`. Concurrent `decodeTile` requests for the same page now await a single in-flight render instead of spawning duplicates.
2. `PdfScene.tsx` `usePdfTileCache` — removed bulk-on-open tile request. Added `inFlightCountRef`, `MAX_CONCURRENT = 4`, `requestVisibleTiles()` that evicts out-of-view tiles and dispatches only up to the concurrency cap.
3. `SingleSheetScene` — RAF loop computes visible tile windows each frame from current pan/zoom/canvas size and calls `requestVisibleTiles`. Matches `RenderPdf.ts` frustum-gated pattern.
4. `GroupPdfScene` — `PdfSheetCanvas` converted to `forwardRef` exposing `requestVisibleTiles` via `useImperativeHandle`. Group RAF loop drives per-sheet visible window computation and dispatch.

---

# NOTES - Phase 4 PDF worker OffscreenCanvas fix

Status: implemented. Build/lint/tests green (133/133). PDF rendering operational — tile decode succeeds, no runtime errors.

Root cause: `pdfjs-dist/legacy` build uses `DOMCanvasFactory` internally, which calls `document.createElement` inside the Worker where `document` is undefined. The crash appeared as "Cannot read properties of undefined (reading 'createElement')" in tile decode — not in our code but inside pdfjs internals.

Fix:
1. Switched import from `pdfjs-dist/legacy/build/pdf.mjs` to `pdfjs-dist/build/pdf.mjs` (standard build has OffscreenCanvas support).
2. Added `OffscreenCanvasFactory` class (lines 17–36 of pdf.worker.ts) and passed it to `pdfjs.getDocument()` as `CanvasFactory` option. This routes all internal pdfjs canvas allocations through OffscreenCanvas, eliminating the DOM dependency entirely.
3. Worker import for standard build required `@ts-ignore` — no adjacent .d.ts; types come from package `types` field.

Process note (add to all future handoffs that write/rewrite source files):
When writing or rewriting source files, use Python (`open(..., 'w').write(...)`) rather than shell heredocs. Shell heredocs truncate silently on files longer than ~8KB or containing special characters. Targeted Edit tool (old_string/new_string) calls are unaffected and remain preferred for partial changes.

---

# NOTES - Phase 4 PDF loading overlay (PDF Scene)

Status: implemented. tsc/lint/tests green (133/133). PM visual confirmed in PDF Scene.

Ghost outline + animated indeterminate loading bar drawn in PDF Scene canvas while tiles load. `loadingState` transitions: opening → rendering → ready. Bar slides left-to-right using performance.now() % 1400ms. Drawn in sheet-pixel space in both SingleSheetScene and GroupPdfScene.

Remaining work: loading bar too small — needs to be larger and more obvious. 3D scene needs equivalent placeholder (dashed outline + loading bar in world space via Three.js).

---

# NOTES - Phase 4 overlay depth fix + view reset guard (PHASE4-ITEM11)

Status: implemented. tsc/lint/tests green (133/133). Awaiting PM visual confirm.

Overlay depth fix (RenderPdf.ts):
- `depthTest: false` added to north arrow `lineMat` (was missing, defaulting true — caused floating appearance)
- `renderOrder = 100` removed from overlay Groups, now set explicitly on each child mesh/line (Three.js does not propagate renderOrder from Group to children)
- `depthTest: false` added explicitly to tile material — all materials now uniform
- Result: draw order driven entirely by renderOrder (tiles=30, overlays=100, labels=101)

View reset guard (ViewerEngine.ts):
- `pdfFootprints: Map<string, string>` added — stores JSON fingerprint of the six footprint fields (calibration, orientation, flatOffsetPx, widthPx150, heightPx150, borderCrop) per sheet handle
- `addPdf` seeds fingerprint on first load
- `removePdf` cleans up fingerprint entry
- `updatePdfSheet` compares fingerprint before/after — `resetView()` only fires when footprint changed. Visibility toggles, threshold, opacity, and overlay changes skip resetView entirely.

---

# NOTES - Phase 4 calibration and orientation (PHASE4-ITEM10)

Status: implemented. Build clean. PM session ended before visual confirm — pick up next session.

Completed:
- `PdfNorthArrow`, `PdfScaleBar`, `PdfKnownDistance` interfaces added to `contract.ts`
- All three fields added to `PdfSheetEntry` (store) and `PdfRenderableSheet` (RenderPdf), initialized null in `confirmPdfImport`
- `setNorthArrow`, `setScaleBar`, `setKnownDistance` exported from `importController.ts`
- Orient mode: draggable N-circle markup (150px = 1"), drag center to move / drag tip to rotate, live `setPdfOrientation`, Set North button, angle display
- Calibrate mode: scale bar (150px draggable line, ft input + Set), known distance (click begin/end, measured inches display, ft input + Set), imperial dropdown (1in=10ft through 1in=100ft), method switching clears other markup
- Group PDF Scene: draws north arrow, scale bar, known distance markup in RAF loop
- `LeftPanel.tsx`: visibility toggle + controls for all three markup types
- Page-switch blank canvas bug fixed (worker keyed to [file, pageIndex])
- Loading bar stuck bug fixed (clears on frustum-visible tiles loaded, not all tiles)

Open issues — carry into next session:
1. PDF tiles rendering on top of markup overlays in 3D view. Root cause: tile meshes and overlay meshes coplanar at Z=0. Multiple approaches tried (renderOrder, depthTest: false, Z offset to 0.5ft, opaque queue) — none definitive. Recommended fix: parent overlay groups to scene content group root rather than `this.group`, add at higher world Z. This sidesteps coplanar sorting entirely.
2. North arrow "floating above page" at oblique camera angles — side effect of Z offset change (0.02 → 0.5ft). Resolves when calibration is applied (ppf changes, overlay rebuilds). Tied to issue 1 — fix overlay parenting, then tune Z offset.

Next session starting point: implement the overlay parenting fix for issue 1, then PM visual review of calibration and orientation UX with the reference topo PDF.

---

# NOTES - Phase 4 3D scene loading overlay (RenderPdf.ts)

Status: implemented. tsc/lint/tests green (133/133). PM visual confirmed.

Dashed outline (`THREE.LineLoop` + `LineDashedMaterial`, color `#2a2f35`) and animated loading bar (`PlaneGeometry` + 256x16 `DataTexture` at z=0.02) added to `this.group` at construction. Bar sweeps indeterminate left-to-right at 1400ms period matching PDF Scene. Both removed and disposed once `tiles.every(t => t.loaded)`. Also disposed in `dispose()` if sheet removed before load completes. Three.js r166 fix: `computeLineDistances()` called on `LineLoop` instance not `BufferGeometry`.

---

# NOTES - Phase 4 tile eviction fix + base canvas cache restore

Status: implemented. tsc/lint/tests green (133/133). PM visual confirmed — behavior restored to pre-IMPLM-1 state.

Reverted per-tile independent render (IMPLM-1 was a regression — slower, tiles disappeared on pan). Restored shared base canvas cache and removed tile eviction from both RenderPdf.ts and PdfScene.tsx. Loaded tiles now persist across pan/zoom like GeoTIFF tiles.

---

# NOTES - Phase 4 per-tile independent PDF render

Status: implemented. tsc/lint/tests green (133/133). Awaiting PM visual review.

Removed shared base canvas cache entirely. `baseCanvases`, `renderBasePage`, and `renderingPages` are all gone. Each `decodeTile` request now independently allocates a full-page OffscreenCanvas, renders at 150 DPI, blits the tile window, and discards the canvas. Progressive tile loading is the expected result — tiles appear one at a time as each render completes, serialized through the worker's single JS thread.

Memory: ~33.6 MiB peak during 4-concurrent burst vs. ~74 MiB persistent under the old cache model.

`progress: 'rendering PDF...'` now fires per tile render, not once at open.

Sandbox build note: `npm run build` fails in the implementer sandbox with EPERM on read-only `dist/` folder. This is a sandbox artifact — tsc and tests confirm code validity. Use `npx tsc --noEmit` instead of `npm run build` in implementer handoffs for this project.

---

# NOTES - Phase 4 two-pass PDF render (lo-res placeholder + hi-res upgrade)

Status: implemented. Awaiting PM visual review.

Lo-res flow: first `decodeTile` for a page renders at 48 DPI into `baseCanvases`, posts `progress: 'rendering PDF...'` during render, returns tile immediately (upscaled to 150 DPI tile dimensions). Hi-res render starts in background simultaneously.

Hi-res upgrade flow: `renderBasePage(pageIndex, true)` renders at 150 DPI into `baseCanvasesHiRes`, broadcasts `{ id: 0, type: 'pageReady', pageIndex }`. Both `RenderPdf.ts` and `PdfScene.tsx` intercept `pageReady`, evict lo-res tiles for that page, and re-request at hi-res.

Known limitation: `PdfScene.tsx` `pageReady` handler calls `tilesRef.current.clear()` which evicts all pages not just the affected page. Acceptable for current single-page reference PDFs. Flag for fix when multi-page workflows are tested.

Process note reinforced: use Python `open(..., 'w').write(...)` for ALL writes to modified files — no Edit tool calls on files already partially modified in a session. Truncation risk is real.

---

# NOTES - Phase 4 PDF Scene corrected split

Status: implemented. Build/test/lint pending in this work pass.

1. **Group PDF Scene:** group-row `Open` now launches an all-sheets workspace with no dropdown.
   It renders every sheet in the group simultaneously at each sheet's `flatOffsetPx` and
   `orientation`, so same-source groups appear edge-to-edge and cross-file groups overlap by
   default. Dragging a sheet updates `flatOffsetPx` and pushes the change to the Three.js PDF
   renderer immediately.
2. **Group controls:** the group workspace is for arrangement only. It supports selecting a
   visible sheet by clicking it, moving by drag, rotate +/- controls, and border crop controls.
   Crop updates the sheet's `borderCrop` and the 3D tiled PDF renderer now uses that crop when
   building its tile index.
3. **Per-sheet tools:** Calibrate and Orient are separate single-sheet scenes launched from the
   sheet row buttons in the left panel. The group PDF Scene no longer contains Calibrate/Orient
   toolbar buttons and no longer contains a sheet selector dropdown.
4. **Left panel row contract:** group rows expose `PDF` visibility + `Open`; grouped sheet rows
   expose `PDF` visibility + `Calibrate` + `Orient`; ungrouped sheets expose `PDF` visibility +
   `Open` + `Calibrate` + `Orient`.
