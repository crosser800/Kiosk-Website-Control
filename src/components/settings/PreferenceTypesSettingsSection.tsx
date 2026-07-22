import { useEffect, useMemo, useState } from 'react';
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

type PreferenceTypeRecord = {
  id: string;
  preference_name: string;
  preference_code: string;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type PreferenceTypeForm = {
  preference_name: string;
  preference_code: string;
  description: string;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
  onItemsChange?: (items: PreferenceTypeRecord[]) => void;
};

export default function PreferenceTypesSettingsSection({ activePanel, onToggle, onItemsChange }: Props) {
  const preferenceTypes = useSupabaseSettingsSection<PreferenceTypeRecord, PreferenceTypeForm>({
    table: 'preference_types',
    selectQuery:
      'id, preference_name, preference_code, description, status, sort_order, created_at, updated_at',
    emptyForm: {
      preference_name: '',
      preference_code: '',
      description: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      preference_name: String(row.preference_name ?? ''),
      preference_code: String(row.preference_code ?? ''),
      description: String(row.description ?? ''),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      preference_name: record.preference_name,
      preference_code: record.preference_code,
      description: record.description,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      preference_name: form.preference_name.trim(),
      preference_code: form.preference_code.trim().toUpperCase(),
      description: form.description.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      if (!form.preference_name.trim() || !form.preference_code.trim()) {
        return 'Preference name and preference code are required.';
      }

      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          (item.preference_name.toLowerCase() === form.preference_name.trim().toLowerCase() ||
            item.preference_code.toLowerCase() === form.preference_code.trim().toLowerCase()),
      );

      return duplicate ? 'Preference name or preference code already exists.' : null;
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'preference_name', ascending: true },
    ],
  });

  useEffect(() => {
    onItemsChange?.(preferenceTypes.items);
  }, [onItemsChange, preferenceTypes.items]);

  return (
    <SettingsAccordionItem
      panel="preferenceTypes"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-layer-group"
      title="Preference Types"
      counts={preferenceTypes.counts}
    >
      {activePanel === 'preferenceTypes' ? (
        <PreferenceTypesSectionContent preferenceTypes={preferenceTypes} />
      ) : null}
    </SettingsAccordionItem>
  );
}

function PreferenceTypesSectionContent({
  preferenceTypes,
}: {
  preferenceTypes: ReturnType<typeof useSupabaseSettingsSection<PreferenceTypeRecord, PreferenceTypeForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      preferenceTypes.items.filter((item) =>
        matchesSearch(item, searchValue, ['preference_name', 'preference_code', 'description', 'status']),
      ),
    [preferenceTypes.items, searchValue],
  );

  return (
    <>
      <SupabaseSettingsSection
        title="Preference Types"
        subtitle="Manage price preference options such as Retail, Wholesale, Special, and Concept Store."
        searchPlaceholder="Search preference types"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'preference_name', label: 'Preference name', type: 'text', required: true, placeholder: 'Retail' },
          { key: 'preference_code', label: 'Preference code', type: 'text', required: true, placeholder: 'RTL' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional preference type description' },
        ]}
        formValues={preferenceTypes.formValues}
        onFieldChange={preferenceTypes.updateField}
        onSubmit={preferenceTypes.submit}
        onCancelEdit={preferenceTypes.resetForm}
        editingId={preferenceTypes.editingId}
        isSaving={preferenceTypes.isSaving}
        isLoading={preferenceTypes.isLoading}
        loadError={preferenceTypes.loadError}
        saveError={preferenceTypes.saveError}
        items={filteredItems}
        rowTemplateColumns="minmax(11rem, 1.2fr) minmax(8rem, 0.85fr) minmax(14rem, 1.35fr) minmax(8rem, 0.75fr) minmax(7rem, 0.7fr) minmax(12rem, 1.1fr) minmax(12rem, 0.95fr)"
        columns={[
          { label: 'Preference', render: (item) => item.preference_name },
          { label: 'Code', render: (item) => item.preference_code },
          { label: 'Description', render: (item) => item.description || '-', className: sectionStyles.cellMuted },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
          { label: 'Summary', render: (item) => `${item.preference_name} (${item.preference_code})`, className: sectionStyles.cellMuted },
        ]}
        onEdit={preferenceTypes.startEdit}
        onToggleStatus={(item) => preferenceTypes.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
        onReorder={preferenceTypes.reorderItems}
        emptyText="No preference types found yet."
      />
    </>
  );
}
