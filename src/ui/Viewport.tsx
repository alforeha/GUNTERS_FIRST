import { useEffect, useRef, useState } from 'react';
import { ViewerEngine, generateTestMesh } from '../viewer';
import { useAppStore } from '../state/store';
import { engineHolder } from './engineHolder';
import { addSurfaceToScene, getPdfSourceFile } from './importController';
import {
  clearEditSelection,
  commitVertexEdit,
  exitEditMode,
  finishSingleActionEdit,
  setEditTool,
  undoEdit,
} from './importController';
import { PdfScene } from './PdfScene';
import styles from './App.module.css';

function readTestMeshParam(): number | null {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('testmesh')) return null;
  const raw = params.get('testmesh');
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 4 ? Math.floor(n) : 1_000_000;
}

function EmptyState() {
  return (
    <div className={styles.emptyState}>
      <svg className={styles.emptyGlyph} width="72" height="60" viewBox="0 0 72 60" fill="none">
        <path
          d="M4 52 L24 14 L40 38 L56 8 L68 52 Z M24 14 L40 38 M40 38 L4 52 M56 8 L40 38"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      <div>Drop a LandXML or DXF file</div>
    </div>
  );
}

const TOOLBAR_TOOLS = [
  { id: 'addPoint', label: 'Add Point', enabled: false },
  { id: 'editPoint', label: 'Edit Point', enabled: true },
  { id: 'swapEdge', label: 'Swap Edge', enabled: true },
  { id: 'removeFence', label: 'Remove by Fence', enabled: false },
  { id: 'tagBreakline', label: 'Tag Breakline', enabled: false },
  { id: 'untagBreakline', label: 'Untag Breakline', enabled: false },
] as const;

function stepForPrecision(precisionHint: number): number {
  return precisionHint >= 2 ? 0.01 : 0.1;
}

function EditCanvasToolbar() {
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const editTool = useAppStore((s) => s.editTool);
  const showCanvasToolbar = useAppStore((s) => s.showCanvasToolbar);
  const activeSurfaceUndoCount = useAppStore((s) =>
    s.editSurfaceHandle ? s.editUndoStack.filter((command) => command.surfaceId === s.editSurfaceHandle).length : 0,
  );
  const editModifiedVertexIds = useAppStore((s) => s.editModifiedVertexIds);

  if (!editSurfaceHandle || !showCanvasToolbar) return null;

  return (
    <div className={styles.canvasToolbar}>
      {TOOLBAR_TOOLS.map((tool) => (
        <button
          key={tool.id}
          type="button"
          className={`${styles.canvasToolBtn} ${editTool === tool.id ? styles.canvasToolBtnActive : ''}`}
          disabled={!tool.enabled}
          title={tool.enabled ? tool.label : `${tool.label} - later sprint`}
          onClick={() => setEditTool(tool.id)}
        >
          {tool.label}
        </button>
      ))}
      <button
        type="button"
        className={styles.canvasToolBtn}
        disabled={activeSurfaceUndoCount === 0}
        onClick={() => undoEdit()}
      >
        Undo
      </button>
      <button
        type="button"
        className={`${styles.canvasToolBtn} ${styles.safeActionBtn}`}
        onClick={() => {
          if (
            editModifiedVertexIds.length === 0 ||
            window.confirm(`${editModifiedVertexIds.length} point(s) modified - exit edit mode?`)
          ) {
            exitEditMode();
          }
        }}
      >
        Exit
      </button>
    </div>
  );
}

