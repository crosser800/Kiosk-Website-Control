import styles from './ForDelivery.module.css';

type ForDeliveryProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: ForDeliveryProps) {
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
          <p className={styles.label}>For Delivery</p>
          <h2 className={styles.count}>{count.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-truck-fast"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Delivery queue is growing.' : 'Delivery queue is lighter.'}
      </p>
    </div>
  );
}
