import { useAppStore, type PdfGroupEntry, type PdfSheetEntry } from '../../state/store';
import { setPdfGroupSheetOrder, setPdfVisible, openPdfGroupScene, setPdfDrapeTarget } from '../importController';
import { PdfPageRow } from './PdfPageRow';
import { RowShell } from './RowShell';
import { useState, useEffect } from 'react';
import styles from '../App.module.css';

export function PdfGroupRow({ group, entries, isExpanded, onToggle, sectionColor }: { group: PdfGroupEntry; entries: PdfSheetEntry[]; isExpanded: boolean; onToggle: () => void; sectionColor?: string }) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const surfacesStore = useAppStore((s) => s.surfaces);
  const visible = entries.every((entry) => entry.visible);
  const firstSheet = entries[0];
  const hasImportNotes = entries.some((entry) => importNotes[entry.handle]);
  const detailsText = firstSheet
    ? `${entries.length} PDF${entries.length !== 1 ? 's' : ''}, ${firstSheet.widthPx150.toLocaleString()}x${firstSheet.heightPx150.toLocaleString()} px`
    : `${entries.length} PDF${entries.length !== 1 ? 's' : ''}`;
  const moveSheet = (handle: string, dir: 1 | -1): void => {
    const idx = group.sheetIds.indexOf(handle);
    if (idx === -1) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= group.sheetIds.length) return;
    const next = [...group.sheetIds];
    [next[idx], next[swap]] = [next[swap]!, next[idx]!];
    setPdfGroupSheetOrder(group.id, next);
  };
  const handleRemoveGroup = () => {
    if (window.confirm(`Remove group "${group.label}"?`)) {
      useAppStore.getState().removePdfGroup(group.id);
    }
  };
  const setPlacingPdfHandle = useAppStore((s) => s.setPlacingPdfHandle);
  const setCameraMode = useAppStore((s) => s.setCameraMode);
  const cameraMode = useAppStore((s) => s.cameraMode);
  const setPrePlacementCameraMode = useAppStore((s) => s.setPrePlacementCameraMode);
  const [showPlacePopup, setShowPlacePopup] = useState(false);
  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setShowPlacePopup(false); };
    if (showPlacePopup) window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [showPlacePopup]);
  return (
    <RowShell className={styles.listRow} onToggle={onToggle}>
      <div className={styles.listRowTop}>
        <button
          type="button"
          className={`${styles.typePill} ${styles.typePillPdf} ${visible ? '' : styles.typePillOff}`}
          title={`${visible ? 'Hide' : 'Show'} group sheets`}
          onClick={() => entries.forEach((entry) => setPdfVisible(entry.handle, !visible))}
        >
          PDF
        </button>
        <div className={styles.listRowName}>{group.label}</div>
        <span className={styles.listRowMeta}>{detailsText}</span>
        {hasImportNotes && (
          <button
            type="button"
            className={styles.iconBtn}
            title="Import notes"
            aria-label="Import notes"
            onClick={() => setNotesHandle(firstSheet!.handle)}
          >
            i
          </button>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          title="Remove group"
          aria-label="Remove group"
          onClick={handleRemoveGroup}
        >
          x
        </button>
      </div>
      {isExpanded && (
        <div className={styles.rowExpand} onClick={(ev) => ev.stopPropagation()} style={{ position: 'relative', ...(sectionColor ? { borderTopColor: sectionColor } : {}) }}>
          <div className={styles.listRowTop} style={{ gap: 4, marginBottom: 6, position: 'relative' }}>
            <button type="button" className={styles.elemChip} title="Open group in PDF Scene" onClick={() => openPdfGroupScene(group.id)}>
              Open
            </button>
            <button type="button" className={styles.elemChip} title="Place in scene" onClick={() => setShowPlacePopup((v) => !v)}>
              Place
            </button>
            {showPlacePopup && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, zIndex: 100,
                background: 'var(--bg-surface, #1e2228)', border: '1px solid var(--border-subtle, #333)',
                borderRadius: 6, padding: '4px 0', minWidth: 180, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
              }}>
                <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--fg-muted, #888)', borderBottom: '1px solid var(--border-subtle, #333)' }}>Place by type</div>
                <button type="button" style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '5px 12px',
                  background: 'none', border: 'none', color: 'var(--fg, #e8e2d0)', cursor: 'pointer',
                  fontSize: 12,
                }} onClick={() => {
                  setShowPlacePopup(false);
                  setPrePlacementCameraMode(cameraMode);
                  setCameraMode('top');
                  setPlacingPdfHandle(firstSheet!.handle);
                }}>
                  Global
                </button>
                <button type="button" disabled style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '5px 12px',
                  background: 'none', border: 'none', color: 'var(--fg-muted, #555)', cursor: 'not-allowed',
                  fontSize: 12,
                }}>
                  Place-to-Dataset
                </button>
                <button type="button" disabled style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '5px 12px',
                  background: 'none', border: 'none', color: 'var(--fg-muted, #555)', cursor: 'not-allowed',
                  fontSize: 12,
                }}>
                  Place-to-Points
                </button>
              </div>
            )}
          </div>
          {surfacesStore.length > 0 && (
            <div className={styles.elemRow}>
              <span className={styles.elemRowLabel}>Drape onto</span>
              <select
                className={styles.selectCtl}
                value={firstSheet?.drapeTargetSurfaceId ?? ''}
                onChange={(ev) => {
                  const target = ev.target.value || null;
                  for (const entry of entries) {
                    setPdfDrapeTarget(entry.handle, target);
                  }
                }}
              >
                <option value="">- no target -</option>
                {surfacesStore.map((s) => (
                  <option key={s.handle} value={s.handle}>{s.name}</option>
                ))}
              </select>
            </div>
          )}
          {entries.map((entry, index) => (
            <PdfPageRow
              key={entry.handle}
              page={entry}
              containerPosition={index + 1}
              showReorder
              isFirst={index === 0}
              isLast={index === entries.length - 1}
              onMoveUp={() => moveSheet(entry.handle, -1)}
              onMoveDown={() => moveSheet(entry.handle, 1)}
              groupAction="remove"
            />
          ))}
          {sectionColor && (
            <button
              type="button"
              title="Collapse"
              onClick={onToggle}
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                transform: 'translate(-50%, -50%)',
                width: 20,
                height: 20,
                borderRadius: '50%',
                border: `1px solid ${sectionColor}`,
                background: 'var(--bg-inset)',
                color: sectionColor,
                fontSize: 12,
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              v
            </button>
          )}
        </div>
      )}
    </RowShell>
  );
}
