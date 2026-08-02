import { supabase } from '../lib/supabase';
import { validateAdminPassword } from './adminActivation';

const internalSessionStorageKey = '2b_internal_admin_session_token';
const internalNoticeStorageKey = '2b_internal_admin_notice';

export type InternalPermission = {
  id: string;
  moduleCode: string;
  permissionCode: string;
  permissionName: string;
  description: string;
  sortOrder: number;
};

export type InternalAdminProfile = {
  id: string;
  parentAdminAccountId: string;
  profileImageUrl: string;
  fullName: string;
  username: string;
  roleId: string;
  departmentId: string;
  mustChangePassword: boolean;
  status: string;
};

export type InternalSession = {
  token: string;
  sessionId: string;
  expiresAt: string;
  mustChangePassword: boolean;
  account: InternalAdminProfile;
  permissions: InternalPermission[];
};

export type InternalLoginHistoryItem = {
  internalAdminName: string;
  username: string;
  eventType: string;
  attemptedUsername: string;
  occurredAt: string;
  deviceLabel: string;
  ipAddress: string;
  failureReason: string;
  sessionStatus: string;
};

type RawPermission = {
  id?: unknown;
  module_code?: unknown;
  permission_code?: unknown;
  permission_name?: unknown;
  description?: unknown;
  sort_order?: unknown;
};

type RawAccount = {
  id?: unknown;
  parent_admin_account_id?: unknown;
  profile_image_url?: unknown;
  full_name?: unknown;
  username?: unknown;
  role_id?: unknown;
  department_id?: unknown;
  must_change_password?: unknown;
  status?: unknown;
};

type RpcRecord = Record<string, unknown>;

type RawHistoryRow = {
  internal_admin_name?: unknown;
  username?: unknown;
  event_type?: unknown;
  attempted_username?: unknown;
  occurred_at?: unknown;
  device_label?: unknown;
  ip_address?: unknown;
  failure_reason?: unknown;
  session_status?: unknown;
};

export type GatewayAuthContext = {
  ok: boolean;
  adminId: string;
  email: string | null;
  role: string;
  status: string;
  isSystemOwner: boolean;
  requiresInternalLogin: boolean;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function mapPermissions(value: unknown): InternalPermission[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const permission = item as RawPermission;
    return {
      id: text(permission.id),
      moduleCode: text(permission.module_code),
      permissionCode: text(permission.permission_code),
      permissionName: text(permission.permission_name),
      description: text(permission.description),
      sortOrder: Number(permission.sort_order ?? 0),
    };
  }).filter((permission) => permission.id);
}

function mapAccount(value: unknown): InternalAdminProfile {
  const account = (value ?? {}) as RawAccount;
  return {
    id: text(account.id),
    parentAdminAccountId: text(account.parent_admin_account_id),
    profileImageUrl: text(account.profile_image_url),
    fullName: text(account.full_name),
    username: text(account.username),
    roleId: text(account.role_id),
    departmentId: text(account.department_id),
    mustChangePassword: account.must_change_password === true,
    status: text(account.status),
  };
}

function mapSession(result: RpcRecord, token: string): InternalSession {
  return {
    token,
    sessionId: text(result.session_id),
    expiresAt: text(result.expires_at),
    mustChangePassword: result.must_change_password === true,
    account: mapAccount(result.account),
    permissions: mapPermissions(result.permissions),
  };
}

function getRpcErrorMessage(data: unknown, fallback: string) {
  const record = (data ?? {}) as RpcRecord;
  return text(record.error) || fallback;
}

export function getStoredInternalSessionToken() {
  return window.sessionStorage.getItem(internalSessionStorageKey) ?? '';
}

export function storeInternalSessionToken(token: string) {
  window.sessionStorage.setItem(internalSessionStorageKey, token);
}

export function clearInternalSessionToken() {
  window.sessionStorage.removeItem(internalSessionStorageKey);
}

export function setInternalLoginNotice(message: string) {
  window.sessionStorage.setItem(internalNoticeStorageKey, message);
}

export function consumeInternalLoginNotice() {
  const message = window.sessionStorage.getItem(internalNoticeStorageKey) ?? '';
  window.sessionStorage.removeItem(internalNoticeStorageKey);
  return message;
}

