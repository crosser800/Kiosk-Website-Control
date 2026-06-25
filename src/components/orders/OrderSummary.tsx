import { useEffect, useMemo, useRef, useState } from 'react';
import Skeleton from '../common/Skeleton';
import { supabase } from '../../lib/supabase';
import styles from './OrderSummary.module.css';

type OrderItem = {
  id: string;
  orderNo: string;
  agent: string;
  poNo: string;
  date: string;
  time: string;
  branch: string;
  clientName: string;
  terms: string;
  poStatus: string;
  rawStatus: string;
  rawDate: string;
};

const ROWS_PER_PAGE = 10;

type OrderDetailItem = {
  id: string;
  productName: string;
  code: string;
  variant: string;
  branch: string;
  preferenceType: string;
  priceCode: string;
  unitPrice: number;
  quantity: number;
  discountAmount: number;
  surchargeAmount: number;
  freeQuantity: number;
  lineSubtotal: number;
  lineTotal: number;
};

type OrderDetails = {
  order: OrderItem;
  items: OrderDetailItem[];
  subtotal: number;
  discountTotal: number;
  surchargeTotal: number;
  grandTotal: number;
};
type OrderStatusHistoryItem = {
  id: string;
  status: string;
  changedAt: string;
};
type PendingStatusAction = {
  nextStatus: string;
  label: string;
};
type OrderStatusTab = 'All' | 'Placed' | 'Confirmed' | 'Preparing' | 'Ready' | 'Delivering' | 'Completed' | 'Cancelled';
const ORDER_STATUS_TABS: OrderStatusTab[] = ['All', 'Placed', 'Confirmed', 'Preparing', 'Ready', 'Delivering', 'Completed', 'Cancelled'];
type DateFilterMode = 'single' | 'range';

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.filterIcon}>
      <path d="M7 3v3M17 3v3M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

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

function formatOrderTime(raw: unknown) {
  const value = String(raw ?? '').trim();
  if (!value) return '-';
  const match = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return value;

  const hour24 = Number(match[1]);
  const minute = match[2];
  if (Number.isNaN(hour24) || hour24 < 0 || hour24 > 23) return value;

  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function toDisplayStatus(raw: string) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'processing') return 'Preparing';
  if (normalized === 'delivered') return 'Completed';
  return raw || '-';
}

function getNextStatus(rawStatus: string): { dbStatus: string; label: string } | null {
  const status = String(rawStatus ?? '').trim().toLowerCase();
  if (status === 'placed') return { dbStatus: 'Confirmed', label: 'Proceed to Confirmed' };
  if (status === 'confirmed') return { dbStatus: 'Processing', label: 'Proceed to Preparing' };
  if (status === 'processing') return { dbStatus: 'Ready', label: 'Proceed to Ready' };
  if (status === 'ready') return { dbStatus: 'Delivered', label: 'Proceed to Completed' };
  return null;
}

function formatIsoDate(isoDate: string) {
  if (!isoDate) return '-';
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toLocaleDateString('en-PH');
}

async function resolveCurrentAdminAccountId() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    if (userError) {
      console.error('OrderSummary: failed to resolve current Supabase user for status history', userError);
    }
    return null;
  }

  const { data: adminAccount, error: adminError } = await supabase
    .from('admin_accounts')
    .select('id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle();

  if (adminError) {
    console.error('OrderSummary: failed to resolve current admin account for status history', adminError);
    return null;
  }

  return adminAccount?.id ? String(adminAccount.id) : null;
}

