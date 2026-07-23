import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BUSINESS_TIME_ZONE,
  COMPLETED_DISPLAY_STATUS,
  COMPLETED_RAW_STATUSES,
  ORDER_STATUS_FIELD,
  parseCompletedAt,
  resolveCompletedAt,
  toBusinessDateKey,
} from '../../services/completedSales';
import styles from './OrdersSales.module.css';

type SalesView = 'orders' | 'topSelling';
type SalesFilter = 'day' | 'week' | 'month' | 'year' | 'custom';

type OrderRow = {
  id: string;
  order_number: string | null;
  po_number: string | null;
  agent_id: string | null;
  branch_name: string | null;
  branch_code: string | null;
  client_name: string | null;
  grand_total: number | null;
  total_quantity: number | null;
  order_date: string | null;
  order_status: string | null;
  created_at: string | null;
  updated_at: string | null;
  agent:
    | {
        full_name: string | null;
        company_name: string | null;
        email: string | null;
      }
    | {
        full_name: string | null;
        company_name: string | null;
        email: string | null;
      }[]
    | null;
};

type OrderItemRow = {
  id: string;
  order_id: string | null;
  product_name: string | null;
  product_code: string | null;
  variant_label: string | null;
  quantity: number | null;
  free_quantity: number | null;
  line_total: number | null;
};

type StatusHistoryRow = {
  order_id: string | null;
  status: string | null;
  changed_at: string | null;
};

type CompletedOrderRecord = {
  id: string;
  orderNumber: string;
  poNumber: string;
  client: string;
  agent: string;
  branch: string;
  completedAt: string | null;
  completedDateKey: string;
  paidQuantity: number;
  freeQuantity: number;
  grandTotal: number;
  status: 'Completed';
  items: OrderItemRow[];
};

type TopSellingRecord = {
  id: string;
  product: string;
  code: string;
  variant: string;
  paidQuantity: number;
  freeQuantity: number;
  salesAmount: number;
  completedOrderCount: number;
};

const ROWS_PER_PAGE = 10;

const filterLabels: Record<SalesFilter, string> = {
  day: 'This Day',
  week: 'This Week',
  month: 'This Month',
  year: 'This Year',
  custom: 'Custom Range',
};

const viewLabels: Record<SalesView, string> = {
  orders: 'Completed Orders',
  topSelling: 'Top Selling Products',
};

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

function formatQuantity(value: number) {
  return value.toLocaleString('en-US');
}

function formatSales(value: number) {
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function startOfWeek() {
  const today = startOfToday();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(today, diff);
}

function startOfMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function startOfYear() {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1);
}

function getDateRange(filter: SalesFilter, customStart: string, customEnd: string) {
  const today = startOfToday();
  if (filter === 'day') {
    return { start: toDateInputValue(today), end: toDateInputValue(today) };
  }
  if (filter === 'week') {
    return { start: toDateInputValue(startOfWeek()), end: toDateInputValue(today) };
  }
  if (filter === 'month') {
    return { start: toDateInputValue(startOfMonth()), end: toDateInputValue(today) };
  }
  if (filter === 'year') {
    return { start: toDateInputValue(startOfYear()), end: toDateInputValue(today) };
  }
  const start = customStart && customEnd && customStart > customEnd ? customEnd : customStart;
  const end = customStart && customEnd && customStart > customEnd ? customStart : customEnd;
  return { start, end };
}

function isDateKeyInRange(dateKey: string, start: string, end: string) {
  if (!dateKey) return false;
  if (start && dateKey < start) return false;
  if (end && dateKey > end) return false;
  return true;
}

function toDateKey(value: string | null | undefined) {
  return toBusinessDateKey(value);
}

function formatDisplayDate(value: string | null) {
  if (!value) return '-';
  const parsed = parseCompletedAt(value);
  if (!parsed) return value;
  return parsed.toLocaleDateString('en-PH', { timeZone: BUSINESS_TIME_ZONE });
}

function resolveAgent(row: OrderRow) {
  const agent = Array.isArray(row.agent) ? row.agent[0] ?? null : row.agent;
  return (
    String(agent?.full_name ?? agent?.company_name ?? agent?.email ?? row.agent_id ?? 'Unassigned Agent').trim() ||
    'Unassigned Agent'
  );
}

function buildVisiblePages(currentPage: number, totalPages: number) {
  if (totalPages <= 5) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  if (currentPage <= 3) return [1, 2, 3, 4, 5];
  if (currentPage >= totalPages - 2) {
    return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
  }
  return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
}

