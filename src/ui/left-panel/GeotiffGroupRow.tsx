import { type GeotiffGroup, type GeotiffEntry } from '../../state/store';
import { setGeotiffGroupVisible } from '../importController';
import { GeotiffRow } from './GeotiffRow';
import { RowShell } from './RowShell';
import styles from '../App.module.css';

export function GeotiffGroupRow({
  group,
  entries,
  surfaces,
  isExpanded,
  onToggle,
}: {
  group: GeotiffGroup;
  entries: GeotiffEntry[];
  surfaces: { handle: string; name: string }[];
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const targetName = surfaces.find((surface) => surface.handle === group.drapeTarget)?.name;

  return (
    <RowShell className={styles.listRow} style={{ cursor: 'default' }} onToggle={onToggle}>
      <div className={styles.listRowTop}>
        <div className={styles.listRowName}>{group.name}</div>
        <span className={styles.dxfIcon}>{group.name}</span>
        <span className={styles.listRowMeta}>{entries.length} GeoTIFFs</span>
        <button
          type="button"
          className={`${styles.elemChip} ${group.visible ? '' : styles.elemChipOff}`}
          title={group.visible ? 'Hide group' : 'Show group'}
          onClick={() => setGeotiffGroupVisible(group.id, !group.visible)}
        >
          Eye
        </button>
      </div>
      <div className={styles.listRowMeta}>
        {targetName ? `target ${targetName}` : 'no target'} · opacity {Math.round(group.opacity * 100)}%
      </div>
      {isExpanded && (
        <div className={styles.groupMemberList}>
          {entries.map((entry) => (
            <GeotiffRow
              key={entry.handle}
              entry={entry}
              surfaces={surfaces}
              groupName={group.name}
              memberRow
            />
          ))}
        </div>
      )}
    </RowShell>
  );
}
