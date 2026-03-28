import styles from './AgentSummary.module.css';

interface Agent {
  name: string;
  location: string;
  productSet: string;
  clients: number;
  undelivered: number;
  sales: number;
  status: 'Active' | 'Inactive';
}

// placeholder rows — replace with database data later
const agents: Agent[] = [
  { name: '—', location: '—', productSet: '—', clients: 0, undelivered: 0, sales: 0, status: 'Active' },
  { name: '—', location: '—', productSet: '—', clients: 0, undelivered: 0, sales: 0, status: 'Active' },
  { name: '—', location: '—', productSet: '—', clients: 0, undelivered: 0, sales: 0, status: 'Active' },
];

export default function AgentSummary() {
  return (
    <div className={styles.container}>

      {/* Header */}
      <div className={styles.header}>
        <h2 className={styles.title}>Agent Summary</h2>
        <div className={styles.filter}>
          <span>this month</span>
          <i className="fa-solid fa-chevron-down"></i>
        </div>
      </div>

      {/* Table */}
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.th}>Name</th>
            <th className={styles.th}>Location</th>
            <th className={styles.th}>Product Set</th>
            <th className={styles.th}>Clients</th>
            <th className={styles.th}>Undelivered</th>
            <th className={styles.th}>Sales(PHP)</th>
            <th className={styles.th}>Status</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((agent, index) => (
            <tr key={index} className={styles.row}>
              <td className={styles.tdName}>{agent.name}</td>
              <td className={styles.td}>{agent.location}</td>
              <td className={styles.td}>{agent.productSet}</td>
              <td className={styles.td}>{agent.clients}</td>
              <td className={styles.td}>{agent.undelivered}</td>
              <td className={styles.tdSales}>{agent.sales.toLocaleString()}</td>
              <td className={styles.td}>
                <span className={`${styles.badge} ${agent.status === 'Active' ? styles.active : styles.inactive}`}>
                  {agent.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer */}
      <div className={styles.footer}>
        <a href="#" className={styles.viewAll}>view all</a>
      </div>

    </div>
  );
}