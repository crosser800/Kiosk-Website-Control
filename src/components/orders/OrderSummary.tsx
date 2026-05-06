import { useEffect, useState } from 'react';
import EditOrder from './EditOrder';
import styles from './OrderSummary.module.css';

type OrderFilter = 'serve' | 'unserve';

type OrderItem = {
  orderNo: string;
  agent: string;
  poNo: string;
  date: string;
  time: string;
  branch: string;
  packageName: string;
  clientName: string;
  terms: string;
  poStatus: string;
  status: OrderFilter;
};

const ROWS_PER_PAGE = 10;

const filterLabels: Record<OrderFilter, string> = {
  serve: 'Serve',
  unserve: 'Unserve',
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

export default function OrderSummary() {
  const [activeFilter, setActiveFilter] = useState<OrderFilter>('serve');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const filteredOrders = orders.filter((order) => order.status === activeFilter);
  const totalDataCount = filteredOrders.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pagedOrders = filteredOrders.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd =
    totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(currentPage, totalPages);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeFilter]);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

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

  function handleAddOrder() {
    const now = new Date();
    const nextNumber = orders.length + 1;
    const nextOrder: OrderItem = {
      orderNo: `ORD-${String(nextNumber).padStart(4, '0')}`,
      agent: 'Test Agent',
      poNo: `PO-${String(nextNumber).padStart(4, '0')}`,
      date: now.toLocaleDateString('en-PH'),
      time: now.toLocaleTimeString('en-PH', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      branch: 'Main Branch',
      packageName: 'Sample Package',
      clientName: 'Sample Client',
      terms: '',
      poStatus: '',
      status: activeFilter,
    };

    setOrders((prev) => [nextOrder, ...prev]);
    setCurrentPage(1);
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>Order Summary</h2>

        <div className={styles.filterTabs} aria-label="Order status filter">
          {(Object.keys(filterLabels) as OrderFilter[]).map((filter) => (
            <button
              key={filter}
              type="button"
              className={`${styles.filterTab} ${
                activeFilter === filter ? styles.filterTabActive : ''
              }`}
              onClick={() => setActiveFilter(filter)}
            >
              {filterLabels[filter]}
            </button>
          ))}

          <button
            type="button"
            className={styles.addButton}
            onClick={handleAddOrder}
            aria-label="Add order"
          >
            +
          </button>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Order No.</span>
          <span>Agent</span>
          <span>P.O. No.</span>
          <span>Date</span>
          <span>Time</span>
          <span>Branch</span>
          <span>Package</span>
          <span>Client Name</span>
          <span>Terms</span>
          <span>P.O. Status</span>
          <span className={styles.actionHeader}>Action</span>
        </div>

        {pagedOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <span>No {filterLabels[activeFilter].toLowerCase()} orders yet.</span>
          </div>
        ) : (
          pagedOrders.map((order) => (
            <div key={order.orderNo} className={styles.tableRow}>
              <span>{order.orderNo}</span>
              <span>{order.agent}</span>
              <span>{order.poNo}</span>
              <span>{order.date}</span>
              <span>{order.time}</span>
              <span>{order.branch}</span>
              <span>{order.packageName}</span>
              <span>{order.clientName}</span>
              <span>{order.terms}</span>
              <span>{order.poStatus}</span>
              <button
                type="button"
                className={styles.actionButton}
                aria-label={`Edit order ${order.orderNo}`}
                onClick={() => setSelectedOrder(order)}
              >
                <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i>
              </button>
            </div>
          ))
        )}
      </div>

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
            disabled={currentPage === 1}
          >
            <ChevronLeftIcon />
          </button>

          {visiblePages.map((page) => (
            <button
              key={page}
              type="button"
              className={`${styles.pageButton} ${
                currentPage === page ? styles.pageButtonActive : ''
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

      {selectedOrder && (
        <EditOrder order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </section>
  );
}
