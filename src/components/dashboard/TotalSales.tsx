import styles from './TotalSales.module.css';

type TotalSalesProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: TotalSalesProps) {
  const isUp = count >= yesterday;

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${isUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
            ></i>{' '}
            {yesterday.toLocaleString()} vs yesterday
          </p>
          <p className={styles.label}>Total Sales</p>
          <h2 className={styles.count}>{count.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-peso-sign"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Sales are tracking upward.' : 'Sales are tracking downward.'}
      </p>
    </div>
  );
}
