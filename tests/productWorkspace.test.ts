// Products page data: one paginated load feeds the category grid, global
// search and the page counters. Runs the real modules against the in-memory
// PostgREST fake (needs `node --import ./tests/support/register.mjs`).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setSupabaseFake } from './support/supabaseStub.ts';
import { createFakePostgrest, type Row } from './support/fakePostgrest.ts';
import {
  loadProductWorkspace,
  UNCATEGORIZED_CATEGORY_ID,
  type ProductWorkspace,
} from '../src/components/products/productWorkspaceData.ts';
import { searchProducts } from '../src/components/products/productSearch.ts';
import { getTopProducts } from '../src/services/topProducts.ts';

function media(id: string, productId: string, extra: Row = {}): Row {
  return {
    id,
    product_id: productId,
    media_url: `https://cdn.test/${id}.jpg`,
    media_type: 'image',
    is_primary: false,
    sort_order: 0,
    variation_id: null,
    status: 'Active',
    ...extra,
  };
}

function variation(id: string, productId: string | null, name: string, sku: string, extra: Row = {}): Row {
  return { id, product_id: productId, variation_name: name, class_name: name, sku_code: sku, availability: 'Available', ...extra };
}

function fixture() {
  const categories: Row[] = [
    { id: 'c-paint', category_title: 'Paints', category_slug: 'paints', category_image_url: '', status: 'Active' },
    { id: 'c-hard', category_title: 'Hardware', category_slug: 'hardware', category_image_url: '', status: 'Active' },
  ];
  const products: Row[] = [
    { id: 'p-paint', category_id: 'c-paint', product_name: 'Latex Paint', sku_code: 'LP', description: '', status: 'Active', created_at: '2026-10-01T00:00:00Z' },
    { id: 'p-nails', category_id: 'c-hard', product_name: 'Wire Nails', sku_code: 'WN', description: '', status: 'Active', created_at: '2026-10-02T00:00:00Z' },
    { id: 'p-video', category_id: 'c-hard', product_name: 'Drill', sku_code: 'DR', description: '', status: 'Inactive', created_at: '2026-10-03T00:00:00Z' },
    { id: 'p-none', category_id: null, product_name: 'Loose Sand', sku_code: 'SND', description: '', status: 'Active', created_at: '2026-10-04T00:00:00Z' },
    { id: 'p-orphan', category_id: 'c-deleted', product_name: 'Old Tile', sku_code: 'TL', description: '', status: 'active', created_at: '2026-10-05T00:00:00Z' },
  ];
  // Six price-class rows of one logical variation count once.
  const variations: Row[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'].map((code) =>
    variation(`v-paint-matte-${code}`, 'p-paint', 'Matte White', 'LP-MW'),
  );
  variations.push(
    variation('v-paint-gloss-R1', 'p-paint', 'Gloss Black', 'LP-GB'),
    variation('v-paint-gone-R1', 'p-paint', 'Discontinued', 'LP-X', { availability: 'Unavailable' }),
    variation('v-nails-R1', 'p-nails', '2 inch', 'WN-2'),
    variation('v-none-R1', 'p-none', 'Fine', 'SND-F'),
    // Variation whose product is not loaded: the old counter counted it.
    variation('v-ghost-R1', 'p-ghost', 'Ghost', 'GH-1'),
    variation('v-blank-R1', null, 'No product', 'NP-1'),
  );
  const productMedia: Row[] = [
    media('m-paint-a', 'p-paint', { sort_order: 0 }),
    media('m-paint-primary', 'p-paint', { sort_order: 1, is_primary: true }),
    media('m-paint-var', 'p-paint', { sort_order: -1, is_primary: true, variation_id: 'v-paint-matte-R1' }),
    media('m-nails-video', 'p-nails', { media_type: 'video', sort_order: 0 }),
    media('m-nails-img', 'p-nails', { sort_order: 1 }),
    media('m-nails-inactive', 'p-nails', { sort_order: -5, is_primary: true, status: 'Inactive' }),
    media('m-video-only', 'p-video', { media_type: 'video' }),
    media('m-none-nullstatus', 'p-none', { status: null }),
  ];
  return {
    product_categories: categories,
    products,
    product_variations: variations,
    product_media: productMedia,
  };
}

