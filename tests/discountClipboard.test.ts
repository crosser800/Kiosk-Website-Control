import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildAdjustmentClipboard,
  getPasteBlockReason,
  getPastedRowIssues,
  mergePastedRows,
  preparePastedRows,
  resolveDifferentItemReward,
  type AdjustmentClipboard,
  type DifferentItemRewardResolution,
  type DiscountDraftRow,
  type PasteTarget,
  type PriceCode,
  type RewardVariationRow,
} from '../src/components/products/addProducts/discountClipboard.ts';

const NOW = new Date('2026-10-12T00:00:00.000Z');
const FUTURE = '2026-12-31T00:00:00.000Z';
const PAST = '2026-01-01T00:00:00.000Z';
const PRODUCT = 'product-a';

function row(overrides: Partial<DiscountDraftRow> = {}): DiscountDraftRow {
  return {
    id: 'src-row-1',
    adjustmentKind: 'Discount',
    discountKind: 'Base',
    discountName: 'Base 10%',
    discountType: 'Percent',
    amount: '10',
    calculationMethod: 'Single',
    applySequence: '1',
    discountGroup: 'rule-small-R1-g1',
    unitCondition: 'any_unit',
    unitOptionId: '',
    minOrderQuantity: '1',
    maxOrderQuantity: '',
    status: 'Inactive',
    startsAt: '',
    endsAt: '',
    promoValidityMode: 'Fixed',
    promoDurationPreset: '7d',
    stackable: false,
    hasPromo: false,
    promoType: 'Freebie',
    promoRewardUnitCode: '',
    promoRewardQuantity: '1',
    promoSourceSurchargeId: '',
    promoRewardTargetType: 'same_item',
    promoRewardProductId: '',
    promoRewardProductLabel: '',
    promoRewardVariationId: '',
    promoRewardVariationLabel: '',
    promoRewardUnitOptionId: '',
    promoRewardRepeatMode: 'one_time',
    promoRewardEveryQuantity: '',
    promoQualificationScope: 'line',
    promoRewardSearchQuery: '',
    promoGiftCheckEnabled: false,
    promoGiftCheckId: '',
    promoGiftCheckCode: '',
    promoGiftCheckName: '',
    promoGiftCheckQuantity: '',
    ...overrides,
  };
}

// Small and Large are two logical variations of PRODUCT; each has its own
// unit options (different ids, shared unit codes).
const UNITS: Record<string, Array<{ id: string; unitCode: string }>> = {
  small: [
    { id: 'small-pc', unitCode: 'pc' },
    { id: 'small-box', unitCode: 'box' },
  ],
  large: [
    { id: 'large-pc', unitCode: 'pc' },
    { id: 'large-box', unitCode: 'box' },
  ],
  medium: [{ id: 'medium-pc', unitCode: 'pc' }],
};
const UNIT_CODE_BY_ID: Record<string, string> = Object.fromEntries(
  Object.values(UNITS).flat().map((unit) => [unit.id, unit.unitCode]),
);

function clipboard(
  rows: DiscountDraftRow[],
  overrides: { variationId?: string; priceCode?: PriceCode; productScope?: string } = {},
): AdjustmentClipboard {
  return buildAdjustmentClipboard({
    productScope: overrides.productScope ?? PRODUCT,
    variationId: overrides.variationId ?? 'small',
    variationLabel: `${overrides.variationId ?? 'small'} · ${overrides.priceCode ?? 'R1'}`,
    priceCode: overrides.priceCode ?? 'R1',
    rows,
    unitCodeById: UNIT_CODE_BY_ID,
    copiedAt: NOW.getTime(),
  });
}

function target(overrides: Partial<PasteTarget> = {}): PasteTarget {
  const variationId = overrides.variationId ?? 'small';
  return {
    productScope: PRODUCT,
    variationId,
    priceCode: 'R2',
    hasPriceRow: true,
    unitOptions: UNITS[variationId] ?? [],
    sameProductRewardVariationIds: ['small', 'large', 'medium'].filter((id) => id !== variationId),
    getRewardVariationUnitOptions: (id) => UNITS[id] ?? [],
    getUnitPrice: (unitOptionId) => (unitOptionId.endsWith('box') ? 1000 : 200),
    ...overrides,
  };
}

