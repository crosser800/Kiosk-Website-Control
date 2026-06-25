import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import AddProduct from './AddProduct';
import ProductCreateModal from './ProductCreateModal';
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
};

type ProductVariationRow = {
  id: string;
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  sku_code: string | null;
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

function countVariationCards(variations: ProductVariationRow[]) {
  return new Set(variations.map((variation) => buildVariationGroupKey(variation))).size;
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

export default function ProductCategoryWorkspace() {
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
    const [categoriesRes, productsRes, mediaRes, variationsRes] = await Promise.all([
      supabase
        .from('product_categories')
        .select('id, category_title, category_slug, category_image_url, status')
        .order('category_title'),
      supabase
        .from('products')
        .select('id, category_id, product_name, sku_code, description, status, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('product_media')
        .select('id, product_id, media_url, media_type, is_primary, sort_order')
        .order('sort_order', { ascending: true }),
      supabase
        .from('product_variations')
        .select('id, product_id, variation_name, class_name, sku_code'),
    ]);

    const firstError =
      categoriesRes.error ?? productsRes.error ?? mediaRes.error ?? variationsRes.error;
    if (firstError) {
      throw new Error(firstError.message);
    }

    const mediaByProductId = new Map<string, ProductMediaRow[]>();
    (mediaRes.data as ProductMediaRow[] | null | undefined)?.forEach((row) => {
      const productId = String(row.product_id ?? '');
      if (!productId) return;
      const current = mediaByProductId.get(productId) ?? [];
      current.push(row);
      mediaByProductId.set(productId, current);
    });

    const variationsByProductId = new Map<string, ProductVariationRow[]>();
    (variationsRes.data as ProductVariationRow[] | null | undefined)?.forEach((row) => {
      const productId = String(row.product_id ?? '');
      if (!productId) return;
      const current = variationsByProductId.get(productId) ?? [];
      current.push(row);
      variationsByProductId.set(productId, current);
    });

    const productsByCategoryId = new Map<string, ProductListItem[]>();
    (productsRes.data as ProductRow[] | null | undefined)?.forEach((row) => {
      const categoryId = String(row.category_id ?? '');
      if (!categoryId) return;

      const mediaItems = mediaByProductId.get(String(row.id)) ?? [];
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
      };

      const current = productsByCategoryId.get(categoryId) ?? [];
      current.push(mappedProduct);
      productsByCategoryId.set(categoryId, current);
    });

    return ((categoriesRes.data as CategoryRow[] | null | undefined) ?? []).map((row) => {
      const categoryProducts = sortProducts(productsByCategoryId.get(String(row.id)) ?? []);
      return {
        id: String(row.id),
        title: String(row.category_title ?? 'Untitled Category'),
        slug: String(row.category_slug ?? ''),
        imageUrl: String(row.category_image_url ?? ''),
        status: normalizeStatus(row.status),
        productCount: categoryProducts.length,
        variationCount: categoryProducts.reduce(
          (total, product) => total + product.variationCount,
          0,
        ),
        products: categoryProducts,
      } satisfies CategorySummary;
    });
  }

  async function refreshWorkspaceAfterSave(productId: string, categoryId: string) {
    try {
      const nextCategories = await fetchWorkspaceData();
      setCategories(nextCategories);
      setLoadError('');
      setRefreshNotice('');
      setSelectedCategoryId(categoryId);
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

  const filteredCategories = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    if (!normalizedSearch) {
      return categories;
    }

    return categories.filter((category) => {
      if (
        [category.title, category.slug, category.status].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        )
      ) {
        return true;
      }

      return category.products.some((product) =>
        [product.name, product.skuCode, product.description].some((value) =>
          value.toLowerCase().includes(normalizedSearch),
        ),
      );
    });
  }, [categories, searchValue]);

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

  useEffect(() => {
    setProductPage(1);
  }, [productSearchValue, selectedCategoryId]);

  useEffect(() => {
    setProductPage((current) => Math.min(current, totalProductPages));
  }, [totalProductPages]);

  const showCategoryDetail = Boolean(selectedCategoryId && selectedCategory);
  const detailCategory = selectedCategory;

  return (
    <section className={styles.workspace}>
      {!showCategoryDetail ? (
        <div className={styles.catalogPanel}>
          <div className={styles.topBar}>
            <div>
              <h2 className={styles.title}>Browse by Category</h2>
              <p className={styles.helperText}>
                Select a category to view and manage its products faster.
              </p>
            </div>

            <label className={styles.searchField}>
              <i className="fa-solid fa-magnifying-glass" aria-hidden="true"></i>
              <input
                type="text"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
                placeholder="Search products or categories..."
              />
            </label>
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
          ) : filteredCategories.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No categories match your search.</p>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredCategories.map((category) => (
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
                        {category.productCount} Product
                        {category.productCount === 1 ? '' : 's'}
                      </span>
                      <span className={styles.statPill}>
                        <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
                        {category.variationCount} Variation
                        {category.variationCount === 1 ? '' : 's'}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={styles.viewButton}
                      onClick={() => openCategory(category.id)}
                    >
                      View Products
                      <i className="fa-solid fa-arrow-right" aria-hidden="true"></i>
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
                  initialCategoryId={detailCategory.id}
                  editProductId={selectedProductId}
                  initialSection={editorInitialSection}
                  onCancel={() => {
                    if (detailCategory.products.length > 0) {
                      setEditorMode('edit');
                      setSelectedProductId(detailCategory.products[0]?.id ?? null);
                      setEditorInitialSection('Basic Information');
                    }
                  }}
                  onSaved={handleSavedProduct}
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
          initialCategoryId={selectedCategoryId}
          onClose={() => setIsCreateModalOpen(false)}
          onCreated={handleCreatedProduct}
        />
      ) : null}
    </section>
  );
}
