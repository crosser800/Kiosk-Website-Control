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
import type { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

type SalesOverviewProps = {
  total: number;
  data: {
    day: string;
    today: number;
    yesterday: number;
  }[];
};

const toNumber = (value: ValueType | undefined) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const formatY = (value: ValueType | undefined) => {
  const numericValue = toNumber(value);
  if (!numericValue) return '0';
  if (numericValue >= 1000) return `${numericValue / 1000}K`;
  return numericValue.toString();
};

const formatTooltipValue = (value: ValueType | undefined, _name: NameType | undefined) => {
  const numericValue = toNumber(value);
  return `PHP ${numericValue.toLocaleString()}`;
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
            <Tooltip formatter={formatTooltipValue} />
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
