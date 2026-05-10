import styles from './YtdSales.module.css';

type YtdSalesProps = {
  amount?: number;
  lastYear?: number;
};

export default function YtdSales({ amount = 0, lastYear = 0 }: YtdSalesProps) {
  const isUp = amount >= lastYear;

  return (
    <div className={styles.card}>
      <p className={styles.label}>YTD Sales</p>
      <h2 className={styles.count}>{amount.toLocaleString()}</h2>
      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        <i
          className={`fa-solid ${
            isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
          }`}
          aria-hidden="true"
        ></i>{' '}
        {lastYear.toLocaleString()} vs last year
      </p>
    </div>
  );
}
