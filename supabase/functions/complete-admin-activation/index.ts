import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type PendingAdmin = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  status: string | null;
  is_system_owner: boolean | null;
};

type RoleLink = {
  admin_account_id: string | null;
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

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse(500, { error: 'Activation service is not configured.' });
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const requesterJwt = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!requesterJwt) {
    return jsonResponse(401, { error: 'Your verification session is missing.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { data: authUser, error: userError } = await adminClient.auth.getUser(requesterJwt);

    if (userError || !authUser.user) {
      return jsonResponse(401, { error: 'Your verification session has expired.' });
    }

    const userEmail = normalizeEmail(authUser.user.email);

    if (!userEmail) {
      return jsonResponse(400, { error: 'Your verified email could not be read.' });
    }

    const { data: pendingAdmin, error: adminError } = await adminClient
      .from('admin_accounts')
      .select('id, auth_user_id, email, status, is_system_owner')
      .ilike('email', userEmail)
      .limit(1)
      .maybeSingle<PendingAdmin>();

    if (adminError) {
      console.error('complete-admin-activation admin lookup failed', { code: adminError.code });
      return jsonResponse(500, { error: 'Unable to load the pending admin account.' });
    }

    if (!pendingAdmin) {
      return jsonResponse(403, { error: 'This verified email is not eligible for admin activation.' });
    }

    if (normalizeEmail(pendingAdmin.email) !== userEmail) {
      return jsonResponse(403, { error: 'This verified email is not eligible for admin activation.' });
    }

    if (pendingAdmin.status !== 'Active') {
      return jsonResponse(403, { error: 'This admin account is not active.' });
    }

    if (pendingAdmin.is_system_owner) {
      return jsonResponse(403, { error: 'This admin account cannot be activated through this flow.' });
    }

    if (pendingAdmin.auth_user_id) {
      if (pendingAdmin.auth_user_id === authUser.user.id) {
        return jsonResponse(200, { ok: true });
      }

      return jsonResponse(409, { error: 'This admin account has already been activated.' });
    }

    const { data: roleLinks, error: roleError } = await adminClient
      .from('admin_account_roles')
      .select('admin_account_id')
      .eq('admin_account_id', pendingAdmin.id)
      .limit(1);

    if (roleError) {
      console.error('complete-admin-activation role lookup failed', {
        adminId: pendingAdmin.id,
        code: roleError.code,
      });
      return jsonResponse(500, { error: 'Unable to verify this admin account role.' });
    }

    if (((roleLinks ?? []) as RoleLink[]).length === 0) {
      return jsonResponse(500, { error: 'This admin account is missing a role assignment.' });
    }

    const { data: updatedAdmin, error: updateError } = await adminClient
      .from('admin_accounts')
      .update({ auth_user_id: authUser.user.id })
      .eq('id', pendingAdmin.id)
      .is('auth_user_id', null)
      .eq('status', 'Active')
      .select('id')
      .maybeSingle<{ id: string }>();

    if (updateError) {
      console.error('complete-admin-activation link update failed', {
        adminId: pendingAdmin.id,
        code: updateError.code,
      });
      return jsonResponse(500, { error: 'Unable to link this admin account.' });
    }

    if (!updatedAdmin) {
      return jsonResponse(409, { error: 'This admin account was already activated. Please sign in.' });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error('complete-admin-activation unexpected failure', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return jsonResponse(500, { error: 'Unable to complete admin activation.' });
  }
});
