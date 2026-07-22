import { useMemo, useState } from 'react';
import SupabaseSettingsSection from './SupabaseSettingsSection';
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

type BranchRecord = {
  id: string;
  branch_name: string;
  branch_code: string;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type BranchForm = {
  branch_name: string;
  branch_code: string;
  description: string;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

export default function BranchesSettingsSection({ activePanel, onToggle }: Props) {
  const branches = useSupabaseSettingsSection<BranchRecord, BranchForm>({
    table: 'branches',
    selectQuery: 'id, branch_name, branch_code, description, status, sort_order, created_at, updated_at',
    emptyForm: {
      branch_name: '',
      branch_code: '',
      description: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      branch_name: String(row.branch_name ?? ''),
      branch_code: String(row.branch_code ?? ''),
      description: String(row.description ?? ''),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      branch_name: record.branch_name,
      branch_code: record.branch_code,
      description: record.description,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      branch_name: form.branch_name.trim(),
      branch_code: form.branch_code.trim().toUpperCase(),
      description: form.description.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      if (!form.branch_name.trim() || !form.branch_code.trim()) {
        return 'Branch name and branch code are required.';
      }

      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          (item.branch_name.toLowerCase() === form.branch_name.trim().toLowerCase() ||
            item.branch_code.toLowerCase() === form.branch_code.trim().toLowerCase()),
      );

      return duplicate ? 'Branch name or branch code already exists.' : null;
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'branch_name', ascending: true },
    ],
  });

  return (
    <SettingsAccordionItem
      panel="branches"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-store"
      title="Branches"
      counts={branches.counts}
    >
      {activePanel === 'branches' ? <BranchesSectionContent branches={branches} /> : null}
    </SettingsAccordionItem>
  );
}

function BranchesSectionContent({
  branches,
}: {
  branches: ReturnType<typeof useSupabaseSettingsSection<BranchRecord, BranchForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      branches.items.filter((item) =>
        matchesSearch(item, searchValue, ['branch_name', 'branch_code', 'description', 'status']),
      ),
    [branches.items, searchValue],
  );

  return (
    <>
      <SupabaseSettingsSection
        title="Branches"
        subtitle="Manage the real branch master list used by the system."
        searchPlaceholder="Search branches"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'branch_name', label: 'Branch name', type: 'text', required: true, placeholder: 'Manila' },
          { key: 'branch_code', label: 'Branch code', type: 'text', required: true, placeholder: 'MNL' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional branch description' },
        ]}
        formValues={branches.formValues}
        onFieldChange={branches.updateField}
        onSubmit={branches.submit}
        onCancelEdit={branches.resetForm}
        editingId={branches.editingId}
        isSaving={branches.isSaving}
        isLoading={branches.isLoading}
        loadError={branches.loadError}
        saveError={branches.saveError}
        items={filteredItems}
        rowTemplateColumns="1.4fr 1fr 0.8fr 0.8fr auto"
        columns={[
          { label: 'Branch', render: (item) => item.branch_name },
          { label: 'Code', render: (item) => item.branch_code },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
        ]}
        onEdit={branches.startEdit}
        onReorder={branches.reorderItems}
        actionHeaderLabel="Action"
        emptyText="No branches found yet."
      />
    </>
  );
}
