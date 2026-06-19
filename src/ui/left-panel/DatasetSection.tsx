import { type ReactNode } from 'react';
import styles from '../App.module.css';

export function DatasetSection({
  title,
  action,
  sectionExpanded,
  onSectionCollapse,
  sectionColor,
  children,
}: {
  title: string;
  action?: ReactNode;
  sectionExpanded?: boolean;
  onSectionCollapse?: () => void;
  sectionColor?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.datasetSection}>
      <div
        className={`${styles.datasetSectionHeaderRow}${sectionExpanded && !sectionColor ? ` ${styles.sectionHeaderExpanded}` : ''}`}
      >
        <div className={styles.datasetSectionHeader}>{title}</div>
        {action}
        {sectionExpanded && onSectionCollapse && !sectionColor && (
          <button
            type="button"
            className={styles.sectionCollapseBtn}
            onClick={onSectionCollapse}
            title="Collapse section"
          >
            v
          </button>
        )}
      </div>
      {children}
    </section>
  );
}
