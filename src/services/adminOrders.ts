import { supabase } from '../lib/supabase';

export type CustomerType = 'existing' | 'guest';

export type AdminOrderCreatePayload = {
  agent_id: string;
  client_id: string | null;
  delivery_term_id: string;
  customer_type: CustomerType;
  branch_id: string;
  branch_name: string;
  branch_code: string | null;
  preference_type: string;
  price_code: string | null;
  client_name: string;
  client_company: string | null;
  client_address: string | null;
  client_tin: string | null;
  client_contact_number: string | null;
  client_email: string | null;
  remarks: string | null;
  subtotal: number;
  discount_total: number;
  surcharge_total: number;
  grand_total: number;
  metadata: {
    source: 'admin';
    created_from: 'admin_orders_page';
  };
  guest?: {
    name: string;
    company: string | null;
    address: string | null;
    tin: string | null;
    contact_number: string | null;
    email: string | null;
  } | null;
};

export type AdminOrderItemCreatePayload = {
  product_id: string | null;
  variation_id: string | null;
  product_key: string;
  product_name: string;
  product_code: string | null;
  variant_label: string | null;
  branch_name: string | null;
  preference_type: string;
  price_code: string | null;
  image_url: string | null;
  image_path: string;
  unit_price: number;
  quantity: number;
  discount_amount: number;
  surcharge_amount: number;
  free_quantity: number;
  sort_order: number;
  metadata: Record<string, unknown>;
  buying_option_id: string | null;
  unit_code: string | null;
  unit_label: string | null;
  unit_quantity: number;
  base_unit_label: string | null;
  base_quantity: number;
  discount_id: string | null;
  discount_name: string | null;
  discount_type: string | null;
  discount_percent: number | null;
  promo_id: string | null;
  promo_label: string | null;
  pricing_snapshot: Record<string, unknown>;
  unit_option_id: string | null;
  ordered_quantity: number;
  is_billable: boolean;
  admin_notes: string | null;
  to_follow_reason: string | null;
};

export type AdminOrderCreateResult = {
  id: string;
  order_number: string;
  po_number: string;
  order_status: string;
  payment_status: string;
  client_name: string;
  subtotal: number;
  discount_total: number;
  surcharge_total: number;
  grand_total: number;
  total_items: number;
  total_quantity: number;
  created_at: string;
};

type SupabaseRpcError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
  status?: number;
  name?: string;
};

function normalizeCreateResult(data: unknown): AdminOrderCreateResult {
  const value = Array.isArray(data) ? data[0] : data;
  if (!value || typeof value !== 'object') {
    throw new Error('The order was created, but the response could not be read.');
  }

  const record = value as Partial<AdminOrderCreateResult>;
  return {
    id: String(record.id ?? ''),
    order_number: String(record.order_number ?? ''),
    po_number: String(record.po_number ?? ''),
    order_status: String(record.order_status ?? ''),
    payment_status: String(record.payment_status ?? ''),
    client_name: String(record.client_name ?? ''),
    subtotal: Number(record.subtotal ?? 0),
    discount_total: Number(record.discount_total ?? 0),
    surcharge_total: Number(record.surcharge_total ?? 0),
    grand_total: Number(record.grand_total ?? 0),
    total_items: Number(record.total_items ?? 0),
    total_quantity: Number(record.total_quantity ?? 0),
    created_at: String(record.created_at ?? ''),
  };
}

function toSafeErrorMessage(error: SupabaseRpcError | Error | unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code ?? '') : '';
  const message = typeof error === 'object' && error && 'message' in error
    ? String(error.message ?? '')
    : error instanceof Error
      ? error.message
      : String(error ?? '');
  const details = typeof error === 'object' && error && 'details' in error ? String(error.details ?? '') : '';
  const combined = [message, details].filter(Boolean).join(' ');

  if (code === 'PGRST202') {
    return 'The order creation service is not available. Please refresh and try again.';
  }
  if (code === '42501') {
    return 'You are not authorized to create orders.';
  }
  if (code === '23505') {
    return 'A duplicate order or P.O. number was detected. Please try again.';
  }
  if (code === '23503') {
    return 'One of the selected records is no longer available.';
  }
  if (/failed to fetch|network|load failed|unable to connect/i.test(combined)) {
    return 'Unable to connect to the server. Please check your connection and try again.';
  }

  const allowedMessages = [
    'Your session has expired. Please sign in again.',
    'Your account is not authorized to create orders.',
    'You are not authorized to create orders.',
    'The submitted order contains an invalid identifier.',
    'Please select a valid agent.',
    'Please select a valid branch.',
    'Please select valid terms.',
    'Please select a valid price preference.',
    'Add at least one order item.',
    'The selected agent is unavailable.',
    'The selected agent cannot use this price preference.',
    'The selected branch is unavailable.',
    'The selected terms are unavailable.',
    'Please select a valid client.',
    'The selected client is unavailable for this agent.',
    'Guest customer name is required.',
    'Please select a valid customer type.',
    'One or more order items are invalid.',
    'The submitted order totals do not match the item totals.',
    'Invalid item quantity.',
  ];
  const normalized = combined.toLowerCase();
  const safeMatch = allowedMessages.find((safeMessage) =>
    normalized.includes(safeMessage.toLowerCase()),
  );

  if (safeMatch) {
    return safeMatch;
  }

  if (import.meta.env.DEV) {
    console.error('create_admin_order failed', { code, message, details });
  }

  return 'The order could not be created. Please try again.';
}

