import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getUnitOptionNaturalKey,
  parseUnitOptionUniqueViolation,
  planUnitOptionWrites,
  type ExistingUnitOptionRow,
  type UnitOptionWriteRow,
} from '../src/components/products/addProducts/unitOptionReconciliation.ts';
import { describeProductSaveError } from '../src/components/products/addProducts/saveErrorMessages.ts';

const R1 = 'var-r1';

function row(id: string, unitCode: string, quantity: number, extra: Record<string, unknown> = {}): UnitOptionWriteRow {
  return {
    id,
    variation_id: R1,
    unit_code: unitCode,
    quantity_in_base_unit: quantity,
    base_unit_code: 'pc',
    status: 'Active',
    is_orderable: true,
    sort_order: 0,
    weight_value: null,
    ...extra,
  };
}

// Database rows come back from PostgREST with numbers and nulls; keep the
// same shape (quantity as a number, missing optional text as null).
function dbRow(id: string, unitCode: string, quantity: number, extra: Record<string, unknown> = {}): ExistingUnitOptionRow {
  return { ...row(id, unitCode, quantity), ...extra };
}

let counter = 0;
const createId = () => `new-${++counter}`;

// Applies a plan the way the save does — one upsert statement checked row by
// row against UNIQUE(variation_id, unit_code, quantity_in_base_unit), then the
// removal step — and throws on any violation, like Postgres would.
function applyPlan(existing: ExistingUnitOptionRow[], plan: ReturnType<typeof planUnitOptionWrites>) {
  const table = new Map(existing.map((entry) => [entry.id, { ...entry }] as const));
  for (const write of plan.changedRows) {
    const key = getUnitOptionNaturalKey(write.variation_id, write.unit_code, write.quantity_in_base_unit);
    for (const [id, current] of table) {
      if (id !== write.id && getUnitOptionNaturalKey(current.variation_id, current.unit_code, current.quantity_in_base_unit) === key) {
        throw new Error(`duplicate key value violates unique constraint (${key})`);
      }
    }
    table.set(write.id, { ...write });
  }
  plan.removedIds.forEach((id) => table.delete(id));
  return table;
}

