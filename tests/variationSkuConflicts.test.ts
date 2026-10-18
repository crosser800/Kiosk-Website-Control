import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setSupabaseFake } from './support/supabaseStub.ts';
import { createFakePostgrest, type Row } from './support/fakePostgrest.ts';
import {
  buildVariationSkuConflictMessage,
  classifyVariationSkuConflicts,
  findVariationSkuConflicts,
  loadVariationConflictPreview,
  openConflictingProduct,
  type SkuGroupRow,
  type SkuGroupVariationRow,
  type SkuProductRow,
  type VariationSkuClaim,
} from '../src/components/products/addProducts/variationSkuConflicts.ts';

const CODES = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];

function group(id: string, productId: string, name: string, sku: string): SkuGroupRow {
  return { id, product_id: productId, variation_name: name, sku_code: sku, normalized_sku_code: sku.trim().toLowerCase() };
}

function liveRows(groupId: string, productId: string, availability = 'Available'): SkuGroupVariationRow[] {
  return CODES.map(() => ({ variation_group_id: groupId, product_id: productId, availability }));
}

const products: SkuProductRow[] = [
  { id: 'faucet', product_name: 'Gooseneck Faucet', status: 'Active', category_id: 'cat-plumbing' },
  { id: 'hinge', product_name: 'Brass Hinge', status: 'Inactive', category_id: 'cat-hardware' },
  { id: 'valve', product_name: 'Angle Valve', status: 'Active', category_id: 'cat-plumbing' },
];

function claim(cardKey: string, variationName: string, skuCode: string, existingGroupId: string | null): VariationSkuClaim {
  return { cardKey, variationName, skuCode, existingGroupId };
}

