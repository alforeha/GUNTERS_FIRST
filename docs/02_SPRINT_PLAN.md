# Sprint Plan

Changes vs PM draft: S4/S5 swapped (DXF before .tin); .tin reduced from sprint to spike; densification pulled into the DXF sprint; first edit action chosen (move point, Z-first).

---

## Sprint 0 — Audit + architecture ✅ DONE

Delivered: file audit (`01_FILE_AUDIT.md`), stack recommendation (`00` §3), data model + parser contracts (`04`), risk register (`03`), this plan.

Exit criteria met: LandXML structures to support are known; .tin go/no-go decided (Carlson-only spike, post-DXF); stack recommended; SurfaceModel + scene state defined.

---

## Sprint 1 — App shell + viewer foundation

**Goal:** usable shell from empty folder; rendering architecture proven at target scale *before* any parser exists.
**Why now:** everything else hangs off the layout and the render path; origin-rebasing and 1M-vertex performance are cheap to build now, brutal to retrofit.
**Depends on:** nothing.

Scope: Vite+React+TS scaffold · header / collapsible left+right panels / status bar / canvas layout · empty-state dropzone hint · `ViewerEngine` (Three.js, imperative) with orbit/pan/zoom, ortho top-view toggle, reset view · **local-origin rebasing path** · Zustand store skeleton (scene, view settings, mode) · display-settings scaffolding (toggles wired to nothing yet) · **synthetic 1M-vertex terrain generator behind a dev flag** for perf proof.

Exit criteria:
- App runs; layout matches `00` §4; panels collapse/expand; dropzone hint shows.
- Synthetic 1M-vertex mesh orbits at 60 fps desktop, with edges overlay ≥30 fps.
- Coordinates at survey magnitudes (1.5M, 3.5M) render with zero jitter.

Risks: none structural; keep React out of the render loop from day one.

---

## Sprint 2 — LandXML import + true surface rendering

**Goal:** the core product moment — drop a real LandXML, see the true surface.
**Depends on:** S1 shell (parser work can start in parallel — no UI dependency).

Scope: drag/drop + file picker · format detection · **Web Worker LandXML parser → SurfaceModel** (contract: `04` §2; handles both `<Breaklines>` and Carlson `SourceData/DataPoints`, invisible-face flags, multi-surface files, metric/imperial, points-without-faces) · import dialog with findings list (✓/⚠/ℹ severity, triangulation-preserved statement, rebuild warning path) · persistent "import notes" per dataset · shaded render with flat-shaded true triangles · display toggles: faces, edges, vertices, breaklines · labels scaffold · left-panel dataset list v1 · right-panel display controls v1 · status-bar cursor N/E/Z readout.

Exit criteria:
- `CO23012_TOPO.XML` loads, renders 5,020 true faces; toggles work; breaklines visible.
- Import dialog correctly reports points/faces/breaklines found; a faceless file routes to the rebuild-warning path (Delaunay rebuild itself may stub to "not yet supported" message).
- Parse of a ~100 MB synthetic LandXML never freezes the UI.

Risks: LandXML variability (R2) — mitigated by schema-complete contract + new vendor samples from PM.

---

## Sprint 3 — Multi-surface + scene controls

**Goal:** practically useful for review.
**Depends on:** S2.

Scope: multiple surfaces in scene · **active surface** concept (one always active; bold in list) · per-surface visibility / color / transparency · mute/reference state with default-mute for non-active · vertical exaggeration (shared scene setting) · labels v1 (vertex elevations, troika + distance/frustum culling, auto-off above density threshold with status note) · improved panel interactions · per-surface "export original" pass-through.

Exit criteria:
- Two+ surfaces coexist; switching active surface updates emphasis instantly.
- Visual-overlap comparison workable (color + transparency per surface).
- Labels usable on the sample; gracefully auto-disabled on the 1M synthetic.

---

## Sprint 4 — DXF draped underlay *(was Sprint 5 — swapped: it's the #2 product value)*

**Goal:** drop a DXF, see it draped on the active surface, trust what happened.
**Depends on:** S2 (surface + BVH); S3 helpful but not required.

Scope: dxf-parser + normalization layer (`04` §4) · import dialog DXF mode: entity census, skipped-entity report (MULTILEADER etc.), block handling (explode INSERTs by default), **Z-handling choice when entities carry elevations** ("use entity Z" vs "drape to surface" — sample contours have Z) · layer list with visibility/color (ByLayer resolution) · **drape engine:** three-mesh-bvh vertical raycast per vertex, **long-segment densification included** (subdivide chords > max-edge-length so linework follows the surface — correctness, not polish) · arc/bulge tessellation · off-surface segments: render at last-known Z, flagged in import notes.

Exit criteria:
- Both sample DXFs load; contours drape (or use native Z per user choice); layers toggle; SPT symbols render via explosion.
- A 200-ft straight test segment follows the terrain, not a chord.
- Messy-DXF behavior: unknown entities skipped + counted in the report, never a crash.

