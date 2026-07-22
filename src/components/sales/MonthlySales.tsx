import styles from './MonthlySales.module.css';

type MonthlySalesProps = {
  amount?: number;
  lastMonth?: number;
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

export default function MonthlySales({
  amount = 0,
  lastMonth = 0,
  onClick,
  disabled = false,
}: MonthlySalesProps) {
  const isUp = amount >= lastMonth;

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
          <p className={`${styles.trend} ${isUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                isUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
              aria-hidden="true"
            ></i>{' '}
            {formatCurrency(lastMonth)} last month
          </p>
          <p className={styles.label}>Monthly Sales</p>
          <h2 className={styles.count}>{formatCurrency(amount)}</h2>
        </div>
        <div className={styles.iconBadge}>
          <i className="fa-solid fa-calendar-days"></i>
        </div>
      </div>

      <div className={styles.waveWrap} aria-hidden="true">
        <div className={styles.wave}></div>
      </div>

      <p className={`${styles.subtitle} ${isUp ? styles.up : styles.down}`}>
        {isUp ? 'This month is outperforming last month.' : 'This month is behind last month.'}
      </p>
    </button>
  );
}
