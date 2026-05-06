import OrderSummary from '../components/orders/OrderSummary';
import styles from './Orders.module.css';

export default function Orders() {
  return (
    <div className={styles.orders}>
      <OrderSummary />
    </div>
  );
}
