import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.106.2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type ResetRequest = {
  agent_id?: string;
  auth_user_id?: string;
};

type AdminAccount = {
  role: string | null;
  status: string | null;
};

type AgentAccount = {
  id: string;
  auth_user_id: string | null;
  status: string | null;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
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
    return jsonResponse(500, { error: 'Password reset service is not configured.' });
  }

  const authorization = request.headers.get('Authorization') ?? '';
  const requesterJwt = authorization.replace(/^Bearer\s+/i, '').trim();

  if (!requesterJwt) {
    return jsonResponse(401, { error: 'Missing admin authorization.' });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { data: requester, error: requesterError } = await adminClient.auth.getUser(requesterJwt);

    if (requesterError || !requester.user) {
      return jsonResponse(401, { error: 'Invalid admin authorization.' });
    }

    const { data: adminAccount, error: adminError } = await adminClient
      .from('admin_accounts')
      .select('role, status')
      .eq('auth_user_id', requester.user.id)
      .maybeSingle<AdminAccount>();

    if (adminError) {
      console.error('reset-agent-password admin lookup failed', {
        requesterId: requester.user.id,
        code: adminError.code,
      });
      return jsonResponse(500, { error: 'Unable to verify admin authorization.' });
    }

    const isAuthorizedAdmin =
      adminAccount?.status === 'Active' &&
      (adminAccount.role === 'admin' || adminAccount.role === 'super_admin');

    if (!isAuthorizedAdmin) {
      return jsonResponse(403, { error: 'You are not authorized to reset agent passwords.' });
    }

    const payload = (await request.json().catch(() => ({}))) as ResetRequest;
    const agentId = String(payload.agent_id ?? '').trim();
    const authUserId = String(payload.auth_user_id ?? '').trim();

    if (!agentId && !authUserId) {
      return jsonResponse(400, { error: 'Missing target agent.' });
    }

    let query = adminClient
      .from('agent_accounts')
      .select('id, auth_user_id, status');

    query = agentId ? query.eq('id', agentId) : query.eq('auth_user_id', authUserId);

    const { data: agentAccount, error: agentError } = await query.maybeSingle<AgentAccount>();

    if (agentError) {
      console.error('reset-agent-password target lookup failed', {
        agentId,
        authUserIdProvided: Boolean(authUserId),
        code: agentError.code,
      });
      return jsonResponse(500, { error: 'Unable to load target agent.' });
    }

    if (!agentAccount) {
      return jsonResponse(404, { error: 'Target agent was not found.' });
    }

    if (!agentAccount.auth_user_id) {
      return jsonResponse(400, { error: 'This agent is not connected to an authentication account.' });
    }

    const { error: updateUserError } = await adminClient.auth.admin.updateUserById(
      agentAccount.auth_user_id,
      { password: 'password' },
    );

    if (updateUserError) {
      console.error('reset-agent-password auth update failed', {
        agentId: agentAccount.id,
        authUserId: agentAccount.auth_user_id,
        name: updateUserError.name,
      });
      return jsonResponse(502, { error: 'Unable to reset the target Auth user password.' });
    }

    let sessionRevocation: 'attempted' | 'not_supported' = 'not_supported';

    try {
      const revokeResponse = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${agentAccount.auth_user_id}/logout`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
        },
      );

      if (revokeResponse.ok) {
        sessionRevocation = 'attempted';
      } else {
        console.warn('reset-agent-password session revoke endpoint unavailable', {
          agentId: agentAccount.id,
          status: revokeResponse.status,
        });
      }
    } catch (revokeError) {
      console.warn('reset-agent-password session revoke failed', {
        agentId: agentAccount.id,
        message: revokeError instanceof Error ? revokeError.message : 'unknown',
      });
    }

    const { error: flagError } = await adminClient
      .from('agent_accounts')
      .update({
        must_change_password: true,
        password_reset_at: new Date().toISOString(),
      })
      .eq('id', agentAccount.id);

    if (flagError) {
      console.error('reset-agent-password flag update failed', {
        agentId: agentAccount.id,
        code: flagError.code,
      });
      return jsonResponse(500, { error: 'Password was reset, but the agent reset flags could not be updated.' });
    }

    return jsonResponse(200, {
      ok: true,
      sessionRevocation,
    });
  } catch (error) {
    console.error('reset-agent-password unexpected failure', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return jsonResponse(500, { error: 'Unable to complete password reset.' });
  }
});
