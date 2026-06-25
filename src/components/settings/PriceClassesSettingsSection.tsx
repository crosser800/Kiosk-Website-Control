import { useMemo, useState } from 'react';
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

type PriceClassRecord = {
  id: string;
  price_code: string;
  price_label: string;
  preference_code: string;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type PriceClassForm = {
  price_code: string;
  price_label: string;
  preference_code: string;
  description: string;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
  preferenceOptions: Array<{ label: string; value: string }>;
};

export default function PriceClassesSettingsSection({
  activePanel,
  onToggle,
  preferenceOptions,
}: Props) {
  const priceClasses = useSupabaseSettingsSection<PriceClassRecord, PriceClassForm>({
    table: 'price_classes',
    selectQuery:
      'id, price_code, price_label, preference_code, description, status, sort_order, created_at, updated_at',
    emptyForm: {
      price_code: '',
      price_label: '',
      preference_code: '',
      description: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      price_code: String(row.price_code ?? ''),
      price_label: String(row.price_label ?? ''),
      preference_code: String(row.preference_code ?? ''),
      description: String(row.description ?? ''),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      price_code: record.price_code,
      price_label: record.price_label,
      preference_code: record.preference_code,
      description: record.description,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      price_code: form.price_code.trim().toUpperCase(),
      price_label: form.price_label.trim(),
      preference_code: form.preference_code.trim().toUpperCase() || null,
      description: form.description.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      if (!form.price_code.trim() || !form.price_label.trim()) {
        return 'Price code and price label are required.';
      }

      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          item.price_code.toLowerCase() === form.price_code.trim().toLowerCase(),
      );

      return duplicate ? 'This price code already exists.' : null;
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'price_code', ascending: true },
    ],
  });

  return (
    <SettingsAccordionItem
      panel="priceClasses"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-tags"
      title="Price Classes"
      counts={priceClasses.counts}
    >
      {activePanel === 'priceClasses' ? (
        <PriceClassesSectionContent priceClasses={priceClasses} preferenceOptions={preferenceOptions} />
      ) : null}
    </SettingsAccordionItem>
  );
}

function PriceClassesSectionContent({
  priceClasses,
  preferenceOptions,
}: {
  priceClasses: ReturnType<typeof useSupabaseSettingsSection<PriceClassRecord, PriceClassForm>>;
  preferenceOptions: Array<{ label: string; value: string }>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      priceClasses.items.filter((item) =>
        matchesSearch(item, searchValue, ['price_code', 'price_label', 'preference_code', 'description', 'status']),
      ),
    [priceClasses.items, searchValue],
  );

  return (
    <>
      <SupabaseSettingsSection
        title="Price Classes"
        subtitle="Manage price class codes such as R1, W1, SP, and CP."
        searchPlaceholder="Search price classes"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'price_code', label: 'Price code', type: 'text', required: true, placeholder: 'R1' },
          { key: 'price_label', label: 'Price label', type: 'text', required: true, placeholder: 'Retail 1' },
          { key: 'preference_code', label: 'Preference code', type: 'select', options: preferenceOptions },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional price class description' },
        ]}
        formValues={priceClasses.formValues}
        onFieldChange={priceClasses.updateField}
        onSubmit={priceClasses.submit}
        onCancelEdit={priceClasses.resetForm}
        editingId={priceClasses.editingId}
        isSaving={priceClasses.isSaving}
        isLoading={priceClasses.isLoading}
        loadError={priceClasses.loadError}
        saveError={priceClasses.saveError}
        items={filteredItems}
        rowTemplateColumns="0.9fr 1.2fr 1fr 1.5fr 0.8fr 0.7fr auto"
        columns={[
          { label: 'Code', render: (item) => item.price_code },
          { label: 'Label', render: (item) => item.price_label },
          { label: 'Preference', render: (item) => item.preference_code || '-', className: sectionStyles.cellMuted },
          { label: 'Description', render: (item) => item.description || '-', className: sectionStyles.cellMuted },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
        ]}
        onEdit={priceClasses.startEdit}
        onToggleStatus={(item) => priceClasses.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
        onReorder={priceClasses.reorderItems}
        emptyText="No price classes found yet."
      />
    </>
  );
}
