import styles from './ActiveProducts.module.css';

type ActiveProductsProps = {
  count: number;
};

export default function ActiveProducts({ count }: ActiveProductsProps) {
  return (
    <div className={styles.card}>
      <p className={styles.label}>Active Products</p>
      <h2 className={styles.count}>{count.toLocaleString()}</h2>
      <p className={styles.subtitle}>current this day</p>
    </div>
  );
}