function idFactory(prefix: string) {
  let next = 0;
  return () => `${prefix}-${++next}`;
}

function paste(
  source: AdjustmentClipboard,
  pasteTarget: PasteTarget,
  differentItemResolutions: Record<string, DifferentItemRewardResolution> = {},
) {
  const result = preparePastedRows(source, pasteTarget, {
    createId: idFactory('new-row'),
    createGroupId: idFactory('new-group'),
    differentItemResolutions,
    now: NOW,
  });
  assert.ok(result.ok, result.ok ? '' : result.error);
  return result.value;
}

function stackedSource() {
  return [
    row({ id: 'g1-a', discountGroup: 'g1', applySequence: '1', stackable: true, calculationMethod: 'Cascading' }),
    row({
      id: 'g1-b',
      discountGroup: 'g1',
      applySequence: '2',
      amount: '5',
      stackable: true,
      calculationMethod: 'Cascading',
    }),
    row({
      id: 'g2-a',
      discountGroup: 'g2',
      discountKind: 'Promo',
      discountName: 'Promo box',
      unitCondition: 'selected_unit',
      unitOptionId: 'small-box',
      status: 'Active',
      endsAt: FUTURE,
      promoSourceSurchargeId: '3f0b1c9e-1111-4a2b-8c3d-000000000001',
    }),
    row({
      id: 'sur-1',
      adjustmentKind: 'Surcharge',
      discountKind: '',
      discountName: 'Delivery',
      discountType: 'Amount',
      amount: '25',
      discountGroup: 'surcharge-sur-1',
    }),
  ];
}

describe('buildAdjustmentClipboard', () => {
  it('stores a detached, frozen snapshot', () => {
    const rows = stackedSource();
    const snapshot = clipboard(rows);
    rows[0].amount = '99';
    rows.push(row({ id: 'late' }));
    assert.equal(snapshot.rows[0].amount, '10');
    assert.equal(snapshot.rows.length, 4);
    assert.ok(Object.isFrozen(snapshot.rows[0]));
    assert.throws(() => {
      (snapshot.rows[0] as DiscountDraftRow).amount = '1';
    });
  });

  it('copies an unsaved draft whose ids are not persisted UUIDs', () => {
    const value = paste(clipboard([row({ id: 'temp-unsaved', discountGroup: '' })]), target());
    assert.equal(value.rows.length, 1);
    assert.equal(value.rows[0].id, 'new-row-1');
    assert.equal(value.rows[0].discountGroup, 'new-group-1');
  });
});

