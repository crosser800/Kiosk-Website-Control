import { useEffect, useState } from 'react';
import styles from './TopProducts.module.css';
import {
  getTopProducts,
  type TopProductRecord,
} from '../../services/topProducts';

const DESKTOP_SLOT_COUNT = 5;
const MOBILE_SLOT_COUNT = 10;
const FALLBACK_ITEM_COUNT = 20;
const INTERVAL = 3000;

function buildDisplayProducts(
  products: TopProductRecord[],
  currentPage: number,
  slotCount: number,
) {
  const startIndex = currentPage * slotCount;

  return Array.from({ length: slotCount }, (_, index) => {
    const product = products[startIndex + index];
    const rank = startIndex + index + 1;

    return {
      rank,
      productName: product?.productName ?? '',
      imageUrl: product?.imageUrl ?? '',
    };
  });
}

export default function TopProducts() {
  const [products, setProducts] = useState<TopProductRecord[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches,
  );

  const slotCount = isMobile ? MOBILE_SLOT_COUNT : DESKTOP_SLOT_COUNT;
  const itemCount = Math.max(products.length, FALLBACK_ITEM_COUNT);
  const totalPages = Math.ceil(itemCount / slotCount);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 700px)');
    const handleViewportChange = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      setCurrentPage(0);
    };

    setIsMobile(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleViewportChange);
    return () => mediaQuery.removeEventListener('change', handleViewportChange);
  }, []);

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

  const displayProducts = buildDisplayProducts(products, currentPage, slotCount);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>AVAILABLE PRODUCTS</h2>
          <p className={styles.subtitle}>Current product lineup preview.</p>
        </div>
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
          <div key={product.rank} className={styles.itemWrap}>
            <div className={styles.item}>
              <div className={styles.visualRow}>
                <div className={styles.rankBadge}>{product.rank}</div>

                <div className={styles.imageWrapper}>
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.productName || `Product ${product.rank}`}
                      className={styles.image}
                    />
                  ) : (
                    <div className={styles.imagePlaceholder}>
                      <i className="fa-solid fa-box-open"></i>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <span className={styles.productName}>{product.productName || '\u00A0'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
