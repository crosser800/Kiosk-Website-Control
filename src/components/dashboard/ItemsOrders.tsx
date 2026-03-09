import styles from './ItemsOrders.module.css';

type ItemsOrdersProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: ItemsOrdersProps) {
  const isUp = count >= yesterday;

  return (
    <div className={styles.card}>
      <p className={styles.label}>Items Orders</p>
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
