import { useEffect, useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ItemsOrders from '../components/dashboard/ItemsOrders';
import TotalSales from '../components/dashboard/TotalSales';
import ForDelivery from '../components/dashboard/ForDelivery';
import SalesOverview from '../components/dashboard/SalesOverview';
import OrderSummaryGraph from '../components/dashboard/OrderSummaryGraph';
import AgentSummary from '../components/dashboard/AgentSummary';
import { supabase } from '../lib/supabase';
import styles from './Dashboard.module.css';

function formatDateInManila(date: Date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default function Dashboard() {
  const [activeProducts, setActiveProducts] = useState(0);
  const [itemsOrders, setItemsOrders] = useState(0);
  const [ordersYesterday, setOrdersYesterday] = useState(0);
  const [salesTotal] = useState<number>(0);
  const [salesData] = useState<{ day: string; today: number; yesterday: number }[]>([]);
  const [isDashboardLoading, setIsDashboardLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const loadActiveProducts = async () => {
      const { count, error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Active');

      if (error) {
        console.error('Dashboard: failed to load active product count', error);
        if (!disposed) {
          setActiveProducts(0);
        }
        return;
      }

      if (!disposed) {
        setActiveProducts(count ?? 0);
      }
    };

    const loadItemsOrders = async () => {
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      const todayIso = formatDateInManila(today);
      const yesterdayIso = formatDateInManila(yesterday);

      const [{ count: todayCount, error: todayError }, { count: yesterdayCount, error: yesterdayError }] =
        await Promise.all([
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('order_date', todayIso),
          supabase
            .from('orders')
            .select('id', { count: 'exact', head: true })
            .eq('order_date', yesterdayIso),
        ]);

      if (todayError || yesterdayError) {
        console.error(
          'Dashboard: failed to load items orders counts',
          todayError ?? yesterdayError,
        );
        if (!disposed) {
          setItemsOrders(0);
          setOrdersYesterday(0);
        }
        return;
      }

      if (!disposed) {
        setItemsOrders(todayCount ?? 0);
        setOrdersYesterday(yesterdayCount ?? 0);
      }
    };

    void Promise.all([loadActiveProducts(), loadItemsOrders()]).finally(() => {
      if (!disposed) {
        setIsDashboardLoading(false);
      }
    });

    const productsChannel = supabase
      .channel('dashboard-active-products')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          void loadActiveProducts();
        },
      )
      .subscribe();

    const ordersChannel = supabase
      .channel('dashboard-items-orders')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          void loadItemsOrders();
        },
      )
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(productsChannel);
      void supabase.removeChannel(ordersChannel);
    };
  }, []);

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
            <ActiveProducts count={activeProducts} />
            <ItemsOrders count={itemsOrders} yesterday={ordersYesterday} />
            <TotalSales count={0} yesterday={0} />
            <ForDelivery count={0} yesterday={0} />
          </div>

          <div className={styles.chartRow}>
            <SalesOverview total={salesTotal} data={salesData} />
            <OrderSummaryGraph
              retail={0}
              wholesale={0}
              retailVsYesterday={0}
              wholesaleVsYesterday={0}
            />
          </div>
        </>
      )}

      <AgentSummary />
    </div>
  );
}