export async function createAdminOrder(
  orderPayload: AdminOrderCreatePayload,
  itemsPayload: AdminOrderItemCreatePayload[],
) {
  if (import.meta.env.DEV) {
    console.info('[admin-orders] Supabase project', {
      url: import.meta.env.VITE_SUPABASE_URL,
    });
    console.info('[admin-orders] submitting payload', {
      customer_type: orderPayload.customer_type,
      branch_id: orderPayload.branch_id,
      branch_name: orderPayload.branch_name,
      branch_code: orderPayload.branch_code,
      agent_id: orderPayload.agent_id,
      client_id: orderPayload.client_id,
      delivery_term_id: orderPayload.delivery_term_id,
      price_code: orderPayload.price_code,
      has_guest: Boolean(orderPayload.guest),
      item_count: itemsPayload.length,
    });
  }

  const { data, error } = await supabase.rpc('create_admin_order', {
    p_order: orderPayload,
    p_items: itemsPayload,
  });

  if (error) {
    if (import.meta.env.DEV) {
      const diagnosticError = {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
        status: 'status' in error ? error.status : null,
        name: 'name' in error ? error.name : null,
      };

      console.error('[admin-orders] RPC failure', diagnosticError);
      console.error(
        '[admin-orders] RPC failure JSON',
        JSON.stringify(
          {
            code: error?.code ?? null,
            message: error?.message ?? null,
            details: error?.details ?? null,
            hint: error?.hint ?? null,
            status: 'status' in error ? error.status : null,
          },
          null,
          2,
        ),
      );
      console.error('create_admin_order failed', {
        ...diagnosticError,
        raw: error,
        orderPayload: sanitizeOrderPayloadForDiagnostics(orderPayload),
        itemCount: itemsPayload.length,
        itemSummary: summarizeItemsForDiagnostics(itemsPayload),
        firstItem: sanitizeItemPayloadForDiagnostics(itemsPayload[0]),
      });
    }

    throw new Error(toSafeErrorMessage(error));
  }

  return normalizeCreateResult(data);
}

function sanitizeOrderPayloadForDiagnostics(orderPayload: AdminOrderCreatePayload) {
  return {
    agent_id: orderPayload.agent_id,
    client_id: orderPayload.client_id,
    delivery_term_id: orderPayload.delivery_term_id,
    customer_type: orderPayload.customer_type,
    branch_id: orderPayload.branch_id,
    branch_name: orderPayload.branch_name,
    branch_code: orderPayload.branch_code,
    preference_type: orderPayload.preference_type,
    price_code: orderPayload.price_code,
    client_name: redactText(orderPayload.client_name),
    client_company: redactNullableText(orderPayload.client_company),
    client_address: redactNullableText(orderPayload.client_address),
    client_tin: redactNullableText(orderPayload.client_tin),
    client_contact_number: redactNullableText(orderPayload.client_contact_number),
    client_email: redactNullableText(orderPayload.client_email),
    remarks: redactNullableText(orderPayload.remarks),
    subtotal: orderPayload.subtotal,
    discount_total: orderPayload.discount_total,
    surcharge_total: orderPayload.surcharge_total,
    grand_total: orderPayload.grand_total,
    metadata: orderPayload.metadata,
    has_guest: Boolean(orderPayload.guest),
  };
}

function summarizeItemsForDiagnostics(itemsPayload: AdminOrderItemCreatePayload[]) {
  return {
    count: itemsPayload.length,
    quantity: itemsPayload.reduce((sum, item) => sum + item.quantity, 0),
    free_quantity: itemsPayload.reduce((sum, item) => sum + item.free_quantity, 0),
    discount_amount: roundDiagnosticMoney(itemsPayload.reduce((sum, item) => sum + item.discount_amount, 0)),
    surcharge_amount: roundDiagnosticMoney(itemsPayload.reduce((sum, item) => sum + item.surcharge_amount, 0)),
  };
}

function sanitizeItemPayloadForDiagnostics(item: AdminOrderItemCreatePayload | undefined) {
  if (!item) {
    return null;
  }

  return {
    product_id: item.product_id,
    variation_id: item.variation_id,
    product_key: item.product_key,
    product_name: item.product_name,
    product_code: item.product_code,
    variant_label: item.variant_label,
    branch_name: item.branch_name,
    preference_type: item.preference_type,
    price_code: item.price_code,
    image_url: item.image_url,
    image_path: item.image_path,
    unit_price: item.unit_price,
    quantity: item.quantity,
    discount_amount: item.discount_amount,
    surcharge_amount: item.surcharge_amount,
    free_quantity: item.free_quantity,
    sort_order: item.sort_order,
    metadata_keys: Object.keys(item.metadata ?? {}),
    buying_option_id: item.buying_option_id,
    unit_code: item.unit_code,
    unit_label: item.unit_label,
    unit_quantity: item.unit_quantity,
    base_unit_label: item.base_unit_label,
    base_quantity: item.base_quantity,
    discount_id: item.discount_id,
    discount_name: item.discount_name,
    discount_type: item.discount_type,
    discount_percent: item.discount_percent,
    promo_id: item.promo_id,
    promo_label: item.promo_label,
    pricing_snapshot_keys: Object.keys(item.pricing_snapshot ?? {}),
    unit_option_id: item.unit_option_id,
    ordered_quantity: item.ordered_quantity,
    is_billable: item.is_billable,
    admin_notes: item.admin_notes,
    to_follow_reason: item.to_follow_reason,
  };
}

function redactNullableText(value: string | null) {
  return value ? '[redacted]' : null;
}

function redactText(value: string) {
  return value ? '[redacted]' : '';
}

function roundDiagnosticMoney(value: number) {
  return Math.round(value * 100) / 100;
}
