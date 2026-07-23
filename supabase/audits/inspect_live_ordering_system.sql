-- 2B Admin Ordering System - Live Database Inspection Pack
-- Phase 1 only: read-only inspection queries.
-- Run this in Supabase SQL Editor and return the result sets before any RPC rewrite.

-- ============================================================
-- 1. ORDER_ITEMS LIVE COLUMNS
-- ============================================================
select
  '01_order_items_live_columns' as result_set,
  c.table_schema,
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_generated as information_schema_is_generated,
  c.generation_expression as information_schema_generation_expression,
  a.attgenerated as pg_attgenerated,
  pg_get_expr(ad.adbin, ad.adrelid) as pg_generation_or_default_expression
from information_schema.columns c
join pg_namespace n
  on n.nspname = c.table_schema
join pg_class cls
  on cls.relnamespace = n.oid
 and cls.relname = c.table_name
join pg_attribute a
  on a.attrelid = cls.oid
 and a.attname = c.column_name
 and a.attnum > 0
 and not a.attisdropped
left join pg_attrdef ad
  on ad.adrelid = a.attrelid
 and ad.adnum = a.attnum
where c.table_schema = 'public'
  and c.table_name = 'order_items'
order by c.ordinal_position;

select
  '01b_order_items_total_generation_focus' as result_set,
  a.attname as column_name,
  a.attgenerated,
  case a.attgenerated
    when 's' then 'stored generated'
    when 'v' then 'virtual generated'
    else 'not generated'
  end as generated_status,
  pg_get_expr(ad.adbin, ad.adrelid) as generation_expression
from pg_attribute a
join pg_class cls
  on cls.oid = a.attrelid
join pg_namespace n
  on n.oid = cls.relnamespace
left join pg_attrdef ad
  on ad.adrelid = a.attrelid
 and ad.adnum = a.attnum
where n.nspname = 'public'
  and cls.relname = 'order_items'
  and a.attnum > 0
  and not a.attisdropped
  and (
    a.attname in ('line_subtotal', 'gross_total', 'line_total', 'base_quantity')
    or a.attname ilike '%total%'
    or a.attname ilike '%subtotal%'
  )
order by a.attnum;

-- ============================================================
-- 2. ORDERS LIVE COLUMNS
-- ============================================================
select
  '02_orders_live_columns' as result_set,
  c.table_schema,
  c.table_name,
  c.column_name,
  c.ordinal_position,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default,
  c.is_generated as information_schema_is_generated,
  c.generation_expression as information_schema_generation_expression,
  a.attgenerated as pg_attgenerated,
  pg_get_expr(ad.adbin, ad.adrelid) as pg_generation_or_default_expression
from information_schema.columns c
join pg_namespace n
  on n.nspname = c.table_schema
join pg_class cls
  on cls.relnamespace = n.oid
 and cls.relname = c.table_name
join pg_attribute a
  on a.attrelid = cls.oid
 and a.attname = c.column_name
 and a.attnum > 0
 and not a.attisdropped
left join pg_attrdef ad
  on ad.adrelid = a.attrelid
 and ad.adnum = a.attnum
where c.table_schema = 'public'
  and c.table_name = 'orders'
order by c.ordinal_position;

select
  '02b_orders_expected_context_column_presence' as result_set,
  expected.column_name,
  (c.column_name is not null) as exists_in_orders,
  c.data_type,
  c.is_nullable,
  c.column_default
from (
  values
    ('branch_id'),
    ('customer_type'),
    ('guest_name'),
    ('guest_company'),
    ('guest_address'),
    ('guest_tin'),
    ('guest_contact_number'),
    ('guest_email'),
    ('created_by'),
    ('created_by_admin_id'),
    ('source')
) as expected(column_name)
left join information_schema.columns c
  on c.table_schema = 'public'
 and c.table_name = 'orders'
 and c.column_name = expected.column_name
order by expected.column_name;

-- ============================================================
-- 3. LIVE create_admin_order DEFINITION AND PRIVILEGES
-- ============================================================
select
  '03_create_admin_order_definition' as result_set,
  pg_get_functiondef('public.create_admin_order(jsonb,jsonb)'::regprocedure) as function_definition;

select
  '03b_create_admin_order_metadata' as result_set,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_arguments(p.oid) as arguments_with_names,
  pg_get_function_result(p.oid) as return_type,
  l.lanname as language,
  p.prosecdef as security_definer,
  owner_role.rolname as function_owner,
  p.proconfig as function_configuration,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
join pg_language l
  on l.oid = p.prolang
