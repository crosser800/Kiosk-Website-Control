import styles from './SalesOverview.module.css';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import type { ValueType } from 'recharts/types/component/DefaultTooltipContent';

type SalesOverviewProps = {
  total: number;
  data: {
    day: string;
    date: string;
    previousDate: string;
    thisWeek: number;
    previousWeek: number;
  }[];
};

const EMPTY_CHART_DATA = [
  { day: 'Mon', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
  { day: 'Tue', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
  { day: 'Wed', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
  { day: 'Thu', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
  { day: 'Fri', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
  { day: 'Sat', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
  { day: 'Sun', date: '-', previousDate: '-', thisWeek: 0, previousWeek: 0 },
];

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

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{
    color?: string;
    dataKey?: string;
    value?: ValueType;
    payload?: { date?: string; previousDate?: string };
  }>;
  label?: string;
}) {
  if (!active) {
    return null;
  }

  const thisWeekEntry = payload?.find((entry) => entry.dataKey === 'thisWeek');
  const previousWeekEntry = payload?.find((entry) => entry.dataKey === 'previousWeek');
  const thisWeekValue = toNumber(thisWeekEntry?.value);
  const previousWeekValue = toNumber(previousWeekEntry?.value);
  const row = payload?.[0]?.payload;

  return (
    <div className={styles.tooltipCard}>
      <p className={styles.tooltipLabel}>{label}</p>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey}>
          <span className={styles.tooltipDotToday}></span>
          This Week {row?.date ? `(${row.date})` : ''}
        </span>
        <strong>PHP {thisWeekValue.toLocaleString()}</strong>
      </div>
      <div className={styles.tooltipRow}>
        <span className={styles.tooltipKey}>
          <span className={styles.tooltipDotYesterday}></span>
          Previous Week {row?.previousDate ? `(${row.previousDate})` : ''}
        </span>
        <strong>PHP {previousWeekValue.toLocaleString()}</strong>
      </div>
    </div>
  );
}

export default function SalesOverview({ total, data }: SalesOverviewProps) {
  const chartData = data.length > 0 ? data : EMPTY_CHART_DATA;
  const hasRealData = data.some((entry) => entry.thisWeek > 0 || entry.previousWeek > 0);

  return (
    <div className={styles.card}>
      <div className={styles.top}>
        <h2 className={styles.title}>Sales Overview</h2>
        <p className={styles.total}>
          PHP <span>{total.toLocaleString()}</span>
        </p>
      </div>

      <div className={styles.legendRow}>
        <span className={styles.legendItem}>
          <span className={styles.legendDotToday}></span>
          This Week
        </span>
        <span className={styles.legendItem}>
          <span className={styles.legendDotYesterday}></span>
          Previous Week
        </span>
      </div>

      <div className={styles.chartWrap}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barCategoryGap="26%" barGap={6}>
            <defs>
              <linearGradient id="salesTodayFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#16a34a" stopOpacity="0.7" />
              </linearGradient>
              <linearGradient id="salesYesterdayFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#facc15" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.7" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--card-border)" strokeDasharray="4 4" />
            <XAxis dataKey="day" axisLine={false} tickLine={false} />
            <YAxis tickFormatter={formatY} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip
              cursor={{ fill: 'rgba(250, 204, 21, 0.08)' }}
              content={<CustomTooltip />}
            />
            <Bar dataKey="thisWeek" name="This Week" fill="url(#salesTodayFill)" radius={[10, 10, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={`today-${entry.day}`}
                  fillOpacity={hasRealData ? 1 : 0.45}
                />
              ))}
            </Bar>
            <Bar dataKey="previousWeek" name="Previous Week" fill="url(#salesYesterdayFill)" radius={[10, 10, 0, 0]}>
              {chartData.map((entry) => (
                <Cell
                  key={`yesterday-${entry.day}`}
                  fillOpacity={hasRealData ? 0.9 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {!hasRealData ? (
        <p className={styles.emptyHint}>No completed sales recorded for this week.</p>
      ) : null}
    </div>
  );
}