describe('preparePastedRows identity safety', () => {
  for (const [from, to] of [
    ['R1', 'R2'],
    ['R1', 'W1'],
    ['W2', 'SP'],
    ['SP', 'CP'],
  ] as Array<[PriceCode, PriceCode]>) {
    it(`copies ${from} -> ${to} with fresh ids and remapped groups`, () => {
      const sourceRows = stackedSource();
      const before = JSON.parse(JSON.stringify(sourceRows));
      const value = paste(clipboard(sourceRows, { priceCode: from }), target({ priceCode: to }));

      const sourceIds = new Set(sourceRows.map((item) => item.id));
      const sourceGroups = new Set(sourceRows.map((item) => item.discountGroup));
      assert.equal(value.rows.length, sourceRows.length);
      assert.equal(new Set(value.rows.map((item) => item.id)).size, value.rows.length, 'ids unique');
      value.rows.forEach((item) => {
        assert.ok(!sourceIds.has(item.id), 'source id reused');
        assert.ok(!sourceGroups.has(item.discountGroup), 'source group reused');
        assert.equal(item.promoSourceSurchargeId, '');
      });
      // Stacked rows of one source group share ONE new group; groups stay distinct.
      assert.equal(value.rows[0].discountGroup, value.rows[1].discountGroup);
      assert.notEqual(value.rows[0].discountGroup, value.rows[2].discountGroup);
      assert.notEqual(value.rows[2].discountGroup, value.rows[3].discountGroup);
      assert.deepEqual(value.groupKeys, ['new-group-1', 'new-group-2', 'new-group-3']);
      // Order, sequence and stacking survive.
      assert.deepEqual(
        value.rows.map((item) => [item.applySequence, item.calculationMethod, item.amount]),
        sourceRows.map((item) => [item.applySequence, item.calculationMethod, item.amount]),
      );
      // Surcharges are part of the setup and get a new identity too.
      assert.equal(value.rows[3].adjustmentKind, 'Surcharge');
      assert.deepEqual(sourceRows, before, 'source rows mutated');
    });
  }

  it('keeps the unit reference when pasting into the same variation', () => {
    const value = paste(clipboard(stackedSource()), target({ priceCode: 'W1' }));
    assert.equal(value.rows[2].unitOptionId, 'small-box');
  });

  it('preserves status, scheduling and gift-check settings', () => {
    const value = paste(
      clipboard([
        row({
          discountKind: 'Promo',
          status: 'Active',
          startsAt: FUTURE,
          endsAt: '2027-01-31T00:00:00.000Z',
          promoGiftCheckEnabled: true,
          promoGiftCheckId: 'gc-1',
          promoGiftCheckCode: 'GC100',
          promoGiftCheckName: 'Gift 100',
          promoGiftCheckQuantity: '2',
        }),
      ]),
      target(),
    );
    const pasted = value.rows[0];
    assert.equal(pasted.status, 'Active');
    assert.equal(pasted.startsAt, FUTURE);
    assert.equal(pasted.promoGiftCheckId, 'gc-1');
    assert.equal(pasted.promoGiftCheckQuantity, '2');
    assert.ok(value.issues.some((issue) => issue.level === 'warning' && /scheduled/.test(issue.message)));
  });
});

describe('getPasteBlockReason', () => {
  it('refuses a paste into another product', () => {
    const source = clipboard([row()], { productScope: 'product-b' });
    assert.match(getPasteBlockReason(source, target()), /different product/);
    const result = preparePastedRows(source, target(), {
      createId: idFactory('x'),
      createGroupId: idFactory('g'),
      differentItemResolutions: {},
      now: NOW,
    });
    assert.equal(result.ok, false);
  });

  it('refuses a target without that price-code row', () => {
    assert.match(getPasteBlockReason(clipboard([row()]), target({ hasPriceRow: false })), /no R2 price row/);
  });

  it('refuses the exact source context and an empty clipboard', () => {
    assert.match(getPasteBlockReason(clipboard([row()]), target({ priceCode: 'R1' })), /same variation/);
    assert.match(getPasteBlockReason(clipboard([]), target()), /no adjustments/);
    assert.match(getPasteBlockReason(null, target()), /Copy a setup/);
  });

  it('allows the same price code on a different variation', () => {
    assert.equal(getPasteBlockReason(clipboard([row()]), target({ variationId: 'large', priceCode: 'R1' })), '');
  });
});

describe('unit compatibility across variations', () => {
  it('matches an equivalent unit by code', () => {
    const value = paste(
      clipboard([row({ unitCondition: 'selected_unit', unitOptionId: 'small-box' })]),
      target({ variationId: 'large', priceCode: 'W2' }),
    );
    assert.equal(value.rows[0].unitOptionId, 'large-box');
    assert.equal(value.issues.filter((issue) => issue.level === 'blocking').length, 0);
  });

  it('clears a unit the target does not have and flags it', () => {
    const value = paste(
      clipboard([row({ unitCondition: 'selected_unit', unitOptionId: 'small-box' })]),
      target({ variationId: 'medium' }),
    );
    assert.equal(value.rows[0].unitOptionId, '');
    assert.ok(value.issues.some((issue) => issue.level === 'blocking' && /order unit/.test(issue.message)));
  });

  it('never guesses between two target units with the same code', () => {
    const value = paste(
      clipboard([row({ unitCondition: 'selected_unit', unitOptionId: 'small-box' })]),
      target({
        variationId: 'large',
        unitOptions: [
          { id: 'large-box-a', unitCode: 'box' },
          { id: 'large-box-b', unitCode: 'BOX' },
        ],
      }),
    );
    assert.equal(value.rows[0].unitOptionId, '');
  });
});

