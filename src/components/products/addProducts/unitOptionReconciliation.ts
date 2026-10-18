// Identity-preserving write plan for product_variation_unit_options.
//
// The table is unique on (variation_id, unit_code, quantity_in_base_unit) and
// that constraint is checked row by row inside one upsert statement. The old
// save upserted by id first and deleted removed rows afterwards, so removing a
// row and then adding (or editing another row into) the same unit + quantity
// collided with the row that was about to be deleted.
//
// Here row ids follow the natural key: a submitted row whose
// (variation, unit, quantity) already exists in the database reuses that
// row's id. Every remaining row either keeps its own key or moves to a key no
// database row holds, so the upsert cannot collide, and ids referenced by
// order_items / discount / surcharge classes are kept wherever a unit +
// quantity survives. Pure; tested in tests/unitOptionReconciliation.test.ts.

export type UnitOptionWriteRow = {
  id: string;
  variation_id: string;
  unit_code: string;
  quantity_in_base_unit: number;
  [column: string]: unknown;
};

export type ExistingUnitOptionRow = {
  id: string;
  variation_id: string;
  unit_code: string;
  quantity_in_base_unit: unknown;
  [column: string]: unknown;
};

export type UnitOptionDuplicate = {
  variationId: string;
  unitCode: string;
  quantityInBaseUnit: number;
  sourceIds: string[];
};

export type UnitOptionWritePlan = {
  // Every submitted row with its final id, in submission order.
  rows: UnitOptionWriteRow[];
  // Rows that are new or differ from the database; the only rows to upsert.
  changedRows: UnitOptionWriteRow[];
  // Submitted (editor) id -> persisted id, for every submitted row.
  idBySourceId: Map<string, string>;
  // Database rows of the submitted variations that no submitted row kept.
  removedIds: string[];
  // Submitted rows sharing one natural key: a genuine conflict, nothing to write.
  duplicates: UnitOptionDuplicate[];
};

export function getUnitOptionNaturalKey(variationId: unknown, unitCode: unknown, quantityInBaseUnit: unknown) {
  return [
    String(variationId ?? '').trim(),
    String(unitCode ?? '').trim().toLowerCase(),
    String(Number(quantityInBaseUnit)),
  ].join('|');
}

function normalizeComparable(value: unknown) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const text = String(value).trim();
  if (text !== '' && Number.isFinite(Number(text))) return String(Number(text));
  return text;
}

function rowMatchesExisting(row: UnitOptionWriteRow, existing: ExistingUnitOptionRow) {
  return Object.keys(row).every(
    (column) => column === 'id' || normalizeComparable(row[column]) === normalizeComparable(existing[column]),
  );
}

