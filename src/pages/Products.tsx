import { useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ItemsOrders from '../components/dashboard/ItemsOrders';
import styles from './Products.module.css';

export default function Products() {

  const [activeProducts] = useState(0);
  const [itemsOrders] = useState(0);
  const [ordersYesterday] = useState(0);

  return (
    <div className={styles.products}>
      {/* Stat cards */}
      <div className={styles.statsRow}>
        <ActiveProducts count={activeProducts} />
        <ItemsOrders count={itemsOrders} yesterday={ordersYesterday} />
      </div>
    </div>
  );
}