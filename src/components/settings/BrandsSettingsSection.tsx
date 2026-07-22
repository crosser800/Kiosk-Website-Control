import { useMemo, useState } from 'react';
import SupabaseSettingsSection from './SupabaseSettingsSection';
import sectionStyles from './SupabaseSettingsSection.module.css';
import SettingsAccordionItem from './SettingsAccordionItem';
import useSupabaseSettingsSection from './useSupabaseSettingsSection';
import {
  BRAND_TYPE_OPTIONS,
  STATUS_OPTIONS,
  createSlug,
  matchesSearch,
  normalizeStatus,
  sortOrderBadge,
  statusBadge,
  toNumber,
  type BrandType,
  type SettingPanel,
  type StatusValue,
} from './settingsShared';

type BrandRecord = {
  id: string;
  brand_name: string;
  brand_slug: string;
  brand_type: BrandType;
  description: string;
  logo_url: string;
  logo_path: string;
  status: StatusValue;
  sort_order: number;
};

type BrandForm = {
  brand_name: string;
  brand_slug: string;
  brand_type: BrandType;
  description: string;
  logo_url: string;
  logo_path: string;
  status: StatusValue;
  sort_order: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

export default function BrandsSettingsSection({ activePanel, onToggle }: Props) {
  const brands = useSupabaseSettingsSection<BrandRecord, BrandForm>({
    table: 'brands',
    selectQuery:
      'id, brand_name, brand_slug, brand_type, description, logo_url, logo_path, status, sort_order, created_at, updated_at',
    emptyForm: {
      brand_name: '',
      brand_slug: '',
      brand_type: 'Own',
      description: '',
      logo_url: '',
      logo_path: '',
      status: 'Active',
      sort_order: '0',
    },
    mapRow: (row) => ({
      id: String(row.id),
      brand_name: String(row.brand_name ?? ''),
      brand_slug: String(row.brand_slug ?? ''),
      brand_type: (String(row.brand_type ?? 'Own') as BrandType) || 'Own',
      description: String(row.description ?? ''),
      logo_url: String(row.logo_url ?? ''),
      logo_path: String(row.logo_path ?? ''),
      status: normalizeStatus(row.status),
      sort_order: toNumber(row.sort_order),
    }),
    mapRecordToForm: (record) => ({
      brand_name: record.brand_name,
      brand_slug: record.brand_slug,
      brand_type: record.brand_type,
      description: record.description,
      logo_url: record.logo_url,
      logo_path: record.logo_path,
      status: record.status,
      sort_order: String(record.sort_order),
    }),
    mapFormToPayload: (form) => ({
      brand_name: form.brand_name.trim(),
      brand_slug: (form.brand_slug.trim() || createSlug(form.brand_name.trim())) || null,
      brand_type: form.brand_type,
      description: form.description.trim() || null,
      logo_url: form.logo_url.trim() || null,
      logo_path: form.logo_path.trim() || null,
      status: form.status,
      sort_order: toNumber(form.sort_order),
    }),
    validate: (form, items, editingId) => {
      if (!form.brand_name.trim()) {
        return 'Brand name is required.';
      }

      const slug = form.brand_slug.trim() || createSlug(form.brand_name.trim());
      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          (item.brand_name.toLowerCase() === form.brand_name.trim().toLowerCase() ||
            item.brand_slug.toLowerCase() === slug.toLowerCase()),
      );

      return duplicate ? 'Brand name or slug already exists.' : null;
    },
    orderBy: [
      { column: 'sort_order', ascending: true },
      { column: 'brand_name', ascending: true },
    ],
  });

  return (
    <SettingsAccordionItem
      panel="brands"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-copyright"
      title="Brands"
      counts={brands.counts}
    >
      {activePanel === 'brands' ? <BrandsSectionContent brands={brands} /> : null}
    </SettingsAccordionItem>
  );
}

function BrandsSectionContent({
  brands,
}: {
  brands: ReturnType<typeof useSupabaseSettingsSection<BrandRecord, BrandForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');

  const filteredItems = useMemo(
    () =>
      brands.items.filter((item) =>
        matchesSearch(item, searchValue, ['brand_name', 'brand_slug', 'brand_type', 'description', 'status']),
      ),
    [brands.items, searchValue],
  );

  return (
    <>
      <SupabaseSettingsSection
        title="Brands"
        subtitle="Manage the brands used by products.brand_id."
        searchPlaceholder="Search brands"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'brand_name', label: 'Brand name', type: 'text', required: true, placeholder: 'BestBuilt' },
          { key: 'brand_slug', label: 'Brand slug', type: 'text', placeholder: 'Auto-generated if empty' },
          { key: 'brand_type', label: 'Brand type', type: 'select', options: BRAND_TYPE_OPTIONS, required: true },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          { key: 'logo_url', label: 'Logo URL', type: 'text', placeholder: 'https://...' },
          { key: 'logo_path', label: 'Logo path', type: 'text', placeholder: 'Optional storage path' },
          { key: 'description', label: 'Description', type: 'textarea', wide: true, placeholder: 'Optional brand description' },
        ]}
        formValues={brands.formValues}
        onFieldChange={brands.updateField}
        onSubmit={brands.submit}
        onCancelEdit={brands.resetForm}
        editingId={brands.editingId}
        isSaving={brands.isSaving}
        isLoading={brands.isLoading}
        loadError={brands.loadError}
        saveError={brands.saveError}
        items={filteredItems}
        rowTemplateColumns="1.1fr 1fr 0.9fr 1.3fr 0.8fr 0.7fr auto"
        columns={[
          { label: 'Brand', render: (item) => item.brand_name },
          { label: 'Slug', render: (item) => item.brand_slug || '-', className: sectionStyles.cellMuted },
          { label: 'Type', render: (item) => item.brand_type },
          { label: 'Description', render: (item) => item.description || '-', className: sectionStyles.cellMuted },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          { label: 'Sort', render: (item) => sortOrderBadge(item.sort_order) },
        ]}
        onEdit={brands.startEdit}
        onToggleStatus={(item) => brands.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
        onReorder={brands.reorderItems}
        emptyText="No brands found yet."
      />
    </>
  );
}
