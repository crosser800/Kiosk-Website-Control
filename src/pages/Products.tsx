import { useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ItemsOrders from '../components/dashboard/ItemsOrders';
import AddProduct from '../components/products/AddProduct';
import ProductSummary from '../components/products/ProductSummary';
import TopProducts from '../components/products/TopProducts';
import styles from './Products.module.css';

type ProductView = 'summary' | 'add';

type ProductsProps = {
  view: ProductView;
  onOpenAddProduct: () => void;
  onCloseAddProduct: () => void;
};

export default function Products({
  view,
  onOpenAddProduct,
  onCloseAddProduct,
}: ProductsProps) {
  const [activeProducts] = useState(0);
  const [itemsOrders] = useState(0);
  const [ordersYesterday] = useState(0);

  if (view === 'add') {
    return (
      <div className={styles.products}>
        <AddProduct onCancel={onCloseAddProduct} />
      </div>
    );
  }

  return (
    <div className={styles.products}>
      <div className={styles.statsRow}>
        <ActiveProducts count={activeProducts} />
        <ItemsOrders count={itemsOrders} yesterday={ordersYesterday} />
        <TopProducts />
      </div>

      <ProductSummary onAddProduct={onOpenAddProduct} />
    </div>
  );
}
