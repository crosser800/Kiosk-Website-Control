import styles from './ForDelivery.module.css';

type ForDeliveryProps = {
  count: number;
  yesterday: number;
};

export default function ItemsOrders({ count, yesterday }: ForDeliveryProps) {
  const tone = count === 0 && yesterday === 0 ? 'neutral' : count >= yesterday ? 'up' : 'down';
  const isUp = tone === 'up';
  const trendIcon = tone === 'neutral' ? 'fa-minus' : isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${tone === 'neutral' ? '' : isUp ? styles.up : styles.down}`}>
            <i className={`fa-solid ${trendIcon}`}></i>{' '}
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

      <p className={`${styles.subtitle} ${tone === 'neutral' ? '' : isUp ? styles.up : styles.down}`}>
        {tone === 'neutral'
          ? 'No orders currently ready for delivery.'
          : isUp
            ? 'Delivery queue is growing.'
            : 'Delivery queue is lighter.'}
      </p>
    </div>
  );
}
