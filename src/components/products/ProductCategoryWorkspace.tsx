import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AddProduct from './AddProduct';
import ProductCreateModal from './ProductCreateModal';
import { normalizeSearchText, searchProducts } from './productSearch';
import styles from './ProductCategoryWorkspace.module.css';

type CategoryRow = {
  id: string;
  category_title: string | null;
  category_slug: string | null;
  category_image_url: string | null;
  status: string | null;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  product_name: string | null;
  sku_code: string | null;
  description: string | null;
  status: string | null;
  created_at: string | null;
};

type ProductMediaRow = {
  id: string;
  product_id: string | null;
  media_url: string | null;
  media_type: string | null;
  is_primary: boolean | null;
  sort_order: number | null;
  variation_id: string | null;
  status: string | null;
};

type ProductVariationRow = {
  id: string;
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  sku_code: string | null;
  availability: string | null;
};

type ProductListItem = {
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

type CategorySummary = {
  id: string;
  title: string;
  slug: string;
  imageUrl: string;
  status: string;
  productCount: number;
  variationCount: number;
  products: ProductListItem[];
};

type EditorMode = 'create' | 'edit';

const SUPABASE_PAGE_SIZE = 1000;
const SEARCH_RESULT_LIMIT = 60;

// Display-only bucket for products whose category_id is empty or points to a
// category that was not loaded. Never written to the database: the editor
// and create modal receive null instead of this id.
const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__';

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

function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function getCategoryDescription(categoryTitle: string, productCount: number) {
  if (productCount === 0) {
    return `No products added under ${categoryTitle} yet.`;
  }

  return `Manage products and variations under ${categoryTitle}.`;
}

function sortProducts(products: ProductListItem[]) {
  return [...products].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
  );
}

// Pages through a query so the workspace (and its search) never silently
// stops at the server's per-request row cap.
async function fetchAllRows<Row>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
) {
  const rows: Row[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) {
      throw new Error(error.message);
    }

    const page = (data ?? []) as Row[];
    rows.push(...page);

    if (page.length < SUPABASE_PAGE_SIZE) {
      return rows;
    }

    from += SUPABASE_PAGE_SIZE;
  }
}

