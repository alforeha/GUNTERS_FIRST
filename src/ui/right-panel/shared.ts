import type { ReactNode } from 'react';

/** Context passed to each column render function for an element sub-row. */
export interface ManagerCellContext<TElem = unknown> {
  layerId: string;
  elementId: string;
  name: string;
  mode: 'by-layer' | 'set-own';
  layerColor: string;
  layerOpacity: number;
  layerVisible: boolean;
  disabled: boolean;
  disabledReason?: string;
  data: TElem;
}

/** A column definition. key must be unique within a table instance.
 *  render receives the cell context; the column is purely presentational. */
export interface ManagerColumn<TElem = unknown> {
  key: string;
  header: string;
  width?: string;
  render: (ctx: ManagerCellContext<TElem>) => ReactNode;
}

/** One element sub-row's static definition per render. */
export interface ManagerElementDef<TElem = unknown> {
  id: string;
  name: string;
  mode: 'by-layer' | 'set-own';
  disabled: boolean;
  disabledReason?: string;
  data: TElem;
}

/** One layer / collapsible section. */
export interface ManagerLayerDef<TElem = unknown> {
  id: string;
  name: string;
  visible: boolean;
  layerColor: string;
  layerOpacity: number;
  elements: ManagerElementDef<TElem>[];
}

/** Callbacks the ManagerTable calls. The consumer wires these to store/engine. */
export interface ManagerTableCallbacks {
  onToggleLayerVisible: (layerId: string, visible: boolean) => void;
  onSetLayerColor: (layerId: string, color: string) => void;
  onSetLayerOpacity: (layerId: string, opacity: number) => void;
  onToggleElementVisible: (layerId: string, elementId: string, visible: boolean) => void;
  onSetElementMode: (layerId: string, elementId: string, mode: 'by-layer' | 'set-own') => void;
}

/** Props for the reusable ManagerTable. */
export interface ManagerTableProps<TElem = unknown> {
  layers: ManagerLayerDef<TElem>[];
  columns: ManagerColumn<TElem>[];
  callbacks: ManagerTableCallbacks;
}
