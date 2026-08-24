import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import SettingsFormModal from './SettingsFormModal';
import SupabaseSettingsSection from './SupabaseSettingsSection';
import sectionStyles from './SupabaseSettingsSection.module.css';
import SettingsAccordionItem from './SettingsAccordionItem';
import useSupabaseSettingsSection from './useSupabaseSettingsSection';
import {
  STATUS_OPTIONS,
  matchesSearch,
  normalizeStatus,
  statusBadge,
  toNumber,
  type SettingPanel,
  type StatusValue,
} from './settingsShared';

type GiftCheckRecord = {
  id: string;
  gift_check_code: string;
  name: string;
  description: string;
  amount: number;
  status: StatusValue;
  validity_days: number | null;
  notes: string;
};

type GiftCheckForm = {
  gift_check_code: string;
  name: string;
  description: string;
  amount: string;
  status: StatusValue;
  validity_days: string;
  notes: string;
};

type Feedback = {
  type: 'success' | 'error';
  message: string;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

const pesoFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatPeso(value: number) {
  return pesoFormatter.format(value).replace('PHP', '\u20b1').trim();
}

function parseOptionalPositiveInteger(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : Number.NaN;
}

function getGiftCheckSaveErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (
    message.toLowerCase().includes('duplicate') ||
    message.toLowerCase().includes('gift_check_code') ||
    message.includes('23505')
  ) {
    return 'Gift Check code already exists.';
  }

  return message || 'Failed to save Gift Check.';
}

export default function GiftChecksSettingsSection({ activePanel, onToggle }: Props) {
  const giftChecks = useSupabaseSettingsSection<GiftCheckRecord, GiftCheckForm>({
    table: 'gift_checks',
    selectQuery:
      'id, gift_check_code, name, description, amount, status, validity_days, notes, created_at, updated_at',
    emptyForm: {
      gift_check_code: '',
      name: '',
      description: '',
      amount: '',
      status: 'Active',
      validity_days: '',
      notes: '',
    },
    mapRow: (row) => ({
      id: String(row.id),
      gift_check_code: String(row.gift_check_code ?? ''),
      name: String(row.name ?? ''),
      description: String(row.description ?? ''),
      amount: toNumber(row.amount),
      status: normalizeStatus(row.status),
      validity_days:
        row.validity_days === null || row.validity_days === undefined
          ? null
          : toNumber(row.validity_days),
      notes: String(row.notes ?? ''),
    }),
    mapRecordToForm: (record) => ({
      gift_check_code: record.gift_check_code,
      name: record.name,
      description: record.description,
      amount: String(record.amount || ''),
      status: record.status,
      validity_days: record.validity_days === null ? '' : String(record.validity_days),
      notes: record.notes,
    }),
    mapFormToPayload: (form) => ({
      gift_check_code: form.gift_check_code.trim(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      amount: Number(form.amount),
      status: form.status.toLowerCase(),
      validity_days: parseOptionalPositiveInteger(form.validity_days),
      notes: form.notes.trim() || null,
    }),
    validate: (form, items, editingId) => {
      const code = form.gift_check_code.trim();
      const name = form.name.trim();
      const amount = Number(form.amount);
      const validityDays = parseOptionalPositiveInteger(form.validity_days);

      if (!code) {
        return 'Gift Check code is required.';
      }

      if (!name) {
        return 'Gift Check name is required.';
      }

      if (!Number.isFinite(amount) || amount <= 0) {
        return 'Amount must be greater than 0.';
      }

      if (Number.isNaN(validityDays)) {
        return 'Validity days must be greater than 0 when provided.';
      }

      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          item.gift_check_code.trim().toLowerCase() === code.toLowerCase(),
      );

      return duplicate ? 'Gift Check code already exists.' : null;
    },
    preparePayload: async ({ editingId }) => {
      if (!editingId) {
        return;
      }

      return {
        payload: {
          updated_at: new Date().toISOString(),
        },
      };
    },
    getSaveErrorMessage: getGiftCheckSaveErrorMessage,
    orderBy: [{ column: 'amount', ascending: true }],
    sortOrderColumn: null,
  });

  return (
    <SettingsAccordionItem
      panel="giftChecks"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-ticket"
      title="Gift Checks"
      counts={giftChecks.counts}
    >
      {activePanel === 'giftChecks' ? <GiftChecksSectionContent giftChecks={giftChecks} /> : null}
    </SettingsAccordionItem>
  );
}

