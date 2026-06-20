import { useAppStore, type PdfSheetEntry } from '../../state/store';
import {
  setPdfVisible,
  removePdfSheet,
  openPdfGroupScene,
} from '../importController';
import { RowShell } from './RowShell';
import { PdfPageRow } from './PdfPageRow';
import { useState, useEffect } from 'react';
import styles from '../App.module.css';

export function PdfSheetRow({
  entry,
  isExpanded,
  onToggle,
  pages,
  sectionColor,
}: {
  entry: PdfSheetEntry;
  isExpanded?: boolean;
  onToggle?: () => void;
  pages?: PdfSheetEntry[];
  sectionColor?: string;
}) {
  const importNotes = useAppStore((s) => s.importNotes);
  const setNotesHandle = useAppStore((s) => s.setNotesHandle);
  const setPlacingPdfHandle = useAppStore((s) => s.setPlacingPdfHandle);
  const setCameraMode = useAppStore((s) => s.setCameraMode);
  const cameraMode = useAppStore((s) => s.cameraMode);
  const setPrePlacementCameraMode = useAppStore((s) => s.setPrePlacementCameraMode);
  const [showPlacePopup, setShowPlacePopup] = useState(false);
  const docMode = pages && pages.length > 0;

  useEffect(() => {
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setShowPlacePopup(false); };
    if (showPlacePopup) window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [showPlacePopup]);
  const displayPages = docMode ? pages : [entry];
  const documentEntry = docMode ? pages[0]! : entry;
  const totalPages = displayPages.length;

  return (
    <RowShell className={styles.listRow} onToggle={onToggle!}>
      <div className={styles.listRowTop}>
        <button
          type="button"
          className={`${styles.typePill} ${styles.typePillPdf} ${entry.visible ? '' : styles.typePillOff}`}
          title={entry.visible ? 'Hide PDF' : 'Show PDF'}
          onClick={() => {
            if (pages) for (const p of pages) setPdfVisible(p.handle, !entry.visible);
          }}
        >
          PDF
        </button>
        <div className={styles.listRowName}>{documentEntry.label}</div>
        <span className={styles.listRowMeta}>
          {totalPages} page{totalPages !== 1 ? 's' : ''},{' '}
          {documentEntry.widthPx150.toLocaleString()}x{documentEntry.heightPx150.toLocaleString()} px
        </span>
        {importNotes[documentEntry.handle] && (
          <button
            type="button"
            className={styles.iconBtn}
            title="Import notes"
            aria-label="Import notes"
            onClick={() => setNotesHandle(documentEntry.handle)}
          >
            i
          </button>
        )}
        <button
          type="button"
          className={styles.iconBtn}
          title="Remove"
          aria-label="Remove PDF"
          onClick={() => {
            const name = documentEntry.label;
            if (window.confirm(`Remove "${name}" from the scene?`)) {
              if (pages) for (const p of pages) removePdfSheet(p.handle);
            }
          }}
        >
          x
        </button>
      </div>

      {isExpanded && (
        <div className={styles.rowExpand} onClick={(ev) => ev.stopPropagation()} style={{ position: 'relative', ...(sectionColor ? { borderTopColor: sectionColor } : {}) }}>
          <div className={styles.listRowTop} style={{ gap: 4, marginBottom: 6, position: 'relative' }}>
            <button type="button" className={styles.elemChip} title="Open in PDF scene" onClick={() => openPdfGroupScene(documentEntry.handle)}>
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
                  setPlacingPdfHandle(documentEntry.handle);
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
          {displayPages.map((page, idx) => (
            <PdfPageRow
              key={page.handle}
              page={page}
              containerPosition={idx + 1}
              groupAction="add"
            />
          ))}
          {sectionColor && (
            <button
              type="button"
              title="Collapse"
              onClick={() => onToggle?.()}
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
