// Data loading for the Products page (ProductCategoryWorkspace), kept out of
// the component so it can be tested. One load feeds the category grid, the
// global product search AND the page's Active Products / Active Variations
// counters, so the variation table is downloaded once per refresh.
import { supabase } from '../../lib/supabase';
import { fetchAllPages } from '../../services/fetchAllPages';

export type CategoryRow = {
  id: string;
  category_title: string | null;
  category_slug: string | null;
  category_image_url: string | null;
  status: string | null;
};

export type ProductRow = {
  id: string;
  category_id: string | null;
  product_name: string | null;
  sku_code: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

export type ProductMediaRow = {
  id: string;
  product_id: string | null;
  media_url: string | null;
  media_type: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  variation_id: string | null;
  status: string | null;
};

export type ProductVariationRow = {
  id: string;
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  sku_code: string | null;
  availability: string | null;
};

export type ProductListItem = {
  id: string;
  categoryId: string;
  name: string;
  skuCode: string;
  description: string;
  status: string;
  thumbnailUrl: string;
  variationCount: number;
  createdAt: string;
  // Search index fields (see productSearch.ts).
  categoryTitle: string;
  variationNames: string[];
  variationSkus: string[];
};

export type CategorySummary = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string;
  status: string;
  productCount: number;
  variationCount: number;
  products: ProductListItem[];
};

// Same definitions the Products page counters used when they ran their own
// queries: products with status exactly 'Active', and available logical
// variations (product + name + SKU) across ALL variation rows.
export type ProductCatalogStats = {
  activeProducts: number;
  activeVariations: number;
};

export type ProductWorkspace = {
  categories: CategorySummary[];
  stats: ProductCatalogStats;
};

// Display-only bucket for products whose category_id is empty or points to a
// category that was not loaded. Never written to the database: the editor
// and create modal receive null instead of this id.
export const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__';

// Pages are capped by the server's Max Rows anyway; fetchAllPages stays
// complete whatever that cap is, so a large page only saves requests.
const WORKSPACE_PAGE_SIZE = 1000;

export function buildVariationGroupKey(variation: ProductVariationRow) {
  const normalizedVariationName = String(variation.variation_name ?? variation.class_name ?? '')
    .trim()
    .toLowerCase();
  const normalizedSku = String(variation.sku_code ?? '').trim().toLowerCase();

  if (normalizedVariationName || normalizedSku) {
    return `${normalizedVariationName}::${normalizedSku}`;
  }

  return `row::${String(variation.id ?? '').trim().toLowerCase()}`;
}

export function isAvailableVariation(variation: ProductVariationRow) {
  const availability = String(variation.availability ?? '').trim().toLowerCase();
  return !['unavailable', 'inactive', 'archived', 'deleted'].includes(availability);
}

function countVariationCards(variations: ProductVariationRow[]) {
  return new Set(
    variations
      .filter(isAvailableVariation)
      .map((variation) => buildVariationGroupKey(variation)),
  ).size;
}

function normalizeStatus(status: string | null | undefined) {
  const normalized = String(status ?? '').trim();
  return normalized || 'Inactive';
}

