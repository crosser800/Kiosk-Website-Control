-- Adds persistent auto/manual weight-sync mode to product_variation_unit_options.
--
-- Context: the Unit & Packaging editor is gaining auto-computed weights for
-- higher order units (box/carton/etc.), derived as
--   base-unit weight_value * quantity_in_base_unit
-- Once a higher-unit row's weight is manually edited, it must stop following
-- the base weight until the user explicitly resets it. weight_mode is the
-- persisted flag that records which behavior applies to each row.
--
-- The base-unit row itself (unit_code = base_unit_code) is always the SOURCE
-- of the weight, never a derived value — its own weight_mode is not
-- meaningful and is left at the column default for storage consistency only.
--
-- Backfill rationale (per live-data audit): of 5,226 existing unit-option
-- rows, only 2 have a non-null weight_value and both are 0 — i.e. current
-- production data has no meaningful pre-existing weights. So:
--   - higher-order rows (unit_code <> base_unit_code) with a positive,
--     non-zero weight_value are treated as pre-existing manual entries and
--     flipped to 'manual', so the new auto-sync feature never silently
--     recomputes/overwrites a real value that was already there.
--   - every other row (null/zero weight, and all base-unit rows) is left at
--     the column default of 'auto'.
--
-- Explicitly NOT done here: no base-unit rows are created or guessed for the
-- 218 legacy variations that have no row matching their own base_unit_code
-- (217 with base_unit_code = 'pc', 1 with base_unit_code = 'lit.') — the
-- application must treat those as "auto-sync unavailable" rather than
-- inventing a base row.

alter table public.product_variation_unit_options
  add column if not exists weight_mode text not null default 'auto';

alter table public.product_variation_unit_options
  drop constraint if exists product_variation_unit_options_weight_mode_check;

alter table public.product_variation_unit_options
  add constraint product_variation_unit_options_weight_mode_check
  check (weight_mode = any (array['auto'::text, 'manual'::text]));

comment on column public.product_variation_unit_options.weight_mode is
  'auto = weight_value is kept in sync with (base-unit weight_value * quantity_in_base_unit) by the application; manual = weight_value was explicitly entered/edited by a user and must not be overwritten by auto-sync. Meaningless for the base-unit row itself (unit_code = base_unit_code), which is always the source of truth for weight, never a derived value.';

-- Idempotent backfill: safe to rerun. Only touches higher-order rows that
-- already carry a positive weight; everything else stays at the 'auto'
-- default set above.
update public.product_variation_unit_options
set weight_mode = 'manual'
where unit_code <> base_unit_code
  and weight_value is not null
  and weight_value > 0
  and weight_mode is distinct from 'manual';
