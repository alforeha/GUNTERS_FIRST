import { useState } from 'react';
import {
  type ManagerTableProps,
  type ManagerLayerDef,
  type ManagerElementDef,
  type ManagerColumn,
  type ManagerCellContext,
} from './shared';
import styles from '../App.module.css';

function LayerRow<TElem>({
  layer,
  columns,
  expanded,
  onToggleExpand,
  callbacks,
}: {
  layer: ManagerLayerDef<TElem>;
  columns: ManagerColumn<TElem>[];
  expanded: boolean;
  onToggleExpand: () => void;
  callbacks: ManagerTableProps<TElem>['callbacks'];
}) {
  return (
    <>
      <div
        className={styles.drapeFlatRow}
        style={{
          padding: '4px 6px',
          cursor: 'pointer',
          background: 'var(--bg-inset)',
          borderRadius: 4,
          marginBottom: 2,
        }}
        onClick={(ev) => {
          const tag = (ev.target as HTMLElement).tagName;
          if (tag !== 'BUTTON' && tag !== 'INPUT' && tag !== 'SELECT') {
            onToggleExpand();
          }
        }}
      >
        <button
          type="button"
          className={`${styles.typePill} ${styles.typePillPdf} ${layer.visible ? '' : styles.typePillOff}`}
          onClick={() => callbacks.onToggleLayerVisible(layer.id, !layer.visible)}
          title={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
        >
          {expanded ? '\u25BE ' : '\u25B8 '}{layer.name}
        </button>
        <input
          type="color"
          value={layer.layerColor}
          onChange={(ev) => callbacks.onSetLayerColor(layer.id, ev.target.value)}
          title={`Layer color: ${layer.layerColor}`}
          style={{ width: 22, height: 18, padding: 0, border: 'none', borderRadius: 3, cursor: 'pointer', flex: 'none' }}
        />
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={layer.layerOpacity}
          onChange={(ev) => callbacks.onSetLayerOpacity(layer.id, Number(ev.target.value))}
          title={`Layer transparency: ${Math.round(layer.layerOpacity * 100)}%`}
          style={{ width: 48, margin: 0, flex: 'none' }}
        />
      </div>
      {expanded && layer.elements.length > 0 && (
        <div style={{ paddingLeft: 12, borderLeft: `2px solid ${layer.visible ? layer.layerColor : 'var(--border)'}`, marginLeft: 10 }}>
          {layer.elements.map((el) => (
            <ElementRow<TElem>
              key={el.id}
              element={el}
              layer={layer}
              columns={columns}
            />
          ))}
        </div>
      )}
    </>
  );
}

function ElementRow<TElem>({
  element,
  layer,
  columns,
}: {
  element: ManagerElementDef<TElem>;
  layer: ManagerLayerDef<TElem>;
  columns: ManagerColumn<TElem>[];
}) {
  const ctx: ManagerCellContext<TElem> = {
    layerId: layer.id,
    elementId: element.id,
    name: element.name,
    mode: element.mode,
    layerColor: layer.layerColor,
    layerOpacity: layer.layerOpacity,
    layerVisible: layer.visible,
    disabled: element.disabled,
    disabledReason: element.disabledReason,
    data: element.data,
  };

  return (
    <div
      className={styles.layerRow}
      style={{
        opacity: element.disabled ? 0.45 : 1,
        background: 'var(--bg-inset)',
        borderRadius: 4,
        marginBottom: 2,
        padding: '4px 6px',
      }}
    >
      {columns.map((col) => (
        <div
          key={col.key}
          style={col.width ? { width: col.width, flex: 'none' } : { flex: 1, minWidth: 0 }}
        >
          {col.render(ctx)}
        </div>
      ))}
    </div>
  );
}

export function ManagerTable<TElem = unknown>({
  layers,
  columns,
  callbacks,
}: ManagerTableProps<TElem>) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const layer of layers) init[layer.id] = true;
    return init;
  });

  const toggleExpand = (layerId: string) => {
    setExpanded((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  return (
    <div className={styles.section}>
      <h2 className={styles.panelTitle}>Markup Manager</h2>
      {layers.map((layer) => (
        <LayerRow<TElem>
          key={layer.id}
          layer={layer}
          columns={columns}
          expanded={!!expanded[layer.id]}
          onToggleExpand={() => toggleExpand(layer.id)}
          callbacks={callbacks}
        />
      ))}
    </div>
  );
}