export default function OrderSummary() {
  const warnedMissingAgentIdsRef = useRef<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetails | null>(null);
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isSubmittingStatus, setIsSubmittingStatus] = useState(false);
  const [statusHistory, setStatusHistory] = useState<OrderStatusHistoryItem[]>([]);
  const [activeStatusTab, setActiveStatusTab] = useState<OrderStatusTab>('All');
  const [pendingStatusAction, setPendingStatusAction] = useState<PendingStatusAction | null>(null);
  const [snackbar, setSnackbar] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const today = new Date();
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('single');
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [tempSingleDate, setTempSingleDate] = useState<string | null>(null);
  const [tempRangeStart, setTempRangeStart] = useState<string | null>(null);
  const [tempRangeEnd, setTempRangeEnd] = useState<string | null>(null);
  const [appliedSingleDate, setAppliedSingleDate] = useState<string | null>(null);
  const [appliedRangeStart, setAppliedRangeStart] = useState<string | null>(null);
  const [appliedRangeEnd, setAppliedRangeEnd] = useState<string | null>(null);

  const statusFilteredOrders = useMemo(() => {
    if (activeStatusTab === 'All') return orders;
    return orders.filter((order) => {
      const status = String(order.rawStatus ?? '').toLowerCase();
      if (activeStatusTab === 'Preparing') return status === 'preparing' || status === 'processing';
      if (activeStatusTab === 'Delivering') return status === 'delivering';
      if (activeStatusTab === 'Completed') return status === 'completed' || status === 'delivered';
      return status === activeStatusTab.toLowerCase();
    });
  }, [activeStatusTab, orders]);
  const filteredOrders = useMemo(() => {
    if (appliedSingleDate) {
      return statusFilteredOrders.filter((order) => order.rawDate === appliedSingleDate);
    }
    if (appliedRangeStart && appliedRangeEnd) {
      const start = appliedRangeStart <= appliedRangeEnd ? appliedRangeStart : appliedRangeEnd;
      const end = appliedRangeStart <= appliedRangeEnd ? appliedRangeEnd : appliedRangeStart;
      return statusFilteredOrders.filter((order) => order.rawDate >= start && order.rawDate <= end);
    }
    return statusFilteredOrders;
  }, [appliedRangeEnd, appliedRangeStart, appliedSingleDate, statusFilteredOrders]);
  const totalDataCount = filteredOrders.length;
  const totalPages = Math.max(Math.ceil(totalDataCount / ROWS_PER_PAGE), 1);
  const pageStartIndex = (currentPage - 1) * ROWS_PER_PAGE;
  const pagedOrders = filteredOrders.slice(pageStartIndex, pageStartIndex + ROWS_PER_PAGE);
  const pageStart = totalDataCount === 0 ? 0 : pageStartIndex + 1;
  const pageEnd =
    totalDataCount === 0 ? 0 : Math.min(pageStartIndex + ROWS_PER_PAGE, totalDataCount);
  const visiblePages = buildVisiblePages(currentPage, totalPages);

  const emptyText = isLoading
    ? ''
    : loadError
      ? `Failed to load: ${loadError}`
      : 'No orders yet.';

  const currency = useMemo(
    () =>
      new Intl.NumberFormat('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }),
    [],
  );

  async function loadOrders() {
      setIsLoading(true);
      setLoadError('');

      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          agent_id,
          order_number,
          po_number,
          order_date,
          order_time,
          branch_name,
          branch_code,
          client_name,
          order_status,
          subtotal,
          discount_total,
          surcharge_total,
          grand_total,
          agent:agent_accounts!orders_agent_id_fkey(id, full_name, agent_code, company_name, email),
          delivery_term:delivery_terms!orders_delivery_term_id_fkey(*)
        `)
        .order('created_at', { ascending: false });

      if (error) {
        setLoadError(error.message);
        setOrders([]);
        setIsLoading(false);
        return;
      }

      const unresolvedAgentIds = Array.from(
        new Set(
          (data ?? [])
            .filter((row: any) => row.agent_id && !row.agent)
            .map((row: any) => String(row.agent_id)),
        ),
      );

      const fallbackAgentById = new Map<string, { full_name?: string; company_name?: string; email?: string }>();
      if (unresolvedAgentIds.length > 0) {
        const { data: fallbackAgents, error: fallbackError } = await supabase
          .from('agent_accounts')
          .select('id, full_name, company_name, email')
          .in('id', unresolvedAgentIds);

        if (!fallbackError) {
          (fallbackAgents ?? []).forEach((agent: any) => {
            fallbackAgentById.set(String(agent.id), {
              full_name: String(agent.full_name ?? '').trim() || undefined,
              company_name: String(agent.company_name ?? '').trim() || undefined,
              email: String(agent.email ?? '').trim() || undefined,
            });
          });
        }
      }

      const mapped = (data ?? []).map((row: any) => {
        const agentRef = row.agent ?? fallbackAgentById.get(String(row.agent_id ?? '')) ?? null;
        const termRef = row.delivery_term ?? {};
        const agentName =
          String(
            agentRef?.full_name ??
            agentRef?.company_name ??
            agentRef?.email ??
            '-',
          ).trim() || '-';
        if (
          import.meta.env.DEV &&
          row.agent_id &&
          (!agentRef || (!agentRef.full_name && !agentRef.company_name && !agentRef.email))
        ) {
          const agentKey = String(row.agent_id);
          if (!warnedMissingAgentIdsRef.current.has(agentKey)) {
            warnedMissingAgentIdsRef.current.add(agentKey);
            console.warn('OrderSummary: missing joined agent record for agent_id', {
              orderId: row.id,
              agentId: row.agent_id,
            });
          }
        }
        const termsLabel =
          String(termRef.term_name ?? termRef.name ?? termRef.title ?? termRef.code ?? '').trim() ||
          '-';
        const parsedDate = row.order_date ? new Date(row.order_date) : null;

        return {
          id: String(row.id),
          orderNo: String(row.order_number ?? '-'),
          agent: agentName,
          poNo: String(row.po_number ?? '-'),
          date: parsedDate ? parsedDate.toLocaleDateString('en-PH') : '-',
          time: formatOrderTime(row.order_time),
          branch: String(row.branch_code ?? row.branch_name ?? '-'),
          clientName: String(row.client_name ?? '-'),
          terms: termsLabel,
          poStatus: toDisplayStatus(String(row.order_status ?? '-')),
          rawStatus: String(row.order_status ?? '-'),
          rawDate: String(row.order_date ?? ''),
        } satisfies OrderItem;
      });

      setOrders(mapped);
      setIsLoading(false);
    }
  useEffect(() => {
    void loadOrders();
  }, []);

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);
  useEffect(() => {
    setCurrentPage(1);
  }, [activeStatusTab]);
  useEffect(() => {
    if (!snackbar) return;
    const timeout = window.setTimeout(() => setSnackbar(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

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

  function buildCalendarDays() {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; isCurrentMonth: boolean }> = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push({ iso: '', day: 0, isCurrentMonth: false });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ iso, day, isCurrentMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: '', day: 0, isCurrentMonth: false });
    return cells;
  }

  function handleCalendarDateClick(iso: string) {
    if (!iso) return;
    if (dateFilterMode === 'single') {
      setTempSingleDate(iso);
      return;
    }
    if (!tempRangeStart || (tempRangeStart && tempRangeEnd)) {
      setTempRangeStart(iso);
      setTempRangeEnd(null);
      return;
    }
    if (iso < tempRangeStart) {
      setTempRangeEnd(tempRangeStart);
      setTempRangeStart(iso);
      return;
    }
    setTempRangeEnd(iso);
  }

  function isInTempRange(iso: string) {
    if (!iso || !tempRangeStart || !tempRangeEnd) return false;
    return iso >= tempRangeStart && iso <= tempRangeEnd;
  }

  function applyDateFilter() {
    if (dateFilterMode === 'single') {
      setAppliedSingleDate(tempSingleDate);
      setAppliedRangeStart(null);
      setAppliedRangeEnd(null);
    } else {
      setAppliedSingleDate(null);
      setAppliedRangeStart(tempRangeStart);
      setAppliedRangeEnd(tempRangeEnd);
    }
    setIsDateFilterOpen(false);
    setCurrentPage(1);
  }

  function clearDateFilter() {
    setAppliedSingleDate(null);
    setAppliedRangeStart(null);
    setAppliedRangeEnd(null);
    setTempSingleDate(null);
    setTempRangeStart(null);
    setTempRangeEnd(null);
    setCurrentPage(1);
  }

  async function fetchOrderDetails(order: OrderItem) {
    const { data, error } = await supabase
      .from('order_items')
      .select(`
        id,
        product_name,
        product_code,
        variant_label,
        branch_name,
        preference_type,
        price_code,
        unit_price,
        quantity,
        discount_amount,
        surcharge_amount,
        free_quantity,
        line_subtotal,
        line_total
      `)
      .eq('order_id', order.id)
      .order('sort_order', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    const items = (data ?? []).map((item: any) => ({
      id: String(item.id),
      productName: String(item.product_name ?? '-'),
      code: String(item.product_code ?? '-'),
      variant: String(item.variant_label ?? 'Default'),
      branch: String(item.branch_name ?? '-'),
      preferenceType: String(item.preference_type ?? '-'),
      priceCode: String(item.price_code ?? '-'),
      unitPrice: Number(item.unit_price ?? 0),
      quantity: Number(item.quantity ?? 0),
      discountAmount: Number(item.discount_amount ?? 0),
      surchargeAmount: Number(item.surcharge_amount ?? 0),
      freeQuantity: Number(item.free_quantity ?? 0),
      lineSubtotal: Number(item.line_subtotal ?? 0),
      lineTotal: Number(item.line_total ?? 0),
    })) satisfies OrderDetailItem[];

    const totalsRes = await supabase
      .from('orders')
      .select('subtotal, discount_total, surcharge_total, grand_total')
      .eq('id', order.id)
      .single();

    return {
      order,
      items,
      subtotal: Number(totalsRes.data?.subtotal ?? 0),
      discountTotal: Number(totalsRes.data?.discount_total ?? 0),
      surchargeTotal: Number(totalsRes.data?.surcharge_total ?? 0),
      grandTotal: Number(totalsRes.data?.grand_total ?? 0),
    } satisfies OrderDetails;
  }

  async function loadStatusHistory(orderId: string) {
    const { data: historyRows, error } = await supabase
      .from('order_status_history')
      .select('id, status, changed_at')
      .eq('order_id', orderId)
      .order('changed_at', { ascending: true });

    if (error) {
      throw new Error(error.message);
    }

    return (historyRows ?? []).map((row: any) => ({
      id: String(row.id),
      status: toDisplayStatus(String(row.status ?? '-')),
      changedAt: String(row.changed_at ?? ''),
    })) satisfies OrderStatusHistoryItem[];
  }

  async function handleOpenOrder(order: OrderItem) {
    setIsLoadingDetails(true);
    try {
      const details = await fetchOrderDetails(order);
      setSelectedOrder(details);
      setStatusHistory(await loadStatusHistory(order.id));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load order details.');
    }
    setIsLoadingDetails(false);
  }

  async function handleUpdateOrderStatus(nextStatus: string) {
    if (!selectedOrder) return;

    setIsSubmittingStatus(true);
    setLoadError('');

    const orderId = selectedOrder.order.id;
    const updatedOrder = {
      ...selectedOrder.order,
      poStatus: toDisplayStatus(nextStatus),
      rawStatus: nextStatus,
    };

    const { error } = await supabase
      .from('orders')
      .update({ order_status: nextStatus })
      .eq('id', orderId);

    if (error) {
      setLoadError(error.message);
      setSnackbar({ type: 'error', message: error.message });
      setIsSubmittingStatus(false);
      return;
    }

    let historyInsertFailed = false;
    let historyInsertMessage = '';

    try {
      const adminAccountId = await resolveCurrentAdminAccountId();
      const { error: historyError } = await supabase.from('order_status_history').insert({
        order_id: orderId,
        status: nextStatus,
        changed_at: new Date().toISOString(),
        changed_by: adminAccountId,
        notes: 'Status updated from admin',
      });

      if (historyError) {
        historyInsertFailed = true;
        historyInsertMessage = historyError.message;
        console.error('OrderSummary: failed to insert order status history', historyError);
      }
    } catch (historyError) {
      historyInsertFailed = true;
      historyInsertMessage =
        historyError instanceof Error ? historyError.message : 'Failed to save order status history.';
      console.error('OrderSummary: unexpected error while inserting order status history', historyError);
    }

    setOrders((prev) =>
      prev.map((item) =>
        item.id === orderId ? updatedOrder : item,
      ),
    );

    try {
      const refreshedDetails = await fetchOrderDetails(updatedOrder);
      setSelectedOrder(refreshedDetails);
      setStatusHistory(await loadStatusHistory(orderId));
    } catch (refreshError) {
      console.error('OrderSummary: failed to refresh order details after status update', refreshError);
      setSelectedOrder((prev) => (prev ? { ...prev, order: updatedOrder } : prev));
    }

    setSnackbar(
      historyInsertFailed
        ? {
            type: 'info',
            message: `Order moved to ${toDisplayStatus(nextStatus)}, but status history could not be saved.`,
          }
        : { type: 'success', message: `Order moved to ${toDisplayStatus(nextStatus)}.` },
    );
    if (historyInsertFailed) {
      setLoadError(historyInsertMessage);
    }
    setPendingStatusAction(null);
    setIsSubmittingStatus(false);
  }

  async function handleRemoveItem(itemId: string) {
    if (!selectedOrder) return;
    const { error } = await supabase.from('order_items').delete().eq('id', itemId);
    if (error) {
      setLoadError(error.message);
      return;
    }
    const refreshed = await fetchOrderDetails(selectedOrder.order);
    setSelectedOrder(refreshed);
    await loadOrders();
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.topHeader}>
        <div className={styles.topHeaderCopy}>
          <p className={styles.sectionEyebrow}>Order controls</p>
          <h2 className={styles.title}>Order Summary</h2>
          <p className={styles.subtitle}>
            Filter by date and keep the current order queue organized.
          </p>
        </div>
        <div className={styles.headerActions}>
          {appliedSingleDate || (appliedRangeStart && appliedRangeEnd) ? (
            <button type="button" className={styles.clearFilterButton} onClick={clearDateFilter}>Clear Filter</button>
          ) : null}
          <button type="button" className={styles.dateFilterButton} onClick={() => setIsDateFilterOpen((prev) => !prev)}>
            <CalendarIcon />
            <span>Filter Date</span>
          </button>
        </div>
      </div>

      {isDateFilterOpen ? (
        <div className={styles.dateFilterOverlay} role="presentation">
          <div className={styles.dateFilterModal} role="dialog" aria-modal="true" aria-label="Filter orders by date">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Filter Date</h3>
              <button type="button" className={styles.modalClose} onClick={() => setIsDateFilterOpen(false)} aria-label="Close date filter">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <div className={styles.dateFilterPopover}>
          <div className={styles.dateModeTabs}>
            <button type="button" className={`${styles.dateModeTab} ${dateFilterMode === 'single' ? styles.dateModeTabActive : ''}`} onClick={() => setDateFilterMode('single')}>Single</button>
            <button type="button" className={`${styles.dateModeTab} ${dateFilterMode === 'range' ? styles.dateModeTabActive : ''}`} onClick={() => setDateFilterMode('range')}>Range</button>
          </div>
          <div className={styles.calendarControls}>
            <select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))}>
              {['January','February','March','April','May','June','July','August','September','October','November','December'].map((month, index) => (
                <option key={month} value={index}>{month}</option>
              ))}
            </select>
            <select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))}>
              {Array.from({ length: 9 }, (_, i) => today.getFullYear() - 4 + i).map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <div className={styles.calendarGrid}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map((day) => <span key={day} className={styles.calendarHead}>{day}</span>)}
            {buildCalendarDays().map((cell, index) => {
              const isSelectedSingle = dateFilterMode === 'single' && tempSingleDate === cell.iso;
              const isStart = dateFilterMode === 'range' && tempRangeStart === cell.iso;
              const isEnd = dateFilterMode === 'range' && tempRangeEnd === cell.iso;
              const isRange = dateFilterMode === 'range' && isInTempRange(cell.iso);
              return (
                <button
                  key={`${cell.iso}-${index}`}
                  type="button"
                  className={`${styles.calendarCell} ${!cell.isCurrentMonth ? styles.calendarCellEmpty : ''} ${isSelectedSingle || isStart || isEnd ? styles.calendarCellSelected : ''} ${isRange ? styles.calendarCellRange : ''}`}
                  onClick={() => handleCalendarDateClick(cell.iso)}
                  disabled={!cell.isCurrentMonth}
                >
                  {cell.day || ''}
                </button>
              );
            })}
          </div>
          <div className={styles.dateFilterFooter}>
            <span className={styles.datePreview}>
              {dateFilterMode === 'single'
                ? `Selected: ${tempSingleDate ? formatIsoDate(tempSingleDate) : '-'}`
                : `Range: ${tempRangeStart ? formatIsoDate(tempRangeStart) : '-'} to ${tempRangeEnd ? formatIsoDate(tempRangeEnd) : '-'}`}
            </span>
            <button type="button" className={styles.confirmProceed} onClick={applyDateFilter}>Apply</button>
          </div>
            </div>
          </div>
        </div>
      ) : null}

      <section className={styles.container}>
        <div className={styles.header}>
          {isLoadingDetails ? <span className={styles.loadingDetails}>Loading order details...</span> : null}
        </div>
      <div className={styles.filterTabs} aria-label="Order status tabs">
        {ORDER_STATUS_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.filterTab} ${activeStatusTab === tab ? styles.filterTabActive : ''}`}
            onClick={() => setActiveStatusTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Order No.</span>
          <span>Agent</span>
          <span>P.O. No.</span>
          <span>Date</span>
          <span>Time</span>
          <span>Branch</span>
          <span>Client Name</span>
          <span>Terms</span>
          <span>P.O. Status</span>
          <span className={styles.actionHeader}>Action</span>
        </div>

        {isLoading ? (
          Array.from({ length: ROWS_PER_PAGE }).map((_, index) => (
            <div key={`order-skeleton-${index}`} className={styles.tableRow}>
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.rowSkeleton} height="1rem" />
              <Skeleton className={styles.iconSkeleton} height="2rem" width="2rem" />
            </div>
          ))
        ) : pagedOrders.length === 0 ? (
          <div className={styles.emptyState}>
            <span>{emptyText}</span>
          </div>
        ) : (
          pagedOrders.map((order) => (
            <div key={order.id} className={styles.tableRow}>
              <span>{order.orderNo}</span>
              <span>{order.agent}</span>
              <span>{order.poNo}</span>
              <span>{order.date}</span>
              <span>{order.time}</span>
              <span>{order.branch}</span>
              <span>{order.clientName}</span>
              <span>{order.terms}</span>
              <span>{order.poStatus}</span>
              <button
                type="button"
                className={styles.actionButton}
                aria-label={`View order ${order.orderNo}`}
                onClick={() => void handleOpenOrder(order)}
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

      {selectedOrder ? (
        <div className={styles.modalOverlay} role="presentation">
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Order details">
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Order {selectedOrder.order.orderNo}</h3>
              <button type="button" className={styles.modalClose} onClick={() => setSelectedOrder(null)} aria-label="Close order details">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <div className={styles.modalInfoGrid}>
              <span className={styles.infoCard}><strong>Order No.:</strong> {selectedOrder.order.orderNo}</span>
              <span className={styles.infoCard}><strong>Agent:</strong> {selectedOrder.order.agent}</span>
              <span className={styles.infoCard}><strong>P.O. No.:</strong> {selectedOrder.order.poNo}</span>
              <span className={styles.infoCard}><strong>Client:</strong> {selectedOrder.order.clientName}</span>
              <span className={styles.infoCard}><strong>Date:</strong> {selectedOrder.order.date}</span>
              <span className={styles.infoCard}><strong>Time:</strong> {selectedOrder.order.time}</span>
              <span className={styles.infoCard}><strong>Branch:</strong> {selectedOrder.order.branch}</span>
              <span className={styles.infoCard}><strong>Terms:</strong> {selectedOrder.order.terms}</span>
              <span className={styles.infoCard}><strong>Status:</strong> {selectedOrder.order.poStatus}</span>
            </div>
            <div className={styles.modalTable}>
              <div className={styles.modalTableHeader}>
                <span>Product</span><span>Code</span><span>Variant</span><span>Qty</span><span>Unit</span><span>Discount</span><span>Surcharge</span><span>Total</span><span>Action</span>
              </div>
              {selectedOrder.items.length === 0 ? (
                <div className={styles.modalEmpty}>No order items found.</div>
              ) : (
                selectedOrder.items.map((item) => (
                  <div key={item.id} className={styles.modalTableRow}>
                    <span>{item.productName}</span>
                    <span>{item.code}</span>
                    <span>{item.variant}</span>
                    <span>{item.quantity}</span>
                    <span>{currency.format(item.unitPrice)}</span>
                    <span>{currency.format(item.discountAmount)}</span>
                    <span>{currency.format(item.surchargeAmount)}</span>
                    <span>{currency.format(item.lineTotal)}</span>
                    <button type="button" className={styles.removeItemButton} onClick={() => void handleRemoveItem(item.id)}>Remove</button>
                  </div>
                ))
              )}
            </div>
            <div className={styles.modalTotals}>
              <span>Subtotal: {currency.format(selectedOrder.subtotal)}</span>
              <span>Discount: {currency.format(selectedOrder.discountTotal)}</span>
              <span>Surcharge: {currency.format(selectedOrder.surchargeTotal)}</span>
              <span><strong>Grand Total: {currency.format(selectedOrder.grandTotal)}</strong></span>
            </div>
            <div className={styles.statusTimeline}>
              <h4 className={styles.timelineTitle}>Status Timeline</h4>
              {statusHistory.length === 0 ? (
                <p className={styles.timelineEmpty}>No status history yet.</p>
              ) : (
                <div className={styles.timelineList}>
                  {statusHistory.map((entry) => (
                    <div key={entry.id} className={styles.timelineRow}>
                      <span>{entry.status}</span>
                      <span>{entry.changedAt ? new Date(entry.changedAt).toLocaleString('en-PH') : '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {getNextStatus(selectedOrder.order.rawStatus) ||
            (selectedOrder.order.rawStatus.toLowerCase() !== 'delivered' &&
              selectedOrder.order.rawStatus.toLowerCase() !== 'completed' &&
              selectedOrder.order.rawStatus.toLowerCase() !== 'cancelled') ? (
              <div className={styles.modalFooterActions}>
                {getNextStatus(selectedOrder.order.rawStatus) ? (
                  <button
                    type="button"
                    className={styles.placeButton}
                    onClick={() =>
                      setPendingStatusAction({
                        nextStatus: getNextStatus(selectedOrder.order.rawStatus)!.dbStatus,
                        label: getNextStatus(selectedOrder.order.rawStatus)!.label,
                      })
                    }
                    disabled={isSubmittingStatus}
                  >
                    {getNextStatus(selectedOrder.order.rawStatus)!.label}
                  </button>
                ) : null}
                {selectedOrder.order.rawStatus.toLowerCase() !== 'delivered' && selectedOrder.order.rawStatus.toLowerCase() !== 'completed' && selectedOrder.order.rawStatus.toLowerCase() !== 'cancelled' ? (
                  <button
                    type="button"
                    className={styles.rejectButton}
                    onClick={() =>
                      setPendingStatusAction({
                        nextStatus: 'Cancelled',
                        label: 'Reject Order',
                      })
                    }
                    disabled={isSubmittingStatus}
                  >
                    Reject
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingStatusAction ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Confirm status update">
            <h4 className={styles.confirmTitle}>Are you sure you want to proceed?</h4>
            <p className={styles.confirmText}>
              This will update the order status to <strong>{toDisplayStatus(pendingStatusAction.nextStatus)}</strong>.
            </p>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancel} onClick={() => setPendingStatusAction(null)} disabled={isSubmittingStatus}>Cancel</button>
              <button type="button" className={styles.confirmProceed} onClick={() => void handleUpdateOrderStatus(pendingStatusAction.nextStatus)} disabled={isSubmittingStatus}>
                {isSubmittingStatus ? 'Updating...' : 'Yes, Proceed'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {snackbar ? (
        <div className={`${styles.snackbar} ${snackbar.type === 'success' ? styles.snackbarSuccess : snackbar.type === 'error' ? styles.snackbarError : styles.snackbarInfo}`}>
          {snackbar.message}
        </div>
      ) : null}
      </section>
    </section>
  );
}
