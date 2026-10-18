// Products page browsing UI: card-size preferences, product / category cards
// and variation summaries. Components are rendered to static markup (the test
// loader transpiles .tsx and stubs CSS modules; see tests/support/hooks.mjs).
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, createRef } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  CATEGORY_CARD_SIZE,
  CATEGORY_CARD_SIZE_KEY,
  CATEGORY_CARD_SIZE_VAR,
  PRODUCT_CARD_SIZE,
  PRODUCT_CARD_SIZE_KEY,
  PRODUCT_CARD_SIZE_VAR,
  estimateGridColumns,
  getCardSizePercent,
  parseCardSize,
  readCardSize,
  writeCardSize,
} from '../src/components/products/cardSizePreferences.ts';
import { getVariationSummary } from '../src/components/products/productCardPresentation.ts';
import {
  buildProductWorkspace,
  type CategorySummary,
  type ProductListItem,
} from '../src/components/products/productWorkspaceData.ts';
import CardSizeSlider from '../src/components/products/CardSizeSlider.tsx';
import ProductBrowseCard from '../src/components/products/ProductBrowseCard.tsx';
import CategoryBrowseCard from '../src/components/products/CategoryBrowseCard.tsx';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      data.set(key, String(value));
    },
  };
}

function product(overrides: Partial<ProductListItem> = {}): ProductListItem {
  return {
    id: 'p-1',
    categoryId: 'c-1',
    name: 'Stainless Gooseneck Faucet',
    skuCode: 'PSS',
    description: 'Lever handle faucet',
    status: 'Active',
    thumbnailUrl: 'https://cdn.test/faucet.jpg',
    variationCount: 3,
    createdAt: '2026-10-01T00:00:00.000Z',
    categoryTitle: 'Plumbing',
    variationNames: ['GG (602g)', 'MB (602g)', 'S/S (602g)'],
    variationSkus: ['PSS-G1217', 'PSS-G717', 'PSS-G1117'],
    variationLabels: ['GG (602g)', 'MB (602g)', 'S/S (602g)'],
    ...overrides,
  };
}

describe('card size preferences (sessionStorage)', () => {
  it('uses the defaults when nothing valid is stored', () => {
    for (const raw of [null, undefined, '', 'abc', 'NaN', '200px', '1e3', 'Infinity', {}]) {
      assert.equal(parseCardSize(raw, PRODUCT_CARD_SIZE), PRODUCT_CARD_SIZE.defaultValue, String(raw));
    }
    assert.equal(CATEGORY_CARD_SIZE.defaultValue, 270);
    assert.equal(PRODUCT_CARD_SIZE.defaultValue, 170);
  });

  it('clamps to the range and snaps to the step', () => {
    assert.equal(parseCardSize('5', PRODUCT_CARD_SIZE), PRODUCT_CARD_SIZE.min);
    assert.equal(parseCardSize('99999', CATEGORY_CARD_SIZE), CATEGORY_CARD_SIZE.max);
    assert.equal(parseCardSize(' 204 ', PRODUCT_CARD_SIZE), 200);
    assert.equal(parseCardSize(206, PRODUCT_CARD_SIZE), 210);
    assert.equal(parseCardSize('-50', CATEGORY_CARD_SIZE), CATEGORY_CARD_SIZE.min);
  });

  it('keeps category and product sizes independent (separate keys)', () => {
    const storage = memoryStorage();
    writeCardSize(CATEGORY_CARD_SIZE_KEY, 330, CATEGORY_CARD_SIZE, storage);
    writeCardSize(PRODUCT_CARD_SIZE_KEY, 130, PRODUCT_CARD_SIZE, storage);
    assert.equal(readCardSize(CATEGORY_CARD_SIZE_KEY, CATEGORY_CARD_SIZE, storage), 330);
    assert.equal(readCardSize(PRODUCT_CARD_SIZE_KEY, PRODUCT_CARD_SIZE, storage), 130);

    writeCardSize(PRODUCT_CARD_SIZE_KEY, 280, PRODUCT_CARD_SIZE, storage);
    assert.equal(readCardSize(CATEGORY_CARD_SIZE_KEY, CATEGORY_CARD_SIZE, storage), 330, 'category untouched');
    assert.notEqual(CATEGORY_CARD_SIZE_KEY, PRODUCT_CARD_SIZE_KEY);
    assert.notEqual(CATEGORY_CARD_SIZE_VAR, PRODUCT_CARD_SIZE_VAR);
  });

  it('stores normalized values and survives a corrupted entry', () => {
    const storage = memoryStorage({ [PRODUCT_CARD_SIZE_KEY]: 'garbage' });
    assert.equal(readCardSize(PRODUCT_CARD_SIZE_KEY, PRODUCT_CARD_SIZE, storage), PRODUCT_CARD_SIZE.defaultValue);
    assert.equal(writeCardSize(PRODUCT_CARD_SIZE_KEY, 999, PRODUCT_CARD_SIZE, storage), PRODUCT_CARD_SIZE.max);
    assert.equal(storage.data.get(PRODUCT_CARD_SIZE_KEY), String(PRODUCT_CARD_SIZE.max));
  });

  it('falls back safely when storage is unavailable or throws', () => {
    const throwing = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    assert.equal(readCardSize(CATEGORY_CARD_SIZE_KEY, CATEGORY_CARD_SIZE, throwing), CATEGORY_CARD_SIZE.defaultValue);
    assert.equal(writeCardSize(CATEGORY_CARD_SIZE_KEY, 300, CATEGORY_CARD_SIZE, throwing), 300);
    assert.equal(readCardSize(CATEGORY_CARD_SIZE_KEY, CATEGORY_CARD_SIZE, null), CATEGORY_CARD_SIZE.defaultValue);
  });

  it('reports slider fill from 0% to 100%', () => {
    assert.equal(getCardSizePercent(PRODUCT_CARD_SIZE.min, PRODUCT_CARD_SIZE), 0);
    assert.equal(getCardSizePercent(PRODUCT_CARD_SIZE.max, PRODUCT_CARD_SIZE), 100);
    assert.equal(getCardSizePercent(200, PRODUCT_CARD_SIZE), 50);
  });
});

