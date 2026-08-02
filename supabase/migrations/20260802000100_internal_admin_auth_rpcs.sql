create extension if not exists pgcrypto;

create or replace function public.internal_admin_token_hash(p_session_token text)
returns text
language sql
stable
set search_path = public
as $$
  select encode(digest(coalesce(p_session_token, ''), 'sha256'), 'hex')
$$;

create or replace function public.current_gateway_admin()
returns public.admin_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admin_accounts%rowtype;
begin
  select *
  into v_admin
  from public.admin_accounts
  where auth_user_id = auth.uid()
  limit 1;

  return v_admin;
end;
$$;

create or replace function public.gateway_requires_internal_login(p_admin public.admin_accounts)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  v_access_mode text := '';
begin
  if p_admin.id is null then
    return false;
  end if;

  if coalesce(p_admin.is_system_owner, false) then
    return false;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'admin_accounts'
      and column_name = 'access_mode'
  ) then
    execute 'select coalesce(access_mode::text, '''') from public.admin_accounts where id = $1'
    into v_access_mode
    using p_admin.id;

    if lower(v_access_mode) in ('operations', 'shared', 'internal', 'internal_login', 'requires_internal_login') then
      return true;
    end if;
  end if;

  return lower(coalesce(p_admin.role, '')) in ('operations', 'shared', 'gateway', 'internal_gateway')
    or lower(coalesce(p_admin.email, '')) like '%operations%';
end;
$$;

create or replace function public.get_gateway_auth_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admin_accounts%rowtype;
begin
  v_admin := public.current_gateway_admin();

  if v_admin.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  return jsonb_build_object(
    'ok', true,
    'admin_id', v_admin.id,
    'email', v_admin.email,
    'full_name', v_admin.full_name,
    'role', v_admin.role,
    'status', v_admin.status,
    'is_system_owner', coalesce(v_admin.is_system_owner, false),
    'requires_internal_login', public.gateway_requires_internal_login(v_admin)
  );
end;
$$;

create or replace function public.internal_admin_permissions_json(p_internal_admin_id uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', permission.id,
        'module_code', permission.module_code,
        'permission_code', permission.permission_code,
        'permission_name', permission.permission_name,
        'description', permission.description,
        'sort_order', permission.sort_order
      )
      order by permission.module_code, permission.sort_order, permission.permission_code
    ),
    '[]'::jsonb
  )
  from public.internal_admin_permissions link
  join public.admin_permissions permission on permission.id = link.permission_id
  where link.internal_admin_account_id = p_internal_admin_id
$$;

create or replace function public.internal_admin_profile_json(p_internal_admin public.internal_admin_accounts)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'id', p_internal_admin.id,
    'parent_admin_account_id', p_internal_admin.parent_admin_account_id,
    'profile_image_url', p_internal_admin.profile_image_url,
    'full_name', p_internal_admin.full_name,
    'username', p_internal_admin.username,
    'role_id', p_internal_admin.role_id,
    'department_id', p_internal_admin.department_id,
    'must_change_password', p_internal_admin.must_change_password,
    'status', p_internal_admin.status,
    'last_login_at', p_internal_admin.last_login_at,
    'last_logout_at', p_internal_admin.last_logout_at,
    'last_seen_at', p_internal_admin.last_seen_at
  )
$$;

create or replace function public.record_internal_admin_history(
  p_parent_admin_account_id uuid,
  p_internal_admin_account_id uuid,
  p_attempted_username text,
  p_event_type text,
  p_failure_reason text default null,
  p_user_agent text default null,
  p_device_label text default null,
  p_session_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.internal_admin_login_history (
    parent_admin_account_id,
    internal_admin_account_id,
    attempted_username,
    event_type,
    failure_reason,
    ip_address,
    user_agent,
    device_label,
    session_id,
    metadata
  )
  values (
    p_parent_admin_account_id,
    p_internal_admin_account_id,
    nullif(trim(coalesce(p_attempted_username, '')), ''),
    p_event_type,
    nullif(trim(coalesce(p_failure_reason, '')), ''),
    inet_client_addr(),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    p_session_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

create or replace function public.validate_internal_admin_session(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gateway public.admin_accounts%rowtype;
  v_session public.internal_admin_sessions%rowtype;
  v_internal public.internal_admin_accounts%rowtype;
begin
  v_gateway := public.current_gateway_admin();

  if v_gateway.id is null or coalesce(v_gateway.status, '') <> 'Active' then
    return jsonb_build_object('valid', false);
  end if;

  select *
  into v_session
  from public.internal_admin_sessions
  where session_token_hash = public.internal_admin_token_hash(p_session_token)
    and parent_admin_account_id = v_gateway.id
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('valid', false);
  end if;

  if v_session.status <> 'Active' then
    return jsonb_build_object('valid', false, 'session_status', v_session.status);
  end if;

  if v_session.expires_at <= now() then
    update public.internal_admin_sessions
    set status = 'Expired',
        logged_out_at = now()
    where id = v_session.id
      and status = 'Active';

    perform public.record_internal_admin_history(
      v_session.parent_admin_account_id,
      v_session.internal_admin_account_id,
      null,
      'session_expired',
      null,
      v_session.user_agent,
      v_session.device_label,
      v_session.id
    );

    return jsonb_build_object('valid', false, 'session_status', 'Expired');
  end if;

  select *
  into v_internal
  from public.internal_admin_accounts
  where id = v_session.internal_admin_account_id
    and parent_admin_account_id = v_gateway.id
  limit 1;

  if v_internal.id is null or v_internal.status <> 'Active' then
    return jsonb_build_object('valid', false);
  end if;

  update public.internal_admin_sessions
  set last_activity_at = now()
  where id = v_session.id;

  update public.internal_admin_accounts
  set last_seen_at = now()
  where id = v_internal.id;

  return jsonb_build_object(
    'valid', true,
    'session_id', v_session.id,
    'expires_at', v_session.expires_at,
    'must_change_password', coalesce(v_internal.must_change_password, false),
    'account', public.internal_admin_profile_json(v_internal),
    'permissions', public.internal_admin_permissions_json(v_internal.id)
  );
end;
$$;

create or replace function public.login_internal_admin(
  p_username text,
  p_password text,
  p_user_agent text default null,
  p_device_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gateway public.admin_accounts%rowtype;
  v_internal public.internal_admin_accounts%rowtype;
  v_username text := lower(trim(coalesce(p_username, '')));
  v_token text;
  v_session_id uuid;
  v_expires_at timestamptz := now() + interval '12 hours';
  v_failure_reason text := 'invalid_credentials';
begin
  v_gateway := public.current_gateway_admin();

  if v_gateway.id is null or coalesce(v_gateway.status, '') <> 'Active' or not public.gateway_requires_internal_login(v_gateway) then
    return jsonb_build_object('ok', false, 'error', 'Invalid username or password.');
  end if;

  select *
  into v_internal
  from public.internal_admin_accounts
  where parent_admin_account_id = v_gateway.id
    and lower(username) = v_username
  limit 1;

  if v_internal.id is null then
    perform public.record_internal_admin_history(v_gateway.id, null, v_username, 'login_failed', v_failure_reason, p_user_agent, p_device_label);
    return jsonb_build_object('ok', false, 'error', 'Invalid username or password.');
  end if;

  if v_internal.status <> 'Active' then
    v_failure_reason := 'inactive';
  elsif v_internal.locked_until is not null and v_internal.locked_until > now() then
    v_failure_reason := 'locked';
  elsif v_internal.password_hash is null or crypt(coalesce(p_password, ''), v_internal.password_hash) <> v_internal.password_hash then
    v_failure_reason := 'invalid_credentials';
  else
    v_failure_reason := '';
  end if;

  if v_failure_reason <> '' then
    if v_failure_reason = 'invalid_credentials' then
      update public.internal_admin_accounts
      set failed_login_attempts = coalesce(failed_login_attempts, 0) + 1,
          locked_until = case
            when coalesce(failed_login_attempts, 0) + 1 >= 5 then now() + interval '15 minutes'
            else locked_until
          end
      where id = v_internal.id;
    end if;

    perform public.record_internal_admin_history(v_gateway.id, v_internal.id, v_username, 'login_failed', v_failure_reason, p_user_agent, p_device_label);
    return jsonb_build_object('ok', false, 'error', 'Invalid username or password.');
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.internal_admin_sessions (
    parent_admin_account_id,
    internal_admin_account_id,
    session_token_hash,
    status,
    ip_address,
    user_agent,
    device_label,
    logged_in_at,
    last_activity_at,
    expires_at
  )
  values (
    v_gateway.id,
    v_internal.id,
    public.internal_admin_token_hash(v_token),
    'Active',
    inet_client_addr(),
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    now(),
    now(),
    v_expires_at
  )
  returning id into v_session_id;

  update public.internal_admin_accounts
  set failed_login_attempts = 0,
      locked_until = null,
      last_login_at = now(),
      last_seen_at = now()
  where id = v_internal.id
  returning * into v_internal;

  perform public.record_internal_admin_history(v_gateway.id, v_internal.id, v_username, 'login_success', null, p_user_agent, p_device_label, v_session_id);

  if coalesce(v_internal.must_change_password, false) then
    perform public.record_internal_admin_history(v_gateway.id, v_internal.id, v_username, 'password_change_required', null, p_user_agent, p_device_label, v_session_id);
  end if;

  return jsonb_build_object(
    'ok', true,
    'session_token', v_token,
    'session_id', v_session_id,
    'expires_at', v_expires_at,
    'must_change_password', coalesce(v_internal.must_change_password, false),
    'account', public.internal_admin_profile_json(v_internal),
    'permissions', public.internal_admin_permissions_json(v_internal.id)
  );
end;
$$;

create or replace function public.change_internal_admin_password(
  p_session_token text,
  p_new_password text,
  p_confirm_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validation jsonb;
  v_internal_id uuid;
  v_session_id uuid;
  v_internal public.internal_admin_accounts%rowtype;
begin
  if coalesce(p_new_password, '') <> coalesce(p_confirm_password, '') then
    return jsonb_build_object('ok', false, 'error', 'Passwords must match.');
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Password must be at least 8 characters.');
  end if;

  v_validation := public.validate_internal_admin_session(p_session_token);
  if not coalesce((v_validation->>'valid')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'Your internal session is no longer valid.');
  end if;

  v_internal_id := (v_validation #>> '{account,id}')::uuid;
  v_session_id := (v_validation->>'session_id')::uuid;

  select * into v_internal from public.internal_admin_accounts where id = v_internal_id;

  if not coalesce(v_internal.must_change_password, false) then
    return jsonb_build_object('ok', false, 'error', 'Password change is not required.');
  end if;

  if v_internal.password_hash is not null and crypt(p_new_password, v_internal.password_hash) = v_internal.password_hash then
    return jsonb_build_object('ok', false, 'error', 'New password must be different from the temporary password.');
  end if;

  update public.internal_admin_accounts
  set password_hash = crypt(p_new_password, gen_salt('bf')),
      must_change_password = false,
      password_changed_at = now(),
      last_logout_at = now()
  where id = v_internal_id;

  update public.internal_admin_sessions
  set status = 'Revoked',
      revoked_at = now(),
      revoke_reason = 'password_changed'
  where id = v_session_id;

  perform public.record_internal_admin_history(v_internal.parent_admin_account_id, v_internal.id, v_internal.username, 'password_changed', null, null, null, v_session_id);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.logout_internal_admin(
  p_session_token text,
  p_revoke_gateway boolean default false,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gateway public.admin_accounts%rowtype;
  v_session public.internal_admin_sessions%rowtype;
begin
  v_gateway := public.current_gateway_admin();

  if v_gateway.id is null then
    return jsonb_build_object('ok', true);
  end if;

  select *
  into v_session
  from public.internal_admin_sessions
  where session_token_hash = public.internal_admin_token_hash(p_session_token)
    and parent_admin_account_id = v_gateway.id
    and status = 'Active'
  limit 1;

  if v_session.id is null then
    return jsonb_build_object('ok', true);
  end if;

  update public.internal_admin_sessions
  set status = case when p_revoke_gateway then 'Revoked' else 'LoggedOut' end,
      logged_out_at = case when not p_revoke_gateway then now() else logged_out_at end,
      revoked_at = case when p_revoke_gateway then now() else revoked_at end,
      revoke_reason = case when p_revoke_gateway then coalesce(p_reason, 'gateway_logout') else revoke_reason end
  where id = v_session.id;

  update public.internal_admin_accounts
  set last_logout_at = now()
  where id = v_session.internal_admin_account_id;

  perform public.record_internal_admin_history(
    v_session.parent_admin_account_id,
    v_session.internal_admin_account_id,
    null,
    case when p_revoke_gateway then 'session_revoked' else 'logout' end,
    null,
    v_session.user_agent,
    v_session.device_label,
    v_session.id,
    jsonb_build_object('reason', coalesce(p_reason, 'normal_logout'))
  );

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.internal_admin_has_account_permission(
  p_internal_admin_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.internal_admin_permissions link
    join public.admin_permissions permission on permission.id = link.permission_id
    where link.internal_admin_account_id = p_internal_admin_id
      and lower(permission.module_code) in ('accounts', 'account', 'settings')
      and lower(permission.permission_code) in ('manage', 'write', 'create', 'update', 'reset_password', 'admin')
  )
$$;

create or replace function public.create_internal_admin(
  p_session_token text,
  p_profile_image_url text,
  p_full_name text,
  p_username text,
  p_role_id uuid,
  p_department_id uuid,
  p_temporary_password text,
  p_status text,
  p_permission_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validation jsonb;
  v_gateway_id uuid;
  v_actor_internal_id uuid;
  v_created_id uuid;
  v_permission_id uuid;
  v_username text := lower(trim(coalesce(p_username, '')));
begin
  v_validation := public.validate_internal_admin_session(p_session_token);
  if not coalesce((v_validation->>'valid')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'Your internal session is no longer valid.');
  end if;

  v_gateway_id := (v_validation #>> '{account,parent_admin_account_id}')::uuid;
  v_actor_internal_id := (v_validation #>> '{account,id}')::uuid;

  if not public.internal_admin_has_account_permission(v_actor_internal_id) then
    return jsonb_build_object('ok', false, 'error', 'You are not authorized to manage internal admins.');
  end if;

  if nullif(trim(coalesce(p_full_name, '')), '') is null or v_username = '' or length(coalesce(p_temporary_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Complete all required internal admin fields.');
  end if;

  if exists (
    select 1 from public.internal_admin_accounts
    where parent_admin_account_id = v_gateway_id
      and lower(username) = v_username
  ) then
    return jsonb_build_object('ok', false, 'error', 'Username already exists under this gateway account.');
  end if;

  insert into public.internal_admin_accounts (
    parent_admin_account_id,
    profile_image_url,
    full_name,
    username,
    role_id,
    department_id,
    password_hash,
    must_change_password,
    status,
    failed_login_attempts,
    created_by_admin_account_id
  )
  values (
    v_gateway_id,
    nullif(trim(coalesce(p_profile_image_url, '')), ''),
    trim(p_full_name),
    v_username,
    p_role_id,
    p_department_id,
    crypt(p_temporary_password, gen_salt('bf')),
    true,
    case when p_status in ('Active', 'Inactive', 'Locked') then p_status else 'Active' end,
    0,
    v_gateway_id
  )
  returning id into v_created_id;

  foreach v_permission_id in array coalesce(p_permission_ids, '{}'::uuid[])
  loop
    insert into public.internal_admin_permissions (
      internal_admin_account_id,
      permission_id,
      granted_by_admin_account_id,
      granted_by_internal_admin_id
    )
    values (v_created_id, v_permission_id, v_gateway_id, v_actor_internal_id)
    on conflict do nothing;
  end loop;

  return jsonb_build_object('ok', true, 'internal_admin_id', v_created_id);
end;
$$;

create or replace function public.reset_internal_admin_password(
  p_session_token text,
  p_internal_admin_id uuid,
  p_temporary_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_validation jsonb;
  v_gateway_id uuid;
  v_actor_internal_id uuid;
  v_target public.internal_admin_accounts%rowtype;
  v_session public.internal_admin_sessions%rowtype;
begin
  v_validation := public.validate_internal_admin_session(p_session_token);
  if not coalesce((v_validation->>'valid')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'Your internal session is no longer valid.');
  end if;

  v_gateway_id := (v_validation #>> '{account,parent_admin_account_id}')::uuid;
  v_actor_internal_id := (v_validation #>> '{account,id}')::uuid;

  if not public.internal_admin_has_account_permission(v_actor_internal_id) then
    return jsonb_build_object('ok', false, 'error', 'You are not authorized to reset internal admin passwords.');
  end if;

  if length(coalesce(p_temporary_password, '')) < 8 then
    return jsonb_build_object('ok', false, 'error', 'Temporary password must be at least 8 characters.');
  end if;

  select * into v_target
  from public.internal_admin_accounts
  where id = p_internal_admin_id
    and parent_admin_account_id = v_gateway_id;

  if v_target.id is null then
    return jsonb_build_object('ok', false, 'error', 'Internal admin was not found.');
  end if;

  update public.internal_admin_accounts
  set password_hash = crypt(p_temporary_password, gen_salt('bf')),
      must_change_password = true,
      password_changed_at = null,
      password_reset_at = now(),
      password_reset_by_admin_account_id = v_gateway_id
  where id = v_target.id;

  for v_session in
    select * from public.internal_admin_sessions
    where internal_admin_account_id = v_target.id
      and status = 'Active'
  loop
    update public.internal_admin_sessions
    set status = 'Revoked',
        revoked_at = now(),
        revoke_reason = 'password_reset'
    where id = v_session.id;

    perform public.record_internal_admin_history(v_session.parent_admin_account_id, v_session.internal_admin_account_id, null, 'session_revoked', null, v_session.user_agent, v_session.device_label, v_session.id, jsonb_build_object('reason', 'password_reset'));
  end loop;

  perform public.record_internal_admin_history(v_gateway_id, v_target.id, v_target.username, 'password_reset', null, null, null, null);

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.get_internal_admin_login_history(p_limit integer default 100)
returns table (
  internal_admin_name text,
  username text,
  event_type text,
  attempted_username text,
  occurred_at timestamptz,
  device_label text,
  ip_address inet,
  failure_reason text,
  session_status text
)
language sql
security definer
set search_path = public
as $$
  select
    account.full_name,
    account.username,
    history.event_type,
    history.attempted_username,
    history.occurred_at,
    history.device_label,
    history.ip_address,
    history.failure_reason,
    session.status
  from public.internal_admin_login_history history
  left join public.internal_admin_accounts account on account.id = history.internal_admin_account_id
  left join public.internal_admin_sessions session on session.id = history.session_id
  where history.parent_admin_account_id = (public.current_gateway_admin()).id
  order by history.occurred_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

revoke all on function public.internal_admin_token_hash(text) from public;
revoke all on function public.current_gateway_admin() from public;
revoke all on function public.gateway_requires_internal_login(public.admin_accounts) from public;
revoke all on function public.get_gateway_auth_context() from public;
revoke all on function public.validate_internal_admin_session(text) from public;
revoke all on function public.login_internal_admin(text, text, text, text) from public;
revoke all on function public.change_internal_admin_password(text, text, text) from public;
revoke all on function public.logout_internal_admin(text, boolean, text) from public;
revoke all on function public.create_internal_admin(text, text, text, text, uuid, uuid, text, text, uuid[]) from public;
revoke all on function public.reset_internal_admin_password(text, uuid, text) from public;
revoke all on function public.get_internal_admin_login_history(integer) from public;

grant execute on function public.get_gateway_auth_context() to authenticated;
grant execute on function public.validate_internal_admin_session(text) to authenticated;
grant execute on function public.login_internal_admin(text, text, text, text) to authenticated;
grant execute on function public.change_internal_admin_password(text, text, text) to authenticated;
grant execute on function public.logout_internal_admin(text, boolean, text) to authenticated;
grant execute on function public.create_internal_admin(text, text, text, text, uuid, uuid, text, text, uuid[]) to authenticated;
grant execute on function public.reset_internal_admin_password(text, uuid, text) to authenticated;
grant execute on function public.get_internal_admin_login_history(integer) to authenticated;
