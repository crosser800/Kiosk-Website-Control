// Client side of removed unit option / variation cleanup (referenceCleanup.ts)
// together with planUnitOptionWrites. The database side (the drafted RPCs) is
// emulated here by a small in-memory model of the ON DELETE SET NULL /
// CASCADE foreign keys; the SQL itself is validated separately.
import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setSupabaseFake } from './support/supabaseStub.ts';
import { createFakePostgrest, type Row } from './support/fakePostgrest.ts';
import {
  cleanupRemovedUnitOptions,
  cleanupRemovedVariations,
} from '../src/components/products/addProducts/referenceCleanup.ts';
import {
  planUnitOptionWrites,
  resolveOwnUnitOptionReference,
  type UnitOptionWriteRow,
} from '../src/components/products/addProducts/unitOptionReconciliation.ts';

const PRODUCT = 'product-1';
const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// The seven FK relationships into product_variation_unit_options (all
// ON DELETE SET NULL) plus a variation-level reference.
type RefKind =
  | 'order_items'
  | 'cart_items'
  | 'inventory_movements'
  | 'product_discount_classes'
  | 'product_surcharge_classes'
  | 'product_surcharge_classes_reward'
  | 'product_surcharges_reward';
type Ref = { kind: RefKind | 'order_items.variation_id'; unitOptionId: string | null; variationId?: string | null };

function createDatabase(input: { variations: Row[]; unitOptions: Row[]; refs: Ref[] }) {
  const tables: Record<string, Row[]> = {
    product_variations: input.variations.map((row) => ({ ...row })),
    product_variation_unit_options: input.unitOptions.map((row) => ({ ...row })),
  };
  const refs = input.refs.map((ref) => ({ ...ref }));
  const deleteUnitOption = (id: string) => {
    tables.product_variation_unit_options = tables.product_variation_unit_options.filter((row) => row.id !== id);
    refs.forEach((ref) => {
      if (ref.unitOptionId === id) ref.unitOptionId = null; // ON DELETE SET NULL
    });
  };
  const unitReferenceCount = (id: string) => refs.filter((ref) => ref.unitOptionId === id).length;

  // Emulates the drafted RPCs: count every reference, delete only
  // unreferenced rows, retire the rest.
  const rpc = (fn: string, args: Record<string, unknown>) => {
    if (fn === 'cleanup_removed_unit_options') {
      const ids = args.p_unit_option_ids as string[];
      const rows = ids
        .filter((id) => tables.product_variation_unit_options.some((row) => row.id === id))
        .map((id) => {
          const count = unitReferenceCount(id);
          if (count === 0) {
            deleteUnitOption(id);
            return { unit_option_id: id, action: 'deleted', reference_counts: {} };
          }
          const row = tables.product_variation_unit_options.find((entry) => entry.id === id) as Row;
          Object.assign(row, { status: 'Inactive', is_orderable: false });
          return { unit_option_id: id, action: 'retired', reference_counts: { total: count } };
        });
      return { data: rows, error: null };
    }
    if (fn === 'cleanup_removed_variations') {
      const ids = args.p_variation_ids as string[];
      const rows = ids.map((variationId) => {
        const unitIds = tables.product_variation_unit_options
          .filter((row) => row.variation_id === variationId)
          .map((row) => String(row.id));
        const count =
          unitIds.reduce((total, id) => total + unitReferenceCount(id), 0) +
          refs.filter((ref) => ref.variationId === variationId).length;
        if (count === 0) {
          unitIds.forEach(deleteUnitOption); // ON DELETE CASCADE
          tables.product_variations = tables.product_variations.filter((row) => row.id !== variationId);
          return { variation_id: variationId, action: 'deleted', reference_counts: {} };
        }
        const row = tables.product_variations.find((entry) => entry.id === variationId) as Row;
        row.availability = 'Unavailable';
        return { variation_id: variationId, action: 'retired', reference_counts: { total: count } };
      });
      return { data: rows, error: null };
    }
    return { data: null, error: { code: 'PGRST202', message: 'not found' } };
  };

  return { tables, refs, rpc, nulledRefs: () => refs.filter((ref) => ref.unitOptionId === null && ref.kind !== 'order_items.variation_id') };
}

function unitRow(id: string, variationId: string, unitCode: string, quantity: number): Row {
  return { id, variation_id: variationId, unit_code: unitCode, quantity_in_base_unit: quantity, status: 'Active', is_orderable: true };
}