join pg_roles owner_role
  on owner_role.oid = p.proowner
where p.oid = 'public.create_admin_order(jsonb,jsonb)'::regprocedure;

select
  '03c_create_admin_order_explicit_grants' as result_set,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  (aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))).grantor::regrole as grantor,
  (aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))).grantee::regrole as grantee,
  (aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))).privilege_type as privilege_type,
  (aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))).is_grantable as is_grantable
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where p.oid = 'public.create_admin_order(jsonb,jsonb)'::regprocedure;

-- ============================================================
-- 4. ORDER-RELATED TRIGGERS AND TRIGGER FUNCTION DEFINITIONS
-- ============================================================
with trigger_rows as (
  select
    n.nspname as schema_name,
    cls.relname as table_name,
    t.tgname as trigger_name,
    pg_get_triggerdef(t.oid) as trigger_definition,
    pn.nspname as trigger_function_schema,
    p.proname as trigger_function_name,
    p.oid as trigger_function_oid
  from pg_trigger t
  join pg_class cls
    on cls.oid = t.tgrelid
  join pg_namespace n
    on n.oid = cls.relnamespace
  join pg_proc p
    on p.oid = t.tgfoid
  join pg_namespace pn
    on pn.oid = p.pronamespace
  where not t.tgisinternal
    and n.nspname = 'public'
    and cls.relname in (
      'orders',
      'order_items',
      'order_status_history',
      'order_change_history',
      'order_item_change_history',
      'order_fulfillment_batches',
      'order_fulfillment_items',
      'inventory_movements'
    )
)
select
  '04_order_related_triggers' as result_set,
  schema_name,
  table_name,
  trigger_name,
  trigger_definition,
  trigger_function_schema,
  trigger_function_name,
  pg_get_functiondef(trigger_function_oid) as trigger_function_definition
from trigger_rows
order by table_name, trigger_name;

-- ============================================================
-- 5. ORDER-RELATED CONSTRAINTS
-- ============================================================
select
  '05_order_related_constraints' as result_set,
  n.nspname as schema_name,
  cls.relname as table_name,
  con.conname as constraint_name,
  con.contype as constraint_type_code,
  case con.contype
    when 'p' then 'primary key'
    when 'f' then 'foreign key'
    when 'u' then 'unique'
    when 'c' then 'check'
    when 'x' then 'exclusion'
    else con.contype::text
  end as constraint_type,
  pg_get_constraintdef(con.oid, true) as constraint_definition,
  con.convalidated as is_validated,
  rn.nspname as referenced_schema,
  rcls.relname as referenced_table,
  con.confdeltype as fk_delete_action_code,
  con.confupdtype as fk_update_action_code
from pg_constraint con
join pg_class cls
  on cls.oid = con.conrelid
join pg_namespace n
  on n.oid = cls.relnamespace
left join pg_class rcls
  on rcls.oid = con.confrelid
left join pg_namespace rn
  on rn.oid = rcls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'orders',
    'order_items',
    'order_status_history',
    'order_change_history',
    'order_item_change_history',
    'order_fulfillment_batches',
    'order_fulfillment_items',
    'inventory_movements'
  )
order by cls.relname, con.contype, con.conname;

-- ============================================================
-- 6. INDEXES
-- ============================================================
select
  '06_order_related_indexes' as result_set,
  schemaname as schema_name,
  tablename as table_name,
  indexname as index_name,
  indexdef as index_definition
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'orders',
    'order_items',
    'order_status_history',
    'order_change_history',
    'order_fulfillment_batches',
    'order_fulfillment_items'
  )
order by tablename, indexname;

-- ============================================================
-- 7. RLS AND POLICIES
-- ============================================================
select
  '07_ordering_rls_tables' as result_set,
  n.nspname as schema_name,
  cls.relname as table_name,
  cls.relrowsecurity as rls_enabled,
  cls.relforcerowsecurity as rls_forced
from pg_class cls
join pg_namespace n
  on n.oid = cls.relnamespace
where n.nspname = 'public'
  and cls.relname in (
    'orders',
    'order_items',
    'cart_items',
    'order_status_history',
    'order_change_history',
    'order_item_change_history',
    'order_fulfillment_batches',
    'order_fulfillment_items',
    'inventory_movements'
  )
order by cls.relname;

select
  '07b_ordering_policies' as result_set,
  schemaname as schema_name,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles,
  cmd as command,
  qual as using_expression,
  with_check as with_check_expression
