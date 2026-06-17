# Phase 3 Work Order — GeoTIFF Drape

**Status:** Scoped 2026-06-15, confirmed with AL. Ready for implementer assignment.

Read first: `TIN_Viewer_PM_Handoff.md` (original Phase 5 section), `TIN_Viewer_Project_Summary.md` (Phase 3 section post-reorder), `04_IMPLEMENTER_NOTES.md` §3 (rendering), `00_DESIGN_HANDOFF.md` §4. Reference file: `_REFS/BATCH_2/ortho_7_8e5134b4-4700-44f5-9250-774def31056b.tif` (+ matching `.tfw` world file).

---

## Reference file audit — read this first

The reference GeoTIFF has been pre-inspected. Key facts the implementer must know before designing the placement approach:

| Property | Value |
|---|---|
| Size | 16,000 × 8,818 px |
| File size | **564 MB** |
| Bands | RGBA (4-band, 8-bit) |
| Pixel resolution | ~0.02135 ft/pixel (~¼ inch) |
| Coordinate system | NAD83(2011) / Colorado Central (ftUS) — Tag 34737 confirmed |
| Top-left origin (world) | X = 2,894,617.9, Y = 1,659,432.5 (state plane ft) |
| Pixel scale | 0.02135 ft/px X, 0.02135 ft/px Y |
| Companion world file | `.tfw` present, values match embedded GeoTIFF tags |

**Coordinate mismatch to investigate:** the surface (CO23012_TOPO.XML) has coordinates E ~3,510,094 / N ~1,511,101 in US Survey Feet (Carlson Survey). The GeoTIFF's origin is X ~2,894,617 / Y ~1,659,432 — a different numeric range. Both claim US Survey Feet / Colorado, but the E/N axes may be swapped (LandXML is Northing/Easting, state plane coords are typically Easting/Northing) or the two datasets may be from slightly different zones or origin offsets. **Implementer must resolve this before implementing auto-placement.** Specifically: determine whether X in the GeoTIFF corresponds to Easting or Northing in the surface's coordinate frame, and compute the actual offset. Report findings in NOTES.md before proceeding to placement implementation.

**564 MB cannot be loaded as a single GPU texture.** Tiling is mandatory — see §2 below.

---

## 1. Auto-placement from georef data

Goal: when a GeoTIFF with embedded coordinate data (GeoTIFF tags or companion `.tfw`) is loaded, the engine should place it on the surface automatically without user input — the user should just see it appear in roughly the right location.

Implementation approach:
- Read GeoTIFF tags (33550 pixel scale, 33922 model tiepoint) or `.tfw` world file to get the pixel→world transform (origin + pixel size).
- Resolve the coordinate axis/offset question noted above — determine the mapping from GeoTIFF world coordinates to the app's scene coordinates (which are rebased to local origin per the existing `SceneOrigin` system in `ViewerEngine`).
- Compute the GeoTIFF's bounding rectangle in scene space and use it to place the texture on the surface.
- If the GeoTIFF and surface don't overlap (e.g. different project sites), report this clearly in the import dialog rather than silently placing off-screen.

For v1.0, full coordinate system transform (reprojection between CRSes) is out of scope — assume both datasets share the same coordinate system and differ only by axis convention or numeric offset. Flag clearly in NOTES.md if this assumption doesn't hold for the reference files.

---

## 2. Tiling / LOD — mandatory given file size

564 MB / 16,000 × 8,818 px cannot be loaded as a single WebGL texture. Required approach:

- **Tile the image on load** (in a Web Worker, same pattern as LandXML parsing) into a grid of smaller tiles (e.g. 512×512 or 1024×1024 px). Each tile becomes one `THREE.Texture` / `THREE.Mesh` plane draped onto the surface.
- **LOD:** only load/render tiles visible in the current camera frustum; unload tiles that leave the frustum. This is essential for a 16,000 × 8,818 image at any reasonable frame rate.
- Use a `OffscreenCanvas` or `ImageBitmap` path in the worker to decode the image without blocking the main thread. Note: the browser's native TIFF decoding is limited — use `geotiff.js` (npm) for reading GeoTIFF files in the worker; it handles large files, tiled/stripped TIFFs, and exposes raw raster data per tile/strip.
- Each tile's geometry should be a subdivided plane mesh that gets elevation-sampled against the active surface (BVH raycast per vertex, same approach as DXF draping) to conform the flat tile to the terrain.

