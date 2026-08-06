import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Skeleton from '../common/Skeleton';
import { supabase } from '../../lib/supabase';
import { flattenOrderCatalogForAddItem, loadOrderCatalog } from '../../services/orderCatalog';
import styles from './OrderSummary.module.css';

type OrderSummaryProps = {
  appliedSingleDate: string | null;
  appliedRangeStart: string | null;
  appliedRangeEnd: string | null;
  refreshKey?: number;
};

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

type JoinedAgentRow = {
  id?: string | null;
  full_name?: string | null;
  agent_code?: string | null;
  company_name?: string | null;
  email?: string | null;
};

type DeliveryTermRow = {
  term_name?: string | null;
  name?: string | null;
  title?: string | null;
  code?: string | null;
};

type OrderListRow = {
  id: string | number;
  agent_id: string | null;
  order_number: string | null;
  po_number: string | null;
  order_date: string | null;
  order_time: string | null;
  branch_name: string | null;
  branch_code: string | null;
  client_name: string | null;
  order_status: string | null;
  agent: JoinedAgentRow | JoinedAgentRow[] | null;
  delivery_term: DeliveryTermRow | DeliveryTermRow[] | null;
};

type OrderDetailRow = {
  id: string | number;
  product_name: string | null;
  product_code: string | null;
  variant_label: string | null;
  branch_name: string | null;
  preference_type: string | null;
  price_code: string | null;
  unit_price: number | null;
  quantity: number | null;
  discount_amount: number | null;
  surcharge_amount: number | null;
  free_quantity: number | null;
  line_subtotal: number | null;
  line_total: number | null;
};

type OrderTotalsRow = {
  line_subtotal: number | null;
  discount_amount: number | null;
  surcharge_amount: number | null;
  line_total: number | null;
};

