import { useEffect, useState } from 'react';
import styles from './TopProducts.module.css';
import {
  getTopProducts,
  type TopProductRecord,
} from '../../services/topProducts';

const SLOT_COUNT = 5;
const FALLBACK_ITEM_COUNT = 20;
const INTERVAL = 3000;

function buildDisplayProducts(products: TopProductRecord[], currentPage: number) {
  const startIndex = currentPage * SLOT_COUNT;

  return Array.from({ length: SLOT_COUNT }, (_, index) => {
    const product = products[startIndex + index];
    const rank = startIndex + index + 1;

    return {
      rank,
      itemCode: product?.itemCode ?? '',
      imageUrl: product?.imageUrl ?? '',
    };
  });
}

export default function TopProducts() {
  const [products, setProducts] = useState<TopProductRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const itemCount = Math.max(products.length, FALLBACK_ITEM_COUNT);
  const totalPages = Math.ceil(itemCount / SLOT_COUNT);

  useEffect(() => {
    let isMounted = true;

    async function loadTopProducts() {
      const records = await getTopProducts();

      if (isMounted) {
        setProducts(records);
      }
    }

    void loadTopProducts();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentPage((prev) => (prev + 1) % totalPages);
    }, INTERVAL);

    return () => clearInterval(timer);
  }, [totalPages]);

  const displayProducts = buildDisplayProducts(products, currentPage);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>TOP PRODUCTS</h2>
        <div className={styles.dots}>
          {Array.from({ length: totalPages }).map((_, index) => (
            <button
              key={index}
              type="button"
              className={`${styles.dot} ${index === currentPage ? styles.dotActive : ''}`}
              onClick={() => setCurrentPage(index)}
              aria-label={`Show page ${index + 1}`}
            />
          ))}
        </div>
      </div>

      <div className={styles.list}>
        {displayProducts.map((product) => (
          <div key={product.rank} className={styles.item}>
            <div className={styles.visualRow}>
              <span className={styles.rank}>{product.rank}.</span>

              <div className={styles.imageWrapper}>
                {product.imageUrl ? (
                  <img
                    src={product.imageUrl}
                    alt={product.itemCode || `Top product ${product.rank}`}
                    className={styles.image}
                  />
                ) : (
                  <div className={styles.imagePlaceholder} />
                )}
              </div>
            </div>

            <span className={styles.itemCode}>{product.itemCode || '\u00A0'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