from pg_policies
where schemaname = 'public'
  and tablename in (
    'orders',
    'order_items',
    'cart_items',
    'order_status_history',
    'order_change_history',
    'order_item_change_history',
    'order_fulfillment_batches',
    'order_fulfillment_items',
    'inventory_movements'
  )
order by tablename, policyname;

select
  '07c_ordering_table_grants' as result_set,
  table_schema,
  table_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema = 'public'
  and table_name in (
    'orders',
    'order_items',
    'cart_items',
    'order_status_history',
    'order_change_history',
    'order_item_change_history',
    'order_fulfillment_batches',
    'order_fulfillment_items',
    'inventory_movements'
  )
  and grantee in ('anon', 'authenticated', 'service_role', 'public')
order by table_name, grantee, privilege_type;

-- ============================================================
-- 8. RELEVANT FUNCTIONS
-- ============================================================
select
  '08_relevant_ordering_functions' as result_set,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_function_result(p.oid) as return_type,
  l.lanname as language,
  p.prosecdef as security_definer
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
join pg_language l
  on l.oid = p.prolang
where n.nspname = 'public'
  and (
    p.proname ilike '%order%'
    or p.proname ilike '%fulfill%'
    or p.proname ilike '%inventory%'
    or p.proname ilike '%cart%'
    or p.proname ilike '%price%'
    or p.proname ilike '%discount%'
    or p.proname ilike '%surcharge%'
    or p.proname ilike '%receipt%'
    or pg_get_functiondef(p.oid) ilike '%orders%'
    or pg_get_functiondef(p.oid) ilike '%order_items%'
    or pg_get_functiondef(p.oid) ilike '%order_status_history%'
    or pg_get_functiondef(p.oid) ilike '%fulfillment%'
    or pg_get_functiondef(p.oid) ilike '%inventory_movements%'
    or pg_get_functiondef(p.oid) ilike '%create_admin_order%'
    or pg_get_functiondef(p.oid) ilike '%log_order_status_change%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

select
  '08b_relevant_ordering_function_definitions' as result_set,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  pg_get_functiondef(p.oid) as function_definition
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%order%'
    or p.proname ilike '%fulfill%'
    or p.proname ilike '%inventory%'
    or p.proname ilike '%cart%'
    or p.proname ilike '%price%'
    or p.proname ilike '%discount%'
    or p.proname ilike '%surcharge%'
    or p.proname ilike '%receipt%'
    or pg_get_functiondef(p.oid) ilike '%orders%'
    or pg_get_functiondef(p.oid) ilike '%order_items%'
    or pg_get_functiondef(p.oid) ilike '%order_status_history%'
    or pg_get_functiondef(p.oid) ilike '%fulfillment%'
    or pg_get_functiondef(p.oid) ilike '%inventory_movements%'
    or pg_get_functiondef(p.oid) ilike '%create_admin_order%'
    or pg_get_functiondef(p.oid) ilike '%log_order_status_change%'
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- ============================================================
-- 9. STATUS HISTORY DIAGNOSTIC
-- ============================================================
select
  '09_recent_order_status_history_chronological' as result_set,
  o.id as order_id,
  o.order_number,
  o.po_number,
  o.order_status as current_order_status,
  o.created_at as order_created_at,
  osh.id as status_history_id,
  osh.status as history_status,
  osh.changed_at,
  osh.changed_by,
  osh.notes
from public.orders o
left join public.order_status_history osh
  on osh.order_id = o.id
where o.id in (
  select recent.id
  from public.orders recent
  order by recent.created_at desc
  limit 20
)
order by o.created_at desc, osh.changed_at asc, osh.id asc;

with ordered_history as (
  select
    o.id as order_id,
    o.order_number,
    osh.id as status_history_id,
    osh.status,
    osh.changed_at,
    lag(osh.status) over (
      partition by osh.order_id
      order by osh.changed_at asc, osh.id asc
    ) as previous_status,
    lag(osh.changed_at) over (
      partition by osh.order_id
      order by osh.changed_at asc, osh.id asc
    ) as previous_changed_at
  from public.orders o
  join public.order_status_history osh
    on osh.order_id = o.id
)
select
  '09b_duplicate_consecutive_statuses' as result_set,
  order_id,
  order_number,
  status,
  previous_status,
  previous_changed_at,
  changed_at,
  status_history_id
from ordered_history
where status = previous_status
order by order_number, changed_at;

-- ============================================================
-- 10. TOTAL RECONCILIATION
-- ============================================================
select
  '10_order_total_reconciliation' as result_set,
  o.id,
  o.order_number,
  o.po_number,
  o.subtotal as header_subtotal,
  round(coalesce(sum(oi.line_subtotal), 0)::numeric, 2) as item_line_subtotal_sum,
  o.discount_total as header_discount_total,
  round(coalesce(sum(oi.discount_amount), 0)::numeric, 2) as item_discount_sum,
  o.surcharge_total as header_surcharge_total,
  round(coalesce(sum(oi.surcharge_amount), 0)::numeric, 2) as item_surcharge_sum,
  o.grand_total as header_grand_total,
  round(coalesce(sum(oi.line_total), 0)::numeric, 2) as item_line_total_sum,
  o.total_items as header_total_items,
  count(oi.id)::integer as item_row_count,
  o.total_quantity as header_total_quantity,
  coalesce(sum(oi.quantity), 0) as item_quantity_sum,
  (
    round(coalesce(o.subtotal, 0)::numeric, 2) is distinct from round(coalesce(sum(oi.line_subtotal), 0)::numeric, 2)
    or round(coalesce(o.discount_total, 0)::numeric, 2) is distinct from round(coalesce(sum(oi.discount_amount), 0)::numeric, 2)
    or round(coalesce(o.surcharge_total, 0)::numeric, 2) is distinct from round(coalesce(sum(oi.surcharge_amount), 0)::numeric, 2)
    or round(coalesce(o.grand_total, 0)::numeric, 2) is distinct from round(coalesce(sum(oi.line_total), 0)::numeric, 2)
    or coalesce(o.total_items, 0) is distinct from count(oi.id)::integer
    or round(coalesce(o.total_quantity, 0)::numeric, 3) is distinct from round(coalesce(sum(oi.quantity), 0)::numeric, 3)
  ) as has_mismatch
from public.orders o
left join public.order_items oi
  on oi.order_id = o.id
group by o.id
order by has_mismatch desc, o.created_at desc;

-- ============================================================
-- 11. QUANTITY DIAGNOSTIC
-- ============================================================
select
  '11_order_item_quantity_diagnostic' as result_set,
  oi.id,
  oi.order_id,
  o.order_number,
  oi.product_name,
  oi.quantity,
  oi.ordered_quantity,
  oi.available_quantity,
  oi.to_follow_quantity,
  oi.fulfilled_quantity,
  oi.billed_quantity,
  oi.cancelled_quantity,
  oi.fulfillment_status,
  oi.billing_status,
  (
    coalesce(oi.available_quantity, 0)
    + coalesce(oi.to_follow_quantity, 0)
    + coalesce(oi.cancelled_quantity, 0)
  ) as availability_component_sum,
  (
    coalesce(oi.fulfilled_quantity, 0)
    + coalesce(oi.to_follow_quantity, 0)
    + coalesce(oi.cancelled_quantity, 0)
  ) as fulfillment_component_sum,
  case
    when coalesce(oi.quantity, 0) <> coalesce(oi.ordered_quantity, 0) then true
    when coalesce(oi.quantity, 0) > 0 and coalesce(oi.ordered_quantity, 0) = 0 then true
    when (
      coalesce(oi.available_quantity, 0)
      + coalesce(oi.to_follow_quantity, 0)
      + coalesce(oi.cancelled_quantity, 0)
    ) > coalesce(oi.ordered_quantity, 0) then true
    when (
      coalesce(oi.fulfilled_quantity, 0)
      + coalesce(oi.to_follow_quantity, 0)
      + coalesce(oi.cancelled_quantity, 0)
    ) > coalesce(oi.ordered_quantity, 0) then true
    else false
  end as has_quantity_issue
from public.order_items oi
left join public.orders o
  on o.id = oi.order_id
where coalesce(oi.quantity, 0) <> coalesce(oi.ordered_quantity, 0)
   or (coalesce(oi.quantity, 0) > 0 and coalesce(oi.ordered_quantity, 0) = 0)
   or (
      coalesce(oi.available_quantity, 0)
      + coalesce(oi.to_follow_quantity, 0)
      + coalesce(oi.cancelled_quantity, 0)
    ) > coalesce(oi.ordered_quantity, 0)
   or (
      coalesce(oi.fulfilled_quantity, 0)
      + coalesce(oi.to_follow_quantity, 0)
      + coalesce(oi.cancelled_quantity, 0)
    ) > coalesce(oi.ordered_quantity, 0)
order by o.created_at desc, oi.sort_order nulls last, oi.created_at desc;

-- ============================================================
-- 12. LIVE NUMBER FORMATS
-- ============================================================
select
  '12_latest_order_number_formats' as result_set,
  order_number,
  po_number,
  created_at
from public.orders
order by created_at desc
limit 20;
