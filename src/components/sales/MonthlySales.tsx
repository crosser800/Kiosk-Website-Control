import styles from './MonthlySales.module.css';
import { formatCompactMobileCurrency, formatCurrency } from '../../utils/formatCompactCurrency';

type MonthlySalesProps = {
  amount?: number;
  lastMonth?: number;
  onClick?: () => void;
  disabled?: boolean;
};

export default function MonthlySales({
  amount = 0,
  lastMonth = 0,
  onClick,
  disabled = false,
}: MonthlySalesProps) {
  const tone = amount === 0 && lastMonth === 0 ? 'neutral' : amount >= lastMonth ? 'up' : 'down';
  const isUp = tone === 'up';
  const trendIcon = tone === 'neutral' ? 'fa-minus' : isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
  const subtitle =
    tone === 'neutral'
      ? 'No completed sales for this month or last month.'
      : isUp
        ? 'This month is outperforming last month.'
        : 'This month is behind last month.';

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={disabled}
      aria-label="Open monthly sales breakdown"
    >
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${styles[tone]}`}>
            <i
              className={`fa-solid ${trendIcon}`}
              aria-hidden="true"
            ></i>{' '}
            <span className={styles.desktopCurrency}>{formatCurrency(lastMonth)}</span>
            <span className={styles.mobileCurrency}>{formatCompactMobileCurrency(lastMonth)}</span> last month
          </p>
          <p className={styles.label}>Monthly Sales</p>
          <h2 className={styles.count}>
            <span className={styles.desktopCurrency}>{formatCurrency(amount)}</span>
            <span className={styles.mobileCurrency}>{formatCompactMobileCurrency(amount)}</span>
          </h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-calendar-days"></i>
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
