-- ============================================================================
-- DRAFT FOR REVIEW — NOT APPLIED. Lives outside supabase/migrations/ on
-- purpose so the Supabase CLI never picks it up. Move it into
-- supabase/migrations/ only after review and a staging run.
-- ============================================================================
--
-- Server-side, transactional cleanup of unit options / variations removed in
-- the Admin product editor (AddProduct.tsx -> referenceCleanup.ts).
--
-- Why: every FK into product_variation_unit_options is ON DELETE SET NULL
--   product_discount_classes.unit_option_id
--   product_surcharges.reward_unit_option_id
--   product_surcharge_classes.unit_option_id
--   product_surcharge_classes.reward_unit_option_id
--   cart_items.unit_option_id
--   order_items.unit_option_id
--   inventory_movements.unit_option_id
-- and product_variation_unit_options.variation_id is ON DELETE CASCADE from
-- product_variations. A client-side "check, then delete" can therefore erase
-- links silently (incomplete check, or a reference inserted in between).
--
-- CURRENT MODE: RETIRE-ONLY. product_editor_physical_delete_enabled() returns
-- false (section 1b), so deploying this draft as-is deletes nothing: every
-- removed unit option / variation is retired. The deletion path below stays
-- in place, reviewed and tested, for a later migration that flips the switch.
--
-- Design:
--   * One function call = one transaction: lock target rows FOR UPDATE, count
--     every reference, delete only rows with zero references (only if the
--     deletion switch is on), retire the rest.
--   * FOR UPDATE conflicts with the FOR KEY SHARE lock every FK check takes on
--     the referenced row, so a concurrent INSERT/UPDATE that would reference a
--     locked row waits; if the row is then deleted, that write fails with an FK
--     error instead of being nulled. Writes that committed before the lock are
--     seen by the following statements (READ COMMITTED, new snapshot each).
--   * Fail closed: an unexpected FK into product_variation_unit_options, a
--     multi-column FK into product_variations or inventory_item_variation_links,
--     a lock timeout or any error
--     aborts the call; the client then retires instead of deleting.
--   * Nothing here weakens a constraint or touches existing rows by itself.
--
-- Not changed: FKs, constraints, RLS, existing data.

-- ----------------------------------------------------------------------------
-- 1. Caller check (internal helper; no EXECUTE for API roles)
-- ----------------------------------------------------------------------------
create or replace function public.product_editor_assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.' using errcode = '28000';
  end if;

  -- REVIEW: mirrors create_admin_order's lookup. Any Active admin account may
  -- edit products today (the product tables are written directly from the
  -- client); tighten the role list here if product editing is role-restricted.
  if not exists (
    select 1
    from public.admin_accounts a
    where a.auth_user_id = auth.uid()
      and a.status = 'Active'
  ) then
    raise exception 'Your account is not authorized to edit products.' using errcode = '42501';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1b. Physical-deletion switch — OFF (decision 2026-10-18: retire-only).
--     While false, both cleanup functions retire EVERY requested row (unit
--     option -> Inactive / not orderable, variation -> Unavailable) and delete
--     nothing, even rows with zero references. Reason: the Flutter Kiosk keeps
--     carts in memory and writes cart_items only at checkout, so a server-side
--     reference check cannot see in-progress carts. Turn on only in a separate,
--     reviewed migration after Kiosk/place_kiosk_order validate cart lines.
--     Internal helper; no EXECUTE for API roles, so it cannot be overridden
--     from the client.
-- ----------------------------------------------------------------------------
create or replace function public.product_editor_physical_delete_enabled()
returns boolean
language sql
immutable
security definer
set search_path = pg_catalog, public
as $$
  select false
$$;

