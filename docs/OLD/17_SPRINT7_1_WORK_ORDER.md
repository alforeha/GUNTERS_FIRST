# Sprint 7.1 Work Order — Fix Export Button Placement

**Single agent. Small, surgical. No git — work in files.** Read `10_SPRINT7_WORK_ORDER.md` and `NOTES.md`'s Sprint 7 section for context on `beginSurfaceExport`, `exportJob`, and `ExportDialog.tsx`.

**Problem (confirmed in code, 2026-06-15):** Sprint 7 wired `beginSurfaceExport(handle)` (in `src/ui/importController.ts`, ~line 363) so it only works for surface handles — it does `state.surfaces.find(...)` and `engineHolder.current?.getSurfaceModel(handle)`, both of which are surface-only lookups. But it was never called from a surface row. Instead:

1. `src/ui/LeftPanel.tsx`'s `SurfaceRow` (~line 459-523) has NO export button at all — only a notes icon (conditional) and a Remove (✕) button.
2. `src/ui/LeftPanel.tsx`'s `DxfRow` (~line 290-360) has **two duplicate "EX" buttons** (lines ~331-342 and ~343-354), both calling `beginSurfaceExport(entry.handle)` — but `entry` here is a `DxfEntry`, not a surface. This is a copy-paste artifact; calling it on a DXF handle will silently no-op (the `state.surfaces.find` lookup fails) or worse.
3. `src/ui/RightPanel.tsx` (~line 167-170) still shows the Sprint-6-era placeholder:
   ```tsx
   <div className={styles.exportSection}>
     <h2 className={styles.panelTitle}>Export</h2>
     <p className={styles.stubNote}>Export - Sprint 7</p>
   </div>
   ```
   This was never replaced when Sprint 7 shipped.

PM's requirement, stated plainly: **the export button belongs in the RIGHT panel** (Tool & Analytic Control Center), operating on the **active surface** — not in the left panel's surface/DXF list rows.

---

## Fix 1 — Remove the bogus DxfRow export buttons

In `src/ui/LeftPanel.tsx`, `DxfRow` (~line 290-360): delete **both** "EX" buttons (lines ~331-342 and ~343-354) entirely. DXF entries are never LandXML-exportable; this was a copy/paste mistake. Leave the visibility toggle (👁), conditional notes (ℹ), and Remove (✕) buttons as-is.

## Fix 2 — Replace the RightPanel placeholder with a real Export button

In `src/ui/RightPanel.tsx`, replace the stub block (~line 167-170):

```tsx
<div className={styles.exportSection}>
  <h2 className={styles.panelTitle}>Export</h2>
  <p className={styles.stubNote}>Export - Sprint 7</p>
</div>
```

with a working export trigger for the **active surface**:

```tsx
<div className={styles.exportSection}>
  <h2 className={styles.panelTitle}>Export</h2>
  <button
    type="button"
    className={styles.actionBtn}
    disabled={!active}
    title={active ? `Export ${active.name} to LandXML` : 'Select a surface to export'}
    onClick={() => active && beginSurfaceExport(active.handle)}
  >
    Export to LandXML
  </button>
</div>
```

- `active` is already defined in `RightPanel.tsx` (~line 52: `const active = surfaces.find((s) => s.handle === activeHandle) ?? null;`) — reuse it, don't redefine.
- Import `beginSurfaceExport` from `./importController` (add to the existing import on line 3, alongside `enterEditMode`, `exitEditMode`, etc.).
- Disable while `editSurfaceHandle` is set if `beginSurfaceExport`/`ExportDialog` can't sensibly run mid-edit-session — check `ExportDialog.tsx` and `confirmSurfaceExport` for any assumption about edit mode being inactive; if none, no extra guard needed. Document whichever you find in NOTES.md.
- Button styling: reuse `styles.actionBtn` (already used elsewhere in this panel) for visual consistency — don't invent a new class unless `actionBtn` looks wrong here, in which case pick the closest existing button style.

## Fix 3 — Verify ExportDialog still renders correctly from this entry point

`beginSurfaceExport` sets `exportJob` in the store, which (per Sprint 7) should cause `ExportDialog.tsx` to render its findings modal. Confirm the dialog still opens correctly when triggered from the right panel (it was presumably only tested from the left-panel paths before). No changes expected here — just verify.

---

## Out of scope

- Any change to `beginSurfaceExport`, `confirmSurfaceExport`, `writeLandXML`, or `ExportDialog.tsx` internals — these are correct per Sprint 7 and untouched.
- Sprint 6.x edit-tool behavior — untouched, already PM-approved as working as intended.
- Everything in `11_DECISIONS_LOG.md`'s parked backlog.

## Exit criteria

Right panel shows a working "Export to LandXML" button (replacing the old placeholder) that operates on the currently active surface and opens `ExportDialog.tsx`. Left panel's DXF rows no longer show any "EX"/export buttons. Left panel's surface rows are unchanged (no export button added there — PM wants it in the right panel only). Typecheck/lint/full test suite green; update/add a test asserting the right-panel export button calls `beginSurfaceExport` with the active surface's handle and is disabled when there's no active surface.

## Deliverables

- Updated `NOTES.md`: short Sprint 7.1 section noting the two bugs fixed and where the export button now lives.
- Full test suite green.
