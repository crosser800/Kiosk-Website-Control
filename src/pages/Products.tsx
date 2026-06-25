import { useEffect, useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ActiveVariations from '../components/dashboard/ActiveVariations';
import TopProducts from '../components/products/TopProducts';
import ProductCategoryWorkspace from '../components/products/ProductCategoryWorkspace';
import { supabase } from '../lib/supabase';
import styles from './Products.module.css';

type ProductVariationRow = {
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  sku_code: string | null;
};

function buildVariationGroupKey(variation: ProductVariationRow) {
  const normalizedVariationName = String(
    variation.variation_name ?? variation.class_name ?? '',
  )
    .trim()
    .toLowerCase();
  const normalizedSku = String(variation.sku_code ?? '').trim().toLowerCase();

  if (normalizedVariationName) {
    return `name::${normalizedVariationName}`;
  }

  return `sku::${normalizedSku}`;
}

export default function Products() {
  const [activeProducts, setActiveProducts] = useState(0);
  const [activeVariations, setActiveVariations] = useState(0);

  useEffect(() => {
    let disposed = false;

    const loadActiveProducts = async () => {
      const { count, error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Active');

      if (error) {
        console.error('Products: failed to load active product count', error);
        if (!disposed) {
          setActiveProducts(0);
        }
        return;
      }

      if (!disposed) {
        setActiveProducts(count ?? 0);
      }
    };

    const loadActiveVariations = async () => {
      const { data, error } = await supabase
        .from('product_variations')
        .select('product_id, variation_name, class_name, sku_code')
        .eq('availability', 'Available');

      if (error) {
        console.error('Products: failed to load active variation count', error);
        if (!disposed) {
          setActiveVariations(0);
        }
        return;
      }

      if (!disposed) {
        const groupedVariations = new Set(
          ((data ?? []) as ProductVariationRow[])
            .filter((row) => String(row.product_id ?? '').trim())
            .map(
              (row) =>
                `${String(row.product_id).trim().toLowerCase()}::${buildVariationGroupKey(row)}`,
            ),
        );
        setActiveVariations(groupedVariations.size);
      }
    };

    void loadActiveProducts();
    void loadActiveVariations();

    const productsChannel = supabase
      .channel('products-active-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        () => {
          void loadActiveProducts();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'product_variations' },
        () => {
          void loadActiveVariations();
        },
      )
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(productsChannel);
    };
  }, []);

  return (
    <div className={styles.products}>
      <div className={styles.statsRow}>
        <ActiveProducts count={activeProducts} />
        <ActiveVariations count={activeVariations} />
        <TopProducts />
      </div>

      <ProductCategoryWorkspace />
    </div>
  );
}
