import styles from './YtdSales.module.css';

type YtdSalesProps = {
  amount?: number;
  lastYear?: number;
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

export default function YtdSales({
  amount = 0,
  lastYear = 0,
  onClick,
  disabled = false,
}: YtdSalesProps) {
  const tone = amount === 0 && lastYear === 0 ? 'neutral' : amount >= lastYear ? 'up' : 'down';
  const isUp = tone === 'up';
  const trendIcon = tone === 'neutral' ? 'fa-minus' : isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down';
  const subtitle =
    tone === 'neutral'
      ? 'No completed year-to-date sales for either period.'
      : isUp
        ? 'Year-to-date sales are ahead of last year.'
        : 'Year-to-date sales are below last year.';

  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick}
      disabled={disabled}
      aria-label="Open year-to-date sales breakdown"
    >
      <div className={styles.top}>
        <div>
          <p className={`${styles.trend} ${styles[tone]}`}>
            <i
              className={`fa-solid ${trendIcon}`}
              aria-hidden="true"
            ></i>{' '}
            {formatCurrency(lastYear)} last year
          </p>
          <p className={styles.label}>YTD Sales</p>
          <h2 className={styles.count}>{formatCurrency(amount)}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-chart-line"></i>
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
