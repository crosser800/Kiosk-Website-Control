import { supabase } from '../lib/supabase';

export interface TopProductRecord {
  id: string;
  rank: number;
  itemCode: string;
  imageUrl: string;
  productName: string;
}

export async function getTopProducts(): Promise<TopProductRecord[]> {
  const [{ data: productRows, error: productError }, { data: mediaRows, error: mediaError }] =
    await Promise.all([
      supabase
        .from('products')
        .select('id, product_name, sku_code, status, created_at')
        .eq('status', 'Active')
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('product_media')
        .select('id, product_id, media_url, media_type, is_primary, sort_order')
        .eq('media_type', 'image')
        .order('sort_order', { ascending: true }),
    ]);

  if (productError || mediaError) {
    console.error('Failed to load product previews:', productError ?? mediaError);
    return [];
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