function sortProducts(products: ProductListItem[]) {
  return [...products].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

function uniqueText(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const text = String(value ?? '').trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
}

export function computeCatalogStats(
  productRows: ProductRow[],
  variationRows: ProductVariationRow[],
): ProductCatalogStats {
  return {
    activeProducts: productRows.filter((row) => row.status === 'Active').length,
    activeVariations: new Set(
      variationRows
        .filter((row) => String(row.product_id ?? '').trim() && isAvailableVariation(row))
        .map((row) => `${String(row.product_id).trim().toLowerCase()}::${buildVariationGroupKey(row)}`),
    ).size,
  };
}

export function buildProductWorkspace(input: {
  categoryRows: CategoryRow[];
  productRows: ProductRow[];
  mediaRows: ProductMediaRow[];
  variationRows: ProductVariationRow[];
}): ProductWorkspace {
  const { categoryRows, productRows, mediaRows, variationRows } = input;
  const categoryTitleById = new Map(
    categoryRows.map((row) => [String(row.id), String(row.category_title ?? 'Untitled Category')]),
  );

  const mediaByProductId = new Map<string, ProductMediaRow[]>();
  mediaRows.forEach((row) => {
    const productId = String(row.product_id ?? '');
    if (!productId) return;
    const current = mediaByProductId.get(productId) ?? [];
    current.push(row);
    mediaByProductId.set(productId, current);
  });

  const variationsByProductId = new Map<string, ProductVariationRow[]>();
  variationRows.forEach((row) => {
    const productId = String(row.product_id ?? '');
    if (!productId) return;
    const current = variationsByProductId.get(productId) ?? [];
    current.push(row);
    variationsByProductId.set(productId, current);
  });

  const productsByCategoryId = new Map<string, ProductListItem[]>();
  productRows.forEach((row) => {
    // Products without a (loaded) category land in the display-only
    // Uncategorized bucket. Their category_id is left untouched.
    const rawCategoryId = String(row.category_id ?? '');
    const categoryId = categoryTitleById.has(rawCategoryId) ? rawCategoryId : UNCATEGORIZED_CATEGORY_ID;

    // Thumbnail contract: product-level (no variation_id), Active media only;
    // primary image, else first image, else first media item. Variation media
    // is never a fallback, which is why the query can skip it.
    const mediaItems = (mediaByProductId.get(String(row.id)) ?? []).filter(
      (item) => !item.variation_id && String(item.status ?? 'Active') === 'Active',
    );
    const primaryMedia =
      mediaItems.find((item) => item.is_primary && item.media_type === 'image') ??
      mediaItems.find((item) => item.media_type === 'image') ??
      mediaItems[0];
    const productVariations = variationsByProductId.get(String(row.id)) ?? [];

    const mappedProduct: ProductListItem = {
      id: String(row.id),
      categoryId,
      name: String(row.product_name ?? 'Untitled Product'),
      skuCode: String(row.sku_code ?? '-'),
      description: String(row.description ?? '').trim(),
      status: normalizeStatus(row.status),
      thumbnailUrl: String(primaryMedia?.media_url ?? ''),
      variationCount: countVariationCards(productVariations),
      createdAt: String(row.created_at ?? new Date().toISOString()),
      categoryTitle: categoryTitleById.get(categoryId) ?? '',
      variationNames: uniqueText(
        productVariations.flatMap((variation) => [variation.variation_name, variation.class_name]),
      ),
      variationSkus: uniqueText(productVariations.map((variation) => variation.sku_code)),
    };

    const current = productsByCategoryId.get(categoryId) ?? [];
    current.push(mappedProduct);
    productsByCategoryId.set(categoryId, current);
  });

  const summarize = (
    base: Omit<CategorySummary, 'productCount' | 'variationCount' | 'products'>,
  ): CategorySummary => {
    const categoryProducts = sortProducts(productsByCategoryId.get(base.id) ?? []);
    return {
      ...base,
      productCount: categoryProducts.length,
      variationCount: categoryProducts.reduce(
        (total, product) => total + product.variationCount,
        0,
      ),
      products: categoryProducts,
    };
  };

  const categories = categoryRows.map((row) =>
    summarize({
      id: String(row.id),
      title: String(row.category_title ?? 'Untitled Category'),
      slug: String(row.category_slug ?? ''),
      imageUrl: String(row.category_image_url ?? ''),
      status: normalizeStatus(row.status),
    }),
  );

  if ((productsByCategoryId.get(UNCATEGORIZED_CATEGORY_ID) ?? []).length > 0) {
    categories.push(
      summarize({
        id: UNCATEGORIZED_CATEGORY_ID,
        title: 'Uncategorized',
        slug: '',
        imageUrl: '',
        status: 'No Category',
      }),
    );
  }

  return { categories, stats: computeCatalogStats(productRows, variationRows) };
}

function fetchWorkspaceTable<Row extends { id: unknown }>(
  label: string,
  buildPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null; count: number | null }>,
) {
  return fetchAllPages<Row>(
    label,
    (from, to) =>
      buildPage(from, to).then((response) => ({
        data: (response.data ?? null) as Row[] | null,
        error: response.error,
        count: response.count,
      })),
    { pageSize: WORKSPACE_PAGE_SIZE },
  );
}

export async function loadProductWorkspace(): Promise<ProductWorkspace> {
  const [categoryRows, productRows, mediaRows, variationRows] = await Promise.all([
    fetchWorkspaceTable<CategoryRow>('product categories', (from, to) =>
      supabase
        .from('product_categories')
        .select('id, category_title, category_slug, category_image_url, status', { count: 'exact' })
        .order('category_title', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchWorkspaceTable<ProductRow>('products', (from, to) =>
      supabase
        .from('products')
        .select('id, category_id, product_name, sku_code, description, status, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    // Only rows the thumbnail contract can use: product-level media that is
    // Active (or has no status, which the client also treats as Active).
    fetchWorkspaceTable<ProductMediaRow>('product media', (from, to) =>
      supabase
        .from('product_media')
        .select('id, product_id, media_url, media_type, is_primary, sort_order, variation_id, status', { count: 'exact' })
        .is('variation_id', null)
        .or('status.eq.Active,status.is.null')
        .order('sort_order', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchWorkspaceTable<ProductVariationRow>('product variations', (from, to) =>
      supabase
        .from('product_variations')
        .select('id, product_id, variation_name, class_name, sku_code, availability', { count: 'exact' })
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ]);

  return buildProductWorkspace({ categoryRows, productRows, mediaRows, variationRows });
}
