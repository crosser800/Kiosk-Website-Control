import {
  getAdminClient,
  jsonResponse,
  methodGuard,
  normalizeEmail,
  publicAgentProfile,
} from '../_shared/agent-auth.ts';

Deno.serve(async (request) => {
  const guard = methodGuard(request);
  if (guard) return guard;

  try {
    const authorization = request.headers.get('Authorization') ?? '';
    const requesterJwt = authorization.replace(/^Bearer\s+/i, '').trim();

    if (!requesterJwt) {
      return jsonResponse(401, { error: 'No Supabase session was found.' });
    }

    const adminClient = getAdminClient();
    const { data: authUser, error: userError } = await adminClient.auth.getUser(requesterJwt);

    if (userError || !authUser.user) {
      return jsonResponse(401, { error: 'Your session has expired.' });
    }

    const { data: agents, error: agentError } = await adminClient
      .from('agent_accounts')
      .select(
        'id, auth_user_id, agent_code, full_name, company_name, contact_number, email, address, status, profile_image_url, must_change_password, activated_at, last_login_at',
      )
      .eq('auth_user_id', authUser.user.id)
      .limit(2);

    if (agentError) {
      console.error('validate-agent-session agent lookup failed', { code: agentError.code });
      return jsonResponse(500, { error: 'Unable to validate this Agent session.' });
    }

    if (!agents || agents.length === 0) {
      return jsonResponse(403, { error: 'No linked Agent account was found.' });
    }

    if (agents.length > 1) {
      return jsonResponse(409, { error: 'This Auth user is linked to multiple Agent accounts.' });
    }

    const agent = agents[0];
    if (agent.status !== 'Active') {
      return jsonResponse(403, { error: 'This Agent account is inactive. Contact your administrator.' });
    }

    if (normalizeEmail(agent.email) !== normalizeEmail(authUser.user.email)) {
      return jsonResponse(409, { error: 'This Agent account email does not match the Auth user.' });
    }

    const { data: updatedAgent, error: updateError } = await adminClient
      .from('agent_accounts')
      .update({
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id)
      .eq('auth_user_id', authUser.user.id)
      .eq('status', 'Active')
      .select(
        'id, auth_user_id, agent_code, full_name, company_name, contact_number, email, address, status, profile_image_url, must_change_password, activated_at, last_login_at',
      )
      .maybeSingle();

    if (updateError || !updatedAgent) {
      console.error('validate-agent-session touch failed', { code: updateError?.code });
      return jsonResponse(500, { error: 'Unable to refresh this Agent session.' });
    }

    return jsonResponse(200, { ok: true, agent: publicAgentProfile(updatedAgent) });
  } catch (error) {
    console.error('validate-agent-session failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return jsonResponse(500, { error: 'Unable to validate this Agent session.' });
  }
});
