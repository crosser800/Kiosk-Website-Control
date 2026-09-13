// Single shared source of truth for "what identifies one logical variation"
// across the product editor (AddProduct.tsx, VarAndPrice.tsx). A logical
// variation is the one entity the UI treats as "one variation" even though it
// is stored as six product_variations rows (R1/R2/W1/W2/SP/CP price classes).
//
// Persisted rows already carry a stable product_variation_groups.id via
// product_variations.variation_group_id (see migration
// 20260904000100_create_product_variation_groups.sql) — that id is used as
// the identity whenever it is available. Only brand-new, not-yet-saved
// variations (no variation_group_id yet) fall back to a normalized
// variation-name + SKU text key.
//
// Do not re-implement this normalization elsewhere: a prior split between a
// `variation_name ?? class_name` version (AddProduct.tsx) and a
// `variationName || className` version (VarAndPrice.tsx) meant the two files
// disagreed on the key for any row whose variation_name was stored as ''
// rather than null — silently detaching real product_variation_unit_options
// rows from the editor and falling back to a synthetic default unit.

export type LogicalVariationIdentityInput = {
  variationGroupId?: string | null;
  variationName?: string | null;
  className?: string | null;
  skuCode?: string | null;
};

// Prefixed so a group-id-based key can never collide with a text-based
// fallback key, and so the source of a given key is obvious when debugging.
export function getLogicalVariationKey(input: LogicalVariationIdentityInput): string {
  const groupId = String(input.variationGroupId ?? '').trim();
  if (groupId) {
    return `group:${groupId}`;
  }

  // Empty string is treated the same as missing here (`||`, not `??`) —
  // that is the exact fallback VarAndPrice.tsx already relied on for display,
  // now made canonical everywhere identity is computed.
  const name = String(input.variationName || input.className || '').trim().toLowerCase();
  const sku = String(input.skuCode || '').trim().toLowerCase();
  return `text:${name}::${sku}`;
}
