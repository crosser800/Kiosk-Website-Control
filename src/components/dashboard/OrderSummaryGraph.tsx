import styles from './OrderSummaryGraph.module.css';

export type DashboardStatusSummary = {
  status: string;
  count: number;
  share: number;
};

export type DashboardPriceMixSummary = {
  label: string;
  count: number;
  sales: number;
  share: number;
};

type OrderSummaryGraphProps = {
  statuses: DashboardStatusSummary[];
  priceMix: DashboardPriceMixSummary[];
};

function formatCurrency(value: number) {
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OrderSummaryGraph({ statuses, priceMix }: OrderSummaryGraphProps) {
  const totalOrders = statuses.reduce((sum, item) => sum + item.count, 0);
  const totalSales = priceMix.reduce((sum, item) => sum + item.sales, 0);

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Order Status Summary</h2>
          <p className={styles.total}>{totalOrders.toLocaleString()} total orders</p>
        </div>
        <p className={styles.total}>Completed sales mix: PHP {formatCurrency(totalSales)}</p>
      </div>

      <div className={styles.statusList}>
        {statuses.map((item) => (
          <div key={item.status} className={styles.statusRow}>
            <div className={styles.statusLabelGroup}>
              <span className={styles.statusDot}></span>
              <span className={styles.statusLabel}>{item.status}</span>
            </div>
            <div className={styles.statusValueGroup}>
              <strong>{item.count.toLocaleString()}</strong>
              <span>{item.share}%</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.mixSection}>
        <div className={styles.breakdownHeader}>
          <h3 className={styles.mixTitle}>Completed Sales By Price Class</h3>
          <span className={styles.total}>{priceMix.length.toLocaleString()} groups</span>
        </div>
        <div className={styles.mixGrid}>
          {priceMix.map((item) => (
            <article key={item.label} className={styles.mixCard}>
              <div>
                <p className={styles.label}>{item.label}</p>
                <p className={styles.valueText}>{item.count.toLocaleString()} completed orders</p>
              </div>
              <div className={styles.mixAmount}>
                <strong>PHP {formatCurrency(item.sales)}</strong>
                <span>{item.share}%</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      {totalOrders === 0 ? (
        <p className={styles.emptyHint}>No orders recorded yet.</p>
      ) : null}
    </div>
  );
}
