import styles from './YtdSales.module.css';

type YtdSalesProps = {
  amount?: number;
  lastYear?: number;
  onClick?: () => void;
  disabled?: boolean;
};

export default function YtdSales({
  amount = 0,
  lastYear = 0,
  onClick,
  disabled = false,
}: YtdSalesProps) {
  const isUp = amount >= lastYear;

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={disabled}
      aria-label="Open year-to-date sales breakdown"
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
            {lastYear.toLocaleString()} vs last year
          </p>
          <p className={styles.label}>YTD Sales</p>
          <h2 className={styles.count}>₱{amount.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-chart-line"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Year-to-date sales are ahead of last year.' : 'Year-to-date sales are below last year.'}
      </p>
    </button>
  );
}
