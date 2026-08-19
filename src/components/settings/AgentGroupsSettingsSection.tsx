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

type AgentGroupRecord = {
  id: string;
  group_name: string;
  group_code: string;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type AgentGroupForm = {
  group_name: string;
  group_code: string;
  description: string;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

export default function AgentGroupsSettingsSection({ activePanel, onToggle }: Props) {
  const agentGroups = useSupabaseSettingsSection<AgentGroupRecord, AgentGroupForm>({
    table: 'agent_groups',
    selectQuery: 'id, group_name, group_code, description, status, sort_order, created_at, updated_at',
    emptyForm: {
      group_name: '',
      group_code: '',
      description: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      group_name: String(row.group_name ?? ''),
      group_code: String(row.group_code ?? ''),
      description: String(row.description ?? ''),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      group_name: record.group_name,
      group_code: record.group_code,
      description: record.description,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      group_name: form.group_name.trim(),
      group_code: form.group_code.trim().toUpperCase() || null,
      description: form.description.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      if (!form.group_name.trim()) {
        return 'Group name is required.';
      }

      const code = form.group_code.trim().toLowerCase();
      if (code) {
        const duplicateCode = items.some(
          (item) => item.id !== editingId && item.group_code.trim().toLowerCase() === code,
        );
        if (duplicateCode) return 'This group code already exists.';
      }

      const duplicateName = items.some(
        (item) =>
          item.id !== editingId &&
          item.group_name.trim().toLowerCase() === form.group_name.trim().toLowerCase(),
      );
      return duplicateName ? 'This group name already exists.' : null;
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'group_name', ascending: true },
    ],
  });

  return (
    <SettingsAccordionItem
      panel="agentGroups"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-layer-group"
      title="Agent Groups"
      counts={agentGroups.counts}
    >
      {activePanel === 'agentGroups' ? <AgentGroupsSectionContent agentGroups={agentGroups} /> : null}
    </SettingsAccordionItem>
  );
}

function AgentGroupsSectionContent({
  agentGroups,
}: {
  agentGroups: ReturnType<typeof useSupabaseSettingsSection<AgentGroupRecord, AgentGroupForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      agentGroups.items.filter((item) =>
        matchesSearch(item, searchValue, ['group_name', 'group_code', 'description', 'status']),
      ),
    [agentGroups.items, searchValue],
  );

  return (
    <SupabaseSettingsSection
      title="Agent Groups"
      subtitle="Organize agents into simple filtering groups."
      searchPlaceholder="Search agent groups"
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      fields={[
        { key: 'group_name', label: 'Group name', type: 'text', required: true, placeholder: 'Group A' },
        { key: 'group_code', label: 'Group code', type: 'text', placeholder: 'A' },
        { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
        { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional group notes' },
      ]}
      formValues={agentGroups.formValues}
      onFieldChange={agentGroups.updateField}
      onSubmit={agentGroups.submit}
      onCancelEdit={agentGroups.resetForm}
      editingId={agentGroups.editingId}
      isSaving={agentGroups.isSaving}
      isLoading={agentGroups.isLoading}
      loadError={agentGroups.loadError}
      saveError={agentGroups.saveError}
      items={filteredItems}
      rowTemplateColumns="1.2fr 0.8fr 1.6fr 0.8fr 0.7fr auto"
      columns={[
        { label: 'Name', render: (item) => item.group_name },
        { label: 'Code', render: (item) => item.group_code || '-', className: sectionStyles.cellMuted },
        { label: 'Description', render: (item) => item.description || '-', className: sectionStyles.cellMuted },
        { label: 'Status', render: (item) => statusBadge(item.status) },
        { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
      ]}
      onEdit={agentGroups.startEdit}
      onToggleStatus={(item) => agentGroups.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
      onReorder={agentGroups.reorderItems}
      emptyText="No agent groups found yet."
    />
  );
}
