import styles from './agentsCount.module.css';

type AgentsCountProps = {
  agentsCount?: number | null;
};

export default function AgentsCount({ agentsCount = null }: AgentsCountProps) {
  const displayCount = agentsCount ?? 0;

  return (
    <section className={styles.card} aria-labelledby="agents-count-title">
      <p id="agents-count-title" className={styles.label}>
        Agents
      </p>
      <h2 className={styles.count}>{displayCount}</h2>
    </section>
  );
}
