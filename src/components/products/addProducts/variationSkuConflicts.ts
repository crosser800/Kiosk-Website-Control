// Logical-variation SKU conflict detection for the product editor.
//
// A SKU is "claimed" by one logical variation (one product_variation_groups
// row, shared by the six R1/R2/W1/W2/SP/CP product_variations rows). Only a
// group that still has at least one product_variations row is a live owner:
// a group left behind after its variation rows were deleted (an orphan) must
// never block a save, and is never offered as a navigation target.
//
// classifyVariationSkuConflicts is pure (tested in
// tests/variationSkuConflicts.test.ts); findVariationSkuConflicts loads its
// inputs with read-only queries.
import { supabase } from '../../../lib/supabase';

export type VariationSkuClaim = {
  // Editor card key (getLogicalVariationKey) of the variation making the claim.
  cardKey: string;
  variationName: string;
  skuCode: string;
  existingGroupId: string | null;
};

export type SkuGroupRow = {
  id: string;
  product_id: string;
  variation_name: string;
  sku_code: string;
  normalized_sku_code: string;
};

export type SkuGroupVariationRow = {
  variation_group_id: string;
  product_id: string;
  availability: string | null;
};

export type SkuProductRow = {
  id: string;
  product_name: string | null;
  status: string | null;
  category_id: string | null;
};

// same_product: a saved variation of the product being edited.
// other_product: a saved variation of a different product.
// same_save: another unsaved/changed variation in this same editor save.
export type VariationSkuConflictScope = 'same_product' | 'other_product' | 'same_save';

export type VariationSkuConflict = {
  sku: string;
  normalizedSku: string;
  claimCardKey: string;
  claimVariationName: string;
  scope: VariationSkuConflictScope;
  productId: string;
  productName: string;
  productStatus: string;
  categoryId: string | null;
  variationGroupId: string | null;
  variationName: string;
  existingSku: string;
  // Available / Unavailable / Mixed across the group's price-class rows;
  // Unsaved for a same_save claim that has no database rows yet.
  recordStatus: 'Available' | 'Unavailable' | 'Mixed' | 'Unsaved';
  liveRowCount: number;
  // Card to select for same_product / same_save conflicts. null when the
  // owning variation is no longer in the editor (removed in this edit but
  // still saved in the database).
  targetCardKey: string | null;
};

export type OrphanSkuGroup = {
  groupId: string;
  productId: string;
  variationName: string;
  sku: string;
};

export type VariationSkuConflictResult = {
  conflicts: VariationSkuConflict[];
  // Orphan groups that hold a claimed SKU and were ignored. Diagnostic only.
  ignoredOrphans: OrphanSkuGroup[];
};

