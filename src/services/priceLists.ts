import { supabase } from '../lib/supabase';

export const PRICE_LISTS_CHANGED_EVENT = 'price-lists-changed';
export const PRICE_LIST_BUCKET = 'price-lists';

export type PriceListRecord = {
  id: string;
  name: string;
  filePath: string;
  fileUrl: string;
  status: 'Active' | 'Inactive';
  createdAt: string;
};

export async function loadPriceLists(activeOnly = false): Promise<PriceListRecord[]> {
  let query = supabase
    .from('price_lists')
    .select('id, name, file_path, file_url, status, created_at')
    .order('created_at', { ascending: false });

  if (activeOnly) query = query.eq('status', 'active');

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ''),
    filePath: String(row.file_path ?? ''),
    fileUrl: String(row.file_url ?? ''),
    status: String(row.status).toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
    createdAt: String(row.created_at ?? ''),
  }));
}

export function notifyPriceListsChanged() {
  window.dispatchEvent(new Event(PRICE_LISTS_CHANGED_EVENT));
}