describe('classifyVariationSkuConflicts', () => {
  it('reports a genuine duplicate in another product with its product, variation and status', () => {
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [claim('group:g-own', 'GG (602g)', 'BH-100', 'g-own')],
      groups: [group('g-own', 'faucet', 'GG (602g)', 'PSS-G1217'), group('g-hinge', 'hinge', 'Satin', 'BH-100')],
      groupVariationRows: [...liveRows('g-own', 'faucet'), ...liveRows('g-hinge', 'hinge', 'Unavailable')],
      products,
    });

    assert.equal(result.conflicts.length, 1);
    const [conflict] = result.conflicts;
    assert.equal(conflict.scope, 'other_product');
    assert.equal(conflict.productId, 'hinge');
    assert.equal(conflict.productName, 'Brass Hinge');
    assert.equal(conflict.productStatus, 'Inactive');
    assert.equal(conflict.categoryId, 'cat-hardware');
    assert.equal(conflict.variationGroupId, 'g-hinge');
    assert.equal(conflict.variationName, 'Satin');
    assert.equal(conflict.recordStatus, 'Unavailable');
    assert.equal(conflict.liveRowCount, 6);
    assert.equal(conflict.targetCardKey, null);
    assert.match(buildVariationSkuConflictMessage(result.conflicts), /SKU "BH-100" is already used by variation "Satin" of product "Brass Hinge"/);
  });

  it('ignores an orphaned group (the PSS-G1217 false duplicate) and reports it only as diagnostic', () => {
    // Live data shape: GG was deleted and re-added as "PSS- G1217"; the old
    // group bf524e86 kept "PSS-G1217" with no product_variations rows.
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [claim('group:afc6c521', 'GG (602g)', 'PSS-G1217', 'afc6c521')],
      groups: [group('bf524e86', 'faucet', 'GG (602g)', 'PSS-G1217')],
      groupVariationRows: liveRows('afc6c521', 'faucet'),
      products,
    });

    assert.deepEqual(result.conflicts, []);
    assert.deepEqual(result.ignoredOrphans, [
      { groupId: 'bf524e86', productId: 'faucet', variationName: 'GG (602g)', sku: 'PSS-G1217' },
    ]);
  });

  it('lists every live conflicting record when several share the SKU, skipping orphans', () => {
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [claim('text:new::ab-1', 'New', 'AB-1', null)],
      groups: [
        group('g-hinge', 'hinge', 'Satin', 'AB-1'),
        group('g-valve', 'valve', 'Chrome', 'ab-1 '),
        group('g-orphan', 'valve', 'Old', 'AB-1'),
      ],
      groupVariationRows: [...liveRows('g-hinge', 'hinge'), ...liveRows('g-valve', 'valve')],
      products,
    });

    assert.deepEqual(
      result.conflicts.map((conflict) => [conflict.productName, conflict.variationName]),
      [
        ['Brass Hinge', 'Satin'],
        ['Angle Valve', 'Chrome'],
      ],
    );
    assert.deepEqual(result.ignoredOrphans.map((orphan) => orphan.groupId), ['g-orphan']);
  });

  it('reports a duplicate inside the same product with the card to select', () => {
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [
        claim('group:g-mb', 'MB', 'PSS-G717', 'g-mb'),
        claim('group:g-ss', 'S/S', 'PSS-G717', 'g-ss'),
      ],
      groups: [group('g-mb', 'faucet', 'MB', 'PSS-G717'), group('g-ss', 'faucet', 'S/S', 'PSS-G1117')],
      groupVariationRows: [...liveRows('g-mb', 'faucet'), ...liveRows('g-ss', 'faucet', 'Mixed')],
      products,
    });

    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].scope, 'same_product');
    assert.equal(result.conflicts[0].claimCardKey, 'group:g-ss');
    assert.equal(result.conflicts[0].targetCardKey, 'group:g-mb');
    assert.equal(result.conflicts[0].variationName, 'MB');
  });

  it('reports two new variations in one save claiming the same SKU once', () => {
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [claim('text:a::x-1', 'A', 'X-1', null), claim('text:b::x-1', 'B', 'x-1', null)],
      groups: [],
      groupVariationRows: [],
      products,
    });

    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].scope, 'same_save');
    assert.equal(result.conflicts[0].claimCardKey, 'text:b::x-1');
    assert.equal(result.conflicts[0].targetCardKey, 'text:a::x-1');
    assert.equal(result.conflicts[0].recordStatus, 'Unsaved');
  });

  it('never re-validates an unchanged SKU, so legacy shared SKUs stay saveable', () => {
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [claim('group:g-own', 'GG', 'LEGACY-1', 'g-own')],
      groups: [group('g-own', 'faucet', 'GG', 'LEGACY-1'), group('g-hinge', 'hinge', 'Satin', 'LEGACY-1')],
      groupVariationRows: [...liveRows('g-own', 'faucet'), ...liveRows('g-hinge', 'hinge')],
      products,
    });
    assert.deepEqual(result.conflicts, []);
  });

  it('allows two variations of the product to swap SKUs in one save', () => {
    const result = classifyVariationSkuConflicts({
      productId: 'faucet',
      claims: [claim('group:g-a', 'A', 'SKU-B', 'g-a'), claim('group:g-b', 'B', 'SKU-A', 'g-b')],
      groups: [group('g-a', 'faucet', 'A', 'SKU-A'), group('g-b', 'faucet', 'B', 'SKU-B')],
      groupVariationRows: [...liveRows('g-a', 'faucet'), ...liveRows('g-b', 'faucet')],
      products,
    });
    assert.deepEqual(result.conflicts, []);
  });

  it('treats a variation removed in this edit as a conflict unless it is re-added under the same name', () => {
    const base = {
      productId: 'faucet',
      groups: [group('g-removed', 'faucet', 'Chrome', 'CR-1')],
      groupVariationRows: liveRows('g-removed', 'faucet'),
      products,
    };
    const sameName = classifyVariationSkuConflicts({ ...base, claims: [claim('text:chrome::cr-1', 'chrome ', 'CR-1', null)] });
    assert.deepEqual(sameName.conflicts, []);

    const otherName = classifyVariationSkuConflicts({ ...base, claims: [claim('text:gold::cr-1', 'Gold', 'CR-1', null)] });
    assert.equal(otherName.conflicts.length, 1);
    assert.equal(otherName.conflicts[0].scope, 'same_product');
    assert.equal(otherName.conflicts[0].targetCardKey, null);
    assert.match(buildVariationSkuConflictMessage(otherName.conflicts), /removed in this edit, but still saved/);
  });
});

