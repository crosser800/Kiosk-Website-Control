import {
  findAgentRowsByEmail,
  findAuthUserByEmail,
  getAdminClient,
  isValidEmail,
  jsonResponse,
  methodGuard,
  normalizeEmail,
  readPayload,
} from '../_shared/agent-auth.ts';

type ActivationRequest = {
  email?: string;
};

Deno.serve(async (request) => {
  const guard = methodGuard(request);
  if (guard) return guard;

  try {
    const payload = await readPayload<ActivationRequest>(request);
    const email = normalizeEmail(payload.email);

    if (!isValidEmail(email)) {
      return jsonResponse(400, { error: 'No Agent account was found for this email.' });
    }

    const adminClient = getAdminClient();
    const agents = await findAgentRowsByEmail(adminClient, email);

    if (agents.length === 0) {
      return jsonResponse(404, { error: 'No Agent account was found for this email.' });
    }

    if (agents.length > 1) {
      return jsonResponse(409, {
        error: 'This Agent email needs administrator cleanup before activation.',
        code: 'DUPLICATE_AGENT_EMAIL',
      });
    }

    const agent = agents[0];

    if (agent.status !== 'Active') {
      return jsonResponse(403, { error: 'This Agent account is inactive. Contact your administrator.' });
    }

    if (agent.auth_user_id) {
      return jsonResponse(409, { error: 'This Agent account is already activated.' });
    }

    const existingAuthUser = await findAuthUserByEmail(adminClient, email);

    if (existingAuthUser) {
      const { data: linkedAgents, error: linkedError } = await adminClient
        .from('agent_accounts')
        .select('id')
        .eq('auth_user_id', existingAuthUser.id)
        .limit(2);

      if (linkedError) {
        console.error('start-agent-activation linked lookup failed', { code: linkedError.code });
        return jsonResponse(500, { error: 'Unable to prepare Agent activation.' });
      }

      if ((linkedAgents ?? []).length > 0) {
        return jsonResponse(409, {
          error: 'This email is already linked to another Agent account.',
          code: 'AUTH_USER_ALREADY_LINKED',
        });
      }

      if (!existingAuthUser.email_confirmed_at) {
        const { error: confirmError } = await adminClient.auth.admin.updateUserById(
          existingAuthUser.id,
          { email_confirm: true },
        );

        if (confirmError) {
          console.error('start-agent-activation auth confirm repair failed', {
            name: confirmError.name,
          });
          return jsonResponse(500, { error: 'Unable to prepare Agent activation.' });
        }
      }

      return jsonResponse(200, { ok: true });
    }

    const { error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: agent.full_name ?? undefined,
        account_type: 'agent',
      },
    });

    if (createUserError) {
      console.error('start-agent-activation auth precreate failed', {
        name: createUserError.name,
        message: createUserError.message,
      });
      return jsonResponse(500, { error: 'Unable to prepare Agent activation.' });
    }

    return jsonResponse(200, { ok: true });
  } catch (error) {
    console.error('start-agent-activation failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return jsonResponse(500, { error: 'Unable to prepare Agent activation.' });
  }
});
