import { type ReactNode } from 'react';
import styles from '../App.module.css';

export function DatasetSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.datasetSection}>
      <div className={styles.datasetSectionHeaderRow}>
        <div className={styles.datasetSectionHeader}>{title}</div>
        {action}
      </div>
      {children}
    </section>
  );
}
