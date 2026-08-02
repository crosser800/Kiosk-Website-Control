import { useMemo, useState } from 'react';
import SupabaseSettingsSection from './SupabaseSettingsSection';
import sectionStyles from './SupabaseSettingsSection.module.css';
import SettingsAccordionItem from './SettingsAccordionItem';
import useSupabaseSettingsSection from './useSupabaseSettingsSection';
import {
  matchesSearch,
  statusBadge,
  type SettingPanel,
} from './settingsShared';

type GatewayStatus = 'Active' | 'Inactive' | 'Blocked';

type GatewayAdminRecord = {
  id: string;
  admin_code: string;
  full_name: string;
  email: string;
  profile_image_url: string;
  position: string;
  department: string;
  contact_number: string;
  address: string;
  bio: string;
  role: string;
  status: GatewayStatus;
  is_system_owner: boolean;
  auth_user_id: string;
  last_login_at: string;
  created_at: string;
};

type GatewayAdminForm = {
  admin_code: string;
  full_name: string;
  profile_image_url: string;
  position: string;
  department: string;
  contact_number: string;
  address: string;
  bio: string;
  status: GatewayStatus;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

const STATUS_OPTIONS = [
  { label: 'Active', value: 'Active' },
  { label: 'Inactive', value: 'Inactive' },
  { label: 'Blocked', value: 'Blocked' },
];

function normalizeGatewayStatus(value: unknown): GatewayStatus {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'blocked') return 'Blocked';
  return 'Active';
}

function formatDateTime(value: string) {
  if (!value) return '-';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '-' : parsed.toLocaleString('en-PH');
}

function ProtectedIndicator({ isProtected }: { isProtected: boolean }) {
  return isProtected ? (
    <span className={sectionStyles.statusBadge}>
      <i className="fa-solid fa-shield-halved" aria-hidden="true"></i>
      Protected
    </span>
  ) : (
    <span className={sectionStyles.cellMuted}>Standard</span>
  );
}

export default function AdministrationSettingsSection({ activePanel, onToggle }: Props) {
  const administration = useSupabaseSettingsSection<GatewayAdminRecord, GatewayAdminForm>({
    table: 'admin_accounts',
    selectQuery:
      'id, auth_user_id, admin_code, full_name, email, profile_image_url, position, department, contact_number, address, bio, role, status, is_system_owner, last_login_at, created_at, updated_at',
    emptyForm: {
      admin_code: '',
      full_name: '',
      profile_image_url: '',
      position: '',
      department: '',
      contact_number: '',
      address: '',
      bio: '',
      status: 'Active',
    },
    mapRow: (row) => ({
      id: String(row.id),
      admin_code: String(row.admin_code ?? ''),
      full_name: String(row.full_name ?? ''),
      email: String(row.email ?? ''),
      profile_image_url: String(row.profile_image_url ?? ''),
      position: String(row.position ?? ''),
      department: String(row.department ?? ''),
      contact_number: String(row.contact_number ?? ''),
      address: String(row.address ?? ''),
      bio: String(row.bio ?? ''),
      role: String(row.role ?? ''),
      status: normalizeGatewayStatus(row.status),
      is_system_owner: Boolean(row.is_system_owner),
      auth_user_id: String(row.auth_user_id ?? ''),
      last_login_at: String(row.last_login_at ?? ''),
      created_at: String(row.created_at ?? ''),
    }),
    mapRecordToForm: (record) => ({
      admin_code: record.admin_code,
      full_name: record.full_name,
      profile_image_url: record.profile_image_url,
      position: record.position,
      department: record.department,
      contact_number: record.contact_number,
      address: record.address,
      bio: record.bio,
      status: record.status,
    }),
    mapFormToPayload: (form) => ({
      admin_code: form.admin_code.trim() || null,
      full_name: form.full_name.trim() || null,
      profile_image_url: form.profile_image_url.trim() || null,
      position: form.position.trim() || null,
      department: form.department.trim() || null,
      contact_number: form.contact_number.trim() || null,
      address: form.address.trim() || null,
      bio: form.bio.trim() || null,
      status: form.status,
    }),
    validate: (form) => (!form.full_name.trim() ? 'Full Name is required.' : null),
    orderBy: [{ column: 'created_at', ascending: false }],
    sortOrderColumn: null,
  });

  return (
    <SettingsAccordionItem
      panel="administration"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-user-lock"
      title="Administration"
      counts={administration.counts}
    >
      {activePanel === 'administration' ? <AdministrationSectionContent administration={administration} /> : null}
    </SettingsAccordionItem>
  );
}

function AdministrationSectionContent({
  administration,
}: {
  administration: ReturnType<typeof useSupabaseSettingsSection<GatewayAdminRecord, GatewayAdminForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');
  const filteredItems = useMemo(
    () =>
      administration.items.filter((item) =>
        matchesSearch(item, searchValue, ['full_name', 'email', 'admin_code', 'position', 'department', 'status']),
      ),
    [administration.items, searchValue],
  );

  return (
    <SupabaseSettingsSection
      title="Administration"
      subtitle="View and manage main Supabase-authenticated gateway accounts."
      searchPlaceholder="Search gateway admins"
      searchValue={searchValue}
      onSearchChange={setSearchValue}
      fields={[
        { key: 'full_name', label: 'Full Name', type: 'text', required: true },
        { key: 'admin_code', label: 'Admin Code', type: 'text' },
        { key: 'position', label: 'Role / Position', type: 'text' },
        { key: 'department', label: 'Department', type: 'text' },
        { key: 'contact_number', label: 'Contact Number', type: 'text' },
        { key: 'profile_image_url', label: 'Profile Image URL', type: 'text' },
        { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
        { key: 'address', label: 'Address', type: 'textarea', wide: true },
        { key: 'bio', label: 'Bio', type: 'textarea', wide: true },
      ]}
      formValues={administration.formValues}
      onFieldChange={administration.updateField}
      onSubmit={administration.submit}
      onCancelEdit={administration.resetForm}
      editingId={administration.editingId}
      isSaving={administration.isSaving}
      isLoading={administration.isLoading}
      loadError={administration.loadError}
      saveError={administration.saveError}
      items={filteredItems}
      rowTemplateColumns="1fr 1.2fr 1.4fr 0.85fr 1fr 1fr 0.8fr 0.9fr 0.6fr"
      columns={[
        {
          label: 'Profile',
          render: (item) =>
            item.profile_image_url ? (
              <img src={item.profile_image_url} alt="" className={sectionStyles.imageThumb} />
            ) : (
              <span className={sectionStyles.cellMuted}>No image</span>
            ),
        },
        { label: 'Full Name', render: (item) => item.full_name || '-' },
        { label: 'Email', render: (item) => item.email || '-', className: sectionStyles.cellMuted },
        { label: 'Role', render: (item) => item.position || item.role || '-' },
        { label: 'Access Mode', render: (item) => (item.auth_user_id ? 'Supabase Auth' : 'Pending Setup') },
        { label: 'Protected', render: (item) => <ProtectedIndicator isProtected={item.is_system_owner} /> },
        { label: 'Status', render: (item) => statusBadge(item.status) },
        { label: 'Last Login', render: (item) => formatDateTime(item.last_login_at), className: sectionStyles.cellMuted },
      ]}
      onEdit={administration.startEdit}
      onToggleStatus={(item) => administration.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
      actionHeaderLabel="Action"
      emptyText="No gateway admin accounts found."
      canCreate={false}
    />
  );
}
