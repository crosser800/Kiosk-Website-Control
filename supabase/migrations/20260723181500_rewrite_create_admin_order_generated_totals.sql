create or replace function public.create_admin_order(p_order jsonb, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
  v_period text := to_char(v_created_at, 'YYMM');
  v_next integer;
  v_customer_type text;
  v_agent_id uuid;
  v_client_id uuid;
  v_branch_id uuid;
  v_delivery_term_id uuid;
  v_price_code text;
  v_preference_type text;
  v_payment_status text := 'Unpaid';
  v_client_name text;
  v_client_company text;
  v_client_address text;
  v_client_tin text;
  v_client_contact_number text;
  v_client_email text;
  v_metadata jsonb;
  v_subtotal numeric(12, 2) := 0;
  v_discount_total numeric(12, 2) := 0;
  v_surcharge_total numeric(12, 2) := 0;
  v_grand_total numeric(12, 2) := 0;
  v_total_items integer := 0;
  v_total_quantity numeric(12, 3) := 0;
  v_item record;
  v_product_id uuid;
  v_variation_id uuid;
  v_buying_option_id uuid;
  v_discount_id uuid;
  v_promo_id uuid;
  v_unit_option_id uuid;
  v_quantity numeric;
  v_unit_price numeric;
  v_discount_amount numeric;
  v_surcharge_amount numeric;
  v_free_quantity numeric;
  v_unit_quantity numeric;
  v_base_quantity numeric;
  v_discount_percent numeric;
  v_sort_order integer;
  v_is_billable boolean;
  v_text text;
begin
  if p_order is null or jsonb_typeof(p_order) <> 'object' then
    raise exception 'The submitted order payload is invalid.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'The submitted order items payload is invalid.';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one order item.';
  end if;

  if auth.uid() is null then
    raise exception 'Your session has expired. Please sign in again.';
  end if;

  select *
    into v_admin
  from public.admin_accounts
  where auth_user_id = auth.uid()
    and status = 'Active'
  limit 1;

  if v_admin.id is null then
    raise exception 'Your account is not authorized to create orders.';
  end if;

  v_customer_type := lower(trim(coalesce(p_order->>'customer_type', '')));
  if v_customer_type not in ('existing', 'guest') then
    raise exception 'Please select a valid customer type.';
  end if;

  v_text := nullif(trim(coalesce(p_order->>'agent_id', '')), '');
  if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'The submitted order contains an invalid identifier.';
  end if;
  v_agent_id := v_text::uuid;

  v_text := nullif(trim(coalesce(p_order->>'client_id', '')), '');
  if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'The submitted order contains an invalid identifier.';
  end if;
  v_client_id := v_text::uuid;

  v_text := nullif(trim(coalesce(p_order->>'branch_id', '')), '');
  if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'The submitted order contains an invalid identifier.';
  end if;
  v_branch_id := v_text::uuid;

  v_text := nullif(trim(coalesce(p_order->>'delivery_term_id', '')), '');
  if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'The submitted order contains an invalid identifier.';
  end if;
  v_delivery_term_id := v_text::uuid;

  if v_agent_id is null then
    raise exception 'Please select a valid agent.';
  end if;
  if v_branch_id is null then
    raise exception 'Please select a valid branch.';
  end if;
  if v_delivery_term_id is null then
    raise exception 'Please select valid terms.';
  end if;

  v_price_code := upper(trim(coalesce(p_order->>'price_code', '')));
  v_preference_type := nullif(trim(coalesce(p_order->>'preference_type', '')), '');
  if trim(coalesce(p_order->>'payment_status', '')) in ('Paid', 'Unpaid', 'Partial') then
    v_payment_status := trim(p_order->>'payment_status');
  end if;
  if v_price_code not in ('R1', 'R2', 'W1', 'W2', 'SP', 'CP') then
    raise exception 'Please select a valid price preference.';
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
  else
    v_client_id := null;
    v_client_name := trim(coalesce(p_order->'guest'->>'name', p_order->>'client_name', ''));
    v_client_company := nullif(trim(coalesce(p_order->'guest'->>'company', p_order->>'client_company', '')), '');
    v_client_address := nullif(trim(coalesce(p_order->'guest'->>'address', p_order->>'client_address', '')), '');
    v_client_tin := nullif(trim(coalesce(p_order->'guest'->>'tin', p_order->>'client_tin', '')), '');
    v_client_contact_number := nullif(trim(coalesce(p_order->'guest'->>'contact_number', p_order->>'client_contact_number', '')), '');
    v_client_email := nullif(trim(coalesce(p_order->'guest'->>'email', p_order->>'client_email', '')), '');

    if v_client_name = '' then
      raise exception 'Guest customer name is required.';
    end if;
  end if;

  v_metadata :=
    coalesce(p_order->'metadata', '{}'::jsonb)
    || jsonb_build_object(
      'source', 'admin',
      'created_from', 'admin_orders_page',
      'customer_type', v_customer_type,
      'branch_id', v_branch_id,
      'created_by_admin_id', v_admin.id
    );

  if v_customer_type = 'guest' then
    v_metadata := v_metadata || jsonb_build_object(
      'guest',
      jsonb_build_object(
        'name', v_client_name,
        'company', v_client_company,
        'address', v_client_address,
        'tin', v_client_tin,
        'contact_number', v_client_contact_number,
        'email', v_client_email
      )
    );
  end if;

  if to_regprocedure('public.next_order_number_pair(timestamptz)') is not null then
    execute 'select order_number, po_number from public.next_order_number_pair($1)'
      into v_order_number, v_po_number
      using v_created_at
      ;
  else
    perform pg_advisory_xact_lock(hashtext('public.orders:' || v_period));
    select coalesce(max(substring(o.order_number from '^BB-' || v_period || '-(\d{5})$')::integer), 0) + 1
      into v_next
    from public.orders o
    where o.order_number ~ ('^BB-' || v_period || '-\d{5}$');

    v_order_number := 'BB-' || v_period || '-' || lpad(v_next::text, 5, '0');
    v_po_number := 'PO-' || v_period || '-' || lpad(v_next::text, 5, '0');
  end if;

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
    coalesce(v_preference_type, v_price_code),
    v_price_code,
    v_client_name,
    v_client_company,
    v_client_address,
    v_client_tin,
    v_client_contact_number,
    v_client_email,
    0,
    0,
    0,
    0,
    0,
    0,
    'Placed',
    v_payment_status,
    nullif(trim(coalesce(p_order->>'remarks', '')), ''),
    v_metadata,
    v_created_at,
    v_created_at,
    v_created_at
  )
  returning id into v_order_id;

  for v_item in
    select value as item, ordinality::integer as item_index
    from jsonb_array_elements(p_items) with ordinality
  loop
    if jsonb_typeof(v_item.item) <> 'object' then
      raise exception 'One or more order items are invalid.';
    end if;

    v_text := nullif(trim(coalesce(v_item.item->>'product_id', '')), '');
    if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The submitted order contains an invalid identifier.';
    end if;
    v_product_id := v_text::uuid;

    v_text := nullif(trim(coalesce(v_item.item->>'variation_id', '')), '');
    if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The submitted order contains an invalid identifier.';
    end if;
    v_variation_id := v_text::uuid;

    v_text := nullif(trim(coalesce(v_item.item->>'buying_option_id', '')), '');
    if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The submitted order contains an invalid identifier.';
    end if;
    v_buying_option_id := v_text::uuid;

    v_text := nullif(trim(coalesce(v_item.item->>'discount_id', '')), '');
    if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The submitted order contains an invalid identifier.';
    end if;
    v_discount_id := v_text::uuid;

    v_text := nullif(trim(coalesce(v_item.item->>'promo_id', '')), '');
    if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The submitted order contains an invalid identifier.';
    end if;
    v_promo_id := v_text::uuid;

    v_text := nullif(trim(coalesce(v_item.item->>'unit_option_id', '')), '');
    if v_text is not null and v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'The submitted order contains an invalid identifier.';
    end if;
    v_unit_option_id := v_text::uuid;

    begin
      v_quantity := coalesce(nullif(trim(coalesce(v_item.item->>'quantity', '')), '')::numeric, 0);
      v_unit_price := coalesce(nullif(trim(coalesce(v_item.item->>'unit_price', '')), '')::numeric, 0);
      v_discount_amount := coalesce(nullif(trim(coalesce(v_item.item->>'discount_amount', '')), '')::numeric, 0);
      v_surcharge_amount := coalesce(nullif(trim(coalesce(v_item.item->>'surcharge_amount', '')), '')::numeric, 0);
      v_free_quantity := coalesce(nullif(trim(coalesce(v_item.item->>'free_quantity', '')), '')::numeric, 0);
      v_unit_quantity := coalesce(nullif(trim(coalesce(v_item.item->>'unit_quantity', '')), '')::numeric, 1);
      v_base_quantity := coalesce(nullif(trim(coalesce(v_item.item->>'base_quantity', '')), '')::numeric, v_quantity * v_unit_quantity);
      v_discount_percent := nullif(trim(coalesce(v_item.item->>'discount_percent', '')), '')::numeric;
      v_sort_order := coalesce(nullif(trim(coalesce(v_item.item->>'sort_order', '')), '')::integer, v_item.item_index);
      v_is_billable := coalesce(nullif(trim(coalesce(v_item.item->>'is_billable', '')), '')::boolean, true);
    exception when invalid_text_representation then
      raise exception 'One or more order items are invalid.';
    end;

    if v_product_id is null then
      raise exception 'One or more order items are invalid.';
    end if;
    if nullif(trim(coalesce(v_item.item->>'product_name', '')), '') is null then
      raise exception 'One or more order items are invalid.';
    end if;
    if v_quantity::text = 'NaN'
      or v_unit_price::text = 'NaN'
      or v_discount_amount::text = 'NaN'
      or v_surcharge_amount::text = 'NaN'
      or v_free_quantity::text = 'NaN'
      or v_unit_quantity::text = 'NaN'
      or v_base_quantity::text = 'NaN' then
      raise exception 'One or more order items are invalid.';
    end if;
    if v_quantity <= 0 then
      raise exception 'Invalid item quantity.';
    end if;
    if v_unit_price < 0 then
      raise exception 'Invalid item unit price.';
    end if;
    if v_discount_amount < 0 or v_surcharge_amount < 0 or v_free_quantity < 0 then
      raise exception 'One or more order items are invalid.';
    end if;
    if upper(trim(coalesce(v_item.item->>'price_code', ''))) <> v_price_code then
      raise exception 'One or more order items are invalid.';
    end if;
    if not exists (
      select 1
      from public.products p
      where p.id = v_product_id
        and coalesce(p.status, 'Active') = 'Active'
    ) then
      raise exception 'One or more order items are invalid.';
    end if;
    if v_variation_id is not null and not exists (
      select 1
      from public.product_variations pv
      where pv.id = v_variation_id
        and pv.product_id = v_product_id
    ) then
      raise exception 'One or more order items are invalid.';
    end if;
    if v_unit_option_id is not null and not exists (
      select 1
      from public.product_variation_unit_options vuo
      where vuo.id = v_unit_option_id
        and (v_variation_id is null or vuo.variation_id = v_variation_id)
    ) then
      raise exception 'One or more order items are invalid.';
    end if;
    if v_buying_option_id is not null and not exists (
      select 1
      from public.product_buying_options pbo
      where pbo.id = v_buying_option_id
        and pbo.product_id = v_product_id
        and (v_variation_id is null or pbo.variation_id is null or pbo.variation_id = v_variation_id)
    ) then
      raise exception 'One or more order items are invalid.';
    end if;

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
      sort_order,
      metadata,
      buying_option_id,
      unit_code,
      unit_label,
      unit_quantity,
      base_unit_label,
      base_quantity,
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
      admin_locked,
      admin_notes,
      to_follow_reason,
      last_edited_by,
      last_edited_at
    )
    values (
      v_order_id,
      v_product_id,
      v_variation_id,
      nullif(trim(coalesce(v_item.item->>'product_key', '')), ''),
      trim(v_item.item->>'product_name'),
      nullif(trim(coalesce(v_item.item->>'product_code', '')), ''),
      nullif(trim(coalesce(v_item.item->>'variant_label', '')), ''),
      nullif(trim(coalesce(v_item.item->>'branch_name', v_branch.branch_name, '')), ''),
      nullif(trim(coalesce(v_item.item->>'preference_type', v_preference_type, '')), ''),
      v_price_code,
      nullif(trim(coalesce(v_item.item->>'image_url', '')), ''),
      coalesce(v_item.item->>'image_path', ''),
      round(v_unit_price, 2),
      v_quantity,
      round(v_discount_amount, 2),
      round(v_surcharge_amount, 2),
      v_free_quantity,
      v_sort_order,
      coalesce(v_item.item->'metadata', '{}'::jsonb),
      v_buying_option_id,
      nullif(trim(coalesce(v_item.item->>'unit_code', '')), ''),
      nullif(trim(coalesce(v_item.item->>'unit_label', '')), ''),
      v_unit_quantity,
      nullif(trim(coalesce(v_item.item->>'base_unit_label', '')), ''),
      v_base_quantity,
      v_discount_id,
      nullif(trim(coalesce(v_item.item->>'discount_name', '')), ''),
      nullif(trim(coalesce(v_item.item->>'discount_type', '')), ''),
      v_discount_percent,
      v_promo_id,
      nullif(trim(coalesce(v_item.item->>'promo_label', '')), ''),
      coalesce(v_item.item->'pricing_snapshot', v_item.item->'metadata', '{}'::jsonb),
      v_unit_option_id,
      'pending',
      'unbilled',
      v_quantity,
      0,
      0,
      0,
      0,
      0,
      v_is_billable,
      false,
      nullif(trim(coalesce(v_item.item->>'admin_notes', '')), ''),
      nullif(trim(coalesce(v_item.item->>'to_follow_reason', '')), ''),
      v_admin.id,
      v_created_at
    );
  end loop;

  select
    round(coalesce(sum(oi.line_subtotal), 0)::numeric, 2),
    round(coalesce(sum(oi.discount_amount), 0)::numeric, 2),
    round(coalesce(sum(oi.surcharge_amount), 0)::numeric, 2),
    round(coalesce(sum(oi.line_total), 0)::numeric, 2),
    count(*)::integer,
    round(coalesce(sum(oi.quantity), 0)::numeric, 3)
  into
    v_subtotal,
    v_discount_total,
    v_surcharge_total,
    v_grand_total,
    v_total_items,
    v_total_quantity
  from public.order_items oi
  where oi.order_id = v_order_id;

  update public.orders
  set subtotal = v_subtotal,
      discount_total = v_discount_total,
      surcharge_total = v_surcharge_total,
      grand_total = v_grand_total,
      total_items = v_total_items,
      total_quantity = v_total_quantity,
      updated_at = v_created_at
  where id = v_order_id;

  insert into public.order_status_history(order_id, status, changed_at, changed_by, notes)
  select v_order_id, 'Placed', v_created_at, v_admin.id, 'Order created from admin'
  where not exists (
    select 1
    from public.order_status_history osh
    where osh.order_id = v_order_id
      and osh.status = 'Placed'
  );

  return jsonb_build_object(
    'success', true,
    'id', v_order_id,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'po_number', v_po_number,
    'order_status', 'Placed',
    'payment_status', v_payment_status,
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

revoke all on function public.create_admin_order(jsonb, jsonb) from public;
grant execute on function public.create_admin_order(jsonb, jsonb) to authenticated;
