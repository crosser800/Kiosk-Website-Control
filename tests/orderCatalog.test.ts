// Runs the real loadOrderCatalog + pricing against an in-memory PostgREST
// fake (tests/support). Needs `node --import ./tests/support/register.mjs`,
// which `npm test` passes.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setSupabaseFake } from './support/supabaseStub.ts';
import { createFakePostgrest, type Row } from './support/fakePostgrest.ts';
import { loadOrderCatalog, type OrderCatalogProduct } from '../src/services/orderCatalog.ts';
import { calculateOrderLine, type OrderPriceCode } from '../src/services/orderPricing.ts';

const PRICE_META: Record<OrderPriceCode, { branch: string; type: string }> = {
  R1: { branch: 'Manila', type: 'Retail' },
  R2: { branch: 'Cebu', type: 'Retail' },
  W1: { branch: 'Manila', type: 'Wholesale' },
  W2: { branch: 'Cebu', type: 'Wholesale' },
  SP: { branch: 'Both', type: 'Special' },
  CP: { branch: 'Both', type: 'Concept Store' },
};
const CODES = Object.keys(PRICE_META) as OrderPriceCode[];
const ORDER_DATE = new Date('2026-10-12T04:00:00.000Z');

function variationRow(productId: string, name: string, sku: string, code: OrderPriceCode, price: number): Row {
  return {
    id: `v-${productId}-${name}-${code}`,
    product_id: productId,
    variation_name: name,
    class_name: name,
    branch_name: PRICE_META[code].branch,
    price_type: PRICE_META[code].type,
    price_code: code,
    price,
    sku_code: sku,
    stock_quantity: 50,
    availability: 'Available',
    sort_order: 0,
  };
}

function unitRow(id: string, variationId: string, unitCode: string, quantity: number, extra: Row = {}): Row {
  return {
    id,
    variation_id: variationId,
    unit_code: unitCode,
    unit_label: unitCode,
    base_unit_code: 'pc',
    quantity_in_base_unit: quantity,
    price_override: null,
    packaging_text: null,
    min_order_quantity: 1,
    order_increment: 1,
    is_default: unitCode === 'pc',
    is_orderable: true,
    status: 'Active',
    sort_order: quantity,
    notes: null,
    weight_value: null,
    weight_unit: null,
    length_value: null,
    width_value: null,
    height_value: null,
    dimension_unit: null,
    shipping_notes: null,
    ...extra,
  };
}

function discountRow(id: string, productId: string, code: OrderPriceCode, extra: Row): Row {
  return {
    id,
    product_id: productId,
    discount_kind: 'Base',
    discount_name: id,
    discount_type: 'Percent',
    discount_percent: 10,
    amount: null,
    status: 'Active',
    min_quantity: 1,
    max_quantity: null,
    branch_name: PRICE_META[code].branch,
    price_type: PRICE_META[code].type,
    price_code: code,
    priority: 0,
    apply_sequence: 1,
    calculation_method: 'Single',
    discount_group: `group-${id}`,
    applies_to: 'UnitPrice',
    stackable: false,
    starts_at: null,
    ends_at: null,
    ...extra,
  };
}

function discountClassRow(id: string, discountId: string, variationId: string, code: OrderPriceCode, extra: Row = {}): Row {
  return {
    id,
    discount_id: discountId,
    variation_id: variationId,
    price_code: code,
    branch_name: PRICE_META[code].branch,
    price_type: PRICE_META[code].type,
    unit_option_id: null,
    order_unit_code: null,
    unit_condition: 'any_unit',
    min_order_quantity: 1,
    max_order_quantity: null,
    min_base_quantity: null,
    max_base_quantity: null,
    ...extra,
  };
}

