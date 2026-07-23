import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ActivationRequest = {
  email?: string;
};

type AdminAccount = {
  full_name: string | null;
  auth_user_id: string | null;
  status: string | null;
  is_system_owner: boolean | null;
};

type AuthUserListItem = {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
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

function logStep(step: string, context: Record<string, unknown> = {}) {
  console.info('start-admin-activation', { step, ...context });
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

  const payload = (await request.json().catch(() => ({}))) as ActivationRequest;
  const email = normalizeEmail(payload.email);

  if (!isValidEmail(email)) {
    return jsonResponse(400, { error: 'This account is unavailable or the email could not be verified.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await adminClient
    .from('admin_accounts')
    .select('full_name, auth_user_id, status, is_system_owner')
    .ilike('email', email)
    .limit(1)
    .maybeSingle<AdminAccount>();

  if (error) {
    console.error('start-admin-activation lookup failed', { code: error.code });
    return jsonResponse(500, { error: 'Unable to verify this account right now.' });
  }

  const isEligible =
    data?.status === 'Active' &&
    !data.auth_user_id &&
    data.is_system_owner !== true;

  logStep('pending admin eligibility result', {
    found: Boolean(data),
    eligible: Boolean(isEligible),
    status: data?.status ?? null,
    hasAuthUser: Boolean(data?.auth_user_id),
    isSystemOwner: Boolean(data?.is_system_owner),
  });

  if (!isEligible) {
    return jsonResponse(403, { error: 'This account is unavailable or the email could not be verified.' });
  }

  const { error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      full_name: data.full_name ?? undefined,
    },
  });

  logStep('auth user creation result', {
    created: !createUserError,
    emailPreConfirmed: true,
    errorName: createUserError?.name,
    errorMessage: createUserError?.message,
  });

  if (createUserError) {
    const duplicateUser =
      createUserError.message.toLowerCase().includes('already') ||
      createUserError.message.toLowerCase().includes('registered');

    if (duplicateUser) {
      const { data: userList, error: listUsersError } = await adminClient.auth.admin.listUsers();
      const existingUser = (userList?.users ?? []).find(
        (user: AuthUserListItem) => normalizeEmail(user.email) === email,
      );

      logStep('duplicate auth user lookup result', {
        found: Boolean(existingUser),
        alreadyConfirmed: Boolean(existingUser?.email_confirmed_at),
        errorName: listUsersError?.name,
        errorMessage: listUsersError?.message,
      });

      if (listUsersError || !existingUser) {
        console.error('start-admin-activation duplicate auth lookup failed', {
          name: listUsersError?.name,
        });
        return jsonResponse(500, { error: 'Unable to prepare email verification.' });
      }

      if (!existingUser.email_confirmed_at) {
        const { error: updateUserError } = await adminClient.auth.admin.updateUserById(
          existingUser.id,
          { email_confirm: true },
        );

        logStep('auth user confirmation repair result', {
          confirmed: !updateUserError,
          emailPreConfirmed: true,
          errorName: updateUserError?.name,
          errorMessage: updateUserError?.message,
        });

        if (updateUserError) {
          console.error('start-admin-activation auth confirm repair failed', {
            name: updateUserError.name,
          });
          return jsonResponse(500, { error: 'Unable to prepare email verification.' });
        }
      }
    } else {
      console.error('start-admin-activation auth precreate failed', {
        name: createUserError.name,
      });
      return jsonResponse(500, { error: 'Unable to prepare email verification.' });
    }
  }

  return jsonResponse(200, { ok: true });
});
