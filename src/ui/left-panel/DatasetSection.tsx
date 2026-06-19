import { type ReactNode } from 'react';
import styles from '../App.module.css';

export function DatasetSection({
  title,
  action,
  sectionExpanded,
  onSectionCollapse,
  children,
}: {
  title: string;
  action?: ReactNode;
  sectionExpanded?: boolean;
  onSectionCollapse?: () => void;
  children: ReactNode;
}) {
  return (
    <section className={styles.datasetSection}>
      <div className={`${styles.datasetSectionHeaderRow}${sectionExpanded ? ` ${styles.sectionHeaderExpanded}` : ''}`}>
        <div className={styles.datasetSectionHeader}>{title}</div>
        {action}
        {sectionExpanded && onSectionCollapse && (
          <button type="button" className={styles.sectionCollapseBtn} onClick={onSectionCollapse} title="Collapse section">
            v
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
