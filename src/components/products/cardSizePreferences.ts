// Session-scoped card-size preferences for the Products page grids.
//
// Two independent sizes: category cards ("Browse by Category") and product
// cards (global search results + products inside a category). Values are the
// MINIMUM card width in px; the CSS grid fits as many columns as that allows
// (repeat(auto-fill, minmax(min(100%, <size>), 1fr))), so cards grow to fill
// the row and never overflow. Stored in sessionStorage only: kept on refresh
// of the same tab, gone when the tab session ends. Never sent to Supabase.

export type CardSizeRange = {
  min: number;
  max: number;
  step: number;
  defaultValue: number;
};

export const CATEGORY_CARD_SIZE: CardSizeRange = { min: 180, max: 360, step: 10, defaultValue: 270 };
export const PRODUCT_CARD_SIZE: CardSizeRange = { min: 120, max: 280, step: 10, defaultValue: 170 };

export const CATEGORY_CARD_SIZE_KEY = '2b-admin.products.categoryCardSize';
export const PRODUCT_CARD_SIZE_KEY = '2b-admin.products.productCardSize';

// CSS custom properties read by ProductCategoryWorkspace.module.css.
export const CATEGORY_CARD_SIZE_VAR = '--category-card-min';
export const PRODUCT_CARD_SIZE_VAR = '--product-card-min';

// Clamps to the range and snaps to its step; anything unusable -> default.
export function parseCardSize(raw: unknown, range: CardSizeRange): number {
  if (raw === null || raw === undefined) return range.defaultValue;
  const text = typeof raw === 'number' ? String(raw) : String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return range.defaultValue;
  const value = Number(text);
  if (!Number.isFinite(value)) return range.defaultValue;
  const clamped = Math.min(range.max, Math.max(range.min, value));
  const snapped = range.min + Math.round((clamped - range.min) / range.step) * range.step;
  return Math.min(range.max, snapped);
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function getSessionStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    // Access can throw (blocked storage, sandboxed frames).
    return null;
  }
}

export function readCardSize(
  key: string,
  range: CardSizeRange,
  storage: StorageLike | null = getSessionStorage(),
): number {
  try {
    return parseCardSize(storage?.getItem(key), range);
  } catch {
    return range.defaultValue;
  }
}

export function writeCardSize(
  key: string,
  value: number,
  range: CardSizeRange,
  storage: StorageLike | null = getSessionStorage(),
): number {
  const normalized = parseCardSize(value, range);
  try {
    storage?.setItem(key, String(normalized));
  } catch {
    // Quota / privacy mode: the size still applies for this page view.
  }
  return normalized;
}

// 0 at the smallest size, 100 at the largest (for the slider fill).
export function getCardSizePercent(value: number, range: CardSizeRange) {
  return Math.round(((parseCardSize(value, range) - range.min) / (range.max - range.min)) * 100);
}

// Mirrors the CSS grid: repeat(auto-fill, minmax(min(100%, size), 1fr)).
export function estimateGridColumns(containerWidth: number, cardMinWidth: number, gap: number) {
  if (!(containerWidth > 0) || !(cardMinWidth > 0)) return 1;
  const effectiveMin = Math.min(containerWidth, cardMinWidth);
  return Math.max(1, Math.floor((containerWidth + gap) / (effectiveMin + gap)));
}
