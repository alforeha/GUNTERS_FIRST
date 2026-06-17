# TIN Viewer / Editor — Lead Designer Handoff Response

**Project:** gunters.app TIN Viewer/Editor · **Date:** 2026-06-10 · **Status:** Sprint 0 complete

This is the master document. Companion docs:

- `01_FILE_AUDIT.md` — what's actually in the _REFS samples
- `02_SPRINT_PLAN.md` — staged build plan with exit criteria
- `03_RISK_REGISTER.md` — ranked risks and mitigations
- `04_IMPLEMENTER_NOTES.md` — implementer-ready specs (shell, parsing, rendering, draping, editing)

---

## 1. Review summary (the product in my words)

A local-first, browser-based surface viewer that becomes an editor. A surveyor or PM drags a LandXML (later .tin) file into the page and sees the *true* surface — the exact triangulation the file defines, never silently rebuilt. DXF plan linework can be draped onto that surface for context. Later, the user edits the active surface live in the same canvas and exports a modified LandXML; export is the only persistence. One canvas is the product; panels exist to serve it. The architecture must be viewer-shaped today but editor-shaped underneath — the internal model carries provenance (preserved vs. rebuilt triangulation), edit dirty-flags, and per-surface state from day one.

## 2. File audit — headline conclusions

Full detail in `01_FILE_AUDIT.md`. The short version:

