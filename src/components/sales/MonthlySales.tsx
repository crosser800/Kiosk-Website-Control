import styles from './MonthlySales.module.css';

type MonthlySalesProps = {
  amount?: number;
  lastMonth?: number;
};

export default function MonthlySales({
  amount = 0,
  lastMonth = 0,
}: MonthlySalesProps) {
  const isUp = amount >= lastMonth;

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${isUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
              aria-hidden="true"
            ></i>{' '}
            {lastMonth.toLocaleString()} vs last month
          </p>
          <p className={styles.label}>Monthly Sales</p>
          <h2 className={styles.count}>₱{amount.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-calendar-days"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Month-to-date revenue is improving.' : 'Month-to-date revenue is softer.'}
      </p>
    </div>
  );
}
