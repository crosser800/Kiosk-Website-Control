import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
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
  agent_id: string | null;
  client_name: string | null;
  order_status: string | null;
  grand_total: number | null;
};

function safeText(value: string | null | undefined) {
  const normalized = String(value ?? '').trim();
  return normalized || '-';
}

function formatNumber(value: number | null) {
  return value === null ? '-' : value.toLocaleString();
}

function formatCurrency(value: number | null) {
  return value === null ? '-' : value.toLocaleString();
}

export default function AgentSummary() {
  const [agents, setAgents] = useState<AgentSummaryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let disposed = false;

    const loadAgentSummary = async () => {
      setIsLoading(true);

      const [{ data: agentRows, error: agentError }, { data: orderRows, error: orderError }] =
        await Promise.all([
          supabase
            .from('agent_accounts')
            .select('id, full_name, company_name, email, address, status')
            .order('created_at', { ascending: false }),
          supabase
            .from('orders')
            .select('agent_id, client_name, order_status, grand_total'),
        ]);

      if (disposed) {
        return;
      }

      if (agentError || orderError) {
        setAgents([]);
        setIsLoading(false);
        return;
      }

      const ordersByAgentId = new Map<string, OrderRow[]>();
      ((orderRows ?? []) as OrderRow[]).forEach((row) => {
        const agentId = String(row.agent_id ?? '').trim();
        if (!agentId) {
          return;
        }
        const current = ordersByAgentId.get(agentId) ?? [];
        current.push(row);
        ordersByAgentId.set(agentId, current);
      });

      const mappedAgents = ((agentRows ?? []) as AgentAccountRow[]).map((agent) => {
        const agentOrders = ordersByAgentId.get(String(agent.id)) ?? [];
        const distinctClients = new Set(
          agentOrders
            .map((row) => safeText(row.client_name))
            .filter((value) => value !== '-'),
        );
        const undelivered = agentOrders.filter((row) => {
          const status = String(row.order_status ?? '').trim().toLowerCase();
          return status && status !== 'completed' && status !== 'cancelled';
        }).length;
        const sales = agentOrders.reduce(
          (total, row) => total + Number(row.grand_total ?? 0),
          0,
        );

        return {
          id: String(agent.id),
          name: safeText(agent.full_name || agent.email),
          location: safeText(agent.company_name || agent.address),
          productSet: '-',
          clients: distinctClients.size > 0 ? distinctClients.size : null,
          undelivered: agentOrders.length > 0 ? undelivered : null,
          sales: agentOrders.length > 0 ? sales : null,
          status: String(agent.status ?? '').toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
        } satisfies AgentSummaryItem;
      });

      setAgents(mappedAgents);
      setIsLoading(false);
    };

    void loadAgentSummary();

    const summaryChannel = supabase
      .channel('dashboard-agent-summary')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_accounts' }, () => {
        void loadAgentSummary();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void loadAgentSummary();
      })
      .subscribe();

    return () => {
      disposed = true;
      void supabase.removeChannel(summaryChannel);
    };
  }, []);

  const visibleAgents = useMemo(() => {
    if (agents.length > 0) {
      return agents;
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
  }, [agents]);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Agent Summary</h2>
          <p className={styles.subtitle}>Live overview of agent profile details and order performance.</p>
        </div>
        <div className={styles.filter}>
          <span>{isLoading ? 'loading...' : 'this month'}</span>
          <i className="fa-solid fa-chevron-down"></i>
        </div>
      </div>

      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Location</th>
            <th className={styles.th}>Product Set</th>
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
            : visibleAgents.map((agent) => (
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

      <div className={styles.footer}>
        <span className={styles.viewAll}>view all</span>
      </div>
    </div>
  );
}
