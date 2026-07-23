import { supabase } from '../lib/supabase';

type AdminAccountRow = {
  id: string;
  auth_user_id: string;
  role: string | null;
  status: string | null;
  is_system_owner: boolean | null;
};

type AdminRoleLinkRow = {
  admin_roles: { role_name: string | null } | { role_name: string | null }[] | null;
};

export type AuthAccessState =
  | { kind: 'none' }
  | {
      kind: 'admin';
      email: string | null;
      role: 'admin' | 'super_admin';
    }
  | { kind: 'agent_password_change'; agentId: string }
  | { kind: 'error'; message: string };

type AgentAuthRow = {
  id: string;
  auth_user_id: string;
  status: 'Active' | 'Inactive' | 'Blocked';
  must_change_password: boolean;
};

const allowedAdminRoles = new Set(['admin', 'super_admin', 'developer', 'system_owner']);

function logAuthRejection(reason: string, context: Record<string, unknown> = {}) {
  if (import.meta.env.DEV) {
    console.info('[auth] access rejected:', reason, context);
  }
}

function normalizeRole(value: string | null | undefined) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeStatus(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function isTruthyDatabaseFlag(value: unknown) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

async function loadLinkedAdminRoles(adminId: string) {
  const { data, error } = await supabase
    .from('admin_account_roles')
    .select('admin_roles(role_name)')
    .eq('admin_account_id', adminId);

  if (error) {
    console.error('Admin role links failed to load', error);
    return [];
  }

  return ((data ?? []) as AdminRoleLinkRow[])
    .map((row) => {
      const roleRef = Array.isArray(row.admin_roles) ? row.admin_roles[0] : row.admin_roles;
      return normalizeRole(roleRef?.role_name);
    })
    .filter(Boolean);
}

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Invalid credentials.');
  }

  const accessState = await resolveAuthenticatedAccess();

  if (accessState.kind === 'admin' || accessState.kind === 'agent_password_change') {
    return accessState;
  }

  logAuthRejection('post-password authorization failed', {
    accessKind: accessState.kind,
    message: accessState.kind === 'error' ? accessState.message : undefined,
  });
  throw new Error(accessState.kind === 'error' ? accessState.message : 'This account is not authorized for admin access.');
}

export async function resolveAuthenticatedAccess(): Promise<AuthAccessState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { kind: 'none' };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_accounts')
    .select('id, auth_user_id, role, status, is_system_owner')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle<AdminAccountRow>();

  if (adminError) {
    logAuthRejection('admin account lookup failed', {
      authUserId: userData.user.id,
      code: adminError.code,
      message: adminError.message,
    });
    return { kind: 'error', message: 'Unable to verify admin access. Please try again.' };
  }

  if (admin) {
    const adminStatus = normalizeStatus(admin.status);
    const legacyRole = normalizeRole(admin.role);
    const isSystemOwner = isTruthyDatabaseFlag(admin.is_system_owner);

    if (import.meta.env.DEV) {
      console.info('[auth] matched admin account', {
        adminId: admin.id,
        authUserId: admin.auth_user_id,
        status: admin.status,
        normalizedStatus: adminStatus,
        legacyRole,
        isSystemOwner,
      });
    }

    if (adminStatus === 'blocked') {
      logAuthRejection('admin account blocked', {
        adminId: admin.id,
        status: admin.status,
      });
      return { kind: 'error', message: 'This admin account is blocked.' };
    }

    if (adminStatus !== 'active') {
      logAuthRejection('admin account not active', {
        adminId: admin.id,
        status: admin.status,
      });
      return { kind: 'error', message: 'This admin account is inactive.' };
    }

    if (isSystemOwner) {
      return {
        kind: 'admin',
        email: userData.user.email ?? null,
        role: 'super_admin',
      };
    }

    const linkedRoles = await loadLinkedAdminRoles(String(admin.id));
    const roleCandidates =
      linkedRoles.length > 0
        ? Array.from(new Set([...linkedRoles, legacyRole].filter(Boolean)))
        : legacyRole === 'super_admin'
          ? [legacyRole]
          : [];
    const hasAllowedRole = roleCandidates.some((role) => allowedAdminRoles.has(role));

    if (!hasAllowedRole) {
      logAuthRejection('admin role not allowed', {
        adminId: admin.id,
        legacyRole,
        linkedRoles,
      });
      return { kind: 'error', message: 'This account role is not allowed.' };
    }

    const appRole =
      roleCandidates.includes('super_admin') ||
      roleCandidates.includes('system_owner') ||
      roleCandidates.includes('developer')
        ? 'super_admin'
        : 'admin';

    return {
      kind: 'admin',
      email: userData.user.email ?? null,
      role: appRole,
    };
  }

  const { data: agent, error: agentError } = await supabase
    .from('agent_accounts')
    .select('id, auth_user_id, status, must_change_password')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle<AgentAuthRow>();

  if (agentError) {
    logAuthRejection('agent account lookup failed', {
      authUserId: userData.user.id,
      code: agentError.code,
      message: agentError.message,
    });
    return { kind: 'error', message: 'Unable to verify account access. Please try again.' };
  }

  if (!agent) {
    logAuthRejection('no admin or agent account matched auth user', {
      authUserId: userData.user.id,
      email: userData.user.email ?? null,
    });
    return { kind: 'error', message: 'This account is not authorized for admin access.' };
  }

  const agentStatus = normalizeStatus(agent.status);

  if (agentStatus === 'blocked') {
    logAuthRejection('agent account blocked', { agentId: agent.id });
    return { kind: 'error', message: 'This agent account is blocked.' };
  }

  if (agentStatus === 'inactive') {
    logAuthRejection('agent account inactive', { agentId: agent.id });
    return { kind: 'error', message: 'This agent account is inactive.' };
  }

  if (agent.must_change_password) {
    return { kind: 'agent_password_change', agentId: String(agent.id) };
  }

  logAuthRejection('agent account has no admin-app access', { agentId: agent.id });
  return { kind: 'error', message: 'This account is not authorized for admin access.' };
}

export async function completeRequiredPasswordChange(newPassword: string) {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('Your session is no longer active. Please sign in again.');
  }

  const { error: passwordError } = await supabase.auth.updateUser({ password: newPassword });

  if (passwordError) {
    throw new Error(passwordError.message);
  }

  const { error: flagError } = await supabase
    .from('agent_accounts')
    .update({ must_change_password: false })
    .eq('auth_user_id', userData.user.id)
    .eq('must_change_password', true);

  if (flagError) {
    throw new Error(
      'Your password was updated, but the password-change requirement could not be cleared. Please retry.',
    );
  }
}

export async function signOutAdmin() {
  await supabase.auth.signOut();
}
