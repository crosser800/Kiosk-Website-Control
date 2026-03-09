import styles from './SalesOverview.module.css';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

type SalesOverviewProps = {
  total: number;
  data: {
    day: string;
    today: number;
    yesterday: number;
  }[];
};

const formatY = (value: number | undefined) => {
  if (!value) return '0';
  if (value >= 1000) return `${value / 1000}K`;
  return value.toString();
};

export default function SalesOverview({ total, data }: SalesOverviewProps) {
  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <h2 className={styles.title}>Sales Overview</h2>
        <p className={styles.total}>
          PHP <span>{total.toLocaleString()}</span>
        </p>
      </div>

      {data.length === 0 ? (
        <div className={styles.empty}>
          <i className="fa-solid fa-chart-simple"></i>
          <p>No data yet</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={data} barCategoryGap="30%" barGap={4}>
            <CartesianGrid vertical={false} stroke="var(--card-border)" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatY} axisLine={false} tickLine={false} />
            <Tooltip
              formatter={(value: number | undefined) =>
                value ? `PHP ${value.toLocaleString()}` : 'PHP 0'
              }
            />
            <Legend />
            <Bar
              dataKey="today"
              name="Today"
              fill="#22c55e"
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="yesterday"
              name="Yesterday"
              fill="#f5c518"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
