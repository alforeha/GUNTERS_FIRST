# Risk Register

Ranked by (likelihood × pain). Each maps to a PM-listed concern plus two additions found during audit (R1, R12).

| # | Risk | L | Impact | Mitigation | When |
|---|---|---|---|---|---|
| R1 | **Float32 precision at survey coordinates** (1.5M×3.5M ft) → vertex jitter, broken picking. *Not on PM's list; found in audit — the samples guarantee it.* | Certain | High | Float64 source-of-truth; local-origin rebasing in render path; jitter test in S1 exit criteria | S1 |
| R2 | **LandXML variability across vendors.** Already proven: Carlson puts breaklines in `SourceData/DataPoints`, not `<Breaklines>` | High | High | Schema-complete parser contract (`04` §2); import dialog reports unknowns instead of failing; PM sources Civil 3D + Trimble samples by end S2 | S2 |
| R3 | **Multi-million-point TINs** (PM confirms real datasets). Faces scale fine; edges/vertices/labels overlays fall over first | High | High | Typed arrays + worker parse + single draw call per overlay; label auto-disable threshold; decimated *preview* LOD as fast-follow (never silently shown as truth — banner states "preview decimation active") | S1 perf gate, revisit S3 |
| R4 | **.tin fragmentation / vendor lock** | High | Med | Descoped to Carlson-magic-string spike; all else routed to LandXML with guidance message; hard timebox | S5 |
| R5 | **DXF diversity** (blocks, hatches, splines, proxies — samples are unusually clean) | High | Med | Normalize→report→skip pipeline; entity census in import dialog; never crash on unknown | S4 |
| R6 | **Draping fidelity over long segments** — chords float above/below terrain | Certain | Med | Densification in MVP drape (max-edge-length subdivision), not deferred | S4 |
| R7 | **Editing needs different geometry model than viewing** — topology edits want half-edge; viewing wants flat buffers | Med | High | First edit = move point (no topology change) buys a sprint of evidence; SurfaceModel is the boundary so a half-edge layer can be added behind it without touching viewer/exporter | S6 decision point |
| R8 | **Export topology preservation** — users must trust "unchanged unless I changed it" | Med | High | Keep original ids/order in SurfaceModel; automated value-faithful round-trip test; provenance statement in export dialog + file comment | S7 |
| R9 | **Preserved vs rebuilt triangulation communication** | Med | Med | Provenance enum on SurfaceModel (`source-explicit` / `rebuilt-delaunay` / `modified`); surfaced in import dialog, left-panel badge, export dialog | S2, S7 |
| R10 | **Label rendering cost** (thousands of texts) | High | Med | troika SDF text, frustum+distance culling, density cutoff | S3 |
| R11 | **Browser memory ceiling** on huge files | Med | Med | Streaming worker parse (no DOM tree); Float64 positions + Uint32 indices only; warn at file-size threshold with point count estimate | S2 |
| R12 | **Future LAS/orthomosaic changing architecture** | Low | Med | PM is right that LAS displays differently — it's a point-budget problem (potree-style octree), a *sibling renderable* beside TIN meshes, not a change to SurfaceModel. Orthomosaic = draped texture, fits existing scene graph. No current decision blocks either | none now |

**Two decisions PM should ratify** (I've made the calls; flag disagreement early):

1. DXF before .tin (S4↔S5 swap) — draping is the product's second value; .tin is a convenience.
2. Move point as first edit, Z-first — over add/remove point, which forces the half-edge model a sprint too early.
