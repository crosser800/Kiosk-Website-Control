import { supabase } from '../lib/supabase';

export type AgentInternalAccountStatus = 'Active' | 'Inactive' | 'Locked';

// Deliberately excludes password_hash — this type must never carry it.
export type AgentInternalAccount = {
  id: string;
  agentId: string;
  username: string;
  status: AgentInternalAccountStatus;
  mustChangePassword: boolean;
  failedLoginAttempts: number;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  lastLogoutAt: string | null;
  lastSeenAt: string | null;
  passwordChangedAt: string | null;
  passwordResetAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AgentUsernamePreviewRow = {
  agentId: string;
  agentCode: string;
  fullName: string;
  agentStatus: string;
  proposedUsername: string;
  hasInternalAccount: boolean;
  internalAccountStatus: AgentInternalAccountStatus | null;
};

export type GeneratedAgentCredential = {
  agentId: string;
  username: string;
  temporaryPassword: string;
};

function toAgentInternalAccountStatus(value: unknown): AgentInternalAccountStatus {
  return value === 'Inactive' || value === 'Locked' ? value : 'Active';
}

function toNullableIso(value: unknown): string | null {
  return value ? String(value) : null;
}

function firstRow<T>(data: T | T[] | null): T | null {
  if (Array.isArray(data)) {
    return data[0] ?? null;
  }
  return data ?? null;
}

function mapAccountRow(row: Record<string, unknown>): AgentInternalAccount {
  return {
    id: String(row.id),
    agentId: String(row.agent_id ?? ''),
    username: String(row.username ?? ''),
    status: toAgentInternalAccountStatus(row.status),
    mustChangePassword: Boolean(row.must_change_password),
    failedLoginAttempts: Number(row.failed_login_attempts ?? 0),
    lockedUntil: toNullableIso(row.locked_until),
    lastLoginAt: toNullableIso(row.last_login_at),
    lastLogoutAt: toNullableIso(row.last_logout_at),
    lastSeenAt: toNullableIso(row.last_seen_at),
    passwordChangedAt: toNullableIso(row.password_changed_at),
    passwordResetAt: toNullableIso(row.password_reset_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function getAgentInternalAccount(agentId: string): Promise<AgentInternalAccount | null> {
  const { data, error } = await supabase.rpc('get_agent_internal_account', { p_agent_id: agentId });
  if (error) throw new Error(error.message);

  const row = firstRow(data as Array<Record<string, unknown>> | null);
  if (!row || !row.id) {
    return null;
  }

  return mapAccountRow(row);
}

export async function createAgentInternalAccount(
  agentId: string,
  username?: string,
): Promise<GeneratedAgentCredential> {
  const { data, error } = await supabase.rpc('create_agent_internal_account', {
    p_agent_id: agentId,
    p_username: username?.trim() || null,
  });
  if (error) throw new Error(error.message);

  const row = firstRow(data as Array<Record<string, unknown>> | null);
  if (!row) {
    throw new Error('Unable to create the internal account.');
  }

  return {
    agentId: String(row.agent_id ?? agentId),
    username: String(row.username ?? ''),
    temporaryPassword: String(row.temporary_password ?? ''),
  };
}

export async function resetAgentInternalPassword(agentId: string): Promise<GeneratedAgentCredential> {
  const { data, error } = await supabase.rpc('reset_agent_internal_password', { p_agent_id: agentId });
  if (error) throw new Error(error.message);

  const row = firstRow(data as Array<Record<string, unknown>> | null);
  if (!row) {
    throw new Error('Unable to reset the internal password.');
  }

  return {
    agentId: String(row.agent_id ?? agentId),
    username: String(row.username ?? ''),
    temporaryPassword: String(row.temporary_password ?? ''),
  };
}

export async function updateAgentInternalAccountStatus(
  agentId: string,
  status: AgentInternalAccountStatus,
): Promise<void> {
  const { error } = await supabase.rpc('update_agent_internal_account_status', {
    p_agent_id: agentId,
    p_status: status,
  });
  if (error) throw new Error(error.message);
}

export async function previewAgentUsernames(): Promise<AgentUsernamePreviewRow[]> {
  const { data, error } = await supabase.rpc('preview_agent_usernames');
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    agentId: String(row.agent_id ?? ''),
    agentCode: String(row.agent_code ?? ''),
    fullName: String(row.full_name ?? ''),
    agentStatus: String(row.status ?? ''),
    proposedUsername: String(row.proposed_username ?? ''),
    hasInternalAccount: Boolean(row.has_internal_account),
    internalAccountStatus: row.internal_account_status
      ? toAgentInternalAccountStatus(row.internal_account_status)
      : null,
  }));
}

export async function backfillAgentInternalAccounts(): Promise<GeneratedAgentCredential[]> {
  const { data, error } = await supabase.rpc('backfill_agent_internal_accounts');
  if (error) throw new Error(error.message);

  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    agentId: String(row.agent_id ?? ''),
    username: String(row.username ?? ''),
    temporaryPassword: String(row.temporary_password ?? ''),
  }));
}