describe('promo reward compatibility', () => {
  it('remaps a same-item reward unit to the target variation', () => {
    const value = paste(
      clipboard([
        row({ hasPromo: true, promoRewardUnitOptionId: 'small-pc', promoRewardUnitCode: 'pc', promoRewardQuantity: '2' }),
      ]),
      target({ variationId: 'large' }),
    );
    assert.equal(value.rows[0].promoRewardUnitOptionId, 'large-pc');
    assert.equal(value.rows[0].promoRewardUnitCode, 'pc');
    assert.equal(value.rows[0].promoRewardQuantity, '2');
  });

  it('flags a same-item reward unit missing on the target', () => {
    const value = paste(
      clipboard([row({ hasPromo: true, promoRewardUnitOptionId: 'small-box', promoRewardUnitCode: 'box' })]),
      target({ variationId: 'medium' }),
    );
    assert.equal(value.rows[0].promoRewardUnitOptionId, '');
    assert.ok(value.issues.some((issue) => issue.level === 'blocking' && /reward unit/.test(issue.message)));
  });

  it('keeps a valid same-product reward variation', () => {
    const value = paste(
      clipboard([
        row({
          hasPromo: true,
          promoRewardTargetType: 'same_product_different_variant',
          promoRewardVariationId: 'large',
          promoRewardUnitOptionId: 'large-pc',
          promoRewardUnitCode: 'pc',
        }),
      ]),
      target({ variationId: 'small', priceCode: 'W1' }),
    );
    assert.equal(value.rows[0].promoRewardVariationId, 'large');
    assert.equal(value.rows[0].promoRewardUnitOptionId, 'large-pc');
  });

  it('clears a same-product reward that would point at the target itself', () => {
    const value = paste(
      clipboard([
        row({
          hasPromo: true,
          promoRewardTargetType: 'same_product_different_variant',
          promoRewardVariationId: 'large',
          promoRewardVariationLabel: 'Large',
          promoRewardUnitOptionId: 'large-pc',
          promoRewardUnitCode: 'pc',
        }),
      ]),
      target({ variationId: 'large' }),
    );
    assert.equal(value.rows[0].promoRewardVariationId, '');
    assert.equal(value.rows[0].promoRewardUnitOptionId, '');
    assert.ok(value.issues.some((issue) => issue.level === 'blocking' && /reward variation/.test(issue.message)));
  });

  const differentItem = row({
    hasPromo: true,
    promoRewardTargetType: 'different_item',
    promoRewardProductId: 'other-product',
    promoRewardProductLabel: 'Other',
    promoRewardVariationId: 'other-r1-row',
    promoRewardVariationLabel: 'Matte • R1 • Manila',
    promoRewardUnitOptionId: 'other-unit',
    promoRewardUnitCode: 'pc',
  });

  it('re-matches a different-product reward to the target price-code row', () => {
    const value = paste(clipboard([differentItem]), target({ priceCode: 'W1' }), {
      'other-r1-row': { status: 'remap', variationId: 'other-w1-row', unitOptionId: 'other-unit' },
    });
    const pasted = value.rows[0];
    assert.equal(pasted.promoRewardProductId, 'other-product');
    assert.equal(pasted.promoRewardVariationId, 'other-w1-row');
    assert.equal(pasted.promoRewardVariationLabel, '', 'stale R1 label cleared for reload');
    assert.equal(pasted.promoRewardUnitOptionId, 'other-unit');
    assert.ok(value.issues.some((issue) => issue.level === 'warning' && /re-matched/.test(issue.message)));
  });

  it('clears only the incompatible different-product reference', () => {
    const value = paste(clipboard([differentItem]), target({ priceCode: 'W1' }), {
      'other-r1-row': { status: 'clear', reason: 'No W1 row.' },
    });
    assert.equal(value.rows[0].promoRewardProductId, 'other-product');
    assert.equal(value.rows[0].promoRewardVariationId, '');
    assert.equal(value.rows[0].promoRewardUnitOptionId, '');
    assert.ok(value.issues.some((issue) => issue.level === 'blocking' && issue.message === 'No W1 row.'));
  });

  it('never keeps a different-product row of another price code without a resolution', () => {
    const value = paste(clipboard([differentItem]), target({ priceCode: 'W1' }));
    assert.equal(value.rows[0].promoRewardVariationId, '');
  });

  it('keeps a different-product reward when the price code is unchanged', () => {
    const value = paste(clipboard([differentItem]), target({ variationId: 'large', priceCode: 'R1' }));
    assert.equal(value.rows[0].promoRewardVariationId, 'other-r1-row');
    assert.equal(value.rows[0].promoRewardUnitOptionId, 'other-unit');
  });
});

