import { useAppStore, type PdfSheetEntry } from '../../state/store';
import {
  setPdfVisible,
  removePdfSheet,
  openPdfGroupScene,
} from '../importController';
import { RowShell } from './RowShell';
import { PdfPageRow } from './PdfPageRow';
import styles from '../App.module.css';

function placePdfStub(handle: string) {
  /* TODO: PLACE behavior -- group-scene placement workflow (future) */
  void handle;
}

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
  const docMode = pages && pages.length > 0;
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
          <div className={styles.listRowTop} style={{ gap: 4, marginBottom: 6 }}>
            <button type="button" className={styles.elemChip} title="Open in PDF scene" onClick={() => openPdfGroupScene(documentEntry.handle)}>
              Open
            </button>
            <button type="button" className={styles.elemChip} title="Place in group scene (placeholder)" onClick={() => placePdfStub(documentEntry.handle)}>
              Place
            </button>
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
