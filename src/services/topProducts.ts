export interface TopProductRecord {
  id: string;
  rank: number;
  itemCode: string;
  imageUrl: string;
}

export async function getTopProducts(): Promise<TopProductRecord[]> {
  /*
    Supabase-ready query:

    1. Install the client:
       npm install @supabase/supabase-js

    2. Create src/lib/supabase.ts with:

       import { createClient } from '@supabase/supabase-js';

       const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
       const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

       export const supabase = createClient(supabaseUrl, supabaseAnonKey);

    3. Replace this return block with:

       const { data, error } = await supabase
         .from('top_products')
         .select('id, rank, item_code, image_url')
         .order('rank', { ascending: true })
         .limit(5);

       if (error) {
         console.error('Failed to load top products:', error);
         return [];
       }

       return (data ?? []).map((product) => ({
         id: String(product.id),
         rank: Number(product.rank),
         itemCode: product.item_code ?? '',
         imageUrl: product.image_url ?? '',
       }));
  */

  return [];
}
