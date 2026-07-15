import styles from './OrderSummaryGraph.module.css';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';
import type { TooltipContentProps } from 'recharts';

type OrderSummaryGraphProps = {
  retail: number;
  wholesale: number;
  retailVsYesterday: number;
  wholesaleVsYesterday: number;
};

export default function OrderSummaryGraph({
  retail,
  wholesale,
  retailVsYesterday,
  wholesaleVsYesterday,
}: OrderSummaryGraphProps) {
  const retailIsUp = retailVsYesterday >= 0;
  const wholesaleIsUp = wholesaleVsYesterday >= 0;
  const totalOrders = retail + wholesale;

  const retailShare = totalOrders > 0 ? Math.round((retail / totalOrders) * 100) : 0;
  const wholesaleShare = totalOrders > 0 ? Math.round((wholesale / totalOrders) * 100) : 0;

  const retailData = [
    { name: 'Retail Orders', value: Math.max(retail, 0), color: '#facc15' },
    { name: 'Remaining', value: Math.max(totalOrders - retail, totalOrders === 0 ? 1 : 0), color: 'var(--card-border)' },
  ];

  const wholesaleData = [
    { name: 'Wholesale Orders', value: Math.max(wholesale, 0), color: '#22c55e' },
    { name: 'Remaining', value: Math.max(totalOrders - wholesale, totalOrders === 0 ? 1 : 0), color: 'var(--card-border)' },
  ];

  function renderTooltip({
    active,
    payload,
    label,
  }: TooltipContentProps<ValueType, NameType>) {
    if (!active || !payload?.length) {
      return null;
    }

    const visibleSlice = payload.find((item) => item.name !== 'Remaining') ?? payload[0];
    const value =
      typeof visibleSlice?.value === 'number'
        ? visibleSlice.value
        : Number(visibleSlice?.value ?? 0);

    return (
      <div className={styles.tooltipCard}>
        <p className={styles.tooltipLabel}>{label}</p>
        <div className={styles.tooltipRow}>
          <span className={styles.tooltipKey}>
            <span
              className={styles.tooltipDot}
              style={{ backgroundColor: visibleSlice?.color ?? '#facc15' }}
            ></span>
            {visibleSlice?.name ?? 'Orders'}
          </span>
          <strong>{value.toLocaleString()}</strong>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <h2 className={styles.title}>Order Summary</h2>
        <p className={styles.total}>{totalOrders.toLocaleString()} total orders</p>
      </div>

      <div className={styles.charts}>
        {/* Retail */}
        <div className={styles.item}>
          <div className={styles.donut}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={renderTooltip} />
                <Pie
                  data={retailData}
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="72%"
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                  paddingAngle={2}
                  isAnimationActive
                >
                  {retailData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} fillOpacity={entry.name === 'Remaining' ? 0.28 : 1} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centerLabel}>
              <p className={styles.percentage}>{retailShare}%</p>
              <span className={styles.centerCaption}>share</span>
            </div>
          </div>
          <p className={styles.label}>Retail</p>
          <p className={styles.valueText}>{retail.toLocaleString()} orders</p>
          <p className={`${styles.vs} ${retailIsUp ? styles.up : styles.down}`}>
            <i
              className={`fa-solid ${
                retailIsUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
            ></i>{' '}
            {retailVsYesterday}% vs yesterday
          </p>
        </div>

        {/* Wholesale */}
        <div className={styles.item}>
          <div className={styles.donut}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={renderTooltip} />
                <Pie
                  data={wholesaleData}
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="72%"
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                  paddingAngle={2}
                  isAnimationActive
                >
                  {wholesaleData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} fillOpacity={entry.name === 'Remaining' ? 0.28 : 1} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className={styles.centerLabel}>
              <p className={styles.percentage}>{wholesaleShare}%</p>
              <span className={styles.centerCaption}>share</span>
            </div>
          </div>
          <p className={styles.label}>Wholesale</p>
          <p className={styles.valueText}>{wholesale.toLocaleString()} orders</p>
          <p
            className={`${styles.vs} ${
              wholesaleIsUp ? styles.up : styles.down
            }`}
          >
            <i
              className={`fa-solid ${
                wholesaleIsUp ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'
              }`}
            ></i>{' '}
            {wholesaleVsYesterday}% vs yesterday
          </p>
        </div>
      </div>

      {totalOrders === 0 ? (
        <p className={styles.emptyHint}>No order mix data yet. Hover the chart rings to inspect values.</p>
      ) : null}
    </div>
  );
}