type StatusHistoryRow = {
  id: string | number;
  status: string | null;
  changed_at: string | null;
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

type OrderCatalogUnitOption = {
  id: string;
  unitCode: string;
  unitLabel: string;
  priceOverride: number | null;
  quantityInBaseUnit: number;
  computedPrice: number;
  minOrderQuantity: number;
  sortOrder: number;
  isDefault: boolean;
};

type OrderCatalogItem = {
  id: string;
  productId: string;
  categoryId: string;
  categoryName: string;
  productName: string;
  productCode: string;
  variationLabel: string;
  branchName: string;
  priceType: string;
  priceCode: string;
  unitPrice: number;
  availability: string;
  unitOptions: OrderCatalogUnitOption[];
};

type AddOrderItemDraft = {
  categoryId: string;
  searchQuery: string;
  selectedCatalogItemId: string;
  selectedUnitOptionId: string;
  quantity: string;
  freeQuantity: string;
};

type EditOrderItemDraft = {
  itemId: string;
  productName: string;
  variant: string;
  quantity: string;
  freeQuantity: string;
  unitPrice: string;
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
const STATUS_HISTORY_DUPLICATE_WINDOW_MS = 5_000;

function createAddOrderItemDraft(): AddOrderItemDraft {
  return {
    categoryId: 'all',
    searchQuery: '',
    selectedCatalogItemId: '',
    selectedUnitOptionId: '',
    quantity: '1',
    freeQuantity: '0',
  };
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

function getStatusTone(rawStatus: string) {
  const normalized = String(rawStatus ?? '').trim().toLowerCase();
  if (normalized === 'completed' || normalized === 'delivered') return 'success';
  if (normalized === 'cancelled') return 'danger';
  if (normalized === 'confirmed' || normalized === 'processing' || normalized === 'ready') {
    return 'warning';
  }
  return 'neutral';
}

function getNextStatus(rawStatus: string): { dbStatus: string; label: string } | null {
  const status = String(rawStatus ?? '').trim().toLowerCase();
  if (status === 'placed') return { dbStatus: 'Confirmed', label: 'Proceed to Confirmed' };
  if (status === 'confirmed') return { dbStatus: 'Processing', label: 'Proceed to Preparing' };
  if (status === 'processing') return { dbStatus: 'Ready', label: 'Proceed to Ready' };
  if (status === 'ready') return { dbStatus: 'Delivered', label: 'Proceed to Completed' };
  return null;
}

function dedupeStatusHistory(entries: OrderStatusHistoryItem[]) {
  return entries.filter((entry, index, allEntries) => {
    const previousEntry = allEntries[index - 1];
    if (!previousEntry) return true;

    if (previousEntry.status !== entry.status) return true;

    const previousTime = Date.parse(previousEntry.changedAt);
    const currentTime = Date.parse(entry.changedAt);
    if (Number.isNaN(previousTime) || Number.isNaN(currentTime)) return true;

    return currentTime - previousTime > STATUS_HISTORY_DUPLICATE_WINDOW_MS;
  });
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

export default function OrderSummary({
  appliedSingleDate,
  appliedRangeStart,
  appliedRangeEnd,
  refreshKey = 0,
}: OrderSummaryProps) {
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
  const [catalogItems, setCatalogItems] = useState<OrderCatalogItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [addItemDraft, setAddItemDraft] = useState<AddOrderItemDraft>(createAddOrderItemDraft);
  const [isSavingAddedItem, setIsSavingAddedItem] = useState(false);
  const [editItemDraft, setEditItemDraft] = useState<EditOrderItemDraft | null>(null);
  const [isSavingEditedItem, setIsSavingEditedItem] = useState(false);

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
  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Map(
          catalogItems
            .filter((item) => item.categoryId && item.categoryName)
            .map((item) => [item.categoryId, item.categoryName] as const),
        ).entries(),
      )
        .map(([id, label]) => ({ id, label }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [catalogItems],
  );
  const filteredCatalogItems = useMemo(() => {
    const query = addItemDraft.searchQuery.trim().toLowerCase();

    return catalogItems.filter((item) => {
      if (addItemDraft.categoryId !== 'all' && item.categoryId !== addItemDraft.categoryId) {
        return false;
      }

      if (!query) return true;

      return [
        item.categoryName,
        item.productName,
        item.productCode,
        item.variationLabel,
        item.priceCode,
        item.priceType,
        item.branchName,
      ].some((value) => String(value ?? '').toLowerCase().includes(query));
    });
  }, [addItemDraft.categoryId, addItemDraft.searchQuery, catalogItems]);
  const selectedCatalogItem = useMemo(
    () =>
      catalogItems.find((item) => item.id === addItemDraft.selectedCatalogItemId) ?? null,
    [addItemDraft.selectedCatalogItemId, catalogItems],
  );
  const selectedUnitOption = useMemo(() => {
    if (!selectedCatalogItem) return null;
    return (
      selectedCatalogItem.unitOptions.find((option) => option.id === addItemDraft.selectedUnitOptionId) ??
      selectedCatalogItem.unitOptions.find((option) => option.isDefault) ??
      selectedCatalogItem.unitOptions[0] ??
      null
    );
  }, [addItemDraft.selectedUnitOptionId, selectedCatalogItem]);
  const visibleCatalogItems = useMemo(
    () => filteredCatalogItems.slice(0, 24),
    [filteredCatalogItems],
  );

  const loadCatalogItems = useCallback(async () => {
    setIsCatalogLoading(true);
    setCatalogError('');

    try {
      const catalogProducts = await loadOrderCatalog();
      setCatalogItems(flattenOrderCatalogForAddItem(catalogProducts));
    } catch (error) {
      setCatalogItems([]);
      setCatalogError(error instanceof Error ? error.message : 'Failed to load active catalog.');
      setIsCatalogLoading(false);
      return;
    }

    setIsCatalogLoading(false);
  }, []);

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

      const orderRows = (data ?? []) as OrderListRow[];
      const unresolvedAgentIds = Array.from(
        new Set(
          orderRows
            .filter((row) => row.agent_id && !row.agent)
            .map((row) => String(row.agent_id)),
        ),
      );

      const fallbackAgentById = new Map<string, JoinedAgentRow>();
      if (unresolvedAgentIds.length > 0) {
        const { data: fallbackAgents, error: fallbackError } = await supabase
          .from('agent_accounts')
          .select('id, full_name, company_name, email')
          .in('id', unresolvedAgentIds);

        if (!fallbackError) {
          ((fallbackAgents ?? []) as JoinedAgentRow[]).forEach((agent) => {
            fallbackAgentById.set(String(agent.id), {
              full_name: String(agent.full_name ?? '').trim() || undefined,
              company_name: String(agent.company_name ?? '').trim() || undefined,
              email: String(agent.email ?? '').trim() || undefined,
            });
          });
        }
      }

      const mapped = orderRows.map((row) => {
        const joinedAgent = Array.isArray(row.agent) ? row.agent[0] ?? null : row.agent;
        const agentRef = joinedAgent ?? fallbackAgentById.get(String(row.agent_id ?? '')) ?? null;
        const termRef = Array.isArray(row.delivery_term) ? row.delivery_term[0] ?? {} : row.delivery_term ?? {};
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
    const timeoutId = window.setTimeout(() => {
      void loadOrders();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [refreshKey]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCurrentPage((prev) => Math.min(prev, totalPages));
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [totalPages]);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCurrentPage(1);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeStatusTab]);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCurrentPage(1);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [appliedRangeEnd, appliedRangeStart, appliedSingleDate]);
  useEffect(() => {
    if (!snackbar) return;
    const timeout = window.setTimeout(() => setSnackbar(null), 2500);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);
  useEffect(() => {
    if (!selectedOrder) {
      const timeoutId = window.setTimeout(() => {
        setIsAddItemOpen(false);
        setAddItemDraft(createAddOrderItemDraft());
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [selectedOrder]);
  useEffect(() => {
    if (!isAddItemOpen || catalogItems.length > 0 || isCatalogLoading) return;
    const timeoutId = window.setTimeout(() => {
      void loadCatalogItems();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [catalogItems.length, isAddItemOpen, isCatalogLoading, loadCatalogItems]);
  useEffect(() => {
    if (!selectedCatalogItem) return;
    if (selectedCatalogItem.unitOptions.length === 0) {
      if (addItemDraft.selectedUnitOptionId) {
        const timeoutId = window.setTimeout(() => {
          setAddItemDraft((current) => ({ ...current, selectedUnitOptionId: '' }));
        }, 0);
        return () => window.clearTimeout(timeoutId);
      }
      return;
    }

    const hasCurrentOption = selectedCatalogItem.unitOptions.some(
      (option) => option.id === addItemDraft.selectedUnitOptionId,
    );

    if (!hasCurrentOption) {
      const fallbackOption =
        selectedCatalogItem.unitOptions.find((option) => option.isDefault) ??
        selectedCatalogItem.unitOptions[0];
      const timeoutId = window.setTimeout(() => {
        setAddItemDraft((current) => ({
          ...current,
          selectedUnitOptionId: fallbackOption?.id ?? '',
          quantity:
            Number(current.quantity || '0') > 0
              ? current.quantity
              : String(fallbackOption?.minOrderQuantity ?? 1),
        }));
      }, 0);
      return () => window.clearTimeout(timeoutId);
    }
  }, [addItemDraft.selectedUnitOptionId, selectedCatalogItem]);

  function closeAddItemModal() {
    setIsAddItemOpen(false);
    setAddItemDraft(createAddOrderItemDraft());
    setCatalogError('');
  }

  function openEditItemModal(item: OrderDetailItem) {
    setEditItemDraft({
      itemId: item.id,
      productName: item.productName,
      variant: item.variant,
      quantity: String(item.quantity || 1),
      freeQuantity: String(item.freeQuantity || 0),
      unitPrice: String(item.unitPrice || 0),
    });
  }

  function closeEditItemModal() {
    setEditItemDraft(null);
  }

  async function refreshOrderTotals(orderId: string) {
    const { data, error } = await supabase
      .from('order_items')
      .select('line_subtotal, discount_amount, surcharge_amount, line_total')
      .eq('order_id', orderId);

    if (error) {
      throw new Error(error.message);
    }

    const totals = ((data ?? []) as OrderTotalsRow[]).reduce(
      (result, row) => ({
        subtotal: result.subtotal + Number(row.line_subtotal ?? 0),
        discountTotal: result.discountTotal + Number(row.discount_amount ?? 0),
        surchargeTotal: result.surchargeTotal + Number(row.surcharge_amount ?? 0),
        grandTotal: result.grandTotal + Number(row.line_total ?? 0),
      }),
      { subtotal: 0, discountTotal: 0, surchargeTotal: 0, grandTotal: 0 },
    );

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        surcharge_total: totals.surchargeTotal,
        grand_total: totals.grandTotal,
      })
      .eq('id', orderId);

    if (updateError) {
      throw new Error(updateError.message);
    }
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

    const items = ((data ?? []) as OrderDetailRow[]).map((item) => ({
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

    const mappedHistory = ((historyRows ?? []) as StatusHistoryRow[]).map((row) => ({
      id: String(row.id),
      status: toDisplayStatus(String(row.status ?? '-')),
      changedAt: String(row.changed_at ?? ''),
    })) satisfies OrderStatusHistoryItem[];

    return dedupeStatusHistory(mappedHistory);
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
      setSnackbar({ type: 'error', message: error.message });
      return;
    }

    try {
      await refreshOrderTotals(selectedOrder.order.id);
      const refreshed = await fetchOrderDetails(selectedOrder.order);
      setSelectedOrder(refreshed);
      await loadOrders();
      setSnackbar({ type: 'success', message: 'Order item removed.' });
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Failed to refresh order after removing item.';
      setLoadError(message);
      setSnackbar({ type: 'error', message });
    }
  }

  async function handleAddOrderItem() {
    if (!selectedOrder || !selectedCatalogItem) return;

    const quantity = Math.max(1, Number(addItemDraft.quantity || '1') || 1);
    const freeQuantity = Math.max(0, Number(addItemDraft.freeQuantity || '0') || 0);
    const unitPrice = selectedUnitOption?.computedPrice ?? selectedCatalogItem.unitPrice;
    const selectedUnitLabel = selectedUnitOption?.unitLabel?.trim() || selectedUnitOption?.unitCode?.trim() || '';
    const variantLabel = selectedUnitLabel
      ? `${selectedCatalogItem.variationLabel} - ${selectedUnitLabel}`
      : selectedCatalogItem.variationLabel;
    setIsSavingAddedItem(true);
    setLoadError('');

    const { error } = await supabase.from('order_items').insert({
      order_id: selectedOrder.order.id,
      product_name: selectedCatalogItem.productName,
      product_code: selectedCatalogItem.productCode || null,
      variant_label: variantLabel || null,
      branch_name: selectedCatalogItem.branchName || selectedOrder.order.branch || null,
      preference_type: selectedCatalogItem.priceType || null,
      price_code: selectedCatalogItem.priceCode || null,
      unit_price: unitPrice,
      quantity,
      discount_amount: 0,
      surcharge_amount: 0,
      free_quantity: freeQuantity,
      sort_order: selectedOrder.items.length,
    });

    if (error) {
      setLoadError(error.message);
      setSnackbar({ type: 'error', message: error.message });
      setIsSavingAddedItem(false);
      return;
    }

    try {
      await refreshOrderTotals(selectedOrder.order.id);
      const refreshed = await fetchOrderDetails(selectedOrder.order);
      setSelectedOrder(refreshed);
      await loadOrders();
      closeAddItemModal();
      setSnackbar({ type: 'success', message: 'Item added to order.' });
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Item added, but totals could not be refreshed.';
      setLoadError(message);
      setSnackbar({ type: 'info', message });
    } finally {
      setIsSavingAddedItem(false);
    }
  }

  async function handleSaveEditedItem() {
    if (!selectedOrder || !editItemDraft) return;

    const quantity = Math.max(1, Number(editItemDraft.quantity || '1') || 1);
    const freeQuantity = Math.max(0, Number(editItemDraft.freeQuantity || '0') || 0);
    const unitPrice = Math.max(0, Number(editItemDraft.unitPrice || '0') || 0);

    setIsSavingEditedItem(true);
    setLoadError('');

    const { error } = await supabase
      .from('order_items')
      .update({
        quantity,
        free_quantity: freeQuantity,
        unit_price: unitPrice,
      })
      .eq('id', editItemDraft.itemId);

    if (error) {
      setLoadError(error.message);
      setSnackbar({ type: 'error', message: error.message });
      setIsSavingEditedItem(false);
      return;
    }

    try {
      await refreshOrderTotals(selectedOrder.order.id);
      const refreshed = await fetchOrderDetails(selectedOrder.order);
      setSelectedOrder(refreshed);
      await loadOrders();
      closeEditItemModal();
      setSnackbar({ type: 'success', message: 'Order item updated.' });
    } catch (refreshError) {
      const message =
        refreshError instanceof Error ? refreshError.message : 'Item updated, but totals could not be refreshed.';
      setLoadError(message);
      setSnackbar({ type: 'info', message });
    } finally {
      setIsSavingEditedItem(false);
    }
  }

  return (
    <section className={styles.wrapper}>
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

      <label className={styles.mobileStatusFilter}>
        <span>Order status</span>
        <select
          value={activeStatusTab}
          onChange={(event) => setActiveStatusTab(event.target.value as OrderStatusTab)}
          aria-label="Filter orders by status"
        >
          {ORDER_STATUS_TABS.map((tab) => <option key={tab} value={tab}>{tab}</option>)}
        </select>
      </label>

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
          <span>Order Status</span>
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
              <span
                className={`${styles.statusBadge} ${
                  getStatusTone(order.rawStatus) === 'success'
                    ? styles.statusBadgeSuccess
                    : getStatusTone(order.rawStatus) === 'danger'
                      ? styles.statusBadgeDanger
                      : getStatusTone(order.rawStatus) === 'warning'
                        ? styles.statusBadgeWarning
                        : styles.statusBadgeNeutral
                }`}
              >
                {order.poStatus}
              </span>
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

      <div className={styles.mobileOrderCards}>
        {isLoading ? (
          Array.from({ length: ROWS_PER_PAGE }).map((_, index) => (
            <article key={`mobile-order-skeleton-${index}`} className={styles.mobileOrderCard}>
              <Skeleton className={styles.mobileSkeletonStatus} height="1.6rem" width="5.5rem" />
              <Skeleton height="1.1rem" width="7rem" />
              <Skeleton height="0.8rem" width="5rem" />
              <div className={styles.mobileCardSkeletonGrid}>
                <Skeleton height="0.8rem" />
                <Skeleton height="0.8rem" />
              </div>
            </article>
          ))
        ) : pagedOrders.length === 0 ? (
          <div className={styles.mobileEmptyState}>{emptyText}</div>
        ) : (
          pagedOrders.map((order) => (
            <article key={`mobile-${order.id}`} className={styles.mobileOrderCard}>
              <span
                className={`${styles.statusBadge} ${styles.mobileCardStatus} ${
                  getStatusTone(order.rawStatus) === 'success'
                    ? styles.statusBadgeSuccess
                    : getStatusTone(order.rawStatus) === 'danger'
                      ? styles.statusBadgeDanger
                      : getStatusTone(order.rawStatus) === 'warning'
                        ? styles.statusBadgeWarning
                        : styles.statusBadgeNeutral
                }`}
              >
                {order.poStatus}
              </span>

              <div className={styles.mobileCardGrid}>
                <div className={styles.mobileCardPrimary}>
                  <h3>{order.orderNo}</h3>
                  <p className={styles.mobilePoNumber}><span>P.O.</span> {order.poNo}</p>
                  <dl className={styles.mobileIdentityList}>
                    <div><dt>Agent</dt><dd>{order.agent}</dd></div>
                    <div><dt>Client</dt><dd>{order.clientName}</dd></div>
                    <div><dt>Branch</dt><dd>{order.branch}</dd></div>
                  </dl>
                </div>

                <div className={styles.mobileCardSchedule}>
                  <div><span>Date</span><strong>{order.date}</strong></div>
                  <div><span>Time</span><strong>{order.time}</strong></div>
                  <div><span>Terms</span><strong>{order.terms}</strong></div>
                </div>
              </div>

              <button
                type="button"
                className={`${styles.actionButton} ${styles.mobileCardAction}`}
                aria-label={`View order ${order.orderNo}`}
                onClick={() => void handleOpenOrder(order)}
              >
                <i className="fa-solid fa-pen-to-square" aria-hidden="true"></i>
              </button>
            </article>
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
              <span className={styles.infoCard}>
                <strong>Status:</strong>{' '}
                <span
                  className={`${styles.statusBadge} ${
                    getStatusTone(selectedOrder.order.rawStatus) === 'success'
                      ? styles.statusBadgeSuccess
                      : getStatusTone(selectedOrder.order.rawStatus) === 'danger'
                        ? styles.statusBadgeDanger
                        : getStatusTone(selectedOrder.order.rawStatus) === 'warning'
                          ? styles.statusBadgeWarning
                          : styles.statusBadgeNeutral
                  }`}
                >
                  {selectedOrder.order.poStatus}
                </span>
              </span>
            </div>
            <div className={styles.modalTable}>
              <div className={styles.modalTableHeader}>
                <span>Product</span><span>Code</span><span>Variant</span><span>Qty</span><span>Free</span><span>Unit Price</span><span>Discount</span><span>Surcharge</span><span>Total</span><span>Action</span>
              </div>
              {selectedOrder.items.length === 0 ? (
                <div className={styles.modalEmpty}>No order items found.</div>
              ) : (
                selectedOrder.items.map((item) => (
                  <div key={item.id} className={styles.modalTableRow}>
                    <span className={styles.productCell}>
                      <span>{item.productName}</span>
                      {item.freeQuantity > 0 ? (
                        <span className={styles.promoBadge}>Free +{item.freeQuantity}</span>
                      ) : null}
                    </span>
                    <span>{item.code}</span>
                    <span>{item.variant}</span>
                    <span>{item.quantity}</span>
                    <span>{item.freeQuantity > 0 ? item.freeQuantity : '-'}</span>
                    <span>{currency.format(item.unitPrice)}</span>
                    <span>{currency.format(item.discountAmount)}</span>
                    <span>{currency.format(item.surchargeAmount)}</span>
                    <span>{currency.format(item.lineTotal)}</span>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.editItemButton}
                        aria-label={`Edit ${item.productName}`}
                        onClick={() => openEditItemModal(item)}
                      >
                        <i className="fa-solid fa-pen" aria-hidden="true"></i>
                      </button>
                      <button
                        type="button"
                        className={styles.removeItemButton}
                        aria-label={`Remove ${item.productName}`}
                        onClick={() => void handleRemoveItem(item.id)}
                      >
                        <i className="fa-solid fa-trash" aria-hidden="true"></i>
                      </button>
                    </div>
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
            <div className={styles.modalFooterActions}>
                <button
                  type="button"
                  className={styles.secondaryModalButton}
                  onClick={() => {
                    setIsAddItemOpen(true);
                    setCatalogError('');
                  }}
                >
                  Add Item
                </button>
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
          </div>
        </div>
      ) : null}

      {selectedOrder && isAddItemOpen ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.addItemModal} role="dialog" aria-modal="true" aria-label="Add item to order">
            <div className={styles.modalHeader}>
              <div>
                <h4 className={styles.modalTitle}>Add Item to Order {selectedOrder.order.orderNo}</h4>
                <p className={styles.confirmText}>
                  Search the active kiosk catalog by category, product, or variation, then add the exact row you need.
                </p>
              </div>
              <button type="button" className={styles.modalClose} onClick={closeAddItemModal} aria-label="Close add item modal">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>

            <div className={styles.addItemFilters}>
              <label className={styles.addItemField}>
                <span>Category</span>
                <select
                  className={styles.addItemInput}
                  value={addItemDraft.categoryId}
                  onChange={(event) =>
                    setAddItemDraft((current) => ({ ...current, categoryId: event.target.value }))
                  }
                >
                  <option value="all">All categories</option>
                  {categoryOptions.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className={styles.addItemField}>
                <span>Search</span>
                <input
                  className={styles.addItemInput}
                  placeholder="Search category, product, SKU, variation, or price code"
                  value={addItemDraft.searchQuery}
                  onChange={(event) =>
                    setAddItemDraft((current) => ({ ...current, searchQuery: event.target.value }))
                  }
                />
              </label>
            </div>

            {catalogError ? <p className={styles.catalogError}>{catalogError}</p> : null}

            <div className={styles.addItemLayout}>
              <div className={styles.catalogList}>
                {isCatalogLoading ? (
                  <p className={styles.catalogHint}>Loading active catalog...</p>
                ) : visibleCatalogItems.length === 0 ? (
                  <p className={styles.catalogHint}>No products matched the current search.</p>
                ) : (
                  visibleCatalogItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.catalogCard} ${
                        addItemDraft.selectedCatalogItemId === item.id ? styles.catalogCardActive : ''
                      }`}
                      onClick={() =>
                        setAddItemDraft((current) => {
                          const fallbackOption =
                            item.unitOptions.find((option) => option.isDefault) ??
                            item.unitOptions[0] ??
                            null;
                          return {
                            ...current,
                            selectedCatalogItemId: item.id,
                            selectedUnitOptionId: fallbackOption?.id ?? '',
                            quantity: String(fallbackOption?.minOrderQuantity ?? 1),
                          };
                        })
                      }
                    >
                      <span className={styles.catalogCardTitle}>{item.productName}</span>
                      <span className={styles.catalogCardMeta}>
                        {item.categoryName} · {item.variationLabel}
                      </span>
                      <span className={styles.catalogCardMeta}>
                        {item.priceCode || 'No price code'} · {currency.format(item.unitPrice)}
                      </span>
                    </button>
                  ))
                )}
                {!isCatalogLoading && filteredCatalogItems.length > visibleCatalogItems.length ? (
                  <p className={styles.catalogHint}>
                    Showing first {visibleCatalogItems.length} matches. Narrow the search to find a specific item faster.
                  </p>
                ) : null}
              </div>

              <div className={styles.addItemDetails}>
                {selectedCatalogItem ? (
                  <>
                    <div className={styles.selectedCatalogCard}>
                      <strong>{selectedCatalogItem.productName}</strong>
                      <span>{selectedCatalogItem.categoryName}</span>
                      <span>
                        {selectedCatalogItem.variationLabel} · {selectedCatalogItem.priceCode || 'No price code'}
                      </span>
                    </div>

                    <div className={styles.addItemGrid}>
                      <label className={styles.addItemField}>
                        <span>Unit Option</span>
                        <select
                          className={styles.addItemInput}
                          value={selectedUnitOption?.id ?? ''}
                          onChange={(event) =>
                            setAddItemDraft((current) => ({
                              ...current,
                              selectedUnitOptionId: event.target.value,
                            }))
                          }
                        >
                          {selectedCatalogItem.unitOptions.length === 0 ? (
                            <option value="">Base price only</option>
                          ) : (
                            selectedCatalogItem.unitOptions.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.unitLabel}
                                {` - ${currency.format(option.computedPrice)}`}
                              </option>
                            ))
                          )}
                        </select>
                      </label>

                      <label className={styles.addItemField}>
                        <span>Quantity</span>
                        <input
                          className={styles.addItemInput}
                          value={addItemDraft.quantity}
                          onChange={(event) =>
                            setAddItemDraft((current) => ({
                              ...current,
                              quantity: event.target.value.replace(/[^\d.]/g, ''),
                            }))
                          }
                        />
                      </label>

                      <label className={styles.addItemField}>
                        <span>Free Qty</span>
                        <input
                          className={styles.addItemInput}
                          value={addItemDraft.freeQuantity}
                          onChange={(event) =>
                            setAddItemDraft((current) => ({
                              ...current,
                              freeQuantity: event.target.value.replace(/[^\d.]/g, ''),
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className={styles.addItemSummary}>
                      <span>
                        Unit price:{' '}
                        <strong>
                          {currency.format(selectedUnitOption?.computedPrice ?? selectedCatalogItem.unitPrice)}
                        </strong>
                      </span>
                      <span>
                        Price type: <strong>{selectedCatalogItem.priceType || '-'}</strong>
                      </span>
                      <span>
                        Free item recognition: <strong>{Number(addItemDraft.freeQuantity || '0') || 0}</strong>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className={styles.catalogHint}>
                    Select a product variation from the catalog to continue.
                  </p>
                )}
              </div>
            </div>

            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancel} onClick={closeAddItemModal} disabled={isSavingAddedItem}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.confirmProceed}
                onClick={() => void handleAddOrderItem()}
                disabled={!selectedCatalogItem || isSavingAddedItem}
              >
                {isSavingAddedItem ? 'Adding...' : 'Add to Order'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedOrder && editItemDraft ? (
        <div className={styles.confirmOverlay} role="presentation">
          <div className={styles.confirmModal} role="dialog" aria-modal="true" aria-label="Edit order item">
            <div className={styles.modalHeader}>
              <div>
                <h4 className={styles.modalTitle}>Edit Order Item</h4>
                <p className={styles.confirmText}>
                  Update the selected row values for {editItemDraft.productName}.
                </p>
              </div>
              <button type="button" className={styles.modalClose} onClick={closeEditItemModal} aria-label="Close edit item modal">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <div className={styles.selectedCatalogCard}>
              <strong>{editItemDraft.productName}</strong>
              <span>{editItemDraft.variant}</span>
            </div>
            <div className={styles.addItemGrid}>
              <label className={styles.addItemField}>
                <span>Quantity</span>
                <input
                  className={styles.addItemInput}
                  value={editItemDraft.quantity}
                  onChange={(event) =>
                    setEditItemDraft((current) =>
                      current
                        ? { ...current, quantity: event.target.value.replace(/[^\d.]/g, '') }
                        : current,
                    )
                  }
                />
              </label>
              <label className={styles.addItemField}>
                <span>Free Qty</span>
                <input
                  className={styles.addItemInput}
                  value={editItemDraft.freeQuantity}
                  onChange={(event) =>
                    setEditItemDraft((current) =>
                      current
                        ? { ...current, freeQuantity: event.target.value.replace(/[^\d.]/g, '') }
                        : current,
                    )
                  }
                />
              </label>
              <label className={styles.addItemField}>
                <span>Unit Price</span>
                <input
                  className={styles.addItemInput}
                  value={editItemDraft.unitPrice}
                  onChange={(event) =>
                    setEditItemDraft((current) =>
                      current
                        ? { ...current, unitPrice: event.target.value.replace(/[^\d.]/g, '') }
                        : current,
                    )
                  }
                />
              </label>
            </div>
            <div className={styles.confirmActions}>
              <button type="button" className={styles.confirmCancel} onClick={closeEditItemModal} disabled={isSavingEditedItem}>
                Cancel
              </button>
              <button type="button" className={styles.confirmProceed} onClick={() => void handleSaveEditedItem()} disabled={isSavingEditedItem}>
                {isSavingEditedItem ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
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
    
