import { useCallback, useEffect, useMemo, useState } from 'react';
import DailySales from '../components/sales/DailySales';
import MonthlySales from '../components/sales/MonthlySales';
import OrdersSales from '../components/sales/OrdersSales';
import SalesMap from '../components/sales/SalesMap';
import YearlySales from '../components/sales/YearlySales';
import YtdSales from '../components/sales/YtdSales';
import { supabase } from '../lib/supabase';
import {
  BUSINESS_TIME_ZONE,
  COMPLETED_RAW_STATUSES,
  ORDER_STATUS_FIELD,
  getCompletedSalesRanges,
  isCompletedAtInRange,
  parseCompletedAt,
  resolveCompletedAt,
} from '../services/completedSales';
import styles from './Sales.module.css';

type PeriodKey = 'daily' | 'monthly' | 'yearly' | 'ytd';

type SalesOrderRow = {
  id: string;
  order_number: string | null;
  client_name: string | null;
  branch_name: string | null;
  order_date: string | null;
  completed_at: string | null;
  order_status: string | null;
  subtotal: number | null;
  discount_total: number | null;
  grand_total: number | null;
  created_at: string | null;
  updated_at: string | null;
  agent_id: string | null;
  agent: {
    id: string | null;
    full_name: string | null;
    company_name: string | null;
    email: string | null;
  } | null;
};

type RawSalesOrderRow = Omit<SalesOrderRow, 'agent' | 'completed_at'> & {
  agent:
    | {
        id: string | null;
        full_name: string | null;
        company_name: string | null;
        email: string | null;
      }[]
    | {
        id: string | null;
        full_name: string | null;
        company_name: string | null;
        email: string | null;
      }
    | null;
};

type SalesOrderItemRow = {
  id: string;
  order_id: string | null;
  product_name: string | null;
  quantity: number | null;
  free_quantity: number | null;
  discount_amount: number | null;
  line_subtotal: number | null;
};

type StatusHistoryRow = {
  order_id: string | null;
  status: string | null;
  changed_at: string | null;
};

type SalesTotals = {
  grossSales: number;
  totalDiscount: number;
  totalItemAmount: number;
  orderCount: number;
};

type AgentItemBreakdown = {
  id: string;
  productName: string;
  quantity: number;
  freeQuantity: number;
  subtotal: number;
  discountAmount: number;
};

type AgentOrderBreakdown = {
  id: string;
  orderNumber: string;
  clientName: string;
  branchName: string;
  orderDate: string;
  grossSales: number;
  totalDiscount: number;
  totalItemAmount: number;
};

type AgentSalesBreakdown = {
  id: string;
  agentName: string;
  agentCompany: string;
  grossSales: number;
  totalDiscount: number;
  totalItemAmount: number;
  orderCount: number;
  orders: AgentOrderBreakdown[];
  items: AgentItemBreakdown[];
};

type PeriodBreakdown = {
  totals: SalesTotals;
  agents: AgentSalesBreakdown[];
};

type SalesSnapshot = {
  daily: SalesTotals;
  yesterday: SalesTotals;
  monthly: SalesTotals;
  lastMonth: SalesTotals;
  yearly: SalesTotals;
  previousYear: SalesTotals;
  ytd: SalesTotals;
  lastYearYtd: SalesTotals;
};

function createEmptyTotals(): SalesTotals {
  return {
    grossSales: 0,
    totalDiscount: 0,
    totalItemAmount: 0,
    orderCount: 0,
  };
}

function createEmptyBreakdown(): PeriodBreakdown {
  return {
    totals: createEmptyTotals(),
    agents: [],
  };
}

function createEmptySnapshot(): SalesSnapshot {
  return {
    daily: createEmptyTotals(),
    yesterday: createEmptyTotals(),
    monthly: createEmptyTotals(),
    lastMonth: createEmptyTotals(),
    yearly: createEmptyTotals(),
    previousYear: createEmptyTotals(),
    ytd: createEmptyTotals(),
    lastYearYtd: createEmptyTotals(),
  };
}

function createEmptyBreakdowns(): Record<PeriodKey, PeriodBreakdown> {
  return {
    daily: createEmptyBreakdown(),
    monthly: createEmptyBreakdown(),
    yearly: createEmptyBreakdown(),
    ytd: createEmptyBreakdown(),
  };
}

