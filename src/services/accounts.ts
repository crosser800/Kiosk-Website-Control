import { supabase } from '../lib/supabase';
import type { AccountSummaryItem, AccountView } from '../components/account/AccountsSummary';
import type { OrderPriceCode } from './orderPricing';
import { formatRoleLabel } from './currentAdminProfile';
import {
  convertImageToWebp,
  getAgentProfilePath,
  MAX_PROFILE_IMAGE_DIMENSION,
  PROFILE_IMAGE_BUCKET,
  PROFILE_IMAGE_QUALITY,
} from '../utils/profileImages';

type AccountStatus = 'Active' | 'Inactive' | 'Blocked';

export type AccountInput = {
  profileImage?: string;
  profileImageFile?: File;
  name: string;
  email: string;
  contact: string;
  role: AccountView;
  handle: string;
  access: string | string[];
  branch: string;
  departmentId?: string;
  departmentName?: string;
  status: AccountStatus;
  address?: string;
  notes?: string;
  priceAccess?: OrderPriceCode[];
};

type AccountCreateResult = AccountSummaryItem[] & { warning?: string };

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

type AdminAccountRow = {
  id: string;
  auth_user_id: string | null;
  department_id: string | null;
  admin_code: string | null;
  full_name: string | null;
  email: string | null;
  profile_image_url: string | null;
  position: string | null;
  department: string | null;
  contact_number: string | null;
  address: string | null;
  bio: string | null;
  role: string | null;
  status: string | null;
  notes: string | null;
  is_system_owner: boolean | null;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
};

type AdminRoleLinkRow = {
  admin_account_id: string | null;
  admin_roles: { role_name: string | null } | { role_name: string | null }[] | null;
};

type AdminDepartmentNameRow = {
  id: string | null;
  name: string | null;
};

const defaultAccounts: AccountSummaryItem[] = [];

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