export function planUnitOptionWrites(input: {
  submitted: UnitOptionWriteRow[];
  // Current database rows for every variation_id in `submitted`.
  existing: ExistingUnitOptionRow[];
  createId: () => string;
}): UnitOptionWritePlan {
  const keyOf = (row: { variation_id: unknown; unit_code: unknown; quantity_in_base_unit: unknown }) =>
    getUnitOptionNaturalKey(row.variation_id, row.unit_code, row.quantity_in_base_unit);

  const submittedByKey = new Map<string, UnitOptionWriteRow[]>();
  input.submitted.forEach((row) => {
    submittedByKey.set(keyOf(row), [...(submittedByKey.get(keyOf(row)) ?? []), row]);
  });
  const duplicates = Array.from(submittedByKey.values())
    .filter((rows) => rows.length > 1)
    .map((rows) => ({
      variationId: rows[0].variation_id,
      unitCode: String(rows[0].unit_code ?? '').trim().toLowerCase(),
      quantityInBaseUnit: Number(rows[0].quantity_in_base_unit),
      sourceIds: rows.map((row) => row.id),
    }));
  if (duplicates.length > 0) {
    return { rows: [], changedRows: [], idBySourceId: new Map(), removedIds: [], duplicates };
  }

  const existingById = new Map(input.existing.map((row) => [String(row.id), row] as const));
  const existingByKey = new Map(input.existing.map((row) => [keyOf(row), row] as const));
  const finalIdByIndex = new Map<number, string>();
  const usedIds = new Set<string>();

  // Pass 1: a unit + quantity that already exists keeps that row's id.
  input.submitted.forEach((row, index) => {
    const existing = existingByKey.get(keyOf(row));
    if (existing) {
      finalIdByIndex.set(index, String(existing.id));
      usedIds.add(String(existing.id));
    }
  });
  // Pass 2: otherwise keep the submitted id, unless pass 1 gave it away.
  input.submitted.forEach((row, index) => {
    if (finalIdByIndex.has(index)) return;
    let finalId = row.id;
    while (!finalId || usedIds.has(finalId)) {
      finalId = input.createId();
    }
    finalIdByIndex.set(index, finalId);
    usedIds.add(finalId);
  });

  const rows = input.submitted.map((row, index) => ({ ...row, id: finalIdByIndex.get(index) as string }));
  const changedRows = rows.filter((row) => {
    const existing = existingById.get(row.id);
    return !existing || !rowMatchesExisting(row, existing);
  });
  const idBySourceId = new Map(input.submitted.map((row, index) => [row.id, rows[index].id] as const));
  const removedIds = input.existing.map((row) => String(row.id)).filter((id) => !usedIds.has(id));

  return { rows, changedRows, idBySourceId, removedIds, duplicates: [] };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Resolves an editor reference to one of this product's unit options (a
// same-item / same-product reward unit) to the id to persist. Never returns an
// id the admin removed in this save: such a reference resolves to null so the
// caller can ask for a new selection instead of keeping (and thereby blocking
// the cleanup of) a unit the admin removed, or writing a dangling id.
export function resolveOwnUnitOptionReference(
  editorId: string,
  persistedIdByEditorId: Map<string, string>,
  removedUnitOptionIds: Set<string>,
): string | null {
  const id = String(editorId ?? '').trim();
  if (!id) return null;
  const persisted = persistedIdByEditorId.get(id);
  if (persisted) return persisted;
  return UUID_PATTERN.test(id) && !removedUnitOptionIds.has(id) ? id : null;
}

export type UnitOptionConflict = {
  variationId: string;
  unitCode: string;
  quantityInBaseUnit: number;
  // Editor ids of the conflicting rows (first = the one to highlight).
  optionIds: string[];
  // Editor card key of the variation, when known.
  cardKey: string | null;
};

export class UnitOptionConflictError extends Error {
  conflicts: UnitOptionConflict[];

  constructor(conflicts: UnitOptionConflict[], variationLabel = 'this variation') {
    const first = conflicts[0];
    super(
      first
        ? `Unit option ${first.unitCode.toUpperCase()} × ${first.quantityInBaseUnit} is listed more than once for ${variationLabel}. ` +
            'Saving is blocked because each variation can only have one option per unit and quantity. ' +
            'Remove or change one of the duplicate rows.'
        : 'Duplicate unit option.',
    );
    this.name = 'UnitOptionConflictError';
    this.conflicts = conflicts;
  }
}

// Parses PostgREST's 23505 detail for this table's natural-key constraint,
// e.g. `Key (variation_id, unit_code, quantity_in_base_unit)=(<uuid>, box, 6) already exists.`
export function parseUnitOptionUniqueViolation(error: {
  code?: string;
  details?: string | null;
  message?: string;
} | null) {
  if (!error || error.code !== '23505') return null;
  const text = `${error.details ?? ''} ${error.message ?? ''}`;
  if (!/unit_code/.test(text)) return null;
  const match = text.match(/Key \(variation_id, unit_code, quantity_in_base_unit\)=\(([^,]+), ([^,]+), ([^)]+)\)/);
  if (!match) return { variationId: '', unitCode: '', quantityInBaseUnit: Number.NaN };
  return {
    variationId: match[1].trim(),
    unitCode: match[2].trim().toLowerCase(),
    quantityInBaseUnit: Number(match[3].trim()),
  };
}
