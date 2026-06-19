import { useState } from 'react';
import { useAppStore } from '../../state/store';
import { createPdfGroup, addSheetsToGroup } from '../importController';
import styles from '../App.module.css';

export function AddToGroupPicker({
  handles,
  onClose,
}: {
  handles: string[];
  onClose: () => void;
}) {
  const pdfGroups = useAppStore((s) => s.pdfGroups);
  const [mode, setMode] = useState<'existing' | 'new'>(
    pdfGroups.length > 0 ? 'existing' : 'new',
  );
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    pdfGroups[0]?.id ?? '',
  );
  const [newGroupName, setNewGroupName] = useState('');

  const handleOk = () => {
    if (mode === 'existing' && selectedGroupId) {
      addSheetsToGroup(selectedGroupId, handles);
    } else if (mode === 'new') {
      const name = newGroupName.trim() || `PDF Group ${pdfGroups.length + 1}`;
      createPdfGroup(name, handles);
    }
    onClose();
  };

  const canSubmit =
    mode === 'existing'
      ? !!selectedGroupId
      : true;

  const groupSelectId = 'add-to-group-select';

  return (
    <div className={styles.dialogBackdrop}>
      <div className={styles.dialog} role="dialog" aria-label="Add to group">
        <div className={styles.dialogHeader}>
          <div className={styles.dialogFile}>
            <span className={styles.dialogFileName}>Add to Group</span>
          </div>
          <div className={styles.dialogMeta}>
            {handles.length > 1
              ? `${handles.length} pages will be added together.`
              : 'Add this PDF to an existing group or create a new one.'}
          </div>
        </div>
        {pdfGroups.length > 0 && (
          <label className={styles.batchItem} style={{ marginBottom: 8 }}>
            <input
              type="radio"
              name="add-to-group-mode"
              checked={mode === 'existing'}
              onChange={() => setMode('existing')}
            />
            <span className={styles.listRowName}>Add to existing group</span>
          </label>
        )}
        <label className={styles.batchItem}>
          <input
            type="radio"
            name="add-to-group-mode"
            checked={mode === 'new'}
            onChange={() => setMode('new')}
          />
          <span className={styles.listRowName}>Create new group</span>
        </label>
        {mode === 'existing' && pdfGroups.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <label
              htmlFor={groupSelectId}
              className={styles.listRowMeta}
              style={{ display: 'block', marginBottom: 4 }}
            >
              Select group
            </label>
            <select
              id={groupSelectId}
              className={styles.selectCtl}
              value={selectedGroupId}
              onChange={(ev) => setSelectedGroupId(ev.target.value)}
            >
              {pdfGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {mode === 'new' && (
          <div style={{ marginTop: 8 }}>
            <label
              htmlFor="new-group-name"
              className={styles.listRowMeta}
              style={{ display: 'block', marginBottom: 4 }}
            >
              Group name
            </label>
            <input
              id="new-group-name"
              type="text"
              className={styles.textCtl}
              placeholder={`PDF Group ${pdfGroups.length + 1}`}
              value={newGroupName}
              onChange={(ev) => setNewGroupName(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') handleOk();
              }}
            />
          </div>
        )}
        <div className={styles.dialogButtons}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
            disabled={!canSubmit}
            onClick={handleOk}
          >
            {mode === 'existing' ? 'Add' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
