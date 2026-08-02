import { useEffect, useMemo, useState } from 'react';
import AdminCount from '../components/account/adminCount';
import AgentsCount from '../components/account/agentsCount';
import AccountsSummary, {
  type AccountSummaryItem,
  type AccountView,
} from '../components/account/AccountsSummary';
import CreateAccount from '../components/account/CreateAccount';
import EditAccount from '../components/account/EditAccount';
import { getAccountItems, loadAccountItems, subscribeAccountItems } from '../services/accounts';
import styles from './Accounts.module.css';

function getAccountsLoadMessage(error: Error) {
  const message = error.message.toLowerCase();
  const isMissingSystemOwnerColumn =
    message.includes('is_system_owner') &&
    (message.includes('does not exist') || message.includes('schema cache'));

  if (isMissingSystemOwnerColumn) {
    return 'The Admin Accounts database migration has not been applied yet.';
  }

  if (import.meta.env.DEV) {
    return error.message;
  }

  return 'Unable to load accounts right now. Please try again.';
}

export default function Accounts() {
  const [accounts, setAccounts] = useState<AccountSummaryItem[]>(() => getAccountItems());
  const [createAccountType, setCreateAccountType] = useState<AccountView | null>(null);
  const [editingAccount, setEditingAccount] = useState<AccountSummaryItem | null>(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const adminCount = useMemo(
    () => accounts.filter((account) => account.role === 'admins').length,
    [accounts],
  );
  const agentsCount = useMemo(
    () => accounts.filter((account) => account.role === 'agents').length,
    [accounts],
  );

  useEffect(
    () =>
      subscribeAccountItems(
        (nextAccounts) => {
          setAccounts(nextAccounts);
          setIsLoadingAccounts(false);
          setLoadError('');
        },
        (error) => {
          console.error('Accounts load failed', error);
          setIsLoadingAccounts(false);
          setLoadError(getAccountsLoadMessage(error));
        },
      ),
    [],
  );
  function handleRetryLoad() {
    setIsLoadingAccounts(true);
    setLoadError('');
    void loadAccountItems()
      .then((nextAccounts) => {
        setAccounts(nextAccounts);
      })
      .catch((error) => {
        const nextError = error instanceof Error ? error : new Error('Unable to load accounts.');
        console.error('Accounts retry failed', nextError);
        setLoadError(getAccountsLoadMessage(nextError));
      })
      .finally(() => setIsLoadingAccounts(false));
  }

  function handleAccountsSaved(nextAccounts: AccountSummaryItem[], message: string) {
    setAccounts(nextAccounts);
    setCreateAccountType(null);
    setEditingAccount(null);
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 3200);
  }

  return (
    <div className={styles.accounts}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Team workspace</p>
          <h1 className={styles.title}>Accounts</h1>
          <p className={styles.subtitle}>
            Manage admins and agents in a cleaner workspace with quick visibility on team size.
          </p>
        </div>
      </section>

      <div className={styles.statsRow}>
        <AdminCount adminCount={adminCount} />
        <AgentsCount agentsCount={agentsCount} />
      </div>

      {loadError ? (
        <div className={styles.loadNotice} role="alert">
          <div>
            <strong>Accounts could not be loaded.</strong>
            <span>{loadError}</span>
          </div>
          <button type="button" onClick={handleRetryLoad}>
            Retry
          </button>
        </div>
      ) : null}

      {isLoadingAccounts ? (
        <div className={styles.loadNotice} aria-live="polite">
          <div>
            <strong>Loading accounts...</strong>
            <span>Fetching current admin and agent records from Supabase.</span>
          </div>
        </div>
      ) : null}

      {successMessage ? (
        <div className={styles.successNotice} role="status">
          {successMessage}
        </div>
      ) : null}

      <AccountsSummary
        accounts={accounts}
        onCreateAccount={setCreateAccountType}
        onEditAccount={setEditingAccount}
      />

      {createAccountType && (
        <CreateAccount
          accountType={createAccountType}
          onCreate={(nextAccounts, message = 'Internal admin created successfully.') => {
            void Promise.resolve(nextAccounts).then((resolved) => {
              handleAccountsSaved(resolved, message);
            });
          }}
          onClose={() => setCreateAccountType(null)}
        />
      )}

      {editingAccount && (
        <EditAccount
          account={editingAccount}
          onSave={(nextAccounts, message = 'Internal admin updated successfully.') => {
            void Promise.resolve(nextAccounts).then((resolved) => {
              if (editingAccount.role === 'admins') {
                handleAccountsSaved(resolved, message);
                return;
              }
              setAccounts(resolved);
            });
          }}
          onClose={() => setEditingAccount(null)}
        />
      )}
    </div>
  );
}
