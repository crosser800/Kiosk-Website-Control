import styles from './DailySales.module.css';

type DailySalesProps = {
  amount?: number;
  yesterday?: number;
  onClick?: () => void;
  disabled?: boolean;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export default function DailySales({
  amount = 0,
  yesterday = 0,
  onClick,
  disabled = false,
}: DailySalesProps) {
  const isUp = amount >= yesterday;

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={disabled}
      aria-label="Open daily sales breakdown"
    >
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${isUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
              aria-hidden="true"
            ></i>{' '}
            {formatCurrency(yesterday)} yesterday
          </p>
          <p className={styles.label}>Daily Sales</p>
          <h2 className={styles.count}>{formatCurrency(amount)}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-sun"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'Today is tracking ahead of yesterday.' : 'Today is trailing yesterday.'}
      </p>
    </button>
  );
}
