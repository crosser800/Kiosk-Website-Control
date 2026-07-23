import { useCallback, useEffect, useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ItemsOrders from '../components/dashboard/ItemsOrders';
import TotalSales from '../components/dashboard/TotalSales';
import ForDelivery from '../components/dashboard/ForDelivery';
import SalesOverview from '../components/dashboard/SalesOverview';
import OrderSummaryGraph from '../components/dashboard/OrderSummaryGraph';
import AgentSummary from '../components/dashboard/AgentSummary';
import type {
  DashboardPriceMixSummary,
  DashboardStatusSummary,
} from '../components/dashboard/OrderSummaryGraph';
import { supabase } from '../lib/supabase';
import {
  COMPLETED_DISPLAY_STATUS,
  COMPLETED_RAW_STATUSES,
  addDays,
  getBusinessDateRanges,
  isCompletedAtInRange,
  resolveCompletedAt,
  toBusinessDateLabel,
  toBusinessDayLabel,
} from '../services/completedSales';
import styles from './Dashboard.module.css';

type DashboardOrderRow = {
  id: string;
  agent_id: string | null;
  order_status: string | null;
  price_code: string | null;
  preference_type: string | null;
  grand_total: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type DashboardStatusHistoryRow = {
  order_id: string | null;
  status: string | null;
  changed_at: string | null;
};

type DashboardSnapshot = {
  activeProducts: number;
  todayOrders: number;
  yesterdayOrders: number;
  todaySales: number;
  yesterdaySales: number;
  deliveryQueue: number;
  deliveryYesterday: number;
  weeklySalesTotal: number;
  weeklySalesData: Array<{
    day: string;
    date: string;
    previousDate: string;
    thisWeek: number;
    previousWeek: number;
  }>;
  statusSummary: DashboardStatusSummary[];
  priceMix: DashboardPriceMixSummary[];
};

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  activeProducts: 0,
  todayOrders: 0,
  yesterdayOrders: 0,
  todaySales: 0,
  yesterdaySales: 0,
  deliveryQueue: 0,
  deliveryYesterday: 0,
  weeklySalesTotal: 0,
  weeklySalesData: [],
  statusSummary: [],
  priceMix: [],
};

const STATUS_LABELS = ['Placed', 'Confirmed', 'Preparing', 'Ready', 'Delivering', 'Completed', 'Cancelled'];
const DELIVERY_STATUSES = ['ready', 'delivering'];

function isDateInRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed >= start && parsed < end;
}

function normalizeStatus(value: string | null | undefined) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'processing') return 'Preparing';
  if (normalized === 'delivered') return COMPLETED_DISPLAY_STATUS;
  if (normalized === 'completed') return COMPLETED_DISPLAY_STATUS;
  if (normalized === 'cancelled') return 'Cancelled';
  if (normalized === 'confirmed') return 'Confirmed';
  if (normalized === 'ready') return 'Ready';
  if (normalized === 'delivering') return 'Delivering';
  return 'Placed';
}

function mapPriceClass(order: DashboardOrderRow) {
  const code = String(order.price_code ?? '').trim().toUpperCase();
  if (code === 'R1' || code === 'R2') return 'Retail';
  if (code === 'W1' || code === 'W2') return 'Wholesale';
  if (code === 'SP') return 'Special';
  if (code === 'CP') return 'Concept Store';

  const preference = String(order.preference_type ?? '').trim();
  return preference || 'Other';
}

function sumSales(rows: Array<DashboardOrderRow & { completed_at: string | null }>) {
  return rows.reduce((sum, row) => sum + Number(row.grand_total ?? 0), 0);
}

