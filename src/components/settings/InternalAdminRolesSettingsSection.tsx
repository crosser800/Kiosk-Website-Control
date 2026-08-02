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

const roleCodePattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

type AdminRoleRecord = {
  id: string;
  role_name: string;
  role_code: string;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type AdminRoleForm = {
  role_name: string;
  role_code: string;
  description: string;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

type AdminRoleField = keyof AdminRoleForm;

function createRoleCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function getAdminRoleSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('role_name')) {
    return 'A role with this name already exists.';
  }

  if (message.includes('role_code')) {
    return 'A role with this code already exists.';
  }

  return error instanceof Error ? error.message : 'Failed to save changes.';
}

export default function InternalAdminRolesSettingsSection({ activePanel, onToggle }: Props) {
  const adminRoles = useSupabaseSettingsSection<AdminRoleRecord, AdminRoleForm>({
    table: 'admin_roles',
    selectQuery: 'id, role_name, role_code, description, status, sort_order, created_at, updated_at',
    emptyForm: {
      role_name: '',
      role_code: '',
      description: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      role_name: String(row.role_name ?? ''),
      role_code: String(row.role_code ?? ''),
      description: String(row.description ?? ''),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      role_name: record.role_name,
      role_code: record.role_code,
      description: record.description,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      role_name: form.role_name.trim(),
      role_code: form.role_code.trim(),
      description: form.description.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      const roleName = form.role_name.trim();
      const roleCode = form.role_code.trim();

      if (!roleName) {
        return 'Role name is required.';
      }

      if (!roleCode) {
        return 'Role code is required.';
      }

      if (!roleCodePattern.test(roleCode)) {
        return 'Role code must use lowercase snake_case only.';
      }

      const duplicateName = items.some(
        (item) => item.id !== editingId && item.role_name.toLowerCase() === roleName.toLowerCase(),
      );

      if (duplicateName) {
        return 'A role with this name already exists.';
      }

      const duplicateCode = items.some(
        (item) => item.id !== editingId && item.role_code.toLowerCase() === roleCode.toLowerCase(),
      );

      return duplicateCode ? 'A role with this code already exists.' : null;
    },
    getSaveErrorMessage: getAdminRoleSaveErrorMessage,
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'role_name', ascending: true },
    ],
  });

  return (
    <SettingsAccordionItem
      panel="internalAdminRoles"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-user-shield"
      title="Internal Admin Roles"
      counts={adminRoles.counts}
    >
      {activePanel === 'internalAdminRoles' ? <InternalAdminRolesSectionContent adminRoles={adminRoles} /> : null}
    </SettingsAccordionItem>
  );
}

function InternalAdminRolesSectionContent({
  adminRoles,
}: {
  adminRoles: ReturnType<typeof useSupabaseSettingsSection<AdminRoleRecord, AdminRoleForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      adminRoles.items.filter((item) =>
        matchesSearch(item, searchValue, ['role_name', 'role_code', 'description']),
      ),
    [adminRoles.items, searchValue],
  );

  function handleFieldChange<Field extends AdminRoleField>(field: Field, value: AdminRoleForm[Field]) {
    if (field !== 'role_name') {
      adminRoles.updateField(field, value);
      return;
    }

    const nextRoleName = String(value);
    const currentRoleCode = adminRoles.formValues.role_code.trim();
    const currentSuggestedCode = createRoleCode(adminRoles.formValues.role_name);
    const shouldSuggestCode =
      !adminRoles.editingId && (!currentRoleCode || currentRoleCode === currentSuggestedCode);

    adminRoles.updateField(field, value);

    if (shouldSuggestCode) {
      adminRoles.updateField('role_code', createRoleCode(nextRoleName));
    }
  }

  return (
    <SupabaseSettingsSection
      title="Internal Admin Roles"
      subtitle="Manage role labels used for internal admin accounts."
      searchPlaceholder="Search internal admin roles"
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      fields={[
        { key: 'role_name', label: 'Role Name', type: 'text', required: true, placeholder: 'Operations Admin' },
        { key: 'role_code', label: 'Role Code', type: 'text', required: true, placeholder: 'operations_admin' },
        { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
        { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional role description' },
      ]}
      formValues={adminRoles.formValues}
      onFieldChange={handleFieldChange}
      onSubmit={adminRoles.submit}
      onCancelEdit={adminRoles.resetForm}
      editingId={adminRoles.editingId}
      isSaving={adminRoles.isSaving}
      isLoading={adminRoles.isLoading}
      loadError={adminRoles.loadError}
      saveError={adminRoles.saveError}
      items={filteredItems}
      rowTemplateColumns="1.2fr 1fr 1.4fr 0.8fr 0.7fr auto"
      columns={[
        { label: 'Role', render: (item) => item.role_name },
        { label: 'Code', render: (item) => item.role_code },
        { label: 'Description', render: (item) => item.description || '-', className: sectionStyles.cellMuted },
        { label: 'Status', render: (item) => statusBadge(item.status) },
        { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
      ]}
      onEdit={adminRoles.startEdit}
      onToggleStatus={(item) => adminRoles.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
      onReorder={adminRoles.reorderItems}
      actionHeaderLabel="Action"
      emptyText="No internal admin roles found yet."
    />
  );
}
