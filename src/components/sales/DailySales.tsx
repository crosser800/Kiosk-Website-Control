import styles from './DailySales.module.css';
import { formatCompactMobileCurrency, formatCurrency } from '../../utils/formatCompactCurrency';

type DailySalesProps = {
  amount?: number;
  yesterday?: number;
  onClick?: () => void;
  disabled?: boolean;
};

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
            <span className={styles.desktopCurrency}>{formatCurrency(yesterday)}</span>
            <span className={styles.mobileCurrency}>{formatCompactMobileCurrency(yesterday)}</span> yesterday
          </p>
          <p className={styles.label}>Daily Sales</p>
          <h2 className={styles.count}>
            <span className={styles.desktopCurrency}>{formatCurrency(amount)}</span>
            <span className={styles.mobileCurrency}>{formatCompactMobileCurrency(amount)}</span>
          </h2>
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
