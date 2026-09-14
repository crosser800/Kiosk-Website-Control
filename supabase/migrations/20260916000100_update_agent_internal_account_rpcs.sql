-- Follow-up to 20260915000100_create_agent_internal_accounts.sql.
--
-- Purely additive/idempotent: adds two columns (if missing) and replaces
-- functions (create or replace — never touches existing rows). Safe to run
-- against a table that is already populated. Does NOT call
-- backfill_agent_internal_accounts() and does NOT modify any existing
-- agent_internal_accounts row's username/password_hash/status.
--
-- Changes from the previous migration:
--   1. Adds last_logout_at / last_seen_at (parity with internal_admin_accounts,
--      for future kiosk session work — unused by any RPC yet).
--   2. Username generation is now FIRST WORD + LAST WORD of full_name only
--      (previously: every word concatenated). Renamed to
--      generate_agent_username_base()/generate_unique_agent_username() to
--      match what's already in use. The old
--      normalize_agent_username_base()/generate_agent_username() functions
--      from the prior migration are left in place, unused, rather than
--      dropped.
--   3. create_agent_internal_account(), reset_agent_internal_password(), and
--      backfill_agent_internal_accounts() now set a fixed development
--      password instead of a random one — see the DEV-ONLY note below.
--   4. get_agent_internal_account() now returns the full safe field set
--      (agent_id, failed_login_attempts, locked_until, last_logout_at,
--      last_seen_at, password_changed_at, password_reset_at, updated_at) —
--      still never password_hash.
--   5. New RPC update_agent_internal_account_status() for admin-driven
--      Active/Inactive/Locked management, independent of agent_accounts.status.

alter table public.agent_internal_accounts
  add column if not exists last_logout_at timestamptz null;

alter table public.agent_internal_accounts
  add column if not exists last_seen_at timestamptz null;

-- ============================================================
-- DEV-ONLY TEMPORARY PASSWORD POLICY
-- ------------------------------------------------------------
-- For this development phase only, every newly-created or reset agent
-- internal account gets the fixed password '2bpassword' (still hashed with
-- pgcrypto bcrypt below — never stored or compared in plaintext). This is a
-- deliberate, explicit, temporary simplification for early testing.
--
-- MUST be replaced with generate_agent_temporary_password() (already defined
-- in 20260915000100_create_agent_internal_accounts.sql, unused for now)
-- before any real/production agent credentials are issued — a shared known
-- password across every agent account is not acceptable outside development.
-- ============================================================
create or replace function public.agent_dev_temporary_password()
returns text
language sql
immutable
as $$
  select '2bpassword'::text
$$;

comment on function public.agent_dev_temporary_password() is
  'DEV-ONLY: fixed temporary password used for all agent internal account creation/resets during this development phase. Replace call sites with generate_agent_temporary_password() before production use.';

-- ============================================================
-- Username generation: first word + last word of full_name only.
-- ============================================================
create or replace function public.generate_agent_username_base(p_full_name text)
returns text
language plpgsql
immutable
as $$
declare
  v_cleaned text;
  v_words text[];
  v_first text;
  v_last text;
begin
  -- Strip everything except letters/digits/whitespace first so word
  -- boundaries survive punctuation (e.g. "O'Brien Cruz" -> ['obrien','cruz']).
  v_cleaned := regexp_replace(lower(trim(coalesce(p_full_name, ''))), '[^a-z0-9\s]+', '', 'g');
  v_words := array_remove(regexp_split_to_array(trim(v_cleaned), '\s+'), '');

  if array_length(v_words, 1) is null then
    return null;
  end if;

  v_first := v_words[1];
  v_last := v_words[array_length(v_words, 1)];

  if v_first = v_last then
    return v_first;
  end if;

  return v_first || v_last;
end;
$$;

comment on function public.generate_agent_username_base(text) is
  'First word + last word of a full name, lowercased/alphanumeric-only (middle names dropped). "Karl Matthew Presillas" -> karlpresillas. A single-word name returns just that word. Returns null for a blank name.';

