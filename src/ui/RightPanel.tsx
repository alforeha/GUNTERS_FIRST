import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../state/store';
import {
  beginSurfaceExport,
  enqueueFiles,
  enterEditMode,
  exitEditMode,
  removeDxf,
  removeGeotiff,
  setActiveSurface,
  setDxfVisible,
  dissolveGeotiffGroup,
  setGeotiffGroupOpacity,
  setGeotiffGroupTarget,
  setGeotiffGroupVisible,
  setGeotiffOpacity,
  setGeotiffTarget,
  setGeotiffVisible,
  triggerSingleEditTool,
  undoEdit,
  redrapeDxf,
  returnToWorldScene,
} from './importController';
import styles from './App.module.css';

const DRAPE_ACCEPT = '.dxf,.tif,.tiff,.geotiff,.pdf,.las,.laz';

const TOOL_CUBES = [
  { id: 'addPoint', label: 'Add Point', glyph: '+', enabled: false },
  { id: 'editPoint', label: 'Move Point', glyph: '<>', enabled: true },
  { id: 'swapEdge', label: 'Swap Edge', glyph: '<>', enabled: true },
  { id: 'removeFence', label: 'Remove Fence', glyph: '[]', enabled: false },
  { id: 'tagBreakline', label: 'Tag Breakline', glyph: 'B+', enabled: false },
  { id: 'untagBreakline', label: 'Untag Breakline', glyph: 'B-', enabled: false },
] as const;

function historyLabel(command: ReturnType<typeof useAppStore.getState>['editUndoStack'][number]): string {
  if (command.type === 'swapEdge') {
    return `Edge ${command.edgeVertices?.[0]}-${command.edgeVertices?.[1]} swapped`;
  }
  const from = command.oldXYZ;
  const to = command.newXYZ;
  if (!from || !to) return 'Edit';
  const axisBits = [
    from[0] !== to[0] ? 'E' : null,
    from[1] !== to[1] ? 'N' : null,
    from[2] !== to[2] ? 'Z' : null,
  ].filter(Boolean);
  return `PNT #${command.sourcePointId ?? command.vertexId} ${axisBits.join('/')} moved`;
}

export function buildSurfaceExportAction(
  active: { handle: string; name: string } | null,
): {
  disabled: boolean;
  title: string;
  onClick: () => void;
} {
  return {
    disabled: !active,
    title: active ? `Export ${active.name} to LandXML` : 'Select a surface to export',
    onClick: () => {
      if (active) beginSurfaceExport(active.handle);
    },
  };
}