function fetchAllVariationRows() {
  return fetchAllRows<ProductVariationRow>((from, to) =>
    supabase
      .from('product_variations')
      .select('id, product_id, variation_name, class_name, sku_code, availability')
      .order('id', { ascending: true })
      .range(from, to),
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

type ProductCategoryWorkspaceProps = {
  onRegisterNavigationGuard?: (guard: (() => Promise<boolean>) | null) => void;
};

export default function ProductCategoryWorkspace({
  onRegisterNavigationGuard,
}: ProductCategoryWorkspaceProps) {
  const PRODUCTS_PER_PAGE = 8;
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshNotice, setRefreshNotice] = useState('');
  const [searchValue, setSearchValue] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>('edit');
  const [productSearchValue, setProductSearchValue] = useState('');
  const [productPage, setProductPage] = useState(1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editorInitialSection, setEditorInitialSection] =
    useState<'Basic Information' | 'Images' | 'Variation & Pricing'>('Basic Information');

  async function fetchWorkspaceData() {
    const [categoriesRes, productRows, mediaRows, variationRows] = await Promise.all([
      supabase
        .from('product_categories')
        .select('id, category_title, category_slug, category_image_url, status')
        .order('category_title'),
      // Paged with an id tie-breaker so no product is skipped or repeated
      // between pages; the search index needs the complete catalog.
      fetchAllRows<ProductRow>((from, to) =>
        supabase
          .from('products')
          .select('id, category_id, product_name, sku_code, description, status, created_at')
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllRows<ProductMediaRow>((from, to) =>
        supabase
          .from('product_media')
          .select('id, product_id, media_url, media_type, is_primary, sort_order, variation_id, status')
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to),
      ),
      fetchAllVariationRows(),
    ]);

    if (categoriesRes.error) {
      throw new Error(categoriesRes.error.message);
    }

    const categoryRows = (categoriesRes.data as CategoryRow[] | null | undefined) ?? [];
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
      // Previously products without a (loaded) category were dropped here and
      // could not be reached at all; they now land in the display-only
      // Uncategorized bucket. Their category_id is left untouched.
      const rawCategoryId = String(row.category_id ?? '');
      const categoryId = categoryTitleById.has(rawCategoryId) ? rawCategoryId : UNCATEGORIZED_CATEGORY_ID;

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

    const mappedCategories = categoryRows.map((row) =>
      summarize({
        id: String(row.id),
        title: String(row.category_title ?? 'Untitled Category'),
        slug: String(row.category_slug ?? ''),
        imageUrl: String(row.category_image_url ?? ''),
        status: normalizeStatus(row.status),
      }),
    );

    if ((productsByCategoryId.get(UNCATEGORIZED_CATEGORY_ID) ?? []).length > 0) {
      mappedCategories.push(
        summarize({
          id: UNCATEGORIZED_CATEGORY_ID,
          title: 'Uncategorized',
          slug: '',
          imageUrl: '',
          status: 'No Category',
        }),
      );
    }

    return mappedCategories;
  }

  async function refreshWorkspaceAfterSave(productId: string, categoryId: string) {
    try {
      const nextCategories = await fetchWorkspaceData();
      setCategories(nextCategories);
      setLoadError('');
      setRefreshNotice('');
      // A product saved without a known category stays reachable in the
      // Uncategorized view instead of dropping back to the category grid.
      setSelectedCategoryId(
        nextCategories.some((category) => category.id === categoryId)
          ? categoryId
          : UNCATEGORIZED_CATEGORY_ID,
      );
      setSelectedProductId(productId);
      setEditorMode('edit');
      setProductPage(1);
      return true;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Saved, but failed to refresh the product list.';
      setRefreshNotice(
        `${message} Please reload if the product list does not update immediately.`,
      );
      setSelectedCategoryId(categoryId);
      setSelectedProductId(productId);
      setEditorMode('edit');
      return false;
    }
  }

  useEffect(() => {
    let disposed = false;

    const loadWorkspace = async () => {
      setIsLoading(true);
      setLoadError('');
      setRefreshNotice('');

      if (disposed) {
        return;
      }

      try {
        const mappedCategories = await fetchWorkspaceData();
        if (disposed) {
          return;
        }
        setCategories(mappedCategories);
        setIsLoading(false);
      } catch (error) {
        if (disposed) {
          return;
        }
        setLoadError(error instanceof Error ? error.message : 'Failed to load products workspace.');
        setCategories([]);
        setIsLoading(false);
      }
    };

    void loadWorkspace();

    const realtimeChannel = supabase
      .channel('product-category-workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_categories' }, () => {
        void loadWorkspace();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        void loadWorkspace();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_media' }, () => {
        void loadWorkspace();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variations' }, () => {
        void loadWorkspace();
      })
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(realtimeChannel);
    };
  }, []);

  // Global product search: every loaded product (all categories plus the
  // Uncategorized bucket), independent of the selected category.
  const allProducts = useMemo(
    () => categories.flatMap((category) => category.products),
    [categories],
  );
  const isGlobalSearch = normalizeSearchText(searchValue) !== '';
  const globalSearchResults = useMemo(
    () => searchProducts(allProducts, searchValue),
    [allProducts, searchValue],
  );

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) ?? null,
    [categories, selectedCategoryId],
  );

  const filteredProducts = useMemo(() => {
    const categoryProducts = selectedCategory?.products ?? [];
    const normalizedSearch = productSearchValue.trim().toLowerCase();

    if (!normalizedSearch) {
      return categoryProducts;
    }

    return categoryProducts.filter((product) =>
      [product.name, product.skuCode, product.description, product.status].some((value) =>
        value.toLowerCase().includes(normalizedSearch),
      ),
    );
  }, [productSearchValue, selectedCategory]);

  const totalProductPages = Math.max(
    1,
    Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE),
  );
  const pagedProducts = useMemo(() => {
    const startIndex = (productPage - 1) * PRODUCTS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + PRODUCTS_PER_PAGE);
  }, [filteredProducts, productPage]);

  useEffect(() => {
    if (categories.length === 0) {
      setSelectedCategoryId(null);
      setSelectedProductId(null);
      setEditorMode('create');
      return;
    }

    setSelectedCategoryId((current) => {
      if (!current) {
        return null;
      }
      if (categories.some((category) => category.id === current)) {
        return current;
      }
      return null;
    });
  }, [categories]);

  useEffect(() => {
    if (!selectedCategory) {
      setSelectedProductId(null);
      setEditorMode('create');
      return;
    }

    if (selectedProductId && selectedCategory.products.some((product) => product.id === selectedProductId)) {
      return;
    }

    if (selectedCategory.products.length > 0) {
      setSelectedProductId(selectedCategory.products[0].id);
      setEditorMode('edit');
      return;
    }

    setSelectedProductId(null);
    setEditorMode('create');
  }, [selectedCategory, selectedProductId]);

  function openCategory(categoryId: string) {
    setSelectedCategoryId(categoryId);
    setSelectedProductId(null);
    setEditorMode('edit');
    setProductSearchValue('');
    setProductPage(1);
  }

  // Opens the existing editor for a search result directly, without browsing
  // its category first. The category detail view is still the editor host.
  function openProductFromSearch(product: ProductListItem) {
    setSelectedCategoryId(product.categoryId);
    setSelectedProductId(product.id);
    setEditorMode('edit');
    setEditorInitialSection('Basic Information');
    setProductSearchValue('');
    setProductPage(1);
  }

  function handleStartAddProduct() {
    setIsCreateModalOpen(true);
  }

  function handleSelectProduct(productId: string) {
    setSelectedProductId(productId);
    setEditorMode('edit');
    setEditorInitialSection('Basic Information');
  }

  function handleSavedProduct(productId: string, categoryId: string) {
    void refreshWorkspaceAfterSave(productId, categoryId);
  }

  function handleCreatedProduct(productId: string, categoryId: string) {
    setIsCreateModalOpen(false);
    setEditorInitialSection('Images');
    void refreshWorkspaceAfterSave(productId, categoryId);
  }

  const handleDraftVariationCountChange = useCallback((productId: string, variationCount: number) => {
    setCategories((currentCategories) => {
      let changed = false;
      const nextCategories = currentCategories.map((category) => {
        let categoryChanged = false;
        const nextProducts = category.products.map((product) => {
          if (product.id !== productId || product.variationCount === variationCount) {
            return product;
          }

          changed = true;
          categoryChanged = true;
          return {
            ...product,
            variationCount,
          };
        });

        if (!categoryChanged) {
          return category;
        }

        return {
          ...category,
          variationCount: nextProducts.reduce(
            (total, product) => total + product.variationCount,
            0,
          ),
          products: nextProducts,
        };
      });

      return changed ? nextCategories : currentCategories;
    });
  }, []);

  useEffect(() => {
    setProductPage(1);
  }, [productSearchValue, selectedCategoryId]);

  useEffect(() => {
    setProductPage((current) => Math.min(current, totalProductPages));
  }, [totalProductPages]);

  const showCategoryDetail = Boolean(selectedCategoryId && selectedCategory);
  const detailCategory = selectedCategory;
  // The Uncategorized bucket is display-only; never hand its id to the editor
  // or the create modal as a real category_id.
  const realSelectedCategoryId =
    selectedCategoryId === UNCATEGORIZED_CATEGORY_ID ? null : selectedCategoryId;

  return (
    <section className={styles.workspace}>
      {!showCategoryDetail ? (
        <div className={styles.catalogPanel}>
          <div className={styles.topBar}>
            <div>
              <h2 className={styles.title}>{isGlobalSearch ? 'Search Products' : 'Browse by Category'}</h2>
              <p className={styles.helperText} aria-live="polite">
                {!isGlobalSearch
                  ? 'Select a category, or search to open any product directly.'
                  : isLoading
                    ? 'Loading products...'
                    : `${globalSearchResults.length} product${globalSearchResults.length === 1 ? '' : 's'} found across all categories.`}
              </p>
            </div>

            <div className={styles.catalogControls}>
              <label className={styles.searchField}>
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input
                  type="text"
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Search product name, SKU, variation, or category..."
                  aria-label="Search products"
                />
                {searchValue ? (
                  <button
                    type="button"
                    className={styles.searchClearButton}
                    onClick={() => setSearchValue('')}
                    aria-label="Clear search"
                    title="Clear search"
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                  </button>
                ) : null}
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className={styles.cardGrid}>
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={`category-skeleton-${index}`} className={styles.categoryCardSkeleton}></div>
              ))}
            </div>
          ) : loadError ? (
            <div className={styles.emptyState}>
              <p>{loadError}</p>
            </div>
          ) : isGlobalSearch ? (
            globalSearchResults.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No products match "{searchValue.trim()}".</p>
                <button type="button" className={styles.secondaryButton} onClick={() => setSearchValue('')}>
                  Clear search
                </button>
              </div>
            ) : (
              <>
                <div className={styles.searchResultsGrid}>
                  {globalSearchResults.slice(0, SEARCH_RESULT_LIMIT).map(({ product, matchedField, matchedValue }) => (
                    <button
                      key={product.id}
                      type="button"
                      className={styles.productCard}
                      onClick={() => openProductFromSearch(product)}
                      aria-label={`Open ${product.name}`}
                    >
                      <div className={styles.productThumbWrap}>
                        {product.thumbnailUrl ? (
                          <img src={product.thumbnailUrl} alt={product.name} className={styles.productThumb} />
                        ) : (
                          <div className={styles.productThumbPlaceholder}>
                            <i className="fa-solid fa-box" aria-hidden="true"></i>
                          </div>
                        )}
                      </div>

                      <div className={styles.productMeta}>
                        <div className={styles.productNameRow}>
                          <span className={styles.productName}>{product.name}</span>
                          <span
                            className={`${styles.statusBadge} ${
                              product.status.toLowerCase() === 'active'
                                ? styles.statusActive
                                : styles.statusInactive
                            }`}
                          >
                            {product.status}
                          </span>
                        </div>
                        <span className={styles.productSubtext}>{product.skuCode}</span>
                        <span className={styles.productSubtext}>
                          <i className="fa-solid fa-folder" aria-hidden="true"></i>{' '}
                          {product.categoryTitle || 'Uncategorized'}
                        </span>
                        {matchedField !== 'Product name' ? (
                          <span className={styles.productSubtext}>
                            Matched {matchedField.toLowerCase()}: {matchedValue}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  ))}
                </div>
                {globalSearchResults.length > SEARCH_RESULT_LIMIT ? (
                  <p className={styles.helperText}>
                    Showing the first {SEARCH_RESULT_LIMIT} of {globalSearchResults.length} matches. Add more
                    words to narrow the search.
                  </p>
                ) : null}
              </>
            )
          ) : categories.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No categories yet.</p>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {categories.map((category) => (
                <article key={category.id} className={styles.categoryCard}>
                  <button
                    type="button"
                    className={styles.cardImageButton}
                    onClick={() => openCategory(category.id)}
                    aria-label={`Open ${category.title}`}
                  >
                    {category.imageUrl ? (
                      <img
                        src={category.imageUrl}
                        alt={category.title}
                        className={styles.categoryImage}
                      />
                    ) : (
                      <div className={styles.categoryPlaceholder}>{getInitials(category.title)}</div>
                    )}
                  </button>

                  <div className={styles.categoryBody}>
                    <div className={styles.cardHeader}>
                      <h3 className={styles.categoryTitle}>{category.title}</h3>
                      <span
                        className={`${styles.statusBadge} ${
                          category.status.toLowerCase() === 'active'
                            ? styles.statusActive
                            : styles.statusInactive
                        }`}
                      >
                        {category.status}
                      </span>
                    </div>

                    <div className={styles.statsRow}>
                      <span className={styles.statPill}>
                        <i className="fa-solid fa-box-open" aria-hidden="true"></i>
                        <span>{category.productCount}</span>
                        <span className={styles.statLabel}>
                          Product{category.productCount === 1 ? '' : 's'}
                        </span>
                      </span>
                      <span className={styles.statPill}>
                        <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
                        <span>{category.variationCount}</span>
                        <span className={styles.statLabel}>
                          Variation{category.variationCount === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => openCategory(category.id)}
                      aria-label={`View products in ${category.title}`}
                      title={`View products in ${category.title}`}
                    >
                      <i className={`fa-solid fa-eye ${styles.viewButtonIcon}`} aria-hidden="true"></i>
                      <span className={styles.viewButtonText}>View Products</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : detailCategory ? (
        <div className={styles.detailLayout}>
          {refreshNotice ? (
            <div className={styles.emptyState}>
              <p>{refreshNotice}</p>
            </div>
          ) : null}
          <div className={styles.detailHeader}>
            <button
              type="button"
              className={styles.backLink}
              onClick={() => setSelectedCategoryId(null)}
            >
              Products
            </button>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.currentCrumb}>{detailCategory.title}</span>
          </div>

          <div className={styles.categoryBanner}>
            <div className={styles.bannerVisual}>
              {detailCategory.imageUrl ? (
                <img
                  src={detailCategory.imageUrl}
                  alt={detailCategory.title}
                  className={styles.bannerImage}
                />
              ) : (
                <div className={styles.bannerPlaceholder}>{getInitials(detailCategory.title)}</div>
              )}
            </div>

            <div className={styles.bannerCopy}>
              <div className={styles.bannerHeadingRow}>
                <div>
                  <h2 className={styles.bannerTitle}>{detailCategory.title}</h2>
                  <p className={styles.bannerDescription}>
                    {getCategoryDescription(
                      detailCategory.title,
                      detailCategory.productCount,
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => setSelectedCategoryId(null)}
                >
                  Browse Categories
                </button>
              </div>

              <div className={styles.bannerStats}>
                <span className={styles.bannerStat}>
                  <i className="fa-solid fa-box-open" aria-hidden="true"></i>
                  <strong>{detailCategory.productCount}</strong>
                  <small>Products</small>
                </span>
                <span className={styles.bannerStat}>
                  <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
                  <strong>{detailCategory.variationCount}</strong>
                  <small>Variations</small>
                </span>
              </div>
            </div>
          </div>

          <div className={styles.managementGrid}>
            <aside className={styles.productSidebar}>
              <div className={styles.sidebarHeader}>
                <div>
                  <h3 className={styles.sidebarTitle}>Products in This Category</h3>
                  <p className={styles.sidebarText}>
                    Select a product to edit or add a new one under this category.
                  </p>
                </div>
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={handleStartAddProduct}
                >
                  <i className="fa-solid fa-plus" aria-hidden="true"></i>
                  Add Product
                </button>
              </div>

              <label className={styles.searchField}>
                <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                <input
                  type="text"
                  value={productSearchValue}
                  onChange={(event) => setProductSearchValue(event.target.value)}
                  placeholder="Search products..."
                />
              </label>

              <div className={styles.productList}>
                {filteredProducts.length === 0 ? (
                  <div className={styles.emptyListState}>
                    <p>
                      {detailCategory.productCount === 0
                        ? 'No products in this category yet.'
                        : 'No products match your search.'}
                    </p>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={handleStartAddProduct}
                    >
                      Add Product
                    </button>
                  </div>
                ) : (
                  pagedProducts.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className={`${styles.productCard} ${
                        editorMode === 'edit' && selectedProductId === product.id
                          ? styles.productCardActive
                          : ''
                      }`}
                      onClick={() => handleSelectProduct(product.id)}
                    >
                      <div className={styles.productThumbWrap}>
                        {product.thumbnailUrl ? (
                          <img
                            src={product.thumbnailUrl}
                            alt={product.name}
                            className={styles.productThumb}
                          />
                        ) : (
                          <div className={styles.productThumbPlaceholder}>
                            <i className="fa-solid fa-box" aria-hidden="true"></i>
                          </div>
                        )}
                      </div>

                      <div className={styles.productMeta}>
                        <div className={styles.productNameRow}>
                          <span className={styles.productName}>{product.name}</span>
                          <span
                            className={`${styles.statusBadge} ${
                              product.status.toLowerCase() === 'active'
                                ? styles.statusActive
                                : styles.statusInactive
                            }`}
                          >
                            {product.status}
                          </span>
                        </div>
                        <span className={styles.productSubtext}>{product.skuCode}</span>
                        <span className={styles.productSubtext}>
                          <i className="fa-solid fa-layer-group" aria-hidden="true"></i>{' '}
                          {product.variationCount} Variation
                          {product.variationCount === 1 ? '' : 's'}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {filteredProducts.length > PRODUCTS_PER_PAGE ? (
                <div className={styles.pagination}>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() => setProductPage((current) => Math.max(current - 1, 1))}
                    disabled={productPage === 1}
                  >
                    Previous
                  </button>
                  <span className={styles.paginationText}>
                    Page {productPage} of {totalProductPages}
                  </span>
                  <button
                    type="button"
                    className={styles.paginationButton}
                    onClick={() =>
                      setProductPage((current) => Math.min(current + 1, totalProductPages))
                    }
                    disabled={productPage === totalProductPages}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </aside>

            <div className={styles.editorPanel}>
              {editorMode === 'edit' && selectedProductId ? (
                <AddProduct
                  layout="embedded"
                  initialCategoryId={realSelectedCategoryId}
                  editProductId={selectedProductId}
                  initialSection={editorInitialSection}
                  onRegisterNavigationGuard={onRegisterNavigationGuard}
                  onCancel={() => {
                    if (detailCategory.products.length > 0) {
                      setEditorMode('edit');
                      setSelectedProductId(detailCategory.products[0]?.id ?? null);
                      setEditorInitialSection('Basic Information');
                    }
                  }}
                  onSaved={handleSavedProduct}
                  onDraftVariationCountChange={handleDraftVariationCountChange}
                />
              ) : (
                <div className={styles.editorEmptyState}>
                  <h3>Select or Add a Product</h3>
                  <p>Create a new product with basic information first, then continue with images and variations here.</p>
                  <button type="button" className={styles.addButton} onClick={handleStartAddProduct}>
                    <i className="fa-solid fa-plus" aria-hidden="true"></i>
                    Add Product
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {isCreateModalOpen ? (
        <ProductCreateModal
          initialCategoryId={realSelectedCategoryId}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleCreatedProduct}
        />
      ) : null}
    </section>
  );
}