create or replace function public.generate_unique_agent_username(
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
  v_base := coalesce(public.generate_agent_username_base(p_full_name), 'agent');
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

comment on function public.generate_unique_agent_username(text, uuid) is
  'Collision-safe username: generate_agent_username_base() then base2, base3, ... against CURRENT agent_internal_accounts rows. Used by preview_agent_usernames(), create_agent_internal_account(), and backfill_agent_internal_accounts() so the preview always matches what create/backfill will actually do.';

revoke all on function public.generate_agent_username_base(text) from public;
grant execute on function public.generate_agent_username_base(text) to authenticated;
revoke all on function public.generate_unique_agent_username(text, uuid) from public;
grant execute on function public.generate_unique_agent_username(text, uuid) to authenticated;
revoke all on function public.agent_dev_temporary_password() from public;
grant execute on function public.agent_dev_temporary_password() to authenticated;

-- ============================================================
-- preview_agent_usernames(): now calls generate_unique_agent_username().
-- ============================================================
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
    coalesce(existing.username, public.generate_unique_agent_username(agent.full_name)) as proposed_username,
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

-- ============================================================
-- get_agent_internal_account(): full safe field set, still no password_hash.
-- ============================================================
create or replace function public.get_agent_internal_account(p_agent_id uuid)
returns table (
  id uuid,
  agent_id uuid,
  username text,
  status text,
  must_change_password boolean,
  failed_login_attempts integer,
  locked_until timestamptz,
  last_login_at timestamptz,
  last_logout_at timestamptz,
  last_seen_at timestamptz,
  password_changed_at timestamptz,
  password_reset_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
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
    account.id, account.agent_id, account.username, account.status, account.must_change_password,
    account.failed_login_attempts, account.locked_until, account.last_login_at, account.last_logout_at,
    account.last_seen_at, account.password_changed_at, account.password_reset_at, account.created_at,
    account.updated_at
  from public.agent_internal_accounts account
  where account.agent_id = p_agent_id;
end;
$$;

revoke all on function public.get_agent_internal_account(uuid) from public;
grant execute on function public.get_agent_internal_account(uuid) to authenticated;

-- ============================================================
-- create_agent_internal_account(): renamed username call + dev-fixed password.
-- ============================================================
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
    v_username := public.generate_unique_agent_username(v_agent.full_name);
  else
    v_username := lower(trim(p_username));
    if v_username !~ '^[a-z0-9]+(?:[._-][a-z0-9]+)*$' then
      raise exception 'Username may only contain lowercase letters, numbers, and single separators (. _ -).';
    end if;
    if exists (select 1 from public.agent_internal_accounts where normalized_username = v_username) then
      raise exception 'This username is already taken.';
    end if;
  end if;

  -- DEV-ONLY fixed password — see agent_dev_temporary_password() comment.
  v_temp_password := public.agent_dev_temporary_password();

  insert into public.agent_internal_accounts (
    agent_id, username, password_hash, status, must_change_password,
    failed_login_attempts, created_by_admin_account_id
  )
  values (
    p_agent_id, v_username, crypt(v_temp_password, gen_salt('bf')), 'Active', true,
    0, v_actor_admin_id
  );

  return query select p_agent_id, v_username, v_temp_password;
end;
$$;

revoke all on function public.create_agent_internal_account(uuid, text) from public;
grant execute on function public.create_agent_internal_account(uuid, text) to authenticated;

-- ============================================================
-- reset_agent_internal_password(): dev-fixed password, same row preserved.
-- ============================================================
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

  -- DEV-ONLY fixed password — see agent_dev_temporary_password() comment.
  v_temp_password := public.agent_dev_temporary_password();

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

-- ============================================================
-- backfill_agent_internal_accounts(): renamed username call + dev-fixed
-- password. Still idempotent, still Active-agents-only, still never called
-- automatically by this migration.
-- ============================================================
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
    v_username := public.generate_unique_agent_username(v_agent.full_name);
    -- DEV-ONLY fixed password — see agent_dev_temporary_password() comment.
    v_temp_password := public.agent_dev_temporary_password();
    v_inserted_id := null;

    insert into public.agent_internal_accounts (
      agent_id, username, password_hash, status, must_change_password,
      failed_login_attempts, created_by_admin_account_id
    )
    values (
      v_agent.id, v_username, crypt(v_temp_password, gen_salt('bf')), 'Active', true,
      0, v_actor_admin_id
    )
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
-- New: admin-driven internal account status management, independent of
-- agent_accounts.status. Setting status back to 'Active' also clears the
-- lockout fields (the documented way to unlock a Locked account).
-- ============================================================
create or replace function public.update_agent_internal_account_status(
  p_agent_id uuid,
  p_status text
)
returns table (
  agent_id uuid,
  username text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.agent_internal_accounts%rowtype;
  v_normalized_status text := initcap(lower(trim(coalesce(p_status, ''))));
begin
  if not public.current_admin_can_manage_accounts() then
    raise exception 'Your account is not authorized to manage agent internal accounts.';
  end if;

  if v_normalized_status not in ('Active', 'Inactive', 'Locked') then
    raise exception 'Status must be Active, Inactive, or Locked.';
  end if;

  select * into v_target from public.agent_internal_accounts where agent_id = p_agent_id;
  if v_target.id is null then
    raise exception 'This agent does not have an internal account yet.';
  end if;

  update public.agent_internal_accounts
  set status = v_normalized_status,
      failed_login_attempts = case when v_normalized_status = 'Active' then 0 else failed_login_attempts end,
      locked_until = case when v_normalized_status = 'Active' then null else locked_until end,
      updated_at = now()
  where id = v_target.id;

  return query select p_agent_id, v_target.username, v_normalized_status;
end;
$$;

revoke all on function public.update_agent_internal_account_status(uuid, text) from public;
grant execute on function public.update_agent_internal_account_status(uuid, text) to authenticated;
