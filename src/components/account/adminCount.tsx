import styles from './adminCount.module.css';

type AdminCountProps = {
  adminCount?: number | null;
};

export default function AdminCount({ adminCount = null }: AdminCountProps) {
  const displayCount = adminCount ?? 0;

  return (
    <section className={styles.card} aria-labelledby="admin-count-title">
      <p id="admin-count-title" className={styles.label}>
        Admins
      </p>
      <h2 className={styles.count}>{displayCount}</h2>
    </section>
  );
}
