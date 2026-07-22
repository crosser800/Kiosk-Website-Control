import styles from './adminCount.module.css';

type AdminCountProps = {
  adminCount?: number | null;
};

export default function AdminCount({ adminCount = null }: AdminCountProps) {
  const displayCount = adminCount ?? 0;

  return (
    <section className={styles.card} aria-labelledby="admin-count-title">
      <div className={styles.top}>
        <div>
          <p className={styles.trend}>
            <i className="fa-solid fa-shield-halved"></i> core access
          </p>
          <p id="admin-count-title" className={styles.label}>
            Admins
          </p>
          <h2 className={styles.count}>{displayCount}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-user-gear"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={styles.subtitle}>team members with admin control</p>
    </section>
  );
}
