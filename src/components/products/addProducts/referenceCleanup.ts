// Destructive cleanup of unit options / variations removed in a product save.
//
// Every foreign key into product_variation_unit_options is ON DELETE SET NULL
// (discount classes, surcharges, surcharge classes x2, cart_items,
// order_items, inventory_movements) and unit options cascade from
// product_variations. A physical delete therefore silently erases links in
// other tables unless every reference was checked in the same transaction.
//
// Deletion is only ever done server-side by the cleanup RPCs drafted in
// supabase/drafts/20261018000100_unit_option_reference_cleanup.sql (NOT applied)
// (lock rows, check all references, delete only unreferenced rows, retire
// the rest — one transaction). If that RPC is unavailable or fails, this
// module fails closed: it retires everything and deletes nothing.
import { supabase } from '../../../lib/supabase';

export type CleanupMode = 'server' | 'fail_closed';

export type CleanupOutcome = {
  mode: CleanupMode;
  deletedIds: string[];
  retiredIds: string[];
  // Server-reported references for retired rows, keyed by id (diagnostic).
  referencesById: Record<string, Record<string, number>>;
  serverError: string | null;
};

type RpcRow = {
  id: string;
  action: string;
  references: Record<string, number>;
};

function parseRpcRows(data: unknown, idColumn: string): RpcRow[] | null {
  if (!Array.isArray(data)) return null;
  const rows: RpcRow[] = [];
  for (const raw of data as Array<Record<string, unknown>>) {
    const id = String(raw?.[idColumn] ?? '');
    const action = String(raw?.action ?? '');
    if (!id || (action !== 'deleted' && action !== 'retired')) return null;
    const references = raw.reference_counts && typeof raw.reference_counts === 'object'
      ? (raw.reference_counts as Record<string, number>)
      : {};
    rows.push({ id, action, references });
  }
  return rows;
}

async function runCleanup(input: {
  rpcName: string;
  idColumn: string;
  productId: string;
  ids: string[];
  idsArgument: string;
  retireTable: string;
  retireValues: Record<string, unknown>;
  label: string;
  itemNoun: string;
  retiredLabel: string;
}): Promise<CleanupOutcome> {
  const ids = Array.from(new Set(input.ids.filter(Boolean)));
  if (ids.length === 0) {
    return { mode: 'server', deletedIds: [], retiredIds: [], referencesById: {}, serverError: null };
  }

  const { data, error } = await supabase.rpc(input.rpcName, {
    p_product_id: input.productId,
    [input.idsArgument]: ids,
  });
  const rows = error ? null : parseRpcRows(data, input.idColumn);
  if (rows) {
    // The RPC committed its own transaction; anything it did not report was
    // not touched by it (e.g. already gone), so nothing else to do here.
    return {
      mode: 'server',
      deletedIds: rows.filter((row) => row.action === 'deleted').map((row) => row.id),
      retiredIds: rows.filter((row) => row.action === 'retired').map((row) => row.id),
      referencesById: Object.fromEntries(
        rows.filter((row) => row.action === 'retired').map((row) => [row.id, row.references] as const),
      ),
      serverError: null,
    };
  }

  // Fail closed: no trustworthy, transactional reference check -> retire only.
  const serverError = error?.message ?? 'Unexpected cleanup response.';
  console.warn(
    `${input.label}: server-side reference check unavailable (${serverError}); retiring instead of deleting.`,
    { ids, error },
  );
  const { data: retiredRows, error: retireError } = await supabase
    .from(input.retireTable)
    .update(input.retireValues)
    .in('id', ids)
    .select('id');
  if (retireError) {
    throw new Error(retireError.message);
  }
  // An update that matches fewer rows than requested (e.g. blocked by a
  // policy) returns no error; never report those rows as retired.
  const retiredIdSet = new Set(((retiredRows ?? []) as Array<Record<string, unknown>>).map((row) => String(row.id)));
  const notRetired = ids.filter((id) => !retiredIdSet.has(id));
  if (notRetired.length > 0) {
    console.error(`${input.label}: rows not retired`, { notRetired });
    throw new Error(
      `${notRetired.length} removed ${input.itemNoun} could not be set to ${input.retiredLabel} and may still be active. ` +
        'Nothing was deleted. Save again, or reload the product to check.',
    );
  }
  return { mode: 'fail_closed', deletedIds: [], retiredIds: ids, referencesById: {}, serverError };
}

export function cleanupRemovedUnitOptions(productId: string, unitOptionIds: string[]) {
  return runCleanup({
    rpcName: 'cleanup_removed_unit_options',
    idColumn: 'unit_option_id',
    productId,
    ids: unitOptionIds,
    idsArgument: 'p_unit_option_ids',
    retireTable: 'product_variation_unit_options',
    retireValues: { status: 'Inactive', is_orderable: false },
    label: 'Unit option cleanup',
    itemNoun: 'unit option(s)',
    retiredLabel: 'Inactive',
  });
}

export function cleanupRemovedVariations(productId: string, variationIds: string[]) {
  return runCleanup({
    rpcName: 'cleanup_removed_variations',
    idColumn: 'variation_id',
    productId,
    ids: variationIds,
    idsArgument: 'p_variation_ids',
    retireTable: 'product_variations',
    retireValues: { availability: 'Unavailable' },
    label: 'Variation cleanup',
    itemNoun: 'variation row(s)',
    retiredLabel: 'Unavailable',
  });
}
