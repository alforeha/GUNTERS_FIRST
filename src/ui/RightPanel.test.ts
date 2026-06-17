import { beforeEach, describe, expect, it, vi } from 'vitest';

const { beginSurfaceExport } = vi.hoisted(() => ({
  beginSurfaceExport: vi.fn(),
}));

vi.mock('./importController', () => ({
  beginSurfaceExport,
  enqueueFiles: vi.fn(),
  enterEditMode: vi.fn(),
  exitEditMode: vi.fn(),
  patchDxfLayerDisplay: vi.fn(),
  redrapeDxf: vi.fn(),
  removeDxf: vi.fn(),
  removeGeotiff: vi.fn(),
  setActiveSurface: vi.fn(),
  setDxfVisible: vi.fn(),
  setDxfDensify: vi.fn(),
  setExaggeration: vi.fn(),
  setGeotiffOpacity: vi.fn(),
  setGeotiffTarget: vi.fn(),
  setGeotiffVisible: vi.fn(),
  setSun: vi.fn(),
  triggerSingleEditTool: vi.fn(),
  undoEdit: vi.fn(),
}));

import { buildSurfaceExportAction } from './RightPanel';

describe('buildSurfaceExportAction', () => {
  beforeEach(() => {
    beginSurfaceExport.mockReset();
  });

  it('calls beginSurfaceExport with the active surface handle', () => {
    const action = buildSurfaceExportAction({ handle: 's7', name: 'Surface 7' });
    expect(action.disabled).toBe(false);
    expect(action.title).toBe('Export Surface 7 to LandXML');

    action.onClick();

    expect(beginSurfaceExport).toHaveBeenCalledWith('s7');
  });

  it('is disabled when there is no active surface', () => {
    const action = buildSurfaceExportAction(null);
    expect(action.disabled).toBe(true);
    expect(action.title).toBe('Select a surface to export');

    action.onClick();

    expect(beginSurfaceExport).not.toHaveBeenCalled();
  });
});
