import styles from './SkeletonLoader.module.css';

export function SkeletonRow() {
  return (
    <div className={styles.row} data-testid="skeleton-loader">
      <div className={`${styles.block} ${styles.wide}`} />
      <div className={`${styles.block} ${styles.medium}`} />
      <div className={`${styles.block} ${styles.small}`} />
      <div className={`${styles.block} ${styles.small}`} />
      <div className={`${styles.block} ${styles.tiny}`} />
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className={styles.card} data-testid="skeleton-loader">
      <div className={`${styles.block} ${styles.wide}`} />
      <div className={`${styles.block} ${styles.medium}`} />
      <div className={`${styles.block} ${styles.small}`} />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.table}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