---

## Sprint 5 — Carlson .tin spike — **SKIPPED (PM decision, post-Sprint-3)**

Product is **LandXML-only** until other file types are reconsidered. `.tin` drops keep the friendly routing message. Spec below retained for the record only.

## ~~Sprint 5 — Carlson .tin spike~~ *(was Sprint 4 — descoped from sprint to 2–3 day spike)*

**Goal:** ship the cheap win the audit uncovered; route everything else cleanly.
**Why descoped:** audit fully decoded Carlson rev 24603 (points/edges/triangles verified identical to the XML). That's a reader, not a research project. Mixed-vendor .tin in general remains a tarpit — don't enter it.
**Depends on:** S2 (SurfaceModel).

Scope: magic-string detection (`#Carlson DTM`) · binary reader → normalized surface contract (spec: `01` §2) · import dialog notes "Carlson DTM rev N detected" · unknown .tin flavors → friendly "unsupported flavor — export LandXML from your software" dialog with vendor hints.

**Language rule (PM directive):** all UI copy, docs, and roadmap language say **"Carlson-tested DTM path"** — never generalized ".tin support." The format space is fragmented; do not overpromise. The audit decode is an implementation note, not a marketing claim.

Exit criteria: sample .tin loads identically to its XML twin; non-Carlson .tin produces the guidance message; **timebox honored — if a second Carlson revision in the wild breaks the reader, document and stop.**

---

## Sprint 6 — Editing architecture + first edit: **move point**

**Goal:** prove viewer→editor; one convincing live edit.
**Depends on:** S3 (active surface), S2.

**First edit decision (PM delegated): move point, Z-first.** Rationale against the alternatives:

| Candidate | Verdict |
|---|---|
| **Move point** | ✅ Highest real-world frequency (fixing a busted shot elevation). Zero topology change → no half-edge structure needed yet, export trivially preserves triangulation, undo is trivial (store old coord). Visually obvious live update. Proves the entire select→edit→render→export loop at minimum geometry risk. Z-only mode first (drag vertically or type a value); XY move flagged with a "may invert adjacent triangles" guard check |
| Add/remove point | ✗ Forces local re-triangulation → half-edge model + "preserved vs modified" story in sprint one of editing |
| Edge swap | Good candidate #2 (topology change but bounded — exactly 2 faces); defer to next edit sprint |
| Force edge / breakline enforcement | ✗ Hardest correctness problem in the list; later |

Scope: edit-mode entry/exit (explicit button + canvas border accent + status badge) · non-active surfaces force-muted · vertex picking (BVH raycast, snap radius, hover highlight) · selected-vertex info card (id, N/E/Z) · Z-drag + numeric entry · live mesh update (in-place buffer write + normal recompute for affected faces) · single-level undo minimum (design for stack) · dirty flag ● on edited surface · safe/destructive labeling convention established.

Exit criteria: user enters edit mode, picks a vertex, changes Z, sees faces update live, undoes, exits; mode state is never ambiguous (visible in ≥2 places).

---

## Sprint 7 — Export edited LandXML

**Goal:** close the loop: import → inspect → edit → export.
**Depends on:** S6.

Scope: LandXML 1.2 writer from SurfaceModel · unedited geometry round-trips value-faithful (same ids, same face order, full coordinate precision) · edited vertices written with same precision · provenance: app comment header notes "N points modified; triangulation preserved from source" (or "rebuilt") · export dialog states exactly what was preserved vs modified · per-surface export from left panel · re-import of an exported file verified.

Exit criteria: round-trip of untouched surface is value-identical (automated test); edited surface re-imports correctly into Carlson (PM verifies in Carlson — **PM action**).

---

## Later (unchanged from PM roadmap)

Comparison/analytics, contours/profiles/volumes, merge, orthomosaic underlay, LAS/LAZ (separate rendering path — point budget, not TIN budget), TIN/LAS compare, CSV points, heat maps. Architecture reserves room: SurfaceModel provenance, capability-gated right-panel sections, worker-based import pipeline all extend without rework.

**PM-parked ideas (logged post-Sprint-3):** breaklines treated as *profiles* — tool-panel breakline list, select to view profile, future smooth profile editing · edit features: **tag/untag breakline** (downgrade selected sections, join selected linework into a breakline) and **fill hole** — both join the Sprint 6+ edit-tool roadmap alongside move point · inclusion/exclusion zone drawing/adding when absent from import.

**PM-parked ideas (logged post-Sprint-2, not scheduled):** settings/config file export+import to mock persistence (import preferences, layer ignore rules, point codelists, zero-elevation point filtering) · Civil3D-style point groups with display-priority ordering · CSV point import · point symbol styles · drone/fly mode with surface-relative altitude (PM-perspective review; pairs with future ortho/LAS realism) · BIM model placement · DXF-as-pipe-network (render relative to design grade, not draped) · hatch rendering on faces.
