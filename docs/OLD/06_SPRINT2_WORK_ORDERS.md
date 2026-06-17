# Sprint 2 Work Orders — Convergence: LandXML import → true surface render

**Sprint goal (`02` S2):** drop `_REFS/CO23012_TOPO.XML` on the app, get an honest import dialog, see the true 5,020-face surface with working toggles.

## Sprint 1 closeout (resolved / decided)

- **`three-mesh-bvh.d.ts` NUL-byte corruption — fixed by lead** (trailing NUL line stripped); `npx tsc --noEmit` is clean repo-wide. No agent action.
- **PM action (still open):** run `/?testmesh=1000000`, confirm A5 gates: smooth orbit, edges overlay acceptable, **zero jitter zoomed to a ~10 ft window**. This is the R1 sign-off.
- **PM action:** `npm audit` triage is Work Order D chore D4 — do not run `npm audit fix --force` (it takes breaking majors blindly).
- **Lead rulings on Agent B's NOTES.md deviations** (all accepted): async `parseLandXML` ✓ · helpers stay in `parse.ts`, `contract.ts` remains pure types ✓ · boundary-kind lenient mapping ✓ · ~116 MB perf fixture ✓ · worker E2E deferred to this sprint's integration ✓. Two need action this sprint: **contours** get a contract field (D1), **file-level diagnostics duplication** gets a dialog design rule (C3).

## Contract revision 1.1 (D1 — first PR of the sprint, blocks nothing else)

Owned by Agent B, PM sign-off required, then frozen again:

```ts
// SurfaceModel additions:
contours?: Polyline3D[];                 // from <Contours> source data — stored, not rendered yet
export interface Polyline3D { pts: Float64Array }
// ImportReport addition:
fileLevel?: { warnings: string[]; infos: string[]; unknownElements: Record<string, number> };
// file-scope diagnostics live here ONCE; per-surface reports no longer duplicate them
```

---

## Work Order C — Import pipeline UI + dialog + scene panels (Agent A)

**Touches:** `src/ui/`, `src/viewer/`, `src/state/`. Consumes `core` only through its public functions.

### C1. Drop/pick → parse pipeline
Wire the existing window drop target + a File menu "Open…" picker into: `sniffFormat()` (D2) → route:

- `landxml` → spawn parse worker, stream progress into status bar + dialog
- `dxf` → dialog: "DXF support arrives in a later sprint" (friendly, no error styling)
- `carlson-dtm` → "Carlson-tested DTM path arrives in a later sprint — export LandXML meanwhile" *(language rule: never "tin support")*
- `dwg` → "DWG can't be read in the browser — export DXF from your CAD software"
- `unknown` → "Unrecognized file" + what we looked for

Multiple files dropped at once: queue, one dialog per file, sequential.

### C2. Import dialog
Modal, three phases in one component: **identifying → findings → progress**.

