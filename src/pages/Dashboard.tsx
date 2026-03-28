import { useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ItemsOrders from '../components/dashboard/ItemsOrders';
import TotalSales from '../components/dashboard/TotalSales';
import ForDelivery from '../components/dashboard/ForDelivery';
import SalesOverview from '../components/dashboard/SalesOverview';
import OrderSummary from '../components/dashboard/OrderSummary';
import AgentSummary from '../components/dashboard/AgentSummary';
import styles from './Dashboard.module.css';

export default function Dashboard() {
  const [activeProducts] = useState(0);
  const [itemsOrders] = useState(0);
  const [ordersYesterday] = useState(0);
  const [salesTotal] = useState<number>(0);
  const [salesData] = useState<{ day: string; today: number; yesterday: number }[]>([]);

  return (
    <div className={styles.dashboard}>

      {/* Stat cards */}
      <div className={styles.statsRow}>
        <ActiveProducts count={activeProducts} />
        <ItemsOrders count={itemsOrders} yesterday={ordersYesterday} />
        <TotalSales count={0} yesterday={0} />
        <ForDelivery count={0} yesterday={0} />
      </div>

      {/* Charts */}
      <div className={styles.chartRow}>
        <SalesOverview total={salesTotal} data={salesData} />
        <OrderSummary
          retail={0}
          wholesale={0}
          retailVsYesterday={0}
          wholesaleVsYesterday={0}
        />
      </div>

      {/* Agent Summary — outside chartRow, it's a separate section */}
      <AgentSummary />

    </div>
  );
}