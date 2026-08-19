import sectionStyles from './SupabaseSettingsSection.module.css';

export type SettingPanel =
  | 'appearance'
  | 'administration'
  | 'internalAdminRoles'
  | 'agentGroups'
  | 'branches'
  | 'preferenceTypes'
  | 'priceClasses'
  | 'deliveryTerms'
  | 'categories'
  | 'brands';

export type StatusValue = 'Active' | 'Inactive';
export type BrandType = 'Own' | 'Partner' | 'Supplier' | 'Other';

export type CountableItem = {
  status?: string | null;
};

export const STATUS_OPTIONS = [
  { label: 'Active', value: 'Active' },
  { label: 'Inactive', value: 'Inactive' },
];

export const BRAND_TYPE_OPTIONS = [
  { label: 'Own', value: 'Own' },
  { label: 'Partner', value: 'Partner' },
  { label: 'Supplier', value: 'Supplier' },
  { label: 'Other', value: 'Other' },
];

export function toNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function createSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function normalizeStatus(value: unknown): StatusValue {
  return String(value ?? '').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
}

export function getCounts(items: CountableItem[]) {
  return {
    total: items.length,
    active: items.filter((item) => String(item.status ?? '').toLowerCase() === 'active').length,
    inactive: items.filter((item) => String(item.status ?? '').toLowerCase() === 'inactive').length,
  };
}

export function statusBadge(status: string) {
  return (
    <span
      className={`${sectionStyles.statusBadge} ${
        String(status).toLowerCase() === 'inactive'
          ? sectionStyles.statusInactive
          : sectionStyles.statusActive
      }`}
    >
      {status}
    </span>
  );
}

export function sortOrderBadge(position: number) {
  return (
    <span className={sectionStyles.sortOrderBadge}>
      <i className={`fa-solid fa-grip-vertical ${sectionStyles.sortOrderHandle}`} aria-hidden="true"></i>
      <span>#{position}</span>
    </span>
  );
}

export function matchesSearch(record: Record<string, unknown>, searchValue: string, keys: string[]) {
  const normalizedSearch = searchValue.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return keys.some((key) => String(record[key] ?? '').toLowerCase().includes(normalizedSearch));
}
