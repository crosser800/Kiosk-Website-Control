import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  COMPLETED_RAW_STATUSES,
  getBusinessDateRanges,
  isCompletedAtInRange,
  resolveCompletedAt,
} from '../../services/completedSales';
import styles from './AgentSummary.module.css';

interface AgentSummaryItem {
  id: string;
  name: string;
  location: string;
  productSet: string;
  clients: number | null;
  undelivered: number | null;
  sales: number | null;
  status: 'Active' | 'Inactive';
}

type AgentAccountRow = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  address: string | null;
  status: string | null;
};

type OrderRow = {
  id: string;
  agent_id: string | null;
  order_status: string | null;
  grand_total: number | null;
  created_at: string | null;
  updated_at: string | null;
};

type AgentClientRow = {
  agent_id: string | null;
  status: string | null;
};

type AgentPriceAccessRow = {
  agent_id: string | null;
  price_class: string | null;
};

type StatusHistoryRow = {
  order_id: string | null;
  status: string | null;
  changed_at: string | null;
};

type SummaryPeriod = 'day' | 'week' | 'month' | 'year';
type SummarySort = 'alphabetical' | 'sales';
type SortDirection = 'ascending' | 'descending';

const SUMMARY_PAGE_SIZE = 10;

const summaryPeriodLabels: Record<SummaryPeriod, string> = {
  day: 'Today',
  week: 'This week',
  month: 'This month',
  year: 'This year',
};

function safeText(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
}

function formatNumber(value: number | null) {
  return value === null ? '-' : value.toLocaleString();
}