- Header: file name, detected format chip, producer + version, units (from `SourceMeta`).
- Findings list from `ImportReport`, severity-iconed: ✓ infos ("5,020 faces — original triangulation preserved"), ⚠ warnings ("No faces found — triangulation rebuild required; rebuild is not yet supported, surface will load as points only"), ℹ notices (skipped/unknown elements with counts).
- **File-level section rendered once** (from `report.fileLevel`), above per-surface sections. (C3 design rule resolving NOTES.md #3.)
- Multi-surface files: one row per surface (name, point/face count, checkbox, default all-checked).
- Confirm → `addSurface` per checked surface → dialog closes → left panel opens (first load auto-open already built).
- Cancel discards parsed buffers.
- Findings persist: store each dataset's `ImportReport`; left-panel item gets an "Import notes" affordance reopening a read-only findings view.

### C3. Left panel — dataset list v1
Per surface: name, point/face counts, visibility eye, **active** state (exactly one active; bold/accent; click to activate), import-notes icon, remove (with confirm). Active surface drives the right panel and the cursor readout target.

### C4. Right panel — display controls v1
For the active surface: toggles **faces / edges / vertices / breaklines** (wired to `ViewerEngine.setOverlay` — extend the overlay enum with `'breaklines'`), surface color swatch (single material color), labels section stubbed ("Labels — Sprint 3") . Sections render only when relevant (no breakline toggle if surface has none).

### C5. Viewer additions
- Breakline rendering: `LineSegments` from `SurfaceModel.breaklines`, distinct default color, `polygonOffset` to win z-fighting, per-surface toggle.
- `resetView()` reframes on add/remove; first surface load triggers it.
- Empty-state hint hides when scene has content; returns when last dataset removed.

### C6. Acceptance
- [ ] Drop `CO23012_TOPO.XML`: dialog reports 2,782 points / 5,020 faces / 11 breaklines / triangulation preserved; confirm renders the surface; all four toggles work; breaklines visibly follow terrain features
- [ ] Drop the faceless fixture: ⚠ rebuild path message; loads as points-only without error
- [ ] Drop the two-surface fixture: per-surface rows; unchecking one loads only the other
- [ ] Drop a `.dwg`/`.dxf`/`.tin`: correct friendly routing messages (exact copy above)
- [ ] Import notes reopenable after load; file-level diagnostics appear once
- [ ] Parse of the ~116 MB fixture in-browser: UI stays interactive, progress visible (this is the real Worker E2E that closes NOTES.md #7)
- [ ] Cursor N/E/Z reads correctly on the real surface (spot-check a known point: id 1 → E 3510094.284 / N 1511101.218 / Z 4185.801)

---

## Work Order D — Core support + repo chores (Agent B)

**Touches:** `src/core/`, `src/workers/`, root configs. No UI.

### D1. Contract rev 1.1
As specified above. Separate PR, first. Migrate parser: store contours (counted today → stored as `Polyline3D[]`), move file-level diagnostics out of per-surface duplication into `report.fileLevel` (emit on the first surface; document). Update tests.

### D2. `sniffFormat(file: File | {name, firstBytes}): DetectedFormat`
In `core/detect.ts`, Node-testable. Rules: content-first, extension as fallback — `<LandXML` within first 4 KB → `landxml` (regardless of extension; Carlson exports `.XML`); magic `#Carlson DTM` → `carlson-dtm`; DXF sentinel (`0\nSECTION` / `AutoCAD` headers in first 4 KB) → `dxf`; `AC10xx` binary magic → `dwg`; else `unknown`. Tests against all five `_REFS` files + junk fixtures.

### D3. Worker progress events
Wrapper posts `{type:'progress', phase:'reading'|'parsing'|'building', bytesProcessed, bytesTotal}` at ≥4 Hz granularity during streaming. Keep logic Node-testable (progress callback in `parseLandXML`, wrapper relays).

### D4. Dependency triage (chore)
`npm audit` — for each finding: dev-only or shipped? Patch/minor bumps applied; majors documented in NOTES with recommendation, not auto-taken. The 1 critical must be identified by name and dispositioned (typical case: dev-chain only → low real risk, note and pin). Also delete the leftover npm temp dirs noted by Agent A (fresh-install artifact).

### D5. Acceptance
- [ ] Contract 1.1 merged first; all existing tests green after migration; contours from a synthetic `<Contours>` fixture round into `SurfaceModel.contours`
- [ ] `sniffFormat` correct on all five `_REFS` files (incl. `.XML`-extension LandXML) + fixtures; 100% branch coverage on detect.ts
- [ ] Progress events observable in tests (callback granularity proven on the 116 MB fixture)
- [ ] Audit disposition table in NOTES.md; no `--force`; lockfile updated; typecheck/lint/tests green

---

## Sequencing & convergence

```
D1 (contract 1.1) ──► D2/D3 in parallel ──► C1 consumes detect+progress
A starts C2–C5 immediately against current contract; rebases on D1 (additive, low risk)
```

Convergence review = Sprint 2 exit criteria (`02` S2): real file loads and renders true faces; import feedback honest; ~116 MB parse never freezes UI. Demo script for PM: drop sample → read dialog → confirm → toggle overlays → hover for coords → reopen import notes → drop `.dwg` and read the guidance message.

## Definition of done (both)
Same as Sprint 1: PR, green checks, README updates, NOTES.md for deviations. PM merges; lead reviews dialog copy before merge (import-confidence language is a product surface, not chrome).
