import { useEffect, useState } from 'react';
import Skeleton from '../common/Skeleton';
import SettingsFormModal from './SettingsFormModal';
import styles from './SupabaseSettingsSection.module.css';

type FieldOption = {
  label: string;
  value: string;
};

type FieldDefinition = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
  placeholder?: string;
  required?: boolean;
  options?: FieldOption[];
  wide?: boolean;
  min?: number;
  step?: number;
};

type ColumnDefinition<TRecord> = {
  label: string;
  render: (record: TRecord) => React.ReactNode;
  className?: string;
};

type SupabaseSettingsSectionProps<
  TRecord extends { id: string; status?: string | null },
  TForm extends Record<string, unknown>,
> = {
  title: string;
  subtitle: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  fields: FieldDefinition[];
  formValues: TForm;
  onFieldChange: <Field extends keyof TForm>(field: Field, value: TForm[Field]) => void;
  onSubmit: () => void | Promise<unknown>;
  onCancelEdit: () => void;
  editingId: string | null;
  isSaving: boolean;
  isLoading: boolean;
  loadError: string;
  saveError: string;
  items: TRecord[];
  columns: ColumnDefinition<TRecord>[];
  rowTemplateColumns: string;
  onEdit: (item: TRecord) => void;
  onToggleStatus?: (item: TRecord) => void | Promise<unknown>;
  actionHeaderLabel?: string;
  emptyText: string;
  onReorder?: (orderedIds: string[]) => void | Promise<unknown>;
  renderForm?: () => React.ReactNode;
};

export default function SupabaseSettingsSection<
  TRecord extends { id: string; status?: string | null },
  TForm extends Record<string, unknown>,
