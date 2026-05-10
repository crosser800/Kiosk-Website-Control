import styles from './DailySales.module.css';

type DailySalesProps = {
  amount?: number;
  yesterday?: number;
};

export default function DailySales({ amount = 0, yesterday = 0 }: DailySalesProps) {
  const isUp = amount >= yesterday;

  return (
    <div className={styles.card}>
      <p className={styles.label}>Daily Sales</p>
      <h2 className={styles.count}>{amount.toLocaleString()}</h2>
      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        <i
          className={`fa-solid ${
            isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
          }`}
          aria-hidden="true"
        ></i>{' '}
        {yesterday.toLocaleString()} vs yesterday
      </p>
    </div>
  );
}