-- ----------------------------------------------------------------------------
-- 2. Completeness guard: the reference counter below lists the seven known FKs
--    explicitly. If anyone adds another FK into product_variation_unit_options
--    later, refuse to delete until this function is updated.
-- ----------------------------------------------------------------------------
create or replace function public.product_editor_assert_known_unit_option_fks()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_unknown text;
begin
  select string_agg(format('%s.%s', c.conrelid::regclass, a.attname), ', ')
    into v_unknown
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any (c.conkey)
  where c.contype = 'f'
    and c.confrelid = 'public.product_variation_unit_options'::regclass
    and (c.conrelid, a.attname::text) not in (
      ('public.product_discount_classes'::regclass, 'unit_option_id'),
      ('public.product_surcharges'::regclass, 'reward_unit_option_id'),
      ('public.product_surcharge_classes'::regclass, 'unit_option_id'),
      ('public.product_surcharge_classes'::regclass, 'reward_unit_option_id'),
      ('public.cart_items'::regclass, 'unit_option_id'),
      ('public.order_items'::regclass, 'unit_option_id'),
      ('public.inventory_movements'::regclass, 'unit_option_id')
    );

  if v_unknown is not null then
    raise exception 'Unexpected reference(s) to product_variation_unit_options (%); deletion refused.', v_unknown
      using errcode = '55000';
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Reference counts per unit option (internal helper)
-- ----------------------------------------------------------------------------
create or replace function public.product_editor_unit_option_reference_counts(p_unit_option_ids uuid[])
returns table (unit_option_id uuid, reference_counts jsonb, total_references bigint)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    u.id,
    counts.reference_counts,
    (select coalesce(sum(value::bigint), 0)::bigint from jsonb_each_text(counts.reference_counts))
  from public.product_variation_unit_options u
  cross join lateral (
    select jsonb_build_object(
      'order_items', (select count(*) from public.order_items x where x.unit_option_id = u.id),
      'cart_items', (select count(*) from public.cart_items x where x.unit_option_id = u.id),
      'inventory_movements', (select count(*) from public.inventory_movements x where x.unit_option_id = u.id),
      'product_discount_classes', (select count(*) from public.product_discount_classes x where x.unit_option_id = u.id),
      'product_surcharge_classes', (select count(*) from public.product_surcharge_classes x where x.unit_option_id = u.id),
      'product_surcharge_classes_reward', (select count(*) from public.product_surcharge_classes x where x.reward_unit_option_id = u.id),
      'product_surcharges_reward', (select count(*) from public.product_surcharges x where x.reward_unit_option_id = u.id)
    ) as reference_counts
  ) counts
  where u.id = any (p_unit_option_ids);
$$;

