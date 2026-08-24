alter table public.product_units
  drop constraint if exists product_units_unit_type_check;

alter table public.product_units
  add constraint product_units_unit_type_check
  check (
    unit_type = any (
      array[
        'count'::text,
        'weight'::text,
        'length'::text,
        'package'::text,
        'set'::text,
        'other'::text
      ]
    )
  );
