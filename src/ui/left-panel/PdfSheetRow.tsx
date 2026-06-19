import { useState } from 'react';
import { type PdfSheetEntry } from '../../state/store';
import {
  setPdfVisible,
  removePdfSheet,
  openPdfGroupScene,
  openPdfCalibrationScene,
  openPdfOrientationScene,
  setNorthArrow,
  setScaleBar,
  setKnownDistance,
} from '../importController';
import styles from '../App.module.css';

export function PdfSheetRow({ entry, compact = false, grouped = false }: { entry: PdfSheetEntry; compact?: boolean; grouped?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={styles.listRow} style={compact ? { marginLeft: 10 } : undefined}>
      <div className={styles.listRowTop}>
        <button type="button" className={styles.iconBtn} onClick={() => setExpanded((v) => !v)}>
          {expanded ? 'v' : '>'}
        </button>
        <div className={styles.listRowName}>{entry.label}</div>
        <span className={styles.listRowMeta}>
          page {entry.pageIndex + 1} · {entry.widthPx150.toLocaleString()} x {entry.heightPx150.toLocaleString()}
        </span>
        <span className={styles.rowSpacer} />
        <button
          type="button"
          className={`${styles.elemChip} ${entry.visible ? '' : styles.elemChipOff}`}
          title={entry.visible ? 'Hide PDF' : 'Show PDF'}
          onClick={() => setPdfVisible(entry.handle, !entry.visible)}
        >
          PDF
        </button>
        {!grouped && (
          <button type="button" className={styles.elemChip} title="Open in PDF Scene" onClick={() => openPdfGroupScene(entry.handle)}>
            Open
          </button>
        )}
        <button type="button" className={styles.elemChip} title="Calibrate PDF sheet" onClick={() => openPdfCalibrationScene(entry.handle)}>
          Calibrate
        </button>
        <button type="button" className={styles.elemChip} title="Orient PDF sheet" onClick={() => openPdfOrientationScene(entry.handle)}>
          Orient
        </button>
      </div>
      {expanded && (
        <div className={styles.rowExpand}>
          {!grouped && (
            <button type="button" className={styles.actionBtn} title="Remove PDF" onClick={() => removePdfSheet(entry.handle)}>
              Remove PDF
            </button>
          )}
          <div className={styles.listRowMeta}>Block-outs: {entry.blockOuts.length}</div>
          <div className={styles.listRowMeta}>Markups: {entry.markups.length}</div>
          {entry.northArrow && (
            <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>North arrow</span>
              <button
                type="button"
                className={`${styles.elemChip} ${entry.northArrow.visible ? '' : styles.elemChipOff}`}
                title={entry.northArrow.visible ? 'Hide north arrow' : 'Show north arrow'}
                onClick={() => setNorthArrow(entry.handle, { ...entry.northArrow!, visible: !entry.northArrow!.visible })}
              >
                {entry.northArrow.visible ? 'Visible' : 'Hidden'}
              </button>
              <input
                type="color"
                value={entry.northArrow.color}
                title="North arrow color"
                onChange={(ev) => setNorthArrow(entry.handle, { ...entry.northArrow!, color: ev.target.value })}
                style={{ width: 24, height: 24, padding: 0, border: 'none', cursor: 'pointer', background: 'none' }}
              />
              <span>{entry.northArrow.angleDeg.toFixed(1)}&deg;</span>
            </div>
          )}
          {entry.scaleBar && (
            <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Scale bar</span>
              <button
                type="button"
                className={`${styles.elemChip} ${entry.scaleBar.visible ? '' : styles.elemChipOff}`}
                title={entry.scaleBar.visible ? 'Hide scale bar' : 'Show scale bar'}
                onClick={() => setScaleBar(entry.handle, { ...entry.scaleBar!, visible: !entry.scaleBar!.visible })}
              >
                {entry.scaleBar.visible ? 'Visible' : 'Hidden'}
              </button>
              {entry.scaleBar.realWorldFt !== null && (
                <span>1&quot;={entry.scaleBar.realWorldFt}ft</span>
              )}
              <button
                type="button"
                className={styles.elemChip}
                onClick={() => setScaleBar(entry.handle, null)}
                title="Remove scale bar"
              >
                Remove
              </button>
            </div>
          )}
          {entry.knownDistance && (
            <div className={styles.listRowMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>Known distance</span>
              <button
                type="button"
                className={`${styles.elemChip} ${entry.knownDistance.visible ? '' : styles.elemChipOff}`}
                title={entry.knownDistance.visible ? 'Hide' : 'Show'}
                onClick={() => setKnownDistance(entry.handle, { ...entry.knownDistance!, visible: !entry.knownDistance!.visible })}
              >
                {entry.knownDistance.visible ? 'Visible' : 'Hidden'}
              </button>
              {entry.knownDistance.realWorldFt !== null && (
                <span>{(Math.hypot(
                  entry.knownDistance.end.x - entry.knownDistance.begin.x,
                  entry.knownDistance.end.y - entry.knownDistance.begin.y,
                ) / 150).toFixed(2)}&quot;={entry.knownDistance.realWorldFt}ft</span>
              )}
              <button
                type="button"
                className={styles.elemChip}
                onClick={() => setKnownDistance(entry.handle, null)}
                title="Remove known distance"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
