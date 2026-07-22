import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
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

type DeliveryTermRecord = {
  id: string;
  term_name: string;
  term_code: string;
  description: string;
  is_default: boolean;
  status: StatusValue;
  sort_order: number;
};

type DeliveryTermForm = {
  term_name: string;
  term_code: string;
  description: string;
  is_default: boolean;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

export default function DeliveryTermsSettingsSection({ activePanel, onToggle }: Props) {
  const deliveryTerms = useSupabaseSettingsSection<DeliveryTermRecord, DeliveryTermForm>({
    table: 'delivery_terms',
    selectQuery:
      'id, term_name, term_code, description, is_default, status, sort_order, created_at, updated_at',
    emptyForm: {
      term_name: '',
      term_code: '',
      description: '',
      is_default: false,
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      term_name: String(row.term_name ?? ''),
      term_code: String(row.term_code ?? ''),
      description: String(row.description ?? ''),
      is_default: Boolean(row.is_default),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      term_name: record.term_name,
      term_code: record.term_code,
      description: record.description,
      is_default: record.is_default,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      term_name: form.term_name.trim(),
      term_code: form.term_code.trim().toUpperCase(),
      description: form.description.trim() || null,
      is_default: Boolean(form.is_default),
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      if (!form.term_name.trim() || !form.term_code.trim()) {
        return 'Term name and term code are required.';
      }

      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          (item.term_name.toLowerCase() === form.term_name.trim().toLowerCase() ||
            item.term_code.toLowerCase() === form.term_code.trim().toLowerCase()),
      );

      return duplicate ? 'Delivery term name or code already exists.' : null;
    },
    beforeSave: async ({ editingId, form }) => {
      if (!form.is_default) {
        return;
      }

      let query = supabase.from('delivery_terms').update({ is_default: false });
      if (editingId) {
        query = query.neq('id', editingId);
      }

      const { error } = await query.eq('is_default', true);
      if (error) {
        throw new Error(`Failed to update other default delivery terms: ${error.message}`);
      }
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'term_name', ascending: true },
    ],
  });

  return (
    <SettingsAccordionItem
      panel="deliveryTerms"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-truck-fast"
      title="Delivery Terms"
      counts={deliveryTerms.counts}
    >
      {activePanel === 'deliveryTerms' ? <DeliveryTermsSectionContent deliveryTerms={deliveryTerms} /> : null}
    </SettingsAccordionItem>
  );
}

function DeliveryTermsSectionContent({
  deliveryTerms,
}: {
  deliveryTerms: ReturnType<typeof useSupabaseSettingsSection<DeliveryTermRecord, DeliveryTermForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      deliveryTerms.items.filter((item) =>
        matchesSearch(item, searchValue, ['term_name', 'term_code', 'description', 'status']),
      ),
    [deliveryTerms.items, searchValue],
  );

  return (
    <>
      <SupabaseSettingsSection
        title="Delivery Terms"
        subtitle="Manage the order delivery terms used by orders.delivery_term_id."
        searchPlaceholder="Search delivery terms"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'term_name', label: 'Term name', type: 'text', required: true, placeholder: 'Cash on Delivery' },
          { key: 'term_code', label: 'Term code', type: 'text', required: true, placeholder: 'COD' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          { key: 'is_default', label: 'Default term', type: 'checkbox' },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional delivery term description' },
        ]}
        formValues={deliveryTerms.formValues}
        onFieldChange={deliveryTerms.updateField}
        onSubmit={deliveryTerms.submit}
        onCancelEdit={deliveryTerms.resetForm}
        editingId={deliveryTerms.editingId}
        isSaving={deliveryTerms.isSaving}
        isLoading={deliveryTerms.isLoading}
        loadError={deliveryTerms.loadError}
        saveError={deliveryTerms.saveError}
        items={filteredItems}
        rowTemplateColumns="1.2fr 0.8fr 1.4fr 0.8fr 0.8fr 0.7fr auto"
        columns={[
          { label: 'Term', render: (item) => item.term_name },
          { label: 'Code', render: (item) => item.term_code },
          { label: 'Description', render: (item) => item.description || '-', className: sectionStyles.cellMuted },
          { label: 'Default', render: (item) => (item.is_default ? 'Yes' : 'No') },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
        ]}
        onEdit={deliveryTerms.startEdit}
        onToggleStatus={(item) => deliveryTerms.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
        onReorder={deliveryTerms.reorderItems}
        emptyText="No delivery terms found yet."
      />
    </>
  );
}
