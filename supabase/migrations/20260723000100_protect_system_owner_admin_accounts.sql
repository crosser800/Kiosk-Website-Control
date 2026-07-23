alter table public.admin_accounts
add column if not exists is_system_owner boolean not null default false;

create index if not exists admin_accounts_is_system_owner_idx
on public.admin_accounts using btree (is_system_owner);

create or replace function public.current_admin_can_manage_accounts()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_accounts admin_account
    where admin_account.auth_user_id = auth.uid()
      and admin_account.status = 'Active'
      and (
        admin_account.is_system_owner = true
        or lower(coalesce(admin_account.role, '')) in (
          'admin',
          'super_admin',
          'developer',
          'system_owner'
        )
      )
  );
$$;

revoke all on function public.current_admin_can_manage_accounts() from public;
grant execute on function public.current_admin_can_manage_accounts() to authenticated;

with primary_admin as (
  select id
  from public.admin_accounts
  order by
    case
      when lower(coalesce(role, '')) in ('developer', 'system_owner', 'super_admin') then 0
      else 1
    end,
    created_at nulls last,
    id
  limit 1
)
update public.admin_accounts
set is_system_owner = true
where id in (select id from primary_admin)
  and not exists (
    select 1
    from public.admin_accounts
    where is_system_owner = true
  );

create or replace function public.protect_system_owner_admin_accounts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.is_system_owner is distinct from old.is_system_owner
      and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Only service role can change system owner protection.';
    end if;

    if coalesce(auth.role(), '') <> 'service_role' then
      if new.auth_user_id is distinct from old.auth_user_id
        or new.admin_code is distinct from old.admin_code
        or new.role is distinct from old.role then
        raise exception 'Admin account identity and role cannot be modified from the client.';
      end if;

      if old.is_system_owner and new.status is distinct from old.status then
        raise exception 'Protected system owner account status cannot be modified.';
      end if;
    end if;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.is_system_owner and coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Protected system owner accounts cannot be deleted.';
    end if;

    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists protect_system_owner_admin_accounts on public.admin_accounts;

create trigger protect_system_owner_admin_accounts
before update or delete on public.admin_accounts
for each row
execute function public.protect_system_owner_admin_accounts();

create or replace function public.protect_system_owner_admin_role_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_admin_id public.admin_accounts.id%type;
  target_is_owner boolean;
begin
  target_admin_id := coalesce(new.admin_account_id, old.admin_account_id);

  select admin_account.is_system_owner
  into target_is_owner
  from public.admin_accounts admin_account
  where admin_account.id = target_admin_id;

  if coalesce(target_is_owner, false) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Protected system owner role assignments cannot be modified.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_system_owner_admin_role_links on public.admin_account_roles;

create trigger protect_system_owner_admin_role_links
before insert or update or delete on public.admin_account_roles
for each row
execute function public.protect_system_owner_admin_role_links();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_accounts'
      and policyname = 'Active admins can read admin accounts'
  ) then
    execute 'create policy "Active admins can read admin accounts" on public.admin_accounts for select to authenticated using (public.current_admin_can_manage_accounts())';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_accounts'
      and policyname = 'Admins can update own profile'
  ) then
    execute 'create policy "Admins can update own profile" on public.admin_accounts for update to authenticated using (auth_user_id = auth.uid()) with check (auth_user_id = auth.uid())';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_accounts'
      and policyname = 'Active admins can update non-system admins'
  ) then
    execute 'create policy "Active admins can update non-system admins" on public.admin_accounts for update to authenticated using (public.current_admin_can_manage_accounts() and is_system_owner = false) with check (public.current_admin_can_manage_accounts() and is_system_owner = false)';
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_account_roles'
      and policyname = 'Active admins can read admin role links'
  ) then
    execute 'create policy "Active admins can read admin role links" on public.admin_account_roles for select to authenticated using (public.current_admin_can_manage_accounts())';
  end if;
end;
$$;
