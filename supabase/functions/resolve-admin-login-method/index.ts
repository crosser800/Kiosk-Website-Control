import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResolveRequest = {
  email?: string;
};

type AdminAccount = {
  auth_user_id: string | null;
  status: string | null;
  is_system_owner: boolean | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { method: 'unavailable' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(200, { method: 'unavailable' });
  }

  const payload = (await request.json().catch(() => ({}))) as ResolveRequest;
  const email = normalizeEmail(payload.email);

  if (!isValidEmail(email)) {
    return jsonResponse(200, { method: 'unavailable' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await adminClient
    .from('admin_accounts')
    .select('auth_user_id, status, is_system_owner')
    .ilike('email', email)
    .limit(1)
    .maybeSingle<AdminAccount>();

  if (error) {
    console.error('resolve-admin-login-method lookup failed', { code: error.code });
    return jsonResponse(200, { method: 'unavailable' });
  }

  if (!data) {
    return jsonResponse(200, { method: 'unavailable', reason: 'not_found' });
  }

  if (data.status !== 'Active') {
    return jsonResponse(200, { method: 'unavailable', reason: 'inactive' });
  }

  if (data.auth_user_id) {
    return jsonResponse(200, { method: 'password' });
  }

  if (data.is_system_owner) {
    return jsonResponse(200, { method: 'unavailable' });
  }

  return jsonResponse(200, { method: 'activation' });
});
