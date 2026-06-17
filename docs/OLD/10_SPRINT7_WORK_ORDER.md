# Sprint 7 Work Order — LandXML Export (close the loop)

**Single agent, phases in order, app working at every phase boundary. No git — work in files; PM handles version control.** This document is self-contained: read it, then `04_IMPLEMENTER_NOTES.md` (§0/§0.1/§6) and `NOTES.md`/`README.md` for current state. Layout/UX baseline is the shipped Sprint 6 UI.

**Current state (verified, expected):** Sprints 0–6 green, move-point Z editing live (edit mode, undo, dirty flag). Contract at rev 1.2.

**Standing constraints (unchanged):** `ui → viewer → core` dependency rule; core stays DOM-and-Three-free; writer lives in `core/`, **no DOM/DOMParser/XML-serializer-via-browser** — string-building is fine and consistent with the streaming-parser approach; `// CARLSON-ASSUMPTION:` markers where relevant; contract frozen except where this order amends it; session-only, no localStorage.

**Goal:** complete the import → inspect → edit → export loop. This is the second proof-of-concept sprint — straightforward by design, low ambiguity.

**Fixtures:** `_REFS/CO23012_TOPO.XML` is the primary round-trip fixture (2,782 points, 5,020 faces, 11 source-data point lists per rev 1.2, first point E 3510094.284 / N 1511101.218 / Z 4185.801, first face (3,4,2) 0-based, `precisionHint` 8).

---

## Phase 1 — LandXML 1.2 writer (`core/`)

- New module, e.g. `src/core/landxml/write.ts`. Input: `SurfaceModel` (one or more). Output: LandXML 1.2 string.
- Emit, per surface, in source order where the contract preserves it:
  - `Units` — from `SourceMeta.units` (round-trip the original `raw` unit string where possible).
  - `Project`/`Application` block — app name + a provenance comment, e.g. *"exported by gunters.app TIN editor; N vertices modified; triangulation preserved from source"* (or *"...triangulation rebuilt"* if `provenance !== 'source-explicit'`). N = count of distinct vertices touched this session (from the Sprint 6 undo/edit history — if the command stack was cleared, fall back to a simple "modified" boolean from `dirty`).
  - `Pnts` — **original `sourcePointIds`**, N E Z order (note: LandXML `<P>` is N E Z — same swap-on-read note from the parser applies in reverse on write), full precision matching `precisionHint` (use `toFixed(precisionHint)` or equivalent — verify no scientific notation, no trailing-zero truncation below the hint).
  - `Faces` — `indices` in original order, 1-based `<F i="...">` per LandXML convention (parser reads 0-based per `04` §2 — convert back), preserve `faceVisibility` flags where present.
  - Breaklines — re-emit `<Breaklines>` as parsed (rev 1.2: this is the *only* breakline source now — `sourceDataPointLists` is informational and is **not** re-emitted as breaklines or anything else; it can optionally round-trip as a comment/info note if trivial, but is not required).
  - `Contours` — if `SurfaceModel.contours` is populated (rev 1.1, stored not rendered), re-emit; if writing them is non-trivial, counting + a documented deviation is acceptable (mirrors the Sprint 1 "count, don't store" precedent — but prefer writing them if the shape is simple).
  - Boundaries — re-emit `Boundary[]` with the same lenient `bndType` mapping used on import (outer/inclusion/exclusion), in reverse.
- Unedited geometry must be **value-identical** on round-trip (not byte-identical — whitespace/formatting may differ): same ids, same face order, same coordinate values to `precisionHint` decimal places.

## Phase 2 — Round-trip test

- Test: parse `CO23012_TOPO.XML` → export → re-parse the exported string → assert value equality against the original parse result (points by id, faces by index+order, breaklines, units, precision). Automated, in `tests/`.
- Edited-surface case: apply a Sprint-6-style Z edit programmatically (bypass UI — call the same write path edit uses), export, re-parse, assert the edited vertex shows the new Z (to `precisionHint`) and all other vertices are unchanged, and the provenance comment reflects "modified" / correct count.
- Synthetic fixtures from earlier sprints (metric, sparse ids, faceless, spec-breaklines+boundaries, etc.) should round-trip without crashing at minimum; full value-equality where the writer covers that element type.

## Phase 3 — Export dialog + UI wiring

- Per-surface export action — left panel, on the surface's row (consistent placement with Sprint 3's panel conventions; "Open…" lives in the top section, export is a per-row action).
- Export dialog states **exactly what was preserved vs modified**, mirroring the import dialog's findings-style reporting (Sprint 2 dialog phases: this can reuse that component's visual language). At minimum: "N points modified, triangulation preserved from source" / "no changes — exporting unedited copy" / breaklines & boundaries re-emitted counts.
- Triggers a browser download (`Blob` + object URL, revoke after) of the LandXML string with a sensible filename (e.g. original name + `_edited` or a timestamp, PM can bikeshed naming — pick something reasonable and document it).
- If the surface was never edited (`dirty === false`), exporting should still work (clean round-trip) — don't gate export on having made edits.

## Phase 4 — Re-import verification

- Automated: re-import the exported file through the existing import pipeline (worker parse → `SurfaceModel`) and confirm it loads without new warnings/errors beyond what the original produced, and renders (same point/face counts in the ImportReport).
- **PM action (not agent):** PM opens an exported file in Carlson to verify it's accepted as valid LandXML by the actual downstream tool. Note this explicitly in NOTES.md as a pending PM verification step — do not mark the sprint's automated criteria as blocked on it, but flag it clearly.

---

## Out of scope (explicitly, do not build)

- New edit tools (tag/untag breakline, fill hole, add/remove point, edge swap) — later, parked.
- Hover/ground-view camera, world view, underlays, satellite imagery, coordinate-system DB — parked for post-Sprint-7 priority discussion.
- Multi-surface "merge surface" / unified export — single-surface (or per-surface independent) export only this sprint.

## Exit criteria

Round-trip of an untouched surface is value-identical (automated test, passing). Edited surface (via programmatic edit) exports with correct values + accurate provenance comment, re-imports cleanly. Export dialog correctly states preserved-vs-modified. Per-surface export works from the left panel. All Sprint 0–6 behavior intact. Typecheck/lint/full test suite green. PM's Carlson re-import check logged as a pending manual step in NOTES.md.

## Deliverables

- Updated `NOTES.md`: writer deviations (if any), round-trip test summary, PM's manual-verification checklist (Carlson re-import) ready for the walkthrough.
- New `tests/landxml-write.test.ts` (or similar) alongside existing suite; full suite green.

---

## Looking ahead (no action this sprint)

Per PM direction (2026-06-13): after Sprint 7, pause new-feature work for a dial-in/use period before the next priority round. Parked backlog for that discussion includes hover/ground-view mode (tool-center pill: mode checkbox + camera-altitude-from-surface entry + go-to-point snap-in), optional world view + map underlay + boundary-drawn satellite-image generation feeding the drape engine (draw order top→bottom: vertex, edge, face, DXF, PDF, aerial imagery), a state coordinate system database vs. manual placement/transform, the longer-range AR ground-view / "video game environment" concept (orthomosaic linework extraction, automatic pole/tree recognition — flagged by PM as its own project, scoping TBD), a PDF-to-DXF digitizing engine with template-assisted recognition, and the open question of whether DXF draping should apply only to the active surface or all surfaces ahead of a future merge-surface feature.