describe('resolveDifferentItemReward', () => {
  const rows: RewardVariationRow[] = [
    { id: 'r1', productId: 'p', variationName: 'Matte', className: '', skuCode: 'M-1', priceCode: 'R1', variationGroupId: 'grp' },
    { id: 'w1', productId: 'p', variationName: 'Matte', className: '', skuCode: 'M-1', priceCode: 'W1', variationGroupId: 'grp' },
    { id: 'gloss-w1', productId: 'p', variationName: 'Gloss', className: '', skuCode: 'G-1', priceCode: 'W1', variationGroupId: 'grp2' },
    { id: 'legacy-r1', productId: 'p', variationName: 'Old', className: '', skuCode: 'O-1', priceCode: 'R1', variationGroupId: null },
    { id: 'legacy-r2', productId: 'p', variationName: 'old ', className: '', skuCode: 'o-1', priceCode: 'r2', variationGroupId: null },
  ];

  it('finds the same logical variation row by group id and keeps an owned unit', () => {
    assert.deepEqual(
      resolveDifferentItemReward({
        sourceVariationId: 'r1',
        sourceUnitOptionId: 'unit-1',
        unitOptionVariationId: 'r1',
        productRows: rows,
        targetPriceCode: 'W1',
      }),
      { status: 'remap', variationId: 'w1', unitOptionId: 'unit-1' },
    );
  });

  it('falls back to the name + SKU key for rows without a group id', () => {
    const result = resolveDifferentItemReward({
      sourceVariationId: 'legacy-r1',
      sourceUnitOptionId: 'unit-x',
      unitOptionVariationId: 'unrelated',
      productRows: rows,
      targetPriceCode: 'R2',
    });
    assert.deepEqual(result, { status: 'remap', variationId: 'legacy-r2', unitOptionId: '' });
  });

  it('clears when the target price code row is missing or the source is gone', () => {
    assert.equal(
      resolveDifferentItemReward({
        sourceVariationId: 'r1',
        sourceUnitOptionId: '',
        unitOptionVariationId: '',
        productRows: rows,
        targetPriceCode: 'CP',
      }).status,
      'clear',
    );
    assert.equal(
      resolveDifferentItemReward({
        sourceVariationId: 'missing',
        sourceUnitOptionId: '',
        unitOptionVariationId: '',
        productRows: rows,
        targetPriceCode: 'W1',
      }).status,
      'clear',
    );
  });
});

