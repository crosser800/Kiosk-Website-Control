import { supabase } from '../lib/supabase';

export const PRICE_LISTS_CHANGED_EVENT = 'price-lists-changed';
export const PRICE_LIST_SLOT_COUNT = 10;

export type PriceListStatus = 'Active' | 'Inactive';

export type PriceListLink = {
  id: string;
  name: string;
  embedUrl: string;
  status: PriceListStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PriceListRecord = {
  id: string;
  name: string;
  links: PriceListLink[];
  status: PriceListStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type PriceListCounts = {
  total: number;
  active: number;
  inactive: number;
};

type PriceListRow = {
  id: string | number | null;
  name: string | null;
  external_url: string | null;
  status: string | null;
  sort_order: number | string | null;
  created_at: string | null;
  updated_at: string | null;
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
  return Array.from({ length: PRICE_LIST_SLOT_COUNT }, (_, index) => ({
    id: '',
    name: '',
    embedUrl: '',
    status: 'Active',
    sortOrder: index + 1,
    createdAt: '',
    updatedAt: '',
  }));
}

function normalizeStatus(status: unknown): PriceListStatus {
  return String(status ?? '').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

function mapRowToLink(row: PriceListRow): PriceListLink {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    embedUrl: String(row.external_url ?? ''),
    status: normalizeStatus(row.status),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function getCounts(records: PriceListLink[]): PriceListCounts {
  return {
    total: records.length,
    active: records.filter((record) => record.status === 'Active').length,
    inactive: records.filter((record) => record.status === 'Inactive').length,
  };
}

export async function loadPriceListSlots() {
  const { data, error } = await supabase
    .from('price_lists')
    .select('id, name, external_url, status, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true });

  if (error) throw error;

  const records = (data ?? [])
    .map((row) => mapRowToLink(row as PriceListRow))
    .filter((record) => record.sortOrder >= 1 && record.sortOrder <= PRICE_LIST_SLOT_COUNT);
  const slots = emptyPriceListSlots();

  for (const record of records) {
    slots[record.sortOrder - 1] = record;
  }

  return { links: slots, counts: getCounts(records) };
}

export async function savePriceListSlots(links: PriceListLink[]) {
  for (const [index, link] of links.entries()) {
    const sortOrder = index + 1;
    const name = link.name.trim();
    const externalUrl = link.embedUrl.trim();

    if (!name && !externalUrl) {
      continue;
    }

    if (link.id) {
      const { error } = await supabase
        .from('price_lists')
        .update({
          name,
          external_url: externalUrl,
          sort_order: sortOrder,
        })
        .eq('id', link.id);

      if (error) throw error;
      continue;
    }

    const { error } = await supabase
      .from('price_lists')
      .insert({
        name,
        external_url: externalUrl,
        status: 'active',
        sort_order: sortOrder,
      });

    if (error) throw error;
  }

  notifyPriceListsChanged();
}

export async function loadPriceLists(activeOnly = false): Promise<PriceListRecord[]> {
  let query = supabase
    .from('price_lists')
    .select('id, name, external_url, status, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true });

  if (activeOnly) query = query.eq('status', 'active');

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? [])
    .map((row) => mapRowToLink(row as PriceListRow))
    .filter((link) => link.name.trim() && link.embedUrl.trim())
    .map((link) => ({
      id: link.id,
      name: link.name,
      links: [link],
      status: link.status,
      sortOrder: link.sortOrder,
      createdAt: link.createdAt,
      updatedAt: link.updatedAt,
    }));
}

export function notifyPriceListsChanged() {
  window.dispatchEvent(new Event(PRICE_LISTS_CHANGED_EVENT));
}
