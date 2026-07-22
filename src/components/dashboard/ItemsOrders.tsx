import styles from './ItemsOrders.module.css';

type ItemsOrdersProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: ItemsOrdersProps) {
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
          <p className={styles.label}>Items Orders</p>
          <h2 className={styles.count}>{count.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-cart-shopping"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Orders are pacing above yesterday.' : 'Orders are pacing below yesterday.'}
      </p>
    </div>
  );
}
