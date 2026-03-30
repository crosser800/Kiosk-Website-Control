import { useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ItemsOrders from '../components/dashboard/ItemsOrders';
import ProductSummary from '../components/products/ProductSummary';
import TopProducts from '../components/products/TopProducts';
import styles from './Products.module.css';

export default function Products() {
  const [activeProducts] = useState(0);
  const [itemsOrders] = useState(0);
  const [ordersYesterday] = useState(0);

  return (
    <div className={styles.products}>
      <div className={styles.statsRow}>
        <ActiveProducts count={activeProducts} />
        <ItemsOrders count={itemsOrders} yesterday={ordersYesterday} />
        <TopProducts />
      </div>

      <ProductSummary />
    </div>
  );
}
