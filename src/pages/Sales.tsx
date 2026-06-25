import DailySales from '../components/sales/DailySales';
import MonthlySales from '../components/sales/MonthlySales';
import OrdersSales from '../components/sales/OrdersSales';
import YearlySales from '../components/sales/YearlySales';
import YtdSales from '../components/sales/YtdSales';
import styles from './Sales.module.css';

export default function Sales() {
  return (
    <div className={styles.sales}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Sales workspace</p>
          <h1 className={styles.title}>Sales</h1>
          <p className={styles.subtitle}>
            Review daily movement, yearly pace, and order performance in one view.
          </p>
        </div>
      </section>

      <div className={styles.statsRow}>
        <DailySales />
        <MonthlySales />
        <YearlySales />
        <YtdSales />
      </div>

      <OrdersSales />
    </div>
  );
}