function formatCurrency(value: number | null) {
  return value === null ? '-' : value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function isCompletedStatus(value: string | null | undefined) {
  return COMPLETED_RAW_STATUSES.some((status) => status.toLowerCase() === String(value ?? '').trim().toLowerCase());
}

function isUndeliveredStatus(value: string | null | undefined) {
  const status = String(value ?? '').trim().toLowerCase();
  return Boolean(status && status !== 'cancelled' && !isCompletedStatus(status));
}

function isCreatedInRange(row: OrderRow, start: Date, end: Date) {
  if (!row.created_at) return false;
  const createdAt = new Date(row.created_at);
  return !Number.isNaN(createdAt.getTime()) && createdAt >= start && createdAt < end;
}

export default function AgentSummary() {
  const [agents, setAgents] = useState<AgentSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState<SummaryPeriod>('month');
  const [sortBy, setSortBy] = useState<SummarySort>('alphabetical');
  const [sortDirection, setSortDirection] = useState<SortDirection>('ascending');
  const [currentPage, setCurrentPage] = useState(1);

  const loadAgentSummary = useCallback(async () => {
      setIsLoading(true);
      const ranges = getBusinessDateRanges();
      const selectedRange = period === 'day'
        ? ranges.today
        : period === 'week'
          ? ranges.currentWeek
          : period === 'year'
            ? ranges.currentYear
            : ranges.currentMonth;

      const [
        { data: agentRows, error: agentError },
        { data: orderRows, error: orderError },
        { data: clientRows, error: clientError },
        { data: priceAccessRows, error: priceAccessError },
      ] =
        await Promise.all([
          supabase
            .from('agent_accounts')
            .select('id, full_name, company_name, email, address, status')
            .order('created_at', { ascending: false }),
          supabase
            .from('orders')
            .select('id, agent_id, order_status, grand_total, created_at, updated_at'),
          supabase
            .from('agent_clients')
            .select('agent_id, status'),
          supabase
            .from('agent_price_access')
            .select('agent_id, price_class'),
        ]);

      if (agentError || orderError || clientError || priceAccessError) {
        console.error('Dashboard: failed to load agent summary', agentError ?? orderError ?? clientError ?? priceAccessError);
        setAgents([]);
        setIsLoading(false);
        return;
      }

      const orders = (orderRows ?? []) as OrderRow[];
      const completedOrders = orders.filter((order) => isCompletedStatus(order.order_status));
      const completedOrderIds = completedOrders.map((order) => order.id);
      let statusHistoryRows: StatusHistoryRow[] = [];
      if (completedOrderIds.length > 0) {
        const { data: historyRows, error: historyError } = await supabase
          .from('order_status_history')
          .select('order_id, status, changed_at')
          .in('order_id', completedOrderIds)
          .in('status', COMPLETED_RAW_STATUSES)
          .order('changed_at', { ascending: true });

        if (historyError) {
          console.error('Dashboard: failed to load agent completed history', historyError);
        } else {
          statusHistoryRows = (historyRows ?? []) as StatusHistoryRow[];
        }
      }

      const completedHistoryByOrderId = new Map<string, string>();
      statusHistoryRows.forEach((row) => {
        const orderId = String(row.order_id ?? '');
        if (!orderId || !row.changed_at || completedHistoryByOrderId.has(orderId)) return;
        completedHistoryByOrderId.set(orderId, row.changed_at);
      });

      const completedOrdersWithDate = completedOrders.map((order) => ({
        ...order,
        completed_at: resolveCompletedAt(order, completedHistoryByOrderId),
      }));

      const ordersByAgentId = new Map<string, OrderRow[]>();
      orders.forEach((row) => {
        const agentId = String(row.agent_id ?? '').trim();
        if (!agentId) {
          return;
        }
        const current = ordersByAgentId.get(agentId) ?? [];
        current.push(row);
        ordersByAgentId.set(agentId, current);
      });

      const completedByAgentId = new Map<string, Array<OrderRow & { completed_at: string | null }>>();
      completedOrdersWithDate.forEach((row) => {
        const agentId = String(row.agent_id ?? '').trim();
        if (!agentId) return;
        completedByAgentId.set(agentId, [...(completedByAgentId.get(agentId) ?? []), row]);
      });

      const activeClientsByAgentId = new Map<string, number>();
      ((clientRows ?? []) as AgentClientRow[]).forEach((row) => {
        const agentId = String(row.agent_id ?? '').trim();
        if (!agentId || String(row.status ?? '').trim().toLowerCase() !== 'active') return;
        activeClientsByAgentId.set(agentId, (activeClientsByAgentId.get(agentId) ?? 0) + 1);
      });

      const priceAccessByAgentId = new Map<string, Set<string>>();
      ((priceAccessRows ?? []) as AgentPriceAccessRow[]).forEach((row) => {
        const agentId = String(row.agent_id ?? '').trim();
        const priceCode = String(row.price_class ?? '').trim().toUpperCase();
        if (!agentId || !priceCode) return;
        const current = priceAccessByAgentId.get(agentId) ?? new Set<string>();
        current.add(priceCode);
        priceAccessByAgentId.set(agentId, current);
      });

      const mappedAgents = ((agentRows ?? []) as AgentAccountRow[]).map((agent) => {
        const agentId = String(agent.id);
        const agentOrders = ordersByAgentId.get(agentId) ?? [];
        const agentCompletedOrders = completedByAgentId.get(agentId) ?? [];
        const priceAccess = Array.from(priceAccessByAgentId.get(agentId) ?? []).sort();
        const undelivered = agentOrders.filter((row) =>
          isCreatedInRange(row, selectedRange.start, selectedRange.end) && isUndeliveredStatus(row.order_status),
        ).length;
        const sales = agentCompletedOrders
          .filter((row) => isCompletedAtInRange(row.completed_at, selectedRange))
          .reduce(
          (total, row) => total + Number(row.grand_total ?? 0),
          0,
        );

        return {
          id: agentId,
          name: safeText(agent.full_name || agent.email),
          location: safeText(agent.company_name || agent.address),
          productSet: priceAccess.length > 0 ? priceAccess.join(', ') : '-',
          clients: activeClientsByAgentId.get(agentId) ?? 0,
          undelivered,
          sales,
          status: String(agent.status ?? '').toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
        } satisfies AgentSummaryItem;
      });

      setAgents(mappedAgents);
      setIsLoading(false);
  }, [period]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadAgentSummary();
    }, 0);

    const summaryChannel = supabase
      .channel('dashboard-agent-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_accounts' }, () => {
        void loadAgentSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void loadAgentSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_clients' }, () => {
        void loadAgentSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_price_access' }, () => {
        void loadAgentSummary();
      })
      .subscribe();

    return () => {
      window.clearTimeout(timeoutId);
      void supabase.removeChannel(summaryChannel);
    };
  }, [loadAgentSummary]);

  useEffect(() => {
    setCurrentPage(1);
  }, [period, sortBy, sortDirection]);

  const sortedAgents = useMemo(() => {
    const multiplier = sortDirection === 'ascending' ? 1 : -1;
    return [...agents].sort((left, right) => {
      if (sortBy === 'sales') {
        const difference = (left.sales ?? 0) - (right.sales ?? 0);
        return difference === 0 ? left.name.localeCompare(right.name) * multiplier : difference * multiplier;
      }
      return left.name.localeCompare(right.name) * multiplier;
    });
  }, [agents, sortBy, sortDirection]);

  const visibleAgents = useMemo(() => {
    if (sortedAgents.length > 0) {
      return sortedAgents;
    }
    return Array.from({ length: 3 }).map((_, index) => ({
      id: `empty-${index}`,
      name: '-',
      location: '-',
      productSet: '-',
      clients: null,
      undelivered: null,
      sales: null,
      status: 'Inactive' as const,
    }));
  }, [sortedAgents]);

  const totalPages = Math.max(1, Math.ceil(visibleAgents.length / SUMMARY_PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const pagedAgents = useMemo(
    () => visibleAgents.slice((safeCurrentPage - 1) * SUMMARY_PAGE_SIZE, safeCurrentPage * SUMMARY_PAGE_SIZE),
    [safeCurrentPage, visibleAgents],
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Agent Summary</h2>
          <p className={styles.subtitle}>Live overview of agent profile details and order performance.</p>
        </div>
        <div className={styles.filters}>
          <label className={styles.filter}>
            <span className={styles.srOnly}>Sales period</span>
            <i className="fa-solid fa-calendar-days" aria-hidden="true"></i>
            <select value={period} onChange={(event) => setPeriod(event.target.value as SummaryPeriod)} disabled={isLoading}>
              {Object.entries(summaryPeriodLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.filter}>
            <span className={styles.srOnly}>Sort agents by</span>
            <i className="fa-solid fa-filter" aria-hidden="true"></i>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SummarySort)}>
              <option value="alphabetical">Alphabetical</option>
              <option value="sales">Sales</option>
            </select>
          </label>
          <label className={styles.filter}>
            <span className={styles.srOnly}>Sort direction</span>
            <i className="fa-solid fa-arrow-down-a-z" aria-hidden="true"></i>
            <select value={sortDirection} onChange={(event) => setSortDirection(event.target.value as SortDirection)}>
              <option value="ascending">Ascending</option>
              <option value="descending">Descending</option>
            </select>
          </label>
        </div>
      </div>

      <table className={`${styles.table} ${styles.desktopTable}`}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Location</th>
            <th className={styles.th}>Price Access</th>
            <th className={styles.th}>Clients</th>
            <th className={styles.th}>Undelivered</th>
            <th className={styles.th}>Sales(PHP)</th>
            <th className={styles.thStatus}>Status</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => (
                <tr key={`agent-skeleton-${index}`} className={styles.row}>
                  <td className={styles.tdName}><div className={`${styles.skeletonBlock} ${styles.skeletonLineLong}`}></div></td>
                  <td className={styles.td}><div className={`${styles.skeletonBlock} ${styles.skeletonLine}`}></div></td>
                  <td className={styles.td}><div className={`${styles.skeletonBlock} ${styles.skeletonLine}`}></div></td>
                  <td className={styles.td}><div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`}></div></td>
                  <td className={styles.td}><div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`}></div></td>
                  <td className={styles.tdSales}><div className={`${styles.skeletonBlock} ${styles.skeletonLine}`}></div></td>
                  <td className={styles.tdStatus}><div className={`${styles.skeletonBlock} ${styles.skeletonBadge}`}></div></td>
                </tr>
              ))
            : pagedAgents.map((agent) => (
                <tr key={agent.id} className={styles.row}>
                  <td className={styles.tdName}>{agent.name}</td>
                  <td className={styles.td}>{agent.location}</td>
                  <td className={styles.td}>{agent.productSet}</td>
                  <td className={styles.td}>{formatNumber(agent.clients)}</td>
                  <td className={styles.td}>{formatNumber(agent.undelivered)}</td>
                  <td className={styles.tdSales}>{formatCurrency(agent.sales)}</td>
                  <td className={styles.tdStatus}>
                    {agent.name === '-' ? (
                      <span className={styles.emptyBadge}>-</span>
                    ) : (
                      <span className={`${styles.badge} ${agent.status === 'Active' ? styles.active : styles.inactive}`}>
                        {agent.status}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
        </tbody>
      </table>

      <div className={styles.mobileCards}>
        {isLoading
          ? Array.from({ length: 3 }).map((_, index) => (
              <article key={`agent-card-skeleton-${index}`} className={styles.agentCard}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonBadge}`}></div>
                <div className={styles.cardGrid}>
                  <div className={styles.cardIdentity}>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLineLong}`}></div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`}></div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`}></div>
                  </div>
                  <div className={styles.cardMetrics}>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`}></div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLineShort}`}></div>
                    <div className={`${styles.skeletonBlock} ${styles.skeletonLine}`}></div>
                  </div>
                </div>
              </article>
            ))
          : pagedAgents.map((agent) => (
              <article key={`agent-card-${agent.id}`} className={styles.agentCard}>
                <div className={styles.cardStatus}>
                  {agent.name === '-' ? (
                    <span className={styles.emptyBadge}>-</span>
                  ) : (
                    <span className={`${styles.badge} ${agent.status === 'Active' ? styles.active : styles.inactive}`}>
                      {agent.status}
                    </span>
                  )}
                </div>
                <div className={styles.cardGrid}>
                  <div className={styles.cardIdentity}>
                    <h3>{agent.name}</h3>
                    <div className={styles.cardDetail}>
                      <span>Location</span>
                      <strong>{agent.location}</strong>
                    </div>
                    <div className={styles.cardDetail}>
                      <span>Price Access</span>
                      <strong>{agent.productSet}</strong>
                    </div>
                  </div>
                  <div className={styles.cardMetrics}>
                    <div><span>Clients</span><strong>{formatNumber(agent.clients)}</strong></div>
                    <div><span>Undelivered</span><strong>{formatNumber(agent.undelivered)}</strong></div>
                    <div><span>Sales (PHP)</span><strong>{formatCurrency(agent.sales)}</strong></div>
                  </div>
                </div>
              </article>
            ))}
      </div>

      <div className={styles.footer}>
        <span className={styles.viewAll}>
          Showing {(safeCurrentPage - 1) * SUMMARY_PAGE_SIZE + 1}-{Math.min(safeCurrentPage * SUMMARY_PAGE_SIZE, visibleAgents.length)} of {visibleAgents.length}
        </span>
        <div className={styles.pagination} aria-label="Agent summary pages">
          <button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safeCurrentPage === 1} aria-label="Previous page">
            <i className="fa-solid fa-chevron-left" aria-hidden="true"></i>
          </button>
          <button type="button" className={styles.currentPage} onClick={() => setCurrentPage(safeCurrentPage)} aria-current="page">
            {safeCurrentPage}
          </button>
          <input
            type="number"
            min={1}
            max={totalPages}
            value={safeCurrentPage}
            onChange={(event) => {
              const nextPage = Number.parseInt(event.target.value, 10);
              if (Number.isFinite(nextPage)) setCurrentPage(Math.min(totalPages, Math.max(1, nextPage)));
            }}
            aria-label={`Go to page, out of ${totalPages}`}
          />
          <button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safeCurrentPage === totalPages} aria-label="Next page">
            <i className="fa-solid fa-chevron-right" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
