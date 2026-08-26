import { useEffect, useMemo, useState } from 'react';
import Skeleton from '../common/Skeleton';
import { supabase } from '../../lib/supabase';
import styles from './ProductSummary.module.css';

interface ProductSummaryItem {
  id: string;
  product: string;
  location: string;
  code: string;
  variations: string;
  details: string;
  category: string;
  price: number;
  status: string;
  createdAt: string;
}

type ProductSummaryProps = {
  onAddProduct: () => void;
  onEditProduct: (productId: string) => void;
};

type FilterMode = 'alphabetical' | 'relevancy' | 'cost';
type SortOrder = 'ascending' | 'descending';

const ROWS_PER_PAGE = 7;

function ChevronLeftIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.paginationIcon}><path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>); }
function ChevronRightIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.paginationIcon}><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>); }
function PlusIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>); }
function SearchIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}><circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M20 20l-4.2-4.2" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>); }
function FilterIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}><path d="M4 6h16M7 12h10M10 18h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>); }
function SortIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}><path d="M8 6v12M8 18l-3-3M8 18l3-3M16 18V6M16 6l-3 3M16 6l3 3" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg>); }
function EditIcon() { return (<svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}><path d="M4 20h4l10-10-4-4L4 16v4z" fill="none" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" /><path d="M12 6l4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" /></svg>); }

function buildVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1);
  if (currentPage <= 3) return [1, 2, 3, 4, 5];
  if (currentPage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function buildVariationGroupKey(variation: Record<string, unknown>) {
  const normalizedVariationName = String(variation.variation_name ?? variation.class_name ?? '')
    .trim()
    .toLowerCase();
  const normalizedSku = String(variation.sku_code ?? '').trim().toLowerCase();

  if (normalizedVariationName || normalizedSku) {
    return `${normalizedVariationName}::${normalizedSku}`;
  }

  return `row::${String(variation.id ?? '').trim().toLowerCase()}`;
}

function isAvailableVariation(variation: Record<string, unknown>) {
  const availability = String(variation.availability ?? '').trim().toLowerCase();
  return !['unavailable', 'inactive', 'archived', 'deleted'].includes(availability);
}

function countVariationCards(variations: Array<Record<string, unknown>>) {
  return new Set(
    variations
      .filter(isAvailableVariation)
      .map((variation) => buildVariationGroupKey(variation)),
  ).size;
}

function getStatusClass(status: string) {
  return status.toLowerCase() === 'active' ? styles.statusActive : styles.statusInactive;
}

export default function ProductSummary({ onAddProduct, onEditProduct }: ProductSummaryProps) {
  const [searchValue, setSearchValue] = useState('');
  const [filterBy, setFilterBy] = useState<FilterMode>('alphabetical');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ascending');
  const [currentPage, setCurrentPage] = useState(1);
  const [productSummaryItems, setProductSummaryItems] = useState<ProductSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const loadProducts = async () => {
      setIsLoading(true);
      setLoadError('');

      const { data, error } = await supabase
        .from('products')
        .select(`
          id,
          product_name,
          sku_code,
          status,
          description,
          product_categories(category_title),
          price,
          created_at,
          product_variations(id, branch_name, variation_name, class_name, price, sku_code, availability)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        setLoadError(error.message);
        setProductSummaryItems([]);
        setIsLoading(false);
        return;
      }

      const mapped = (data ?? []).map((row: any) => {
        const variations = (row.product_variations ?? []) as Array<any>;
        const variationCount = countVariationCards(variations);

        const branches = Array.from(new Set(variations.map((v) => v.branch_name).filter(Boolean)));
        const location = branches.length > 0 ? branches.join(', ') : '-';

        const variationLabel = variationCount > 0
          ? `${variationCount} variation${variationCount > 1 ? 's' : ''}`
          : 'No variations';
        const details = String(row.description ?? '').trim() || '-';
        const categorySource = row.product_categories;
        const category = Array.isArray(categorySource)
          ? String(categorySource[0]?.category_title ?? '-')
          : String(categorySource?.category_title ?? '-');

        const variationPrices = variations.map((v) => toNumber(v.price)).filter((price) => price > 0);
        const minVariationPrice = variationPrices.length > 0 ? Math.min(...variationPrices) : null;

        return {
          id: String(row.id),
          product: String(row.product_name ?? '-'),
          location,
          code: String(row.sku_code ?? '-'),
          variations: variationLabel,
          details,
          category,
          price: minVariationPrice ?? toNumber(row.price),
          status: String(row.status ?? '-'),
          createdAt: String(row.created_at ?? new Date().toISOString()),
        } satisfies ProductSummaryItem;
      });

      setProductSummaryItems(mapped);
      setIsLoading(false);
    };

    void loadProducts();
  }, []);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const searchedItems = productSummaryItems.filter((item) => {
      if (!normalizedSearch) return true;
      return [item.product, item.location, item.code, item.details, item.status].some((value) => value.toLowerCase().includes(normalizedSearch));
    });

    const sortedItems = [...searchedItems].sort((left, right) => {
      if (filterBy === 'alphabetical') return left.product.localeCompare(right.product);
      if (filterBy === 'cost') return left.price - right.price;
      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });

    if (sortOrder === 'descending') sortedItems.reverse();
    return sortedItems;
  }, [filterBy, productSummaryItems, searchValue, sortOrder]);

  const totalDataCount = filteredItems.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pagedItems = filteredItems.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd = totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(currentPage, totalPages);

  function handlePageInputChange(value: string) {
    if (value === '') return;
    const page = Number(value);
    if (Number.isNaN(page)) return;
    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  }

  const emptyText = isLoading
    ? ''
    : loadError
      ? `Failed to load: ${loadError}`
      : 'No products added yet.';

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Products Summary</h2>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <SearchIcon />
            <input type="text" placeholder="Search Item" value={searchValue} onChange={(event) => { setSearchValue(event.target.value); setCurrentPage(1); }} className={styles.searchInput} />
          </label>

          <label className={styles.selectControl}>
            <SortIcon />
            <select value={sortOrder} onChange={(event) => { setSortOrder(event.target.value as SortOrder); setCurrentPage(1); }} className={styles.selectField}>
              <option value="ascending">Ascending</option>
              <option value="descending">Descending</option>
            </select>
          </label>

          <label className={styles.selectControl}>
            <FilterIcon />
            <select value={filterBy} onChange={(event) => { setFilterBy(event.target.value as FilterMode); setCurrentPage(1); }} className={styles.selectField}>
              <option value="alphabetical">Alphabetical</option>
              <option value="relevancy">Relevancy</option>
              <option value="cost">Cost</option>
            </select>
          </label>

          <button type="button" className={styles.primaryButton} onClick={onAddProduct}><PlusIcon /><span>Add New Product</span></button>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Product</span><span>Location</span><span>Code</span><span>Variations</span><span>Details</span><span>Category</span><span>Status</span><span className={styles.actionHeader}>Action</span>
        </div>

        {isLoading ? (
          Array.from({ length: ROWS_PER_PAGE }).map((_, index) => (
            <div key={`product-skeleton-${index}`} className={styles.tableRow}>
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.statusSkeleton} height="2rem" />
              <Skeleton className={styles.iconSkeleton} height="2.25rem" width="2.25rem" />
            </div>
          ))
        ) : pagedItems.length === 0 ? (
          <div className={styles.emptyState}><span className={styles.emptyText}>{emptyText}</span></div>
        ) : (
          pagedItems.map((item) => (
            <div key={item.id} className={styles.tableRow}>
              <span>{item.product}</span>
              <span>{item.location}</span>
              <span>{item.code}</span>
              <span>{item.variations}</span>
              <span>{item.details}</span>
              <span>{item.category}</span>
              <span className={`${styles.statusBadge} ${getStatusClass(item.status)}`}>{item.status}</span>
              <button type="button" className={styles.actionButton} aria-label={`Edit ${item.product}`} onClick={() => onEditProduct(item.id)}><EditIcon /></button>
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>Showing {pageStart}-{pageEnd} from {totalDataCount} data</span>

        <div className={styles.pagination}>
          <button type="button" className={styles.paginationButton} onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))} aria-label="Previous page" disabled={currentPage === 1}><ChevronLeftIcon /></button>

          {visiblePages.map((page) => (
            <button key={page} type="button" className={`${styles.pageButton} ${currentPage === page ? styles.pageButtonActive : ''}`} onClick={() => setCurrentPage(page)}>{page}</button>
          ))}

          <input type="number" min={1} max={totalPages} value={currentPage} onChange={(event) => handlePageInputChange(event.target.value)} className={styles.pageInput} aria-label="Go to page" />

          <button type="button" className={styles.paginationButton} onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))} aria-label="Next page" disabled={currentPage === totalPages}><ChevronRightIcon /></button>
        </div>
      </div>
    </section>
  );
}
