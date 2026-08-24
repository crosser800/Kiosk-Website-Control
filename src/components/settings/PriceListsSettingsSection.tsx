import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  notifyPriceListsChanged,
  PRICE_LIST_BUCKET,
  type PriceListRecord,
} from '../../services/priceLists';
import SupabaseSettingsSection from './SupabaseSettingsSection';
import SettingsAccordionItem from './SettingsAccordionItem';
import useSupabaseSettingsSection from './useSupabaseSettingsSection';
import sectionStyles from './SupabaseSettingsSection.module.css';
import {
  STATUS_OPTIONS,
  matchesSearch,
  normalizeStatus,
  statusBadge,
  type SettingPanel,
  type StatusValue,
} from './settingsShared';

type PriceListForm = {
  name: string;
  status: StatusValue;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

function safeFileName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '');
}

export default function PriceListsSettingsSection({ activePanel, onToggle }: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [searchValue, setSearchValue] = useState('');

  const priceLists = useSupabaseSettingsSection<PriceListRecord, PriceListForm>({
    enabled: activePanel === 'priceLists',
    table: 'price_lists',
    selectQuery: 'id, name, file_path, file_url, status, created_at',
    emptyForm: { name: '', status: 'Active' },
    mapRow: (row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      filePath: String(row.file_path ?? ''),
      fileUrl: String(row.file_url ?? ''),
      status: normalizeStatus(row.status),
      createdAt: String(row.created_at ?? ''),
    }),
    mapRecordToForm: (record) => ({ name: record.name, status: record.status }),
    mapFormToPayload: (form) => ({
      name: form.name.trim(),
      status: form.status.toLowerCase(),
      updated_at: new Date().toISOString(),
    }),
    validate: (form, _items, editingId) => {
      if (!form.name.trim()) return 'Price list name is required.';
      if (!editingId && !selectedFile) return 'Select a PDF file to upload.';
      if (selectedFile && selectedFile.type !== 'application/pdf') return 'Only PDF files are allowed.';
      if (selectedFile && selectedFile.size > 20 * 1024 * 1024) return 'PDF file must be 20 MB or smaller.';
      return null;
    },
    preparePayload: async ({ editingId, items }) => {
      if (!selectedFile) return;

      const storagePath = `${crypto.randomUUID()}-${safeFileName(selectedFile.name) || 'price-list.pdf'}`;
      const { error: uploadError } = await supabase.storage
        .from(PRICE_LIST_BUCKET)
        .upload(storagePath, selectedFile, { contentType: 'application/pdf' });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(PRICE_LIST_BUCKET).getPublicUrl(storagePath);
      const previousPath = editingId ? items.find((item) => item.id === editingId)?.filePath : '';

      return {
        payload: { file_path: storagePath, file_url: data.publicUrl },
        afterSave: async () => {
          if (previousPath) await supabase.storage.from(PRICE_LIST_BUCKET).remove([previousPath]);
        },
        onError: async () => {
          await supabase.storage.from(PRICE_LIST_BUCKET).remove([storagePath]);
        },
      };
    },
    orderBy: [{ column: 'created_at', ascending: false }],
    sortOrderColumn: null,
  });

  const visibleItems = useMemo(
    () => priceLists.items.filter((item) => matchesSearch(item, searchValue, ['name', 'status'])),
    [priceLists.items, searchValue],
  );

  const resetForm = () => {
    setSelectedFile(null);
    priceLists.resetForm();
  };

  const submit = async () => {
    const result = await priceLists.submit();
    if (result !== false) {
      setSelectedFile(null);
      notifyPriceListsChanged();
    }
    return result;
  };

  const toggleStatus = async (item: PriceListRecord) => {
    const changed = await priceLists.updateStatus(
      item.id,
      item.status === 'Active' ? 'inactive' : 'active',
    );
    if (changed) notifyPriceListsChanged();
  };

  return (
    <SettingsAccordionItem
      panel="priceLists"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-file-pdf"
      title="Price Lists"
      counts={priceLists.counts}
    >
      {activePanel === 'priceLists' ? (
        <SupabaseSettingsSection
          title="Price Lists"
          subtitle="Upload PDF price lists and control which ones appear in Quick Actions."
          searchPlaceholder="Search price lists"
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          createButtonLabel="Add Price List"
          fields={[]}
          formValues={priceLists.formValues}
          onFieldChange={priceLists.updateField}
          onSubmit={submit}
          onCancelEdit={resetForm}
          editingId={priceLists.editingId}
          isSaving={priceLists.isSaving}
          isLoading={priceLists.isLoading}
          loadError={priceLists.loadError}
          saveError={priceLists.saveError}
          items={visibleItems}
          rowTemplateColumns="1.5fr 1fr 0.8fr auto"
          columns={[
            { label: 'Price List', render: (item) => item.name },
            {
              label: 'PDF File',
              render: (item) => (
                <a href={item.fileUrl} target="_blank" rel="noreferrer" className={sectionStyles.rowAction}>
                  View PDF
                </a>
              ),
            },
            { label: 'Status', render: (item) => statusBadge(item.status) },
          ]}
          onEdit={(item) => {
            setSelectedFile(null);
            priceLists.startEdit(item);
          }}
          onToggleStatus={toggleStatus}
          emptyText="No price lists found."
          renderForm={() => (
            <div className={sectionStyles.form}>
              <label className={sectionStyles.field}>
                <span className={sectionStyles.label}>Price List Name*</span>
                <input
                  className={sectionStyles.input}
                  value={priceLists.formValues.name}
                  onChange={(event) => priceLists.updateField('name', event.target.value)}
                  placeholder="Wholesale Price List 2026"
                />
              </label>
              <label className={sectionStyles.field}>
                <span className={sectionStyles.label}>
                  PDF File{priceLists.editingId ? ' (leave empty to keep current)' : '*'}
                </span>
                <input
                  className={sectionStyles.fileInput}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <label className={sectionStyles.field}>
                <span className={sectionStyles.label}>Status*</span>
                <select
                  className={`${sectionStyles.input} ${sectionStyles.select}`}
                  value={priceLists.formValues.status}
                  onChange={(event) => priceLists.updateField('status', event.target.value as StatusValue)}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </div>
          )}
        />
      ) : null}
    </SettingsAccordionItem>
  );
}