// The Products page counters exactly as Products.tsx computed them before
// (status = 'Active' count + its own variation download).
function legacyCounters(tables: ReturnType<typeof fixture>) {
  const activeProducts = tables.products.filter((row) => row.status === 'Active').length;
  const groupKey = (row: Row) => {
    const name = String(row.variation_name ?? row.class_name ?? '').trim().toLowerCase();
    const sku = String(row.sku_code ?? '').trim().toLowerCase();
    return name || sku ? `${name}::${sku}` : `row::${String(row.id ?? '').trim().toLowerCase()}`;
  };
  const available = (row: Row) =>
    !['unavailable', 'inactive', 'archived', 'deleted'].includes(String(row.availability ?? '').trim().toLowerCase());
  const activeVariations = new Set(
    tables.product_variations
      .filter((row) => String(row.product_id ?? '').trim() && available(row))
      .map((row) => `${String(row.product_id).trim().toLowerCase()}::${groupKey(row)}`),
  ).size;
  return { activeProducts, activeVariations };
}

async function load(tables: Record<string, Row[]>, maxRows = Number.POSITIVE_INFINITY, failOn?: { table: string; requestIndex: number; message: string }) {
  const fake = createFakePostgrest({ tables, maxRows, failOn });
  setSupabaseFake(fake);
  const workspace = await loadProductWorkspace();
  return { workspace, fake };
}

const allProducts = (workspace: ProductWorkspace) => workspace.categories.flatMap((category) => category.products);
const product = (workspace: ProductWorkspace, id: string) => allProducts(workspace).find((item) => item.id === id);

afterEach(() => setSupabaseFake(null));