function install(database: ReturnType<typeof createDatabase>, withServer: boolean) {
  const fake = createFakePostgrest({ maxRows: 1000, tables: database.tables, rpc: withServer ? database.rpc : undefined });
  setSupabaseFake(fake);
  return fake;
}

const R1 = UUID(100);
const REF_KINDS: RefKind[] = [
  'product_discount_classes',
  'product_surcharge_classes',
  'cart_items',
  'inventory_movements',
  'order_items',
  'product_surcharges_reward',
  'product_surcharge_classes_reward',
];

describe('cleanupRemovedUnitOptions with the server-side reference check', () => {
  afterEach(() => setSupabaseFake(null));

  for (const kind of REF_KINDS) {
    it(`retires (never deletes) a unit option referenced only by ${kind}`, async () => {
      const database = createDatabase({
        variations: [{ id: R1, product_id: PRODUCT }],
        unitOptions: [unitRow(UUID(1), R1, 'box', 12)],
        refs: [{ kind, unitOptionId: UUID(1) }],
      });
      const fake = install(database, true);
      const outcome = await cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]);

      assert.equal(outcome.mode, 'server');
      assert.deepEqual(outcome.retiredIds, [UUID(1)]);
      assert.deepEqual(outcome.deletedIds, []);
      assert.equal(database.tables.product_variation_unit_options[0].status, 'Inactive');
      assert.deepEqual(database.nulledRefs(), [], 'no reference was set to NULL');
      assert.ok(fake.queries.every((query) => query.mutation?.kind !== 'delete'), 'client never deletes directly');
    });
  }

  it("retires a unit option used as another product's promo reward", async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'box', 12)],
      refs: [{ kind: 'product_surcharges_reward', unitOptionId: UUID(1) }],
    });
    install(database, true);
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]);
    assert.deepEqual(outcome.retiredIds, [UUID(1)]);
    assert.deepEqual(database.nulledRefs(), []);
  });

  it('deletes a unit option with no references', async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'box', 12)],
      refs: [],
    });
    const fake = install(database, true);
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]);
    assert.deepEqual(outcome.deletedIds, [UUID(1)]);
    assert.equal(database.tables.product_variation_unit_options.length, 0);
    assert.deepEqual(fake.rpcCalls, [
      { fn: 'cleanup_removed_unit_options', args: { p_product_id: PRODUCT, p_unit_option_ids: [UUID(1)] } },
    ]);
  });

  it('makes no call at all when nothing was removed', async () => {
    const database = createDatabase({ variations: [], unitOptions: [], refs: [] });
    const fake = install(database, true);
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, []);
    assert.deepEqual(outcome, { mode: 'server', deletedIds: [], retiredIds: [], referencesById: {}, serverError: null });
    assert.deepEqual(fake.rpcCalls, []);
    assert.deepEqual(fake.queries, []);
  });
});

describe('fail closed when the server-side reference check is unavailable', () => {
  afterEach(() => setSupabaseFake(null));

  it('retires every removed unit option, even unreferenced ones, and deletes nothing', async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'box', 12), unitRow(UUID(2), R1, 'ctn', 24)],
      refs: [{ kind: 'cart_items', unitOptionId: UUID(1) }],
    });
    const fake = install(database, false); // RPC not deployed -> PGRST202
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, [UUID(1), UUID(2)]);

    assert.equal(outcome.mode, 'fail_closed');
    assert.match(outcome.serverError ?? '', /Could not find the function/);
    assert.deepEqual(outcome.retiredIds, [UUID(1), UUID(2)]);
    assert.deepEqual(outcome.deletedIds, []);
    assert.equal(database.tables.product_variation_unit_options.length, 2);
    assert.ok(database.tables.product_variation_unit_options.every((row) => row.status === 'Inactive' && row.is_orderable === false));
    assert.ok(fake.queries.every((query) => query.mutation?.kind !== 'delete'));
    assert.deepEqual(database.nulledRefs(), []);
  });

  it('treats an RPC error (e.g. authorization or lock timeout) the same way', async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'box', 12)],
      refs: [],
    });
    const fake = createFakePostgrest({
      maxRows: 1000,
      tables: database.tables,
      rpc: () => ({ data: null, error: { code: '55P03', message: 'canceling statement due to lock timeout' } }),
    });
    setSupabaseFake(fake);
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]);
    assert.equal(outcome.mode, 'fail_closed');
    assert.equal(database.tables.product_variation_unit_options.length, 1);
  });

  it('does not trust a malformed RPC response', async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'box', 12)],
      refs: [],
    });
    setSupabaseFake(
      createFakePostgrest({
        maxRows: 1000,
        tables: database.tables,
        rpc: () => ({ data: [{ unit_option_id: UUID(1), action: 'purged' }], error: null }),
      }),
    );
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]);
    assert.equal(outcome.mode, 'fail_closed');
    assert.equal(database.tables.product_variation_unit_options[0].status, 'Inactive');
  });

  it('reports a retirement that silently matched no rows as a failure, not success', async () => {
    // e.g. a row-level policy that filters the UPDATE: no error, zero rows.
    const database = createDatabase({ variations: [], unitOptions: [], refs: [] });
    install(database, false);
    await assert.rejects(
      () => cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]),
      /1 removed unit option\(s\) could not be set to Inactive and may still be active\. Nothing was deleted/,
    );
    await assert.rejects(
      () => cleanupRemovedVariations(PRODUCT, [UUID(200)]),
      /1 removed variation row\(s\) could not be set to Unavailable/,
    );
  });

  it('surfaces a failed retirement as a save error', async () => {
    setSupabaseFake(
      createFakePostgrest({
        maxRows: 1000,
        tables: { product_variation_unit_options: [] },
        failOn: { table: 'product_variation_unit_options', requestIndex: 0, message: 'network down' },
      }),
    );
    await assert.rejects(() => cleanupRemovedUnitOptions(PRODUCT, [UUID(1)]), /network down/);
  });
});

