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
  const tone = amount === 0 && yesterday === 0 ? 'neutral' : amount >= yesterday ? 'up' : 'down';
  const isUp = tone === 'up';
  const trendIcon = tone === 'neutral' ? 'fa-minus' : isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
  const subtitle =
    tone === 'neutral'
      ? 'No completed sales for today or yesterday.'
      : isUp
        ? 'Today is tracking ahead of yesterday.'
        : 'Today is trailing yesterday.';

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
          <p className={`${styles.trend} ${styles[tone]}`}>
            <i
              className={`fa-solid ${trendIcon}`}
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

      <p className={`${styles.subtitle} ${styles[tone]}`}>
        {subtitle}
      </p>
    </button>
  );
}
