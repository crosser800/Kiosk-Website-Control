create or replace function public.pre_register_admin(
  p_full_name text,
  p_email text,
  p_contact_number text default null,
  p_department_id uuid default null,
  p_status text default 'Active'
)
returns public.admin_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  requester record;
  normalized_email text;
  normalized_status text;
  selected_department_id uuid;
  selected_department_name text;
  default_admin_role_id uuid;
  created_admin public.admin_accounts%rowtype;
begin
  normalized_email := lower(trim(coalesce(p_email, '')));
  normalized_status := case
    when lower(trim(coalesce(p_status, 'Active'))) = 'inactive' then 'Inactive'
    else 'Active'
  end;

  if auth.uid() is null then
    raise exception 'Your account is not authorized to create administrators.';
  end if;

  select
    admin_account.id,
    admin_account.role,
    admin_account.status,
    admin_account.is_system_owner,
    exists (
      select 1
      from public.admin_account_roles role_link
      join public.admin_roles admin_role on admin_role.id = role_link.admin_role_id
      where role_link.admin_account_id = admin_account.id
        and lower(regexp_replace(coalesce(admin_role.role_name, ''), '[\s-]+', '_', 'g')) in ('super_admin', 'system_owner')
    ) as has_super_admin_role
  into requester
  from public.admin_accounts admin_account
  where admin_account.auth_user_id = auth.uid()
    and admin_account.status = 'Active'
  limit 1;

  if requester.id is null
    or (
      requester.is_system_owner is not true
      and lower(regexp_replace(coalesce(requester.role, ''), '[\s-]+', '_', 'g')) not in ('super_admin', 'system_owner')
      and requester.has_super_admin_role is not true
    )
  then
    raise exception 'Your account is not authorized to create administrators.';
  end if;

  if trim(coalesce(p_full_name, '')) = '' then
    raise exception 'Full name is required.';
  end if;

  if normalized_email = '' or normalized_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid email address is required.';
  end if;

  if exists (
    select 1
    from public.admin_accounts admin_account
    where lower(trim(coalesce(admin_account.email, ''))) = normalized_email
  ) then
    raise exception 'An administrator with this email already exists.';
  end if;

  if p_department_id is not null then
    select department.id, department.name
    into selected_department_id, selected_department_name
    from public.admin_departments department
    where department.id = p_department_id
      and department.is_active = true
    limit 1;

    if selected_department_id is null then
      raise exception 'The selected department does not exist.';
    end if;
  end if;

  select admin_role.id
  into default_admin_role_id
  from public.admin_roles admin_role
  where lower(regexp_replace(coalesce(admin_role.role_name, ''), '[\s-]+', '_', 'g')) = 'admin'
  limit 1;

  if default_admin_role_id is null then
    raise exception 'The default Admin role is not configured.';
  end if;

  insert into public.admin_accounts (
    auth_user_id,
    full_name,
    email,
    contact_number,
    department_id,
    department,
    role,
    status,
    is_system_owner
  )
  values (
    null,
    trim(p_full_name),
    normalized_email,
    nullif(trim(coalesce(p_contact_number, '')), ''),
    p_department_id,
    selected_department_name,
    'admin',
    normalized_status,
    false
  )
  returning * into created_admin;

  insert into public.admin_account_roles (
    admin_account_id,
    admin_role_id
  )
  values (
    created_admin.id,
    default_admin_role_id
  );

  return created_admin;
exception
  when others then
    raise exception '%', sqlerrm;
end;
$$;

revoke all on function public.pre_register_admin(text, text, text, uuid, text) from public;
grant execute on function public.pre_register_admin(text, text, text, uuid, text) to authenticated;
