// Pure product search for the Products page (ProductCategoryWorkspace).
// Runs over data the workspace has already loaded — no request per keystroke.
// No runtime imports, so it also runs under `node --test`.

export type SearchableProduct = {
  id: string;
  name: string;
  skuCode: string;
  description: string;
  categoryTitle: string;
  // product_variations.variation_name / class_name values for this product.
  variationNames: string[];
  // product_variations.sku_code values for this product.
  variationSkus: string[];
};

export type ProductMatchField =
  | 'Product name'
  | 'SKU'
  | 'Category'
  | 'Variation'
  | 'Variation SKU'
  | 'Description';

export type ProductSearchResult<Product extends SearchableProduct> = {
  product: Product;
  matchedField: ProductMatchField;
  // The variation name/SKU that matched, when the match came from a variation.
  matchedValue: string;
};

export function normalizeSearchText(value: string | null | undefined) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

type FieldEntry = { field: ProductMatchField; value: string; normalized: string };

function getFieldEntries(product: SearchableProduct): FieldEntry[] {
  const entries: Array<{ field: ProductMatchField; value: string }> = [
    { field: 'Product name', value: product.name },
    { field: 'SKU', value: product.skuCode },
    ...product.variationSkus.map((value) => ({ field: 'Variation SKU' as const, value })),
    ...product.variationNames.map((value) => ({ field: 'Variation' as const, value })),
    { field: 'Category', value: product.categoryTitle },
    { field: 'Description', value: product.description },
  ];
  return entries
    .map((entry) => ({ ...entry, normalized: normalizeSearchText(entry.value) }))
    .filter((entry) => entry.normalized);
}

// Case-insensitive partial matching. Every whitespace-separated term must
// appear in at least one field (so "matte 1kg" can match name + variation).
// Products are returned once each, in the order given.
export function searchProducts<Product extends SearchableProduct>(
  products: Product[],
  query: string,
): ProductSearchResult<Product>[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(' ');
  const seen = new Set<string>();
  const results: ProductSearchResult<Product>[] = [];

  products.forEach((product) => {
    if (seen.has(product.id)) return;
    const entries = getFieldEntries(product);
    const allTermsMatch = terms.every((term) => entries.some((entry) => entry.normalized.includes(term)));
    if (!allTermsMatch) return;
    seen.add(product.id);
    // Report the most specific reason: a field containing the whole query,
    // otherwise the field matching the first term.
    const reason =
      entries.find((entry) => entry.normalized.includes(normalizedQuery)) ??
      entries.find((entry) => entry.normalized.includes(terms[0])) ??
      entries[0];
    results.push({ product, matchedField: reason.field, matchedValue: reason.value.trim() });
  });

  return results;
}
