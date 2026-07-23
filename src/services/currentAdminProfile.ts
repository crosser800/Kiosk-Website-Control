import { supabase } from '../lib/supabase';

export type AdminProfileStatus = 'Active' | 'Inactive' | 'Blocked';

export type CurrentAdminProfile = {
  id: string;
  authUserId: string;
  adminCode: string;
  fullName: string;
  email: string;
  profileImageUrl: string;
  position: string;
  department: string;
  contactNumber: string;
  address: string;
  bio: string;
  legacyRole: string;
  roleLabel: string;
  status: AdminProfileStatus;
  notes: string;
  lastLoginAt: string;
  createdAt: string;
  updatedAt: string;
  isSystemOwner: boolean;
};

type AdminRow = {
  id: string;
  auth_user_id: string | null;
  admin_code: string | null;
  full_name: string | null;
  email: string | null;
  profile_image_url: string | null;
  position: string | null;
  department: string | null;
  contact_number: string | null;
  address: string | null;
  bio: string | null;
  role: string | null;
  status: string | null;
  notes: string | null;
  last_login_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  is_system_owner: boolean | null;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

export function formatRoleLabel(value: string | null | undefined) {
  const normalized = text(value);
  if (!normalized) return '';

  return normalized
    .replace(/[_-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeStatus(value: string | null | undefined): AdminProfileStatus {
  const normalized = text(value).toLowerCase();
  if (normalized === 'inactive') return 'Inactive';
  if (normalized === 'blocked') return 'Blocked';
  return 'Active';
}

function mapAdminRow(row: AdminRow, linkedRoleLabel: string): CurrentAdminProfile {
  const legacyRole = text(row.role);

  return {
    id: text(row.id),
    authUserId: text(row.auth_user_id),
    adminCode: text(row.admin_code),
    fullName: text(row.full_name),
    email: text(row.email),
    profileImageUrl: text(row.profile_image_url),
    position: text(row.position),
    department: text(row.department),
    contactNumber: text(row.contact_number),
    address: text(row.address),
    bio: text(row.bio),
    legacyRole,
    roleLabel: linkedRoleLabel || formatRoleLabel(legacyRole) || 'Admin',
    status: normalizeStatus(row.status),
    notes: text(row.notes),
    lastLoginAt: text(row.last_login_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    isSystemOwner: Boolean(row.is_system_owner),
  };
}

async function loadLinkedRoleLabel(adminId: string) {
  const { data, error } = await supabase
    .from('admin_account_roles')
    .select('admin_roles(role_name)')
    .eq('admin_account_id', adminId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return '';

  const roleRef = (data as { admin_roles?: { role_name?: string } | { role_name?: string }[] | null })
    .admin_roles;
  if (Array.isArray(roleRef)) {
    return formatRoleLabel(roleRef[0]?.role_name);
  }
  return formatRoleLabel(roleRef?.role_name);
}

export async function loadCurrentAdminProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error('Your admin session is no longer active.');
  }

  const { data, error } = await supabase
    .from('admin_accounts')
    .select(
      [
        'id',
        'auth_user_id',
        'admin_code',
        'full_name',
        'email',
        'profile_image_url',
        'position',
        'department',
        'contact_number',
        'address',
        'bio',
        'role',
        'status',
        'notes',
        'is_system_owner',
        'last_login_at',
        'created_at',
        'updated_at',
      ].join(', '),
    )
    .eq('auth_user_id', userData.user.id)
    .maybeSingle<AdminRow>();

  if (error) {
    throw new Error('Unable to load your admin profile.');
  }

  if (!data) {
    throw new Error('No admin profile was found for this session.');
  }

  const linkedRoleLabel = await loadLinkedRoleLabel(String(data.id));
  return mapAdminRow(data, linkedRoleLabel);
}
