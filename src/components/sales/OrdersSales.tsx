import { useState } from 'react';
import styles from './OrdersSales.module.css';

type SalesView = 'orders' | 'topSelling';
type SalesFilter = 'day' | 'week' | 'month' | 'year';

type SalesRecord = {
  id: string;
  productName?: string;
  location?: string;
  code?: string;
  orders?: number;
  sales?: number;
  receipt?: string;
  actionLabel?: string;
};

const filterLabels: Record<SalesFilter, string> = {
  day: 'This Day',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
};

const viewLabels: Record<SalesView, string> = {
  orders: 'Orders',
  topSelling: 'Top Selling Product',
};

const ROWS_PER_PAGE = 9;

const placeholderRows: SalesRecord[] = Array.from(
  { length: ROWS_PER_PAGE },
  (_, index) => ({
    id: `placeholder-${index + 1}`,
  }),
);

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

function formatOrders(value?: number) {
  if (typeof value !== 'number') {
    return '';
  }

  return value.toLocaleString('en-US');
}

function formatSales(value?: number) {
  if (typeof value !== 'number') {
    return '';
  }

  return value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

export default function OrdersSales() {
  const [activeView, setActiveView] = useState<SalesView>('orders');
  const [activeFilter, setActiveFilter] = useState<SalesFilter>('day');
  const [currentPage, setCurrentPage] = useState(1);
  const [orders] = useState<SalesRecord[]>([]);
  const [topSellingProducts] = useState<SalesRecord[]>([]);
  const records = activeView === 'orders' ? orders : topSellingProducts;
  const totalDataCount = records.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ROWS_PER_PAGE;
  const pagedRecords = records.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const displayRows = pagedRecords.length > 0 ? pagedRecords : placeholderRows;
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd =
    totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(safeCurrentPage, totalPages);

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

  function handleViewChange(view: SalesView) {
    setActiveView(view);
    setCurrentPage(1);
  }

  return (
    <>
      <section className={styles.container}>
        <div className={styles.header}>
          <div className={styles.headerCopy}>
            <p className={styles.eyebrow}>Sales records</p>
            <h2 className={styles.title}>Orders and top-selling overview</h2>
            <p className={styles.description}>
              Switch between order activity and product performance using the same
              clean table view.
            </p>
          </div>

          <div className={styles.controls}>
            <div className={styles.filterTabs} aria-label="Sales table view">
              {(Object.keys(viewLabels) as SalesView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`${styles.filterTab} ${
                    activeView === view ? styles.filterTabActive : ''
                  }`}
                  onClick={() => handleViewChange(view)}
                >
                  {viewLabels[view]}
                </button>
              ))}
            </div>

            <label className={styles.selectControl}>
              <FilterIcon />
              <select
                className={styles.selectField}
                value={activeFilter}
                onChange={(event) => {
                  setActiveFilter(event.target.value as SalesFilter);
                  setCurrentPage(1);
                }}
                aria-label="Filter sales records"
              >
                {(Object.keys(filterLabels) as SalesFilter[]).map((filter) => (
                  <option key={filter} value={filter}>
                    {filterLabels[filter]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className={styles.tableShell}>
          <div className={styles.tableMeta}>
            <span className={styles.metaPill}>{filterLabels[activeFilter]}</span>
            <span className={styles.metaText}>
              {totalDataCount > 0
                ? `${totalDataCount.toLocaleString()} records loaded`
                : 'No records yet. Layout stays ready for live sales data.'}
            </span>
          </div>

          <div className={styles.table} role="table" aria-label={viewLabels[activeView]}>
          <div className={styles.tableHeader} role="row">
            <span role="columnheader">Product</span>
            <span role="columnheader">Location</span>
            <span role="columnheader">Code</span>
            <span role="columnheader">Orders</span>
            <span role="columnheader">Sales(PHP)</span>
            <span role="columnheader">Receipt</span>
            <span role="columnheader" className={styles.actionHeader}>
              Action
            </span>
          </div>

          {displayRows.map((record) => (
            <div key={record.id} className={styles.tableRow} role="row">
              <span role="cell" className={styles.primaryCell}>
                {record.productName ?? '\u00A0'}
              </span>
              <span role="cell">{record.location ?? '\u00A0'}</span>
              <span role="cell">{record.code ?? '\u00A0'}</span>
              <span role="cell" className={styles.numericCell}>
                {formatOrders(record.orders) || '\u00A0'}
              </span>
              <span role="cell" className={styles.numericCell}>
                {formatSales(record.sales) || '\u00A0'}
              </span>
              <span role="cell">{record.receipt ?? '\u00A0'}</span>
              <span role="cell" className={styles.actionCell}>
                {record.actionLabel ?? '\u00A0'}
              </span>
            </div>
          ))}
        </div>
        </div>
      </section>

      <div className={styles.footer}>
        <span className={styles.footerText}>
          Showing {pageStart}-{pageEnd} from {totalDataCount.toLocaleString()} data
        </span>

        <div className={styles.pagination}>
          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            aria-label="Previous page"
            disabled={safeCurrentPage === 1}
          >
            <ChevronLeftIcon />
          </button>

          {visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              className={`${styles.pageButton} ${
                safeCurrentPage === page ? styles.pageButtonActive : ''
              }`}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}

          <input
            type="number"
            min={1}
            max={totalPages}
            value={safeCurrentPage}
            onChange={(event) => handlePageInputChange(event.target.value)}
            className={styles.pageInput}
            aria-label="Go to page"
          />

          <button
            type="button"
            className={styles.paginationButton}
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            aria-label="Next page"
            disabled={safeCurrentPage === totalPages}
          >
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </>
  );
}
