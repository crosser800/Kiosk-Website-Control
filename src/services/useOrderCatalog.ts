import { useCallback, useEffect, useState } from 'react';
import { loadOrderCatalog, type OrderCatalogProduct } from './orderCatalog';

export function useOrderCatalog(autoLoad = true) {
  const [products, setProducts] = useState<OrderCatalogProduct[]>([]);
  const [isLoading, setIsLoading] = useState(autoLoad);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      setProducts(await loadOrderCatalog());
    } catch (loadError) {
      setProducts([]);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load order catalog.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!autoLoad) {
      return;
    }
    void reload();
  }, [autoLoad, reload]);

  return { products, isLoading, error, reload };
}