describe('cleanupRemovedVariations (cascade protection)', () => {
  afterEach(() => setSupabaseFake(null));
  const V2 = UUID(200);
  const V3 = UUID(300);

  it('retires a variation whose unit options are referenced, keeping them; deletes an unreferenced one', async () => {
    const database = createDatabase({
      variations: [
        { id: V2, product_id: PRODUCT, availability: 'Available' },
        { id: V3, product_id: PRODUCT, availability: 'Available' },
      ],
      unitOptions: [unitRow(UUID(21), V2, 'pc', 1), unitRow(UUID(31), V3, 'pc', 1)],
      refs: [{ kind: 'inventory_movements', unitOptionId: UUID(21) }],
    });
    install(database, true);
    const outcome = await cleanupRemovedVariations(PRODUCT, [V2, V3]);

    assert.deepEqual(outcome.retiredIds, [V2]);
    assert.deepEqual(outcome.deletedIds, [V3]);
    assert.equal(database.tables.product_variations.find((row) => row.id === V2)?.availability, 'Unavailable');
    assert.ok(database.tables.product_variation_unit_options.some((row) => row.id === UUID(21)), 'referenced unit option kept');
    assert.ok(!database.tables.product_variation_unit_options.some((row) => row.id === UUID(31)), 'unreferenced one cascaded');
    assert.deepEqual(database.nulledRefs(), []);
  });

  it('retires a variation referenced by an order line even when its unit options are free', async () => {
    const database = createDatabase({
      variations: [{ id: V2, product_id: PRODUCT, availability: 'Available' }],
      unitOptions: [unitRow(UUID(21), V2, 'pc', 1)],
      refs: [{ kind: 'order_items.variation_id', unitOptionId: null, variationId: V2 }],
    });
    install(database, true);
    const outcome = await cleanupRemovedVariations(PRODUCT, [V2]);
    assert.deepEqual(outcome.retiredIds, [V2]);
    assert.equal(database.tables.product_variation_unit_options.length, 1);
  });

  it('fails closed: retires every removed variation without the RPC', async () => {
    const database = createDatabase({
      variations: [{ id: V3, product_id: PRODUCT, availability: 'Available' }],
      unitOptions: [unitRow(UUID(31), V3, 'pc', 1)],
      refs: [],
    });
    const fake = install(database, false);
    const outcome = await cleanupRemovedVariations(PRODUCT, [V3]);
    assert.equal(outcome.mode, 'fail_closed');
    assert.deepEqual(outcome.retiredIds, [V3]);
    assert.equal(database.tables.product_variations[0].availability, 'Unavailable');
    assert.equal(database.tables.product_variation_unit_options.length, 1);
    assert.ok(fake.queries.every((query) => query.mutation?.kind !== 'delete'));
  });
});

