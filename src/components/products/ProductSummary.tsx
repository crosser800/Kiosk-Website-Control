import { useEffect, useMemo, useState } from 'react';
import styles from './ProductSummary.module.css';

interface ProductSummaryItem {
  id: string;
  product: string;
  location: string;
  code: string;
  variations: string;
  details: string;
  price: number;
  status: string;
  createdAt: string;
}

type ProductSummaryProps = {
  onAddProduct: () => void;
};

type FilterMode = 'alphabetical' | 'relevancy' | 'cost';
type SortOrder = 'ascending' | 'descending';

const productSummaryItems: ProductSummaryItem[] = [];
const ROWS_PER_PAGE = 7;

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.paginationIcon}>
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.paginationIcon}>
      <path
        d="M9 6l6 6-6 6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <circle
        cx="11"
        cy="11"
        r="6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M20 20l-4.2-4.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M4 6h16M7 12h10M10 18h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.icon}>
      <path
        d="M8 6v12M8 18l-3-3M8 18l3-3M16 18V6M16 6l-3 3M16 6l3 3"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M12 6l4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function buildVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (currentPage <= 3) {
    return [1, 2, 3, 4, 5];
  }

  if (currentPage >= totalPages - 2) {
    return [
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ];
}

export default function ProductSummary({ onAddProduct }: ProductSummaryProps) {
  const [searchValue, setSearchValue] = useState('');
  const [filterBy, setFilterBy] = useState<FilterMode>('alphabetical');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ascending');
  const [currentPage, setCurrentPage] = useState(1);

  const filteredItems = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();

    const searchedItems = productSummaryItems.filter((item) => {
      if (!normalizedSearch) {
        return true;
      }

      return [
        item.product,
        item.location,
        item.code,
        item.details,
        item.status,
      ].some((value) => value.toLowerCase().includes(normalizedSearch));
    });

    const sortedItems = [...searchedItems].sort((left, right) => {
      if (filterBy === 'alphabetical') {
        return left.product.localeCompare(right.product);
      }

      if (filterBy === 'cost') {
        return left.price - right.price;
      }

      return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
    });

    if (sortOrder === 'descending') {
      sortedItems.reverse();
    }

    return sortedItems;
  }, [filterBy, searchValue, sortOrder]);

  const totalDataCount = filteredItems.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pagedItems = filteredItems.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd =
    totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(currentPage, totalPages);

  function handlePageInputChange(value: string) {
    if (value === '') {
      return;
    }

    const page = Number(value);

    if (Number.isNaN(page)) {
      return;
    }

    setCurrentPage(Math.min(Math.max(page, 1), totalPages));
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Products Summary</h2>

        <div className={styles.toolbar}>
          <label className={styles.search}>
            <SearchIcon />
            <input
              type="text"
              placeholder="Search Item"
              value={searchValue}
              onChange={(event) => {
                setSearchValue(event.target.value);
                setCurrentPage(1);
              }}
              className={styles.searchInput}
            />
          </label>

          <label className={styles.selectControl}>
            <SortIcon />
            <select
              value={sortOrder}
              onChange={(event) => {
                setSortOrder(event.target.value as SortOrder);
                setCurrentPage(1);
              }}
              className={styles.selectField}
            >
              <option value="ascending">Ascending</option>
              <option value="descending">Descending</option>
            </select>
          </label>

          <label className={styles.selectControl}>
            <FilterIcon />
            <select
              value={filterBy}
              onChange={(event) => {
                setFilterBy(event.target.value as FilterMode);
                setCurrentPage(1);
              }}
              className={styles.selectField}
            >
              <option value="alphabetical">Alphabetical</option>
              <option value="relevancy">Relevancy</option>
              <option value="cost">Cost</option>
            </select>
          </label>

          <button
            type="button"
            className={styles.primaryButton}
            onClick={onAddProduct}
          >
            <PlusIcon />
            <span>Add New Product</span>
          </button>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Product</span>
          <span>Location</span>
          <span>Code</span>
          <span>Variations</span>
          <span>Details</span>
          <span>Price(PHP)</span>
          <span>Status</span>
          <span className={styles.actionHeader}>Action</span>
        </div>

        {pagedItems.length === 0 ? (
          <div className={styles.emptyState}>
            <span className={styles.emptyText}>No products added yet.</span>
          </div>
        ) : (
          pagedItems.map((item) => (
            <div key={item.id} className={styles.tableRow}>
              <span>{item.product}</span>
              <span>{item.location}</span>
              <span>{item.code}</span>
              <span>{item.variations}</span>
              <span>{item.details}</span>
              <span>{item.price.toLocaleString()}</span>
              <span>{item.status}</span>
              <button
                type="button"
                className={styles.actionButton}
                aria-label={`Edit ${item.product}`}
              >
                <EditIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerText}>
          Showing {pageStart}-{pageEnd} from {totalDataCount} data
        </span>

        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            aria-label="Previous page"
            disabled={currentPage === 1}
          >
            <ChevronLeftIcon />
          </button>

          {visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              className={`${styles.pageButton} ${currentPage === page ? styles.pageButtonActive : ''}`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}

          <input
            type="number"
            min={1}
            max={totalPages}
            value={currentPage}
            onChange={(event) => handlePageInputChange(event.target.value)}
            className={styles.pageInput}
            aria-label="Go to page"
          />

          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            aria-label="Next page"
            disabled={currentPage === totalPages}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </section>
  );
}