function GiftChecksSectionContent({
  giftChecks,
}: {
  giftChecks: ReturnType<typeof useSupabaseSettingsSection<GiftCheckRecord, GiftCheckForm>>;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<GiftCheckRecord | null>(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!feedback) {
      return;
    }

    const timeoutId = window.setTimeout(() => setFeedback(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [feedback]);

  const filteredItems = useMemo(
    () =>
      giftChecks.items.filter((item) =>
        matchesSearch(item, searchValue, [
          'gift_check_code',
          'name',
          'description',
          'status',
          'notes',
        ]),
      ),
    [giftChecks.items, searchValue],
  );

  async function submitGiftCheck() {
    const result = await giftChecks.submit();
    if (result !== false) {
      setFeedback({
        type: 'success',
        message: giftChecks.editingId ? 'Gift Check updated successfully.' : 'Gift Check created successfully.',
      });
    }

    return result;
  }

  async function toggleStatus(item: GiftCheckRecord) {
    const nextStatus = item.status === 'Active' ? 'Inactive' : 'Active';

    const { error } = await supabase
      .from('gift_checks')
      .update({ status: nextStatus.toLowerCase(), updated_at: new Date().toISOString() })
      .eq('id', item.id);

    if (error) {
      setFeedback({ type: 'error', message: error.message || 'Failed to update Gift Check status.' });
    } else {
      await giftChecks.loadItems();
      setFeedback({ type: 'success', message: `Gift Check ${nextStatus.toLowerCase()}d.` });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) {
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      const { error } = await supabase.from('gift_checks').delete().eq('id', deleteTarget.id);
      if (error) {
        throw error;
      }

      await giftChecks.loadItems();
      setDeleteTarget(null);
      setFeedback({ type: 'success', message: 'Gift Check deleted successfully.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete Gift Check.';
      setDeleteError(message);
      setFeedback({ type: 'error', message });
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <SupabaseSettingsSection
        title="Gift Checks"
        subtitle="Manage Gift Check master records for later promotion use."
        searchPlaceholder="Search gift checks"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        createButtonLabel="Add Gift Check"
        fields={[
          {
            key: 'gift_check_code',
            label: 'Gift Check Code',
            type: 'text',
            required: true,
            placeholder: 'GC-1500',
          },
          {
            key: 'name',
            label: 'Name',
            type: 'text',
            required: true,
            placeholder: '\u20b11,500 Gift Check',
          },
          {
            key: 'amount',
            label: 'Amount',
            type: 'number',
            required: true,
            min: 0.01,
            step: 0.01,
            placeholder: '1500.00',
          },
          {
            key: 'validity_days',
            label: 'Validity Days',
            type: 'number',
            min: 1,
            step: 1,
            placeholder: 'Leave blank if none',
          },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
          {
            key: 'description',
            label: 'Description',
            type: 'textarea',
            wide: true,
            placeholder: 'Optional Gift Check description',
          },
          {
            key: 'notes',
            label: 'Notes',
            type: 'textarea',
            wide: true,
            placeholder: 'Optional internal notes',
          },
        ]}
        formValues={giftChecks.formValues}
        onFieldChange={giftChecks.updateField}
        onSubmit={submitGiftCheck}
        onCancelEdit={giftChecks.resetForm}
        editingId={giftChecks.editingId}
        isSaving={giftChecks.isSaving}
        isLoading={giftChecks.isLoading}
        loadError={giftChecks.loadError}
        saveError={giftChecks.saveError}
        items={filteredItems}
        rowTemplateColumns="0.85fr 1.2fr 0.8fr 0.75fr 1.5fr auto"
        columns={[
          { label: 'Code', render: (item) => item.gift_check_code },
          { label: 'Gift Check', render: (item) => item.name },
          { label: 'Amount', render: (item) => formatPeso(item.amount) },
          { label: 'Status', render: (item) => statusBadge(item.status) },
          {
            label: 'Description',
            render: (item) => item.description || '-',
            className: sectionStyles.cellMuted,
          },
        ]}
        onEdit={giftChecks.startEdit}
        onToggleStatus={toggleStatus}
        emptyText="No Gift Checks found."
        renderExtraActions={(item) => (
          <button
            type="button"
            className={`${sectionStyles.rowAction} ${sectionStyles.dangerRowAction}`}
            onClick={() => {
              setDeleteError('');
              setDeleteTarget(item);
            }}
          >
            Delete
          </button>
        )}
      />

      {deleteTarget ? (
        <SettingsFormModal
          isOpen
          title="Delete Gift Check"
          subtitle={`Are you sure you want to delete ${deleteTarget.name}?`}
          primaryLabel={isDeleting ? 'Deleting...' : 'Delete'}
          isSubmitting={isDeleting}
          onClose={() => {
            if (!isDeleting) {
              setDeleteTarget(null);
              setDeleteError('');
            }
          }}
          onSubmit={confirmDelete}
        >
          {deleteError ? <p className={sectionStyles.error}>{deleteError}</p> : null}
          <p className={sectionStyles.empty}>
            This only removes the Gift Check master record. Referenced records will be protected by the database.
          </p>
        </SettingsFormModal>
      ) : null}

      {feedback ? (
        <div
          className={`${sectionStyles.settingsSnackbar} ${
            feedback.type === 'success'
              ? sectionStyles.settingsSnackbarSuccess
              : sectionStyles.settingsSnackbarError
          }`}
          role="status"
        >
          {feedback.message}
        </div>
      ) : null}
    </>
  );
}
