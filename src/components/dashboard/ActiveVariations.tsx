import styles from './ActiveVariations.module.css';

type ActiveVariationsProps = {
  count: number;
};

export default function ActiveVariations({ count }: ActiveVariationsProps) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <p className={styles.trend}>
            <i className="fa-solid fa-arrow-trend-up"></i> grouped live count
          </p>
          <p className={styles.label}>Active Variations</p>
          <h2 className={styles.count}>{count.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-layer-group"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={styles.subtitle}>currently available across products</p>
    </div>
  );
}