function buildTopSelling(orders: CompletedOrderRecord[]) {
  const productMap = new Map<string, TopSellingRecord & { orderIds: Set<string> }>();

  orders.forEach((order) => {
    order.items.forEach((item) => {
      const product = String(item.product_name ?? '').trim() || 'Unnamed Product';
      const code = String(item.product_code ?? '').trim() || '-';
      const variant = String(item.variant_label ?? '').trim() || '-';
      const key = `${product}::${code}::${variant}`;
      const current = productMap.get(key) ?? {
        id: key,
        product,
        code,
        variant,
        paidQuantity: 0,
        freeQuantity: 0,
        salesAmount: 0,
        completedOrderCount: 0,
        orderIds: new Set<string>(),
      };

      current.paidQuantity += Number(item.quantity ?? 0) || 0;
      current.freeQuantity += Number(item.free_quantity ?? 0) || 0;
      current.salesAmount += Number(item.line_total ?? 0) || 0;
      current.orderIds.add(order.id);
      current.completedOrderCount = current.orderIds.size;
      productMap.set(key, current);
    });
  });

  return Array.from(productMap.values())
    .map(({ id, product, code, variant, paidQuantity, freeQuantity, salesAmount, completedOrderCount }) => ({
      id,
      product,
      code,
      variant,
      paidQuantity,
      freeQuantity,
      salesAmount,
      completedOrderCount,
    }))
    .sort((left, right) => right.salesAmount - left.salesAmount);
}

