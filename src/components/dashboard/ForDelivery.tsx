import styles from './ForDelivery.module.css';

type ForDeliveryProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: ForDeliveryProps) {
  const isUp = count >= yesterday;

  return (
    <div className={styles.card}>
      <p className={styles.label}>For Delivery</p>
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