- **LandXML**: Carlson Survey 2021 export, LandXML 1.2, US Survey Foot. 2,782 points, **5,020 explicit faces — triangulation is fully preserved in-file**. 11 breakline point lists (under `SourceData/DataPoints`, not the spec's `<Breaklines>` element — variability confirmed). No boundaries, no contours. Point order is **Northing Easting Elevation**.
- **.tin**: Carlson DTM binary (rev 24603). Reverse-engineered during audit: same 2,782 points, 10 edge records, and 5,020 triangle records **matching the XML faces exactly**. This flavor is browser-readable. But PM confirms mixed vendor environment → .tin is fragmented territory; LandXML is the universal interchange and the canonical import path.
- **DXF**: AutoCAD (AC1027) and Carlson (AC1032) exports are content-identical. 491 model-space LWPOLYLINEs across 4 layers, 5 block INSERTs (survey symbols), 4 MULTILEADERs. The contour polylines already carry elevations (group 38). Very tractable for MVP draping.
- **DWG**: binary, not realistically browser-parseable. **Out of scope** — users export DXF.

**Gap the PM flagged:** the samples do NOT cover all LandXML variability. Missing from samples: `<Breaklines>`/`<Boundaries>` spec elements, multiple surfaces per file, Civil 3D / Trimble / Leica exports, metric units, faces with invisible flags (`<F i="1">`), neighbor attributes. The parser spec in `04_IMPLEMENTER_NOTES.md` §2 enumerates every surface attribute the LandXML 1.2 schema allows so import handles them gracefully even though untested. **Request: PM should source at least one Civil 3D and one Trimble LandXML export before Sprint 2 ends.**

## 3. Stack recommendation (firm)

| Layer | Choice | Why |
|---|---|---|
| Build | **Vite + TypeScript** | Instant dev server, trivial static deploy to gunters.app, no backend |
| UI shell | **React** | Component model for panels/dialogs/lists; huge agent familiarity |
| 3D | **Three.js (imperative, outside React)** | Mature, performant BufferGeometry path for 1M+ vertex meshes; the canvas is owned by a plain TS `ViewerEngine` class — React never re-renders the scene |
| Raycast/sampling | **three-mesh-bvh** | Makes DXF draping (thousands of elevation samples) and future point-picking O(log n) instead of O(faces) |
| State | **Zustand** | Minimal, store-outside-React works for both panels and the viewer engine |
| DXF parsing | **dxf-parser (npm)** + thin normalization layer | Handles LWPOLYLINE/INSERT/layers/colors; gaps (MULTILEADER) are reported, not crashed on |
| LandXML parsing | **Hand-written streaming parser in a Web Worker** | The format is simple; DOMParser chokes on 100MB+ files; worker keeps UI responsive |
| Labels | **troika-three-text**, distance/frustum culled | Only viable path for thousands of elevation labels |

Explicitly rejected: react-three-fiber (reconciler overhead + awkward fit for one big imperative mesh), Babylon (heavier, no advantage here), CesiumJS (geospatial globe machinery we don't need), deck.gl (analytics-oriented, weak editing path).

**Non-negotiable architecture decisions** (justified in `04_IMPLEMENTER_NOTES.md`):

1. **Local-origin rebasing.** Sample coords are ~1.5M × 3.5M ft. Float32 GPU precision dies at that magnitude (vertex jitter). Keep Float64 source coords; render in local space offset by the scene origin. This must exist from Sprint 1 or everything visual is subtly broken.
2. **Parsing in Web Workers.** Multi-million-point files must never block the canvas.
3. **SurfaceModel is the single internal representation.** LandXML, .tin, and future LAS-derived TINs all normalize into it. Viewer, draper, editor, exporter only ever see SurfaceModel.
4. **One canvas confirmed.** After technical review, the single-canvas + camera-mode approach holds. "2D" = orthographic top camera with rotation locked — same scene, same toggles.

## 4. UX direction

### Layout

```
┌──────────────────────────────────────────────────────┐
│ header: gunters.app · File · View · Tools · About ·…  │
├───────┬──────────────────────────────────┬───────────┤
│ LEFT  │                                  │   RIGHT   │
│ Scene │         CANVAS                   │  Display  │
│ panel │   (drag/drop target, always)     │  & Tools  │
│ ⟨coll⟩│                                  │  ⟨coll⟩   │
├───────┴──────────────────────────────────┴───────────┤
│ status bar: cursor N/E/Z · units · mode · progress    │
└──────────────────────────────────────────────────────┘
```

- **Left = what's loaded** (surfaces list, DXF list, visibility/lock/mute, active selection, per-item export). One surface is *active* at all times once loaded — bold in list, others normal/muted.
- **Right = how it looks and what you can do** (display toggles, color/transparency, vertical exaggeration, labels, view modes; later: edit tools, analysis). Sectioned accordion; sections appear only when relevant data exists.
- **Status bar** earns its place immediately: live cursor coordinates are the cheapest trust-builder for surveyors, and it's the natural home for mode badges and progress.
- Both panels collapsed at startup; canvas shows a quiet centered dropzone hint. Panels auto-open on first successful load (left) and first surface render (right). This is the empty→loaded transition: the UI *grows because of what you did*, never crowded before.

### Import flow (designed, not an afterthought)

Drop → **Import dialog**: file identified (format, app of origin, units), then a findings list with severity icons — e.g. "✓ 5,020 faces — original triangulation preserved" / "⚠ No faces found — triangulation must be rebuilt (Delaunay), result may differ from source" / "ℹ 4 MULTILEADER entities will be skipped". Options (target surface for DXF drape, entity handling) appear only when a real choice exists. Confirm → progress states (parsing → building → draping) in dialog then status bar. Findings persist post-import in an "Import notes" drawer per dataset in the left panel, so confidence isn't a one-shot dialog.

### Multi-surface & edit mode

- Active surface = full shading. Non-active = configurable, default "muted" (desaturated, ~40% opacity). Per-surface override in left panel.
- **Edit mode is loud:** canvas border accent, status-bar badge, right panel swaps to edit tools, non-active surfaces force-muted (overridable). Every edit action labeled safe/destructive; single-level undo minimum in first edit sprint. Exiting edit mode with unexported changes prompts.
- A surface that has been edited shows a dot ● (dirty) in the left panel; export clears it.

### Future growth without clutter

Right panel sections are capability-gated: "Analysis", "Compare", "Imagery" sections simply don't render until those capabilities ship and relevant data is loaded. The Tools header menu is the discoverability index. No tab graveyard, no disabled-button museum.

## 5. Sprint plan — summary

Detail + exit criteria in `02_SPRINT_PLAN.md`. Changes from PM's draft are **bolded**:

- **S0 Audit + architecture** — *done (this document set)*
- **S1 Shell + viewer foundation** — layout, panels, camera system, origin-rebased render path proven with a synthetic 1M-vertex test mesh
- **S2 LandXML import + true surface render** — worker parser, import dialog, faces/edges/points/breakline toggles
- **S3 Multi-surface + scene controls** — active surface, mute, per-surface display, vertical exaggeration, labels v1
- **S4 .tin (Carlson) — descoped to a 2–3 day spike, not a full sprint.** Audit proved Carlson rev-24603 readable; spike ships it behind "Carlson DTM detected" messaging, all other flavors get a friendly "export LandXML" path. **Moved after DXF** since DXF is second-priority product value.
- **S5 DXF draped underlay** — *swapped with S4* — dxf-parser, layer panel, BVH elevation sampling, segment densification **in MVP not deferred** (long contour chords misrepresent the surface — it's correctness, not polish)
- **S6 Editing architecture + first edit = move point (Z-first)** — my recommendation, rationale in `02_SPRINT_PLAN.md` §S6: zero topology change, maximum trust, proves the entire live-update + export loop with minimum geometry risk
- **S7 Export edited LandXML** — byte-faithful where unedited, honest provenance notes in exported file header comment

## 6. Risk notes — top 5

Full register in `03_RISK_REGISTER.md`.

1. **Float precision / origin rebasing** — silently ruins everything if missed; mitigate in S1 (architectural, cheap now, brutal retrofit).
2. **LandXML variability** — samples are Carlson-only; `SourceData/DataPoints` vs `<Breaklines>` already proves divergence. Mitigate: schema-complete parser spec + acquire Civil 3D/Trimble samples.
3. **Multi-million-point TINs** (PM-confirmed real) — typed arrays + worker parsing + draw-call discipline gets to ~2–3M faces; beyond that, edge/label rendering is the first thing to fall over. Decimated *preview* LOD is a fast-follow, never silently substituted for true geometry.
4. **DXF entity diversity** — samples are clean; real-world DXF won't be. Mitigate: normalize→report→skip pipeline, never crash on unknown entities.
5. **Editing on indexed BufferGeometry** — move-point is cheap (vertex update in place); topology edits (add/delete/swap) need a half-edge structure. Decision deliberately deferred to S6 with the model boundary (SurfaceModel) designed so it can absorb that change.

## 7. First implementation slice (assign now)

**Slice 1 = Sprint 1, one coding agent:** Vite+React+TS scaffold, layout shell (header/panels/status bar/canvas), `ViewerEngine` class with orbit/pan/zoom + ortho top toggle + reset, origin-rebasing render path, and a generated 1M-vertex synthetic terrain to prove performance before any parser exists. Spec: `04_IMPLEMENTER_NOTES.md` §1.

**Slice 2 (can start in parallel, no UI dependency):** LandXML worker parser → SurfaceModel, unit-tested against `_REFS/CO23012_TOPO.XML` (2,782 pts / 5,020 faces / 11 breaklines, N-E-Z order). Spec: §2.

They meet in Sprint 2 when the parser output is handed to the viewer.