-- ----------------------------------------------------------------------------
-- 4. Reference counts per variation (internal helper)
--    = references to the variation row itself
--        * every FK into product_variations (discovered from the catalog), and
--        * every public column NAMED like a variation reference, FK or not
--          (variation_id, product_variation_id, reward_variation_id,
--          source_variation_id), whatever its type
--    + rows referencing the variation's SKU links (inventory_item_variation_links)
--    + references to its unit options (which would cascade away).
--    Not counted as blocking:
--      product_variation_unit_options  -> counted through their own references
--      inventory_item_variation_links  -> the link rows themselves (SKU-derived
--                                         mapping the editor removes with the
--                                         variation); anything referencing a
--                                         link IS counted and blocks.
--
--    M1: columns are compared as lower(btrim(col::text)) against the
--    lower-cased uuid text, so uuid, text and varchar columns (including
--    upper-case or padded ids written by the Kiosk) are all matched; a type
--    mismatch can no longer make the check error out or miss a reference.
-- ----------------------------------------------------------------------------
create or replace function public.product_editor_variation_reference_counts(p_variation_ids uuid[])
returns table (variation_id uuid, reference_counts jsonb, total_references bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
declare
  v_ref record;
  v_hit record;
  v_counts jsonb := '{}'::jsonb;
  v_key text;
  v_id_texts text[];
begin
  select coalesce(array_agg(lower(i::text)), '{}') into v_id_texts from unnest(p_variation_ids) i;

  if exists (
    select 1
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid in (
        'public.product_variations'::regclass,
        'public.inventory_item_variation_links'::regclass
      )
      and cardinality(c.conkey) <> 1
  ) then
    raise exception 'Multi-column reference to product_variations or inventory_item_variation_links; deletion refused.'
      using errcode = '55000';
  end if;

  -- References to the variation row.
  for v_ref in
    select distinct s.tbl, s.col
    from (
      select c.conrelid::regclass as tbl, a.attname::text as col
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.confrelid = 'public.product_variations'::regclass
        and c.conrelid not in (
          'public.product_variation_unit_options'::regclass,
          'public.inventory_item_variation_links'::regclass
        )
      union all
      select format('%I.%I', col.table_schema, col.table_name)::regclass, col.column_name::text
      from information_schema.columns col
      join information_schema.tables t
        on t.table_schema = col.table_schema
       and t.table_name = col.table_name
       and t.table_type = 'BASE TABLE'
      where col.table_schema = 'public'
        and col.column_name in ('variation_id', 'product_variation_id', 'reward_variation_id', 'source_variation_id')
        and col.table_name not in ('product_variation_unit_options', 'inventory_item_variation_links')
    ) s
  loop
    for v_hit in execute format(
      'select lower(btrim(%1$I::text)) as id, count(*) as n from %2$s '
      'where %1$I is not null and lower(btrim(%1$I::text)) = any ($1) group by 1',
      v_ref.col, v_ref.tbl
    ) using v_id_texts
    loop
      v_key := format('%s.%s', v_ref.tbl, v_ref.col);
      v_counts := v_counts || jsonb_build_object(
        v_hit.id,
        coalesce(v_counts -> v_hit.id, '{}'::jsonb) || jsonb_build_object(v_key, v_hit.n)
      );
    end loop;
  end loop;

  -- M2: rows referencing this variation's SKU links (FK into the link table).
  for v_ref in
    select c.conrelid::regclass as tbl, a.attname::text as col, ra.attname::text as refcol
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    join pg_attribute ra on ra.attrelid = c.confrelid and ra.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.inventory_item_variation_links'::regclass
  loop
    for v_hit in execute format(
      'select lower(btrim(l.product_variation_id::text)) as id, count(*) as n '
      'from public.inventory_item_variation_links l join %1$s r on r.%2$I = l.%3$I '
      'where lower(btrim(l.product_variation_id::text)) = any ($1) group by 1',
      v_ref.tbl, v_ref.col, v_ref.refcol
    ) using v_id_texts
    loop
      v_key := format('inventory_item_variation_links<-%s.%s', v_ref.tbl, v_ref.col);
      v_counts := v_counts || jsonb_build_object(
        v_hit.id,
        coalesce(v_counts -> v_hit.id, '{}'::jsonb) || jsonb_build_object(v_key, v_hit.n)
      );
    end loop;
  end loop;

  -- References to the unit options that would cascade with the variation.
  for v_hit in
    select lower(u.variation_id::text) as id, sum(r.total_references) as n
    from public.product_variation_unit_options u
    join public.product_editor_unit_option_reference_counts(
      array(select uo.id from public.product_variation_unit_options uo where uo.variation_id = any (p_variation_ids))
    ) r on r.unit_option_id = u.id
    where r.total_references > 0
    group by 1
  loop
    v_counts := v_counts || jsonb_build_object(
      v_hit.id,
      coalesce(v_counts -> v_hit.id, '{}'::jsonb) || jsonb_build_object('unit_option_references', v_hit.n)
    );
  end loop;

  return query
  select
    v.id,
    coalesce(v_counts -> lower(v.id::text), '{}'::jsonb),
    (select coalesce(sum(value::bigint), 0)::bigint
       from jsonb_each_text(coalesce(v_counts -> lower(v.id::text), '{}'::jsonb)))
  from public.product_variations v
  where v.id = any (p_variation_ids);
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. API: read-only reference report (diagnostics / future UI)
-- ----------------------------------------------------------------------------
create or replace function public.get_unit_option_references(p_product_id uuid, p_unit_option_ids uuid[])
returns table (unit_option_id uuid, reference_counts jsonb, total_references bigint)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
#variable_conflict use_column
begin
  perform public.product_editor_assert_admin();
  perform public.product_editor_assert_known_unit_option_fks();

  return query
  select r.unit_option_id, r.reference_counts, r.total_references
  from public.product_editor_unit_option_reference_counts(p_unit_option_ids) r
  join public.product_variation_unit_options u on u.id = r.unit_option_id
  join public.product_variations v on v.id = u.variation_id
  where v.product_id = p_product_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. API: transactional cleanup of removed unit options
-- ----------------------------------------------------------------------------
create or replace function public.cleanup_removed_unit_options(p_product_id uuid, p_unit_option_ids uuid[])
returns table (unit_option_id uuid, action text, reference_counts jsonb)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
set lock_timeout = '5s'
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
  v_delete_ids uuid[];
  v_retire_ids uuid[];
  v_counts jsonb;
begin
  perform public.product_editor_assert_admin();
  perform public.product_editor_assert_known_unit_option_fks();

  if p_product_id is null then
    raise exception 'Product is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct i), '{}') into v_ids
  from unnest(coalesce(p_unit_option_ids, '{}'::uuid[])) i
  where i is not null;

  if cardinality(v_ids) = 0 then
    return;
  end if;
  if cardinality(v_ids) > 500 then
    raise exception 'Too many unit options in one cleanup call.' using errcode = '22023';
  end if;

  -- Ids that no longer exist are ignored; ids of another product are refused.
  if exists (
    select 1
    from public.product_variation_unit_options u
    join public.product_variations v on v.id = u.variation_id
    where u.id = any (v_ids)
      and v.product_id is distinct from p_product_id
  ) then
    raise exception 'Some unit options do not belong to this product.' using errcode = '42501';
  end if;

  -- Lock first (deterministic order), then count with a fresh snapshot.
  perform 1
  from public.product_variation_unit_options u
  where u.id = any (v_ids)
  order by u.id
  for update;

  select
    coalesce(array_agg(r.unit_option_id) filter (where r.total_references = 0), '{}'),
    coalesce(array_agg(r.unit_option_id) filter (where r.total_references > 0), '{}'),
    coalesce(jsonb_object_agg(r.unit_option_id::text, r.reference_counts), '{}'::jsonb)
    into v_delete_ids, v_retire_ids, v_counts
  from public.product_editor_unit_option_reference_counts(v_ids) r;

  -- Retire-only while physical deletion is switched off (section 1b).
  if not public.product_editor_physical_delete_enabled() then
    v_retire_ids := v_retire_ids || v_delete_ids;
    v_delete_ids := '{}';
  end if;

  delete from public.product_variation_unit_options u where u.id = any (v_delete_ids);

  update public.product_variation_unit_options u
  set status = 'Inactive', is_orderable = false
  where u.id = any (v_retire_ids);

  return query
  select d, 'deleted'::text, v_counts -> (d::text) from unnest(v_delete_ids) d
  union all
  select t, 'retired'::text, v_counts -> (t::text) from unnest(v_retire_ids) t;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. API: transactional cleanup of removed variation rows
-- ----------------------------------------------------------------------------
create or replace function public.cleanup_removed_variations(p_product_id uuid, p_variation_ids uuid[])
returns table (variation_id uuid, action text, reference_counts jsonb)
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
set lock_timeout = '5s'
as $$
#variable_conflict use_column
declare
  v_ids uuid[];
  v_delete_ids uuid[];
  v_retire_ids uuid[];
  v_counts jsonb;
begin
  perform public.product_editor_assert_admin();
  perform public.product_editor_assert_known_unit_option_fks();

  if p_product_id is null then
    raise exception 'Product is required.' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct i), '{}') into v_ids
  from unnest(coalesce(p_variation_ids, '{}'::uuid[])) i
  where i is not null;

  if cardinality(v_ids) = 0 then
    return;
  end if;
  if cardinality(v_ids) > 500 then
    raise exception 'Too many variations in one cleanup call.' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.product_variations v
    where v.id = any (v_ids) and v.product_id is distinct from p_product_id
  ) then
    raise exception 'Some variations do not belong to this product.' using errcode = '42501';
  end if;

  -- Lock the variations and the unit options that would cascade with them.
  perform 1 from public.product_variations v where v.id = any (v_ids) order by v.id for update;
  perform 1
  from public.product_variation_unit_options u
  where u.variation_id = any (v_ids)
  order by u.id
  for update;

  select
    coalesce(array_agg(r.variation_id) filter (where r.total_references = 0), '{}'),
    coalesce(array_agg(r.variation_id) filter (where r.total_references > 0), '{}'),
    coalesce(jsonb_object_agg(r.variation_id::text, r.reference_counts), '{}'::jsonb)
    into v_delete_ids, v_retire_ids, v_counts
  from public.product_editor_variation_reference_counts(v_ids) r;

  -- Retire-only while physical deletion is switched off (section 1b). SKU
  -- links of retired variations are kept.
  if not public.product_editor_physical_delete_enabled() then
    v_retire_ids := v_retire_ids || v_delete_ids;
    v_delete_ids := '{}';
  end if;

  -- Deletable variation (no references, including none to its SKU links):
  -- drop its SKU mapping, as the editor always has.
  delete from public.inventory_item_variation_links l where l.product_variation_id = any (v_delete_ids);
  -- Cascades only to unit options that were just verified unreferenced.
  delete from public.product_variations v where v.id = any (v_delete_ids);

  update public.product_variations v
  set availability = 'Unavailable'
  where v.id = any (v_retire_ids);

  return query
  select d, 'deleted'::text, v_counts -> (d::text) from unnest(v_delete_ids) d
  union all
  select t, 'retired'::text, v_counts -> (t::text) from unnest(v_retire_ids) t;
