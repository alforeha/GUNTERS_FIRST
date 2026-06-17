import { beforeEach, describe, expect, it } from 'vitest';
import { defaultDisplaySettings, useAppStore, type GeotiffEntry } from './store';

function geotiffEntry(handle: string): GeotiffEntry {
  return {
    handle,
    name: `${handle}.tif`,
    sizeBytes: null,
    width: 100,
    height: 100,
    samplesPerPixel: 3,
    crsText: null,
    pixelScale: null,
    worldBounds: null,
    drapeTarget: null,
    visible: true,
    opacity: 1,
  };
}

describe('edit-mode store flow', () => {
  beforeEach(() => {
    useAppStore.setState({
      surfaces: [
        {
          handle: 's1',
          name: 'Surface 1',
          points: 4,
          faces: 2,
          breaklines: 0,
          boundariesDefined: 0,
          holes: 0,
          hasFaces: true,
          sizeBytes: null,
          dirty: false,
          display: defaultDisplaySettings(true),
        },
        {
          handle: 's2',
          name: 'Surface 2',
          points: 4,
          faces: 2,
          breaklines: 0,
          boundariesDefined: 0,
          holes: 0,
          hasFaces: true,
          sizeBytes: null,
          dirty: false,
          display: defaultDisplaySettings(true),
        },
      ],
      dxfs: [],
      geotiffs: [],
      geotiffGroups: [],
      activeHandle: 's1',
      editSurfaceHandle: null,
      editSelection: null,
      editUndoStack: [],
      editModifiedVertexIds: [],
      editMessage: null,
      editDragging: false,
      showCanvasToolbar: false,
      editPanelSnapshot: null,
    });
  });

  it('tracks undo stack and modified vertices for later multi-level expansion', () => {
    const state = useAppStore.getState();
    state.enterEditMode('s1');
    state.pushEditCommand({
      type: 'moveVertex',
      surfaceId: 's1',
      vertexId: 2,
      oldXYZ: [10, 20, 30],
      newXYZ: [10, 20, 31],
    });
    state.pushEditCommand({
      type: 'moveVertex',
      surfaceId: 's1',
      vertexId: 2,
      oldXYZ: [10, 20, 31],
      newXYZ: [10, 20, 32],
    });

    expect(useAppStore.getState().editUndoStack).toHaveLength(2);
    expect(useAppStore.getState().editModifiedVertexIds).toEqual([2]);

    const popped = useAppStore.getState().popEditCommand();
    expect(popped?.newXYZ?.[2]).toBe(32);
    expect(useAppStore.getState().editUndoStack).toHaveLength(1);
  });

  it('keeps dirty history through undo and preserves it across exit and re-entry', () => {
    const state = useAppStore.getState();
    state.enterEditMode('s1');
    state.patchEntry('s1', { dirty: true });
    state.pushEditCommand({
      type: 'moveVertex',
      surfaceId: 's1',
      vertexId: 1,
      oldXYZ: [0, 0, 0],
      newXYZ: [0, 0, 1],
    });
    state.popEditCommand();
    state.exitEditMode();
    state.enterEditMode('s1');

    expect(useAppStore.getState().surfaces[0]?.dirty).toBe(true);
    expect(useAppStore.getState().editSurfaceHandle).toBe('s1');
    expect(useAppStore.getState().editUndoStack).toHaveLength(0);
    expect(useAppStore.getState().editModifiedVertexIds).toHaveLength(0);
  });

  it('keeps edit history for the same surface after exiting edit mode', () => {
    const state = useAppStore.getState();
    state.enterEditMode('s1');
    state.pushEditCommand({
      type: 'moveVertex',
      surfaceId: 's1',
      vertexId: 3,
      oldXYZ: [4, 5, 6],
      newXYZ: [4, 5, 7],
    });
    state.exitEditMode();
    state.enterEditMode('s1');

    expect(useAppStore.getState().editUndoStack).toHaveLength(1);
    expect(useAppStore.getState().editModifiedVertexIds).toEqual([3]);
  });

  it('pops undo commands from the active edit surface only', () => {
    const state = useAppStore.getState();
    state.pushEditCommand({
      type: 'swapEdge',
      surfaceId: 's2',
      edgeVertices: [0, 2],
      beforeIndices: [0, 1, 2, 0, 2, 3],
      afterIndices: [1, 3, 0, 3, 1, 2],
    });
    state.pushEditCommand({
      type: 'moveVertex',
      surfaceId: 's1',
      vertexId: 7,
      oldXYZ: [1, 2, 3],
      newXYZ: [1, 2, 4],
    });
    state.enterEditMode('s1');

    const popped = state.popEditCommandForSurface('s1');

    expect(popped?.surfaceId).toBe('s1');
    expect(popped?.type).toBe('moveVertex');
    expect(useAppStore.getState().editUndoStack).toHaveLength(1);
    expect(useAppStore.getState().editUndoStack[0]?.surfaceId).toBe('s2');
    expect(useAppStore.getState().editModifiedVertexIds).toEqual([]);
  });

  it('tracks canvas-toolbar visibility separately from editTool', () => {
    const state = useAppStore.getState();
    state.setShowCanvasToolbar(true);
    state.enterEditMode('s1');
    state.setEditTool('swapEdge');
    state.setShowCanvasToolbar(false);

    expect(useAppStore.getState().editSurfaceHandle).toBe('s1');
    expect(useAppStore.getState().editTool).toBe('swapEdge');
    expect(useAppStore.getState().showCanvasToolbar).toBe(false);

    state.exitEditMode();
    expect(useAppStore.getState().showCanvasToolbar).toBe(false);
    expect(useAppStore.getState().editTool).toBe('editPoint');
  });
});

describe('geotiff group store flow', () => {
  beforeEach(() => {
    useAppStore.setState({
      surfaces: [],
      dxfs: [],
      geotiffs: [geotiffEntry('g1'), geotiffEntry('g2'), geotiffEntry('g3')],
      geotiffGroups: [],
      importNotes: {},
      notesHandle: null,
    });
  });

  it('stores and dissolves GeoTIFF groups without removing member entries', () => {
    const state = useAppStore.getState();
    state.addGeotiffGroup({
      id: 'group-1',
      name: 'Mosaic 1',
      handles: ['g1', 'g2'],
      visible: true,
      opacity: 0.8,
      drapeTarget: 's1',
    });

    expect(useAppStore.getState().geotiffGroups).toHaveLength(1);

    state.removeGeotiffGroup('group-1');

    expect(useAppStore.getState().geotiffGroups).toHaveLength(0);
    expect(useAppStore.getState().geotiffs.map((entry) => entry.handle)).toEqual(['g1', 'g2', 'g3']);
  });

  it('dissolves groups when deleted GeoTIFF handles leave fewer than two members', () => {
    const state = useAppStore.getState();
    state.addGeotiffGroup({
      id: 'group-1',
      name: 'Mosaic 1',
      handles: ['g1', 'g2'],
      visible: true,
      opacity: 1,
      drapeTarget: null,
    });

    state.removeGeotiffEntry('g1');

    expect(useAppStore.getState().geotiffGroups).toHaveLength(0);
  });
});
