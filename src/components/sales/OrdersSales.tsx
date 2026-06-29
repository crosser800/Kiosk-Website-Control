import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
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

type OrderRow = {
  id: string;
  order_number: string | null;
  branch_name: string | null;
  client_name: string | null;
  grand_total: number | null;
  order_date: string | null;
  order_status: string | null;
};

type OrderItemRow = {
  id: string;
  order_id: string | null;
  product_name: string | null;
  product_code: string | null;
  quantity: number | null;
  line_total: number | null;
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

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function startOfWeek() {
  const today = startOfToday();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const value = new Date(today);
  value.setDate(today.getDate() + diff);
  return value;
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfYear() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function matchesFilter(orderDate: string | null, filter: SalesFilter) {
  if (!orderDate) return false;

  const date = new Date(orderDate);
  if (Number.isNaN(date.getTime())) return false;

  const today = startOfToday();
  if (filter === 'day') {
    return date >= today;
  }
  if (filter === 'week') {
    return date >= startOfWeek();
  }
  if (filter === 'month') {
    return date >= startOfMonth();
  }
  return date >= startOfYear();
}

function normalizeSalesStatus(rawStatus: string | null | undefined) {
  const normalized = String(rawStatus ?? '').trim().toLowerCase();
  if (normalized === 'delivered') return 'Completed';
  if (normalized === 'completed') return 'Completed';
  return String(rawStatus ?? '-');
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
  const [orders, setOrders] = useState<SalesRecord[]>([]);
  const [topSellingProducts, setTopSellingProducts] = useState<SalesRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const records = useMemo(
    () => (activeView === 'orders' ? orders : topSellingProducts),
    [activeView, orders, topSellingProducts],
  );
  const totalDataCount = records.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ROWS_PER_PAGE;
  const pagedRecords = records.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const displayRows = !isLoading && pagedRecords.length > 0 ? pagedRecords : placeholderRows;
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd =
    totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(safeCurrentPage, totalPages);

  useEffect(() => {
    void loadSalesRecords(activeFilter);
  }, [activeFilter]);

  async function loadSalesRecords(filter: SalesFilter) {
    setIsLoading(true);
    setLoadError('');

    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, branch_name, client_name, grand_total, order_date, order_status')
      .in('order_status', ['Completed', 'Delivered'])
      .order('order_date', { ascending: false });

    if (ordersError) {
      setOrders([]);
      setTopSellingProducts([]);
      setLoadError(ordersError.message);
      setIsLoading(false);
      return;
    }

    const filteredOrders = ((orderRows ?? []) as OrderRow[]).filter((row) =>
      matchesFilter(row.order_date, filter),
    );

    const orderIds = filteredOrders.map((row) => String(row.id));
    let orderItems: OrderItemRow[] = [];

    if (orderIds.length > 0) {
      const { data: itemRows, error: itemsError } = await supabase
        .from('order_items')
        .select('id, order_id, product_name, product_code, quantity, line_total')
        .in('order_id', orderIds);

      if (itemsError) {
        setOrders([]);
        setTopSellingProducts([]);
        setLoadError(itemsError.message);
        setIsLoading(false);
        return;
      }

      orderItems = (itemRows ?? []) as OrderItemRow[];
    }

    const orderItemsByOrderId = new Map<string, OrderItemRow[]>();
    orderItems.forEach((item) => {
      const orderId = String(item.order_id ?? '');
      if (!orderId) return;
      const current = orderItemsByOrderId.get(orderId) ?? [];
      current.push(item);
      orderItemsByOrderId.set(orderId, current);
    });

    const nextOrders: SalesRecord[] = filteredOrders.map((row) => {
      const items = orderItemsByOrderId.get(String(row.id)) ?? [];
      const itemCount = items.reduce((total, item) => total + (Number(item.quantity ?? 0) || 0), 0);
      const primaryItem = items[0];

      return {
        id: String(row.id),
        productName: String(row.client_name ?? primaryItem?.product_name ?? 'Completed Order'),
        location: String(row.branch_name ?? '-'),
        code: String(row.order_number ?? '-'),
        orders: itemCount || items.length,
        sales: Number(row.grand_total ?? 0),
        receipt: row.order_date ? new Date(row.order_date).toLocaleDateString('en-PH') : '-',
        actionLabel: normalizeSalesStatus(row.order_status),
      };
    });

    const topSellingMap = new Map<string, SalesRecord>();
    orderItems.forEach((item) => {
      const name = String(item.product_name ?? '').trim() || 'Unnamed Product';
      const key = `${name}::${String(item.product_code ?? '').trim()}`;
      const current = topSellingMap.get(key) ?? {
        id: key,
        productName: name,
        location: 'All completed orders',
        code: String(item.product_code ?? '-'),
        orders: 0,
        sales: 0,
        receipt: filterLabels[filter],
        actionLabel: 'Completed',
      };

      current.orders = (current.orders ?? 0) + (Number(item.quantity ?? 0) || 0);
      current.sales = (current.sales ?? 0) + (Number(item.line_total ?? 0) || 0);
      topSellingMap.set(key, current);
    });

    const nextTopSelling = Array.from(topSellingMap.values()).sort(
      (left, right) => (right.sales ?? 0) - (left.sales ?? 0),
    );

    setOrders(nextOrders);
    setTopSellingProducts(nextTopSelling);
    setIsLoading(false);
  }

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
              {loadError
                ? `Failed to load sales: ${loadError}`
                : totalDataCount > 0
                ? `${totalDataCount.toLocaleString()} records loaded`
                : isLoading
                  ? 'Loading completed order sales...'
                  : 'No completed order sales found for this period.'}
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