// Realistic catalog: one product with all six price codes, unit options on
// the representative R1 row, base + amount discounts, a stacked group, a
// freebie promo, inactive rows that must stay filtered out, and filler rows
// so every table spans several pages under a small Max Rows cap.
function buildFixture(fillerCount = 12) {
  const products: Row[] = [
    { id: 'p-paint', category_id: 'c1', product_name: 'Paint', sku_code: 'PNT', status: 'Active', product_categories: { category_title: 'Paints' } },
    { id: 'p-nails', category_id: 'c2', product_name: 'Nails', sku_code: 'NLS', status: 'Active', product_categories: { category_title: 'Hardware' } },
    { id: 'p-old', category_id: 'c2', product_name: 'Old Stock', sku_code: 'OLD', status: 'Inactive', product_categories: { category_title: 'Hardware' } },
  ];
  const prices: Record<OrderPriceCode, number> = { R1: 100, R2: 105, W1: 90, W2: 92, SP: 80, CP: 85 };
  const variations: Row[] = CODES.map((code) => variationRow('p-paint', 'Matte', 'PNT-M', code, prices[code]));
  variations.push(variationRow('p-nails', '2in', 'NLS-2', 'R1', 10), variationRow('p-nails', '2in', 'NLS-2', 'W1', 8));
  const unitOptions: Row[] = [
    unitRow('u-paint-pc', 'v-p-paint-Matte-R1', 'pc', 1),
    unitRow('u-paint-box', 'v-p-paint-Matte-R1', 'box', 10),
    unitRow('u-paint-old', 'v-p-paint-Matte-R1', 'gal', 4, { status: 'Inactive' }),
    unitRow('u-nails-pc', 'v-p-nails-2in-R1', 'pc', 1),
  ];
  const discounts: Row[] = [
    discountRow('d-paint-r1', 'p-paint', 'R1', {}),
    discountRow('d-paint-w1', 'p-paint', 'W1', { discount_type: 'Amount', discount_percent: null, amount: 5 }),
    discountRow('d-paint-sp-a', 'p-paint', 'SP', { discount_group: 'stack-sp', calculation_method: 'Cascading', stackable: true, apply_sequence: 1 }),
    discountRow('d-paint-sp-b', 'p-paint', 'SP', { discount_group: 'stack-sp', calculation_method: 'Cascading', stackable: true, apply_sequence: 2, discount_percent: 5 }),
    discountRow('d-orphan', 'p-paint', 'R2', {}),
  ];
  // Class ids chosen so the paint classes sort onto the LAST pages.
  const discountClasses: Row[] = [
    discountClassRow('dc-z1', 'd-paint-r1', 'v-p-paint-Matte-R1', 'R1', { min_order_quantity: 2 }),
    discountClassRow('dc-z2', 'd-paint-w1', 'v-p-paint-Matte-W1', 'W1'),
    discountClassRow('dc-z3', 'd-paint-sp-a', 'v-p-paint-Matte-SP', 'SP'),
    discountClassRow('dc-z4', 'd-paint-sp-b', 'v-p-paint-Matte-SP', 'SP'),
  ];
  const surcharges: Row[] = [
    {
      id: 's-paint-freebie',
      product_id: 'p-paint',
      linked_discount_id: 'd-paint-r1',
      surcharge_name: 'Buy 5 get 1',
      surcharge_type: 'Freebie',
      surcharge_percent: null,
      amount: null,
      free_quantity: 1,
      qualification_scope: 'line',
      reward_target_type: 'same_item',
      reward_product_id: 'p-paint',
      reward_variation_id: 'v-p-paint-Matte-R1',
      reward_unit_option_id: 'u-paint-pc',
      reward_unit_code: 'pc',
      reward_repeat_mode: 'one_time',
      reward_every_quantity: null,
      status: 'Active',
      min_quantity: 1,
      max_quantity: null,
      branch_name: 'Manila',
      price_type: 'Retail',
      price_code: 'R1',
      priority: 0,
      starts_at: null,
      ends_at: null,
    },
  ];
  const surchargeClasses: Row[] = [
    {
      ...discountClassRow('sc-z1', '', 'v-p-paint-Matte-R1', 'R1', { min_order_quantity: 5 }),
      discount_id: undefined,
      surcharge_id: 's-paint-freebie',
      linked_discount_class_id: 'dc-z1',
      reward_quantity: 1,
      reward_target_type: 'same_item',
      reward_product_id: 'p-paint',
      reward_variation_id: 'v-p-paint-Matte-R1',
      reward_unit_option_id: 'u-paint-pc',
      reward_unit_code: 'pc',
      reward_repeat_mode: 'one_time',
      reward_every_quantity: null,
    },
  ];

  for (let index = 0; index < fillerCount; index += 1) {
    const key = String(index).padStart(2, '0');
    const productId = `p-f${key}`;
    const variation = variationRow(productId, `Filler ${key}`, `F-${key}`, 'R1', 20 + index);
    products.push({ id: productId, category_id: 'c3', product_name: `Filler ${key}`, sku_code: `F-${key}`, status: 'Active', product_categories: { category_title: 'Misc' } });
    variations.push(variation);
    unitOptions.push(unitRow(`u-f${key}`, String(variation.id), 'pc', 1));
    discounts.push(discountRow(`d-f${key}`, productId, 'R1', {}));
    discountClasses.push(discountClassRow(`dc-f${key}`, `d-f${key}`, String(variation.id), 'R1'));
    surcharges.push({ ...surcharges[0], id: `s-f${key}`, product_id: productId, linked_discount_id: `d-f${key}`, reward_product_id: productId, reward_variation_id: variation.id, reward_unit_option_id: `u-f${key}` });
    surchargeClasses.push({ ...surchargeClasses[0], id: `sc-f${key}`, surcharge_id: `s-f${key}`, linked_discount_class_id: `dc-f${key}`, variation_id: variation.id, reward_product_id: productId, reward_variation_id: variation.id, reward_unit_option_id: `u-f${key}` });
  }

  const priceClasses: Row[] = CODES.map((code, index) => ({
    id: `pc-${code}`,
    price_code: code,
    price_label: code,
    preference_code: code,
    status: 'Active',
    sort_order: index,
  }));

  return {
    products,
    product_variations: variations,
    product_variation_unit_options: unitOptions,
    price_classes: priceClasses,
    product_discounts: discounts,
    product_discount_classes: discountClasses,
    product_surcharges: surcharges,
    product_surcharge_classes: surchargeClasses,
  };
}

