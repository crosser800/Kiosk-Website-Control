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
      <p className={styles.label}>Monthly Sales</p>
      <h2 className={styles.count}>{amount.toLocaleString()}</h2>
      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        <i
          className={`fa-solid ${
            isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
          }`}
          aria-hidden="true"
        ></i>{' '}
        {lastMonth.toLocaleString()} vs last month
      </p>
    </div>
  );
}
