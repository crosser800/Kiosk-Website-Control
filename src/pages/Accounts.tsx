import { useEffect, useMemo, useState } from 'react';
import AdminCount from '../components/account/adminCount';
import AgentsCount from '../components/account/agentsCount';
import AccountsSummary, {
  type AccountSummaryItem,
  type AccountView,
} from '../components/account/AccountsSummary';
import CreateAccount from '../components/account/CreateAccount';
import EditAccount from '../components/account/EditAccount';
import { getAccountItems, subscribeAccountItems } from '../services/accounts';
import styles from './Accounts.module.css';

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountSummaryItem[]>(() => getAccountItems());
  const [createAccountType, setCreateAccountType] = useState<AccountView | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountSummaryItem | null>(null);
  const adminCount = useMemo(
    () => accounts.filter((account) => account.role === 'admins').length,
    [accounts],
  );
  const agentsCount = useMemo(
    () => accounts.filter((account) => account.role === 'agents').length,
    [accounts],
  );

  useEffect(() => subscribeAccountItems(setAccounts), []);

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
          onCreate={(nextAccounts) => {
            setAccounts(nextAccounts);
            setCreateAccountType(null);
          }}
          onClose={() => setCreateAccountType(null)}
        />
      )}

      {editingAccount && (
        <EditAccount
          account={editingAccount}
          onSave={(nextAccounts) => {
            setAccounts(nextAccounts);
            setEditingAccount(null);
          }}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </div>
  );
}
