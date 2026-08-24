import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import SettingsFormModal from './SettingsFormModal';
import SupabaseSettingsSection from './SupabaseSettingsSection';
import sectionStyles from './SupabaseSettingsSection.module.css';
import SettingsAccordionItem from './SettingsAccordionItem';
import useSupabaseSettingsSection from './useSupabaseSettingsSection';
import {
  STATUS_OPTIONS,
  matchesSearch,
  normalizeStatus,
  sortOrderBadge,
  statusBadge,
  toNumber,
  type SettingPanel,
  type StatusValue,
} from './settingsShared';

type UnitRecord = {
  id: string;
  unit_code: string;
  unit_name: string;
  plural_name: string;
  unit_type: UnitType;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type UnitForm = {
  unit_code: string;
  unit_name: string;
  plural_name: string;
  unit_type: UnitType;
  description: string;
  status: StatusValue;
  sort_order: string;
};

type UnitType = 'count' | 'weight' | 'length' | 'package' | 'set' | 'other';

type UnitImpact = {
  id: string;
  variationId: string;
  unitCode: string;
  unitLabel: string;
  baseUnitCode: string;
  quantityInBaseUnit: string;
  productName: string;
  productSku: string;
  variationName: string;
  variationSku: string;
  relation: 'Order unit' | 'Base unit' | 'Order and base unit';
};

type DeleteState = {
  unit: UnitRecord;
  impacts: UnitImpact[];
};

type EditImpactState = {
  unit: UnitRecord;
  nextCode: string;
  nextLabel: string;
  impacts: UnitImpact[];
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

const UNIT_TYPE_OPTIONS: Array<{ label: string; value: UnitType }> = [
  { label: 'Count', value: 'count' },
  { label: 'Weight', value: 'weight' },
  { label: 'Length', value: 'length' },
  { label: 'Package', value: 'package' },
  { label: 'Set', value: 'set' },
  { label: 'Other', value: 'other' },
];

function normalizeUnitCode(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-');
}

function normalizeUnitName(value: string, fallbackCode: string) {
  return (value.trim() || fallbackCode).toLowerCase();
}

function normalizeUnitType(value: unknown): UnitType {
  return UNIT_TYPE_OPTIONS.some((option) => option.value === value) ? (value as UnitType) : 'count';
}

function getRowString(row: Record<string, unknown>, key: string) {
  const value = row[key];
  return value === null || value === undefined ? '' : String(value);
}

export default function UnitsSettingsSection({ activePanel, onToggle }: Props) {
  const [confirmedEdit, setConfirmedEdit] = useState<EditImpactState | null>(null);
  const [editError, setEditError] = useState('');

  const units = useSupabaseSettingsSection<UnitRecord, UnitForm>({
    table: 'product_units',
    selectQuery: 'id, unit_code, unit_name, plural_name, unit_type, description, status, sort_order, created_at, updated_at',
    emptyForm: {
      unit_code: '',
      unit_name: '',
      plural_name: '',
      unit_type: 'count',
      description: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      unit_code: getRowString(row, 'unit_code').toLowerCase(),
      unit_name: getRowString(row, 'unit_name').toLowerCase() || getRowString(row, 'unit_code').toLowerCase(),
      plural_name: getRowString(row, 'plural_name').toLowerCase(),
      unit_type: normalizeUnitType(row.unit_type),
      description: getRowString(row, 'description'),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      unit_code: record.unit_code,
      unit_name: record.unit_name,
      plural_name: record.plural_name,
      unit_type: record.unit_type,
      description: record.description,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => {
      const code = normalizeUnitCode(form.unit_code);
      return {
        unit_code: code,
        unit_name: normalizeUnitName(form.unit_name, code),
        plural_name: form.plural_name.trim().toLowerCase() || null,
        unit_type: form.unit_type,
        description: form.description.trim() || null,
        status: form.status,
        sort_order: toNumber(form.sort_order),
      };
    },
    validate: (form, items, editingId) => {
      const code = normalizeUnitCode(form.unit_code);

      if (!code) {
        return 'Unit code is required.';
      }

      const duplicate = items.some((item) => item.id !== editingId && item.unit_code.toLowerCase() === code);
      return duplicate ? 'Unit code already exists.' : null;
    },
    preparePayload: async ({ editingId, form, items }) => {
      if (!editingId) {
        return;
      }

      const currentUnit = items.find((item) => item.id === editingId);
      const nextCode = normalizeUnitCode(form.unit_code);
      const nextLabel = normalizeUnitName(form.unit_name, nextCode);

      if (!currentUnit || currentUnit.unit_code === nextCode) {
        return;
      }

      return {
        afterSave: async () => {
          await replaceUnitUsages({
            oldCode: currentUnit.unit_code,
            oldUnitId: currentUnit.id,
            nextCode,
            nextLabel,
            nextUnitId: currentUnit.id,
          });
        },
      };
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'unit_code', ascending: true },
    ],
  });

  async function guardedSubmit() {
    setEditError('');
    if (units.editingId && !confirmedEdit) {
      const currentUnit = units.items.find((item) => item.id === units.editingId);
      const nextCode = normalizeUnitCode(String(units.formValues.unit_code ?? ''));
      const nextLabel = normalizeUnitName(String(units.formValues.unit_name ?? ''), nextCode);

      if (currentUnit && currentUnit.unit_code !== nextCode) {
        const impacts = await loadUnitImpacts(currentUnit.unit_code);
        if (impacts.length > 0) {
          setConfirmedEdit({ unit: currentUnit, nextCode, nextLabel, impacts });
          return false;
        }
      }
    }

    const result = await units.submit();
    if (result !== false) {
      setConfirmedEdit(null);
    }
    return result;
  }

  async function confirmImpactedEdit() {
    if (!confirmedEdit) {
      return;
    }

    setEditError('');

    try {
      await renameUsedUnit(confirmedEdit.unit, units.formValues);
      await units.loadItems();
      units.resetForm();
      setConfirmedEdit(null);
    } catch (error) {
      setEditError(error instanceof Error ? error.message : 'Failed to rename unit.');
    }
  }

  return (
    <SettingsAccordionItem
      panel="units"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-ruler-combined"
      title="Units"
      counts={units.counts}
    >
      {activePanel === 'units' ? (
        <UnitsSectionContent
          units={units}
          onSubmit={guardedSubmit}
          editImpact={confirmedEdit}
          editError={editError}
          onCancelEditImpact={() => setConfirmedEdit(null)}
          onConfirmEditImpact={confirmImpactedEdit}
        />
      ) : null}
    </SettingsAccordionItem>
  );
}

function UnitsSectionContent({
  units,
  onSubmit,
  editImpact,
  editError,
  onCancelEditImpact,
  onConfirmEditImpact,
}: {
  units: ReturnType<typeof useSupabaseSettingsSection<UnitRecord, UnitForm>>;
  onSubmit: () => Promise<unknown>;
  editImpact: EditImpactState | null;
  editError: string;
  onCancelEditImpact: () => void;
  onConfirmEditImpact: () => Promise<void>;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [deleteState, setDeleteState] = useState<DeleteState | null>(null);
  const [deleteMode, setDeleteMode] = useState<'bulk' | 'manual'>('bulk');
  const [selectedImpactIds, setSelectedImpactIds] = useState<string[]>([]);
  const [bulkReplacement, setBulkReplacement] = useState('');
  const [manualReplacements, setManualReplacements] = useState<Record<string, string>>({});
  const [isCheckingDelete, setIsCheckingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const filteredItems = useMemo(
    () => units.items.filter((item) => matchesSearch(item, searchValue, ['unit_code', 'unit_name', 'plural_name', 'unit_type', 'description', 'status'])),
    [units.items, searchValue],
  );

  const replacementOptions = useMemo(
    () => units.items.filter((item) => item.status === 'Active' && item.id !== deleteState?.unit.id),
    [deleteState?.unit.id, units.items],
  );

  async function openDelete(unit: UnitRecord) {
    setIsCheckingDelete(true);
    setDeleteError('');

    try {
      const impacts = await loadUnitImpacts(unit.unit_code);

      if (impacts.length === 0) {
        await deleteUnitRecord(unit.id);
        await units.loadItems();
        setIsCheckingDelete(false);
        return;
      }

      setDeleteState({ unit, impacts });
      setSelectedImpactIds(impacts.map((impact) => impact.id));
      setBulkReplacement('');
      setManualReplacements({});
      setDeleteMode('bulk');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to check unit usage.');
    } finally {
      setIsCheckingDelete(false);
    }
  }

  function closeDeleteModal() {
    setDeleteState(null);
    setDeleteError('');
    setSelectedImpactIds([]);
    setBulkReplacement('');
    setManualReplacements({});
  }

  function applyBulkReplacement() {
    if (!deleteState || !bulkReplacement) {
      return;
    }

    const selected = new Set(selectedImpactIds);
    setManualReplacements((current) => {
      const next = { ...current };
      deleteState.impacts.forEach((impact) => {
        if (selected.has(impact.id)) {
          next[impact.id] = bulkReplacement;
        }
      });
      return next;
    });
  }

  async function confirmDelete() {
    if (!deleteState) {
      return;
    }

    const replacements = { ...manualReplacements };
    if (deleteMode === 'bulk') {
      deleteState.impacts.forEach((impact) => {
        if (selectedImpactIds.includes(impact.id) && bulkReplacement) {
          replacements[impact.id] = bulkReplacement;
        }
      });
    }

    const missingReplacement = deleteState.impacts.some((impact) => !replacements[impact.id]);
    if (missingReplacement) {
      setDeleteError('Choose a replacement unit for every affected product before deleting.');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      for (const impact of deleteState.impacts) {
        const replacementCode = replacements[impact.id];
        const replacementUnit = units.items.find((item) => item.unit_code === replacementCode);
        const replacementLabel = replacementUnit?.unit_name || replacementCode;
        const payload: Record<string, unknown> = {};

        if (impact.unitCode === deleteState.unit.unit_code) {
          payload.unit_code = replacementCode;
          payload.unit_label = replacementLabel;
        }
        if (impact.baseUnitCode === deleteState.unit.unit_code) {
          payload.base_unit_code = replacementCode;
        }

        const { error } = await supabase.from('product_variation_unit_options').update(payload).eq('id', impact.id);
        if (error) throw error;

        await replaceLinkedUnitCodeByOptionId(impact.id, replacementCode);
      }

      await deleteUnitRecord(deleteState.unit.id);

      await units.loadItems();
      closeDeleteModal();
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : 'Failed to delete unit.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <SupabaseSettingsSection
        title="Units"
        subtitle="Manage the unit choices used by product order units."
        searchPlaceholder="Search units"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'unit_code', label: 'Unit code', type: 'text', required: true, placeholder: 'box' },
          { key: 'unit_name', label: 'Unit name', type: 'text', required: true, placeholder: 'box' },
          { key: 'plural_name', label: 'Plural name', type: 'text', placeholder: 'boxes' },
          { key: 'unit_type', label: 'Unit type', type: 'select', required: true, options: UNIT_TYPE_OPTIONS },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional unit notes' },
        ]}
        formValues={units.formValues}
        onFieldChange={units.updateField}
        onSubmit={onSubmit}
        onCancelEdit={units.resetForm}
        editingId={units.editingId}
        isSaving={units.isSaving}
        isLoading={units.isLoading}
        loadError={units.loadError}
        saveError={units.saveError || deleteError}
        items={filteredItems}
        rowTemplateColumns="0.8fr 1fr 0.8fr 0.8fr 0.7fr auto"
        columns={[
          { label: 'Code', render: (item) => item.unit_code },
          { label: 'Name', render: (item) => item.unit_name || '-', className: sectionStyles.cellMuted },
          { label: 'Type', render: (item) => item.unit_type },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
        ]}
        onEdit={units.startEdit}
        onToggleStatus={(item) => units.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
        onReorder={units.reorderItems}
        actionHeaderLabel="Actions"
        emptyText="No units found yet."
        renderExtraActions={(item) => (
          <button
            type="button"
            className={`${sectionStyles.rowAction} ${sectionStyles.dangerRowAction}`}
            onClick={() => void openDelete(item)}
            disabled={isCheckingDelete}
          >
            Delete
          </button>
        )}
      />

      {editImpact ? (
        <SettingsFormModal
          isOpen
          title="Confirm Unit Edit"
          subtitle={`${editImpact.impacts.length} product unit row(s) will change from ${editImpact.unit.unit_code} to ${editImpact.nextCode}.`}
          primaryLabel="Confirm Edit"
          isSubmitting={units.isSaving}
          onClose={onCancelEditImpact}
          onSubmit={onConfirmEditImpact}
        >
          {editError ? <p className={sectionStyles.error}>{editError}</p> : null}
          <ImpactList impacts={editImpact.impacts} />
        </SettingsFormModal>
      ) : null}

      {deleteState ? (
        <SettingsFormModal
          isOpen
          title="Replace Unit Before Delete"
          subtitle={`${deleteState.unit.unit_code} is used by ${deleteState.impacts.length} product unit row(s). Replace each usage before deleting.`}
          primaryLabel="Replace and Delete"
          isSubmitting={isDeleting}
          onClose={closeDeleteModal}
          onSubmit={confirmDelete}
        >
          <div className={sectionStyles.unitReplacePanel}>
            <div className={sectionStyles.segmentedControl}>
              <button
                type="button"
                className={deleteMode === 'bulk' ? sectionStyles.segmentActive : ''}
                onClick={() => setDeleteMode('bulk')}
              >
                Bulk
              </button>
              <button
                type="button"
                className={deleteMode === 'manual' ? sectionStyles.segmentActive : ''}
                onClick={() => setDeleteMode('manual')}
              >
                Manual
              </button>
            </div>

            {deleteError ? <p className={sectionStyles.error}>{deleteError}</p> : null}

            {deleteMode === 'bulk' ? (
              <div className={sectionStyles.bulkReplaceBar}>
                <select
                  className={`${sectionStyles.input} ${sectionStyles.select}`}
                  value={bulkReplacement}
                  onChange={(event) => setBulkReplacement(event.target.value)}
                >
                  <option value="">Replacement unit</option>
                  {replacementOptions.map((unit) => (
                    <option key={unit.id} value={unit.unit_code}>
                      {unit.unit_name || unit.unit_code}
                    </option>
                  ))}
                </select>
                <button type="button" className={sectionStyles.secondaryButton} onClick={applyBulkReplacement}>
                  Apply to selected
                </button>
              </div>
            ) : null}

            <div className={sectionStyles.impactList}>
              {deleteState.impacts.map((impact) => (
                <div key={impact.id} className={sectionStyles.impactRow}>
                  {deleteMode === 'bulk' ? (
                    <input
                      type="checkbox"
                      className={sectionStyles.checkbox}
                      checked={selectedImpactIds.includes(impact.id)}
                      onChange={(event) =>
                        setSelectedImpactIds((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, impact.id]))
                            : current.filter((id) => id !== impact.id),
                        )
                      }
                    />
                  ) : null}
                  <ImpactSummary impact={impact} />
                  <select
                    className={`${sectionStyles.input} ${sectionStyles.select}`}
                    value={manualReplacements[impact.id] ?? (deleteMode === 'bulk' ? bulkReplacement : '')}
                    onChange={(event) =>
                      setManualReplacements((current) => ({ ...current, [impact.id]: event.target.value }))
                    }
                  >
                    <option value="">Choose unit</option>
                    {replacementOptions.map((unit) => (
                      <option key={unit.id} value={unit.unit_code}>
                        {unit.unit_name || unit.unit_code}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </SettingsFormModal>
      ) : null}
    </>
  );
}

function ImpactList({ impacts }: { impacts: UnitImpact[] }) {
  return (
    <div className={sectionStyles.impactList}>
      {impacts.map((impact) => (
        <div key={impact.id} className={`${sectionStyles.impactRow} ${sectionStyles.impactRowCompact}`}>
          <ImpactSummary impact={impact} />
        </div>
      ))}
    </div>
  );
}

function ImpactSummary({ impact }: { impact: UnitImpact }) {
  return (
    <div className={sectionStyles.impactSummary}>
      <strong>{impact.productName}</strong>
      <span>
        {impact.variationName || 'Variation'} {impact.variationSku ? `(${impact.variationSku})` : ''}
      </span>
      <span>
        {impact.relation}: {impact.unitCode} contains {impact.quantityInBaseUnit} {impact.baseUnitCode}
      </span>
    </div>
  );
}

async function loadUnitImpacts(unitCode: string) {
  const normalizedCode = normalizeUnitCode(unitCode);
  const { data: unitRows, error: unitError } = await supabase
    .from('product_variation_unit_options')
    .select('id, variation_id, unit_code, unit_label, base_unit_code, quantity_in_base_unit')
    .or(`unit_code.eq.${normalizedCode},base_unit_code.eq.${normalizedCode}`)
    .order('sort_order', { ascending: true });

  if (unitError) {
    throw unitError;
  }

  const rows = ((unitRows ?? []) as Array<Record<string, unknown>>).filter((row) => getRowString(row, 'id'));
  const variationIds = Array.from(new Set(rows.map((row) => getRowString(row, 'variation_id')).filter(Boolean)));

  const variationMap = new Map<string, Record<string, unknown>>();
  const productMap = new Map<string, Record<string, unknown>>();

  if (variationIds.length > 0) {
    const { data: variationRows, error: variationError } = await supabase
      .from('product_variations')
      .select('id, product_id, variation_name, class_name, sku_code')
      .in('id', variationIds);

    if (variationError) {
      throw variationError;
    }

    ((variationRows ?? []) as Array<Record<string, unknown>>).forEach((row) => {
      variationMap.set(getRowString(row, 'id'), row);
    });

    const productIds = Array.from(
      new Set(((variationRows ?? []) as Array<Record<string, unknown>>).map((row) => getRowString(row, 'product_id')).filter(Boolean)),
    );

    if (productIds.length > 0) {
      const { data: productRows, error: productError } = await supabase
        .from('products')
        .select('id, product_name, sku_code')
        .in('id', productIds);

      if (productError) {
        throw productError;
      }

      ((productRows ?? []) as Array<Record<string, unknown>>).forEach((row) => {
        productMap.set(getRowString(row, 'id'), row);
      });
    }
  }

  return rows.map((row) => {
    const variation = variationMap.get(getRowString(row, 'variation_id'));
    const product = variation ? productMap.get(getRowString(variation, 'product_id')) : undefined;
    const unitMatches = getRowString(row, 'unit_code') === normalizedCode;
    const baseMatches = getRowString(row, 'base_unit_code') === normalizedCode;

    return {
      id: getRowString(row, 'id'),
      variationId: getRowString(row, 'variation_id'),
      unitCode: getRowString(row, 'unit_code'),
      unitLabel: getRowString(row, 'unit_label'),
      baseUnitCode: getRowString(row, 'base_unit_code'),
      quantityInBaseUnit: getRowString(row, 'quantity_in_base_unit') || '1',
      productName: product ? getRowString(product, 'product_name') || 'Untitled Product' : 'Untitled Product',
      productSku: product ? getRowString(product, 'sku_code') : '',
      variationName: variation ? getRowString(variation, 'variation_name') || getRowString(variation, 'class_name') : '',
      variationSku: variation ? getRowString(variation, 'sku_code') : '',
      relation: unitMatches && baseMatches ? 'Order and base unit' : unitMatches ? 'Order unit' : 'Base unit',
    } satisfies UnitImpact;
  });
}

async function replaceUnitUsages({
  oldCode,
  oldUnitId,
  nextCode,
  nextLabel,
  nextUnitId,
}: {
  oldCode: string;
  oldUnitId: string;
  nextCode: string;
  nextLabel: string;
  nextUnitId: string;
}) {
  const normalizedOldCode = normalizeUnitCode(oldCode);

  const updateResults = await Promise.all([
    supabase
      .from('product_variation_unit_options')
      .update({ unit_code: nextCode, unit_label: nextLabel })
      .eq('unit_code', normalizedOldCode),
    supabase
      .from('product_variation_unit_options')
      .update({ base_unit_code: nextCode })
      .eq('base_unit_code', normalizedOldCode),
    supabase.from('product_discount_classes').update({ order_unit_code: nextCode }).eq('order_unit_code', normalizedOldCode),
    supabase.from('product_surcharge_classes').update({ order_unit_code: nextCode }).eq('order_unit_code', normalizedOldCode),
    supabase.from('product_surcharges').update({ reward_unit_code: nextCode }).eq('reward_unit_code', normalizedOldCode),
    supabase
      .from('product_unit_aliases')
      .update({ unit_id: nextUnitId, normalized_unit_code: nextCode })
      .eq('unit_id', oldUnitId),
  ]);

  const failed = updateResults.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

async function renameUsedUnit(currentUnit: UnitRecord, form: UnitForm) {
  const nextCode = normalizeUnitCode(form.unit_code);
  const nextName = normalizeUnitName(form.unit_name, nextCode);

  if (!nextCode) {
    throw new Error('Unit code is required.');
  }

  const { data: duplicateRows, error: duplicateError } = await supabase
    .from('product_units')
    .select('id')
    .eq('unit_code', nextCode)
    .neq('id', currentUnit.id);

  if (duplicateError) {
    throw duplicateError;
  }

  if ((duplicateRows ?? []).length > 0) {
    throw new Error('Unit code already exists.');
  }

  const { data: insertedUnit, error: insertError } = await supabase
    .from('product_units')
    .insert({
      unit_code: nextCode,
      unit_name: nextName,
      plural_name: form.plural_name.trim().toLowerCase() || null,
      unit_type: form.unit_type,
      description: form.description.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order) || currentUnit.sort_order,
    })
    .select('id')
    .single();

  if (insertError) {
    throw insertError;
  }

  const nextUnitId = String(insertedUnit?.id ?? '');
  if (!nextUnitId) {
    throw new Error('Failed to create replacement unit.');
  }

  await replaceUnitUsages({
    oldCode: currentUnit.unit_code,
    oldUnitId: currentUnit.id,
    nextCode,
    nextLabel: nextName,
    nextUnitId,
  });

  await deleteUnitRecord(currentUnit.id);
}

async function replaceLinkedUnitCodeByOptionId(unitOptionId: string, nextCode: string) {
  const updateResults = await Promise.all([
    supabase.from('product_discount_classes').update({ order_unit_code: nextCode }).eq('unit_option_id', unitOptionId),
    supabase.from('product_surcharge_classes').update({ order_unit_code: nextCode }).eq('unit_option_id', unitOptionId),
    supabase.from('product_surcharges').update({ reward_unit_code: nextCode }).eq('reward_unit_option_id', unitOptionId),
  ]);

  const failed = updateResults.find((result) => result.error);
  if (failed?.error) {
    throw failed.error;
  }
}

async function deleteUnitRecord(unitId: string) {
  const aliasDelete = await supabase.from('product_unit_aliases').delete().eq('unit_id', unitId);
  if (aliasDelete.error) {
    throw aliasDelete.error;
  }

  const unitDelete = await supabase.from('product_units').delete().eq('id', unitId);
  if (unitDelete.error) {
    throw unitDelete.error;
  }
}
