import { useState } from 'react';
import AdminCount from '../components/account/adminCount';
import AgentsCount from '../components/account/agentsCount';
import AccountsSummary, {
  type AccountSummaryItem,
  type AccountView,
} from '../components/account/AccountsSummary';
import CreateAccount from '../components/account/CreateAccount';
import EditAccount from '../components/account/EditAccount';
import styles from './Accounts.module.css';

export default function Accounts() {
  const [adminCount] = useState(0);
  const [agentsCount] = useState(0);
  const [accounts] = useState<AccountSummaryItem[]>([]);
  const [createAccountType, setCreateAccountType] = useState<AccountView | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountSummaryItem | null>(null);

  return (
    <div className={styles.accounts}>
      <div className={styles.statsRow}>
        <AdminCount adminCount={adminCount} />
        <AgentsCount agentsCount={agentsCount} />
      </div>

      <AccountsSummary
        accounts={accounts}
        onCreateAccount={setCreateAccountType}
        onEditAccount={setEditingAccount}
      />

      {createAccountType && (
        <CreateAccount
          accountType={createAccountType}
          onClose={() => setCreateAccountType(null)}
        />
      )}

      {editingAccount && (
        <EditAccount
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </div>
  );
}
