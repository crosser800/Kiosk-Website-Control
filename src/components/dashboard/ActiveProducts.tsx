import styles from './ActiveProducts.module.css';

type ActiveProductsProps = {
  count: number;
};

export default function ActiveProducts({ count }: ActiveProductsProps) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <p className={styles.trend}>
            <i className="fa-solid fa-arrow-trend-up"></i> live inventory
          </p>
          <p className={styles.label}>Active Products</p>
          <h2 className={styles.count}>{count.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-box-open"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={styles.subtitle}>current active catalog</p>
    </div>
  );
}