async function loadWith(tables: Record<string, Row[]>, maxRows: number) {
  const fake = createFakePostgrest({ tables, maxRows });
  setSupabaseFake(fake);
  const catalog = await loadOrderCatalog();
  return { catalog, queries: fake.queries };
}

// Every orderable line the create-order screen could price.
function priceEverything(catalog: OrderCatalogProduct[]) {
  return catalog.flatMap((product) =>
    product.variations.flatMap((variation) =>
      Object.values(variation.prices).flatMap((price) =>
        variation.unitOptions.flatMap((unitOption) =>
          [1, 2, 5, 10].map((quantity) => ({
            key: `${product.id}|${price!.priceCode}|${unitOption.unitCode}|${quantity}`,
            line: calculateOrderLine({
              price: price!,
              unitOption,
              quantity,
              discounts: variation.discounts,
              surcharges: variation.surcharges,
              orderDate: ORDER_DATE,
            }),
          })),
        ),
      ),
    ),
  );
}

afterEach(() => setSupabaseFake(null));

describe('loadOrderCatalog pagination', () => {
  it('shows the root cause: a single capped request silently drops rows', async () => {
    const tables = buildFixture();
    const fake = createFakePostgrest({ tables, maxRows: 5 });
    const response = await (fake.from('product_discount_classes') as unknown as PromiseLike<{ data: Row[] }>);
    assert.equal(response.data.length, 5);
    assert.ok(tables.product_discount_classes.length > 5);
  });

  it('builds the same catalog whether the server returns one page or many', async () => {
    const tables = buildFixture();
    const onePage = await loadWith(tables, Number.POSITIVE_INFINITY);
    const manyPages = await loadWith(tables, 3);
    assert.deepEqual(manyPages.catalog, onePage.catalog);
    const variationRequests = manyPages.queries.filter((query) => query.table === 'product_variations');
    assert.ok(variationRequests.length > 3, 'variations were read across several pages');
  });

  it('keeps every relationship that spans pages (classes, unit options, promos)', async () => {
    const { catalog } = await loadWith(buildFixture(), 3);
    const paint = catalog.find((product) => product.id === 'p-paint');
    assert.ok(paint);
    const matte = paint.variations[0];
    assert.deepEqual(Object.keys(matte.prices).sort(), [...CODES].sort());
    assert.deepEqual(matte.unitOptions.map((option) => option.unitCode), ['pc', 'box']);
    assert.deepEqual(
      matte.discounts.map((rule) => rule.id).sort(),
      ['d-paint-r1', 'd-paint-sp-a', 'd-paint-sp-b', 'd-paint-w1'],
      'the zero-class header stays excluded',
    );
    assert.equal(matte.discounts.find((rule) => rule.id === 'd-paint-r1')?.classes[0]?.minOrderQuantity, 2);
    assert.deepEqual(matte.surcharges.map((rule) => rule.id), ['s-paint-freebie']);
    assert.equal(matte.surcharges[0].classes[0].linkedDiscountClassId, 'dc-z1');
    assert.equal(catalog.length, 14, 'inactive product filtered out, 2 + 12 filler products kept');
  });

  it('prices every line identically to the unpaginated catalog', async () => {
    const tables = buildFixture();
    const reference = priceEverything((await loadWith(tables, Number.POSITIVE_INFINITY)).catalog);
    const paged = priceEverything((await loadWith(tables, 3)).catalog);
    assert.deepEqual(paged, reference);

    const line = (key: string) => paged.find((entry) => entry.key === key)?.line;
    // Base 10% on R1 from 2 units: 2 x 100 = 200 -> 20 off.
    assert.equal(line('p-paint|R1|pc|2')?.discountAmount, 20);
    assert.equal(line('p-paint|R1|pc|1')?.discountAmount, 0);
    // Box = 10 x base price.
    assert.equal(line('p-paint|R1|box|1')?.grossSubtotal, 1000);
    // Fixed 5 off on W1.
    assert.equal(line('p-paint|W1|pc|1')?.discountAmount, 5);
    // Cascading SP stack: 80 -> 10% -> 72 -> 5% -> 68.4.
    assert.ok(Math.abs((line('p-paint|SP|pc|1')?.finalLineTotal ?? 0) - 68.4) < 1e-9);
    // Freebie from 5 units.
    assert.equal(line('p-paint|R1|pc|5')?.freeQuantity, 1);
    assert.equal(line('p-paint|R1|pc|2')?.freeQuantity, 0);
  });

  it('pages a large table at the default page size under a 1000-row cap', async () => {
    const tables = buildFixture(1200);
    const { catalog, queries } = await loadWith(tables, 1000);
    assert.equal(catalog.length, 1202);
    const variationRanges = queries.filter((query) => query.table === 'product_variations').map((query) => query.range);
    assert.deepEqual(variationRanges, [
      [0, 499],
      [500, 999],
      [1000, 1499],
    ]);
    assert.equal(catalog.reduce((sum, product) => sum + product.variations.reduce((n, variation) => n + variation.discounts.length, 0), 0), 1204);
  });

  it('keeps filters, original ordering plus an id tie-breaker, and exact counts on every request', async () => {
    const { queries } = await loadWith(buildFixture(), 3);
    const first = (table: string) => queries.find((query) => query.table === table);
    assert.deepEqual(first('products')?.filters, [['status', 'Active']]);
    assert.deepEqual(first('product_variation_unit_options')?.filters, [['status', 'Active']]);
    assert.deepEqual(first('price_classes')?.filters, [['status', 'Active']]);
    assert.deepEqual(first('products')?.orders, ['product_name', 'id']);
    assert.deepEqual(first('product_variations')?.orders, ['sort_order', 'id']);
    assert.deepEqual(first('product_discounts')?.orders, ['apply_sequence', 'priority', 'id']);
    assert.deepEqual(first('product_surcharges')?.orders, ['priority', 'id']);
    assert.deepEqual(first('product_discount_classes')?.orders, ['id']);
    assert.ok(queries.every((query) => query.count === 'exact' && query.range !== null));
    assert.deepEqual(
      [...new Set(queries.map((query) => query.table))].sort(),
      [
        'price_classes',
        'product_discount_classes',
        'product_discounts',
        'product_surcharge_classes',
        'product_surcharges',
        'product_variation_unit_options',
        'product_variations',
        'products',
      ],
    );
  });

  it('loads an empty catalog', async () => {
    const empty = Object.fromEntries(Object.keys(buildFixture()).map((table) => [table, [] as Row[]]));
    const { catalog } = await loadWith(empty, 3);
    assert.deepEqual(catalog, []);
  });

  it('rejects instead of returning a partial catalog when a later page fails', async () => {
    const fake = createFakePostgrest({
      tables: buildFixture(),
      maxRows: 3,
      failOn: { table: 'product_discount_classes', requestIndex: 2, message: 'permission denied' },
    });
    setSupabaseFake(fake);
    await assert.rejects(loadOrderCatalog(), /product discount classes.*permission denied/);
  });

  it('retries and still returns a complete catalog when a row is added mid-load', async () => {
    const tables = buildFixture();
    const fake = createFakePostgrest({
      tables,
      maxRows: 3,
      beforeResponse: (query, requestIndex) => {
        if (query.table === 'product_discount_classes' && requestIndex === 1) {
          tables.product_discount_classes.push(
            discountClassRow('dc-0-new', 'd-paint-r2-new', 'v-p-paint-Matte-R2', 'R2'),
          );
        }
      },
    });
    setSupabaseFake(fake);
    const catalog = await loadOrderCatalog();
    assert.equal(catalog.length, 14);
    const requests = fake.queries.filter((query) => query.table === 'product_discount_classes');
    assert.ok(requests.length > Math.ceil(tables.product_discount_classes.length / 3), 'read was restarted');
  });
});