describe('loadProductWorkspace', () => {
  it('computes the page counters exactly like the old separate queries', async () => {
    const tables = fixture();
    const { workspace } = await load(tables);
    assert.deepEqual(workspace.stats, legacyCounters(tables));
    assert.deepEqual(workspace.stats, { activeProducts: 3, activeVariations: 5 });
  });

  it('downloads the variation table once and the Products page no longer queries it', async () => {
    const { fake } = await load(fixture());
    assert.equal(fake.queries.filter((query) => query.table === 'product_variations').length, 1);
    const productsPage = readFileSync(new URL('../src/pages/Products.tsx', import.meta.url), 'utf8');
    assert.doesNotMatch(productsPage, /supabase|product_variations|\.channel\(/);
  });

  it('asks only for product-level Active (or status-less) media', async () => {
    const tables = fixture();
    const { fake } = await load(tables);
    const mediaQuery = fake.queries.find((query) => query.table === 'product_media');
    assert.deepEqual(mediaQuery?.extraFilters, ['variation_id is null', 'or(status.eq.Active,status.is.null)']);
    assert.equal(fake.rowsReturned.get('product_media'), 6, 'variation and inactive media are not transferred');
    assert.ok(tables.product_media.length > 6);
  });

  it('keeps the thumbnail fallback: primary image, then first image, then first media', async () => {
    const { workspace } = await load(fixture());
    assert.equal(product(workspace, 'p-paint')?.thumbnailUrl, 'https://cdn.test/m-paint-primary.jpg', 'variation primary is ignored');
    assert.equal(product(workspace, 'p-nails')?.thumbnailUrl, 'https://cdn.test/m-nails-img.jpg', 'first image beats an earlier video; inactive ignored');
    assert.equal(product(workspace, 'p-video')?.thumbnailUrl, 'https://cdn.test/m-video-only.jpg', 'falls back to the first media item');
    assert.equal(product(workspace, 'p-none')?.thumbnailUrl, 'https://cdn.test/m-none-nullstatus.jpg', 'status-less media still counts as Active');
  });

  it('keeps per-product variation counts and search data', async () => {
    const { workspace } = await load(fixture());
    const paint = product(workspace, 'p-paint');
    assert.equal(paint?.variationCount, 2, 'six price rows = one variation; unavailable excluded');
    assert.deepEqual([...(paint?.variationSkus ?? [])].sort(), ['LP-GB', 'LP-MW', 'LP-X']);
  });

  it('supports search across categories and uncategorized products', async () => {
    const { workspace } = await load(fixture());
    const uncategorized = workspace.categories.find((category) => category.id === UNCATEGORIZED_CATEGORY_ID);
    assert.deepEqual(uncategorized?.products.map((item) => item.id).sort(), ['p-none', 'p-orphan']);
    const ids = (query: string) => searchProducts(allProducts(workspace), query).map((result) => result.product.id);
    assert.deepEqual(ids('gloss black'), ['p-paint']);
    assert.deepEqual(ids('hardware'), ['p-video', 'p-nails']);
    assert.deepEqual(ids('snd-f'), ['p-none']);
    assert.deepEqual(ids('tile'), ['p-orphan']);
  });

  it('returns the same workspace when every table spans several pages', async () => {
    const tables = fixture();
    const single = await load(tables);
    const paged = await load(tables, 2);
    assert.deepEqual(paged.workspace, single.workspace);
    assert.ok(paged.fake.queries.filter((query) => query.table === 'product_variations').length > 3);
  });

  it('handles an empty catalog', async () => {
    const { workspace } = await load({ product_categories: [], products: [], product_variations: [], product_media: [] });
    assert.deepEqual(workspace, { categories: [], stats: { activeProducts: 0, activeVariations: 0 } });
  });

  it('fails the whole load (no partial workspace) when a page fails', async () => {
    await assert.rejects(
      load(fixture(), 2, { table: 'product_variations', requestIndex: 2, message: 'network down' }),
      /product variations.*network down/,
    );
  });
});

describe('getTopProducts', () => {
  function topFixture() {
    const products: Row[] = Array.from({ length: 25 }, (_, index) => ({
      id: `tp-${String(index).padStart(2, '0')}`,
      product_name: `Product ${index}`,
      sku_code: `SKU-${index}`,
      status: 'Active',
      created_at: `2026-09-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    }));
    const productMedia: Row[] = [
      media('img-24-a', 'tp-24', { sort_order: 0 }),
      media('img-24-primary', 'tp-24', { sort_order: 2, is_primary: true }),
      media('img-23-var', 'tp-23', { sort_order: 0, variation_id: 'some-variation' }),
      media('vid-22', 'tp-22', { media_type: 'video' }),
      media('img-00', 'tp-00'),
    ];
    return { products, product_media: productMedia };
  }

  it('fetches images only for the 20 listed products and keeps the primary/fallback choice', async () => {
    const tables = topFixture();
    const fake = createFakePostgrest({ tables, maxRows: 1000 });
    setSupabaseFake(fake);
    const records = await getTopProducts();
    assert.equal(records.length, 20);
    assert.equal(records[0].id, 'tp-24');
    assert.equal(records[0].imageUrl, 'https://cdn.test/img-24-primary.jpg');
    assert.equal(records[1].imageUrl, 'https://cdn.test/img-23-var.jpg', 'variation images still allowed, as before');
    assert.equal(records[2].imageUrl, '', 'videos are not used');
    const mediaQuery = fake.queries.find((query) => query.table === 'product_media');
    assert.match(mediaQuery?.extraFilters[0] ?? '', /^product_id in \(tp-24,tp-23,.*tp-05\)$/);
    assert.equal(fake.rowsReturned.get('product_media'), 3, 'images of products outside the top 20 are not transferred');
  });

  it('skips the media request when there are no products', async () => {
    const fake = createFakePostgrest({ tables: { products: [], product_media: topFixture().product_media }, maxRows: 1000 });
    setSupabaseFake(fake);
    assert.deepEqual(await getTopProducts(), []);
    assert.equal(fake.queries.filter((query) => query.table === 'product_media').length, 0);
  });

  it('returns an empty list when the media request fails, as before', async () => {
    const fake = createFakePostgrest({
      tables: topFixture(),
      maxRows: 1000,
      failOn: { table: 'product_media', requestIndex: 0, message: 'boom' },
    });
    setSupabaseFake(fake);
    const originalError = console.error;
    console.error = () => {};
    try {
      assert.deepEqual(await getTopProducts(), []);
    } finally {
      console.error = originalError;
    }
  });
});