export async function loadGatewayAuthContext(): Promise<GatewayAuthContext> {
  const { data, error } = await supabase.rpc('get_gateway_auth_context');
  if (error) throw new Error(error.message);

  const record = (data ?? {}) as RpcRecord;
  return {
    ok: record.ok === true,
    adminId: text(record.admin_id),
    email: text(record.email) || null,
    role: text(record.role),
    status: text(record.status),
    isSystemOwner: record.is_system_owner === true,
    requiresInternalLogin: record.requires_internal_login === true,
  };
}

export async function validateStoredInternalSession() {
  const token = getStoredInternalSessionToken();
  if (!token) return null;

  const { data, error } = await supabase.rpc('validate_internal_admin_session', {
    p_session_token: token,
  });

  if (error) {
    clearInternalSessionToken();
    throw new Error(error.message);
  }

  const record = (data ?? {}) as RpcRecord;
  if (record.valid !== true) {
    clearInternalSessionToken();
    return null;
  }

  return mapSession(record, token);
}

export async function loginInternalAdmin(username: string, password: string) {
  const { data, error } = await supabase.rpc('login_internal_admin', {
    p_username: username,
    p_password: password,
    p_user_agent: window.navigator.userAgent,
    p_device_label: window.navigator.platform || 'Browser',
  });

  if (error) throw new Error('Invalid username or password.');

  const record = (data ?? {}) as RpcRecord;
  if (record.ok !== true) {
    throw new Error(getRpcErrorMessage(data, 'Invalid username or password.'));
  }

  const token = text(record.session_token);
  if (!token) {
    clearInternalSessionToken();
    throw new Error('Internal login did not return a session token.');
  }
  storeInternalSessionToken(token);
  return mapSession(record, token);
}

export async function changeInternalAdminPassword(newPassword: string, confirmPassword: string) {
  const validation = validateAdminPassword(newPassword);
  if (!validation.isValid) {
    throw new Error('Your password does not meet the requirements.');
  }

  const token = getStoredInternalSessionToken();
  if (!token) throw new Error('Your internal session is no longer valid.');

  const { data, error } = await supabase.rpc('change_internal_admin_password', {
    p_session_token: token,
    p_new_password: newPassword,
    p_confirm_password: confirmPassword,
  });

  if (error) throw new Error(error.message);
  const record = (data ?? {}) as RpcRecord;
  if (record.ok !== true) {
    throw new Error(getRpcErrorMessage(data, 'Unable to change password.'));
  }

  clearInternalSessionToken();
  setInternalLoginNotice('Password changed. Log in again with your new password.');
}

export async function logoutInternalAdmin(options: { revokeGateway?: boolean; reason?: string } = {}) {
  const token = getStoredInternalSessionToken();
  clearInternalSessionToken();
  if (!token) return;

  const { error } = await supabase.rpc('logout_internal_admin', {
    p_session_token: token,
    p_revoke_gateway: options.revokeGateway ?? false,
    p_reason: options.reason ?? 'normal_logout',
  });

  if (error) throw new Error(error.message);
}

export function hasModulePermission(permissions: InternalPermission[], pageName: string) {
  const pageToModule: Record<string, string[]> = {
    Dashboard: ['dashboard'],
    Products: ['products'],
    Order: ['order', 'orders'],
    Sales: ['sales'],
    Accounts: ['accounts', 'account'],
    Settings: ['settings'],
  };

  const modules = pageToModule[pageName] ?? [pageName.toLowerCase()];
  return permissions.some((permission) => modules.includes(permission.moduleCode.toLowerCase()));
}

export async function loadInternalAdminLoginHistory(limit = 100): Promise<InternalLoginHistoryItem[]> {
  const { data, error } = await supabase.rpc('get_internal_admin_login_history', {
    p_limit: limit,
  });

  if (error) throw new Error(error.message);

  return ((data ?? []) as RawHistoryRow[]).map((row) => ({
    internalAdminName: text(row.internal_admin_name),
    username: text(row.username),
    eventType: text(row.event_type),
    attemptedUsername: text(row.attempted_username),
    occurredAt: text(row.occurred_at),
    deviceLabel: text(row.device_label),
    ipAddress: text(row.ip_address),
    failureReason: text(row.failure_reason),
    sessionStatus: text(row.session_status),
  }));
}