describe('getPastedRowIssues', () => {
  it('blocks a fixed discount above the target unit price', () => {
    const value = paste(clipboard([row({ discountType: 'Amount', amount: '250' })]), target());
    assert.ok(value.issues.some((issue) => issue.level === 'blocking' && /more than the R2 price/.test(issue.message)));
  });

  it('allows a fixed discount within the target price', () => {
    const value = paste(clipboard([row({ discountType: 'Amount', amount: '150' })]), target());
    assert.equal(value.issues.filter((issue) => issue.level === 'blocking').length, 0);
  });

  it('uses the selected unit price and the cascade inside a group', () => {
    const boxRule = row({ discountType: 'Amount', amount: '900', unitCondition: 'selected_unit', unitOptionId: 'small-box' });
    assert.equal(paste(clipboard([boxRule]), target()).issues.length, 0);
    const cascade = [
      row({ id: 'a', discountGroup: 'c', applySequence: '1', discountType: 'Percent', amount: '50' }),
      row({ id: 'b', discountGroup: 'c', applySequence: '2', discountType: 'Amount', amount: '150' }),
    ];
    // 200 -> 50% -> 100 remaining, so 150 fixed is too much.
    assert.ok(paste(clipboard(cascade), target()).issues.some((issue) => issue.level === 'blocking'));
  });

  it('warns instead of guessing when the target price is blank', () => {
    const value = paste(
      clipboard([row({ discountType: 'Amount', amount: '50' })]),
      target({ getUnitPrice: () => null }),
    );
    assert.ok(value.issues.some((issue) => issue.level === 'warning' && /could not be checked/.test(issue.message)));
    assert.equal(value.issues.filter((issue) => issue.level === 'blocking').length, 0);
  });

  it('warns on Active rules and blocks expired promos, but not Base end dates', () => {
    const active = paste(clipboard([row({ status: 'Active' })]), target());
    assert.ok(active.issues.some((issue) => issue.level === 'warning' && /apply immediately/.test(issue.message)));

    const expired = paste(clipboard([row({ discountKind: 'Promo', status: 'Active', endsAt: PAST })]), target());
    assert.ok(expired.issues.some((issue) => issue.level === 'blocking' && /in the past/.test(issue.message)));

    const base = paste(clipboard([row({ discountKind: 'Base', endsAt: PAST })]), target());
    assert.equal(base.issues.filter((issue) => issue.level === 'blocking').length, 0);
  });

  it('passes once the admin corrects the pasted value', () => {
    const value = paste(clipboard([row({ discountType: 'Amount', amount: '250' })]), target());
    const corrected = value.rows.map((item) => ({ ...item, amount: '100' }));
    assert.equal(getPastedRowIssues(corrected, target(), NOW).filter((issue) => issue.level === 'blocking').length, 0);
  });
});

describe('mergePastedRows', () => {
  const existing = [
    row({ id: 'existing-1', discountGroup: 'existing-g1', discountName: 'Existing', amount: '3' }),
    row({ id: 'existing-2', discountGroup: 'existing-g1', applySequence: '2', amount: '2' }),
  ];

  it('replaces an empty or populated target with the pasted rows', () => {
    const pasted = paste(clipboard([row()]), target()).rows;
    const intoEmpty = mergePastedRows([], pasted, 'replace');
    assert.ok(intoEmpty.ok);
    assert.deepEqual(intoEmpty.rows.map((item) => item.id), ['new-row-1']);
    const intoPopulated = mergePastedRows(existing, pasted, 'replace');
    assert.ok(intoPopulated.ok);
    assert.deepEqual(intoPopulated.rows.map((item) => item.id), ['new-row-1']);
  });

  it('appends grouped rules while keeping existing identities', () => {
    const pasted = paste(clipboard(stackedSource()), target()).rows;
    const merged = mergePastedRows(existing, pasted, 'append');
    assert.ok(merged.ok);
    assert.deepEqual(merged.rows.slice(0, 2).map((item) => [item.id, item.discountGroup]), [
      ['existing-1', 'existing-g1'],
      ['existing-2', 'existing-g1'],
    ]);
    assert.equal(merged.rows.length, 2 + pasted.length);
    assert.equal(merged.rows[2].discountGroup, merged.rows[3].discountGroup);
  });

  it('rejects appending an exact duplicate of an existing adjustment', () => {
    const pasted = paste(clipboard(existing.map((item) => ({ ...item }))), target()).rows;
    const merged = mergePastedRows(existing, pasted, 'append');
    assert.equal(merged.ok, false);
    assert.match(merged.ok ? '' : merged.error, /already exists/);
  });

  it('rejects appending rows that reuse an existing identity', () => {
    const merged = mergePastedRows(existing, [row({ id: 'existing-1', discountGroup: 'other' })], 'append');
    assert.equal(merged.ok, false);
  });
});

describe('module boundaries', () => {
  it('has no database access, so copy and paste cannot write anything', () => {
    const source = readFileSync(
      new URL('../src/components/products/addProducts/discountClipboard.ts', import.meta.url),
      'utf8',
    );
    assert.doesNotMatch(source, /supabase|from\s+['"][^'"]*lib\//);
  });
});
