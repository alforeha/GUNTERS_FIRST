import { useState } from 'react';
import { type GeotiffGroup, type GeotiffEntry } from '../../state/store';
import { setGeotiffGroupVisible } from '../importController';
import { GeotiffRow } from './GeotiffRow';
import styles from '../App.module.css';

export function GeotiffGroupRow({
  group,
  entries,
  surfaces,
}: {
  group: GeotiffGroup;
  entries: GeotiffEntry[];
  surfaces: { handle: string; name: string }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const targetName = surfaces.find((surface) => surface.handle === group.drapeTarget)?.name;

  return (
    <div className={styles.listRow} style={{ cursor: 'default' }}>
      <div className={styles.listRowTop}>
        <button
          type="button"
          className={styles.iconBtn}
          title={expanded ? 'Collapse group' : 'Expand group'}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '^' : 'v'}
        </button>
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
      {expanded && (
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
    </div>
  );
}
