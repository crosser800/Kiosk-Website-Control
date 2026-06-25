import OrderSummary from '../components/orders/OrderSummary';
import styles from './Orders.module.css';

export default function Orders() {
  return (
    <div className={styles.orders}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Operations workspace</p>
          <h1 className={styles.title}>Orders</h1>
          <p className={styles.subtitle}>
            Monitor order flow, review schedule windows, and manage status updates in one place.
          </p>
        </div>
      </section>

      <OrderSummary />
    </div>
  );
}
