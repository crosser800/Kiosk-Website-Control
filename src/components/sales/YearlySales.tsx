import styles from './YearlySales.module.css';
import { formatCompactMobileCurrency, formatCurrency } from '../../utils/formatCompactCurrency';

type YearlySalesProps = {
  amount?: number;
  lastYear?: number;
  onClick?: () => void;
  disabled?: boolean;
};

export default function YearlySales({
  amount = 0,
  lastYear = 0,
  onClick,
  disabled = false,
}: YearlySalesProps) {
  const tone = amount === 0 && lastYear === 0 ? 'neutral' : amount >= lastYear ? 'up' : 'down';
  const isUp = tone === 'up';
  const trendIcon = tone === 'neutral' ? 'fa-minus' : isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
  const subtitle =
    tone === 'neutral'
      ? 'No completed sales for this year or last year.'
      : isUp
        ? 'This year is ahead of last year.'
        : 'This year is behind last year.';

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={disabled}
      aria-label="Open yearly sales breakdown"
    >
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${styles[tone]}`}>
            <i
              className={`fa-solid ${trendIcon}`}
              aria-hidden="true"
            ></i>{' '}
            <span className={styles.desktopCurrency}>{formatCurrency(lastYear)}</span>
            <span className={styles.mobileCurrency}>{formatCompactMobileCurrency(lastYear)}</span> last year
          </p>
          <p className={styles.label}>Yearly Sales</p>
          <h2 className={styles.count}>
            <span className={styles.desktopCurrency}>{formatCurrency(amount)}</span>
            <span className={styles.mobileCurrency}>{formatCompactMobileCurrency(amount)}</span>
          </h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-chart-column"></i>
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
