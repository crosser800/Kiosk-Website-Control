import DailySales from '../components/sales/DailySales';
import MonthlySales from '../components/sales/MonthlySales';
import OrdersSales from '../components/sales/OrdersSales';
import YtdSales from '../components/sales/YtdSales';
import styles from './Sales.module.css';

export default function Sales() {
  return (
    <div className={styles.sales}>
      <div className={styles.statsRow}>
        <DailySales />
        <MonthlySales />
        <YtdSales />
      </div>
      <OrdersSales />
    </div>
  );
}