**npm dependency to add:** `geotiff` (npm package `geotiff`, ~300 KB gzipped, actively maintained, works in Workers).

---

## 3. Multi-tile support (AL confirmed v1.0)

AL wants multiple GeoTIFF tiles from the same orthomosaic batch to stitch together on the surface. Implementation:

- Each GeoTIFF file is imported separately (one at a time via the right panel "Add drape layer" flow established in Phase 2).
- If a newly loaded GeoTIFF's world coordinates are adjacent/overlapping with an already-loaded GeoTIFF, they should render seamlessly next to each other on the surface — no explicit "stitch" action needed, just consistent placement from the same coordinate→scene transform.
- They remain separate entries in the Phase 2 right panel Drape section (separate rows, each with its own visibility and drape-target controls) — they're not merged into a single dataset, just placed to align visually.
- **Risk:** 2+ tiles at 564 MB each will push memory hard. The tile LOD system from §2 is the main mitigation — tiles not in view should not be resident in GPU memory. Flag in NOTES.md if the reference tile set's memory profile looks like a problem.

---

## 4. Right panel controls (Phase 2 GeoTIFF row, now active)

The Phase 2 right panel Drape section already has a GeoTIFF row stub. Wire it up with:

- **Opacity slider** — controls texture transparency, default 100%.
- **Visibility toggle** — mirrors left panel visibility for this dataset.
- **Drape target dropdown** — which surface to drape onto (already in Phase 2 structure).
- Nothing else for v1.0 — placement is auto from georef, no manual drag/nudge controls this phase (that's PDF territory in Phase 4).

---

## 5. Import dialog

Extend the existing import dialog to handle GeoTIFF:
- Detect `.tif`/`.tiff` extension → show GeoTIFF-specific findings: pixel dimensions, file size, coordinate system (from tag 34737 if present), pixel resolution, whether georef data was found.
- If georef found: show computed placement bounds in scene coordinates (so AL can sanity-check it landed in the right place).
- If no georef found: warn clearly — "No coordinate data found; file cannot be auto-placed. Manual placement will be available in a future update."
- Drape target surface selector (same as DXF import — default to active surface).

---

## Out of scope for Phase 3

- PDF drape (Phase 4)
- Point cloud (Phase 5)
- Manual placement/drag controls (Phase 4, reused for PDF)
- Full CRS reprojection between coordinate systems (Phase 9)
- DXF hatching texture engine (Phase 6 — will reuse what's built here)

---

## Acceptance

- [ ] GeoTIFF import detected from `.tif`/`.tiff` extension; import dialog shows correct metadata (size, CRS string, resolution, placement bounds)
- [ ] Reference file (`ortho_7_...tif`) auto-places on or near the CO23012 surface without manual intervention
- [ ] Texture visible on surface in 3D and Top view; conforms to terrain (not flat-floating)
- [ ] Tiling/LOD: no single >4096px texture loaded; tiles outside frustum are not resident in GPU memory; frame rate acceptable while panning/orbiting over the textured area
- [ ] Second GeoTIFF tile (if available in BATCH_2 or a synthetic adjacent tile) renders seamlessly adjacent to the first
- [ ] Right panel opacity slider and visibility toggle work
- [ ] No regressions on existing surface/DXF/edit/export flows
- [ ] NOTES.md documents: coordinate axis resolution finding, tile size/LOD strategy chosen, memory profile of reference tile, any deviations

## Definition of done

PR with passing build/tests, before/after screenshots showing the orthomosaic draped on the surface in 3D view, NOTES.md entry with the coordinate investigation finding. PM reviews visually before Phase 4 begins.