export function RightPanel({ sizeClass }: { sizeClass: string }) {
  const open = useAppStore((s) => s.rightOpen);
  const toggleRight = useAppStore((s) => s.toggleRight);
  const surfaces = useAppStore((s) => s.surfaces);
  const sceneMode = useAppStore((s) => s.sceneMode);
  const activePdfSceneKind = useAppStore((s) => s.activePdfSceneKind);
  const activeSceneObjectHandle = useAppStore((s) => s.activeSceneObjectHandle);
  const activePdfSheet = useAppStore((s) => s.pdfSheets.find((sheet) => sheet.handle === activeSceneObjectHandle) ?? null);
  const activePdfGroup = useAppStore((s) => s.pdfGroups.find((group) => group.id === activeSceneObjectHandle) ?? null);
  const activePdfGroupSheetCount = useAppStore((s) =>
    s.pdfGroups.find((group) => group.id === activeSceneObjectHandle)?.sheetIds.length ?? 0,
  );
  const activeHandle = useAppStore((s) => s.activeHandle);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const editTool = useAppStore((s) => s.editTool);
  const showCanvasToolbar = useAppStore((s) => s.showCanvasToolbar);
  const editUndoStack = useAppStore((s) => s.editUndoStack);
  const editModifiedVertexIds = useAppStore((s) => s.editModifiedVertexIds);
  const [pillOpen, setPillOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);
  const drapeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pillOpen) return;
    const close = (ev: PointerEvent) => {
      if (!pillRef.current?.contains(ev.target as Node)) setPillOpen(false);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [pillOpen]);

  const active = surfaces.find((surface) => surface.handle === activeHandle) ?? null;
  const exportAction = buildSurfaceExportAction(active);

  if (sceneMode === 'pdf2d') {
    return (
      <aside className={`${styles.panel} ${styles.panelRight} ${open ? sizeClass : styles.panelCollapsed}`}>
        <div className={styles.panelHeaderRow}>
          <button type="button" className={styles.chevronBtn} onClick={toggleRight} title="Collapse panel">
            {'>'}
          </button>
          <h2 className={styles.panelTitle}>Tool and Analytic Control Center</h2>
        </div>
        <div className={`${styles.panelInner} ${styles.panelInnerColumn}`}>
          <div className={styles.section}>
            <h2 className={styles.panelTitle}>PDF Scene</h2>
            {activePdfGroup ? (
              <div className={styles.listRow}>
                <div className={styles.listRowName}>{activePdfGroup.label}</div>
                <div className={styles.listRowMeta}>{activePdfGroupSheetCount} sheets</div>
                <div className={styles.listRowMeta}>group arrangement view</div>
              </div>
            ) : activePdfSheet ? (
              <div className={styles.listRow}>
                <div className={styles.listRowName}>{activePdfSheet.label}</div>
                <div className={styles.listRowMeta}>{activePdfSceneKind === 'orient' ? 'orientation view' : 'calibration view'}</div>
                <div className={styles.listRowMeta}>
                  {activePdfSheet.calibration ? activePdfSheet.calibration.label : 'not calibrated'}
                </div>
                <div className={styles.listRowMeta}>
                  orientation {activePdfSheet.orientation === null ? 'not set' : `${activePdfSheet.orientation.toFixed(0)} deg`}
                </div>
              </div>
            ) : (
              <div className={styles.historyEmpty}>No PDF sheet selected.</div>
            )}
            <button type="button" className={styles.actionBtn} onClick={returnToWorldScene}>
              Return to 3D
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`${styles.panel} ${styles.panelRight} ${open ? sizeClass : styles.panelCollapsed}`}
    >
      <div className={styles.panelHeaderRow}>
        <button type="button" className={styles.chevronBtn} onClick={toggleRight} title="Collapse panel">
          {'>'}
        </button>
        <h2 className={styles.panelTitle}>Tool and Analytic Control Center</h2>
      </div>
      <div className={`${styles.panelInner} ${styles.panelInnerColumn}`}>
        <div className={styles.pillWrap} ref={pillRef}>
          <button
            type="button"
            className={styles.activePill}
            onClick={() => surfaces.length > 0 && !editSurfaceHandle && setPillOpen((value) => !value)}
            title={editSurfaceHandle ? 'Active surface is locked while editing' : 'Active surface - click to switch'}
          >
            <span className={styles.pillDot} />
            <span className={styles.pillName}>{active ? active.name : 'No active surface'}</span>
            {surfaces.length > 1 && !editSurfaceHandle && <span className={styles.pillCaret}>v</span>}
          </button>
          {pillOpen && (
            <div className={styles.pillDropdown}>
              {surfaces.map((surface) => (
                <button
                  key={surface.handle}
                  type="button"
                  className={`${styles.menuDropdownItem} ${
                    surface.handle === activeHandle ? styles.pillItemActive : ''
                  }`}
                  onClick={() => {
                    setActiveSurface(surface.handle);
                    setPillOpen(false);
                  }}
                >
                  {surface.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {surfaces.length > 0 && (
          <>
            <DrapeSection onOpenImport={() => drapeInputRef.current?.click()} />
            <input
              ref={drapeInputRef}
              type="file"
              accept={DRAPE_ACCEPT}
              multiple
              hidden
              onChange={(ev) => {
                const files = ev.target.files;
                if (files && files.length > 0) enqueueFiles(files);
                ev.target.value = '';
              }}
            />
          </>
        )}

        <div className={styles.section}>
          <div className={styles.editHeaderRow}>
            <h2 className={styles.panelTitle}>Edit Tools</h2>
            {editSurfaceHandle && <span className={styles.editBadge}>EDIT MODE</span>}
          </div>
          <div className={styles.toolGrid}>
            {TOOL_CUBES.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={`${styles.toolCube} ${
                  editSurfaceHandle && !showCanvasToolbar && editTool === tool.id ? styles.toolCubeActive : ''
                }`}
                disabled={!tool.enabled || (!active && !editSurfaceHandle)}
                title={tool.enabled ? tool.label : `${tool.label} - coming in a later sprint`}
                onClick={() => tool.enabled && triggerSingleEditTool(tool.id)}
              >
                <span className={styles.toolGlyph}>{tool.glyph}</span>
                <span className={styles.toolLabel}>{tool.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.editModeToggle} ${editSurfaceHandle ? styles.safeActionBtn : ''}`}
            disabled={!active && !editSurfaceHandle}
            onClick={() => {
              if (editSurfaceHandle) {
                if (
                  editModifiedVertexIds.length === 0 ||
                  window.confirm(`${editModifiedVertexIds.length} point(s) modified - exit edit mode?`)
                ) {
                  exitEditMode();
                }
              } else if (active) {
                enterEditMode(active.handle);
              }
            }}
          >
            {editSurfaceHandle ? 'Edit Mode On' : 'Edit Mode Off'}
          </button>
        </div>

        <div className={styles.section}>
          <div className={styles.editHeaderRow}>
            <h2 className={styles.panelTitle}>Edit History</h2>
            <button
              type="button"
              className={styles.historyUndoBtn}
              disabled={editUndoStack.length === 0}
              onClick={() => undoEdit()}
            >
              Undo
            </button>
          </div>
          <div className={styles.historyList}>
            {editUndoStack.length === 0 ? (
              <div className={styles.historyEmpty}>No edits yet this session.</div>
            ) : (
              [...editUndoStack].reverse().map((command, index) => (
                <div key={`${command.type}-${index}`} className={styles.historyItem}>
                  {historyLabel(command)}
                </div>
              ))
            )}
          </div>
        </div>

        <div className={styles.panelFlexSpacer} />

        <div className={styles.exportSection}>
          <h2 className={styles.panelTitle}>Export</h2>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={exportAction.disabled}
            title={exportAction.title}
            onClick={exportAction.onClick}
          >
            Export to LandXML
          </button>
        </div>
      </div>
    </aside>
  );
}

function DrapeSection({ onOpenImport }: { onOpenImport: () => void }) {
  const surfaces = useAppStore((s) => s.surfaces);
  const dxfs = useAppStore((s) => s.dxfs);
  const geotiffs = useAppStore((s) => s.geotiffs);
  const geotiffGroups = useAppStore((s) => s.geotiffGroups);
  const groupedHandles = new Set(geotiffGroups.flatMap((group) => group.handles));
  const dxfRows = dxfs.filter((entry) => entry.drapeTarget !== null);
  const geotiffRows = geotiffs.filter((entry) => !groupedHandles.has(entry.handle));
  const hasRows = dxfRows.length > 0 || geotiffGroups.length > 0 || geotiffRows.length > 0;

  return (
    <div className={styles.section}>
      <h2 className={styles.panelTitle}>Drape</h2>
      <button
        type="button"
        className={styles.actionBtn}
        onClick={onOpenImport}
      >
        Add drape layer
      </button>
      <div className={styles.drapeList}>
        {!hasRows ? (
          <div className={styles.historyEmpty}>No draped datasets yet.</div>
        ) : (
          <>
            {dxfRows.map((entry) => (
            <div key={entry.handle} className={styles.listRow}>
              <div className={styles.drapeFlatRow}>
                <div className={styles.datasetRowTitleWrap}>
                  <div className={styles.listRowName}>{entry.name}</div>
                  <div className={styles.listRowMeta}>DXF</div>
                </div>
                <button
                  type="button"
                  className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
                  title={entry.visible ? 'Hide dataset' : 'Show dataset'}
                  onClick={() => setDxfVisible(entry.handle, !entry.visible)}
                >
                  Eye
                </button>
                <select
                  className={styles.selectCtl}
                  value={entry.drapeTarget ?? ''}
                  onChange={(ev) => redrapeDxf(entry.handle, ev.target.value || null)}
                >
                  {surfaces.map((surface) => (
                    <option key={surface.handle} value={surface.handle}>
                      {surface.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={styles.iconBtn}
                  title="Remove drape dataset"
                  onClick={() => {
                    if (window.confirm(`Remove "${entry.name}" from the scene?`)) {
                      removeDxf(entry.handle);
                    }
                  }}
                >
                  x
                </button>
              </div>
            </div>
            ))}
            {geotiffGroups.map((group) => (
              <div key={group.id} className={styles.listRow}>
                <div className={styles.drapeFlatRow}>
                  <div className={styles.datasetRowTitleWrap}>
                    <div className={styles.listRowName}>{group.name}</div>
                    <div className={styles.listRowMeta}>{group.handles.length} GeoTIFFs</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.elemChip} ${group.visible ? '' : styles.elemChipOff}`}
                    title={group.visible ? 'Hide group' : 'Show group'}
                    onClick={() => setGeotiffGroupVisible(group.id, !group.visible)}
                  >
                    Eye
                  </button>
                  <select
                    className={styles.selectCtl}
                    value={group.drapeTarget ?? ''}
                    onChange={(ev) => setGeotiffGroupTarget(group.id, ev.target.value || null)}
                  >
                    <option value="">- no target -</option>
                    {surfaces.map((surface) => (
                      <option key={surface.handle} value={surface.handle}>
                        {surface.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={group.opacity}
                    title="GeoTIFF group opacity"
                    onChange={(ev) => setGeotiffGroupOpacity(group.id, Number(ev.target.value))}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Remove group"
                    onClick={() => dissolveGeotiffGroup(group.id)}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
            {geotiffRows.map((entry) => (
              <div key={entry.handle} className={styles.listRow}>
                <div className={styles.drapeFlatRow}>
                  <div className={styles.datasetRowTitleWrap}>
                    <div className={styles.listRowName}>{entry.name}</div>
                    <div className={styles.listRowMeta}>GeoTIFF</div>
                  </div>
                  <button
                    type="button"
                    className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
                    title={entry.visible ? 'Hide dataset' : 'Show dataset'}
                    onClick={() => setGeotiffVisible(entry.handle, !entry.visible)}
                  >
                    Eye
                  </button>
                  <select
                    className={styles.selectCtl}
                    value={entry.drapeTarget ?? ''}
                    onChange={(ev) => setGeotiffTarget(entry.handle, ev.target.value || null)}
                  >
                    <option value="">- no target -</option>
                    {surfaces.map((surface) => (
                      <option key={surface.handle} value={surface.handle}>
                        {surface.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="range"
                    min={0.1}
                    max={1}
                    step={0.05}
                    value={entry.opacity}
                    title="GeoTIFF opacity"
                    onChange={(ev) => setGeotiffOpacity(entry.handle, Number(ev.target.value))}
                  />
                  <button
                    type="button"
                    className={styles.iconBtn}
                    title="Remove drape dataset"
                    onClick={() => {
                      if (window.confirm(`Remove "${entry.name}" from the scene?`)) removeGeotiff(entry.handle);
                    }}
                  >
                    x
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