>({
  title,
  subtitle,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  fields,
  formValues,
  onFieldChange,
  onSubmit,
  onCancelEdit,
  editingId,
  isSaving,
  isLoading,
  loadError,
  saveError,
  items,
  columns,
  rowTemplateColumns,
  onEdit,
  onToggleStatus,
  actionHeaderLabel = 'Actions',
  emptyText,
  onReorder,
  renderForm,
}: SupabaseSettingsSectionProps<TRecord, TForm>) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    if (editingId) {
      setIsModalOpen(true);
    }
  }, [editingId]);

  function handleOpenCreate() {
    onCancelEdit();
    setIsModalOpen(true);
  }

  function handleCloseModal() {
    onCancelEdit();
    setIsModalOpen(false);
  }

  async function handleSubmit() {
    const result = await onSubmit();
    if (result !== false) {
      setIsModalOpen(false);
    }
  }

  const canReorder = Boolean(onReorder) && !searchValue.trim() && items.length > 1 && !isLoading && !isSaving;

  function resetDragState() {
    setDraggingId(null);
    setDragOverId(null);
  }

  function handleDragStart(itemId: string) {
    if (!canReorder) {
      return;
    }

    setDraggingId(itemId);
    setDragOverId(itemId);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>, itemId: string) {
    if (!canReorder || !draggingId) {
      return;
    }

    event.preventDefault();

    if (dragOverId !== itemId) {
      setDragOverId(itemId);
    }
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>, itemId: string) {
    event.preventDefault();

    if (!canReorder || !draggingId || !onReorder) {
      resetDragState();
      return;
    }

    const currentIndex = items.findIndex((item) => item.id === draggingId);
    const targetIndex = items.findIndex((item) => item.id === itemId);

    if (currentIndex < 0 || targetIndex < 0 || currentIndex === targetIndex) {
      resetDragState();
      return;
    }

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(currentIndex, 1);
    nextItems.splice(targetIndex, 0, movedItem);

    await onReorder(nextItems.map((item) => item.id));
    resetDragState();
  }

  function renderFields() {
    return (
      <div className={styles.form}>
        {fields.map((field) => {
          const value = formValues[field.key];
          const fieldClassName = `${styles.field} ${field.wide ? styles.fieldWide : ''}`.trim();

          if (field.type === 'checkbox') {
            return (
              <label key={field.key} className={`${fieldClassName} ${styles.checkboxField}`}>
                <span className={styles.label}>{field.label}</span>
                <span className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => onFieldChange(field.key as keyof TForm, event.target.checked as TForm[keyof TForm])}
                    className={styles.checkbox}
                  />
                  <span>{Boolean(value) ? 'Enabled' : 'Disabled'}</span>
                </span>
              </label>
            );
          }

          return (
            <label key={field.key} className={fieldClassName}>
              <span className={styles.label}>
                {field.label}
                {field.required ? '*' : ''}
              </span>

              {field.type === 'textarea' ? (
                <textarea
                  value={String(value ?? '')}
                  onChange={(event) => onFieldChange(field.key as keyof TForm, event.target.value as TForm[keyof TForm])}
                  placeholder={field.placeholder}
                  className={styles.textarea}
                />
              ) : field.type === 'select' ? (
                <select
                  value={String(value ?? '')}
                  onChange={(event) => onFieldChange(field.key as keyof TForm, event.target.value as TForm[keyof TForm])}
                  className={`${styles.input} ${styles.select}`}
                >
                  <option value="">Select {field.label.toLowerCase()}</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type}
                  min={field.min}
                  step={field.step}
                  value={String(value ?? '')}
                  onChange={(event) => onFieldChange(field.key as keyof TForm, event.target.value as TForm[keyof TForm])}
                  placeholder={field.placeholder}
                  className={styles.input}
                />
              )}
            </label>
          );
        })}
      </div>
    );
  }

  function renderLoadingState() {
    const actionSkeletonCount = onToggleStatus ? 2 : 1;

    return (
      <div className={styles.tableWrap}>
        <div className={styles.tableHeader} style={{ gridTemplateColumns: rowTemplateColumns }}>
          {columns.map((column) => (
            <span key={column.label} className={styles.headerCell}>
              {column.label}
            </span>
          ))}
          <span className={styles.headerCell}>{actionHeaderLabel}</span>
        </div>

        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`settings-skeleton-${index}`}
            className={styles.tableRow}
            style={{ gridTemplateColumns: rowTemplateColumns }}
          >
            {columns.map((column, columnIndex) => (
              <Skeleton
                key={`${column.label}-${columnIndex}`}
                className={styles.rowSkeleton}
                height="1rem"
              />
            ))}
            <div className={styles.rowActions}>
              {Array.from({ length: actionSkeletonCount }).map((_, actionIndex) => (
                <Skeleton
                  key={`action-skeleton-${actionIndex}`}
                  className={styles.actionSkeleton}
                  height="2.35rem"
                  width={actionIndex === 0 ? '5.25rem' : '6.5rem'}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby={`${title}-title`}>
      <div className={styles.header}>
        <div>
          <h2 id={`${title}-title`} className={styles.title}>
            {title}
          </h2>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        <label className={styles.searchWrap}>
          <input
            type="text"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            className={styles.searchInput}
          />
        </label>
      </div>

      <div className={styles.toolbar}>
        <button type="button" className={styles.primaryButton} onClick={handleOpenCreate}>
          Add Record
        </button>
        {onReorder ? (
          <p className={styles.reorderHint}>
            {searchValue.trim()
              ? 'Clear search to drag and reorder items.'
              : 'Drag rows to reorder. Sort numbers update automatically.'}
          </p>
        ) : null}
      </div>

      <div className={styles.message}>
        {saveError ? <p className={styles.error}>{saveError}</p> : null}
        {!saveError && loadError ? <p className={styles.error}>{loadError}</p> : null}
      </div>

      {isLoading ? (
        renderLoadingState()
      ) : items.length === 0 ? (
        <p className={styles.empty}>{emptyText}</p>
      ) : (
        <div className={styles.tableWrap}>
          <div className={styles.tableHeader} style={{ gridTemplateColumns: rowTemplateColumns }}>
            {columns.map((column) => (
              <span key={column.label} className={styles.headerCell}>
                {column.label}
              </span>
            ))}
            <span className={styles.headerCell}>{actionHeaderLabel}</span>
          </div>

          {items.map((item) => {
            const isInactive = String(item.status ?? '').toLowerCase() === 'inactive';

            return (
              <div
                key={item.id}
                className={`${styles.tableRow} ${
                  canReorder ? styles.tableRowDraggable : ''
                } ${draggingId === item.id ? styles.tableRowDragging : ''} ${
                  dragOverId === item.id && draggingId !== item.id ? styles.tableRowDragOver : ''
                }`.trim()}
                style={{ gridTemplateColumns: rowTemplateColumns }}
                draggable={canReorder}
                onDragStart={() => handleDragStart(item.id)}
                onDragOver={(event) => handleDragOver(event, item.id)}
                onDrop={(event) => void handleDrop(event, item.id)}
                onDragEnd={resetDragState}
              >
                {columns.map((column, index) => (
                  <span
                    key={`${item.id}-${column.label}-${index}`}
                    className={`${styles.cell} ${column.className ?? ''}`.trim()}
                  >
                    {column.render(item)}
                  </span>
                ))}

                <div className={styles.rowActions}>
                  <button type="button" className={styles.rowAction} onClick={() => onEdit(item)}>
                    Edit
                  </button>
                  {onToggleStatus ? (
                    <button type="button" className={styles.rowAction} onClick={() => void onToggleStatus(item)}>
                      {isInactive ? 'Activate' : 'Deactivate'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isModalOpen ? (
        <SettingsFormModal
          isOpen={isModalOpen}
          title={editingId ? `Edit ${title}` : `Add ${title}`}
          subtitle={`Use this form to ${editingId ? 'update' : 'create'} a record.`}
          primaryLabel={editingId ? 'Save Changes' : 'Add Record'}
          isSubmitting={isSaving}
          onClose={handleCloseModal}
          onSubmit={handleSubmit}
        >
          {renderForm ? renderForm() : renderFields()}
        </SettingsFormModal>
      ) : null}
    </section>
  );
}
