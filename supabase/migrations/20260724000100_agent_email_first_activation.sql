-- Agent email-first activation hardening.
--
-- This migration is intentionally defensive: it audits existing live data before
-- adding uniqueness/FK constraints that would otherwise fail or mask cleanup work.

begin;

alter table public.agent_accounts
  add column if not exists activated_at timestamptz null;

alter table public.agent_accounts
  add column if not exists last_login_at timestamptz null;

create or replace function public.normalize_agent_email(p_email text)
returns text
language sql
immutable
parallel safe
as $$
  select lower(trim(coalesce(p_email, '')));
$$;

create or replace function public.audit_agent_auth_readiness()
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  with normalized_agents as (
    select
      aa.id,
      public.normalize_agent_email(aa.email) as normalized_email,
      aa.auth_user_id,
      aa.status
    from public.agent_accounts aa
  ),
  duplicate_emails as (
    select normalized_email, count(*) as row_count
    from normalized_agents
    where nullif(normalized_email, '') is not null
    group by normalized_email
    having count(*) > 1
  ),
  duplicate_auth_users as (
    select auth_user_id, count(*) as row_count
    from normalized_agents
    where auth_user_id is not null
    group by auth_user_id
    having count(*) > 1
  ),
  broken_links as (
    select na.id, na.auth_user_id
    from normalized_agents na
    left join auth.users au on au.id = na.auth_user_id
    where na.auth_user_id is not null
      and au.id is null
  ),
  active_unlinked as (
    select na.id
    from normalized_agents na
    where lower(trim(coalesce(na.status, ''))) = 'active'
      and na.auth_user_id is null
  ),
  active_unlinked_with_auth_email as (
    select na.id
    from normalized_agents na
    join auth.users au on lower(trim(coalesce(au.email, ''))) = na.normalized_email
    where lower(trim(coalesce(na.status, ''))) = 'active'
      and na.auth_user_id is null
      and nullif(na.normalized_email, '') is not null
  )
  select jsonb_build_object(
    'linked_agents', (
      select count(*) from normalized_agents where auth_user_id is not null
    ),
    'active_agents_requiring_activation', (
      select count(*) from active_unlinked
    ),
    'active_unlinked_agents_with_matching_auth_email', (
      select count(*) from active_unlinked_with_auth_email
    ),
    'duplicate_agent_email_count', (
      select count(*) from duplicate_emails
    ),
    'duplicate_auth_user_id_count', (
      select count(*) from duplicate_auth_users
    ),
    'broken_auth_link_count', (
      select count(*) from broken_links
    ),
    'auth_user_id_foreign_key_exists', exists (
      select 1
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_schema = tc.constraint_schema
       and kcu.constraint_name = tc.constraint_name
       and kcu.table_schema = tc.table_schema
       and kcu.table_name = tc.table_name
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_schema = tc.constraint_schema
       and ccu.constraint_name = tc.constraint_name
      where tc.table_schema = 'public'
        and tc.table_name = 'agent_accounts'
        and tc.constraint_type = 'FOREIGN KEY'
        and kcu.column_name = 'auth_user_id'
        and ccu.table_schema = 'auth'
        and ccu.table_name = 'users'
        and ccu.column_name = 'id'
    ),
    'normalized_email_unique_index_exists', exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'agent_accounts'
        and indexname = 'agent_accounts_normalized_email_unique_idx'
    ),
    'auth_user_id_unique_index_exists', exists (
      select 1
      from pg_indexes
      where schemaname = 'public'
        and tablename = 'agent_accounts'
        and indexname = 'agent_accounts_auth_user_id_unique_idx'
    ),
    'rls_enabled', coalesce((
      select c.relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = 'agent_accounts'
    ), false),
    'identity_protection_trigger_exists', exists (
      select 1
      from information_schema.triggers
      where event_object_schema = 'public'
        and event_object_table = 'agent_accounts'
        and trigger_name = 'trg_protect_agent_account_identity'
    ),
    'agent_activation_functions_exist', jsonb_build_object(
      'resolve_agent_login_method', to_regprocedure('public.resolve_agent_login_method(text)') is not null,
      'complete_agent_activation', to_regprocedure('public.complete_agent_activation()') is not null
    ),
    'reusable_otp_table_exists', false
  )
  into v_result;

  return v_result;
end;
$$;

do $$
declare
  v_audit jsonb := public.audit_agent_auth_readiness();