export function normalizeVariationSku(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeVariationName(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function summarizeAvailability(rows: SkuGroupVariationRow[]): VariationSkuConflict['recordStatus'] {
  const unavailable = rows.filter(
    (row) => String(row.availability ?? '').trim().toLowerCase() === 'unavailable',
  ).length;
  if (unavailable === 0) return 'Available';
  return unavailable === rows.length ? 'Unavailable' : 'Mixed';
}

export function classifyVariationSkuConflicts(input: {
  productId: string;
  claims: VariationSkuClaim[];
  groups: SkuGroupRow[];
  groupVariationRows: SkuGroupVariationRow[];
  products: SkuProductRow[];
}): VariationSkuConflictResult {
  const claims = input.claims
    .map((claim) => ({ ...claim, normalizedSku: normalizeVariationSku(claim.skuCode) }))
    .filter((claim) => claim.normalizedSku);

  const rowsByGroupId = new Map<string, SkuGroupVariationRow[]>();
  input.groupVariationRows.forEach((row) => {
    const groupId = String(row.variation_group_id ?? '');
    if (!groupId) return;
    rowsByGroupId.set(groupId, [...(rowsByGroupId.get(groupId) ?? []), row]);
  });
  const productsById = new Map(input.products.map((product) => [String(product.id), product] as const));
  const groupsBySku = new Map<string, SkuGroupRow[]>();
  input.groups.forEach((group) => {
    const sku = normalizeVariationSku(group.normalized_sku_code || group.sku_code);
    if (!sku) return;
    groupsBySku.set(sku, [...(groupsBySku.get(sku) ?? []), group]);
  });
  const claimByGroupId = new Map(
    claims.filter((claim) => claim.existingGroupId).map((claim) => [String(claim.existingGroupId), claim] as const),
  );
  const ownsSkuInDatabase = (claim: (typeof claims)[number]) =>
    Boolean(claim.existingGroupId) &&
    (groupsBySku.get(claim.normalizedSku) ?? []).some((group) => group.id === claim.existingGroupId);

  const conflicts: VariationSkuConflict[] = [];
  const ignoredOrphans = new Map<string, OrphanSkuGroup>();
  const productName = (productId: string) => String(productsById.get(productId)?.product_name ?? '').trim();

  claims.forEach((claim, claimIndex) => {
    // Unchanged SKU on an already-saved variation: never re-validated, so
    // legacy SKUs that are shared across live groups stay saveable.
    if (ownsSkuInDatabase(claim)) return;

    for (const group of groupsBySku.get(claim.normalizedSku) ?? []) {
      if (group.id === claim.existingGroupId) continue;
      const liveRows = rowsByGroupId.get(group.id) ?? [];
      if (liveRows.length === 0) {
        ignoredOrphans.set(group.id, {
          groupId: group.id,
          productId: group.product_id,
          variationName: group.variation_name,
          sku: group.sku_code,
        });
        continue;
      }

      const isSameProduct = group.product_id === input.productId;
      const owningClaim = claimByGroupId.get(group.id);
      // Another card in this save owns that group and is moving to a
      // different SKU, so the SKU is being released (e.g. swapping SKUs).
      if (owningClaim && owningClaim !== claim && owningClaim.normalizedSku !== claim.normalizedSku) {
        continue;
      }
      // A variation removed from the editor in this edit and re-added with
      // the same name and SKU: the group upsert reuses that same group.
      if (
        isSameProduct &&
        !owningClaim &&
        !claim.existingGroupId &&
        normalizeVariationName(group.variation_name) === normalizeVariationName(claim.variationName)
      ) {
        continue;
      }

      const product = productsById.get(group.product_id);
      conflicts.push({
        sku: claim.skuCode.trim(),
        normalizedSku: claim.normalizedSku,
        claimCardKey: claim.cardKey,
        claimVariationName: claim.variationName,
        scope: isSameProduct ? 'same_product' : 'other_product',
        productId: group.product_id,
        productName: productName(group.product_id),
        productStatus: String(product?.status ?? ''),
        categoryId: product?.category_id ? String(product.category_id) : null,
        variationGroupId: group.id,
        variationName: group.variation_name,
        existingSku: group.sku_code,
        recordStatus: summarizeAvailability(liveRows),
        liveRowCount: liveRows.length,
        targetCardKey: isSameProduct ? owningClaim?.cardKey ?? null : null,
      });
    }

    // Two new/changed variations in this save claiming the same SKU. Reported
    // once per pair (on the later claim).
    claims.slice(0, claimIndex).forEach((other) => {
      if (other.normalizedSku !== claim.normalizedSku || ownsSkuInDatabase(other)) return;
      conflicts.push({
        sku: claim.skuCode.trim(),
        normalizedSku: claim.normalizedSku,
        claimCardKey: claim.cardKey,
        claimVariationName: claim.variationName,
        scope: 'same_save',
        productId: input.productId,
        productName: productName(input.productId),
        productStatus: String(productsById.get(input.productId)?.status ?? ''),
        categoryId: productsById.get(input.productId)?.category_id ?? null,
        variationGroupId: other.existingGroupId,
        variationName: other.variationName,
        existingSku: other.skuCode.trim(),
        recordStatus: 'Unsaved',
        liveRowCount: 0,
        targetCardKey: other.cardKey,
      });
    });
  });

  return { conflicts, ignoredOrphans: Array.from(ignoredOrphans.values()) };
}

function describeConflictLocation(conflict: VariationSkuConflict) {
  const variation = conflict.variationName.trim() || 'an unnamed variation';
  if (conflict.scope === 'other_product') {
    return `variation "${variation}" of product "${conflict.productName || conflict.productId}"`;
  }
  if (conflict.scope === 'same_save') {
    return `variation "${variation}" in this edit`;
  }
  return conflict.targetCardKey
    ? `variation "${variation}" of this product`
    : `variation "${variation}" of this product (removed in this edit, but still saved)`;
}

export function buildVariationSkuConflictMessage(conflicts: VariationSkuConflict[]) {
  if (conflicts.length === 0) return '';
  const bySku = new Map<string, VariationSkuConflict[]>();
  conflicts.forEach((conflict) => {
    bySku.set(conflict.sku, [...(bySku.get(conflict.sku) ?? []), conflict]);
  });
  const parts = Array.from(bySku.entries()).map(
    ([sku, entries]) => `SKU "${sku}" is already used by ${entries.map(describeConflictLocation).join('; ')}.`,
  );
  return `${parts.join(' ')} Saving is blocked because each variation needs its own SKU. Change the SKU or review the existing variation.`;
}

export class VariationSkuConflictError extends Error {
  conflicts: VariationSkuConflict[];
  ignoredOrphans: OrphanSkuGroup[];

  constructor(result: VariationSkuConflictResult) {
    super(buildVariationSkuConflictMessage(result.conflicts));
    this.name = 'VariationSkuConflictError';
    this.conflicts = result.conflicts;
    this.ignoredOrphans = result.ignoredOrphans;
  }
}

// Read-only. Throws VariationSkuConflictError when a live conflict exists.
export async function findVariationSkuConflicts(
  productId: string,
  claims: VariationSkuClaim[],
): Promise<VariationSkuConflictResult> {
  const normalizedSkus = Array.from(
    new Set(claims.map((claim) => normalizeVariationSku(claim.skuCode)).filter(Boolean)),
  );
  if (normalizedSkus.length === 0) {
    return { conflicts: [], ignoredOrphans: [] };
  }

  const { data: groupData, error: groupError } = await supabase
    .from('product_variation_groups')
    .select('id, product_id, variation_name, sku_code, normalized_sku_code')
    .in('normalized_sku_code', normalizedSkus);
  if (groupError) throw new Error(groupError.message);
  const groups = ((groupData ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ''),
    product_id: String(row.product_id ?? ''),
    variation_name: String(row.variation_name ?? ''),
    sku_code: String(row.sku_code ?? ''),
    normalized_sku_code: String(row.normalized_sku_code ?? ''),
  }));

  const groupIds = groups.map((group) => group.id).filter(Boolean);
  let groupVariationRows: SkuGroupVariationRow[] = [];
  if (groupIds.length > 0) {
    const { data, error } = await supabase
      .from('product_variations')
      .select('variation_group_id, product_id, availability')
      .in('variation_group_id', groupIds);
    if (error) throw new Error(error.message);
    groupVariationRows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      variation_group_id: String(row.variation_group_id ?? ''),
      product_id: String(row.product_id ?? ''),
      availability: row.availability === null || row.availability === undefined ? null : String(row.availability),
    }));
  }

  const productIds = Array.from(new Set([productId, ...groups.map((group) => group.product_id)].filter(Boolean)));
  const { data: productData, error: productError } = await supabase
    .from('products')
    .select('id, product_name, status, category_id')
    .in('id', productIds);
  if (productError) throw new Error(productError.message);
  const products = ((productData ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id ?? ''),
    product_name: row.product_name === null || row.product_name === undefined ? null : String(row.product_name),
    status: row.status === null || row.status === undefined ? null : String(row.status),
    category_id: row.category_id ? String(row.category_id) : null,
  }));

  return classifyVariationSkuConflicts({ productId, claims, groups, groupVariationRows, products });
}

