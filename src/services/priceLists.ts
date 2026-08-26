export const PRICE_LISTS_CHANGED_EVENT = 'price-lists-changed';
const PRICE_LISTS_STORAGE_KEY = 'kiosk-price-list-presets-v1';
export const PRICE_LIST_SLOT_COUNT = 10;

export type PriceListLink = { name: string; embedUrl: string };
export type PriceListRecord = {
  id: string; name: string; links: PriceListLink[]; filePath: string; fileUrl: string;
  status: 'Active' | 'Inactive'; createdAt: string;
};

export function driveLinkToEmbedUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  try {
    const url = new URL(trimmed);
    if (url.hostname !== 'drive.google.com') return '';
    const pathId = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1];
    const queryId = url.searchParams.get('id');
    const fileId = pathId ?? queryId;
    return fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview` : '';
  } catch {
    return '';
  }
}

export function emptyPriceListSlots(): PriceListLink[] {
  return Array.from({ length: PRICE_LIST_SLOT_COUNT }, () => ({ name: '', embedUrl: '' }));
}

export function loadPriceListSlots(): PriceListLink[] {
  try {
    const stored = JSON.parse(localStorage.getItem(PRICE_LISTS_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(stored)) return emptyPriceListSlots();
    return emptyPriceListSlots().map((empty, index) => {
      const item = stored[index];
      return item && typeof item === 'object'
        ? { name: String(item.name ?? ''), embedUrl: String(item.embedUrl ?? '') }
        : empty;
    });
  } catch { return emptyPriceListSlots(); }
}

export function savePriceListSlots(links: PriceListLink[]) {
  localStorage.setItem(PRICE_LISTS_STORAGE_KEY, JSON.stringify(links.slice(0, PRICE_LIST_SLOT_COUNT)));
  notifyPriceListsChanged();
}

export async function loadPriceLists(_activeOnly = false): Promise<PriceListRecord[]> {
  const links = loadPriceListSlots().filter((link) => link.name.trim() && link.embedUrl.trim());
  return links.length ? [{ id: 'local-price-list-presets', name: 'Price Lists', links, filePath: '', fileUrl: '', status: 'Active', createdAt: '' }] : [];
}

export function notifyPriceListsChanged() { window.dispatchEvent(new Event(PRICE_LISTS_CHANGED_EVENT)); }