begin
  if (v_audit ->> 'duplicate_agent_email_count')::integer > 0 then
    raise exception 'Agent auth migration stopped: duplicate normalized agent emails exist. Run select public.audit_agent_auth_readiness(); and clean duplicate agent_accounts.email rows first.';
  end if;

  if (v_audit ->> 'duplicate_auth_user_id_count')::integer > 0 then
    raise exception 'Agent auth migration stopped: duplicate agent_accounts.auth_user_id values exist. Run select public.audit_agent_auth_readiness(); and clean duplicate links first.';
  end if;

  if (v_audit ->> 'broken_auth_link_count')::integer > 0 then
    raise exception 'Agent auth migration stopped: agent_accounts.auth_user_id contains missing auth.users references. Repair broken links before adding the FK.';
  end if;
end $$;

create unique index if not exists agent_accounts_normalized_email_unique_idx
  on public.agent_accounts (public.normalize_agent_email(email))
  where nullif(trim(coalesce(email, '')), '') is not null;

create unique index if not exists agent_accounts_auth_user_id_unique_idx
  on public.agent_accounts (auth_user_id)
  where auth_user_id is not null;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
     and kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
     and kcu.table_name = tc.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = tc.constraint_schema
     and ccu.constraint_name = tc.constraint_name
    where tc.table_schema = 'public'
      and tc.table_name = 'agent_accounts'
      and tc.constraint_type = 'FOREIGN KEY'
      and kcu.column_name = 'auth_user_id'
      and ccu.table_schema = 'auth'
      and ccu.table_name = 'users'
      and ccu.column_name = 'id'
  ) then
    alter table public.agent_accounts
      add constraint agent_accounts_auth_user_id_fkey
      foreign key (auth_user_id)
      references auth.users(id)
      on delete restrict;
  end if;
end $$;

create or replace function public.agent_activation_context_is_allowed()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    or coalesce(current_setting('app.agent_activation_link', true), '') = 'on';
end;
$$;

create or replace function public.protect_agent_account_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' and not public.agent_activation_context_is_allowed() then
    if new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Agent Auth identity can only be changed by the activation service.' using errcode = '42501';
    end if;

    if new.activated_at is distinct from old.activated_at then
      raise exception 'Agent activation state can only be changed by the activation service.' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_agent_account_identity on public.agent_accounts;

create trigger trg_protect_agent_account_identity
before update on public.agent_accounts
for each row
execute function public.protect_agent_account_identity();

create or replace function public.complete_agent_activation()
returns public.agent_accounts
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_auth_email text := public.normalize_agent_email(auth.jwt() ->> 'email');
  v_agent public.agent_accounts%rowtype;
begin
  if v_auth_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if nullif(v_auth_email, '') is null then
    raise exception 'Authenticated email is missing.' using errcode = '22023';
  end if;

  select *
    into v_agent
  from public.agent_accounts aa
  where public.normalize_agent_email(aa.email) = v_auth_email
  limit 1
  for update;

  if not found then
    raise exception 'No Agent account was found for this verified email.' using errcode = 'P0002';
  end if;

  if coalesce(v_agent.status, '') <> 'Active' then
    raise exception 'This Agent account is not active.' using errcode = '42501';
  end if;

  if v_agent.auth_user_id is not null and v_agent.auth_user_id <> v_auth_user_id then
    raise exception 'This Agent account is linked to a different Auth user.' using errcode = '23505';
  end if;

  perform set_config('app.agent_activation_link', 'on', true);

  update public.agent_accounts aa
  set auth_user_id = coalesce(aa.auth_user_id, v_auth_user_id),
      activated_at = coalesce(aa.activated_at, now()),
      last_login_at = now(),
      must_change_password = false,
      updated_at = now()
  where aa.id = v_agent.id
    and (aa.auth_user_id is null or aa.auth_user_id = v_auth_user_id)
    and aa.status = 'Active'
  returning * into v_agent;

  if v_agent.id is null then
    raise exception 'Unable to link this Agent account.' using errcode = '40001';
  end if;

  return v_agent;
end;
$$;

revoke all on function public.audit_agent_auth_readiness() from public, anon;
revoke all on function public.complete_agent_activation() from public, anon;
grant execute on function public.audit_agent_auth_readiness() to authenticated, service_role;
grant execute on function public.complete_agent_activation() to authenticated, service_role;

commit;
