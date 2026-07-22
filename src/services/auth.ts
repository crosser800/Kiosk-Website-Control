import { supabase } from '../lib/supabase';

type AdminAccountRow = {
  auth_user_id: string;
  role: 'admin' | 'super_admin';
  status: 'Active' | 'Inactive';
};

export type AuthAccessState =
  | { kind: 'none' }
  | { kind: 'admin' }
  | { kind: 'agent_password_change'; agentId: string }
  | { kind: 'error'; message: string };

type AgentAuthRow = {
  id: string;
  auth_user_id: string;
  status: 'Active' | 'Inactive' | 'Blocked';
  must_change_password: boolean;
};

export async function signInAdmin(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    throw new Error(error?.message ?? 'Invalid credentials.');
  }

  const accessState = await resolveAuthenticatedAccess();

  if (accessState.kind === 'admin' || accessState.kind === 'agent_password_change') {
    return accessState;
  }

  await supabase.auth.signOut();
  throw new Error(accessState.kind === 'error' ? accessState.message : 'This account is not authorized for admin access.');
}

export async function resolveAuthenticatedAccess(): Promise<AuthAccessState> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { kind: 'none' };
  }

  const { data: admin, error: adminError } = await supabase
    .from('admin_accounts')
    .select('auth_user_id, role, status')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle<AdminAccountRow>();

  if (!adminError && admin) {
    if (admin.status !== 'Active') {
      return { kind: 'error', message: 'This admin account is inactive.' };
    }

    if (admin.role !== 'admin' && admin.role !== 'super_admin') {
      return { kind: 'error', message: 'This account role is not allowed.' };
    }

    return { kind: 'admin' };
  }

  const { data: agent, error: agentError } = await supabase
    .from('agent_accounts')
    .select('id, auth_user_id, status, must_change_password')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle<AgentAuthRow>();

  if (agentError || !agent) {
    return { kind: 'error', message: 'This account is not authorized for admin access.' };
  }

  if (agent.status === 'Blocked') {
    return { kind: 'error', message: 'This agent account is blocked.' };
  }

  if (agent.status === 'Inactive') {
    return { kind: 'error', message: 'This agent account is inactive.' };
  }

  if (agent.must_change_password) {
    return { kind: 'agent_password_change', agentId: String(agent.id) };
  }

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
