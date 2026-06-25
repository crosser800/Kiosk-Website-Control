import styles from './DailySales.module.css';

type DailySalesProps = {
  amount?: number;
  yesterday?: number;
};

export default function DailySales({ amount = 0, yesterday = 0 }: DailySalesProps) {
  const isUp = amount >= yesterday;

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${isUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
              aria-hidden="true"
            ></i>{' '}
            {yesterday.toLocaleString()} vs yesterday
          </p>
          <p className={styles.label}>Daily Sales</p>
          <h2 className={styles.count}>₱{amount.toLocaleString()}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-sun"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Today is pacing above yesterday.' : 'Today is pacing below yesterday.'}
      </p>
    </div>
  );
}