describe('responsive grid size calculations', () => {
  it('fits more columns as the card size shrinks, never fewer than one', () => {
    assert.equal(estimateGridColumns(1000, 270, 16), 3);
    assert.equal(estimateGridColumns(1000, 180, 16), 5);
    assert.equal(estimateGridColumns(1000, 360, 16), 2);
    assert.equal(estimateGridColumns(150, 270, 16), 1, 'card min larger than container -> one full-width column');
    assert.equal(estimateGridColumns(0, 270, 16), 1);
  });

  it('gives the 264px category sidebar two small or one large product column', () => {
    assert.equal(estimateGridColumns(264, PRODUCT_CARD_SIZE.min, 10), 2);
    assert.equal(estimateGridColumns(264, PRODUCT_CARD_SIZE.defaultValue, 10), 1);
  });
});

describe('CardSizeSlider', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = originalWindow;
  });

  it('each slider reads its own session value', () => {
    (globalThis as { window?: unknown }).window = {
      sessionStorage: memoryStorage({ [CATEGORY_CARD_SIZE_KEY]: '330', [PRODUCT_CARD_SIZE_KEY]: '130' }),
    };
    const targetRef = createRef<HTMLElement>();
    const category = renderToStaticMarkup(
      createElement(CardSizeSlider, {
        label: 'Category',
        icon: 'fa-table-cells-large',
        accessibleLabel: 'Category card size',
        storageKey: CATEGORY_CARD_SIZE_KEY,
        range: CATEGORY_CARD_SIZE,
        cssVariable: CATEGORY_CARD_SIZE_VAR,
        targetRef,
      }),
    );
    const productSlider = renderToStaticMarkup(
      createElement(CardSizeSlider, {
        label: 'Product',
        icon: 'fa-box',
        accessibleLabel: 'Product card size',
        storageKey: PRODUCT_CARD_SIZE_KEY,
        range: PRODUCT_CARD_SIZE,
        cssVariable: PRODUCT_CARD_SIZE_VAR,
        targetRef,
      }),
    );
    assert.match(category, /type="range"/);
    assert.match(category, /min="180" max="360" step="10"/);
    assert.match(category, /value="330"/);
    assert.match(category, /fa-table-cells-large/);
    assert.match(category, /<span>Category<\/span>/);
    assert.match(category, /aria-label="Category card size"/);
    assert.match(productSlider, /min="120" max="280" step="10"/);
    assert.match(productSlider, /value="130"/);
    assert.match(productSlider, /fa-box/);
    assert.match(productSlider, /<span>Product<\/span>/);
    for (const removed of ['Small', 'Large', 'Size<']) {
      assert.ok(!category.includes(removed) && !productSlider.includes(removed), `no "${removed}" text`);
    }
  });

  it('renders the default size without session storage', () => {
    (globalThis as { window?: unknown }).window = undefined;
    const html = renderToStaticMarkup(
      createElement(CardSizeSlider, {
        label: 'Product',
        icon: 'fa-box',
        accessibleLabel: 'Product card size',
        storageKey: PRODUCT_CARD_SIZE_KEY,
        range: PRODUCT_CARD_SIZE,
        cssVariable: PRODUCT_CARD_SIZE_VAR,
        targetRef: createRef<HTMLElement>(),
      }),
    );
    assert.match(html, /value="170"/);
  });
});