describe('planUnitOptionWrites', () => {
  it('editing an existing option keeps its id and writes only that row', () => {
    const existing = [dbRow('pc', 'pc', 1), dbRow('box', 'box', 6)];
    const plan = planUnitOptionWrites({
      submitted: [row('pc', 'pc', 1), row('box', 'box', 12)],
      existing,
      createId,
    });
    assert.deepEqual(plan.rows.map((entry) => entry.id), ['pc', 'box']);
    assert.deepEqual(plan.changedRows.map((entry) => entry.id), ['box']);
    assert.deepEqual(plan.removedIds, []);
    applyPlan(existing, plan);
  });

  it('skips unchanged rows entirely, tolerating numeric/null formatting differences', () => {
    const existing = [dbRow('pc', 'pc', 1, { weight_value: null, sort_order: 0 }), dbRow('box', 'box', 6, { notes: null })];
    const plan = planUnitOptionWrites({
      submitted: [row('pc', 'pc', 1, { weight_value: null, sort_order: '0' }), row('box', 'box', 6.0, { notes: null })],
      existing,
      createId,
    });
    assert.deepEqual(plan.changedRows, []);
    assert.deepEqual(plan.removedIds, []);
  });

  it('removed and re-added with the same unit and quantity reuses the original id (no insert, no collision)', () => {
    // Old save: upsert of new-row (box,6) collided with the still-present "box".
    const existing = [dbRow('pc', 'pc', 1), dbRow('box', 'box', 6, { weight_value: 2 })];
    const plan = planUnitOptionWrites({
      submitted: [row('pc', 'pc', 1), row('local-new', 'box', 6, { weight_value: 3 })],
      existing,
      createId,
    });
    assert.equal(plan.idBySourceId.get('local-new'), 'box');
    assert.deepEqual(plan.changedRows.map((entry) => entry.id), ['box']);
    assert.deepEqual(plan.removedIds, []);
    const table = applyPlan(existing, plan);
    assert.equal(table.get('box')?.weight_value, 3);
    assert.equal(table.size, 2);
  });

  it('removing one option and editing another into its unit+quantity does not collide', () => {
    // UI: remove "box ×6" (id B), then change "pack ×6" (id A) to "box ×6".
    const existing = [dbRow('A', 'pack', 6), dbRow('B', 'box', 6)];
    const plan = planUnitOptionWrites({ submitted: [row('A', 'box', 6)], existing, createId });
    assert.equal(plan.idBySourceId.get('A'), 'B', 'the surviving unit+quantity keeps its referenced id');
    assert.deepEqual(plan.removedIds, ['A']);
    const table = applyPlan(existing, plan);
    assert.deepEqual([...table.keys()], ['B']);
  });

  it('two rows exchanging unit+quantity write nothing because ids follow the key', () => {
    const existing = [dbRow('A', 'box', 6), dbRow('B', 'ctn', 24)];
    const plan = planUnitOptionWrites({
      submitted: [row('A', 'ctn', 24), row('B', 'box', 6)],
      existing,
      createId,
    });
    assert.equal(plan.idBySourceId.get('A'), 'B');
    assert.equal(plan.idBySourceId.get('B'), 'A');
    assert.deepEqual(plan.changedRows, []);
    applyPlan(existing, plan);
  });

  it('an edited row whose id was taken by a key match moves to a fresh id', () => {
    // A was pack×6 and is edited to box×12; a new row re-adds pack×6.
    const existing = [dbRow('A', 'pack', 6)];
    const plan = planUnitOptionWrites({
      submitted: [row('A', 'box', 12), row('local-new', 'pack', 6)],
      existing,
      createId: () => 'fresh-1',
    });
    assert.equal(plan.idBySourceId.get('local-new'), 'A');
    assert.equal(plan.idBySourceId.get('A'), 'fresh-1');
    assert.deepEqual(plan.removedIds, []);
    applyPlan(existing, plan);
  });

  it('reports a genuine duplicate in the submission and plans no writes', () => {
    const plan = planUnitOptionWrites({
      submitted: [row('x', 'box', 6), row('y', 'BOX ', 6)],
      existing: [],
      createId,
    });
    assert.deepEqual(plan.duplicates, [{ variationId: R1, unitCode: 'box', quantityInBaseUnit: 6, sourceIds: ['x', 'y'] }]);
    assert.deepEqual(plan.changedRows, []);
    assert.deepEqual(plan.removedIds, []);
  });

  it('re-adding a retired option referenced by orders reactivates the same id', () => {
    const existing = [dbRow('ordered', 'box', 6, { status: 'Inactive', is_orderable: false })];
    const plan = planUnitOptionWrites({ submitted: [row('local-new', 'box', 6)], existing, createId });
    assert.equal(plan.idBySourceId.get('local-new'), 'ordered');
    assert.equal(plan.changedRows[0].status, 'Active');
    assert.deepEqual(plan.removedIds, []);
  });

  it('maps every submitted id so discount/surcharge references can be remapped', () => {
    const existing = [dbRow('pc', 'pc', 1), dbRow('box', 'box', 6)];
    const plan = planUnitOptionWrites({
      submitted: [row('pc', 'pc', 1), row('local-box', 'box', 6), row('local-ctn', 'ctn', 24)],
      existing,
      createId,
    });
    assert.deepEqual(Object.fromEntries(plan.idBySourceId), { pc: 'pc', 'local-box': 'box', 'local-ctn': 'local-ctn' });
    // A discount class pointing at the editor id 'local-box' resolves to the
    // persisted, order-referenced id 'box'.
    assert.equal(plan.idBySourceId.get('local-box'), 'box');
  });

  it('never produces a unique violation across mixed edit/remove/re-add scenarios', () => {
    const existing = [dbRow('pc', 'pc', 1), dbRow('box', 'box', 6), dbRow('ctn', 'ctn', 24), dbRow('pack', 'pack', 3)];
    const scenarios: UnitOptionWriteRow[][] = [
      [row('pc', 'pc', 1), row('box', 'ctn', 24), row('n1', 'box', 6)],
      [row('pc', 'pc', 1), row('ctn', 'box', 6), row('box', 'ctn', 24)],
      [row('pack', 'pc', 1), row('n2', 'pack', 3)],
      [row('n3', 'pc', 1), row('n4', 'box', 6), row('n5', 'ctn', 24), row('n6', 'pack', 3)],
      [row('box', 'box', 10), row('ctn', 'box', 6)].slice(0, 1),
    ];
    scenarios.forEach((submitted) => {
      const plan = planUnitOptionWrites({ submitted, existing, createId });
      assert.deepEqual(plan.duplicates, []);
      assert.doesNotThrow(() => applyPlan(existing, plan));
    });
  });
});

describe('unit option error parsing and friendly save errors', () => {
  it('parses the 23505 detail of the unit option constraint', () => {
    assert.deepEqual(
      parseUnitOptionUniqueViolation({
        code: '23505',
        message: 'duplicate key value violates unique constraint "product_variation_unit_option_variation_id_unit_code_quanti_key"',
        details: 'Key (variation_id, unit_code, quantity_in_base_unit)=(5f0238e8-244f-4b24-8683-5c3d3cdab1b3, Box, 6) already exists.',
      }),
      { variationId: '5f0238e8-244f-4b24-8683-5c3d3cdab1b3', unitCode: 'box', quantityInBaseUnit: 6 },
    );
    assert.equal(parseUnitOptionUniqueViolation({ code: '23503', message: 'fk' }), null);
  });

  it('replaces raw PostgreSQL messages and keeps friendly ones', () => {
    const raw = new Error(
      'duplicate key value violates unique constraint "product_variation_unit_option_variation_id_unit_code_quanti_key"',
    );
    const friendly = describeProductSaveError(raw);
    assert.doesNotMatch(friendly, /duplicate key value/);
    assert.match(friendly, /unit option with the same unit and quantity/);
    assert.match(describeProductSaveError(new Error('update or delete on table "x" violates foreign key constraint "y"')), /link to another record/);
    assert.equal(describeProductSaveError(new Error('Variation Name is required.')), 'Variation Name is required.');
  });
});