function EditCallout() {
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const editSelection = useAppStore((s) => s.editSelection);
  const editDragging = useAppStore((s) => s.editDragging);
  const editMessage = useAppStore((s) => s.editMessage);
  const editTool = useAppStore((s) => s.editTool);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [screen, setScreen] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [offset, setOffset] = useState({ x: 18, y: -18 });
  const [cardDragStart, setCardDragStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [vertexDragActive, setVertexDragActive] = useState(false);
  const [values, setValues] = useState({ e: '', n: '', z: '' });

  useEffect(() => {
    if (!editSelection) {
      setValues({ e: '', n: '', z: '' });
      return;
    }
    setValues({
      e: editSelection.e.toFixed(editSelection.precisionHint),
      n: editSelection.n.toFixed(editSelection.precisionHint),
      z: editSelection.z.toFixed(editSelection.precisionHint),
    });
  }, [editSelection]);

  useEffect(() => {
    if (!editSurfaceHandle || !editSelection) {
      setScreen(null);
      return;
    }
    let raf = 0;
    const tick = () => {
      setScreen(engineHolder.current?.getEditSelectionScreenPosition() ?? null);
      raf = window.requestAnimationFrame(tick);
    };
    tick();
    return () => window.cancelAnimationFrame(raf);
  }, [editSurfaceHandle, editSelection]);

  useEffect(() => {
    if (!cardDragStart) return;
    const onMove = (ev: PointerEvent) => {
      setOffset({
        x: cardDragStart.ox + ev.clientX - cardDragStart.x,
        y: cardDragStart.oy + ev.clientY - cardDragStart.y,
      });
    };
    const onUp = () => setCardDragStart(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [cardDragStart]);

  useEffect(() => {
    if (!vertexDragActive) return;
    const onMove = (ev: PointerEvent) => {
      engineHolder.current?.dragSelectedVertex(ev.clientX, ev.clientY);
    };
    const onUp = () => {
      const command = engineHolder.current?.endSelectedVertexDrag() ?? null;
      if (command) {
        const state = useAppStore.getState();
        state.pushEditCommand(command);
        state.patchEntry(command.surfaceId, { dirty: true });
      }
      setVertexDragActive(false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [vertexDragActive]);

  if (!editSurfaceHandle || !editSelection || !screen?.visible) return null;

  const step = stepForPrecision(editSelection.precisionHint);
  const style = { left: `${screen.x + offset.x}px`, top: `${screen.y + offset.y}px` };
  const cardWidth = cardRef.current?.offsetWidth ?? 240;
  const cardHeight = cardRef.current?.offsetHeight ?? 0;
  const cardLeft = screen.x + offset.x;
  const cardTop = screen.y + offset.y;
  const connectorX = Math.min(Math.max(screen.x, cardLeft), cardLeft + cardWidth);
  const connectorY = Math.min(Math.max(screen.y, cardTop), cardTop + cardHeight);

  const commitAxis = (axis: 'e' | 'n' | 'z', raw: string) => {
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    const current = editSelection;
    commitVertexEdit(
      current.surfaceHandle,
      current.vertexId,
      axis === 'e' ? value : undefined,
      axis === 'n' ? value : undefined,
      axis === 'z' ? value : undefined,
    );
  };

  const nudge = (axis: 'e' | 'n' | 'z', delta: number) => {
    const next = editSelection[axis] + delta;
    const raw = next.toFixed(editSelection.precisionHint);
    setValues((prev) => ({ ...prev, [axis]: raw }));
    commitAxis(axis, raw);
  };

  return (
    <>
      <svg className={styles.calloutConnector} aria-hidden="true">
        <line x1={screen.x} y1={screen.y} x2={connectorX} y2={connectorY} className={styles.calloutConnectorLine} />
      </svg>
      <div className={styles.canvasCallout} style={style} ref={cardRef}>
        <div
          className={styles.canvasCalloutHeader}
          onPointerDown={(ev) =>
            setCardDragStart({ x: ev.clientX, y: ev.clientY, ox: offset.x, oy: offset.y })
          }
        >
          <span>PNT #{editSelection.sourcePointId}</span>
          <button type="button" className={styles.iconBtn} onClick={() => clearEditSelection()}>
            x
          </button>
        </div>
        <div
          className={styles.calloutDragZone}
          onPointerDown={(ev) => {
            const target = ev.target as HTMLElement | null;
            if (!target || target.closest('button, input')) return;
            const started = engineHolder.current?.beginSelectedVertexDrag(ev.clientY) ?? false;
            if (!started) return;
            setVertexDragActive(true);
          }}
        >
          {(['n', 'e', 'z'] as const).map((axis) => (
            <div key={axis} className={styles.calloutRow}>
              <span className={styles.calloutAxis}>{axis.toUpperCase()}</span>
              <button type="button" className={styles.calloutNudge} onClick={() => nudge(axis, -step)}>
                -
              </button>
              <input
                type="number"
                step="any"
                className={styles.calloutInput}
                value={values[axis]}
                onChange={(ev) => setValues((prev) => ({ ...prev, [axis]: ev.target.value }))}
                onBlur={(ev) => commitAxis(axis, ev.target.value)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') ev.currentTarget.blur();
                }}
              />
              <button type="button" className={styles.calloutNudge} onClick={() => nudge(axis, step)}>
                +
              </button>
            </div>
          ))}
        </div>
        <div className={styles.calloutActions}>
          <button
            type="button"
            className={styles.calloutActionBtn}
            onClick={() => {
              if (window.confirm(`Delete point #${editSelection.sourcePointId}?`)) {
                useAppStore.getState().setEditMessage('Delete point is parked for Sprint 6.3+.');
              }
            }}
          >
            Delete
          </button>
          <button type="button" className={styles.calloutActionBtn} onClick={() => setEditTool('editPoint')}>
            Move point
          </button>
        </div>
        <div className={styles.calloutFoot}>
          {editDragging && editTool === 'editPoint'
            ? 'Dragging point live from the callout.'
            : editTool === 'swapEdge'
              ? 'Swap Edge active - click an interior edge.'
              : 'Edit Point active - drag this card body to move the point, or nudge values.'}
        </div>
        {editMessage && <div className={styles.calloutMessage}>{editMessage}</div>}
      </div>
    </>
  );
}

function ViewportHud({
  zoomNormalized,
  onZoomChange,
}: {
  zoomNormalized: number;
  onZoomChange: (normalized: number) => void;
}) {
  const cameraMode = useAppStore((s) => s.cameraMode);
  const hoverArmed = useAppStore((s) => s.hoverArmed);
  const hoverHeight = useAppStore((s) => s.hoverHeight);
  const hoverSpeed = useAppStore((s) => s.hoverSpeed);
  const setHoverHeight = useAppStore((s) => s.setHoverHeight);
  const setHoverSpeed = useAppStore((s) => s.setHoverSpeed);

  return (
    <>
      {hoverArmed && cameraMode !== 'hover' && (
        <div className={styles.hoverHint}>Click the active surface to enter hover mode.</div>
      )}
      <div className={styles.viewportHud}>
        {cameraMode !== 'hover' ? (
          <label className={styles.viewportHudBlock}>
            <span className={styles.viewportHudLabel}>Zoom</span>
            <span className={styles.viewportHudRow}>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(zoomNormalized * 100)}
                onChange={(ev) => onZoomChange(Number(ev.target.value) / 100)}
              />
            </span>
          </label>
        ) : (
          <>
            <label className={styles.viewportHudBlock}>
              <span className={styles.viewportHudLabel}>Hover Height (ft)</span>
              <input
                type="number"
                min={0}
                step={0.1}
                className={styles.viewportHudInput}
                value={hoverHeight}
                onChange={(ev) => {
                  const next = Number(ev.target.value);
                  if (Number.isFinite(next) && next >= 0) setHoverHeight(next);
                }}
              />
            </label>
            <label className={styles.viewportHudBlock}>
              <span className={styles.viewportHudLabel}>Hover Speed</span>
              <input
                type="range"
                min={1}
                max={40}
                step={1}
                value={hoverSpeed}
                onChange={(ev) => {
                  const next = Number(ev.target.value);
                  if (Number.isFinite(next) && next > 0) setHoverSpeed(next);
                }}
              />
              <span className={styles.viewportHudValue}>{hoverSpeed.toFixed(0)}</span>
            </label>
          </>
        )}
      </div>
    </>
  );
}

export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hasContent = useAppStore(
    (s) => s.surfaces.length > 0 || s.dxfs.length > 0 || s.geotiffs.length > 0 || s.pdfSheets.length > 0 || s.pointClouds.length > 0,
  );
  const sceneMode = useAppStore((s) => s.sceneMode);
  const editSurfaceHandle = useAppStore((s) => s.editSurfaceHandle);
  const [zoomNormalized, setZoomNormalized] = useState(0.5);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = new ViewerEngine(container);
    engineHolder.current = engine;
    const store = useAppStore;

    // Re-hydrate PDF sheets from store state into the fresh engine. This covers
    // the StrictMode double-invoke path (effect fires, cleanup nulls engine,
    // re-mounts with new engine) where addPdf calls in importController silently
    // no-oped against engineHolder.current === null.
    const initialState = store.getState();
    initialState.pdfSheets.forEach((sheet, i) => {
      const file = getPdfSourceFile(sheet.fileId);
      if (file) {
        engine.addPdf(sheet, file);
        engine.setPdfRenderOrder(sheet.handle, i);
      }
    });

    engine.onCursorPosition((pos) => store.getState().setCursor(pos));
    engine.onNorthClick(() => store.getState().setCameraMode('top'));
    engine.onLabelStatus((note) => store.getState().setLabelNote(note));
    engine.onZoomChange((normalized) => setZoomNormalized(normalized));
    engine.onEditSelection((selection) => store.getState().setEditSelection(selection));
    engine.onEditDragState((dragging) => store.getState().setEditDragging(dragging));
    engine.onEditMessage((message) => store.getState().setEditMessage(message));
    engine.onEditCommit((command) => {
      const state = store.getState();
      state.pushEditCommand(command);
      state.patchEntry(command.surfaceId, { dirty: true });
      if (!state.showCanvasToolbar) finishSingleActionEdit();
    });

    const unsubMode = store.subscribe(
      (s) => s.cameraMode,
      (mode) => engine.setCameraMode(mode),
    );
    const unsubHoverHeight = store.subscribe(
      (s) => s.hoverHeight,
      (height) => engine.setHoverHeight(height),
    );
    const unsubHoverSpeed = store.subscribe(
      (s) => s.hoverSpeed,
      (speed) => engine.setHoverSpeed(speed),
    );
    const unsubTool = store.subscribe(
      (s) => s.editTool,
      (tool) => engine.setEditTool(tool),
    );

    const onClick = (ev: MouseEvent) => {
      const state = store.getState();
      const target = ev.target as HTMLElement | null;
      if (!state.hoverArmed || state.cameraMode === 'hover') return;
      if (target?.closest('button, input, label, select, textarea')) return;
      if (engine.enterHoverAtPointer(state.hoverHeight)) {
        state.setHoverArmed(false);
        state.setCameraMode('hover');
      }
    };
    container.addEventListener('click', onClick);
    engine.setHoverHeight(store.getState().hoverHeight);
    engine.setHoverSpeed(store.getState().hoverSpeed);

    let timer: number | undefined;
    const vertexTarget = readTestMeshParam();
    if (vertexTarget !== null) {
      engine.onFrameStats((fps) => store.getState().setFps(fps));
      store.getState().setProgress('generating synthetic terrain...');
      timer = window.setTimeout(() => {
        if (engine.isDisposed) return;
        const model = generateTestMesh(vertexTarget);
        addSurfaceToScene(model, model.meta.fileName);
        const st = store.getState();
        st.setUnits('US Survey Ft');
        st.openPanels();
        st.setProgress(null);
      }, 30);
    }

    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      unsubMode();
      unsubHoverHeight();
      unsubHoverSpeed();
      unsubTool();
      container.removeEventListener('click', onClick);
      engineHolder.current = null;
      engine.dispose();
    };
  }, []);

  return (
    <div className={`${styles.viewport} ${editSurfaceHandle ? styles.viewportEdit : ''}`} ref={containerRef}>
      {sceneMode === 'pdf2d' ? (
        <PdfScene />
      ) : (
        <>
          {!hasContent && <EmptyState />}
          <ViewportHud
            zoomNormalized={zoomNormalized}
            onZoomChange={(normalized) => engineHolder.current?.setZoomNormalized(normalized)}
          />
          <EditCanvasToolbar />
          <EditCallout />
        </>
      )}
    </div>
  );
}