describe('ProductBrowseCard', () => {
  const render = (props: Partial<Parameters<typeof ProductBrowseCard>[0]> = {}) =>
    renderToStaticMarkup(createElement(ProductBrowseCard, { product: product(), onOpen: () => {}, ...props }));

  it('shows image, name, product SKU, variation summary, category and status only', () => {
    const html = render();
    assert.match(html, /class="productTileMedia"/);
    assert.match(html, /src="https:\/\/cdn\.test\/faucet\.jpg"/);
    assert.match(html, /loading="lazy"/);
    assert.match(html, /decoding="async"/);
    assert.match(html, /Stainless Gooseneck Faucet/);
    assert.match(html, /3 variations: GG \(602g\), MB \(602g\) \+1/);
    assert.match(html, /Plumbing/);
    assert.match(html, /statusActive[^>]*>Active</);
    for (const hidden of ['PSS-G1217', '₱', 'Price', 'Stock', 'Sold', 'Lever handle faucet']) {
      assert.ok(!html.includes(hidden), `card must not show "${hidden}"`);
    }
    assert.match(html, /<span class="productTileSku">PSS<\/span>/, 'original product SKU is shown');
  });

  it('uses the placeholder when there is no image, and the inactive badge', () => {
    const html = render({ product: product({ thumbnailUrl: '', status: 'Inactive', categoryTitle: '' }) });
    assert.ok(!html.includes('<img'));
    assert.match(html, /productTilePlaceholder/);
    assert.match(html, /statusInactive[^>]*>Inactive</);
    assert.match(html, /Uncategorized/);
  });

  it('marks the product open in the editor', () => {
    const html = render({ isActive: true });
    assert.match(html, /productTile productTileActive/);
    assert.match(html, /aria-current="true"/);
  });

  it('search results keep the same card layout; the match reason is a hint, not extra content', () => {
    const plain = render();
    const searchResult = render({ hint: 'Matched variation SKU: PSS-G1217' });
    const structure = (html: string) => html.replace(/ (title|aria-label)="[^"]*"/g, '');
    assert.equal(structure(searchResult), structure(plain));
    assert.match(searchResult, /aria-label="Open Stainless Gooseneck Faucet \(Matched variation SKU: PSS-G1217\)"/);
  });
});

describe('CategoryBrowseCard', () => {
  const category: CategorySummary = {
    id: 'c-1',
    title: 'Power Tools',
    slug: 'power-tools',
    imageUrl: 'https://cdn.test/tools.jpg',
    status: 'Active',
    productCount: 12,
    variationCount: 1,
    products: [],
  };

  it('keeps image, name, status, product and variation counts and the View Products action', () => {
    const html = renderToStaticMarkup(createElement(CategoryBrowseCard, { category, onOpen: () => {} }));
    assert.match(html, /<article class="categoryCard">/);
    assert.match(html, /src="https:\/\/cdn\.test\/tools\.jpg"[^>]*loading="lazy"/);
    assert.match(html, /<h3 class="categoryTitle">Power Tools<\/h3>/);
    assert.match(html, /statusActive[^>]*>Active</);
    assert.match(html, /<span>12<\/span><span class="statLabel">Products<\/span>/);
    assert.match(html, /<span>1<\/span><span class="statLabel">Variation<\/span>/);
    assert.match(html, /View Products/);
    assert.match(html, /aria-label="View products in Power Tools"/);
  });

  it('falls back to initials without an image', () => {
    const html = renderToStaticMarkup(
      createElement(CategoryBrowseCard, { category: { ...category, imageUrl: '', status: 'Inactive' }, onOpen: () => {} }),
    );
    assert.match(html, /categoryPlaceholder">PT</);
    assert.match(html, /statusInactive[^>]*>Inactive</);
  });
});

describe('variation summaries (no price-class duplication)', () => {
  it('summarizes 0, 1, 2 and many variations', () => {
    assert.equal(getVariationSummary([], 0), 'No active variations');
    assert.equal(getVariationSummary(['Matte White'], 1), 'Matte White');
    assert.equal(getVariationSummary(['Matte White', 'Gloss Black'], 2), '2 variations: Matte White, Gloss Black');
    assert.equal(getVariationSummary(['A', 'B', 'C', 'D'], 4), '4 variations: A, B +2');
    assert.equal(getVariationSummary([], 3), '3 variations', 'never invents a name');
    assert.equal(getVariationSummary([''], 1), '1 variation');
  });

  it('collapses the six R1/R2/W1/W2/SP/CP rows of a variation into one label', () => {
    const codes = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];
    const rows = [
      ...codes.map((code) => ({ id: `mw-${code}`, product_id: 'p', variation_name: 'Matte White', class_name: 'Matte White', sku_code: 'LP-MW', availability: 'Available' })),
      ...codes.map((code) => ({ id: `gb-${code}`, product_id: 'p', variation_name: 'Gloss Black', class_name: 'Gloss Black', sku_code: 'LP-GB', availability: 'Available' })),
      ...codes.map((code) => ({ id: `x-${code}`, product_id: 'p', variation_name: 'Retired', class_name: 'Retired', sku_code: 'LP-X', availability: 'Unavailable' })),
    ];
    const workspace = buildProductWorkspace({
      categoryRows: [{ id: 'c', category_title: 'Paints', category_slug: 'paints', category_image_url: '', status: 'Active' }],
      productRows: [{ id: 'p', category_id: 'c', product_name: 'Latex Paint', sku_code: 'LP', description: '', status: 'Active', created_at: '2026-10-01T00:00:00Z' }],
      mediaRows: [],
      variationRows: rows,
    });
    const item = workspace.categories[0].products[0];
    assert.deepEqual(item.variationLabels, ['Matte White', 'Gloss Black']);
    assert.equal(item.variationLabels.length, item.variationCount);
    assert.equal(getVariationSummary(item.variationLabels, item.variationCount), '2 variations: Matte White, Gloss Black');
  });
});

