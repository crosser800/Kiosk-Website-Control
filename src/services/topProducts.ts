import { supabase } from '../lib/supabase';
import { fetchAllPages } from './fetchAllPages';

export interface TopProductRecord {
  id: string;
  rank: number;
  itemCode: string;
  imageUrl: string;
  productName: string;
}

export async function getTopProducts(): Promise<TopProductRecord[]> {
  const { data: productRows, error: productError } = await supabase
    .from('products')
    .select('id, product_name, sku_code, status, created_at')
    .eq('status', 'Active')
    .order('created_at', { ascending: false })
    .limit(20);

  if (productError) {
    console.error('Failed to load product previews:', productError);
    return [];
  }

  // Images for the (at most 20) listed products only, instead of every image
  // in the catalog. Same filter, order and primary/fallback choice as before.
  const productIds = ((productRows ?? []) as Array<Record<string, unknown>>)
    .map((product) => String(product.id ?? ''))
    .filter(Boolean);
  let mediaRows: Array<Record<string, unknown>> = [];
  if (productIds.length > 0) {
    try {
      mediaRows = await fetchAllPages<{ id: unknown } & Record<string, unknown>>('product preview images', (from, to) =>
        supabase
          .from('product_media')
          .select('id, product_id, media_url, media_type, is_primary, sort_order', { count: 'exact' })
          .eq('media_type', 'image')
          .in('product_id', productIds)
          .order('sort_order', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to)
          .then((response) => ({
            data: (response.data ?? null) as Array<{ id: unknown } & Record<string, unknown>> | null,
            error: response.error,
            count: response.count,
          })),
      );
    } catch (mediaError) {
      console.error('Failed to load product previews:', mediaError);
      return [];
    }
  }

  const mediaByProductId = new Map<string, Array<Record<string, unknown>>>();
  ((mediaRows ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const productId = String(row.product_id ?? '');
    if (!productId) {
      return;
    }
    const current = mediaByProductId.get(productId) ?? [];
    current.push(row);
    mediaByProductId.set(productId, current);
  });

  return ((productRows ?? []) as Array<Record<string, unknown>>).map((product, index) => {
    const productId = String(product.id ?? '');
    const images = mediaByProductId.get(productId) ?? [];
    const primaryImage =
      images.find((item) => Boolean(item.is_primary)) ??
      images[0];

    return {
      id: productId,
      rank: index + 1,
      itemCode: String(product.sku_code ?? ''),
      imageUrl: String(primaryImage?.media_url ?? ''),
      productName: String(product.product_name ?? 'Untitled Product'),
    } satisfies TopProductRecord;
  });
}
