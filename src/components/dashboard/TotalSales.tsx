import styles from './TotalSales.module.css';

type TotalSalesProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: TotalSalesProps) {
  const isUp = count >= yesterday;

  return (
    <div className={styles.card}>
      <p className={styles.label}>Total Sales</p>
      <h2 className={styles.count}>{count.toLocaleString()}</h2>
      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        <i
          className={`fa-solid ${
            isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
          }`}
        ></i>{' '}
        {yesterday.toLocaleString()} vs yesterday
      </p>
    </div>
  );
}
