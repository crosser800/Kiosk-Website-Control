import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { supabase } from '../../lib/supabase';
import AddProduct from './AddProduct';
import CardSizeSlider from './CardSizeSlider';
import CategoryBrowseCard from './CategoryBrowseCard';
import ProductBrowseCard from './ProductBrowseCard';
import { getInitials } from './productCardPresentation';
import ProductCreateModal from './ProductCreateModal';
import {
  CATEGORY_CARD_SIZE,
  CATEGORY_CARD_SIZE_KEY,
  CATEGORY_CARD_SIZE_VAR,
  PRODUCT_CARD_SIZE,
  PRODUCT_CARD_SIZE_KEY,
  PRODUCT_CARD_SIZE_VAR,
  readCardSize,
} from './cardSizePreferences';
import { normalizeSearchText, searchProducts } from './productSearch';
import {
  loadProductWorkspace,
  UNCATEGORIZED_CATEGORY_ID,
  type CategorySummary,
  type ProductCatalogStats,
  type ProductListItem,
} from './productWorkspaceData';
import { createRefreshScheduler, type RefreshScheduler } from '../../utils/refreshScheduler';
import styles from './ProductCategoryWorkspace.module.css';

type EditorMode = 'create' | 'edit';

const SEARCH_RESULT_LIMIT = 60;

function getCategoryDescription(categoryTitle: string, productCount: number) {
  if (productCount === 0) {
    return `No products added under ${categoryTitle} yet.`;
  }

  return `Manage products and variations under ${categoryTitle}.`;
}

type ProductCategoryWorkspaceProps = {
  onRegisterNavigationGuard?: (guard: (() => Promise<boolean>) | null) => void;
  // Receives the page counters computed from the same load (no extra query).
  onCatalogStatsChange?: (stats: ProductCatalogStats) => void;
};