function normalizeAccessText(access: string | string[] | undefined) {
  if (Array.isArray(access)) {
    return access.map((item) => item.trim()).filter(Boolean).join(', ');
  }

  return String(access ?? '').trim();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function mapAdminCreationError(message: string) {
  const safeMessages = [
    'An administrator with this email already exists.',
    'Your account is not authorized to create administrators.',
    'The selected department does not exist.',
    'The default Admin role is not configured.',
    'Full name is required.',
    'A valid email address is required.',
  ];
  const normalized = message.toLowerCase();
  const matchedMessage = safeMessages.find((safeMessage) =>
    normalized.includes(safeMessage.toLowerCase()),
  );

  if (matchedMessage) {
    return matchedMessage;
  }

  if (import.meta.env.DEV) {
    console.error('pre_register_admin failed', { message });
  }

  return 'The administrator account could not be created.';
}

function mapAdminRowToAccount(
  row: AdminAccountRow,
  linkedRoleLabel: string,
  departmentName: string,
): AccountSummaryItem {
  const roleLabel = linkedRoleLabel || formatRoleLabel(row.role) || 'Admin';
  const isSystemOwner = Boolean(row.is_system_owner);
  const status = normalizeStatus(row.status);
  const hasAuthUser = Boolean(String(row.auth_user_id ?? '').trim());

  return {
    id: String(row.id),
    name:
      String(row.full_name ?? '').trim() ||
      String(row.email ?? '').trim() ||
      'Admin User',
    email: String(row.email ?? '').trim(),
    contact: String(row.contact_number ?? '').trim(),
    role: 'admins',
    handle: String(row.admin_code ?? '').trim(),
    access: roleLabel,
    branch:
      departmentName ||
      String(row.department ?? '').trim() ||
      String(row.position ?? '').trim() ||
      '—',
    status: status === 'Active' && !hasAuthUser ? 'Pending Setup' : status,
    profileImage: String(row.profile_image_url ?? '').trim() || undefined,
    authUserId: row.auth_user_id ? String(row.auth_user_id) : '',
    address: String(row.address ?? '').trim(),
    notes: String(row.notes ?? '').trim(),
    roleLabel,
    isSystemOwner,
    canEdit: !isSystemOwner,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function fetchAdminRoleLabels(adminIds: string[]) {
  if (adminIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from('admin_account_roles')
    .select('admin_account_id, admin_roles(role_name)')
    .in('admin_account_id', adminIds);

  if (error) {
    console.error('Admin role labels failed to load', error);
    return new Map<string, string>();
  }

  const labels = new Map<string, string>();
  ((data ?? []) as AdminRoleLinkRow[]).forEach((row) => {
    const adminId = String(row.admin_account_id ?? '');
    const roleRef = Array.isArray(row.admin_roles) ? row.admin_roles[0] : row.admin_roles;
    const roleLabel = formatRoleLabel(roleRef?.role_name);
    if (adminId && roleLabel && !labels.has(adminId)) {
      labels.set(adminId, roleLabel);
    }
  });

  return labels;
}

async function fetchAdminAccounts() {
  const { data, error } = await supabase
    .from('admin_accounts')
    .select(
      [
        'id',
        'auth_user_id',
        'department_id',
        'admin_code',
        'full_name',
        'email',
        'profile_image_url',
        'position',
        'department',
        'contact_number',
        'address',
        'bio',
        'role',
        'status',
        'notes',
        'is_system_owner',
        'last_login_at',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load admin accounts: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as AdminAccountRow[];
  const roleLabels = await fetchAdminRoleLabels(rows.map((row) => String(row.id)));
  const departmentNames = await fetchDepartmentNames(
    rows.map((row) => String(row.department_id ?? '').trim()).filter(Boolean),
  );
  return rows.map((row) =>
    mapAdminRowToAccount(
      row,
      roleLabels.get(String(row.id)) ?? '',
      departmentNames.get(String(row.department_id ?? '').trim()) ?? '',
    ),
  );
}

async function fetchDepartmentNames(departmentIds: string[]) {
  const uniqueIds = Array.from(new Set(departmentIds.filter(isUuid)));
  if (uniqueIds.length === 0) {
    return new Map<string, string>();
  }

  const { data, error } = await supabase
    .from('admin_departments')
    .select('id, name')
    .in('id', uniqueIds);

  if (error) {
    console.error('Admin departments failed to resolve', error);
    return new Map<string, string>();
  }

  const names = new Map<string, string>();
  ((data ?? []) as AdminDepartmentNameRow[]).forEach((row) => {
    const id = String(row.id ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (id && name) {
      names.set(id, name);
    }
  });

  return names;
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
  return defaultAccounts;
}

export async function loadAccountItems() {
  const [admins, agents] = await Promise.all([
    fetchAdminAccounts(),
    fetchAgentAccounts(),
  ]);
  return [...admins, ...agents];
}

export async function addAccountItem(account: AccountInput) {
  if (account.role === 'admins') {
    const departmentId = account.departmentId?.trim() ?? '';

    if (departmentId && !isUuid(departmentId)) {
      throw new Error('The selected department does not exist.');
    }

    const { error } = await supabase.rpc('pre_register_admin', {
      p_full_name: account.name.trim(),
      p_email: account.email.trim().toLowerCase(),
      p_contact_number: account.contact.trim() || null,
      p_department_id: departmentId || null,
      p_status: account.status === 'Inactive' ? 'Inactive' : 'Active',
    });

    if (error) {
      throw new Error(mapAdminCreationError(error.message));
    }

    return loadAccountItems();
  }

  const { data, error } = await supabase
    .from('agent_accounts')
    .insert({
      full_name: account.name.trim(),
      company_name: account.branch.trim() || null,
      contact_number: account.contact.trim() || null,
      email: account.email.trim().toLowerCase(),
      address: account.address?.trim() || null,
      profile_image_url: null,
      notes: account.notes?.trim() || null,
      status: account.status,
    })
    .select('id')
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const agentId = String(data?.id ?? '');
  let profileWarning = '';

  if (agentId && account.profileImageFile) {
    try {
      const profileBlob = await convertImageToWebp(account.profileImageFile, {
        maxWidth: MAX_PROFILE_IMAGE_DIMENSION,
        maxHeight: MAX_PROFILE_IMAGE_DIMENSION,
        quality: PROFILE_IMAGE_QUALITY,
      });
      const profilePath = getAgentProfilePath(agentId);
      const { error: uploadError } = await supabase.storage
        .from(PROFILE_IMAGE_BUCKET)
        .upload(profilePath, profileBlob, {
          contentType: 'image/webp',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      const { data: publicUrlData } = supabase.storage
        .from(PROFILE_IMAGE_BUCKET)
        .getPublicUrl(profilePath);
      const profileImageUrl = publicUrlData.publicUrl;

      if (profileImageUrl) {
        const { error: profileUpdateError } = await supabase
          .from('agent_accounts')
          .update({ profile_image_url: profileImageUrl })
          .eq('id', agentId);

        if (profileUpdateError) {
          throw profileUpdateError;
        }
      }
    } catch (profileError) {
      console.error('Agent profile image upload failed', profileError);
      profileWarning = 'Agent was created, but the profile image could not be uploaded.';
    }
  }

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

  const accounts = (await loadAccountItems()) as AccountCreateResult;
  if (profileWarning) {
    accounts.warning = profileWarning;
  }

  return accounts;
}

export async function updateAccountItem(accountId: string, account: AccountInput) {
  if (account.role === 'admins') {
    const { data: currentAdmin, error: currentError } = await supabase
      .from('admin_accounts')
      .select('id, is_system_owner')
      .eq('id', accountId)
      .maybeSingle<{ id: string; is_system_owner: boolean | null }>();

    if (currentError) {
      throw new Error(currentError.message);
    }

    if (!currentAdmin) {
      throw new Error('Admin account was not found.');
    }

    if (currentAdmin.is_system_owner) {
      throw new Error('Protected system owner accounts cannot be edited here.');
    }

    const { error } = await supabase
      .from('admin_accounts')
      .update({
        full_name: account.name.trim(),
        email: account.email.trim() || null,
        contact_number: account.contact.trim() || null,
        department: account.branch.trim() || null,
        position: normalizeAccessText(account.access) || null,
        profile_image_url: account.profileImage?.trim() || null,
        status: account.status,
      })
      .eq('id', accountId);

    if (error) {
      throw new Error(error.message);
    }

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

export function subscribeAccountItems(
  callback: (accounts: AccountSummaryItem[]) => void,
  onError?: (error: Error) => void,
) {
  let disposed = false;

  const syncAccounts = async () => {
    try {
      const accounts = await loadAccountItems();
      if (!disposed) {
        callback(accounts);
      }
    } catch (error) {
      console.error('Failed to load account items', error);
      if (!disposed) {
        callback([]);
        onError?.(error instanceof Error ? error : new Error('Unable to load account items.'));
      }
    }
  };

  void syncAccounts();

  if (typeof window === 'undefined') {
    return () => {
      disposed = true;
    };
  }

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

  const adminChannel = supabase
    .channel('admin-accounts-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'admin_accounts' },
      () => {
        void syncAccounts();
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'admin_account_roles' },
      () => {
        void syncAccounts();
      },
    )
    .subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(agentChannel);
    void supabase.removeChannel(adminChannel);
  };
}
