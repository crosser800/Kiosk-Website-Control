-- Internal (non-Supabase-Auth) username/password accounts for agents.
--
-- Scope: ADMIN SIDE ONLY. This migration creates the storage and the
-- admin-facing RPCs to create/reset/preview agent internal credentials. It
-- deliberately does NOT create anything a kiosk/agent-facing login would use
-- (no session table, no login/validate/logout RPCs) — that is future work,
-- once the kiosk login flow is actually being built. See the "NOT included"
-- note at the bottom of this file.
--
-- Existing agent Supabase Auth material (agent_accounts.auth_user_id,
-- auth.users rows, the agent activation Edge Functions, and migration
-- 20260724000100_agent_email_first_activation.sql) is left completely
-- untouched by this migration. This new system is an additive, parallel path
-- — nothing here reads, writes, or depends on auth.users.
--
-- Follows the same proven pattern already used for internal_admin_accounts
-- (see 20260802000100_internal_admin_auth_rpcs.sql): pgcrypto bcrypt hashing
-- via crypt()/gen_salt('bf'), a status + lockout/must-change-password shape,
-- and admin-gated security-definer RPCs. Reuses the EXISTING admin
-- authorization check (public.current_admin_can_manage_accounts(), from
-- 20260723000100_protect_system_owner_admin_accounts.sql) rather than
-- inventing a new one — the admin performing these actions is still
-- authenticated the normal (Supabase Auth) way; only the AGENT's own
-- credentials are being taken off Supabase Auth.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Table
-- ============================================================
create table if not exists public.agent_internal_accounts (
  id uuid primary key default gen_random_uuid(),

  agent_id uuid not null
    references public.agent_accounts(id)
    on delete cascade,

  username text not null,
  -- Mirrors the app's existing username normalization convention
  -- (accounts.ts normalizeUsername/validateUsername): trim + lowercase.
  normalized_username text generated always as (lower(trim(username))) stored,

  password_hash text not null,

  status text not null default 'Active',

  must_change_password boolean not null default true,
  failed_login_attempts integer not null default 0,
  locked_until timestamptz null,

  last_login_at timestamptz null,
  password_changed_at timestamptz null,
  password_reset_at timestamptz null,
  password_reset_by_admin_account_id uuid null references public.admin_accounts(id) on delete set null,
  created_by_admin_account_id uuid null references public.admin_accounts(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint agent_internal_accounts_status_check
    check (status = any (array['Active'::text, 'Inactive'::text, 'Locked'::text]))
);

comment on table public.agent_internal_accounts is
  'Internal username/password_hash login for agents, independent of Supabase Auth. One row per agent (v1 — enforced by the unique index on agent_id). Created/managed only by admins via the security-definer RPCs in this migration. password_hash must never be selected by frontend code; RLS below denies all direct REST access so every read/write goes through a gated RPC.';

comment on column public.agent_internal_accounts.password_hash is
  'bcrypt hash via pgcrypto crypt(password, gen_salt(''bf'')). Never plaintext. Never returned by any RPC.';

create unique index if not exists agent_internal_accounts_agent_id_unique_idx
  on public.agent_internal_accounts (agent_id);

create unique index if not exists agent_internal_accounts_normalized_username_unique_idx
  on public.agent_internal_accounts (normalized_username);

create index if not exists agent_internal_accounts_status_idx
  on public.agent_internal_accounts (status);

-- Deny all direct REST access (no policies defined) — every read/write must
-- go through a security-definer RPC below, which bypasses RLS as the
-- function owner. This is stricter than the existing internal_admin_accounts
-- table (which has no RLS at all) and is a deliberate hardening for this new
-- table given it stores password_hash.
alter table public.agent_internal_accounts enable row level security;

-- ============================================================
-- 2. Username generation (shared by preview, create, and backfill so the
--    preview is always a trustworthy prediction of what create will do)
-- ============================================================
create or replace function public.normalize_agent_username_base(p_full_name text)
returns text
language sql
immutable
as $$
  select nullif(regexp_replace(lower(trim(coalesce(p_full_name, ''))), '[^a-z0-9]+', '', 'g'), '')
$$;

comment on function public.normalize_agent_username_base(text) is
  'Lowercases, trims, and strips everything but a-z0-9 from a full name. Returns null if nothing is left (e.g. blank name), so callers can fall back to a default base.';

create or replace function public.generate_agent_username(
  p_full_name text,
  p_exclude_account_id uuid default null
)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_base text;
  v_candidate text;
  v_suffix integer := 1;
begin
  v_base := coalesce(public.normalize_agent_username_base(p_full_name), 'agent');
  v_candidate := v_base;

  while exists (
    select 1
    from public.agent_internal_accounts
    where normalized_username = v_candidate
      and (p_exclude_account_id is null or id <> p_exclude_account_id)
  ) loop
    v_suffix := v_suffix + 1;
    v_candidate := v_base || v_suffix::text;
  end loop;

  return v_candidate;
end;
$$;

comment on function public.generate_agent_username(text, uuid) is
  'Deterministic, collision-safe username candidate from a full name: base name, then base2, base3, ... against CURRENT agent_internal_accounts rows. Used by preview_agent_usernames(), create_agent_internal_account(), and backfill_agent_internal_accounts() so all three agree. Not fully race-safe under concurrent admins (a real INSERT still re-checks via the unique index) — acceptable for this admin-only, low-concurrency tool.';

revoke all on function public.normalize_agent_username_base(text) from public;
grant execute on function public.normalize_agent_username_base(text) to authenticated;
revoke all on function public.generate_agent_username(text, uuid) from public;
grant execute on function public.generate_agent_username(text, uuid) to authenticated;

-- ============================================================
-- 3. Secure temporary password generation (server-side only, never derived
--    from agent name/username/agent_code, never persisted in plaintext)
-- ============================================================
create or replace function public.generate_agent_temporary_password(p_length integer default 14)
returns text
language plpgsql
volatile
as $$
declare
  -- Excludes visually-ambiguous characters (0/O, 1/l/I) on purpose.
  v_charset text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#%';
  v_result text := '';
  v_len integer := greatest(12, least(coalesce(p_length, 14), 16));
  i integer;
begin
  for i in 1..v_len loop
    v_result := v_result || substr(v_charset, 1 + (get_byte(gen_random_bytes(1), 0) % length(v_charset)), 1);
  end loop;
  return v_result;
end;
$$;

comment on function public.generate_agent_temporary_password(integer) is
  'Cryptographically random temporary password (pgcrypto gen_random_bytes per character), clamped to 12-16 chars. Returned once by create/reset RPCs, hashed immediately, never stored or logged in plaintext.';

revoke all on function public.generate_agent_temporary_password(integer) from public;
grant execute on function public.generate_agent_temporary_password(integer) to authenticated;

-- ============================================================
-- 4. Admin-facing RPCs
-- ============================================================

-- Read-only: candidate/actual username + account status for every Active
-- agent. Never generates or persists anything.
create or replace function public.preview_agent_usernames()
returns table (
  agent_id uuid,
  agent_code text,
  full_name text,
  status text,
  proposed_username text,
  has_internal_account boolean,
  existing_username text,
  internal_account_status text
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_admin_can_manage_accounts() then
    raise exception 'Your account is not authorized to view agent internal accounts.';
  end if;

  return query
  select
    agent.id as agent_id,
    agent.agent_code,
    agent.full_name,
    agent.status,
    coalesce(existing.username, public.generate_agent_username(agent.full_name)) as proposed_username,
    existing.id is not null as has_internal_account,
    existing.username as existing_username,
    existing.status as internal_account_status
  from public.agent_accounts agent
  left join public.agent_internal_accounts existing on existing.agent_id = agent.id
  where agent.status = 'Active'
  order by agent.full_name asc;
end;
$$;

revoke all on function public.preview_agent_usernames() from public;
grant execute on function public.preview_agent_usernames() to authenticated;

-- Single-agent status lookup (no password_hash) for the Agent Profile panel.
create or replace function public.get_agent_internal_account(p_agent_id uuid)
returns table (
  id uuid,
  username text,
  status text,
  must_change_password boolean,
  last_login_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.current_admin_can_manage_accounts() then
    raise exception 'Your account is not authorized to view agent internal accounts.';
  end if;

  return query
  select account.id, account.username, account.status, account.must_change_password,
         account.last_login_at, account.created_at
  from public.agent_internal_accounts account
  where account.agent_id = p_agent_id;
end;
$$;

revoke all on function public.get_agent_internal_account(uuid) from public;
grant execute on function public.get_agent_internal_account(uuid) to authenticated;

-- Create: username defaults to auto-generated-from-full_name when omitted;
-- an explicitly supplied username is normalized/validated/uniqueness-checked.
create or replace function public.create_agent_internal_account(
  p_agent_id uuid,
  p_username text default null
)
returns table (
  agent_id uuid,
  username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent public.agent_accounts%rowtype;
  v_actor_admin_id uuid;
  v_username text;
  v_temp_password text;
begin
  if not public.current_admin_can_manage_accounts() then
    raise exception 'Your account is not authorized to create agent internal accounts.';
  end if;

  select admin_account.id into v_actor_admin_id
  from public.admin_accounts admin_account
  where admin_account.auth_user_id = auth.uid()
    and admin_account.status = 'Active'
  limit 1;

  select * into v_agent from public.agent_accounts where id = p_agent_id;
  if v_agent.id is null then
    raise exception 'Agent was not found.';
  end if;

  if exists (select 1 from public.agent_internal_accounts where agent_id = p_agent_id) then
    raise exception 'This agent already has an internal account. Use reset password instead.';
  end if;

  if nullif(trim(coalesce(p_username, '')), '') is null then
    v_username := public.generate_agent_username(v_agent.full_name);
  else
    v_username := lower(trim(p_username));
    if v_username !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' then
      raise exception 'Username may only contain lowercase letters, numbers, and single separators (. _ -).';
    end if;
    if exists (select 1 from public.agent_internal_accounts where normalized_username = v_username) then
      raise exception 'This username is already taken.';
    end if;
  end if;

  v_temp_password := public.generate_agent_temporary_password();

  insert into public.agent_internal_accounts (
    agent_id, username, password_hash, status, must_change_password, created_by_admin_account_id
  )
  values (
    p_agent_id, v_username, crypt(v_temp_password, gen_salt('bf')), 'Active', true, v_actor_admin_id
  );

  return query select p_agent_id, v_username, v_temp_password;
end;
$$;

revoke all on function public.create_agent_internal_account(uuid, text) from public;
grant execute on function public.create_agent_internal_account(uuid, text) to authenticated;

-- Reset: always server-generated, never accepts a caller-supplied password.
create or replace function public.reset_agent_internal_password(p_agent_id uuid)
returns table (
  agent_id uuid,
  username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.agent_internal_accounts%rowtype;
  v_actor_admin_id uuid;
  v_temp_password text;
begin
  if not public.current_admin_can_manage_accounts() then
    raise exception 'Your account is not authorized to reset agent internal passwords.';
  end if;

  select admin_account.id into v_actor_admin_id
  from public.admin_accounts admin_account
  where admin_account.auth_user_id = auth.uid()
    and admin_account.status = 'Active'
  limit 1;

  select * into v_target from public.agent_internal_accounts where agent_id = p_agent_id;
  if v_target.id is null then
    raise exception 'This agent does not have an internal account yet.';
  end if;

  v_temp_password := public.generate_agent_temporary_password();

  update public.agent_internal_accounts
  set password_hash = crypt(v_temp_password, gen_salt('bf')),
      must_change_password = true,
      failed_login_attempts = 0,
      locked_until = null,
      password_changed_at = null,
      password_reset_at = now(),
      password_reset_by_admin_account_id = v_actor_admin_id,
      updated_at = now()
  where id = v_target.id;

  return query select p_agent_id, v_target.username, v_temp_password;
end;
$$;

revoke all on function public.reset_agent_internal_password(uuid) from public;
grant execute on function public.reset_agent_internal_password(uuid) to authenticated;

-- Explicit, idempotent backfill: only agents that are Active AND still lack
-- an internal account get one. Never resets or overwrites an existing
-- account. Must be invoked deliberately from the admin UI — never runs on
-- its own (not a trigger, not called by this migration).
create or replace function public.backfill_agent_internal_accounts()
returns table (
  agent_id uuid,
  full_name text,
  username text,
  temporary_password text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_admin_id uuid;
  v_agent record;
  v_username text;
  v_temp_password text;
  v_inserted_id uuid;
begin
  if not public.current_admin_can_manage_accounts() then
    raise exception 'Your account is not authorized to generate agent internal accounts.';
  end if;

  select admin_account.id into v_actor_admin_id
  from public.admin_accounts admin_account
  where admin_account.auth_user_id = auth.uid()
    and admin_account.status = 'Active'
  limit 1;

  for v_agent in
    select agent.id, agent.full_name
    from public.agent_accounts agent
    where agent.status = 'Active'
      and not exists (
        select 1 from public.agent_internal_accounts existing
        where existing.agent_id = agent.id
      )
    order by agent.full_name asc, agent.id asc
  loop
    v_username := public.generate_agent_username(v_agent.full_name);
    v_temp_password := public.generate_agent_temporary_password();
    v_inserted_id := null;

    insert into public.agent_internal_accounts (
      agent_id, username, password_hash, status, must_change_password, created_by_admin_account_id
    )
    values (
      v_agent.id, v_username, crypt(v_temp_password, gen_salt('bf')), 'Active', true, v_actor_admin_id
    )
    -- Idempotent: if a concurrent call already created a row for this agent
    -- (or, in principle, the generated username collided) since the
    -- `not exists` check above, skip silently rather than overwrite.
    on conflict do nothing
    returning id into v_inserted_id;

    if v_inserted_id is not null then
      agent_id := v_agent.id;
      full_name := v_agent.full_name;
      username := v_username;
      temporary_password := v_temp_password;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.backfill_agent_internal_accounts() from public;
grant execute on function public.backfill_agent_internal_accounts() to authenticated;

-- ============================================================
-- NOT included in this migration (deliberately deferred to the kiosk-login
-- phase of this project, per current scope):
--   - agent_internal_sessions table
--   - login_internal_agent() / validate_internal_agent_session() /
--     logout_internal_agent() RPCs
--   - any change to agent_accounts.auth_user_id, auth.users, or the
--     existing agent Supabase Auth Edge Functions/migrations
-- ============================================================