function parseOrderDate(orderDate: string | null) {
  return parseCompletedAt(orderDate);
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatOrderDate(value: string | null) {
  const parsed = parseOrderDate(value);
  return parsed ? parsed.toLocaleDateString('en-PH', { timeZone: BUSINESS_TIME_ZONE }) : '-';
}

function sumTotals(rows: SalesOrderRow[]) {
  return rows.reduce(
    (totals, row) => ({
      grossSales: totals.grossSales + Number(row.grand_total ?? 0),
      totalDiscount: totals.totalDiscount + Number(row.discount_total ?? 0),
      totalItemAmount: totals.totalItemAmount + Number(row.subtotal ?? 0),
      orderCount: totals.orderCount + 1,
    }),
    createEmptyTotals(),
  );
}

function resolveAgentName(order: SalesOrderRow) {
  return (
    String(
      order.agent?.full_name ??
      order.agent?.company_name ??
      order.agent?.email ??
      order.agent_id ??
      'Unassigned Agent',
    ).trim() || 'Unassigned Agent'
  );
}

function resolveAgentCompany(order: SalesOrderRow) {
  return String(order.agent?.company_name ?? '').trim() || 'No company';
}

function buildPeriodBreakdown(rows: SalesOrderRow[], allItems: SalesOrderItemRow[]) {
  const totals = sumTotals(rows);
  const itemsByOrderId = new Map<string, SalesOrderItemRow[]>();
  allItems.forEach((item) => {
    const orderId = String(item.order_id ?? '');
    if (!orderId) return;
    const current = itemsByOrderId.get(orderId) ?? [];
    current.push(item);
    itemsByOrderId.set(orderId, current);
  });

  const agentsMap = new Map<string, AgentSalesBreakdown>();

  rows.forEach((order) => {
    const agentId = String(order.agent_id ?? '').trim() || `unassigned-${resolveAgentName(order)}`;
    const current = agentsMap.get(agentId) ?? {
      id: agentId,
      agentName: resolveAgentName(order),
      agentCompany: resolveAgentCompany(order),
      grossSales: 0,
      totalDiscount: 0,
      totalItemAmount: 0,
      orderCount: 0,
      orders: [],
      items: [],
    };

    current.grossSales += Number(order.grand_total ?? 0);
    current.totalDiscount += Number(order.discount_total ?? 0);
    current.totalItemAmount += Number(order.subtotal ?? 0);
    current.orderCount += 1;
    current.orders.push({
      id: String(order.id),
      orderNumber: String(order.order_number ?? '-'),
      clientName: String(order.client_name ?? '-'),
      branchName: String(order.branch_name ?? '-'),
      orderDate: formatOrderDate(order.completed_at),
      grossSales: Number(order.grand_total ?? 0),
      totalDiscount: Number(order.discount_total ?? 0),
      totalItemAmount: Number(order.subtotal ?? 0),
    });

    const orderItems = itemsByOrderId.get(String(order.id)) ?? [];
    const itemMap = new Map(current.items.map((item) => [item.productName, item] as const));
    orderItems.forEach((item) => {
      const productName = String(item.product_name ?? 'Unnamed Product');
      const existing = itemMap.get(productName) ?? {
        id: `${agentId}-${productName}`,
        productName,
        quantity: 0,
        freeQuantity: 0,
        subtotal: 0,
        discountAmount: 0,
      };

      existing.quantity += Number(item.quantity ?? 0);
      existing.freeQuantity += Number(item.free_quantity ?? 0);
      existing.subtotal += Number(item.line_subtotal ?? 0);
      existing.discountAmount += Number(item.discount_amount ?? 0);
      itemMap.set(productName, existing);
    });

    current.items = Array.from(itemMap.values()).sort((left, right) => right.subtotal - left.subtotal);
    agentsMap.set(agentId, current);
  });

  const agents = Array.from(agentsMap.values())
    .map((agent) => ({
      ...agent,
      orders: [...agent.orders].sort((left, right) => right.grossSales - left.grossSales),
      items: [...agent.items].sort((left, right) => right.subtotal - left.subtotal),
    }))
    .sort((left, right) => right.grossSales - left.grossSales);

  return {
    totals,
    agents,
  } satisfies PeriodBreakdown;
}

const periodTitles: Record<PeriodKey, string> = {
  daily: 'Daily Sales',
  monthly: 'Monthly Sales',
  yearly: 'Yearly Sales',
  ytd: 'YTD Sales',
};

const periodSubtitles: Record<PeriodKey, string> = {
  daily: "Select an agent to see today's sales details.",
  monthly: "Select an agent to see this month's sales details.",
  yearly: "Select an agent to see this year's sales details.",
  ytd: 'Select an agent to see year-to-date sales content.',
};

export default function Sales() {
  const [salesSnapshot, setSalesSnapshot] = useState<SalesSnapshot>(createEmptySnapshot);
  const [periodBreakdowns, setPeriodBreakdowns] =
    useState<Record<PeriodKey, PeriodBreakdown>>(createEmptyBreakdowns);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [activeModal, setActiveModal] = useState<PeriodKey | null>(null);
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  const loadSalesSnapshot = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');

    const { data, error } = await supabase
      .from('orders')
      .select(`
        id,
        order_number,
        client_name,
        branch_name,
        order_date,
        order_status,
        subtotal,
        discount_total,
        grand_total,
        created_at,
        updated_at,
        agent_id,
        agent:agent_accounts!orders_agent_id_fkey(id, full_name, company_name, email)
      `)
      .in(ORDER_STATUS_FIELD, COMPLETED_RAW_STATUSES);

    if (error) {
      setSalesSnapshot(createEmptySnapshot());
      setPeriodBreakdowns(createEmptyBreakdowns());
      setLoadError(error.message);
      setIsLoading(false);
      return;
    }

    const rawCompletedOrders = ((data ?? []) as RawSalesOrderRow[]).map((row) => ({
      ...row,
      id: String(row.id),
      agent_id: row.agent_id ? String(row.agent_id) : null,
      agent: Array.isArray(row.agent) ? row.agent[0] ?? null : row.agent,
    }));

    const orderIds = rawCompletedOrders.map((row) => row.id);
    let orderItems: SalesOrderItemRow[] = [];
    let statusHistoryRows: StatusHistoryRow[] = [];

    if (orderIds.length > 0) {
      const [itemsResult, historyResult] = await Promise.all([
        supabase
          .from('order_items')
          .select('id, order_id, product_name, quantity, free_quantity, discount_amount, line_subtotal')
          .in('order_id', orderIds),
        supabase
          .from('order_status_history')
          .select('order_id, status, changed_at')
          .in('order_id', orderIds)
          .in('status', COMPLETED_RAW_STATUSES)
          .order('changed_at', { ascending: true }),
      ]);

      if (itemsResult.error || historyResult.error) {
        setSalesSnapshot(createEmptySnapshot());
        setPeriodBreakdowns(createEmptyBreakdowns());
        setLoadError(itemsResult.error?.message ?? historyResult.error?.message ?? 'Sales records could not be loaded.');
        setIsLoading(false);
        return;
      }

      orderItems = (itemsResult.data ?? []) as SalesOrderItemRow[];
      statusHistoryRows = (historyResult.data ?? []) as StatusHistoryRow[];
    }

    const completedHistoryByOrderId = new Map<string, string>();
    statusHistoryRows.forEach((row) => {
      const orderId = String(row.order_id ?? '');
      if (!orderId || !row.changed_at || completedHistoryByOrderId.has(orderId)) return;
      completedHistoryByOrderId.set(orderId, row.changed_at);
    });

    const completedOrders = rawCompletedOrders
      .map((row) => ({
        ...row,
        completed_at: resolveCompletedAt(row, completedHistoryByOrderId),
      }));

    const ranges = getCompletedSalesRanges();

    const dailyRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.daily),
    );
    const yesterdayRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.yesterday),
    );
    const monthlyRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.monthly),
    );
    const lastMonthRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.lastMonth),
    );
    const yearlyRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.yearly),
    );
    const previousYearRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.previousYear),
    );
    const ytdRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.ytd),
    );
    const lastYearYtdRows = completedOrders.filter((row) =>
      isCompletedAtInRange(row.completed_at, ranges.lastYearYtd),
    );

    const nextSnapshot = {
      daily: sumTotals(dailyRows),
      yesterday: sumTotals(yesterdayRows),
      monthly: sumTotals(monthlyRows),
      lastMonth: sumTotals(lastMonthRows),
      yearly: sumTotals(yearlyRows),
      previousYear: sumTotals(previousYearRows),
      ytd: sumTotals(ytdRows),
      lastYearYtd: sumTotals(lastYearYtdRows),
    } satisfies SalesSnapshot;

    if (
      import.meta.env.DEV &&
      (
        nextSnapshot.daily.grossSales > nextSnapshot.monthly.grossSales ||
        nextSnapshot.monthly.grossSales > nextSnapshot.yearly.grossSales ||
        nextSnapshot.ytd.grossSales > nextSnapshot.yearly.grossSales ||
        (nextSnapshot.daily.grossSales > 0 && nextSnapshot.monthly.grossSales === 0)
      )
    ) {
      console.warn('[sales] completed sales period invariant failed', {
        timeZone: BUSINESS_TIME_ZONE,
        ranges,
        daily: nextSnapshot.daily.grossSales,
        monthly: nextSnapshot.monthly.grossSales,
        yearly: nextSnapshot.yearly.grossSales,
        ytd: nextSnapshot.ytd.grossSales,
      });
    }

    setSalesSnapshot(nextSnapshot);

    setPeriodBreakdowns({
      daily: buildPeriodBreakdown(dailyRows, orderItems),
      monthly: buildPeriodBreakdown(monthlyRows, orderItems),
      yearly: buildPeriodBreakdown(yearlyRows, orderItems),
      ytd: buildPeriodBreakdown(ytdRows, orderItems),
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadSalesSnapshot();
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadSalesSnapshot]);

  const summaryText = useMemo(() => {
    if (isLoading) return 'Loading completed sales...';
    if (loadError) return `Could not load sales totals: ${loadError}`;
    if (salesSnapshot.daily.orderCount === 0) return 'No completed sales recorded for today yet.';
    return `${salesSnapshot.daily.orderCount.toLocaleString()} completed orders recorded today.`;
  }, [isLoading, loadError, salesSnapshot.daily.orderCount]);

  const activeBreakdown = activeModal ? periodBreakdowns[activeModal] : null;
  const selectedAgent =
    activeBreakdown?.agents.find((agent) => agent.id === activeAgentId) ?? activeBreakdown?.agents[0] ?? null;

  function openPeriodModal(period: PeriodKey) {
    setActiveModal(period);
    setActiveAgentId(periodBreakdowns[period].agents[0]?.id ?? null);
  }

  return (
    <div className={styles.sales}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Sales workspace</p>
          <h1 className={styles.title}>Sales</h1>
          <p className={styles.subtitle}>
            Completed order sales report
          </p>
          <p className={styles.helperText}>{summaryText}</p>
        </div>
      </section>

      <div className={styles.statsRow}>
        <DailySales
          amount={salesSnapshot.daily.grossSales}
          yesterday={salesSnapshot.yesterday.grossSales}
          onClick={() => openPeriodModal('daily')}
          disabled={isLoading}
        />
        <MonthlySales
          amount={salesSnapshot.monthly.grossSales}
          lastMonth={salesSnapshot.lastMonth.grossSales}
          onClick={() => openPeriodModal('monthly')}
          disabled={isLoading}
        />
        <YearlySales
          amount={salesSnapshot.yearly.grossSales}
          lastYear={salesSnapshot.previousYear.grossSales}
          onClick={() => openPeriodModal('yearly')}
          disabled={isLoading}
        />
        <YtdSales
          amount={salesSnapshot.ytd.grossSales}
          lastYear={salesSnapshot.lastYearYtd.grossSales}
          onClick={() => openPeriodModal('ytd')}
          disabled={isLoading}
        />
      </div>

      <SalesMap />

      <OrdersSales />

      {activeModal && activeBreakdown ? (
        <div className={styles.modalOverlay} role="presentation">
          <div
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-label={`${periodTitles[activeModal]} breakdown`}
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.modalEyebrow}>{periodTitles[activeModal]}</p>
                <h2 className={styles.modalTitle}>{periodTitles[activeModal]} By Agent</h2>
                <p className={styles.modalSubtitle}>{periodSubtitles[activeModal]}</p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => {
                  setActiveModal(null);
                  setActiveAgentId(null);
                }}
                aria-label="Close sales modal"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>

            <div className={styles.summaryGrid}>
              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Gross Sales</p>
                <h3 className={styles.summaryValue}>P{formatCurrency(activeBreakdown.totals.grossSales)}</h3>
                <p className={styles.summaryNote}>Total grand total for completed orders in this period.</p>
              </article>

              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Total Discount</p>
                <h3 className={styles.summaryValue}>P{formatCurrency(activeBreakdown.totals.totalDiscount)}</h3>
                <p className={styles.summaryNote}>Shown separately and grouped under each agent.</p>
              </article>

              <article className={styles.summaryCard}>
                <p className={styles.summaryLabel}>Total Item Amount</p>
                <h3 className={styles.summaryValue}>P{formatCurrency(activeBreakdown.totals.totalItemAmount)}</h3>
                <p className={styles.summaryNote}>Sum of item subtotal before discount deductions.</p>
              </article>
            </div>

            <div className={styles.modalMetaRow}>
              <span className={styles.metaPill}>
                {activeBreakdown.agents.length.toLocaleString()} agents with completed sales
              </span>
              {loadError ? <span className={styles.metaWarning}>{loadError}</span> : null}
            </div>

            <div className={styles.agentSection}>
              <div className={styles.agentListBlock}>
                <div className={styles.breakdownHeader}>
                  <h3 className={styles.breakdownTitle}>Agents</h3>
                  <span className={styles.breakdownCount}>
                    {activeBreakdown.agents.length.toLocaleString()} agents
                  </span>
                </div>

                {activeBreakdown.agents.length === 0 ? (
                  <p className={styles.emptyBreakdown}>No agents recorded in this period.</p>
                ) : (
                  <div className={styles.agentList}>
                    {activeBreakdown.agents.map((agent) => (
                      <button
                        key={agent.id}
                        type="button"
                        className={`${styles.agentButton} ${
                          selectedAgent?.id === agent.id ? styles.agentButtonActive : ''
                        }`}
                        onClick={() => setActiveAgentId(agent.id)}
                      >
                        <div>
                          <p className={styles.breakdownName}>{agent.agentName}</p>
                          <p className={styles.breakdownMeta}>{agent.agentCompany}</p>
                          <p className={styles.breakdownMeta}>
                            {agent.orderCount.toLocaleString()} orders
                          </p>
                        </div>
                        <strong className={styles.breakdownAmount}>
                          P{formatCurrency(agent.grossSales)}
                        </strong>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.agentDetailsBlock}>
                {selectedAgent ? (
                  <>
                    <div className={styles.selectedAgentHero}>
                      <div>
                        <h3 className={styles.selectedAgentTitle}>{selectedAgent.agentName}</h3>
                        <p className={styles.selectedAgentMeta}>{selectedAgent.agentCompany}</p>
                      </div>
                      <div className={styles.selectedAgentTotals}>
                        <span>P{formatCurrency(selectedAgent.grossSales)} gross</span>
                        <span>P{formatCurrency(selectedAgent.totalDiscount)} discount</span>
                        <span>P{formatCurrency(selectedAgent.totalItemAmount)} item amount</span>
                      </div>
                    </div>

                    <div className={styles.breakdownSection}>
                      <div className={styles.breakdownBlock}>
                        <div className={styles.breakdownHeader}>
                          <h3 className={styles.breakdownTitle}>Orders</h3>
                          <span className={styles.breakdownCount}>
                            {selectedAgent.orders.length.toLocaleString()} orders
                          </span>
                        </div>

                        <div className={styles.breakdownList}>
                          {selectedAgent.orders.map((order) => (
                            <article key={order.id} className={styles.breakdownRow}>
                              <div>
                                <p className={styles.breakdownName}>{order.orderNumber}</p>
                                <p className={styles.breakdownMeta}>
                                  {order.clientName} | {order.branchName}
                                </p>
                                <p className={styles.breakdownMeta}>
                                  {order.orderDate} | Discount: P{formatCurrency(order.totalDiscount)}
                                </p>
                              </div>
                              <strong className={styles.breakdownAmount}>
                                P{formatCurrency(order.grossSales)}
                              </strong>
                            </article>
                          ))}
                        </div>
                      </div>

                      <div className={styles.breakdownBlock}>
                        <div className={styles.breakdownHeader}>
                          <h3 className={styles.breakdownTitle}>Sales Content</h3>
                          <span className={styles.breakdownCount}>
                            {selectedAgent.items.length.toLocaleString()} products
                          </span>
                        </div>

                        <div className={styles.breakdownList}>
                          {selectedAgent.items.map((item) => (
                            <article key={item.id} className={styles.breakdownRow}>
                              <div>
                                <p className={styles.breakdownName}>{item.productName}</p>
                                <p className={styles.breakdownMeta}>
                                  Qty: {item.quantity.toLocaleString()} | Free: {item.freeQuantity.toLocaleString()}
                                </p>
                                <p className={styles.breakdownMeta}>
                                  Discount: P{formatCurrency(item.discountAmount)}
                                </p>
                              </div>
                              <strong className={styles.breakdownAmount}>
                                P{formatCurrency(item.subtotal)}
                              </strong>
                            </article>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className={styles.emptyBreakdown}>Select an agent to view their sales content.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
