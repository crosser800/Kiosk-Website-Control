-- Phase 1: logical variation SKU architecture — database foundation + safe backfill only.
--
-- Introduces public.product_variation_groups: one row per LOGICAL variation
-- (the entity the app already treats as one variation via the client-side
-- `variationName::skuCode` grouping key used in VarAndPrice.tsx, AddProduct.tsx,
-- orderCatalog.ts, ProductCategoryWorkspace.tsx, ProductSummary.tsx, Products.tsx,
-- and RewardProductSelector.tsx). Every existing product_variations row (one of
-- the six R1/R2/W1/W2/SP/CP price-class rows per logical variation) is linked to
-- its group via the new product_variations.variation_group_id column.
--
-- Explicitly NOT done in this migration (deferred to later, isolated phases):
--   - no unique constraint on product_variation_groups.normalized_sku_code
--     (41 cross-product + 4 same-product/different-variation conflicts in
--     existing data must remain representable until manually resolved)
--   - no changes to products.sku_code / products_sku_code_key
--   - no sku_code value renames/mutations anywhere
--   - no product_variations row deletions
--   - no inventory_items / inventory_item_variation_links changes
--   - no application code changes
--   - product_variations.variation_group_id is NOT set NOT NULL here (see
--     the "SEQUENCING" note above section 4 below for why)
--
-- Rollback: drop the FK column on product_variations, then drop this table.
-- No other table's data is touched by that rollback.
--
-- IMPORTANT — rows_per_group is a STRUCTURAL diagnostic only, not a conflict
-- detector. A group with exactly 6 rows can still be one half of a genuine
-- SKU conflict (e.g. Product A/Variation X/SKU ABC -> Group A -> 6 rows, and
-- Product B/Variation Y/SKU ABC -> Group B -> 6 rows: two perfectly
-- structurally-normal 6-row groups that nonetheless share a normalized SKU).
-- To find real conflicts, look for duplicate
-- product_variation_groups.normalized_sku_code ACROSS DIFFERENT group rows —
-- never infer a conflict from product_variations.variation_group_id row
-- counts.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. Registry table: one row = one logical variation
-- ============================================================
create table if not exists public.product_variation_groups (
  id uuid primary key default gen_random_uuid(),

  product_id uuid not null
    references public.products(id)
    on delete cascade,

  variation_name text not null,
  sku_code text not null,

  -- Mirrors the app's existing normalization (trim + lowercase) used by
  -- buildGroupKeyFromRow()/buildVariationKey() in VarAndPrice.tsx and
  -- buildVariationCardKey() in AddProduct.tsx.
  normalized_variation_name text generated always as (lower(trim(variation_name))) stored,
  normalized_sku_code text generated always as (lower(trim(sku_code))) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.product_variation_groups is
  'One row per logical product variation. The six R1/R2/W1/W2/SP/CP price-class rows in product_variations that represent one logical variation all reference the same group row via product_variations.variation_group_id. Phase 1 only: normalized_sku_code is intentionally NOT globally unique yet — see product_variation_groups_identity_key for the constraint that IS enforced.';

comment on column public.product_variation_groups.normalized_sku_code is
  'lower(trim(sku_code)). NOT unique in Phase 1 — duplicate normalized SKUs across different groups are expected and must remain representable until conflicts are manually resolved in a later phase.';

-- Group-identity guard: prevents the backfill (or any future rerun of it)
-- from ever creating two registry rows for the SAME logical variation. This
-- is NOT global SKU uniqueness — a given normalized_sku_code can still
-- appear on multiple group rows as long as product_id and/or
-- normalized_variation_name differ.
create unique index if not exists product_variation_groups_identity_key
  on public.product_variation_groups (product_id, normalized_variation_name, normalized_sku_code);

create index if not exists product_variation_groups_product_id_idx
  on public.product_variation_groups (product_id);

-- ============================================================
-- 2. Link column on product_variations (nullable — stays nullable at the
--    end of Phase 1, see SEQUENCING note in section 4 below)
-- ============================================================
alter table public.product_variations
  add column if not exists variation_group_id uuid
    references public.product_variation_groups(id)
    on delete set null;

comment on column public.product_variations.variation_group_id is
  'FK to product_variation_groups: the logical variation this price-class row belongs to. Additive Phase 1 metadata — existing application code (AddProduct.tsx, VarAndPrice.tsx) does not read or write this column yet, so it MUST remain nullable until a later phase updates those write paths to populate it on every insert/upsert. Do not add a NOT NULL constraint here without first confirming every product_variations write path sets this column — otherwise unmodified Admin create/edit flows will start failing with not-null violations on new or recreated variation rows.';

create index if not exists product_variations_variation_group_id_idx
  on public.product_variations (variation_group_id);

-- ============================================================
-- 3. Backfill: one group row per existing distinct logical variation
--    Identity = product_id + normalized(variation_name, falling back to
--    class_name, matching the app's existing `item.variationName ||
--    item.className || ''` fallback) + normalized(sku_code).
-- ============================================================
insert into public.product_variation_groups (product_id, variation_name, sku_code)
select
  grouped.product_id,
  min(grouped.raw_variation_name) as variation_name,
  min(grouped.raw_sku_code) as sku_code
from (
  select
    pv.product_id,
    coalesce(nullif(trim(pv.variation_name), ''), nullif(trim(pv.class_name), ''), '') as raw_variation_name,
    pv.sku_code as raw_sku_code
  from public.product_variations pv
) grouped
group by
  grouped.product_id,
  lower(trim(grouped.raw_variation_name)),
  lower(trim(grouped.raw_sku_code))
on conflict (product_id, normalized_variation_name, normalized_sku_code) do nothing;

-- Populate the link column. Every product_variations row maps to exactly one
-- group row via the identical normalized identity used above.
update public.product_variations pv
set variation_group_id = pvg.id
from public.product_variation_groups pvg
where pvg.product_id = pv.product_id
  and pvg.normalized_variation_name = lower(trim(coalesce(nullif(trim(pv.variation_name), ''), nullif(trim(pv.class_name), ''), '')))
  and pvg.normalized_sku_code = lower(trim(pv.sku_code))
  and pv.variation_group_id is distinct from pvg.id;

-- ============================================================
-- 4. Safety guards — abort the whole migration (transaction rolls back)
--    if the backfill did not fully and correctly assign every row that
--    existed AT MIGRATION TIME. These are verification-only: unlike an
--    earlier draft of this migration, they do NOT end in an
--    `alter column variation_group_id set not null`.
--
--    SEQUENCING: Phase 1 makes no application write-path changes.
--    AddProduct.tsx and VarAndPrice.tsx still insert/upsert
--    product_variations rows without supplying variation_group_id. If this
--    column were made NOT NULL now, every unmodified Admin create/edit
--    operation would immediately start failing on new or recreated
--    variation rows. variation_group_id therefore MUST stay nullable
--    through the rest of Phase 1. The NOT NULL constraint belongs in a
--    later phase, added only after AddProduct.tsx/VarAndPrice.tsx (and any
--    other write path) have been updated to populate this column on every
--    write — do not add it back here prematurely.
-- ============================================================
do $$
declare
  v_unassigned_count bigint;
  v_cross_product_count bigint;
begin
  select count(*) into v_unassigned_count
  from public.product_variations
  where variation_group_id is null;

  if v_unassigned_count > 0 then
    raise exception
      'product_variation_groups backfill incomplete: % product_variations row(s) (existing at migration time) have no variation_group_id',
      v_unassigned_count;
  end if;

  select count(*) into v_cross_product_count
  from public.product_variations pv
  join public.product_variation_groups pvg on pvg.id = pv.variation_group_id
  where pv.product_id <> pvg.product_id;

  if v_cross_product_count > 0 then
    raise exception
      'product_variation_groups backfill invalid: % product_variations row(s) are linked to a group belonging to a different product',
      v_cross_product_count;
  end if;
end;
$$;

-- Intentionally no `alter column variation_group_id set not null` here.
-- See the SEQUENCING note immediately above: that constraint is Phase 2
-- work, gated on the application write paths being updated first.
