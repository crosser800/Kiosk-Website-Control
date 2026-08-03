import { supabase } from '../lib/supabase';
import type {
  AccountPermissionSummary,
  AccountSummaryItem,
  AccountView,
} from '../components/account/AccountsSummary';
import { getStoredInternalSessionToken } from './internalAdminAuth';
import type { OrderPriceCode } from './orderPricing';
import {
  convertImageToWebp,
  getAgentProfilePath,
  MAX_PROFILE_IMAGE_DIMENSION,
  PROFILE_IMAGE_BUCKET,
  PROFILE_IMAGE_QUALITY,
} from '../utils/profileImages';

type AccountStatus = 'Active' | 'Inactive' | 'Blocked' | 'Locked';

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
  username?: string;
  roleId?: string;
  parentAdminAccountId?: string;
  permissionIds?: string[];
  temporaryPassword?: string;
};

type AccountCreateResult = AccountSummaryItem[] & { warning?: string };

export type AdminRoleOption = {
  id: string;
  name: string;
  code: string;
};

export type AdminGatewayOption = {
  id: string;
  label: string;
  email: string;
  position: string;
};

export type AdminPermissionOption = {
  id: string;
  moduleCode: string;
  permissionCode: string;
  label: string;
  description: string;
  sortOrder: number;
};

