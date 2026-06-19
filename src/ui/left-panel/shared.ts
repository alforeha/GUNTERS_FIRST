import type { ElementKind, PointCloudEntry } from '../../state/store';

export const DISPLAY_MODE_LABELS: { mode: PointCloudEntry['displayMode']; label: string }[] = [
  { mode: 'rgb', label: 'RGB' },
  { mode: 'intensity', label: 'Intensity' },
  { mode: 'elevation', label: 'Elevation' },
  { mode: 'geotiff', label: 'GeoTIFF' },
];

export const ELEMENT_META: { kind: ElementKind; chip: string; label: string }[] = [
  { kind: 'faces', chip: 'F', label: 'Faces' },
  { kind: 'edges', chip: 'E', label: 'Edges' },
  { kind: 'breaklines', chip: 'B', label: 'Breaklines' },
  { kind: 'boundary', chip: 'O', label: 'Boundary' },
  { kind: 'vertices', chip: 'V', label: 'Vertices' },
  { kind: 'labels', chip: 'L', label: 'Labels' },
];

export function formatBytes(n: number | null): string {
  if (n === null) return '-';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
