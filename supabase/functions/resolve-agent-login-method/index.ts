import {
  authUserExists,
  findAgentRowsByEmail,
  findAuthUserByEmail,
  getAdminClient,
  isValidEmail,
  jsonResponse,
  methodGuard,
  normalizeEmail,
  readPayload,
} from '../_shared/agent-auth.ts';

type ResolveRequest = {
  email?: string;
};

function methodResponse(method: string, extra: Record<string, unknown> = {}) {
  return jsonResponse(200, { method, ...extra });
}

Deno.serve(async (request) => {
  const guard = methodGuard(request);
  if (guard) return guard;

  try {
    const payload = await readPayload<ResolveRequest>(request);
    const email = normalizeEmail(payload.email);

    if (!isValidEmail(email)) {
      return methodResponse('not_found');
    }

    const adminClient = getAdminClient();
    const agents = await findAgentRowsByEmail(adminClient, email);

    if (agents.length === 0) {
      return methodResponse('not_found');
    }

    if (agents.length > 1) {
      return methodResponse('repair_required', { reason: 'duplicate_agent_email' });
    }

    const agent = agents[0];
    const status = String(agent.status ?? '').trim();

    if (status === 'Inactive') {
      return methodResponse('inactive');
    }

    if (status === 'Blocked') {
      return methodResponse('inactive', { reason: 'blocked' });
    }

    if (status !== 'Active') {
      return methodResponse('inactive', { reason: 'unsupported_status' });
    }

    if (agent.auth_user_id) {
      const exists = await authUserExists(adminClient, agent.auth_user_id);
      if (!exists) {
        return methodResponse('repair_required', { reason: 'broken_auth_link' });
      }

      const authUser = await adminClient.auth.admin.getUserById(agent.auth_user_id);
      if (normalizeEmail(authUser.data.user?.email) !== email) {
        return methodResponse('repair_required', { reason: 'auth_email_mismatch' });
      }

      return methodResponse('password_login');
    }

    const existingAuthUser = await findAuthUserByEmail(adminClient, email);
    if (!existingAuthUser) {
      return methodResponse('activation_required');
    }

    const { data: linkedAgents, error: linkedError } = await adminClient
      .from('agent_accounts')
      .select('id')
      .eq('auth_user_id', existingAuthUser.id)
      .limit(2);

    if (linkedError) {
      console.error('resolve-agent-login-method linked lookup failed', { code: linkedError.code });
      return methodResponse('repair_required', { reason: 'link_lookup_failed' });
    }

    if ((linkedAgents ?? []).length > 0) {
      return methodResponse('repair_required', { reason: 'auth_user_already_linked' });
    }

    return methodResponse('activation_required', { reason: 'matching_auth_user_exists' });
  } catch (error) {
    console.error('resolve-agent-login-method failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return methodResponse('repair_required', { reason: 'unexpected_error' });
  }
});
