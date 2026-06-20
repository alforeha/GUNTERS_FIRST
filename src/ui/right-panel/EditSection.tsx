import { useAppStore } from '../../state/store';
import {
  enterEditMode,
  exitEditMode,
  triggerSingleEditTool,
  undoEdit,
} from '../importController';
import styles from '../App.module.css';

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

export function EditSection() {
  const surfaces = useAppStore((s) => s.surfaces);
  const activeHandle = useAppStore((s) => s.activeHandle);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const editTool = useAppStore((s) => s.editTool);
  const showCanvasToolbar = useAppStore((s) => s.showCanvasToolbar);
  const editUndoStack = useAppStore((s) => s.editUndoStack);
  const editModifiedVertexIds = useAppStore((s) => s.editModifiedVertexIds);

  const active = surfaces.find((surface) => surface.handle === activeHandle) ?? null;

  return (
    <>
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
    </>
  );
}
