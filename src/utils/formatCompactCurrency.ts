const fullCurrencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(value: number) {
  return fullCurrencyFormatter.format(value);
}

export function formatCompactMobileCurrency(value: number) {
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 1_000_000) {
    return `₱${(value / 1_000_000).toFixed(2)}M`;
  }

  if (absoluteValue >= 100_000) {
    return `₱${(value / 1_000).toFixed(2)}K`;
  }

  return formatCurrency(value);
}