describe('save sequences: plan -> write -> cleanup', () => {
  afterEach(() => setSupabaseFake(null));

  function submitted(id: string, unitCode: string, quantity: number): UnitOptionWriteRow {
    return { id, variation_id: R1, unit_code: unitCode, quantity_in_base_unit: quantity, status: 'Active', is_orderable: true };
  }

  it('a failure before cleanup removes nothing; the retry plans the same removal and cleans up safely', async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'pc', 1), unitRow(UUID(2), R1, 'box', 12)],
      refs: [{ kind: 'product_discount_classes', unitOptionId: UUID(2) }],
    });
    install(database, true);
    const editorRows = [submitted(UUID(1), 'pc', 1)]; // admin removed "box x12"

    // Attempt 1: plan + upsert happen, then a later step (e.g. a discount
    // resolver error) throws before cleanup is reached.
    const firstPlan = planUnitOptionWrites({
      submitted: editorRows,
      existing: database.tables.product_variation_unit_options as never,
      createId: () => UUID(900),
    });
    assert.deepEqual(firstPlan.removedIds, [UUID(2)]);
    assert.equal(database.tables.product_variation_unit_options.length, 2, 'removed row still present after the failure');
    assert.deepEqual(database.nulledRefs(), [], 'discount still linked after the failure');

    // Attempt 2 (retry): same plan, then cleanup runs.
    const retryPlan = planUnitOptionWrites({
      submitted: editorRows,
      existing: database.tables.product_variation_unit_options as never,
      createId: () => UUID(901),
    });
    assert.deepEqual(retryPlan.removedIds, firstPlan.removedIds);
    assert.deepEqual(retryPlan.changedRows, [], 'unchanged rows are not rewritten on retry');
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, retryPlan.removedIds);
    assert.deepEqual(outcome.retiredIds, [UUID(2)], 'still referenced by the discount -> retired');
    assert.deepEqual(database.nulledRefs(), []);
  });

  it('base unit change: package rows that are referenced are retired, free ones deleted', async () => {
    const database = createDatabase({
      variations: [{ id: R1, product_id: PRODUCT }],
      unitOptions: [unitRow(UUID(1), R1, 'pc', 1), unitRow(UUID(2), R1, 'box', 12), unitRow(UUID(3), R1, 'ctn', 48)],
      refs: [{ kind: 'order_items', unitOptionId: UUID(3) }],
    });
    install(database, true);
    // Base unit pc -> pack keeps the base row (same id) as "pack x1" only.
    const plan = planUnitOptionWrites({
      submitted: [submitted(UUID(1), 'pack', 1)],
      existing: database.tables.product_variation_unit_options as never,
      createId: () => UUID(902),
    });
    assert.deepEqual(plan.removedIds.sort(), [UUID(2), UUID(3)]);
    const outcome = await cleanupRemovedUnitOptions(PRODUCT, plan.removedIds);
    assert.deepEqual(outcome.deletedIds, [UUID(2)]);
    assert.deepEqual(outcome.retiredIds, [UUID(3)]);
    assert.deepEqual(database.nulledRefs(), []);
  });

  it('never produces duplicate unit option ids or extra rows', async () => {
    const existing = [unitRow(UUID(1), R1, 'pc', 1), unitRow(UUID(2), R1, 'box', 12), unitRow(UUID(3), R1, 'ctn', 48)];
    const plan = planUnitOptionWrites({
      submitted: [submitted(UUID(1), 'pc', 1), submitted(UUID(3), 'box', 12), submitted('local', 'ctn', 48), submitted('local-2', 'bag', 5)],
      existing: existing as never,
      createId: () => UUID(903),
    });
    const ids = plan.rows.map((row) => row.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids.length, 4);
    assert.deepEqual(plan.removedIds, []);
  });
});

describe('resolveOwnUnitOptionReference (same-item / same-product reward unit)', () => {
  const removed = new Set([UUID(2)]);
  const persisted = new Map([['local-box', UUID(5)]]);

  it('returns null for a unit the admin removed, so no removed/dangling id is written', () => {
    assert.equal(resolveOwnUnitOptionReference(UUID(2), new Map(), removed), null);
  });
  it('maps an editor id to its persisted id', () => {
    assert.equal(resolveOwnUnitOptionReference('local-box', persisted, removed), UUID(5));
  });
  it('keeps an existing id that was not removed and drops non-UUID leftovers', () => {
    assert.equal(resolveOwnUnitOptionReference(UUID(7), new Map(), removed), UUID(7));
    assert.equal(resolveOwnUnitOptionReference('unit-123', new Map(), removed), null);
    assert.equal(resolveOwnUnitOptionReference('', new Map(), removed), null);
  });
});
