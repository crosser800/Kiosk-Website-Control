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

revoke all on function public.create_internal_admin(text, text, text, text, uuid, uuid, text, text, uuid[]) from public;
grant execute on function public.create_internal_admin(text, text, text, text, uuid, uuid, text, text, uuid[]) to authenticated;