function buildStatusSummary(orders: DashboardOrderRow[]) {
  const counts = new Map(STATUS_LABELS.map((label) => [label, 0]));
  orders.forEach((order) => {
    const status = normalizeStatus(order.order_status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  });

  const total = orders.length;
  return STATUS_LABELS.map((status) => {
    const count = counts.get(status) ?? 0;
    return {
      status,
      count,
      share: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
}

function buildPriceMix(completedOrders: Array<DashboardOrderRow & { completed_at: string | null }>) {
  const totals = new Map<string, { count: number; sales: number }>();
  completedOrders.forEach((order) => {
    const label = mapPriceClass(order);
    const current = totals.get(label) ?? { count: 0, sales: 0 };
    current.count += 1;
    current.sales += Number(order.grand_total ?? 0);
    totals.set(label, current);
  });

  const totalSales = Array.from(totals.values()).reduce((sum, item) => sum + item.sales, 0);
  return ['Retail', 'Wholesale', 'Special', 'Concept Store', 'Other']
    .map((label) => {
      const current = totals.get(label) ?? { count: 0, sales: 0 };
      return {
        label,
        count: current.count,
        sales: current.sales,
        share: totalSales > 0 ? Math.round((current.sales / totalSales) * 100) : 0,
      };
    })
    .filter((item) => item.count > 0 || item.label === 'Retail' || item.label === 'Wholesale');
}

function buildWeeklySalesData(completedOrders: Array<DashboardOrderRow & { completed_at: string | null }>) {
  const ranges = getBusinessDateRanges();
  return Array.from({ length: 7 }, (_, index) => {
    const currentStart = addDays(ranges.currentWeek.start, index);
    const currentEnd = addDays(currentStart, 1);
    const previousStart = addDays(ranges.previousWeek.start, index);
    const previousEnd = addDays(previousStart, 1);

    return {
      day: toBusinessDayLabel(currentStart),
      date: toBusinessDateLabel(currentStart),
      previousDate: toBusinessDateLabel(previousStart),
      thisWeek: sumSales(completedOrders.filter((order) => isDateInRange(order.completed_at, currentStart, currentEnd))),
      previousWeek: sumSales(
        completedOrders.filter((order) => isDateInRange(order.completed_at, previousStart, previousEnd)),
      ),
    };
  });
}

export default function Dashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY_SNAPSHOT);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    setIsDashboardLoading(true);
    const ranges = getBusinessDateRanges();

    const [{ count: activeCount, error: activeError }, { data: orderRows, error: orderError }] = await Promise.all([
      supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Active'),
      supabase
        .from('orders')
        .select('id, agent_id, order_status, price_code, preference_type, grand_total, created_at, updated_at'),
    ]);

    if (activeError || orderError) {
      console.error('Dashboard: failed to load live summary', activeError ?? orderError);
      setSnapshot(EMPTY_SNAPSHOT);
      setIsDashboardLoading(false);
      return;
    }

    const orders = (orderRows ?? []) as DashboardOrderRow[];
    const completedSourceOrders = orders.filter((order) =>
      COMPLETED_RAW_STATUSES.some((status) => status.toLowerCase() === String(order.order_status ?? '').toLowerCase()),
    );

    let completedHistoryRows: DashboardStatusHistoryRow[] = [];
    const completedOrderIds = completedSourceOrders.map((order) => order.id);
    if (completedOrderIds.length > 0) {
      const { data: historyRows, error: historyError } = await supabase
        .from('order_status_history')
        .select('order_id, status, changed_at')
        .in('order_id', completedOrderIds)
        .in('status', COMPLETED_RAW_STATUSES)
        .order('changed_at', { ascending: true });

      if (historyError) {
        console.error('Dashboard: failed to load completed status history', historyError);
      } else {
        completedHistoryRows = (historyRows ?? []) as DashboardStatusHistoryRow[];
      }
    }

    const completedHistoryByOrderId = new Map<string, string>();
    completedHistoryRows.forEach((row) => {
      const orderId = String(row.order_id ?? '');
      if (!orderId || !row.changed_at || completedHistoryByOrderId.has(orderId)) return;
      completedHistoryByOrderId.set(orderId, row.changed_at);
    });

    const completedOrders = completedSourceOrders.map((order) => ({
      ...order,
      completed_at: resolveCompletedAt(order, completedHistoryByOrderId),
    }));

    const todayOrders = orders.filter((order) => isDateInRange(order.created_at, ranges.today.start, ranges.today.end));
    const yesterdayOrders = orders.filter((order) =>
      isDateInRange(order.created_at, ranges.yesterdayRange.start, ranges.yesterdayRange.end),
    );
    const todaySalesOrders = completedOrders.filter((order) => isCompletedAtInRange(order.completed_at, ranges.today));
    const yesterdaySalesOrders = completedOrders.filter((order) =>
      isCompletedAtInRange(order.completed_at, ranges.yesterdayRange),
    );
    const deliveryOrders = orders.filter((order) =>
      DELIVERY_STATUSES.includes(String(order.order_status ?? '').trim().toLowerCase()),
    );
    const deliveryYesterday = deliveryOrders.filter((order) =>
      isDateInRange(order.created_at, ranges.yesterdayRange.start, ranges.yesterdayRange.end),
    );
    const weeklySalesData = buildWeeklySalesData(completedOrders);

    setSnapshot({
      activeProducts: activeCount ?? 0,
      todayOrders: todayOrders.length,
      yesterdayOrders: yesterdayOrders.length,
      todaySales: sumSales(todaySalesOrders),
      yesterdaySales: sumSales(yesterdaySalesOrders),
      deliveryQueue: deliveryOrders.length,
      deliveryYesterday: deliveryYesterday.length,
      weeklySalesTotal: weeklySalesData.reduce((sum, row) => sum + row.thisWeek, 0),
      weeklySalesData,
      statusSummary: buildStatusSummary(orders),
      priceMix: buildPriceMix(completedOrders),
    });
    setIsDashboardLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    const productsChannel = supabase
      .channel('dashboard-active-products')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void loadDashboard();
      })
      .subscribe();

    const ordersChannel = supabase
      .channel('dashboard-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void loadDashboard();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history' }, () => {
        void loadDashboard();
      })
      .subscribe();

    return () => {
      window.clearTimeout(timeoutId);
      void supabase.removeChannel(productsChannel);
      void supabase.removeChannel(ordersChannel);
    };
  }, [loadDashboard]);

  return (
    <div className={styles.dashboard}>
      {isDashboardLoading ? (
        <>
          <div className={styles.statsRow}>
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`dashboard-stat-skeleton-${index}`} className={styles.statSkeletonCard}>
                <div className={styles.statSkeletonTop}>
                  <div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonTrend}`}></div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}></div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonValue}`}></div>
                  </div>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonIcon}`}></div>
                </div>
                <div className={styles.statSkeletonWaveWrap}>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonWave}`}></div>
                </div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonCaption}`}></div>
              </div>
            ))}
          </div>

          <div className={styles.chartRow}>
            <div className={styles.chartSkeletonCard}>
              <div className={`${styles.skeletonBlock} ${styles.skeletonChartTitle}`}></div>
              <div className={`${styles.skeletonBlock} ${styles.skeletonChartTotal}`}></div>
              <div className={styles.chartSkeletonLegend}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLegendItem}`}></div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLegendItem}`}></div>
              </div>
              <div className={`${styles.skeletonBlock} ${styles.skeletonChartBars}`}></div>
            </div>

            <div className={styles.chartSkeletonCard}>
              <div className={`${styles.skeletonBlock} ${styles.skeletonChartTitle}`}></div>
              <div className={`${styles.skeletonBlock} ${styles.skeletonChartSubtitle}`}></div>
              <div className={styles.donutSkeletonRow}>
                <div className={styles.donutSkeletonItem}>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonDonut}`}></div>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonLegendItem}`}></div>
                </div>
                <div className={styles.donutSkeletonItem}>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonDonut}`}></div>
                  <div className={`${styles.skeletonBlock} ${styles.skeletonLegendItem}`}></div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className={styles.statsRow}>
            <ActiveProducts count={snapshot.activeProducts} />
            <ItemsOrders count={snapshot.todayOrders} yesterday={snapshot.yesterdayOrders} />
            <TotalSales count={snapshot.todaySales} yesterday={snapshot.yesterdaySales} />
            <ForDelivery count={snapshot.deliveryQueue} yesterday={snapshot.deliveryYesterday} />
          </div>

          <div className={styles.chartRow}>
            <SalesOverview total={snapshot.weeklySalesTotal} data={snapshot.weeklySalesData} />
            <OrderSummaryGraph statuses={snapshot.statusSummary} priceMix={snapshot.priceMix} />
          </div>
        </>
      )}

      <AgentSummary />
    </div>
  );
}
