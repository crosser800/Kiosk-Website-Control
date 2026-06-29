import styles from './YearlySales.module.css';

type YearlySalesProps = {
  amount?: number;
  lastYear?: number;
  onClick?: () => void;
  disabled?: boolean;
};

export default function YearlySales({
  amount = 0,
  lastYear = 0,
  onClick,
  disabled = false,
}: YearlySalesProps) {
  const isUp = amount >= lastYear;

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={disabled}
      aria-label="Open yearly sales breakdown"
    >
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${isUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
              aria-hidden="true"
            ></i>{' '}
            {lastYear.toLocaleString()} vs previous year
          </p>
          <p className={styles.label}>Year Sales</p>
          <h2 className={styles.count}>₱{amount.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-chart-column"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Annual revenue is holding strong.' : 'Annual revenue needs attention.'}
      </p>
    </button>
  );
}