describe('CardSizeSlider icon-only mode', () => {
  it('hides the visible label but keeps the accessible name', () => {
    const html = renderToStaticMarkup(
      createElement(CardSizeSlider, {
        label: 'Product',
        icon: 'fa-box',
        accessibleLabel: 'Product card size',
        hideLabel: true,
        storageKey: PRODUCT_CARD_SIZE_KEY,
        range: PRODUCT_CARD_SIZE,
        cssVariable: PRODUCT_CARD_SIZE_VAR,
        targetRef: createRef<HTMLElement>(),
      }),
    );
    assert.match(html, /<span class="visuallyHidden">Product<\/span>/);
    assert.match(html, /aria-label="Product card size"/);
  });
});

describe('ProductBrowseCard without a product SKU', () => {
  it('omits the SKU line for the "-" placeholder', () => {
    const html = renderToStaticMarkup(
      createElement(ProductBrowseCard, { product: product({ skuCode: '-' }), onOpen: () => {} }),
    );
    assert.ok(!html.includes('productTileSku'));
  });
});

describe('ProductBrowseCard row layout (category sidebar)', () => {
  const renderRow = (props: Partial<Parameters<typeof ProductBrowseCard>[0]> = {}) =>
    renderToStaticMarkup(
      createElement(ProductBrowseCard, { product: product(), onOpen: () => {}, layout: 'row', ...props }),
    );

  it('puts the thumbnail first (left) and the details after it (right)', () => {
    const html = renderRow();
    assert.match(html, /^<button[^>]*class="productRow "/);
    const mediaIndex = html.indexOf('class="productRowMedia"');
    const bodyIndex = html.indexOf('class="productRowBody"');
    assert.ok(mediaIndex > 0 && bodyIndex > mediaIndex, 'media precedes body');
    assert.ok(html.indexOf('<img') > mediaIndex && html.indexOf('<img') < bodyIndex, 'image sits in the left box');
    assert.match(html, /<img src="https:\/\/cdn\.test\/faucet\.jpg" alt="" class="productTileImage" loading="lazy"/);
    assert.ok(!html.includes('productTileMedia'), 'never the image-on-top layout');
  });

  it('shows name, original SKU, variation summary and status; no category, price or description', () => {
    const html = renderRow();
    const body = html.slice(html.indexOf('class="productRowBody"'));
    assert.match(body, /class="productRowName">Stainless Gooseneck Faucet</);
    assert.match(body, /class="productTileSku">PSS</);
    assert.match(body, /3 variations: GG \(602g\), MB \(602g\) \+1/);
    assert.match(body, /statusBadge productRowBadge statusActive">Active</);
    for (const hidden of ['Plumbing', 'fa-folder', 'Lever handle faucet', '₱', 'Stock']) {
      assert.ok(!html.includes(hidden), `row card must not show "${hidden}"`);
    }
  });

  it('keeps the yellow selection state and the placeholder', () => {
    const active = renderRow({ isActive: true, product: product({ thumbnailUrl: '', status: 'Inactive' }) });
    assert.match(active, /class="productRow productTileActive"/);
    assert.match(active, /aria-current="true"/);
    assert.match(active, /productRowMedia"><span class="productTilePlaceholder">/);
    assert.match(active, /statusInactive">Inactive</);
  });
});
