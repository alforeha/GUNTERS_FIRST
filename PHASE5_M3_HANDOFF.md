# Phase 5 Milestone 3 — Work Report & Handoff

**Status: INCOMPLETE — blocking regression. Do not ship.**
Point cloud display is broken: points render **all black**, and density did not improve.
RGB worked correctly before this milestone (Milestone 2) and must be restored first.

---

## TL;DR for the next implementer

A previous pass rewrote `src/viewer/RenderPointCloud.ts` to add LOD, display modes, and
filters. That rewrite **regressed RGB rendering** — every point now draws black even though the
color data is verified correct all the way into the GPU buffer. **Fix the black-points
regression before touching anything else.** Strong recommendation: **revert
`RenderPointCloud.ts` to the Milestone 2 version and re-apply the new features incrementally**,
verifying RGB stays visible after each step.

---

## What the console proved (key evidence)

A diagnostic log was added to `packNode()` in `RenderPointCloud.ts`. On loading the reference
LAS it printed:

```
{
  "mode": "rgb",
  "written": 38,
  "firstRGB": [89, 119, 60],      // color WRITTEN to the GPU buffer — correct, non-black
  "srcFirstRGB": [89, 119, 60],   // color delivered by the worker — correct, non-black
  "srcColorsLen": 114,
  "hasReturnNumbers": true,
  "hasZRange": true,
  "groupVisible": true
}
```

**Interpretation:**
- The worker delivers correct RGB (`srcFirstRGB` is real color).
- `packNode` writes correct RGB into the node's color buffer (`firstRGB` matches).
- The group is visible.
- **Yet the user sees all points black.**

This means the bug is **NOT** in the data or the worker. The color bytes are correct in the
buffer. The failure is in how that buffer is bound/consumed for rendering — i.e. the
`THREE.Points` color attribute is not being interpreted as vertex color on the GPU.

### Prime suspect (where the next IMP should start)

In `RenderPointCloud.flattenNodes()` the color attribute is built as:

```ts
geometry.setAttribute('color', new THREE.Uint8BufferAttribute(color, 3, true)); // normalized=true
```

and later written to in `packNode()` with `colorAttr.needsUpdate = true`.

The **Milestone 2 (working) version bound `source.colors` directly** at construction with a full
draw range. The rewrite instead allocates an **empty** Uint8 buffer and fills it later in
`packNode`. The regression lives in this changed path. Most likely culprits to check, in order:

1. **Normalized Uint8 vertex-color update.** Confirm `PointsMaterial({ vertexColors: true })`
   plus a `Uint8BufferAttribute(..., normalized=true)` actually re-uploads and normalizes
   (0–255 → 0–1) when mutated + `needsUpdate=true`. If three.js reads the bytes un-normalized or
   the update doesn't take, colors collapse to black. **Try binding a `Float32` color attribute
   (values 0–1) instead, or bind `source.colors` directly like M2 did.**
2. **Material `color` tint.** `PointsMaterial.color` defaults white and multiplies vertex colors;
   verify it isn't being set/left black anywhere.
3. **Attribute identity.** Confirm `node.color`, the array inside the bound
   `Uint8BufferAttribute`, and `colorAttr.array` are the same reference (they appear to be, but
   verify after any refactor).
4. **Draw range vs. count mismatch** on a normalized attribute.

The fastest safe fix is **revert to the M2 color-binding approach** (bind the real color array,
manage visible count via draw range) and layer display-mode recoloring on top of a proven path.

---

## Second open issue: density did not improve

Acceptance criterion "closer zoom loads denser point nodes" is **not met** per the user.
Important context for the next IMP:

- The octree is **sampled at build time** in `src/workers/las.worker.ts`
  (`NODE_SAMPLE_CAP = 50_000`, `sampleStride(depth) = max(128, 4096 >> depth)`). "Full density"
  is therefore the densest *sampled* set, not all 381M points. Zooming cannot exceed what the
  octree retained.
- A `[PC pass]` diagnostic was added to `RenderPointCloud.updateVisible()` that logs
  `scoredInFrustum`, `selected`, `totalNodes`, `totalSampledPoints`, `drawnNodes`, `drawnPoints`.
  **This was never captured.** Get this output first — it tells you whether points are lost to
  (a) the frustum test over-rejecting, (b) `selectLod` dropping nodes to stride 0, or (c) the
  octree simply not having enough sampled points to look dense.
- If (c), the real lever is **increasing per-leaf sample retention in the octree builder**
  (Milestone 1 territory) — flag to PM as separate scope.

---

## What was implemented this milestone (code is on disk)

All of the following is written and compiles/lints/tests green, but is **unverified in-render**
and sits on top of the broken color path:

1. **Contract** (`src/core/contract.ts`): added `returnNumbers`, `numberOfReturns` to
   `PointCloudOctreeNode`; added `presentClasses`, `presentReturns`, `maxReturnCount`, `zRange`
   to `PointCloudOctree`.
2. **LAS worker** (`src/workers/las.worker.ts`): decodes per-point return number / number-of-
   returns (formats 0–5 and 6–10), stores them in nodes, computes octree-level class/return
   summaries.
3. **RenderPointCloud** (`src/viewer/RenderPointCloud.ts`): **REWRITTEN** — distance-based LOD
   (`selectLod`), settle-gated tier switching, per-mode recolor, class/return filtering via
   `packNode`. **This file holds the regression.**
4. **Pure LOD/util module** (`src/viewer/pointCloudLod.ts`): `selectLod`, `pointPasses`,
   `returnRole`, `classLabel` (LAS 1.4 names), `terrainColor` ramp, `GeotiffOverviewSampler`.
   Unit-tested, THREE-free.
5. **GeoTIFF coarse-overview path**: `overview` request added to
   `src/workers/geotiff.worker.ts`; `requestOverview()` + CPU sampler in
   `src/viewer/RenderGeotiff.ts`. (Backup recolor mode — low priority; user deprioritized it.)
6. **ViewerEngine** (`src/viewer/ViewerEngine.ts`): `setPointCloudDisplayMode`,
   `setPointCloudFilter`, `setPointCloudGeotiffSource`; point-cloud `updateVisible` now passed
   `cameraSettled`.
7. **Store** (`src/state/store.ts`): `PointCloudEntry` gained `displayMode`, `hasRgb`,
   `presentClasses`, `classFilter`, `presentReturns`, `multiReturn`, `returnsFilter`,
   `geotiffSource`.
8. **importController** (`src/ui/importController.ts`): setters
   `setPointCloudDisplayMode` / `setPointCloudClassFilter` / `setPointCloudReturnFilter` /
   `setPointCloudGeotiffSource` and `confirmPointCloudImport` field population.
9. **Left panel** (`src/ui/LeftPanel.tsx`): display-mode selector, GeoTIFF source dropdown
   (greyed when none), classification toggles (LAS names), returns toggles (greyed "Single
   return only" for single-return files) — all in the expanded Point Clouds row.
10. **Tests** (`tests/pointcloud-lod.test.ts`): LOD selection, class/return filters, terrain
    ramp, overview sampler, and a synthetic **multi-return / multi-class** worker octree fixture.

`npm test`, `npm run build`, `npm run lint` reported **passing** by the user.

---

## MUST DO before continuing (cleanup)

Temporary diagnostics were left in `src/viewer/RenderPointCloud.ts` and **must be removed**:
- `console.log('[PC pack]', …)` and the `loggedPack` static field (in `packNode`).
- `console.log('[PC setDisplayMode]', …)` (in `setDisplayMode`).
- `console.log('[PC pass]', …)` and the `loggedPass` static field (in `updateVisible`).

A `server.hmr` block was added to `vite.config.ts` while chasing a suspected stale-bundle issue.
The user confirmed closing/reopening the app DOES load fresh code, so **this HMR change was
unnecessary** and can be reverted to keep the config clean.

---

## Recommended plan for the next IMP

1. **Capture the `[PC pass]` console line** on a LAS load (density diagnosis), then remove all
   temp logs.
2. **Fix black points first.** Revert `RenderPointCloud.ts` to the Milestone 2 color-binding
   (bind real color buffer / draw-range visibility). Confirm RGB renders. This is the gate.
3. Re-apply features on the proven base, **one at a time, verifying RGB after each**:
   distance LOD → intensity/elevation recolor → class filter → returns filter → (optional)
   GeoTIFF overview recolor.
4. Re-assess density against the `[PC pass]` numbers; escalate octree sample-retention to PM if
   the cap is the limiter.
5. PM does the visual/runtime review (per work order: IMP does not do runtime testing).

## Acceptance status

- [ ] Closer zoom loads denser nodes — **NOT MET** (density unchanged; needs `[PC pass]` data)
- [ ] LOD switches on camera settle — implemented, **unverified in render**
- [ ] Display modes (RGB/intensity/elevation/GeoTIFF) — **BROKEN: all render black**
- [ ] GeoTIFF option greys out when none loaded — implemented, unverified
- [ ] Classification toggles use LAS names, no re-parse — implemented, unverified
- [ ] Returns filter present, greyed for single-return — implemented, unverified
- [x] `npm test` / `build` / `lint` pass
- [ ] PM visual review — **blocked by black-points regression**