export type VariationConflictPreview = {
  productId: string;
  productName: string;
  productStatus: string;
  categoryId: string | null;
  variationGroupId: string;
  variationName: string;
  skuCode: string;
  prices: Array<{ priceCode: string; price: number | null; availability: string }>;
  unitOptions: Array<{ unitCode: string; quantityInBaseUnit: number; baseUnitCode: string; status: string }>;
};

const PREVIEW_PRICE_ORDER = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];

// Re-reads the conflicting record right before it is shown, so the preview
// (and any navigation from it) only ever targets a record that still exists
// and still belongs to the expected product. Returns null otherwise.
export async function loadVariationConflictPreview(
  conflict: Pick<VariationSkuConflict, 'productId' | 'variationGroupId'>,
): Promise<VariationConflictPreview | null> {
  if (!conflict.variationGroupId || !conflict.productId) return null;

  const [{ data: productRow, error: productError }, { data: variationData, error: variationError }] =
    await Promise.all([
      supabase
        .from('products')
        .select('id, product_name, status, category_id')
        .eq('id', conflict.productId)
        .maybeSingle(),
      supabase
        .from('product_variations')
        .select('id, product_id, variation_name, class_name, sku_code, price_code, price, availability')
        .eq('variation_group_id', conflict.variationGroupId),
    ]);
  if (productError) throw new Error(productError.message);
  if (variationError) throw new Error(variationError.message);
  if (!productRow) return null;

  const variationRows = ((variationData ?? []) as Array<Record<string, unknown>>).filter(
    (row) => String(row.product_id ?? '') === conflict.productId,
  );
  if (variationRows.length === 0) return null;

  const rowsByCode = new Map(variationRows.map((row) => [String(row.price_code ?? '').toUpperCase(), row] as const));
  const representative =
    PREVIEW_PRICE_ORDER.map((code) => rowsByCode.get(code)).find(Boolean) ?? variationRows[0];

  const { data: unitData, error: unitError } = await supabase
    .from('product_variation_unit_options')
    .select('unit_code, quantity_in_base_unit, base_unit_code, status, sort_order')
    .eq('variation_id', String(representative.id))
    .order('sort_order', { ascending: true });
  if (unitError) throw new Error(unitError.message);

  const product = productRow as Record<string, unknown>;
  return {
    productId: conflict.productId,
    productName: String(product.product_name ?? '').trim(),
    productStatus: String(product.status ?? ''),
    categoryId: product.category_id ? String(product.category_id) : null,
    variationGroupId: conflict.variationGroupId,
    variationName: String(representative.variation_name || representative.class_name || '').trim(),
    skuCode: String(representative.sku_code ?? ''),
    prices: PREVIEW_PRICE_ORDER.flatMap((code) => {
      const row = rowsByCode.get(code);
      if (!row) return [];
      const price = Number(row.price);
      return [{ priceCode: code, price: Number.isFinite(price) ? price : null, availability: String(row.availability ?? '') }];
    }),
    unitOptions: ((unitData ?? []) as Array<Record<string, unknown>>).map((row) => ({
      unitCode: String(row.unit_code ?? ''),
      quantityInBaseUnit: Number(row.quantity_in_base_unit ?? 1),
      baseUnitCode: String(row.base_unit_code ?? ''),
      status: String(row.status ?? 'Active'),
    })),
  };
}

// Opening another product discards the current editor, so the unsaved-changes
// guard must approve first, and the target must be re-verified and present in
// the product workspace. Returns why navigation did not happen, or null.
export async function openConflictingProduct(
  conflict: Pick<VariationSkuConflict, 'productId' | 'variationGroupId'>,
  deps: {
    confirmUnsavedChanges: () => Promise<boolean>;
    verify: () => Promise<VariationConflictPreview | null>;
    openProduct: (productId: string, variationGroupId: string) => boolean;
  },
): Promise<'cancelled' | 'not_found' | 'unavailable' | null> {
  const preview = await deps.verify();
  if (!preview || !conflict.variationGroupId) return 'not_found';
  const canLeave = await deps.confirmUnsavedChanges();
  if (!canLeave) return 'cancelled';
  return deps.openProduct(preview.productId, preview.variationGroupId) ? null : 'unavailable';
}
