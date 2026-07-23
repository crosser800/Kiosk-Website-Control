create table if not exists public.order_number_counters (
  period_key text primary key,
  last_value integer not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.next_order_number_pair(p_created_at timestamptz default now())
returns table(order_number text, po_number text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period text := to_char(p_created_at, 'YYMM');
  v_next integer;
begin
  insert into public.order_number_counters(period_key, last_value, updated_at)
  values (
    v_period,
    coalesce((
      select max(substring(o.order_number from '^BB-' || v_period || '-(\d{5})$')::integer)
      from public.orders o
      where o.order_number ~ ('^BB-' || v_period || '-\d{5}$')
    ), 0) + 1,
    now()
  )
  on conflict (period_key) do update
    set last_value = public.order_number_counters.last_value + 1,
        updated_at = now()
  returning last_value into v_next;

  order_number := 'BB-' || v_period || '-' || lpad(v_next::text, 5, '0');
  po_number := 'PO-' || v_period || '-' || lpad(v_next::text, 5, '0');
  return next;
end;
$$;

create or replace function public.create_admin_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin public.admin_accounts%rowtype;
  v_agent public.agent_accounts%rowtype;
  v_client public.agent_clients%rowtype;
  v_branch record;
  v_term record;
  v_created_at timestamptz := now();
  v_order_id uuid;
  v_order_number text;
  v_po_number text;
  v_customer_type text := lower(trim(coalesce(p_order->>'customer_type', '')));
  v_agent_id uuid;
  v_client_id uuid;
  v_branch_id uuid;
  v_delivery_term_id uuid;
  v_price_code text := upper(trim(coalesce(p_order->>'price_code', '')));
  v_preference_type text := trim(coalesce(p_order->>'preference_type', ''));
  v_client_name text;
  v_client_company text;
  v_client_address text;
  v_client_tin text;
  v_client_contact_number text;
  v_client_email text;
  v_subtotal numeric(12, 2);
  v_discount_total numeric(12, 2);
  v_surcharge_total numeric(12, 2);
  v_grand_total numeric(12, 2);
  v_total_items integer;
  v_total_quantity numeric(12, 3);
begin
  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.';
  end if;

  select *
    into v_admin
  from public.admin_accounts
  where auth_user_id = auth.uid()
    and status = 'Active'
  limit 1;

  if v_admin.id is null or not (
    coalesce(v_admin.is_system_owner, false)
    or lower(coalesce(v_admin.role, '')) in ('admin', 'super_admin', 'system_owner')
  ) then
    raise exception 'Your account is not authorized to create orders.';
  end if;

  begin
    v_agent_id := nullif(p_order->>'agent_id', '')::uuid;
    v_branch_id := nullif(p_order->>'branch_id', '')::uuid;
    v_delivery_term_id := nullif(p_order->>'delivery_term_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'The submitted order contains an invalid identifier.';
  end;

  if v_agent_id is null then
    raise exception 'Please select a valid agent.';
  end if;
  if v_branch_id is null then
    raise exception 'Please select a valid branch.';
  end if;
  if v_delivery_term_id is null then
    raise exception 'Please select valid terms.';
  end if;
  if v_price_code not in ('R1', 'R2', 'W1', 'W2', 'SP', 'CP') then
    raise exception 'Please select a valid price preference.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one order item.';
  end if;

  select *
    into v_agent
  from public.agent_accounts
  where id = v_agent_id
    and status = 'Active';

  if v_agent.id is null then
    raise exception 'The selected agent is unavailable.';
  end if;

  if not exists (
    select 1
    from public.agent_price_access apa
    where apa.agent_id = v_agent_id
      and upper(trim(apa.price_class)) = v_price_code
  ) then
    raise exception 'The selected agent cannot use this price preference.';
  end if;

  select id, branch_name, branch_code
    into v_branch
  from public.branches
  where id = v_branch_id
    and status = 'Active';

  if v_branch.id is null then
    raise exception 'The selected branch is unavailable.';
  end if;

  select id
    into v_term
  from public.delivery_terms
  where id = v_delivery_term_id
    and status = 'Active';

  if v_term.id is null then
    raise exception 'The selected terms are unavailable.';
  end if;

  if v_customer_type = 'existing' then
    begin
      v_client_id := nullif(p_order->>'client_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Please select a valid client.';
    end;

    if v_client_id is null then
      raise exception 'Please select a valid client.';
    end if;

    select *
      into v_client
    from public.agent_clients
    where id = v_client_id
      and agent_id = v_agent_id
      and status = 'Active';

    if v_client.id is null then
      raise exception 'The selected client is unavailable for this agent.';
    end if;

    v_client_name := trim(coalesce(v_client.client_name, ''));
    v_client_company := nullif(trim(coalesce(v_client.company_name, '')), '');
    v_client_address := nullif(trim(coalesce(v_client.address, '')), '');
    v_client_tin := nullif(trim(coalesce(v_client.tin, '')), '');
    v_client_contact_number := nullif(trim(coalesce(v_client.contact_number, v_client.contact_person, '')), '');
    v_client_email := nullif(trim(coalesce(v_client.email, '')), '');
  elsif v_customer_type = 'guest' then
    v_client_id := null;
    v_client_name := trim(coalesce(p_order->'guest'->>'name', ''));
    v_client_company := nullif(trim(coalesce(p_order->'guest'->>'company', '')), '');
    v_client_address := nullif(trim(coalesce(p_order->'guest'->>'address', '')), '');
    v_client_tin := nullif(trim(coalesce(p_order->'guest'->>'tin', '')), '');
    v_client_contact_number := nullif(trim(coalesce(p_order->'guest'->>'contact_number', '')), '');
    v_client_email := nullif(trim(coalesce(p_order->'guest'->>'email', '')), '');

    if v_client_name = '' then
      raise exception 'Guest customer name is required.';
    end if;
  else
    raise exception 'Please select a valid customer type.';
  end if;

  with submitted_items as (
    select *
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      variation_id uuid,
      product_key text,
      product_name text,
      product_code text,
      variant_label text,
      branch_name text,
      preference_type text,
      price_code text,
      image_url text,
      image_path text,
      unit_price numeric,
      quantity numeric,
      discount_amount numeric,
      surcharge_amount numeric,
      free_quantity numeric,
      line_subtotal numeric,
      line_total numeric,
      sort_order integer,
      metadata jsonb,
      buying_option_id uuid,
      unit_code text,
      unit_label text,
      unit_quantity numeric,
      base_unit_label text,
      base_quantity numeric,
      gross_total numeric,
      discount_id uuid,
      discount_name text,
      discount_type text,
      discount_percent numeric,
      promo_id uuid,
      promo_label text,
      pricing_snapshot jsonb,
      unit_option_id uuid,
      ordered_quantity numeric
    )
  ),
  invalid_items as (
    select *
    from submitted_items
    where product_id is null
       or product_name is null
       or trim(product_name) = ''
       or unit_price < 0
       or quantity <= 0
       or round(coalesce(line_subtotal, 0)::numeric, 2) <> round((coalesce(unit_price, 0) * coalesce(quantity, 0))::numeric, 2)
       or round(coalesce(line_total, 0)::numeric, 2) <> round(greatest(0, coalesce(line_subtotal, 0) - coalesce(discount_amount, 0) + coalesce(surcharge_amount, 0))::numeric, 2)
       or upper(trim(coalesce(price_code, ''))) <> v_price_code
  )
  select
    round(coalesce(sum(line_subtotal), 0)::numeric, 2),
    round(coalesce(sum(discount_amount), 0)::numeric, 2),
    round(coalesce(sum(surcharge_amount), 0)::numeric, 2),
    round(coalesce(sum(line_total), 0)::numeric, 2),
    count(*)::integer,
    coalesce(sum(quantity), 0)::numeric
  into
    v_subtotal,
    v_discount_total,
    v_surcharge_total,
    v_grand_total,
    v_total_items,
    v_total_quantity
  from submitted_items;

  if exists (
    select 1
    from jsonb_to_recordset(p_items) as item(
      product_id uuid,
      product_name text,
      price_code text,
      unit_price numeric,
      quantity numeric,
      discount_amount numeric,
      surcharge_amount numeric,
      line_subtotal numeric,
      line_total numeric
    )
    where product_id is null
       or product_name is null
       or trim(product_name) = ''
       or unit_price < 0
       or quantity <= 0
       or round(coalesce(line_subtotal, 0)::numeric, 2) <> round((coalesce(unit_price, 0) * coalesce(quantity, 0))::numeric, 2)
       or round(coalesce(line_total, 0)::numeric, 2) <> round(greatest(0, coalesce(line_subtotal, 0) - coalesce(discount_amount, 0) + coalesce(surcharge_amount, 0))::numeric, 2)
       or upper(trim(coalesce(price_code, ''))) <> v_price_code
  ) then
    raise exception 'One or more order items are invalid.';
  end if;

  if v_total_items <= 0 then
    raise exception 'Add at least one order item.';
  end if;

  if round(coalesce((p_order->>'subtotal')::numeric, 0), 2) <> v_subtotal
    or round(coalesce((p_order->>'discount_total')::numeric, 0), 2) <> v_discount_total
    or round(coalesce((p_order->>'surcharge_total')::numeric, 0), 2) <> v_surcharge_total
    or round(coalesce((p_order->>'grand_total')::numeric, 0), 2) <> v_grand_total then
    raise exception 'The submitted order totals do not match the item totals.';
  end if;

  select pair.order_number, pair.po_number
    into v_order_number, v_po_number
  from public.next_order_number_pair(v_created_at) as pair;

  insert into public.orders (
    order_number,
    po_number,
    agent_id,
    client_id,
    delivery_term_id,
    order_date,
    order_time,
    branch_name,
    branch_code,
    preference_type,
    price_code,
    client_name,
    client_company,
    client_address,
    client_tin,
    client_contact_number,
    client_email,
    subtotal,
    discount_total,
    surcharge_total,
    grand_total,
    total_items,
    total_quantity,
    order_status,
    payment_status,
    remarks,
    metadata,
    placed_at,
    created_at,
    updated_at
  )
  values (
    v_order_number,
    v_po_number,
    v_agent_id,
    v_client_id,
    v_delivery_term_id,
    v_created_at::date,
    v_created_at::time,
    v_branch.branch_name,
    v_branch.branch_code,
    v_preference_type,
    v_price_code,
    v_client_name,
    v_client_company,
    v_client_address,
    v_client_tin,
    v_client_contact_number,
    v_client_email,
    v_subtotal,
    v_discount_total,
    v_surcharge_total,
    v_grand_total,
    v_total_items,
    v_total_quantity,
    'Placed',
    'Unpaid',
    nullif(trim(coalesce(p_order->>'remarks', '')), ''),
    coalesce(p_order->'metadata', '{}'::jsonb) || jsonb_build_object(
      'source', 'admin',
      'created_from', 'admin_orders_page',
      'created_by_admin_account_id', v_admin.id
    ),
    v_created_at,
    v_created_at,
    v_created_at
  )
  returning id into v_order_id;

  insert into public.order_items (
    order_id,
    product_id,
    variation_id,
    product_key,
    product_name,
    product_code,
    variant_label,
    branch_name,
    preference_type,
    price_code,
    image_url,
    image_path,
    unit_price,
    quantity,
    discount_amount,
    surcharge_amount,
    free_quantity,
    line_subtotal,
    line_total,
    sort_order,
    metadata,
    buying_option_id,
    unit_code,
    unit_label,
    unit_quantity,
    base_unit_label,
    base_quantity,
    gross_total,
    discount_id,
    discount_name,
    discount_type,
    discount_percent,
    promo_id,
    promo_label,
    pricing_snapshot,
    unit_option_id,
    fulfillment_status,
    billing_status,
    ordered_quantity,
    available_quantity,
    to_follow_quantity,
    fulfilled_quantity,
    billed_quantity,
    cancelled_quantity,
    is_billable,
    admin_locked
  )
  select
    v_order_id,
    item.product_id,
    item.variation_id,
    item.product_key,
    item.product_name,
    nullif(item.product_code, ''),
    nullif(item.variant_label, ''),
    nullif(item.branch_name, ''),
    nullif(item.preference_type, ''),
    item.price_code,
    nullif(item.image_url, ''),
    coalesce(item.image_path, ''),
    round(item.unit_price::numeric, 2),
    item.quantity,
    round(coalesce(item.discount_amount, 0)::numeric, 2),
    round(coalesce(item.surcharge_amount, 0)::numeric, 2),
    coalesce(item.free_quantity, 0),
    round(item.line_subtotal::numeric, 2),
    round(item.line_total::numeric, 2),
    coalesce(item.sort_order, 0),
    coalesce(item.metadata, '{}'::jsonb),
    item.buying_option_id,
    nullif(item.unit_code, ''),
    nullif(item.unit_label, ''),
    coalesce(item.unit_quantity, 1),
    nullif(item.base_unit_label, ''),
    coalesce(item.base_quantity, item.quantity),
    round(coalesce(item.gross_total, item.line_subtotal)::numeric, 2),
    item.discount_id,
    nullif(item.discount_name, ''),
    nullif(item.discount_type, ''),
    item.discount_percent,
    item.promo_id,
    nullif(item.promo_label, ''),
    coalesce(item.pricing_snapshot, item.metadata, '{}'::jsonb),
    item.unit_option_id,
    'pending',
    'unbilled',
    coalesce(item.ordered_quantity, item.quantity),
    0,
    0,
    0,
    0,
    0,
    true,
    false
  from jsonb_to_recordset(p_items) as item(
    product_id uuid,
    variation_id uuid,
    product_key text,
    product_name text,
    product_code text,
    variant_label text,
    branch_name text,
    preference_type text,
    price_code text,
    image_url text,
    image_path text,
    unit_price numeric,
    quantity numeric,
    discount_amount numeric,
    surcharge_amount numeric,
    free_quantity numeric,
    line_subtotal numeric,
    line_total numeric,
    sort_order integer,
    metadata jsonb,
    buying_option_id uuid,
    unit_code text,
    unit_label text,
    unit_quantity numeric,
    base_unit_label text,
    base_quantity numeric,
    gross_total numeric,
    discount_id uuid,
    discount_name text,
    discount_type text,
    discount_percent numeric,
    promo_id uuid,
    promo_label text,
    pricing_snapshot jsonb,
    unit_option_id uuid,
    ordered_quantity numeric
  );

  insert into public.order_status_history(order_id, status, changed_at, changed_by, notes)
  select v_order_id, 'Placed', v_created_at, v_admin.id, 'Order created from admin'
  where not exists (
    select 1
    from public.order_status_history
    where order_id = v_order_id
      and status = 'Placed'
  );

  return jsonb_build_object(
    'id', v_order_id,
    'order_number', v_order_number,
    'po_number', v_po_number,
    'order_status', 'Placed',
    'payment_status', 'Unpaid',
    'client_name', v_client_name,
    'subtotal', v_subtotal,
    'discount_total', v_discount_total,
    'surcharge_total', v_surcharge_total,
    'grand_total', v_grand_total,
    'total_items', v_total_items,
    'total_quantity', v_total_quantity,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.next_order_number_pair(timestamptz) from public;
revoke all on function public.create_admin_order(jsonb, jsonb) from public;
grant execute on function public.create_admin_order(jsonb, jsonb) to authenticated;
