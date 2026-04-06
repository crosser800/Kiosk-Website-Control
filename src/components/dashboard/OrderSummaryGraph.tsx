import styles from './OrderSummaryGraph.module.css';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

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

  const retailData = [{ value: retail }, { value: 100 - retail }];

  const wholesaleData = [{ value: wholesale }, { value: 100 - wholesale }];

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Order Summary</h2>

      <div className={styles.charts}>
        {/* Retail */}
        <div className={styles.item}>
          <div className={styles.donut}>
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={retailData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={68}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill="#f5c518" />
                  <Cell fill="var(--card-border)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <p className={styles.percentage}>{retail}%</p>
          </div>
          <p className={styles.label}>Retail</p>
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
            <ResponsiveContainer width={160} height={160}>
              <PieChart>
                <Pie
                  data={wholesaleData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={68}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill="#22c55e" />
                  <Cell fill="var(--card-border)" />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <p className={styles.percentage}>{wholesale}%</p>
          </div>
          <p className={styles.label}>Wholesale</p>
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
    </div>
  );
}