export default function OrdersSales() {
  const [activeView, setActiveView] = useState<SalesView>('orders');
  const [activeFilter, setActiveFilter] = useState<SalesFilter>('day');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [orders, setOrders] = useState<CompletedOrderRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<CompletedOrderRecord | null>(null);

  const range = useMemo(
    () => getDateRange(activeFilter, customStart, customEnd),
    [activeFilter, customEnd, customStart],
  );
  const filteredOrders = useMemo(
    () => orders.filter((order) => isDateKeyInRange(order.completedDateKey, range.start, range.end)),
    [orders, range.end, range.start],
  );
  const topSellingProducts = useMemo(() => buildTopSelling(filteredOrders), [filteredOrders]);
  const totalDataCount = activeView === 'orders' ? filteredOrders.length : topSellingProducts.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safeCurrentPage - 1) * ROWS_PER_PAGE;
  const pageEnd = totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const visiblePages = buildVisiblePages(safeCurrentPage, totalPages);
  const pagedOrders = filteredOrders.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const pagedProducts = topSellingProducts.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);

  const loadCompletedSalesRecords = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    const { data: orderRows, error: ordersError } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        po_number,
        agent_id,
        branch_name,
        branch_code,
        client_name,
        grand_total,
        total_quantity,
        order_date,
        order_status,
        created_at,
        updated_at,
        agent:agent_accounts!orders_agent_id_fkey(full_name, company_name, email)
      `)
      .in(ORDER_STATUS_FIELD, COMPLETED_RAW_STATUSES)
      .order('updated_at', { ascending: false });

    if (ordersError) {
      setOrders([]);
      setLoadError('Sales records could not be loaded.');
      setIsLoading(false);
      return;
    }

    const completedRows = (orderRows ?? []) as OrderRow[];
    const orderIds = completedRows.map((row) => String(row.id));
    let itemRows: OrderItemRow[] = [];
    let historyRows: StatusHistoryRow[] = [];

    if (orderIds.length > 0) {
      const [itemsResult, historyResult] = await Promise.all([
        supabase
          .from('order_items')
          .select('id, order_id, product_name, product_code, variant_label, quantity, free_quantity, line_total')
          .in('order_id', orderIds),
        supabase
          .from('order_status_history')
          .select('order_id, status, changed_at')
          .in('order_id', orderIds)
          .in('status', COMPLETED_RAW_STATUSES)
          .order('changed_at', { ascending: true }),
      ]);

      if (itemsResult.error || historyResult.error) {
        setOrders([]);
        setLoadError('Sales records could not be loaded.');
        setIsLoading(false);
        return;
      }

      itemRows = (itemsResult.data ?? []) as OrderItemRow[];
      historyRows = (historyResult.data ?? []) as StatusHistoryRow[];
    }

    const itemsByOrderId = new Map<string, OrderItemRow[]>();
    itemRows.forEach((item) => {
      const orderId = String(item.order_id ?? '');
      if (!orderId) return;
      itemsByOrderId.set(orderId, [...(itemsByOrderId.get(orderId) ?? []), item]);
    });

    const completedHistoryByOrderId = new Map<string, string>();
    historyRows.forEach((row) => {
      const orderId = String(row.order_id ?? '');
      if (!orderId || !row.changed_at || completedHistoryByOrderId.has(orderId)) return;
      completedHistoryByOrderId.set(orderId, row.changed_at);
    });

    const nextOrders = completedRows
      .map((row) => {
        const items = itemsByOrderId.get(String(row.id)) ?? [];
        const completedAt = resolveCompletedAt(row, completedHistoryByOrderId);
        const paidQuantity = items.reduce((sum, item) => sum + (Number(item.quantity ?? 0) || 0), 0);
        const freeQuantity = items.reduce((sum, item) => sum + (Number(item.free_quantity ?? 0) || 0), 0);
        return {
          id: String(row.id),
          orderNumber: String(row.order_number ?? '-'),
          poNumber: String(row.po_number ?? '-'),
          client: String(row.client_name ?? '-'),
          agent: resolveAgent(row),
          branch: String(row.branch_code ?? row.branch_name ?? '-'),
          completedAt,
          completedDateKey: toDateKey(completedAt),
          paidQuantity: paidQuantity || Number(row.total_quantity ?? 0) || 0,
          freeQuantity,
          grandTotal: Number(row.grand_total ?? 0),
          status: COMPLETED_DISPLAY_STATUS,
          items,
        } satisfies CompletedOrderRecord;
      })
      .sort((left, right) => String(right.completedAt ?? '').localeCompare(String(left.completedAt ?? '')));

    setOrders(nextOrders);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCompletedSalesRecords();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadCompletedSalesRecords]);

  function handlePageInputChange(value: string) {
    if (value === '') return;
    const page = Number(value);
    if (Number.isNaN(page)) return;
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
            <h2 className={styles.title}>Completed Sales Report</h2>
            <p className={styles.description}>
              Completed order sales report with read-only order details.
            </p>
          </div>

          <div className={styles.controls}>
            <div className={styles.filterTabs} aria-label="Sales table view">
              {(Object.keys(viewLabels) as SalesView[]).map((view) => (
                <button
                  key={view}
                  type="button"
                  className={`${styles.filterTab} ${activeView === view ? styles.filterTabActive : ''}`}
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

            {activeFilter === 'custom' ? (
              <div className={styles.customRange}>
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => {
                    setCustomStart(event.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Custom range start"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => {
                    setCustomEnd(event.target.value);
                    setCurrentPage(1);
                  }}
                  aria-label="Custom range end"
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.tableShell}>
          <div className={styles.tableMeta}>
            <span className={styles.metaPill}>{filterLabels[activeFilter]}</span>
            <span className={styles.metaText}>
              {loadError
                ? loadError
                : isLoading
                  ? 'Loading completed sales...'
                  : `${filteredOrders.length.toLocaleString()} completed orders recorded for the selected period.`}
            </span>
          </div>

          {activeView === 'orders' ? (
            <div className={styles.table} role="table" aria-label="Completed orders sales report">
              <div className={styles.ordersHeader} role="row">
                <span role="columnheader">Order No.</span>
                <span role="columnheader">P.O. No.</span>
                <span role="columnheader">Client</span>
                <span role="columnheader">Agent</span>
                <span role="columnheader">Branch</span>
                    <span role="columnheader">Completed Date</span>
                <span role="columnheader">Paid Qty</span>
                <span role="columnheader">Free Qty</span>
                <span role="columnheader">Grand Total</span>
                    <span role="columnheader">Status</span>
                <span role="columnheader" className={styles.actionHeader}>View</span>
              </div>

              {isLoading ? (
                <div className={styles.emptyState}>Loading completed sales...</div>
              ) : pagedOrders.length === 0 ? (
                <div className={styles.emptyState}>No completed orders found for this period.</div>
              ) : (
                pagedOrders.map((record) => (
                  <div key={record.id} className={styles.ordersRow} role="row">
                    <span role="cell" className={styles.primaryCell}>{record.orderNumber}</span>
                    <span role="cell">{record.poNumber}</span>
                    <span role="cell">{record.client}</span>
                    <span role="cell">{record.agent}</span>
                    <span role="cell">{record.branch}</span>
                    <span role="cell">{formatDisplayDate(record.completedAt)}</span>
                    <span role="cell" className={styles.numericCell}>{formatQuantity(record.paidQuantity)}</span>
                    <span role="cell" className={styles.numericCell}>{formatQuantity(record.freeQuantity)}</span>
                    <span role="cell" className={styles.numericCell}>{formatSales(record.grandTotal)}</span>
                    <span role="cell">{record.status}</span>
                    <span role="cell" className={styles.actionCell}>
                      <button type="button" className={styles.viewButton} onClick={() => setSelectedOrder(record)}>
                        View
                      </button>
                    </span>
                  </div>
                ))
              )}
            </div>
          ) : (
            <div className={styles.table} role="table" aria-label="Top selling products from completed orders">
              <div className={styles.productsHeader} role="row">
                <span role="columnheader">Product</span>
                <span role="columnheader">Code</span>
                <span role="columnheader">Variant</span>
                <span role="columnheader">Paid Quantity Sold</span>
                <span role="columnheader">Free Quantity</span>
                <span role="columnheader">Sales Amount</span>
                <span role="columnheader">Completed Order Count</span>
              </div>

              {isLoading ? (
                <div className={styles.emptyState}>Loading completed sales...</div>
              ) : pagedProducts.length === 0 ? (
                <div className={styles.emptyState}>No completed product sales found for this period.</div>
              ) : (
                pagedProducts.map((record) => (
                  <div key={record.id} className={styles.productsRow} role="row">
                    <span role="cell" className={styles.primaryCell}>{record.product}</span>
                    <span role="cell">{record.code}</span>
                    <span role="cell">{record.variant}</span>
                    <span role="cell" className={styles.numericCell}>{formatQuantity(record.paidQuantity)}</span>
                    <span role="cell" className={styles.numericCell}>{formatQuantity(record.freeQuantity)}</span>
                    <span role="cell" className={styles.numericCell}>{formatSales(record.salesAmount)}</span>
                    <span role="cell" className={styles.numericCell}>{formatQuantity(record.completedOrderCount)}</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </section>

      <div className={styles.footer}>
        <span className={styles.footerText}>
          Showing {pageStart}-{pageEnd} of {totalDataCount.toLocaleString()}{' '}
          {activeView === 'orders' ? 'completed orders' : 'completed product rows'}
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
              className={`${styles.pageButton} ${safeCurrentPage === page ? styles.pageButtonActive : ''}`}
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

      {selectedOrder ? (
        <div className={styles.modalOverlay} role="presentation">
          <div className={styles.detailsModal} role="dialog" aria-modal="true" aria-label="Completed order details">
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Completed order</p>
                <h3 className={styles.modalTitle}>{selectedOrder.orderNumber}</h3>
                <p className={styles.description}>{selectedOrder.client} | {selectedOrder.branch}</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setSelectedOrder(null)}
                aria-label="Close completed order details"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>

            <div className={styles.detailsGrid}>
              <span>P.O. No.</span><strong>{selectedOrder.poNumber}</strong>
              <span>Agent</span><strong>{selectedOrder.agent}</strong>
              <span>Completed Date</span><strong>{formatDisplayDate(selectedOrder.completedAt)}</strong>
              <span>Status</span><strong>{selectedOrder.status}</strong>
              <span>Paid Quantity</span><strong>{formatQuantity(selectedOrder.paidQuantity)}</strong>
              <span>Free Quantity</span><strong>{formatQuantity(selectedOrder.freeQuantity)}</strong>
              <span>Grand Total</span><strong>PHP {formatSales(selectedOrder.grandTotal)}</strong>
            </div>

            <div className={styles.detailsItems}>
              <div className={styles.detailsItemsHeader}>
                <span>Product</span>
                <span>Code</span>
                <span>Variant</span>
                <span>Paid Qty</span>
                <span>Free Qty</span>
                <span>Sales</span>
              </div>
              {selectedOrder.items.length === 0 ? (
                <div className={styles.emptyState}>No order items found.</div>
              ) : (
                selectedOrder.items.map((item) => (
                  <div key={item.id} className={styles.detailsItemsRow}>
                    <span>{item.product_name ?? 'Unnamed Product'}</span>
                    <span>{item.product_code ?? '-'}</span>
                    <span>{item.variant_label ?? '-'}</span>
                    <span>{formatQuantity(Number(item.quantity ?? 0) || 0)}</span>
                    <span>{formatQuantity(Number(item.free_quantity ?? 0) || 0)}</span>
                    <span>{formatSales(Number(item.line_total ?? 0) || 0)}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
