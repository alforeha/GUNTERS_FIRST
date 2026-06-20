import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../state/store';
import { returnToWorldScene, setScaleBar, setNorthArrow } from '../importController';
import { ManagerTable } from './ManagerTable';
import type { ManagerTableProps, ManagerLayerDef, ManagerElementDef, ManagerColumn, ManagerCellContext } from './shared';
import styles from '../App.module.css';

interface PdfElementData {
  ownVisible: boolean;
  ownColor: string;
  opacity: number;
}

type Ctx = ManagerCellContext<PdfElementData>;

export function PdfSingleView() {
  const handle = useAppStore((s) => s.activeSceneObjectHandle);
  const kind = useAppStore((s) => s.activePdfSceneKind);
  const sheet = useAppStore((s) => s.pdfSheets.find((sh) => sh.handle === handle) ?? null);
  const patchPdfSheet = useAppStore((s) => s.patchPdfSheet);

  const [layerVisible, setLayerVisible] = useState(true);
  const [layerColor, setLayerColor] = useState(sheet?.markupColor ?? '#d4380d');
  const [layerOpacity, setLayerOpacity] = useState(sheet?.markupOpacity ?? 1);

  // Track which elements have had their color manually customized
  const [customColors, setCustomColors] = useState<Record<string, boolean>>({});

  const scaleBar = sheet?.scaleBar ?? null;
  const northArrow = sheet?.northArrow ?? null;

  // One-time mount sync: push layer color to elements, then track via customColors
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!sheet || mountedRef.current) return;
    mountedRef.current = true;
    if (scaleBar && !customColors['scale']) {
      setScaleBar(sheet.handle, { ...scaleBar, color: layerColor });
    }
    if (northArrow && !customColors['north']) {
      setNorthArrow(sheet.handle, { ...northArrow, color: layerColor });
    }
  }, [sheet, scaleBar, northArrow, layerColor, customColors]);

  const callbacks = useMemo((): ManagerTableProps<PdfElementData>['callbacks'] => ({
    onToggleLayerVisible: (_layerId, visible) => setLayerVisible(visible),
    onSetLayerColor: (_layerId, color) => {
      setLayerColor(color);
      if (!sheet) return;
      patchPdfSheet(sheet.handle, { markupColor: color } as any);
      if (scaleBar && !customColors['scale']) setScaleBar(sheet.handle, { ...scaleBar, color });
      if (northArrow && !customColors['north']) setNorthArrow(sheet.handle, { ...northArrow, color });
    },
    onSetLayerOpacity: (_layerId, opacity) => {
      setLayerOpacity(opacity);
      if (sheet) patchPdfSheet(sheet.handle, { markupOpacity: opacity } as any);
    },
    onToggleElementVisible: (_layerId, elementId, _visible) => {
      if (!sheet) return;
      if (elementId === 'scale' && scaleBar) {
        setScaleBar(sheet.handle, { ...scaleBar, visible: !scaleBar.visible });
      } else if (elementId === 'north' && northArrow) {
        setNorthArrow(sheet.handle, { ...northArrow, visible: !northArrow.visible });
      }
    },
    onSetElementMode: () => {},
  }), [sheet, scaleBar, northArrow, layerColor, layerOpacity, patchPdfSheet, customColors]);

  const columns = useMemo((): ManagerColumn<PdfElementData>[] => [
    {
      key: 'name',
      header: '',
      width: undefined,
      render: (ctx: Ctx) => {
        if (ctx.disabled) {
          return (
            <span className={styles.layerName} title={ctx.disabledReason ?? ctx.name} style={{ color: 'var(--text-dim)' }}>
              {ctx.name}
            </span>
          );
        }
        const vis = ctx.data.ownVisible;
        return (
          <button
            type="button"
            className={`${styles.typePill} ${styles.typePillPdf} ${vis ? '' : styles.typePillOff}`}
            onClick={() => callbacks.onToggleElementVisible(ctx.layerId, ctx.elementId, !vis)}
            title={vis ? `Hide ${ctx.name}` : `Show ${ctx.name}`}
          >
            {ctx.name}
          </button>
        );
      },
    },
    {
      key: 'color',
      header: '',
      width: '56px',
      render: (ctx: Ctx) => {
        if (ctx.disabled) {
          return <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 3, background: layerColor, opacity: 0.3 }} title={ctx.disabledReason ?? 'Not available'} />;
        }
        const color = ctx.data.ownColor;
        const differs = color !== layerColor;
        return (
          <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <input
              type="color"
              value={color}
              onChange={(ev) => {
                setCustomColors((prev) => ({ ...prev, [ctx.elementId]: true }));
                if (ctx.elementId === 'scale' && scaleBar) {
                  setScaleBar(sheet!.handle, { ...scaleBar, color: ev.target.value });
                } else if (ctx.elementId === 'north' && northArrow) {
                  setNorthArrow(sheet!.handle, { ...northArrow, color: ev.target.value });
                }
              }}
              title={`${ctx.name} color: ${color}`}
              style={{ width: 22, height: 18, padding: 0, border: 'none', borderRadius: 3, cursor: 'pointer' }}
            />
            {differs && (
              <button
                type="button"
                className={styles.elemChip}
                style={{ width: 18, height: 18, padding: 0, fontSize: 9, fontWeight: 700, minWidth: 0 }}
                title={`Reset ${ctx.name} to layer color ${layerColor}`}
                onClick={() => {
                  setCustomColors((prev) => { const next = { ...prev }; delete next[ctx.elementId]; return next; });
                  if (ctx.elementId === 'scale' && scaleBar) {
                    setScaleBar(sheet!.handle, { ...scaleBar, color: layerColor });
                  } else if (ctx.elementId === 'north' && northArrow) {
                    setNorthArrow(sheet!.handle, { ...northArrow, color: layerColor });
                  }
                }}
              >
                L
              </button>
            )}
          </span>
        );
      },
    },
    {
      key: 'opacity',
      header: '',
      width: '66px',
      render: (ctx: Ctx) => (
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={ctx.data.opacity}
          disabled
          title={ctx.disabled ? ctx.disabledReason ?? 'Not available' : 'Opacity control — coming in a later phase'}
          style={{ width: 52, margin: 0, opacity: 0.4 }}
        />
      ),
    },
  ], [callbacks, sheet, scaleBar, northArrow, layerColor]);

  const elements = useMemo((): ManagerElementDef<PdfElementData>[] => [
    {
      id: 'edge',
      name: 'Edge',
      mode: 'set-own',
      disabled: true,
      disabledReason: 'not configured',
      data: { ownVisible: false, ownColor: layerColor, opacity: 1 },
    },
    {
      id: 'scale',
      name: 'Scale',
      mode: 'set-own',
      disabled: !scaleBar,
      disabledReason: scaleBar ? undefined : 'not set',
      data: { ownVisible: scaleBar?.visible ?? true, ownColor: scaleBar?.color ?? layerColor, opacity: 1 },
    },
    {
      id: 'north',
      name: 'North',
      mode: 'set-own',
      disabled: !northArrow,
      disabledReason: northArrow ? undefined : 'not set',
      data: { ownVisible: northArrow?.visible ?? true, ownColor: northArrow?.color ?? layerColor, opacity: 1 },
    },
  ], [scaleBar, northArrow, layerColor]);

  const layers = useMemo((): ManagerLayerDef<PdfElementData>[] => [
    {
      id: 'system',
      name: 'System',
      visible: layerVisible,
      layerColor,
      layerOpacity,
      elements,
    },
  ], [layerVisible, layerColor, layerOpacity, elements]);

  const kindLabel = kind === 'orient' ? 'orientation view' : 'calibration view';
  const kindBadge = kind === 'orient' ? 'Orient' : 'Calibrate';

  return (
    <>
      <div className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <h2 className={styles.panelTitle}>PDF Single Page</h2>
          <span className={styles.editBadge}>{kindBadge}</span>
        </div>
        {sheet ? (
          <div className={styles.listRow}>
            <div className={styles.listRowName}>{sheet.label}</div>
            <div className={styles.listRowMeta}>{kindLabel}</div>
            <div className={styles.listRowMeta}>
              {sheet.calibration ? sheet.calibration.label : 'not calibrated'}
            </div>
            <div className={styles.listRowMeta}>
              orientation {sheet.orientation === null ? 'not set' : `${sheet.orientation.toFixed(0)} deg`}
            </div>
          </div>
        ) : (
          <div className={styles.historyEmpty}>No PDF sheet selected.</div>
        )}
        <button type="button" className={styles.actionBtn} onClick={returnToWorldScene}>
          Return to 3D
        </button>
      </div>

      <div className={styles.section}>
        <h2 className={styles.panelTitle}>Markup Tools</h2>
        <div className={styles.historyEmpty}>Markup tools coming soon</div>
      </div>

      <ManagerTable<PdfElementData>
        layers={layers}
        columns={columns}
        callbacks={callbacks}
      />
    </>
  );
}
