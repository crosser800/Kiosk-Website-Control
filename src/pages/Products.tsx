import { useCallback, useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ActiveVariations from '../components/dashboard/ActiveVariations';
import TopProducts from '../components/products/TopProducts';
import ProductCategoryWorkspace from '../components/products/ProductCategoryWorkspace';
import type { ProductCatalogStats } from '../components/products/productWorkspaceData';
import styles from './Products.module.css';

type ProductsProps = {
  view?: 'summary' | 'add';
  onOpenAddProduct?: () => void;
  onCloseAddProduct?: () => void;
  onRegisterNavigationGuard?: (guard: (() => Promise<boolean>) | null) => void;
};

export default function Products({ onRegisterNavigationGuard }: ProductsProps) {
  // Counters come from the workspace's own (paginated, realtime-batched)
  // load instead of a second products count + full variation download.
  const [catalogStats, setCatalogStats] = useState<ProductCatalogStats>({
    activeProducts: 0,
    activeVariations: 0,
  });
  const handleCatalogStatsChange = useCallback((next: ProductCatalogStats) => {
    // Skip the parent re-render when a refresh did not change the counts.
    setCatalogStats((current) =>
      current.activeProducts === next.activeProducts && current.activeVariations === next.activeVariations
        ? current
        : next,
    );
  }, []);

  return (
    <div className={styles.products}>
      <div className={styles.statsRow}>
        <ActiveProducts count={catalogStats.activeProducts} />
        <ActiveVariations count={catalogStats.activeVariations} />
        <TopProducts />
      </div>

      <ProductCategoryWorkspace
        onRegisterNavigationGuard={onRegisterNavigationGuard}
        onCatalogStatsChange={handleCatalogStatsChange}
      />
    </div>
  );
}
