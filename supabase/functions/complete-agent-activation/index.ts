import {
  findAgentRowsByEmail,
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
      return jsonResponse(401, { error: 'Your verification session is missing.' });
    }

    const adminClient = getAdminClient();
    const { data: authUser, error: userError } = await adminClient.auth.getUser(requesterJwt);

    if (userError || !authUser.user) {
      return jsonResponse(401, { error: 'Your verification session has expired.' });
    }

    const email = normalizeEmail(authUser.user.email);
    if (!email) {
      return jsonResponse(400, { error: 'Your verified email could not be read.' });
    }

    const agents = await findAgentRowsByEmail(adminClient, email);
    if (agents.length === 0) {
      return jsonResponse(403, { error: 'No Agent account was found for this verified email.' });
    }

    if (agents.length > 1) {
      return jsonResponse(409, { error: 'This Agent email needs administrator cleanup.' });
    }

    const agent = agents[0];

    if (agent.status !== 'Active') {
      return jsonResponse(403, { error: 'This Agent account is inactive. Contact your administrator.' });
    }

    if (agent.auth_user_id && agent.auth_user_id !== authUser.user.id) {
      return jsonResponse(409, { error: 'This Agent account is linked to a different Auth user.' });
    }

    const { data: conflictingAgents, error: conflictError } = await adminClient
      .from('agent_accounts')
      .select('id')
      .eq('auth_user_id', authUser.user.id)
      .neq('id', agent.id)
      .limit(1);

    if (conflictError) {
      console.error('complete-agent-activation conflict lookup failed', { code: conflictError.code });
      return jsonResponse(500, { error: 'Unable to verify this Agent link.' });
    }

    if ((conflictingAgents ?? []).length > 0) {
      return jsonResponse(409, { error: 'This Auth user is already linked to another Agent.' });
    }

    const { data: updatedAgent, error: updateError } = await adminClient
      .from('agent_accounts')
      .update({
        auth_user_id: authUser.user.id,
        activated_at: agent.activated_at ?? new Date().toISOString(),
        last_login_at: new Date().toISOString(),
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id)
      .or(`auth_user_id.is.null,auth_user_id.eq.${authUser.user.id}`)
      .eq('status', 'Active')
      .select(
        'id, auth_user_id, agent_code, full_name, company_name, contact_number, email, address, status, profile_image_url, must_change_password, activated_at, last_login_at',
      )
      .maybeSingle();

    if (updateError || !updatedAgent) {
      console.error('complete-agent-activation link update failed', { code: updateError?.code });
      return jsonResponse(500, { error: 'Unable to link this Agent account.' });
    }

    return jsonResponse(200, { ok: true, agent: publicAgentProfile(updatedAgent) });
  } catch (error) {
    console.error('complete-agent-activation failed', {
      message: error instanceof Error ? error.message : 'unknown',
    });
    return jsonResponse(500, { error: 'Unable to complete Agent activation.' });
  }
});
