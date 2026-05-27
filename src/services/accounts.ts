import type { AccountSummaryItem, AccountView } from '../components/account/AccountsSummary';

const STORAGE_KEY = 'kiosk.accounts';
const CHANGE_EVENT = 'accounts-changed';

type AccountStatus = 'Active' | 'Inactive';

export type AccountInput = {
  profileImage?: string;
  name: string;
  email: string;
  contact: string;
  role: AccountView;
  handle: string;
  access: string;
  branch: string;
  status: AccountStatus;
};

const defaultAccounts: AccountSummaryItem[] = [];

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `account-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRole(role: unknown): AccountView {
  return role === 'agents' ? 'agents' : 'admins';
}

function normalizeStatus(status: unknown): AccountStatus {
  return typeof status === 'string' && status.toLowerCase() === 'inactive'
    ? 'Inactive'
    : 'Active';
}

function normalizeAccounts(accounts: unknown[]) {
  const seen = new Set<string>();

  return accounts.reduce<AccountSummaryItem[]>((result, account) => {
    if (!account || typeof account !== 'object' || !('name' in account)) {
      return result;
    }

    const rawAccount = account as Partial<AccountSummaryItem>;
    const name = typeof rawAccount.name === 'string' ? rawAccount.name.trim() : '';
    const role = normalizeRole(rawAccount.role);
    const key = `${role}|${name.toLowerCase()}`;

    if (!name || seen.has(key)) {
      return result;
    }

    seen.add(key);
    result.push({
      id: typeof rawAccount.id === 'string' && rawAccount.id ? rawAccount.id : createId(),
      profileImage:
        typeof rawAccount.profileImage === 'string' ? rawAccount.profileImage : undefined,
      name,
      email: typeof rawAccount.email === 'string' ? rawAccount.email.trim() : '',
      contact: typeof rawAccount.contact === 'string' ? rawAccount.contact.trim() : '',
      role,
      handle: typeof rawAccount.handle === 'string' ? rawAccount.handle.trim() : '',
      access: typeof rawAccount.access === 'string' ? rawAccount.access.trim() : '',
      branch: typeof rawAccount.branch === 'string' ? rawAccount.branch.trim() : '',
      status: normalizeStatus(rawAccount.status),
      createdAt:
        typeof rawAccount.createdAt === 'string' && rawAccount.createdAt
          ? rawAccount.createdAt
          : new Date().toISOString(),
    });

    return result;
  }, []);
}

export function getAccountItems() {
  if (typeof window === 'undefined') {
    return defaultAccounts;
  }

  const storedAccounts = window.localStorage.getItem(STORAGE_KEY);

  if (!storedAccounts) {
    return defaultAccounts;
  }

  try {
    const parsedAccounts: unknown = JSON.parse(storedAccounts);

    if (!Array.isArray(parsedAccounts)) {
      return defaultAccounts;
    }

    return normalizeAccounts(parsedAccounts);
  } catch {
    return defaultAccounts;
  }
}

export function saveAccountItems(accounts: AccountSummaryItem[]) {
  const normalizedAccounts = normalizeAccounts(accounts);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedAccounts));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  return normalizedAccounts;
}

export function addAccountItem(account: AccountInput) {
  return saveAccountItems([
    ...getAccountItems(),
    {
      ...account,
      id: createId(),
      createdAt: new Date().toISOString(),
    },
  ]);
}

export function updateAccountItem(accountId: string, account: AccountInput) {
  return saveAccountItems(
    getAccountItems().map((currentAccount) =>
      currentAccount.id === accountId
        ? {
            ...account,
            id: accountId,
            createdAt: currentAccount.createdAt,
          }
        : currentAccount,
    ),
  );
}

export function subscribeAccountItems(callback: (accounts: AccountSummaryItem[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getAccountItems());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getAccountItems());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}
