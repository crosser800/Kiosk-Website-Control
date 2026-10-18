// Display helpers for the Products page cards. Pure; tested in
// tests/productCards.test.ts.

// One line describing a product's variations. `labels` are the names of the
// product's available LOGICAL variations (one per variation, never one per
// R1/R2/W1/W2/SP/CP price-class row) — see variationLabels in
// productWorkspaceData.ts. `count` is the product's variationCount, which can
// be updated by the editor before labels are reloaded.
export function getVariationSummary(labels: string[], count: number) {
  const names = labels.map((label) => label.trim()).filter(Boolean);
  const total = Math.max(count, 0);
  if (total === 0) return 'No active variations';
  if (total === 1) return names[0] ?? '1 variation';
  const shown = names.slice(0, 2);
  const remaining = total - shown.length;
  if (shown.length === 0) return `${total} variations`;
  return `${total} variations: ${shown.join(', ')}${remaining > 0 ? ` +${remaining}` : ''}`;
}

export function isActiveStatus(status: string) {
  return status.trim().toLowerCase() === 'active';
}

// Up to two initials for an image placeholder ("Power Tools" -> "PT").
export function getInitials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