end;
$$;

-- ----------------------------------------------------------------------------
-- 8. Privileges. Supabase grants EXECUTE on new public functions to anon /
--    authenticated by default, so revoke explicitly; only the three API
--    functions are callable, and only by signed-in users (each re-checks the
--    caller is an Active admin).
-- ----------------------------------------------------------------------------
revoke all on function public.product_editor_physical_delete_enabled() from public, anon, authenticated;
revoke all on function public.product_editor_assert_admin() from public, anon, authenticated;
revoke all on function public.product_editor_assert_known_unit_option_fks() from public, anon, authenticated;
revoke all on function public.product_editor_unit_option_reference_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.product_editor_variation_reference_counts(uuid[]) from public, anon, authenticated;
revoke all on function public.get_unit_option_references(uuid, uuid[]) from public, anon;
revoke all on function public.cleanup_removed_unit_options(uuid, uuid[]) from public, anon;
revoke all on function public.cleanup_removed_variations(uuid, uuid[]) from public, anon;

grant execute on function public.get_unit_option_references(uuid, uuid[]) to authenticated;
grant execute on function public.cleanup_removed_unit_options(uuid, uuid[]) to authenticated;
grant execute on function public.cleanup_removed_variations(uuid, uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Review notes
--   * Recommended (separate, reviewed) indexes so the counts stay cheap:
--     order_items(unit_option_id), cart_items(unit_option_id),
--     inventory_movements(unit_option_id), product_discount_classes(unit_option_id),
--     product_surcharge_classes(unit_option_id), product_surcharge_classes(reward_unit_option_id),
--     product_surcharges(reward_unit_option_id) — check which already exist first.
--   * order_items / cart_items / inventory_movements .variation_id are counted
--     even without an FK, but a column WITHOUT an FK takes no lock on the
--     variation, so a concurrent insert there is not blocked. Confirm those
--     FKs exist (staging query below) if variation deletion must be race-free.
--   * Verify on staging:
--       select conrelid::regclass, conname, pg_get_constraintdef(oid)
--       from pg_constraint where confrelid = 'public.product_variations'::regclass;
-- ----------------------------------------------------------------------------
