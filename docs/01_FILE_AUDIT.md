# Sprint 0 File Audit — _REFS samples

Audited 2026-06-10. All five files inspected byte-level / element-level.

## 1. CO23012_TOPO.XML — LandXML surface (407 KB)

| Property | Finding |
|---|---|
| Producer | Carlson Survey 2021, "LandXML conversion" |
| Schema | LandXML 1.2, namespaced, schemaLocation present |
| Units | Imperial, **USSurveyFoot**, squareFoot, cubicFeet |
| Surfaces | 1 — `CO23012_NW1_TOPO`, `surfType="TIN"` |
| Points | **2,782** in `<Pnts>`, format `<P id="n">N E Z</P>` — **Northing Easting Elevation order** (LandXML spec). N ≈ 1,511,000 / E ≈ 3,510,000 / Z ≈ 4,184–4,198 |
| Faces | **5,020** in `<Faces>`, plain `<F>a b c</F>` 1-based point ids. No `i=` (invisible) flags, no neighbor attrs. **Explicit triangulation fully preserved** |
| Breaklines | **CORRECTED post-Sprint-3, investigation-verified:** the file defines **no breaklines.** The 11 `SourceData/DataPoints/PntList3D` lists are 10×256 + 222 = 2,782 points — the **complete point inventory paginated at 256/chunk**. Evidence: (A) all 2,782 list points match `<Pnts>` in exact id order; (B) consecutive "vertices" jump up to 2,650 ft (list 3: 42 jumps >100 ft in 255 segments) — not linework; (C) chunk-boundary gaps 0.2–100 ft = id sequence continuing. Carlson's UI noting "11" is the same pagination, not 11 breaklines. Local 13–33 ft median spacing = field collection routes, which is why it half-resembles paths. Reclassified as informational source data in Sprint 4 Phase 0; spec `<Breaklines>` handling unchanged. Parked idea: "show collection path" QA toggle |
| Boundaries | None |
| Contours | None |

**Implication:** core promise ("render the surface as defined") is directly satisfiable. The `SourceData/DataPoints` quirk is the first concrete proof of cross-vendor LandXML variability.

## 2. CO23012_NW1_TOPO.tin — Carlson DTM binary (156 KB)

Header string: `#Carlson DTM $Revision: 24603 $` + embedded source path. Reverse-engineered structure:

| Section | Record format | Count |
|---|---|---|
| Points | marker `01 1C` + uint32 id + 3 × float64 (X=Easting?, Y, Z — axis order swapped vs XML) | **2,782** |
| Edges | marker `0F 1A` + uint32 id + 2 × uint32 point refs + flags | 10 |
| Triangles | marker `04 0D` + 3 × uint32 point ids + pad byte (15 B) | **5,020** — byte count matches file remainder exactly |

Verified: point coordinates match the XML to the millimeter; first triangles (3,4,5 / 6,7,8 / 9,10,4) are the XML faces (4 5 3 / 7 8 6 / 10 4 9) rotated. **This .tin is the same surface as the XML and is fully browser-readable for this Carlson revision.**

**Caveats:** format undocumented; other Carlson revisions may differ; Trimble/Civil3D/Leica ".tin" files are entirely different formats. PM confirms mixed-vendor environment. **Verdict: LandXML is the canonical path; Carlson .tin ships as a best-effort spike (Sprint 4) with magic-string detection (`#Carlson DTM`) and a friendly "export LandXML instead" message for everything else.**

## 3. DXF pair — AUTOCAD (AC1027/2013) and CARLSON (AC1032/2018), 2.3 MB each

Content-identical apart from DXF version. Composition:

| Entity | Model space | Incl. block defs | Notes |
|---|---|---|---|
| LWPOLYLINE | 491 | 1,069 | 191 closed. Contours carry **elevation in group 38** — 70 unique values, 4,184.4–4,198.0 ft at 0.2 ft interval |
| INSERT | 5 | — | Blocks: `SPT*` (survey points), `STRM-*`, `COMM-*` symbols |
| MULTILEADER | 4 | — | Annotation; not supported by JS parsers — skip + report in import dialog |

Layers: `0`, `E-SURF-CONT-MNR` (contours), `V-CONTROL-SYM`, `V-CONTROL-TXT`. Standard NCS-style naming; layer color/visibility model applies cleanly.

**Implications:** (a) very tractable for MVP draping; (b) contours already having Z means draping must offer "use entity Z" vs "drape to surface" choice; (c) blocks need INSERT-transform explosion to render symbol linework; (d) real-world DXFs will be messier — pipeline must skip-and-report, never crash.

## 4. CO23012_NW1_ELEMENT240719.dwg (437 KB)

Proprietary binary. No viable in-browser open-source parser. **Out of scope** — import dialog should recognize `.dwg` and tell the user to export DXF.

## 5. Sample coverage gaps (PM's explicit question)

The samples do **not** illustrate all import cases. Untested but must be handled (full parser contract in `04_IMPLEMENTER_NOTES.md` §2):

- LandXML `<Breaklines>` / `<Boundaries>` (incl. inclusion/exclusion types) spec elements — Civil 3D emits these
- Faces with `i="1"` invisible flags and `n1/n2/n3` neighbor attrs
- Multiple `<Surface>` elements per file
- Metric units; `<Metric>` element
- Pnts without faces (points-only export → triggers "rebuild required" import path)
- `<Contours>` element in source data
- CgPoints outside Surfaces
- DXF: TEXT/MTEXT, HATCH, SPLINE, ARC bulges (group 42 — present in spec, must convert to tessellated arcs when draping), POINT entities, paper space, proxy entities

**Action for PM:** source one Civil 3D and one Trimble LandXML export (any small surface) before end of Sprint 2 so the parser's variability handling is tested against reality, not just the schema.
*(Post-Sprint-2 update: PM cannot source other vendors; LandXML 1.2 ratified as the carried standard. PM will provide a LandXML 2.0 export as a regression fixture when convenient.)*

## 6. Addendum (post-Sprint-2): exploded DXF fixtures — audited 2026-06-11

PM added two exploded variants of the same drawing. Entity census (model space):

| Entity | `_EXPLODED.dxf` (2.9 MB, 38 layers) | `_EXPLODED_ALL.dxf` (8.8 MB, 33 layers) |
|---|---|---|
| LWPOLYLINE | 1,033 | 491 |
| LINE | 16 | **20,290** |
| INSERT | 397 | 47 |
| HATCH | **62** | 26 |
| ELLIPSE / ARC / CIRCLE | 0 / 1 / 2 | **332 / 261 / 4** |
| TEXT / ATTRIB / ATTDEF | 0 / 6 / 0 | 72 / 0 / 60 |
| POINT | 2 | 5 |
| 3DFACE | 0 | **24** |
| MULTILEADER | 3 | 3 |

Sprint 4 implications: this pair is the A/B fixture set — partial explode exercises INSERT-transform explosion at scale (397 inserts) and HATCH handling; full explode exercises raw-entity volume (20k+ LINEs → entity merging/batching matters), ELLIPSE/ARC tessellation, TEXT (skip+count), POINT entities (feeds the Point-tab/CSV track), and 3DFACE (note: 3DFACEs carry their own Z — candidates for "keep entity Z" handling). Both exceed the original samples' 4 layers by ~10×, so the layer-list UI gets a real stress test.
