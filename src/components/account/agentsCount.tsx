import styles from './agentsCount.module.css';

type AgentsCountProps = {
  agentsCount?: number | null;
};

export default function AgentsCount({ agentsCount = null }: AgentsCountProps) {
  const displayCount = agentsCount ?? 0;

  return (
    <section className={styles.card} aria-labelledby="agents-count-title">
      <div className={styles.top}>
        <div>
          <p className={styles.trend}>
            <i className="fa-solid fa-people-group"></i> field network
          </p>
          <p id="agents-count-title" className={styles.label}>
            Agents
          </p>
          <h2 className={styles.count}>{displayCount}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-id-badge"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={styles.subtitle}>active representatives in the roster</p>
    </section>
  );
}