describe('findVariationSkuConflicts / preview / navigation (read-only queries)', () => {
  afterEach(() => setSupabaseFake(null));

  function installTables() {
    const variationRows: Row[] = [
      ...CODES.map((code, index) => ({
        id: `v-hinge-${code}`,
        product_id: 'hinge',
        variation_group_id: 'g-hinge',
        variation_name: 'Satin',
        class_name: 'Satin',
        sku_code: 'BH-100',
        price_code: code,
        price: 100 + index,
        availability: 'Available',
      })),
    ];
    const fake = createFakePostgrest({
      maxRows: 1000,
      tables: {
        product_variation_groups: [
          { ...group('g-hinge', 'hinge', 'Satin', 'BH-100') },
          { ...group('g-orphan', 'valve', 'Old', 'BH-100') },
        ],
        product_variations: variationRows,
        products: products.map((product) => ({ ...product })),
        product_variation_unit_options: [
          { id: 'u1', variation_id: 'v-hinge-R1', unit_code: 'pc', quantity_in_base_unit: 1, base_unit_code: 'pc', status: 'Active', sort_order: 0 },
          { id: 'u2', variation_id: 'v-hinge-R1', unit_code: 'box', quantity_in_base_unit: 12, base_unit_code: 'pc', status: 'Active', sort_order: 1 },
        ],
      },
    });
    setSupabaseFake(fake);
    return fake;
  }

  it('loads live owners only and never writes', async () => {
    const fake = installTables();
    const result = await findVariationSkuConflicts('faucet', [claim('text:x::bh-100', 'X', ' BH-100', null)]);
    assert.deepEqual(result.conflicts.map((conflict) => conflict.variationGroupId), ['g-hinge']);
    assert.deepEqual(result.ignoredOrphans.map((orphan) => orphan.groupId), ['g-orphan']);
    assert.ok(fake.queries.every((query) => query.columns), 'only select queries were issued');
  });

  it('builds a verified read-only preview and refuses orphan or mismatched targets', async () => {
    installTables();
    const preview = await loadVariationConflictPreview({ productId: 'hinge', variationGroupId: 'g-hinge' });
    assert.ok(preview);
    assert.equal(preview.productName, 'Brass Hinge');
    assert.equal(preview.variationName, 'Satin');
    assert.deepEqual(preview.prices.map((price) => price.priceCode), CODES);
    assert.deepEqual(preview.unitOptions.map((unit) => `${unit.unitCode}x${unit.quantityInBaseUnit}`), ['pcx1', 'boxx12']);

    assert.equal(await loadVariationConflictPreview({ productId: 'valve', variationGroupId: 'g-orphan' }), null);
    assert.equal(await loadVariationConflictPreview({ productId: 'valve', variationGroupId: 'g-hinge' }), null);
  });

  it('asks about unsaved changes before navigating and stays put when cancelled', async () => {
    installTables();
    const target = { productId: 'hinge', variationGroupId: 'g-hinge' };
    const opened: string[] = [];
    const openProduct = (productId: string, groupId: string) => {
      opened.push(`${productId}/${groupId}`);
      return true;
    };

    let prompts = 0;
    const cancelled = await openConflictingProduct(target, {
      verify: () => loadVariationConflictPreview(target),
      confirmUnsavedChanges: async () => {
        prompts += 1;
        return false;
      },
      openProduct,
    });
    assert.equal(cancelled, 'cancelled');
    assert.equal(prompts, 1);
    assert.deepEqual(opened, []);

    const done = await openConflictingProduct(target, {
      verify: () => loadVariationConflictPreview(target),
      confirmUnsavedChanges: async () => true,
      openProduct,
    });
    assert.equal(done, null);
    assert.deepEqual(opened, ['hinge/g-hinge']);
  });

  it('never prompts or navigates for an unverified record', async () => {
    installTables();
    const target = { productId: 'valve', variationGroupId: 'g-orphan' };
    let prompted = false;
    const outcome = await openConflictingProduct(target, {
      verify: () => loadVariationConflictPreview(target),
      confirmUnsavedChanges: async () => {
        prompted = true;
        return true;
      },
      openProduct: () => {
        throw new Error('must not navigate');
      },
    });
    assert.equal(outcome, 'not_found');
    assert.equal(prompted, false);
  });

  it('reports when the workspace cannot show the verified product', async () => {
    installTables();
    const target = { productId: 'hinge', variationGroupId: 'g-hinge' };
    const outcome = await openConflictingProduct(target, {
      verify: () => loadVariationConflictPreview(target),
      confirmUnsavedChanges: async () => true,
      openProduct: () => false,
    });
    assert.equal(outcome, 'unavailable');
  });
});
