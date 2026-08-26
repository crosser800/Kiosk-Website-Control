import { useEffect, useState } from 'react';
import ActiveProducts from '../components/dashboard/ActiveProducts';
import ActiveVariations from '../components/dashboard/ActiveVariations';
import TopProducts from '../components/products/TopProducts';
import ProductCategoryWorkspace from '../components/products/ProductCategoryWorkspace';
import { supabase } from '../lib/supabase';
import styles from './Products.module.css';

type ProductVariationRow = {
  id: string;
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  sku_code: string | null;
  availability: string | null;
};

function buildVariationGroupKey(variation: ProductVariationRow) {
  const normalizedVariationName = String(variation.variation_name ?? variation.class_name ?? '')
    .trim()
    .toLowerCase();
  const normalizedSku = String(variation.sku_code ?? '').trim().toLowerCase();

  if (normalizedVariationName || normalizedSku) {
    return `${normalizedVariationName}::${normalizedSku}`;
  }

  return `row::${String(variation.id ?? '').trim().toLowerCase()}`;
}

function isAvailableVariation(variation: ProductVariationRow) {
  const availability = String(variation.availability ?? '').trim().toLowerCase();
  return !['unavailable', 'inactive', 'archived', 'deleted'].includes(availability);
}

const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllVariationRows() {
  const rows: ProductVariationRow[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from('product_variations')
      .select('id, product_id, variation_name, class_name, sku_code, availability')
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as ProductVariationRow[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }

    from += SUPABASE_PAGE_SIZE;
  }
}

type ProductsProps = {
  view?: 'summary' | 'add';
  onOpenAddProduct?: () => void;
  onCloseAddProduct?: () => void;
  onRegisterNavigationGuard?: (guard: (() => Promise<boolean>) | null) => void;
};

export default function Products({ onRegisterNavigationGuard }: ProductsProps) {
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
      try {
        const data = await fetchAllVariationRows();
        if (!disposed) {
          const groupedVariations = new Set(
            data
              .filter((row) => String(row.product_id ?? '').trim() && isAvailableVariation(row))
              .map(
                (row) =>
                  `${String(row.product_id).trim().toLowerCase()}::${buildVariationGroupKey(row)}`,
              ),
          );
          setActiveVariations(groupedVariations.size);
        }
      } catch (error) {
        console.error('Products: failed to load active variation count', error);
        if (!disposed) {
          setActiveVariations(0);
        }
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

      <ProductCategoryWorkspace onRegisterNavigationGuard={onRegisterNavigationGuard} />
    </div>
  );
}
