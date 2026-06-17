# Sprint 3 Work Order — UI Restructure + Scene Controls (single agent, sequential)

**One agent, phases run in order, each phase leaves the app working.** No repo/git concerns — work in files; PM handles version control.

This sprint absorbs the original S3 scope (`02`) **plus the PM's approved UI revision** (post-Sprint-2 review). Where the PM deferred to lead judgment, the ruling is stated inline — implement as written.

## Sprint 2 closeout rulings (no agent action)

- Both flagged deviations **accepted**: dialog phases `identifying → progress → findings` (chronological is correct — findings come from the parse; `06` C2 is superseded on this point), and async `sniffFormat` for File input.
- Vendor-XML stance **ratified**: LandXML 1.2 is the carried standard; schema-derived handling stays as-is. PM will export a **LandXML 2.0 sample** when convenient — becomes a regression fixture, not a blocker.
- PM adding an **exploded DXF** to `_REFS` (text removed, blocks exploded, symbols/hatching intact) — Sprint 4 fixture. Sprint 4's import-dialog and layer UI will follow the DXF-tab spec below.

---

## Phase 1 — Header + panel layout system

- **Header:** remove File / View / Tools entirely. Right-aligned: About · Privacy · Contact (dropdown or links). Left: title. Nothing else. Users are gated through panels only.
- **Panel sizing:** panels share the viewport with the scene — both closed = full-bleed canvas; one open = **50/50**; both open = **thirds** (1/3 each). Animate; canvas resizes correctly (no distortion, gizmo/overlays reposition).
- **Open/close affordance moves into the panel top bar** (chevron in each panel's header row). Closed panels collapse to a slim edge tab that reopens them.
- File-open access point relocates: "Open…" action moves into the left panel top section (and drag/drop remains global).

## Phase 2 — Viewer capabilities (do before panel wiring — panels bind to these)

1. **Vertical exaggeration** — scene-level Z scale (matrix, not buffer mutation, per `04` §3). Range 1–10×, default 1. Cursor readout and draped/overlay geometry must compensate.
2. **Lighting ("shadow") control** — directional-light azimuth + altitude; the "shadow adjustment slider" is altitude (low sun = long shading = terrain pops). Implement as hillshade-style directional light; one slider for altitude, drag-ring or second slider for azimuth. Cheap (no shadow-mapping — shading only).
3. **North arrow / axis gizmo** — **ruling: include now.** Corner viewport gizmo (separate overlay scene/pass, ~zero render cost — the PM's render-load concern doesn't materialize for a gizmo). Live-rotates with camera; N labeled; clicking N snaps to top-view north-up.
4. **Close-zoom fix** — the reported lock-up is OrbitControls hitting `minDistance`/near-plane at terrain scale. Fix: distance-adaptive dolly (speed proportional to camera→surface raycast distance), `zoomToCursor: true`, dynamic near/far from scene bounds, minDistance small enough for ~1 ft inspection. Acceptance: zoom from full extents to a single triangle and back, smoothly, no lock-up, no clipping.
5. **Large-dataset lag triage** — likely causes in order: hover raycast on every pointermove (throttle to rAF, skip when camera is moving), normals/BVH rebuild on toggle, render-on-demand thrash. Throttle hover; profile the PM's large set; document findings in NOTES.md. Target: interaction stays fluid; if residual hitches remain at multi-million scale, document and accept (R3 says decimated preview LOD is the next lever, not this sprint).

## Phase 3 — Left panel = **Display Control Center**

### Top section (always visible)
Row 1: Open… · view-mode toggle (3D/Top) · Reset view.
Row 2: Vertical exaggeration slider · shading (sun) slider.

### Tab nav: **SURFACE · DXF · POINT**
DXF and POINT tabs ship as styled placeholders this sprint ("DXF arrives next sprint" / "Points arrive with DXF + CSV import"). Build the tab framework for real — Sprint 4 fills DXF per the spec below.

### SURFACE tab
- **Quick controls bar** — master toggles (all faces / edges / vertices / breaklines / labels). **Ruling: overrides, non-destructive** — implemented as scene-level gates ANDed with per-surface settings; toggling master off then on restores each surface's own state untouched.
- **Asset list — two-line row, expandable third region** (ruling on the PM's 2-vs-3-line question: keep the list scannable, put the dense controls behind expand):
  - Line 1: name · point/face count · size · ℹ import notes · ✕ remove (confirm).
  - Line 2: icon toggles, swap-style like the current show/hide (dulled + slash when off): show/hide · faces · edges · breaklines · vertices · labels · color swatch. Active surface indicated by accent edge on the row; click row body to activate.
  - Expanded (chevron): per-element controls — color + opacity per element (faces/edges/breaklines/vertices/labels) · **vertex display size** (ruling: lives here in the Surface tab; point *symbols* belong to the future Point tab) · mute/reference state override.
- Per-element color/opacity state shape should be serializable — it becomes the backbone of the PM's planned settings-export/import config file (parked, but don't paint it into a corner: one plain-JSON `DisplaySettings` object per surface).

### DXF tab — spec recorded now, built Sprint 4
Quick controls (all on/off, future layer-config popup) · single-line expanding rows: static DXF icon, source name, size, ∨; expanded row hides siblings, fills the tab: header gets element counts + skipped-entity summary (incl. "paper-space entities present: ignored"), then scrolling **layer rows: on/off · name · color · opacity · linetype · lineweight** (inherit everything the file provides; linetype/lineweight render best-effort).

### POINT tab — spec recorded now, built with CSV/extraction work
Search + filter dropdowns · expanding rows per point source (type icon: surface-vertices / dxf-extracted / csv / created / captured) · expanded: min/max elevation, extent, unique codes, scrolling point rows (#, X, Y, Z, desc, show/hide, delete). PM's Civil3D point-group display-priority model is the parked design direction for display control here.

## Phase 4 — Right panel = **Tool & Analytic Control Center**

- **Top: active-surface pill** — shows active surface name; click = dropdown listing surfaces (second way to switch active, synced with left-panel selection).
- **Edit Surface section** — header + "Enter edit mode" button (disabled, tooltip "Sprint 6") + placeholder tool-cube grid (move-point cube first, ghosted). Establishes the geometry of the edit UI without function.
- **Export section** pinned at panel bottom — placeholder ("Export — Sprint 7").
- Everything else stays out. Empty middle is fine; it's reserved analytics room.

## Phase 5 — Multi-surface behaviors (original S3 core)

- Multiple surfaces coexist; exactly one active. Switching is instant (left row click or right pill).
- Non-active surfaces default **muted** (desaturate + 0.4 opacity) with per-surface override in the expanded row.
- Per-surface and per-element display settings independent and persistent in-session.
- Visual-overlap comparison demo: load the Carlson sample twice (second copy renamed), offset one's color, confirm overlap reading is practical.

## Phase 6 — Labels v1

troika-three-text vertex elevation labels per `04` §3: pooled instances, frustum + distance culling, hard cap (~500 visible), auto-off above cap with a status-bar note ("Labels paused — too many vertices in view"). Toggle per surface (line-2 icon). Verify on Carlson sample; verify auto-off on `?testmesh`.

## Phase 7 — Acceptance walkthrough

- [ ] Header shows only title + About/Privacy/Contact; no File/View/Tools anywhere
- [ ] Panel math: closed/closed full-bleed; one open 50/50; both open thirds; chevrons live in panel tops; slim reopen tabs when closed
- [ ] Exaggeration slider works live; cursor Z still reads true elevation while exaggerated
- [ ] Sun sliders visibly change relief shading; north gizmo tracks camera; click-N snaps top/north-up
- [ ] Zoom: full extents → single triangle → back, smooth, no lock-up (PM's repro case)
- [ ] Hover on PM's large dataset no longer hitches with camera in motion (or residual documented in NOTES.md)
- [ ] Two surfaces loaded: active switching from both panels, muting default + override, per-element color/opacity, master quick-toggles restore individual states
- [ ] Labels: on for sample, auto-off on 1M testmesh with status note
- [ ] All Sprint 2 functionality still works (import dialog, notes, toggles, faceless/two-surface fixtures)

## Answers to PM's open DXF questions (for the record; Sprint 4 implements)

- **Off-surface elements:** vertices that miss the surface keep last-known Z, are counted in the import report, and render in a visually distinct *dimmed/dashed* style so "this part isn't really on the ground" is legible at a glance.
- **Drape target model:** a DXF stores its source XY permanently; the drape is *computed against one chosen target surface* (default: active surface at import). Re-draping against a different surface is a recompute on demand — so per-surface independent drapes are a cache/UX question later, not an architecture change.
- **Blocks/hatching:** the importer explodes INSERTs through their transforms for draping (your exploded DXF makes a perfect A/B fixture); hatching renders as its boundary linework first — hatch *fill* on faces is parked with the visual-polish ideas.

## Definition of done
Working app at every phase boundary; NOTES.md with deviations + lag-triage findings; README updated; PM runs the Phase 7 walkthrough.
