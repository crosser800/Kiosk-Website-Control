import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';

type OrderBy = {
  column: string;
  ascending?: boolean;
};

type SaveContext<TForm extends Record<string, unknown>> = {
  editingId: string | null;
  form: TForm;
};

type PreparedPayload = {
  payload?: Record<string, unknown>;
  afterSave?: () => Promise<void> | void;
  onError?: () => Promise<void> | void;
};

type UseSupabaseSettingsSectionOptions<
  TRecord extends { id: string },
  TForm extends Record<string, unknown>,
> = {
  enabled?: boolean;
  table: string;
  selectQuery: string;
  emptyForm: TForm;
  mapRow: (row: any) => TRecord;
  mapRecordToForm: (record: TRecord) => TForm;
  mapFormToPayload: (form: TForm) => Record<string, unknown>;
  validate?: (form: TForm, items: TRecord[], editingId: string | null) => string | null;
  beforeSave?: (context: SaveContext<TForm>) => Promise<void>;
  preparePayload?: (context: SaveContext<TForm> & { items: TRecord[] }) => Promise<PreparedPayload | void>;
  getSaveErrorMessage?: (error: unknown) => string;
  orderBy?: OrderBy[];
  statusColumn?: string;
  sortOrderColumn?: string | null;
};

export default function useSupabaseSettingsSection<
  TRecord extends { id: string },
  TForm extends Record<string, unknown>,