export default function ProductCategoryWorkspace({
  onRegisterNavigationGuard,
  onCatalogStatsChange,
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
  // Card sizes are CSS custom properties on the workspace root. Read from
  // sessionStorage once; the sliders then update the element directly, so
  // resizing never re-renders this component (or the editor inside it).
  const workspaceRef = useRef<HTMLElement>(null);
  const [initialCardSizeStyle] = useState(
    () =>
      ({
        [CATEGORY_CARD_SIZE_VAR]: `${readCardSize(CATEGORY_CARD_SIZE_KEY, CATEGORY_CARD_SIZE)}px`,
        [PRODUCT_CARD_SIZE_VAR]: `${readCardSize(PRODUCT_CARD_SIZE_KEY, PRODUCT_CARD_SIZE)}px`,
      }) as CSSProperties,
  );
  // Variation to select when the editor opens (set only by conflict navigation).
  const [editorFocusVariationGroupId, setEditorFocusVariationGroupId] = useState<string | null>(null);

  // Latest successfully loaded categories (read after a post-save refresh)
  // and the scheduler that serializes every reload of this workspace.
  const latestCategoriesRef = useRef<CategorySummary[] | null>(null);
  const refreshSchedulerRef = useRef<RefreshScheduler | null>(null);
  const onCatalogStatsChangeRef = useRef(onCatalogStatsChange);
  useEffect(() => {
    onCatalogStatsChangeRef.current = onCatalogStatsChange;
  }, [onCatalogStatsChange]);

  async function refreshWorkspaceAfterSave(productId: string, categoryId: string) {
    const scheduler = refreshSchedulerRef.current;
    // Goes through the same scheduler as realtime reloads, so an older
    // in-flight reload can never overwrite the post-save data.
    const refreshed = scheduler ? await scheduler.flush() : false;
    if (!scheduler || scheduler.isDisposed()) {
      return false;
    }
    const nextCategories = latestCategoriesRef.current;
    if (refreshed && nextCategories) {
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
    }
    // The failed refresh already set refreshNotice and will retry itself.
    setSelectedCategoryId(categoryId);
    setSelectedProductId(productId);
    setEditorMode('edit');
    return false;
  }

  useEffect(() => {
    let hasLoaded = false;

    // Realtime events arrive in bursts (one product save writes many rows),
    // so they are coalesced: one reload ~400 ms after the last event, at most
    // 2 s after the first, never overlapping, with a final reload for events
    // that arrive mid-load. Only the first load shows the skeleton.
    const scheduler = createRefreshScheduler({
      delayMs: 400,
      maxWaitMs: 2000,
      onError: (error) => console.error('Products workspace refresh failed:', error),
      run: async () => {
        try {
          const workspace = await loadProductWorkspace();
          if (scheduler.isDisposed()) return;
          hasLoaded = true;
          latestCategoriesRef.current = workspace.categories;
          setCategories(workspace.categories);
          onCatalogStatsChangeRef.current?.(workspace.stats);
          setLoadError('');
          setRefreshNotice('');
          setIsLoading(false);
        } catch (error) {
          if (scheduler.isDisposed()) throw error;
          const message = error instanceof Error ? error.message : 'Failed to load products workspace.';
          if (!hasLoaded) {
            latestCategoriesRef.current = null;
            setLoadError(message);
            setCategories([]);
            setIsLoading(false);
          } else {
            // Keep the last good data on screen; the scheduler retries.
            setRefreshNotice(`${message} Showing the last loaded products while retrying.`);
          }
          throw error;
        }
      },
    });
    refreshSchedulerRef.current = scheduler;
    void scheduler.flush();

    const requestRefresh = () => scheduler.request();
    const realtimeChannel = supabase
      .channel('product-category-workspace')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_categories' }, requestRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, requestRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_media' }, requestRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variations' }, requestRefresh)
      .subscribe();

    return () => {
      scheduler.dispose();
      refreshSchedulerRef.current = null;
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
    setEditorFocusVariationGroupId(null);
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
    setEditorFocusVariationGroupId(null);
  }

  // "View Existing Product" from a duplicate-SKU conflict. The editor has
  // already re-verified the record and cleared unsaved changes; this only
  // navigates to a product that is present in the loaded workspace.
  function openProductFromConflict(productId: string, variationGroupId: string) {
    const category = categories.find((entry) => entry.products.some((product) => product.id === productId));
    if (!category) {
      return false;
    }
    setSelectedCategoryId(category.id);
    setSelectedProductId(productId);
    setEditorMode('edit');
    setEditorInitialSection('Variation & Pricing');
    setEditorFocusVariationGroupId(variationGroupId);
    setProductSearchValue('');
    setProductPage(1);
    return true;
  }

  function handleSavedProduct(productId: string, categoryId: string) {
    void refreshWorkspaceAfterSave(productId, categoryId);
  }

  function handleCreatedProduct(productId: string, categoryId: string) {
    setIsCreateModalOpen(false);
    setEditorInitialSection('Images');
    setEditorFocusVariationGroupId(null);
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
    <section ref={workspaceRef} className={styles.workspace} style={initialCardSizeStyle}>
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
          </div>

          {/* One row: Category size -> Product size -> search (fills the rest). */}
          <div className={styles.catalogToolbar}>
            <CardSizeSlider
              label="Category"
              icon="fa-table-cells-large"
              accessibleLabel="Category card size"
              storageKey={CATEGORY_CARD_SIZE_KEY}
              range={CATEGORY_CARD_SIZE}
              cssVariable={CATEGORY_CARD_SIZE_VAR}
              targetRef={workspaceRef}
            />
            <CardSizeSlider
              label="Product"
              icon="fa-box"
              accessibleLabel="Product card size"
              storageKey={PRODUCT_CARD_SIZE_KEY}
              range={PRODUCT_CARD_SIZE}
              cssVariable={PRODUCT_CARD_SIZE_VAR}
              targetRef={workspaceRef}
            />
            <label className={`${styles.searchField} ${styles.toolbarSearch}`}>
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

          {refreshNotice && !loadError ? (
            <p className={styles.helperText} role="status">
              {refreshNotice}
            </p>
          ) : null}

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
                <div className={styles.productGrid}>
                  {globalSearchResults.slice(0, SEARCH_RESULT_LIMIT).map(({ product, matchedField, matchedValue }) => (
                    <ProductBrowseCard
                      key={product.id}
                      product={product}
                      onOpen={openProductFromSearch}
                      hint={
                        matchedField !== 'Product name'
                          ? `Matched ${matchedField.toLowerCase()}: ${matchedValue}`
                          : undefined
                      }
                    />
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
                <CategoryBrowseCard key={category.id} category={category} onOpen={openCategory} />
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

              <div className={styles.sidebarToolbar}>
                <CardSizeSlider
                  label="Product"
                  icon="fa-box"
                  accessibleLabel="Product card size"
                  hideLabel
                  storageKey={PRODUCT_CARD_SIZE_KEY}
                  range={PRODUCT_CARD_SIZE}
                  cssVariable={PRODUCT_CARD_SIZE_VAR}
                  targetRef={workspaceRef}
                />
                <label className={`${styles.searchField} ${styles.toolbarSearch}`}>
                  <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
                  <input
                    type="text"
                    value={productSearchValue}
                    onChange={(event) => setProductSearchValue(event.target.value)}
                    placeholder="Search products..."
                  />
                </label>
              </div>

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
                    <ProductBrowseCard
                      key={product.id}
                      product={product}
                      layout="row"
                      isActive={editorMode === 'edit' && selectedProductId === product.id}
                      onOpen={(item) => handleSelectProduct(item.id)}
                    />
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
                  initialVariationGroupId={editorFocusVariationGroupId}
                  onOpenProduct={openProductFromConflict}
                  onRegisterNavigationGuard={onRegisterNavigationGuard}
                  onCancel={() => {
                    if (detailCategory.products.length > 0) {
                      setEditorMode('edit');
                      setSelectedProductId(detailCategory.products[0]?.id ?? null);
                      setEditorInitialSection('Basic Information');
                      setEditorFocusVariationGroupId(null);
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
