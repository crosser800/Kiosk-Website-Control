import { supabase } from '../lib/supabase';
import type { AccountSummaryItem, AccountView } from '../components/account/AccountsSummary';
import type { OrderPriceCode } from './orderPricing';

const STORAGE_KEY = 'kiosk.accounts';
const CHANGE_EVENT = 'accounts-changed';

type AccountStatus = 'Active' | 'Inactive' | 'Blocked';

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
  address?: string;
  notes?: string;
  priceAccess?: OrderPriceCode[];
};

type AgentAccountRow = {
  id: string;
  auth_user_id: string | null;
  agent_code: string | null;
  full_name: string;
  company_name: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  profile_image_url: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'inactive') {
    return 'Inactive';
  }
  if (normalized === 'blocked') {
    return 'Blocked';
  }
  return 'Active';
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

function getStoredAccounts() {
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

function getStoredAdminAccounts() {
  return getStoredAccounts().filter((account) => account.role === 'admins');
}

function saveStoredAccounts(accounts: AccountSummaryItem[]) {
  const normalizedAccounts = normalizeAccounts(accounts);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedAccounts));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  return normalizedAccounts;
}

function mapAgentRowToAccount(row: AgentAccountRow): AccountSummaryItem {
  return {
    id: String(row.id),
    name: String(row.full_name ?? '').trim(),
    email: String(row.email ?? '').trim(),
    contact: String(row.contact_number ?? '').trim(),
    role: 'agents',
    handle: String(row.agent_code ?? '').trim(),
    access: '',
    branch:
      String(row.company_name ?? '').trim() ||
      String(row.address ?? '').trim() ||
      '-',
    status: normalizeStatus(row.status),
    profileImage: String(row.profile_image_url ?? '').trim() || undefined,
    authUserId: row.auth_user_id ? String(row.auth_user_id) : '',
    address: String(row.address ?? '').trim(),
    notes: String(row.notes ?? '').trim(),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function fetchAgentAccounts() {
  const { data, error } = await supabase
    .from('agent_accounts')
    .select(
      'id, auth_user_id, agent_code, full_name, company_name, contact_number, email, address, profile_image_url, status, notes, created_at, updated_at',
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapAgentRowToAccount(row as AgentAccountRow));
}

export function getAccountItems() {
  return getStoredAdminAccounts();
}

export async function loadAccountItems() {
  const admins = getStoredAdminAccounts();
  const agents = await fetchAgentAccounts();
  return [...admins, ...agents];
}

export async function addAccountItem(account: AccountInput) {
  if (account.role === 'admins') {
    saveStoredAccounts([
      ...getStoredAdminAccounts(),
      {
        ...account,
        id: createId(),
        createdAt: new Date().toISOString(),
      },
    ]);

    return loadAccountItems();
  }

  const { data, error } = await supabase
    .from('agent_accounts')
    .insert({
    agent_code: account.handle.trim() || null,
    full_name: account.name.trim(),
    company_name: account.branch.trim() || null,
    contact_number: account.contact.trim() || null,
    email: account.email.trim() || null,
    address: account.address?.trim() || null,
    profile_image_url: account.profileImage?.trim() || null,
    notes: account.notes?.trim() || null,
    status: account.status,
  })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const agentId = String(data?.id ?? '');
  const priceAccess = account.priceAccess ?? [];
  if (agentId && priceAccess.length > 0) {
    const { error: priceError } = await supabase.from('agent_price_access').insert(
      priceAccess.map((priceClass) => ({
        agent_id: agentId,
        price_class: priceClass,
      })),
    );

    if (priceError) {
      throw new Error(
        `Agent was created, but price access could not be saved: ${priceError.message}`,
      );
    }
  }

  return loadAccountItems();
}

export async function updateAccountItem(accountId: string, account: AccountInput) {
  if (account.role === 'admins') {
    saveStoredAccounts(
      getStoredAdminAccounts().map((currentAccount) =>
        currentAccount.id === accountId
          ? {
              ...account,
              id: accountId,
              createdAt: currentAccount.createdAt,
            }
          : currentAccount,
      ),
    );

    return loadAccountItems();
  }

  const { error } = await supabase
    .from('agent_accounts')
    .update({
      agent_code: account.handle.trim() || null,
      full_name: account.name.trim(),
      company_name: account.branch.trim() || null,
      contact_number: account.contact.trim() || null,
      email: account.email.trim() || null,
      address: account.address?.trim() || null,
      profile_image_url: account.profileImage?.trim() || null,
      notes: account.notes?.trim() || null,
      status: account.status,
    })
    .eq('id', accountId);

  if (error) {
    throw new Error(error.message);
  }

  return loadAccountItems();
}

export function subscribeAccountItems(callback: (accounts: AccountSummaryItem[]) => void) {
  let disposed = false;

  const syncAccounts = async () => {
    try {
      const accounts = await loadAccountItems();
      if (!disposed) {
        callback(accounts);
      }
    } catch {
      if (!disposed) {
        callback(getStoredAdminAccounts());
      }
    }
  };

  void syncAccounts();

  if (typeof window === 'undefined') {
    return () => {
      disposed = true;
    };
  }

  const handleChange = () => {
    void syncAccounts();
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      void syncAccounts();
    }
  };

  const agentChannel = supabase
    .channel('agent-accounts-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'agent_accounts' },
      () => {
        void syncAccounts();
      },
    )
    .subscribe();

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    disposed = true;
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
    void supabase.removeChannel(agentChannel);
  };
}
