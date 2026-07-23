import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export type AgentAccount = {
  id: string;
  auth_user_id: string | null;
  agent_code: string | null;
  full_name: string | null;
  company_name: string | null;
  contact_number: string | null;
  email: string | null;
  address: string | null;
  status: string | null;
  profile_image_url?: string | null;
  must_change_password?: boolean | null;
  activated_at?: string | null;
  last_login_at?: string | null;
};

export type AuthUserListItem = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
};

export function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function getAdminClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Agent auth service is not configured.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function readPayload<T>(request: Request): Promise<T> {
  return (await request.json().catch(() => ({}))) as T;
}

export function methodGuard(request: Request) {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  return null;
}

export async function findAgentRowsByEmail(adminClient: ReturnType<typeof getAdminClient>, email: string) {
  const { data, error } = await adminClient
    .from('agent_accounts')
    .select(
      'id, auth_user_id, agent_code, full_name, company_name, contact_number, email, address, status, profile_image_url, must_change_password, activated_at, last_login_at',
    )
    .ilike('email', email);

  if (error) throw error;
  return (data ?? []) as AgentAccount[];
}

export async function findAuthUserByEmail(adminClient: ReturnType<typeof getAdminClient>, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers();
  if (error) throw error;

  return ((data?.users ?? []) as AuthUserListItem[]).find(
    (user) => normalizeEmail(user.email) === email,
  ) ?? null;
}

export async function authUserExists(adminClient: ReturnType<typeof getAdminClient>, authUserId: string) {
  const { data, error } = await adminClient.auth.admin.getUserById(authUserId);
  return !error && Boolean(data?.user);
}

export function publicAgentProfile(agent: AgentAccount) {
  return {
    id: agent.id,
    auth_user_id: agent.auth_user_id,
    agent_code: agent.agent_code,
    full_name: agent.full_name,
    company_name: agent.company_name,
    contact_number: agent.contact_number,
    email: agent.email,
    address: agent.address,
    status: agent.status,
    profile_image_url: agent.profile_image_url ?? null,
    must_change_password: agent.must_change_password ?? false,
    activated_at: agent.activated_at ?? null,
    last_login_at: agent.last_login_at ?? null,
  };
}