>({
  enabled = true,
  table,
  selectQuery,
  emptyForm,
  mapRow,
  mapRecordToForm,
  mapFormToPayload,
  validate,
  beforeSave,
  preparePayload,
  getSaveErrorMessage,
  orderBy = [],
  statusColumn = 'status',
  sortOrderColumn = 'sort_order',
}: UseSupabaseSettingsSectionOptions<TRecord, TForm>) {
  const [items, setItems] = useState<TRecord[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<TForm>(emptyForm);
  const hasLoadedRef = useRef(false);
  const emptyFormRef = useRef(emptyForm);
  const mapRowRef = useRef(mapRow);
  const mapRecordToFormRef = useRef(mapRecordToForm);
  const mapFormToPayloadRef = useRef(mapFormToPayload);
  const validateRef = useRef(validate);
  const beforeSaveRef = useRef(beforeSave);
  const preparePayloadRef = useRef(preparePayload);
  const getSaveErrorMessageRef = useRef(getSaveErrorMessage);
  const orderByRef = useRef(orderBy);
  const sortOrderColumnRef = useRef(sortOrderColumn);

  useEffect(() => {
    emptyFormRef.current = emptyForm;
  }, [emptyForm]);

  useEffect(() => {
    mapRowRef.current = mapRow;
  }, [mapRow]);

  useEffect(() => {
    mapRecordToFormRef.current = mapRecordToForm;
  }, [mapRecordToForm]);

  useEffect(() => {
    mapFormToPayloadRef.current = mapFormToPayload;
  }, [mapFormToPayload]);

  useEffect(() => {
    validateRef.current = validate;
  }, [validate]);

  useEffect(() => {
    beforeSaveRef.current = beforeSave;
  }, [beforeSave]);

  useEffect(() => {
    preparePayloadRef.current = preparePayload;
  }, [preparePayload]);

  useEffect(() => {
    getSaveErrorMessageRef.current = getSaveErrorMessage;
  }, [getSaveErrorMessage]);

  useEffect(() => {
    orderByRef.current = orderBy;
  }, [orderBy]);

  useEffect(() => {
    sortOrderColumnRef.current = sortOrderColumn;
  }, [sortOrderColumn]);

  const loadItems = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setIsLoading(true);
    setLoadError('');

    let query = supabase.from(table).select(selectQuery);

    for (const rule of orderByRef.current) {
      query = query.order(rule.column, { ascending: rule.ascending ?? true });
    }

    const { data, error } = await query;

    if (error) {
      setLoadError(error.message);
      setItems([]);
      setIsLoading(false);
      return;
    }

    setItems((data ?? []).map(mapRowRef.current));
    hasLoadedRef.current = true;
    setIsLoading(false);
  }, [enabled, selectQuery, table]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (hasLoadedRef.current) {
      return;
    }

    void loadItems();
  }, [enabled, loadItems]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormValues(emptyFormRef.current);
    setSaveError('');
  }, []);

  const updateField = useCallback(<Field extends keyof TForm>(field: Field, value: TForm[Field]) => {
    setFormValues((current) => ({ ...current, [field]: value }));
    setSaveError('');
  }, []);

  const startEdit = useCallback((item: TRecord) => {
    setEditingId(item.id);
    setFormValues(mapRecordToFormRef.current(item));
    setSaveError('');
  }, []);

  const submit = useCallback(async () => {
    const validationError = validateRef.current?.(formValues, items, editingId) ?? null;

    if (validationError) {
      setSaveError(validationError);
      return false;
    }

    setIsSaving(true);
    setSaveError('');
    let preparedPayload: PreparedPayload | void = undefined;

    try {
      if (beforeSaveRef.current) {
        await beforeSaveRef.current({ editingId, form: formValues });
      }

      const payload = mapFormToPayloadRef.current(formValues);
      preparedPayload = await preparePayloadRef.current?.({
        editingId,
        form: formValues,
        items,
      });
      Object.assign(payload, preparedPayload?.payload ?? {});

      if (!editingId && sortOrderColumnRef.current) {
        const sortOrderKey = sortOrderColumnRef.current;
        const rawSortOrder = payload[sortOrderKey];
        const normalizedSortOrder = Number(rawSortOrder ?? 0);

        if (!Number.isFinite(normalizedSortOrder) || normalizedSortOrder <= 0) {
          payload[sortOrderKey] = items.length + 1;
        }
      }

      if (editingId) {
        const { error } = await supabase.from(table).update(payload).eq('id', editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from(table).insert(payload);
        if (error) throw error;
      }

      if (preparedPayload?.afterSave) {
        await preparedPayload.afterSave();
      }

      await loadItems();
      resetForm();
      setIsSaving(false);
      return true;
    } catch (error) {
      if (preparedPayload?.onError) {
        await preparedPayload.onError();
      }
      setSaveError(
        getSaveErrorMessageRef.current?.(error) ??
          (error instanceof Error ? error.message : 'Failed to save changes.'),
      );
      setIsSaving(false);
      return false;
    }
  }, [editingId, formValues, items, loadItems, resetForm, table]);

  const updateStatus = useCallback(async (itemId: string, nextStatus: string) => {
    if (!enabled) {
      return false;
    }

    setSaveError('');

    const { error } = await supabase
      .from(table)
      .update({ [statusColumn]: nextStatus })
      .eq('id', itemId);

    if (error) {
      setSaveError(error.message);
      return false;
    }

    await loadItems();
    return true;
  }, [enabled, loadItems, statusColumn, table]);

  const reorderItems = useCallback(async (orderedIds: string[]) => {
    if (!enabled) {
      return false;
    }

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const remainingItems = items.filter((item) => !orderedIds.includes(item.id));
    const reorderedItems = [
      ...orderedIds.map((id) => itemMap.get(id)).filter((item): item is TRecord => Boolean(item)),
      ...remainingItems,
    ];

    if (reorderedItems.length === 0) {
      return false;
    }

    const previousItems = items;
    if (!sortOrderColumnRef.current) {
      return false;
    }

    const sortOrderKey = sortOrderColumnRef.current;

    const nextItems = reorderedItems.map((item, index) => ({
      ...item,
      [sortOrderKey]: index + 1,
    })) as TRecord[];

    setItems(nextItems);
    setIsSaving(true);
    setSaveError('');

    try {
      const results = await Promise.all(
        nextItems.map((item, index) =>
          supabase
            .from(table)
            .update({ [sortOrderKey]: index + 1 })
            .eq('id', item.id),
        ),
      );

      const failedResult = results.find((result) => result.error);
      if (failedResult?.error) {
        throw failedResult.error;
      }

      await loadItems();
      setIsSaving(false);
      return true;
    } catch (error) {
      setItems(previousItems);
      setSaveError(error instanceof Error ? error.message : 'Failed to reorder items.');
      setIsSaving(false);
      return false;
    }
  }, [enabled, items, loadItems, table]);

  const counts = useMemo(() => {
    const active = items.filter((item) => String((item as Record<string, unknown>).status ?? '').toLowerCase() === 'active').length;
    const inactive = items.filter((item) => String((item as Record<string, unknown>).status ?? '').toLowerCase() === 'inactive').length;

    return {
      total: items.length,
      active,
      inactive,
    };
  }, [items]);

  return {
    items,
    counts,
    isLoading,
    loadError,
    saveError,
    isSaving,
    editingId,
    formValues,
    updateField,
    startEdit,
    resetForm,
    submit,
    updateStatus,
    reorderItems,
  };
}