export type InternalAdminFormOptions = {
  roles: AdminRoleOption[];
  departments: { id: string; name: string }[];
  gateways: AdminGatewayOption[];
  permissions: AdminPermissionOption[];
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

type InternalAdminAccountRow = {
  id: string;
  parent_admin_account_id: string | null;
  role_id: string | null;
  department_id: string | null;
  username: string | null;
  full_name: string | null;
  profile_image_url: string | null;
  status: string | null;
  must_change_password: boolean | null;
  password_changed_at: string | null;
  password_reset_at: string | null;
  created_at: string | null;
};

type AdminRoleRow = {
  id: string | null;
  role_name: string | null;
  role_code: string | null;
};

type AdminDepartmentRow = {
  id: string | null;
  name: string | null;
};

type AdminGatewayRow = {
  id: string | null;
  full_name: string | null;
  email: string | null;
  position: string | null;
  admin_code: string | null;
};

type AdminPermissionRow = {
  id: string | null;
  module_code: string | null;
  permission_code: string | null;
  permission_name?: string | null;
  description?: string | null;
  sort_order?: number | null;
};

type InternalAdminPermissionRow = {
  internal_admin_account_id: string | null;
  permission_id: string | null;
};

const defaultAccounts: AccountSummaryItem[] = [];
export const INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH = 8;
const MODULE_ORDER = [
  'dashboard',
  'products',
  'orders',
  'sales',
  'accounts',
  'admin_users',
  'settings',
];

const MODULE_CODE_ALIASES = new Map<string, string>([
  ['dashboard', 'dashboard'],
  ['products', 'products'],
  ['orders', 'orders'],
  ['order', 'orders'],
  ['sales', 'sales'],
  ['accounts', 'accounts'],
  ['account', 'accounts'],
  ['admin_users', 'admin_users'],
  ['settings', 'settings'],
]);

function normalizeModuleCode(moduleCode: string) {
  return moduleCode.trim().toLowerCase();
}

function getModuleSortKey(moduleCode: string) {
  const normalized = normalizeModuleCode(moduleCode);
  const canonical = MODULE_CODE_ALIASES.get(normalized) ?? normalized;
  const knownIndex = MODULE_ORDER.indexOf(canonical);

  return {
    knownIndex: knownIndex === -1 ? Number.MAX_SAFE_INTEGER : knownIndex,
    fallback: normalized,
  };
}

export function comparePermissionModules(leftModuleCode: string, rightModuleCode: string) {
  const left = getModuleSortKey(leftModuleCode);
  const right = getModuleSortKey(rightModuleCode);

  if (left.knownIndex !== right.knownIndex) {
    return left.knownIndex - right.knownIndex;
  }

  return left.fallback.localeCompare(right.fallback);
}

export function comparePermissionItems(
  left: Pick<AdminPermissionOption, 'sortOrder' | 'label'>,
  right: Pick<AdminPermissionOption, 'sortOrder' | 'label'>,
) {
  if (left.sortOrder !== right.sortOrder) {
    return left.sortOrder - right.sortOrder;
  }

  return left.label.localeCompare(right.label);
}

export function groupPermissionsByModule<Permission extends { moduleCode: string; sortOrder: number; label: string }>(
  permissions: Permission[],
) {
  const groups = new Map<string, Permission[]>();
  permissions.forEach((permission) => {
    groups.set(permission.moduleCode, [...(groups.get(permission.moduleCode) ?? []), permission]);
  });

  return Array.from(groups.entries())
    .sort(([leftModule], [rightModule]) => comparePermissionModules(leftModule, rightModule))
    .map(([moduleCode, modulePermissions]) => [
      moduleCode,
      modulePermissions.slice().sort(comparePermissionItems),
    ] as const);
}

function normalizeStatus(status: unknown): AccountStatus {
  const normalized = String(status ?? '').toLowerCase();
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'locked') return 'Locked';
  if (normalized === 'blocked') return 'Blocked';
  return 'Active';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function validateUsername(value: string) {
  return /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value);
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
    branch: String(row.company_name ?? '').trim() || String(row.address ?? '').trim() || '-',
    status: normalizeStatus(row.status),
    profileImage: String(row.profile_image_url ?? '').trim() || undefined,
    authUserId: row.auth_user_id ? String(row.auth_user_id) : '',
    address: String(row.address ?? '').trim(),
    notes: String(row.notes ?? '').trim(),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapInternalAdminRowToAccount(
  row: InternalAdminAccountRow,
  roleLabel: string,
  departmentName: string,
  permissionLabels: string[],
  permissionIds: string[],
  assignedPermissions: AccountPermissionSummary[],
  totalPermissionCount: number,
): AccountSummaryItem {
  const mustChangePassword = Boolean(row.must_change_password);

  return {
    id: String(row.id),
    name: String(row.full_name ?? '').trim() || String(row.username ?? '').trim() || 'Internal Admin',
    email: '',
    contact: '',
    role: 'admins',
    handle: String(row.username ?? '').trim(),
    access: permissionLabels.length > 0 ? permissionLabels.join(', ') : 'No access',
    branch: departmentName || '-',
    status: normalizeStatus(row.status),
    profileImage: String(row.profile_image_url ?? '').trim() || undefined,
    roleLabel: roleLabel || '-',
    username: String(row.username ?? '').trim(),
    roleId: String(row.role_id ?? '').trim(),
    departmentId: String(row.department_id ?? '').trim(),
    parentAdminAccountId: String(row.parent_admin_account_id ?? '').trim(),
    permissionIds,
    assignedPermissions,
    totalPermissionCount,
    passwordStatus: mustChangePassword ? 'Default Password' : 'Password Changed',
    passwordChangedAt: String(row.password_changed_at ?? '').trim(),
    passwordResetAt: String(row.password_reset_at ?? '').trim(),
    canEdit: true,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function fetchDepartmentNames(departmentIds: string[]) {
  const uniqueIds = Array.from(new Set(departmentIds.filter(isUuid)));
  const names = new Map<string, string>();
  if (uniqueIds.length === 0) return names;

  const { data, error } = await supabase.from('admin_departments').select('id, name').in('id', uniqueIds);
  if (error) {
    console.error('Admin departments failed to resolve', error);
    return names;
  }

  ((data ?? []) as AdminDepartmentRow[]).forEach((row) => {
    const id = String(row.id ?? '').trim();
    const name = String(row.name ?? '').trim();
    if (id && name) names.set(id, name);
  });

  return names;
}

async function fetchRoleNames(roleIds: string[]) {
  const uniqueIds = Array.from(new Set(roleIds.filter(isUuid)));
  const names = new Map<string, string>();
  if (uniqueIds.length === 0) return names;

  const { data, error } = await supabase.from('admin_roles').select('id, role_name').in('id', uniqueIds);
  if (error) {
    console.error('Admin role labels failed to load', error);
    return names;
  }

  ((data ?? []) as AdminRoleRow[]).forEach((row) => {
    const id = String(row.id ?? '').trim();
    const name = String(row.role_name ?? '').trim();
    if (id && name) names.set(id, name);
  });

  return names;
}

export async function loadAdminPermissions(): Promise<AdminPermissionOption[]> {
  const { data, error } = await supabase
    .from('admin_permissions')
    .select('id, module_code, permission_code, permission_name, description, sort_order')
    .order('sort_order', { ascending: true })
    .order('permission_name', { ascending: true });

  if (error) {
    throw new Error(`Unable to load admin permissions: ${error.message}`);
  }

  return ((data ?? []) as AdminPermissionRow[])
    .map((row) => {
      const id = String(row.id ?? '').trim();
      const moduleCode = String(row.module_code ?? '').trim();
      const permissionCode = String(row.permission_code ?? '').trim();
      const label = String(row.permission_name ?? row.permission_code ?? '').trim();

      return {
        id,
        moduleCode,
        permissionCode,
        label: label || permissionCode || id,
        description: String(row.description ?? '').trim(),
        sortOrder: Number(row.sort_order ?? 0),
      };
    })
    .filter((permission) => permission.id && permission.moduleCode);
}

async function fetchInternalAdminPermissionLabels(internalAdminIds: string[]) {
  const uniqueIds = Array.from(new Set(internalAdminIds.filter(isUuid)));
  const result = new Map<
    string,
    { ids: string[]; labels: string[]; assignedPermissions: AccountPermissionSummary[] }
  >();
  if (uniqueIds.length === 0) return result;

  const [linkResult, permissions] = await Promise.all([
    supabase
      .from('internal_admin_permissions')
      .select('internal_admin_account_id, permission_id')
      .in('internal_admin_account_id', uniqueIds),
    loadAdminPermissions(),
  ]);

  if (linkResult.error) {
    console.error('Internal admin permissions failed to load', linkResult.error);
    return result;
  }

  const permissionMap = new Map(permissions.map((permission) => [permission.id, permission]));
  ((linkResult.data ?? []) as InternalAdminPermissionRow[]).forEach((row) => {
    const internalAdminId = String(row.internal_admin_account_id ?? '').trim();
    const permissionId = String(row.permission_id ?? '').trim();
    if (!internalAdminId || !permissionId) return;

    const current = result.get(internalAdminId) ?? { ids: [], labels: [], assignedPermissions: [] };
    const permission = permissionMap.get(permissionId);
    current.ids.push(permissionId);
    current.labels.push(permission?.label ?? permissionId);
    if (permission) {
      current.assignedPermissions.push({
        id: permission.id,
        moduleCode: permission.moduleCode,
        permissionCode: permission.permissionCode,
        label: permission.label,
        sortOrder: permission.sortOrder,
      });
    }
    result.set(internalAdminId, current);
  });

  return result;
}

async function fetchInternalAdminAccounts() {
  const { data, error } = await supabase
    .from('internal_admin_accounts')
    .select(
      [
        'id',
        'parent_admin_account_id',
        'role_id',
        'department_id',
        'username',
        'full_name',
        'profile_image_url',
        'status',
        'must_change_password',
        'password_changed_at',
        'password_reset_at',
        'created_at',
      ].join(', '),
    )
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(`Unable to load internal admin accounts: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as InternalAdminAccountRow[];
  const [roles, departments, permissions, allPermissions] = await Promise.all([
    fetchRoleNames(rows.map((row) => String(row.role_id ?? '').trim())),
    fetchDepartmentNames(rows.map((row) => String(row.department_id ?? '').trim())),
    fetchInternalAdminPermissionLabels(rows.map((row) => String(row.id))),
    loadAdminPermissions(),
  ]);

  return rows.map((row) =>
    mapInternalAdminRowToAccount(
      row,
      roles.get(String(row.role_id ?? '').trim()) ?? '',
      departments.get(String(row.department_id ?? '').trim()) ?? '',
      permissions.get(String(row.id))?.labels ?? [],
      permissions.get(String(row.id))?.ids ?? [],
      permissions.get(String(row.id))?.assignedPermissions ?? [],
      allPermissions.length,
    ),
  );
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

export async function loadInternalAdminFormOptions(): Promise<InternalAdminFormOptions> {
  const [rolesRes, departmentsRes, gatewaysRes, permissions] = await Promise.all([
    supabase
      .from('admin_roles')
      .select('id, role_name, role_code')
      .eq('status', 'Active')
      .order('sort_order', { ascending: true })
      .order('role_name', { ascending: true }),
    supabase
      .from('admin_departments')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true }),
    supabase
      .from('admin_accounts')
      .select('id, full_name, email, position, admin_code')
      .eq('status', 'Active')
      .order('full_name', { ascending: true }),
    loadAdminPermissions(),
  ]);

  const error = rolesRes.error ?? departmentsRes.error ?? gatewaysRes.error;
  if (error) {
    throw new Error(`Unable to load internal admin form options: ${error.message}`);
  }

  const roles = ((rolesRes.data ?? []) as AdminRoleRow[])
    .map((row) => ({
      id: String(row.id ?? '').trim(),
      name: String(row.role_name ?? '').trim(),
      code: String(row.role_code ?? '').trim(),
    }))
    .filter((role) => role.id && role.name);

  const departments = ((departmentsRes.data ?? []) as AdminDepartmentRow[])
    .map((row) => ({ id: String(row.id ?? '').trim(), name: String(row.name ?? '').trim() }))
    .filter((department) => department.id && department.name);

  const gateways = ((gatewaysRes.data ?? []) as AdminGatewayRow[])
    .map((row) => {
      const fullName = String(row.full_name ?? '').trim();
      const email = String(row.email ?? '').trim();
      const adminCode = String(row.admin_code ?? '').trim();
      const position = String(row.position ?? '').trim();
      return {
        id: String(row.id ?? '').trim(),
        label: fullName || email || adminCode || 'Gateway Admin',
        email,
        position,
      };
    })
    .filter((gateway) => gateway.id);

  return { roles, departments, gateways, permissions };
}

export function getAccountItems() {
  return defaultAccounts;
}

export async function loadAccountItems() {
  const [admins, agents] = await Promise.all([
    fetchInternalAdminAccounts(),
    fetchAgentAccounts(),
  ]);
  return [...admins, ...agents];
}

async function assertUniqueInternalAdminUsername(
  username: string,
  parentAdminAccountId: string,
  editingId?: string,
) {
  let query = supabase
    .from('internal_admin_accounts')
    .select('id')
    .eq('username', username)
    .eq('parent_admin_account_id', parentAdminAccountId)
    .limit(1);

  if (editingId) {
    query = query.neq('id', editingId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Unable to validate username: ${error.message}`);
  if ((data ?? []).length > 0) {
    throw new Error('Username already exists under the selected parent gateway account.');
  }
}

async function saveInternalAdminPermissions(internalAdminId: string, permissionIds: string[]) {
  const { error: deleteError } = await supabase
    .from('internal_admin_permissions')
    .delete()
    .eq('internal_admin_account_id', internalAdminId);

  if (deleteError) {
    throw new Error(`Unable to update permissions: ${deleteError.message}`);
  }

  const uniquePermissionIds = Array.from(new Set(permissionIds.filter(isUuid)));
  if (uniquePermissionIds.length === 0) return;

  const { error: insertError } = await supabase.from('internal_admin_permissions').insert(
    uniquePermissionIds.map((permissionId) => ({
      internal_admin_account_id: internalAdminId,
      permission_id: permissionId,
    })),
  );

  if (insertError) {
    throw new Error(`Unable to save permissions: ${insertError.message}`);
  }
}

function validateInternalAdminInput(account: AccountInput, isCreate: boolean) {
  const username = normalizeUsername(account.username ?? '');
  const parentAdminAccountId = account.parentAdminAccountId?.trim() ?? '';

  if (!account.name.trim()) throw new Error('Full Name is required.');
  if (!username) throw new Error('Username is required.');
  if (!validateUsername(username)) {
    throw new Error('Username may contain lowercase letters, numbers, dots, underscores, or hyphens only.');
  }
  if (isCreate && (!parentAdminAccountId || !isUuid(parentAdminAccountId))) {
    throw new Error('Select a valid parent gateway account.');
  }
  if (account.roleId && !isUuid(account.roleId)) throw new Error('Select a valid role.');
  if (account.departmentId && !isUuid(account.departmentId)) throw new Error('Select a valid department.');
  if (isCreate && !account.temporaryPassword?.trim()) throw new Error('Temporary password is required.');
  if (
    isCreate &&
    (account.temporaryPassword?.length ?? 0) < INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH
  ) {
    throw new Error('Temporary password must be at least 8 characters.');
  }

  return username;
}

export async function addAccountItem(account: AccountInput) {
  if (account.role === 'admins') {
    validateInternalAdminInput(account, true);
    const { data, error } = await supabase.rpc('create_internal_admin', {
      p_session_token: getStoredInternalSessionToken(),
      p_profile_image_url: account.profileImage?.trim() || null,
      p_full_name: account.name.trim(),
      p_username: account.username?.trim() ?? '',
      p_role_id: account.roleId?.trim() || null,
      p_department_id: account.departmentId?.trim() || null,
      p_temporary_password: account.temporaryPassword ?? '',
      p_status: account.status,
      p_permission_ids: account.permissionIds ?? [],
    });

    if (error) throw new Error(error.message);

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.ok !== true) {
      throw new Error(String(result.error ?? 'Unable to create this internal admin.'));
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

  if (error) throw new Error(error.message);

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

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(profilePath);
      const profileImageUrl = publicUrlData.publicUrl;

      if (profileImageUrl) {
        const { error: profileUpdateError } = await supabase
          .from('agent_accounts')
          .update({ profile_image_url: profileImageUrl })
          .eq('id', agentId);

        if (profileUpdateError) throw profileUpdateError;
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
      throw new Error(`Agent was created, but price access could not be saved: ${priceError.message}`);
    }
  }

  const accounts = (await loadAccountItems()) as AccountCreateResult;
  if (profileWarning) accounts.warning = profileWarning;

  return accounts;
}

export async function updateAccountItem(accountId: string, account: AccountInput) {
  if (account.role === 'admins') {
    const username = validateInternalAdminInput(account, false);
    const { data: currentAccount, error: currentAccountError } = await supabase
      .from('internal_admin_accounts')
      .select('parent_admin_account_id')
      .eq('id', accountId)
      .maybeSingle<{ parent_admin_account_id: string | null }>();

    if (currentAccountError) throw new Error(currentAccountError.message);
    const parentAdminAccountId = String(currentAccount?.parent_admin_account_id ?? '').trim();
    if (!parentAdminAccountId) throw new Error('Internal admin parent gateway was not found.');

    await assertUniqueInternalAdminUsername(username, parentAdminAccountId, accountId);

    const { error } = await supabase
      .from('internal_admin_accounts')
      .update({
        profile_image_url: account.profileImage?.trim() || null,
        full_name: account.name.trim(),
        username,
        role_id: account.roleId?.trim() || null,
        department_id: account.departmentId?.trim() || null,
        status: account.status,
      })
      .eq('id', accountId);

    if (error) throw new Error(error.message);

    await saveInternalAdminPermissions(accountId, account.permissionIds ?? []);
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

  if (error) throw new Error(error.message);
  return loadAccountItems();
}

export async function resetInternalAdminPassword(internalAdminId: string, temporaryPassword: string) {
  if (!temporaryPassword.trim()) {
    throw new Error('Temporary password is required.');
  }

  if (temporaryPassword.length < INTERNAL_TEMPORARY_PASSWORD_MIN_LENGTH) {
    throw new Error('Temporary password must be at least 8 characters.');
  }

  const { data, error } = await supabase.rpc('reset_internal_admin_password', {
    p_session_token: getStoredInternalSessionToken(),
    p_internal_admin_id: internalAdminId,
    p_temporary_password: temporaryPassword,
  });

  if (error) throw new Error(error.message);

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok !== true) {
    throw new Error(String(result.error ?? 'Unable to reset this internal admin password.'));
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
      if (!disposed) callback(accounts);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'agent_accounts' }, () => {
      void syncAccounts();
    })
    .subscribe();

  const internalAdminChannel = supabase
    .channel('internal-admin-accounts-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_admin_accounts' }, () => {
      void syncAccounts();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'internal_admin_permissions' }, () => {
      void syncAccounts();
    })
    .subscribe();

  return () => {
    disposed = true;
    void supabase.removeChannel(agentChannel);
    void supabase.removeChannel(internalAdminChannel);
  };
}
