// Turns a product-save failure into a message an admin can act on. Most save
// steps rethrow Supabase errors as `new Error(error.message)`, so raw
// PostgreSQL text is recognised here by pattern. The original error is always
// logged by the caller (AddProduct.handleRegister) for developers.

const UNIQUE_CONSTRAINT_MESSAGES: Array<{ match: RegExp; message: string }> = [
  {
    match: /product_variation_unit_option/i,
    message:
      'A unit option with the same unit and quantity already exists for this variation. ' +
      'Saving is blocked because each variation can only have one option per unit and quantity. ' +
      'Review the order units of this variation, then save again.',
  },
  {
    match: /product_variation_groups/i,
    message:
      'A variation with the same name and SKU is already registered for this product. ' +
      'Rename the variation or change its SKU, then save again.',
  },
  {
    match: /products_sku_code/i,
    message: 'Another product already uses this product SKU. Change the product SKU, then save again.',
  },
];

export function describeProductSaveError(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (!message) {
    return 'Failed to save product. Please try again.';
  }

  if (/duplicate key value violates unique constraint/i.test(message)) {
    const known = UNIQUE_CONSTRAINT_MESSAGES.find((entry) => entry.match.test(message));
    return (
      known?.message ??
      'Some of these values already exist on another record, so saving was blocked. Review the highlighted fields and try again.'
    );
  }
  if (/violates foreign key constraint/i.test(message)) {
    return (
      'This change would break a link to another record (for example an existing order or discount), so it was not saved. ' +
      'Nothing was removed; reload the product and try again.'
    );
  }
  if (/violates check constraint|violates not-null constraint|invalid input syntax/i.test(message)) {
    return 'One of the values is not in an accepted format, so the product was not saved. Review the fields and try again.';
  }
  if (/row-level security|permission denied/i.test(message)) {
    return 'Your account is not allowed to make this change. Ask an administrator for access.';
  }
  if (/failed to fetch|network/i.test(message)) {
    return 'Could not reach the server, so the product may not be fully saved. Check your connection and save again.';
  }
  return message;
}
