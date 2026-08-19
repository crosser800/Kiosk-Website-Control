import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './AddProduct.module.css';
import BasicInformation from './addProducts/BasicInformation';
import Media from './addProducts/Media';
import VarAndPrice from './addProducts/VarAndPrice';
import { supabase } from '../../lib/supabase';
import { normalizeDiscountKind } from './addProducts/discountLifecycle';
import { generatePackagingSummary, normalizePackagingUnitCode } from './addProducts/packagingParser';
import type {
  DiscountItem,
  MediaItem,
  ProductUnitAliasDefinition,
  ProductUnitDefinition,
  ProductFormState,
  SurchargeItem,
  VariationItem,
  VariationUnitOptionItem,
} from './addProducts/types';

type AddProductSection = 'Basic Information' | 'Images' | 'Variation & Pricing';

type AddProductProps = {
  onCancel: () => void;
  editProductId?: string | null;
  initialCategoryId?: string | null;
  onSaved?: (productId: string, categoryId: string) => void;
  layout?: 'standalone' | 'embedded';
  initialSection?: AddProductSection;
};

type OptionItem = { id: string; label: string };
type DiscountHistoryAction =
  | 'created'
  | 'updated'
  | 'classified'
  | 'activated'
  | 'deactivated'
  | 'scheduled';

type DiscountHistorySnapshot = {
  discount_id: string | null;
  product_id: string;
  discount_group: string | null;
  discount_name: string;
  discount_kind: string | null;
  discount_type: string;
  discount_percent: number | null;
  amount: number | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  stackable: boolean;
  calculation_method: string | null;
  apply_sequence: number;
  applies_to: string | null;
  targeting: {
    min_quantity: number;
    max_quantity: number | null;
    branch_name: string | null;
    price_type: string | null;
    price_code: string | null;
    classes: Array<Record<string, unknown>>;
  };
};

type DiscountHistoryActor = {
  changed_by: string | null;
  changed_by_name: string | null;
};

const sections: AddProductSection[] = ['Basic Information', 'Images', 'Variation & Pricing'];

const initialFormState: ProductFormState = {
  productName: '',
  skuCode: '',
  categoryId: '',
  brandId: '',
  description: '',
  status: 'Active',
};

const mediaBucket = import.meta.env.VITE_SUPABASE_PRODUCT_MEDIA_BUCKET ?? 'product-images';
const PRICE_CODE_META: Record<
  string,
  { branchName: VariationItem['branchName']; priceType: VariationItem['priceType'] }
> = {
  R1: { branchName: 'Manila', priceType: 'Retail' },
  R2: { branchName: 'Cebu', priceType: 'Retail' },
  W1: { branchName: 'Manila', priceType: 'Wholesale' },
  W2: { branchName: 'Cebu', priceType: 'Wholesale' },
  SP: { branchName: 'Both', priceType: 'Special' },
  CP: { branchName: 'Both', priceType: 'Concept Store' },
};

const fallbackUnits: ProductUnitDefinition[] = [
  { code: 'pc', label: 'pc', status: 'Active' },
  { code: 'unit', label: 'unit', status: 'Active' },
  { code: 'pair', label: 'pair', status: 'Active' },
  { code: 'kg', label: 'kg', status: 'Active' },
  { code: 'roll', label: 'roll', status: 'Active' },
  { code: 'tube', label: 'tube', status: 'Active' },
  { code: 'box', label: 'box', status: 'Active' },
  { code: 'ctn', label: 'ctn', status: 'Active' },
  { code: 'pack', label: 'pack', status: 'Active' },
];

function getStringValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function buildVariationCardKey(variationName: string, skuCode: string) {
  return `${variationName.trim().toLowerCase()}::${skuCode.trim().toLowerCase()}`;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(String(value).trim()));
}

function getStableUuid(value: string | null | undefined) {
  return isUuid(value) ? String(value).trim() : crypto.randomUUID();
}

function getSyntheticParentUuid(value: string | null | undefined) {
  const text = String(value ?? '').trim();
  if (isUuid(text)) return text;
  const possibleUuid = text.slice(0, 36);
  return isUuid(possibleUuid) ? possibleUuid : '';
}

function normalizeCalculationMethod(
  value: string | null | undefined,
): DiscountItem['calculationMethod'] {
  return String(value ?? '').toLowerCase() === 'single' ? 'Single' : 'Cascading';
}

function normalizeSnapshotValue(value: unknown) {
  if (value === undefined || value === '') return null;
  return value;
}

function normalizeUnitText(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

function getCanonicalUnitLabel(unitCode: string, unitDefinitions: ProductUnitDefinition[]) {
  const normalizedUnitCode = normalizeUnitText(unitCode);
  return (
    unitDefinitions.find((unit) => normalizeUnitText(unit.code) === normalizedUnitCode)?.label?.trim() ||
    normalizedUnitCode
  );
}

function resolveKnownUnitCode(
  value: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
) {
  const normalizedValue = normalizeUnitText(value);
  if (!normalizedValue) return '';
  const activeCodes = new Set(
    unitDefinitions
      .filter((unit) => normalizeUnitText(unit.status || 'Active') !== 'inactive')
      .map((unit) => normalizeUnitText(unit.code))
      .filter(Boolean),
  );
  if (activeCodes.has(normalizedValue)) {
    return normalizedValue;
  }
  return normalizePackagingUnitCode(normalizedValue, unitDefinitions, unitAliases);
}

function getVariationUnitValidationError(
  unitOptions: VariationUnitOptionItem[],
  variations: VariationItem[],
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
) {
  const variationNameById = new Map(
    variations.map((variation) => [
      buildVariationCardKey(variation.variationName, variation.skuCode),
      variation.variationName || variation.className || variation.skuCode || 'Variation',
    ]),
  );
  const unitsByVariation = new Map<string, Set<string>>();

  for (const [index, option] of unitOptions.entries()) {
    const rawUnitCode = String(option.unitCode ?? '').trim();
    const rawUnitLabel = String(option.unitLabel ?? '').trim();
    const rawBaseUnitCode = String(option.baseUnitCode ?? '').trim();
    const variationName = variationNameById.get(option.variationId) ?? option.variationId ?? 'Variation';
    const rowLabel = `${variationName} order unit #${index + 1}`;

    if (!rawUnitCode && !rawUnitLabel && !rawBaseUnitCode && !String(option.quantityInBaseUnit ?? '').trim()) {
      continue;
    }

    const unitCode = resolveKnownUnitCode(rawUnitCode, unitDefinitions, unitAliases);
    if (!unitCode) {
      return `${rowLabel} uses unknown unit code "${rawUnitCode || rawUnitLabel || 'blank'}". Select a configured unit.`;
    }

    const baseUnitCode = resolveKnownUnitCode(rawBaseUnitCode, unitDefinitions, unitAliases);
    if (!baseUnitCode) {
      return `${rowLabel} uses unknown base unit "${rawBaseUnitCode || 'blank'}". Select a configured base unit.`;
    }

    const quantityInBaseUnit = Number(String(option.quantityInBaseUnit ?? '').replace(/,/g, ''));
    if (!Number.isFinite(quantityInBaseUnit) || quantityInBaseUnit <= 0) {
      return `${rowLabel} must have a Contains quantity greater than 0.`;
    }

    const labelCode = rawUnitLabel ? resolveKnownUnitCode(rawUnitLabel, unitDefinitions, unitAliases) : '';
    if (labelCode && labelCode !== unitCode) {
      return `${rowLabel} has mismatched unit code "${unitCode}" and label "${rawUnitLabel}". Re-select the unit so code and label match.`;
    }

    const variationUnits = unitsByVariation.get(option.variationId) ?? new Set<string>();
    if (variationUnits.has(unitCode)) {
      return `${rowLabel} duplicates ${unitCode.toUpperCase()}. Each variation can only use one row per order unit.`;
    }
    variationUnits.add(unitCode);
    unitsByVariation.set(option.variationId, variationUnits);
  }

  return '';
}

async function syncInventoryLinksForVariationRows(input: {
  productId: string;
  variationRows: Array<{ id: string; product_id: string; sku_code: string }>;
}) {
  const rowsWithSku = input.variationRows
    .map((row) => ({
      variationId: String(row.id),
      productId: String(row.product_id || input.productId),
      skuCode: String(row.sku_code ?? '').trim(),
    }))
    .filter((row) => row.variationId && row.productId && row.skuCode);

  if (rowsWithSku.length === 0) {
    return;
  }

  const variationIds = rowsWithSku.map((row) => row.variationId);
  const [{ data: inventoryRows, error: inventoryError }, { data: existingLinkRows, error: linkError }] =
    await Promise.all([
      supabase
        .from('inventory_items')
        .select('id, product_id, sku_code')
        .eq('product_id', input.productId),
      supabase
        .from('inventory_item_variation_links')
        .select('product_variation_id')
        .in('product_variation_id', variationIds),
    ]);

  if (inventoryError) {
    throw new Error(inventoryError.message);
  }
  if (linkError) {
    throw new Error(linkError.message);
  }

  const inventoryItemBySku = new Map<string, string>();
  ((inventoryRows ?? []) as Array<Record<string, unknown>>).forEach((row) => {
    const skuCode = normalizeUnitText(row.sku_code);
    const inventoryItemId = String(row.id ?? '');
    const existingInventoryItemId = inventoryItemBySku.get(skuCode);
    if (skuCode && inventoryItemId && existingInventoryItemId && existingInventoryItemId !== inventoryItemId) {
      throw new Error(
        `Multiple physical inventory items exist for SKU ${skuCode}. Resolve the inventory item mapping before saving product pricing rows.`,
      );
    }
    if (skuCode && inventoryItemId && !existingInventoryItemId) {
      inventoryItemBySku.set(skuCode, inventoryItemId);
    }
  });

  const existingLinkedVariationIds = new Set(
    ((existingLinkRows ?? []) as Array<Record<string, unknown>>)
      .map((row) => String(row.product_variation_id ?? ''))
      .filter(Boolean),
  );

  const rowsToInsert = rowsWithSku.flatMap((row) => {
    if (existingLinkedVariationIds.has(row.variationId)) {
      return [];
    }
    const inventoryItemId = inventoryItemBySku.get(normalizeUnitText(row.skuCode));
    if (!inventoryItemId) {
      return [];
    }
    return [
      {
        inventory_item_id: inventoryItemId,
        product_variation_id: row.variationId,
        product_id: row.productId,
        sku_code: row.skuCode,
      },
    ];
  });

  if (rowsToInsert.length === 0) {
    return;
  }

  const { error: insertLinkError } = await supabase
    .from('inventory_item_variation_links')
    .insert(rowsToInsert);
  if (insertLinkError) {
    throw new Error(insertLinkError.message);
  }
}

function normalizeHistorySnapshot(snapshot: DiscountHistorySnapshot) {
  return {
    ...snapshot,
    discount_id: null,
    targeting: {
      ...snapshot.targeting,
      classes: snapshot.targeting.classes.map((classRow) => ({
        class_name: normalizeSnapshotValue(classRow.class_name),
        price_code: normalizeSnapshotValue(classRow.price_code),
        branch_name: normalizeSnapshotValue(classRow.branch_name),
        price_type: normalizeSnapshotValue(classRow.price_type),
        order_unit_code: normalizeSnapshotValue(classRow.order_unit_code),
        unit_condition: normalizeSnapshotValue(classRow.unit_condition) ?? 'any_unit',
        min_order_quantity: normalizeSnapshotValue(classRow.min_order_quantity),
        max_order_quantity: normalizeSnapshotValue(classRow.max_order_quantity),
        min_base_quantity: normalizeSnapshotValue(classRow.min_base_quantity),
        max_base_quantity: normalizeSnapshotValue(classRow.max_base_quantity),
      })),
    },
  };
}

function snapshotsEqual(left: DiscountHistorySnapshot, right: DiscountHistorySnapshot) {
  return JSON.stringify(normalizeHistorySnapshot(left)) === JSON.stringify(normalizeHistorySnapshot(right));
}

function getDiscountHistoryKey(snapshot: DiscountHistorySnapshot) {
  return snapshot.discount_group || snapshot.discount_id || '';
}

function isFutureTimestamp(value: string | null | undefined) {
  if (!value) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.now();
}

function determineDiscountHistoryAction(
  oldSnapshot: DiscountHistorySnapshot | null,
  newSnapshot: DiscountHistorySnapshot,
): DiscountHistoryAction | null {
  if (!oldSnapshot) return 'created';
  if (snapshotsEqual(oldSnapshot, newSnapshot)) return null;

  const oldKind = oldSnapshot.discount_kind;
  const newKind = newSnapshot.discount_kind;
  if (oldKind !== newKind) return 'classified';

  const oldStatus = String(oldSnapshot.status ?? '');
  const newStatus = String(newSnapshot.status ?? '');
  if (oldStatus === 'Active' && newStatus === 'Inactive') return 'deactivated';
  if (newStatus === 'Active' && isFutureTimestamp(newSnapshot.starts_at)) return 'scheduled';
  if (oldStatus === 'Inactive' && newStatus === 'Active') return 'activated';

  return 'updated';
}

export default function AddProduct({
  onCancel,
  editProductId,
  initialCategoryId = null,
  onSaved,
  layout = 'standalone',
  initialSection = 'Basic Information',
}: AddProductProps) {
  const [activeSection, setActiveSection] = useState<AddProductSection>(initialSection);
  const [formValues, setFormValues] = useState<ProductFormState>({
    ...initialFormState,
    categoryId: initialCategoryId ?? '',
  });
  const [categories, setCategories] = useState<OptionItem[]>([]);
  const [brands, setBrands] = useState<OptionItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mainMediaId, setMainMediaId] = useState<string | null>(null);
  const [variations, setVariations] = useState<VariationItem[]>([]);
  const [variationPreviewMediaByCardId, setVariationPreviewMediaByCardId] = useState<Record<string, string>>({});
  const [unitDefinitions, setUnitDefinitions] = useState<ProductUnitDefinition[]>([]);
  const [unitAliases, setUnitAliases] = useState<ProductUnitAliasDefinition[]>([]);
  const [variationUnitOptions, setVariationUnitOptions] = useState<VariationUnitOptionItem[]>([]);
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [surcharges, setSurcharges] = useState<SurchargeItem[]>([]);
  const [loadedExistingMediaIds, setLoadedExistingMediaIds] = useState<string[]>([]);
  const [loadedExistingMediaItems, setLoadedExistingMediaItems] = useState<MediaItem[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);
  const [draftProductId, setDraftProductId] = useState<string | null>(editProductId ?? null);
  const [snackbar, setSnackbar] = useState<{
    type: 'success' | 'error' | 'info';
    message: string;
  } | null>(null);

  const isEditMode = useMemo(() => Boolean(editProductId), [editProductId]);
  const basicInformationRef = useRef<HTMLElement | null>(null);
  const imagesRef = useRef<HTMLElement | null>(null);
  const variationRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadLookups = async () => {
      setIsLoadingLookups(true);
      const [
        { data: categoryRows },
        { data: brandRows },
        { data: unitRows, error: unitError },
        { data: aliasRows },
      ] = await Promise.all([
        supabase
          .from('product_categories')
          .select('id, category_title, status')
          .order('category_title'),
        supabase.from('brands').select('id, brand_name, status').order('brand_name'),
        supabase.from('product_units').select('*').order('sort_order', { ascending: true }),
        supabase.from('product_unit_aliases').select('*'),
      ]);

      if (!isMounted) {
        return;
      }

      setCategories(
        (categoryRows ?? []).map((row) => ({
          id: row.id as string,
          label: `${row.category_title as string}${
            String(row.status ?? '').toLowerCase() === 'inactive' ? ' (Inactive)' : ''
          }`,
        })),
      );
      setBrands(
        (brandRows ?? []).map((row) => ({
          id: row.id as string,
          label: `${row.brand_name as string}${
            String(row.status ?? '').toLowerCase() === 'inactive' ? ' (Inactive)' : ''
          }`,
        })),
      );
      const mappedUnits =
        unitRows && unitRows.length > 0
          ? (unitRows as Array<Record<string, unknown>>)
              .map((row) => {
                const code = getStringValue(row, ['unit_code', 'code', 'unit_label', 'label']);
                const label =
                  getStringValue(row, ['unit_label', 'label', 'unit_name', 'name', 'unit_code']) ||
                  code;
                const status = getStringValue(row, ['status']) || 'Active';
                if (!code) {
                  return null;
                }
                return {
                  code: code.toLowerCase(),
                  label: label.toLowerCase(),
                  status,
                } satisfies ProductUnitDefinition;
              })
              .filter(Boolean) as ProductUnitDefinition[]
          : fallbackUnits;
      setUnitDefinitions(mappedUnits.length > 0 ? mappedUnits : fallbackUnits);

      const mappedAliases = ((aliasRows ?? []) as Array<Record<string, unknown>>)
        .map((row) => {
          const alias = getStringValue(row, ['alias_code', 'alias', 'alias_text', 'alias_name', 'name']);
          const unitCode = getStringValue(row, ['normalized_unit_code', 'unit_code', 'code']);
          if (!alias || !unitCode) {
            return null;
          }
          return {
            alias: alias.toLowerCase(),
            unitCode: unitCode.toLowerCase(),
          } satisfies ProductUnitAliasDefinition;
        })
        .filter(Boolean) as ProductUnitAliasDefinition[];
      setUnitAliases(mappedAliases);

      if (unitError) {
        setSubmitError(unitError.message);
      }
      setIsLoadingLookups(false);
    };

    void loadLookups();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (editProductId) {
      return;
    }

    setDraftProductId(null);
    setFormValues((current) => ({
      ...initialFormState,
      categoryId: initialCategoryId ?? current.categoryId ?? '',
    }));
    setMediaItems([]);
    setMainMediaId(null);
    setVariations([]);
    setVariationPreviewMediaByCardId({});
    setVariationUnitOptions([]);
    setDiscounts([]);
    setSurcharges([]);
    setLoadedExistingMediaIds([]);
    setLoadedExistingMediaItems([]);
    setSubmitError('');
    setSaveNotice(null);
    setActiveSection(initialSection);
  }, [editProductId, initialCategoryId, initialSection]);

  useEffect(() => {
    let isMounted = true;

    const loadProductForEdit = async () => {
      setActiveSection(initialSection);
      setSubmitError('');
      setSaveNotice(null);

      if (!editProductId) {
        return;
      }

      setIsLoadingProduct(true);

      const [productRes, mediaRes, variationRes, discountRes, surchargeRes] = await Promise.all([
        supabase
          .from('products')
          .select(
            'id, product_name, sku_code, category_id, brand_id, description, status, product_categories(category_title), brands(brand_name)',
          )
          .eq('id', editProductId)
          .single(),
        supabase
          .from('product_media')
          .select('id, media_url, media_type, media_path, thumbnail_url, thumbnail_path, title, alt_text, is_primary, variation_id, status')
          .eq('product_id', editProductId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('product_variations')
          .select(
            'id, price_type, variation_name, class_name, price_code, branch_name, price, sku_code, stock_quantity, availability',
          )
          .eq('product_id', editProductId)
          .order('sort_order', { ascending: true }),
        supabase
          .from('product_discounts')
          .select(
            'id, discount_kind, discount_name, discount_type, discount_percent, amount, description, status, min_quantity, max_quantity, branch_name, price_type, price_code, calculation_method, apply_sequence, discount_group, applies_to, stackable, priority, starts_at, ends_at, product_discount_classes!left(id, variation_id, class_name, price_code, branch_name, price_type, unit_option_id, order_unit_code, unit_condition, min_order_quantity, max_order_quantity, min_base_quantity, max_base_quantity, unit_rule_label, unit_rule_notes)',
          )
          .eq('product_id', editProductId)
          .order('apply_sequence', { ascending: true }),
        supabase
          .from('product_surcharges')
          .select(
            'id, linked_discount_id, surcharge_name, surcharge_type, surcharge_percent, amount, description, status, free_quantity, free_item_label, qualification_scope, min_quantity, max_quantity, branch_name, price_type, price_code, priority, starts_at, ends_at, reward_target_type, reward_product_id, reward_variation_id, reward_unit_option_id, reward_unit_code, reward_repeat_mode, reward_every_quantity, product_surcharge_classes!left(id, linked_discount_class_id, variation_id, class_name, price_code, branch_name, price_type, unit_option_id, order_unit_code, unit_condition, min_order_quantity, max_order_quantity, min_base_quantity, max_base_quantity, reward_target_type, reward_product_id, reward_variation_id, reward_unit_option_id, reward_unit_code, reward_quantity, reward_label, reward_repeat_mode, reward_every_quantity, unit_rule_label, unit_rule_notes)',
          )
          .eq('product_id', editProductId)
          .order('priority', { ascending: true }),
      ]);

      if (!isMounted) {
        return;
      }

      if (productRes.error || !productRes.data) {
        setSubmitError(productRes.error?.message ?? 'Failed to load product details.');
        setIsLoadingProduct(false);
        return;
      }

      const categoryRelation = productRes.data.product_categories as
        | { category_title?: string | null }
        | Array<{ category_title?: string | null }>
        | null;
      const brandRelation = productRes.data.brands as
        | { brand_name?: string | null }
        | Array<{ brand_name?: string | null }>
        | null;
      const categoryLabelSource = Array.isArray(categoryRelation)
        ? categoryRelation[0]?.category_title
        : categoryRelation?.category_title;
      const brandLabelSource = Array.isArray(brandRelation)
        ? brandRelation[0]?.brand_name
        : brandRelation?.brand_name;
      const categoryId = String(productRes.data.category_id ?? '');
      const brandId = String(productRes.data.brand_id ?? '');

      if (categoryId && categoryLabelSource) {
        setCategories((current) =>
          current.some((entry) => entry.id === categoryId)
            ? current
            : [...current, { id: categoryId, label: String(categoryLabelSource) }],
        );
      }

      if (brandId && brandLabelSource) {
        setBrands((current) =>
          current.some((entry) => entry.id === brandId)
            ? current
            : [...current, { id: brandId, label: String(brandLabelSource) }],
        );
      }

      setFormValues({
        productName: String(productRes.data.product_name ?? ''),
        skuCode: String(productRes.data.sku_code ?? ''),
        categoryId,
        brandId,
        description: String(productRes.data.description ?? ''),
        status: (productRes.data.status as 'Active' | 'Inactive') ?? 'Active',
      });
      setDraftProductId(editProductId);

      const productLevelMediaRows = ((mediaRes.data ?? []) as Array<Record<string, any>>).filter(
        (row) => !row.variation_id,
      );
      const mappedMedia: MediaItem[] = productLevelMediaRows.map((row) => ({
        id: String(row.id),
        fileName: String(row.media_path ?? row.media_url ?? 'Media'),
        previewUrl: String(row.media_url ?? ''),
        type: (row.media_type as 'image' | 'video') ?? 'image',
        title: String(row.title ?? ''),
        altText: String(row.alt_text ?? ''),
        isExisting: true,
        mediaPath: row.media_path ? String(row.media_path) : null,
        thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null,
        thumbnailPath: row.thumbnail_path ? String(row.thumbnail_path) : null,
        variationId: null,
        status: String(row.status ?? 'Active'),
      }));
      setMediaItems(mappedMedia);
      setLoadedExistingMediaIds(mappedMedia.map((item) => item.id));
      setLoadedExistingMediaItems(mappedMedia);
      setMainMediaId(
        productLevelMediaRows.find((row) => row.is_primary)?.id ?? mappedMedia[0]?.id ?? null,
      );

      const mappedVariations: VariationItem[] = (variationRes.data ?? []).map((row) => {
        const priceCode = String(row.price_code ?? '') as VariationItem['priceCode'];
        const meta = PRICE_CODE_META[priceCode];
        return {
          id: String(row.id),
          priceType: meta?.priceType ?? ((row.price_type as VariationItem['priceType']) ?? ''),
          variationName: String(row.variation_name ?? ''),
          className: String(row.class_name ?? ''),
          priceCode,
          branchName: meta?.branchName ?? ((row.branch_name as VariationItem['branchName']) ?? ''),
          price: row.price ? Number(row.price).toLocaleString('en-US') : '',
          skuCode: String(row.sku_code ?? ''),
          stockQuantity: String(row.stock_quantity ?? '0'),
          availability: (row.availability as VariationItem['availability']) ?? '',
        };
      });
      setVariations(mappedVariations);

      const variationIds = ((variationRes.data ?? []) as Array<Record<string, unknown>>).map((row) =>
        String(row.id ?? ''),
      ).filter(Boolean);

      const variationIdToKey = new Map<string, string>();
      const variationMetaById = new Map<
        string,
        { priceCode: string; branchName: string; priceType: string; baseSku: string; variationName: string }
      >();
      (variationRes.data ?? []).forEach((row: any) => {
        const variationRowId = String(row.id);
        const variationName = String(row.variation_name ?? row.class_name ?? '')
          .trim()
          .toLowerCase();
        const skuCode = String(row.sku_code ?? '').trim().toLowerCase();
        const key = buildVariationCardKey(variationName, skuCode);
        variationIdToKey.set(variationRowId, key);
        variationMetaById.set(variationRowId, {
          priceCode: String(row.price_code ?? ''),
          branchName: String(row.branch_name ?? ''),
          priceType: String(row.price_type ?? ''),
          baseSku: String(row.sku_code ?? ''),
          variationName: String(row.variation_name ?? row.class_name ?? ''),
        });
      });

      const mediaIdByPathOrUrl = new Map<string, string>();
      mappedMedia.forEach((item) => {
        if (item.mediaPath) {
          mediaIdByPathOrUrl.set(`path::${item.mediaPath}`, item.id);
        }
        if (item.previewUrl) {
          mediaIdByPathOrUrl.set(`url::${item.previewUrl}`, item.id);
        }
      });
      const nextVariationPreviewMediaByCardId: Record<string, string> = {};
      ((mediaRes.data ?? []) as Array<Record<string, any>>)
        .filter((row) => row.variation_id && row.is_primary && String(row.status ?? 'Active') === 'Active')
        .forEach((row) => {
          const cardKey = variationIdToKey.get(String(row.variation_id ?? ''));
          if (!cardKey) {
            return;
          }
          const sourceMediaId =
            mediaIdByPathOrUrl.get(`path::${String(row.media_path ?? '')}`) ??
            mediaIdByPathOrUrl.get(`url::${String(row.media_url ?? '')}`);
          if (sourceMediaId) {
            nextVariationPreviewMediaByCardId[cardKey] = sourceMediaId;
          }
        });
      setVariationPreviewMediaByCardId(nextVariationPreviewMediaByCardId);

      if (variationIds.length > 0) {
        const { data: unitOptionRows } = await supabase
          .from('product_variation_unit_options')
          .select(
            'id, variation_id, unit_code, unit_label, base_unit_code, quantity_in_base_unit, price_override, packaging_text, min_order_quantity, order_increment, is_default, is_orderable, status, sort_order, notes, weight_value, weight_unit, length_value, width_value, height_value, dimension_unit, shipping_notes',
          )
          .in('variation_id', variationIds)
          .order('sort_order', { ascending: true });

        const seenUnitOptionKeys = new Set<string>();
        const mappedUnitOptions = ((unitOptionRows ?? []) as Array<Record<string, unknown>>)
          .map((row) => {
            const sourceVariationId = String(row.variation_id ?? '');
            const variationKey = variationIdToKey.get(sourceVariationId) ?? sourceVariationId;
            if (!variationKey) {
              return null;
            }
            const unitCode = String(row.unit_code ?? '').toLowerCase();
            const dedupeKey = [
              variationKey,
              unitCode,
              String(row.base_unit_code ?? '').toLowerCase(),
              String(row.quantity_in_base_unit ?? ''),
            ].join('::');
            if (seenUnitOptionKeys.has(dedupeKey)) {
              return null;
            }
            seenUnitOptionKeys.add(dedupeKey);
            return {
              id: String(row.id ?? crypto.randomUUID()),
              variationId: variationKey,
              unitCode,
              unitLabel: String(row.unit_label ?? row.unit_code ?? ''),
              baseUnitCode: String(row.base_unit_code ?? '').toLowerCase() || 'pc',
              quantityInBaseUnit: String(row.quantity_in_base_unit ?? '1'),
              priceOverride: String(row.price_override ?? ''),
              packagingText: String(row.packaging_text ?? ''),
              minOrderQuantity: String(row.min_order_quantity ?? '1'),
              orderIncrement: String(row.order_increment ?? '1'),
              isDefault: Boolean(row.is_default ?? false),
              status: String(row.status ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
              isOrderable: row.is_orderable !== false,
              sortOrder: String(row.sort_order ?? '0'),
              notes: String(row.notes ?? ''),
              weightValue: row.weight_value === null || row.weight_value === undefined ? '' : String(row.weight_value),
              weightUnit: ['mg', 'g', 'kg', 'lb'].includes(String(row.weight_unit ?? ''))
                ? (String(row.weight_unit) as VariationUnitOptionItem['weightUnit'])
                : 'kg',
              lengthValue: row.length_value === null || row.length_value === undefined ? '' : String(row.length_value),
              widthValue: row.width_value === null || row.width_value === undefined ? '' : String(row.width_value),
              heightValue: row.height_value === null || row.height_value === undefined ? '' : String(row.height_value),
              dimensionUnit: ['mm', 'cm', 'm', 'in'].includes(String(row.dimension_unit ?? ''))
                ? (String(row.dimension_unit) as VariationUnitOptionItem['dimensionUnit'])
                : 'cm',
              shippingNotes: String(row.shipping_notes ?? ''),
            } satisfies VariationUnitOptionItem;
          })
          .filter(Boolean) as VariationUnitOptionItem[];
        setVariationUnitOptions(mappedUnitOptions);
      } else {
        setVariationUnitOptions([]);
      }

      const mappedDiscounts: DiscountItem[] = (discountRes.data ?? []).flatMap((row: any) => {
        const classes = Array.isArray(row.product_discount_classes)
          ? row.product_discount_classes
          : [];
        if (classes.length === 0) {
          return [
            {
              id: String(row.id),
              discountRecordId: String(row.id),
              discountClassId: '',
              variationId: '',
              discountKind: normalizeDiscountKind(row.discount_kind),
              discountName: String(row.discount_name ?? ''),
              discountType: (row.discount_type as DiscountItem['discountType']) ?? 'Percent',
              amount: String(
                row.discount_type === 'Percent' ? row.discount_percent ?? '' : row.amount ?? '',
              ),
              minQuantity: String(row.min_quantity ?? '1'),
              maxQuantity: String(row.max_quantity ?? ''),
              branchName: (row.branch_name as DiscountItem['branchName']) ?? '',
              priceType: (row.price_type as DiscountItem['priceType']) ?? '',
              priceCode: (row.price_code as DiscountItem['priceCode']) ?? '',
              calculationMethod: normalizeCalculationMethod(row.calculation_method),
              applySequence: String(row.apply_sequence ?? '1'),
              discountGroup: String(row.discount_group ?? ''),
              appliesTo: (row.applies_to as DiscountItem['appliesTo']) ?? 'UnitPrice',
              stackable: Boolean(row.stackable ?? true),
              description: String(row.description ?? ''),
              status: String(row.status ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
              priority: String(row.priority ?? '0'),
              startsAt: String(row.starts_at ?? ''),
              endsAt: String(row.ends_at ?? ''),
              unitOptionId: '',
              orderUnitCode: '',
              unitCondition: 'any_unit',
              minOrderQuantity: String(row.min_quantity ?? '1'),
              maxOrderQuantity: String(row.max_quantity ?? ''),
              minBaseQuantity: '',
              maxBaseQuantity: '',
              unitRuleLabel: '',
              unitRuleNotes: '',
              hasPromo: false,
              promoType: 'Freebie',
              promoRewardUnitCode: '',
              promoRewardQuantity: '1',
              promoRewardLabel: '',
              promoSourceSurchargeId: '',
              promoRewardTargetType: 'same_item',
              promoRewardProductId: '',
              promoRewardProductLabel: '',
              promoRewardVariationId: '',
              promoRewardVariationLabel: '',
              promoRewardUnitOptionId: '',
              promoRewardRepeatMode: 'one_time',
              promoRewardEveryQuantity: '',
              promoQualificationScope: 'line',
            },
          ];
        }
        return classes.map((classRow: any, classIndex: number) => ({
          id: classIndex === 0 ? String(row.id) : `${String(row.id)}-${classIndex}`,
          discountRecordId: String(row.id),
          discountClassId: String(classRow.id ?? ''),
          variationId:
            variationIdToKey.get(String(classRow.variation_id ?? '')) ??
            String(classRow.variation_id ?? ''),
          discountKind: normalizeDiscountKind(row.discount_kind),
          discountName: String(row.discount_name ?? ''),
          discountType: (row.discount_type as DiscountItem['discountType']) ?? 'Percent',
          amount: String(
            row.discount_type === 'Percent' ? row.discount_percent ?? '' : row.amount ?? '',
          ),
          minQuantity: String(row.min_quantity ?? '1'),
          maxQuantity: String(row.max_quantity ?? ''),
          branchName:
            (classRow.branch_name as DiscountItem['branchName']) ??
            (row.branch_name as DiscountItem['branchName']) ??
            '',
          priceType:
            (classRow.price_type as DiscountItem['priceType']) ??
            (row.price_type as DiscountItem['priceType']) ??
            '',
          priceCode:
            (classRow.price_code as DiscountItem['priceCode']) ??
            (row.price_code as DiscountItem['priceCode']) ??
            '',
          calculationMethod: normalizeCalculationMethod(row.calculation_method),
          applySequence: String(row.apply_sequence ?? '1'),
          discountGroup: String(row.discount_group ?? ''),
          appliesTo: (row.applies_to as DiscountItem['appliesTo']) ?? 'UnitPrice',
          stackable: Boolean(row.stackable ?? true),
          description: String(row.description ?? ''),
          status: String(row.status ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
          priority: String(row.priority ?? '0'),
          startsAt: String(row.starts_at ?? ''),
          endsAt: String(row.ends_at ?? ''),
          unitOptionId: String(classRow.unit_option_id ?? ''),
          orderUnitCode: String(classRow.order_unit_code ?? ''),
          unitCondition:
            String(classRow.unit_condition ?? '').toLowerCase() === 'selected_unit'
              ? 'selected_unit'
              : 'any_unit',
          minOrderQuantity: String(classRow.min_order_quantity ?? row.min_quantity ?? '1'),
          maxOrderQuantity: String(classRow.max_order_quantity ?? row.max_quantity ?? ''),
          minBaseQuantity: String(classRow.min_base_quantity ?? ''),
          maxBaseQuantity: String(classRow.max_base_quantity ?? ''),
          unitRuleLabel: String(classRow.unit_rule_label ?? ''),
          unitRuleNotes: String(classRow.unit_rule_notes ?? ''),
          hasPromo: false,
          promoType: 'Freebie',
          promoRewardUnitCode: '',
          promoRewardQuantity: '1',
          promoRewardLabel: '',
          promoSourceSurchargeId: '',
          promoRewardTargetType: 'same_item',
          promoRewardProductId: '',
          promoRewardProductLabel: '',
          promoRewardVariationId: '',
          promoRewardVariationLabel: '',
          promoRewardUnitOptionId: '',
          promoRewardRepeatMode: 'one_time',
          promoRewardEveryQuantity: '',
          promoQualificationScope: 'line',
        }));
      });
      const mappedSurcharges: SurchargeItem[] = (surchargeRes.data ?? []).flatMap((row: any) => {
        const classes = Array.isArray(row.product_surcharge_classes)
          ? row.product_surcharge_classes
          : [];
        if (classes.length === 0) {
          return [
            {
              id: String(row.id),
              linkedDiscountId: String(row.linked_discount_id ?? ''),
              linkedDiscountClassId: '',
              variationId: '',
              surchargeName: String(row.surcharge_name ?? ''),
              surchargeType: (row.surcharge_type as SurchargeItem['surchargeType']) ?? 'Amount',
              amount: String(
                row.surcharge_type === 'Percent' ? row.surcharge_percent ?? '' : row.amount ?? '',
              ),
              freeQuantity: String(row.free_quantity ?? '0'),
              minQuantity: String(row.min_quantity ?? '1'),
              maxQuantity: String(row.max_quantity ?? ''),
              branchName: (row.branch_name as SurchargeItem['branchName']) ?? '',
              priceType: (row.price_type as SurchargeItem['priceType']) ?? '',
              priceCode: (row.price_code as SurchargeItem['priceCode']) ?? '',
              description: String(row.description ?? ''),
              status: String(row.status ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
              priority: String(row.priority ?? '0'),
              startsAt: String(row.starts_at ?? ''),
              endsAt: String(row.ends_at ?? ''),
              unitOptionId: '',
              orderUnitCode: '',
              unitCondition: 'any_unit',
              minOrderQuantity: String(row.min_quantity ?? '1'),
              maxOrderQuantity: String(row.max_quantity ?? ''),
              minBaseQuantity: '',
              maxBaseQuantity: '',
              rewardUnitCode: '',
              rewardQuantity: String(row.free_quantity ?? '0'),
              rewardLabel: String(row.free_item_label ?? ''),
              unitRuleLabel: '',
              unitRuleNotes: '',
              rewardTargetType:
                String(row.reward_target_type ?? '').toLowerCase() === 'different_item'
                  ? 'different_item'
                  : 'same_item',
              rewardProductId: String(row.reward_product_id ?? ''),
              rewardVariationId: String(row.reward_variation_id ?? ''),
              rewardUnitOptionId: String(row.reward_unit_option_id ?? ''),
              rewardRepeatMode:
                String(row.reward_repeat_mode ?? '').toLowerCase() === 'every'
                  ? 'every'
                  : 'one_time',
              rewardEveryQuantity: String(row.reward_every_quantity ?? ''),
              qualificationScope:
                String(row.qualification_scope ?? '').toLowerCase() === 'assorted_same_product'
                  ? 'assorted_same_product'
                  : 'line',
            },
          ];
        }

        return classes.map((classRow: any, classIndex: number) => {
          const rawVariationId = String(classRow.variation_id ?? '');
          const variationMeta = variationMetaById.get(rawVariationId);
          return {
            id: classIndex === 0 ? String(row.id) : `${String(row.id)}-${classIndex}`,
            linkedDiscountId: String(row.linked_discount_id ?? ''),
            linkedDiscountClassId: String(classRow.linked_discount_class_id ?? ''),
            variationId: variationIdToKey.get(rawVariationId) ?? rawVariationId,
            surchargeName: String(row.surcharge_name ?? ''),
            surchargeType: (row.surcharge_type as SurchargeItem['surchargeType']) ?? 'Amount',
            amount: String(
              row.surcharge_type === 'Percent' ? row.surcharge_percent ?? '' : row.amount ?? '',
            ),
            freeQuantity: String(row.free_quantity ?? '0'),
            minQuantity: String(row.min_quantity ?? '1'),
            maxQuantity: String(row.max_quantity ?? ''),
            branchName:
              (classRow.branch_name as SurchargeItem['branchName']) ??
              (row.branch_name as SurchargeItem['branchName']) ??
              (variationMeta?.branchName as SurchargeItem['branchName']) ??
              '',
            priceType:
              (classRow.price_type as SurchargeItem['priceType']) ??
              (row.price_type as SurchargeItem['priceType']) ??
              (variationMeta?.priceType as SurchargeItem['priceType']) ??
              '',
            priceCode:
              (classRow.price_code as SurchargeItem['priceCode']) ??
              (row.price_code as SurchargeItem['priceCode']) ??
              (variationMeta?.priceCode as SurchargeItem['priceCode']) ??
              '',
            description: String(row.description ?? ''),
            status: String(row.status ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
            priority: String(row.priority ?? '0'),
            startsAt: String(row.starts_at ?? ''),
            endsAt: String(row.ends_at ?? ''),
            unitOptionId: String(classRow.unit_option_id ?? ''),
            orderUnitCode: String(classRow.order_unit_code ?? ''),
            unitCondition:
              String(classRow.unit_condition ?? '').toLowerCase() === 'selected_unit'
                ? 'selected_unit'
                : 'any_unit',
            minOrderQuantity: String(classRow.min_order_quantity ?? row.min_quantity ?? '1'),
            maxOrderQuantity: String(classRow.max_order_quantity ?? row.max_quantity ?? ''),
            minBaseQuantity: String(classRow.min_base_quantity ?? ''),
            maxBaseQuantity: String(classRow.max_base_quantity ?? ''),
            rewardUnitCode: String(classRow.reward_unit_code ?? ''),
            rewardQuantity: String(classRow.reward_quantity ?? row.free_quantity ?? '0'),
            rewardLabel:
              String(classRow.reward_label ?? row.free_item_label ?? ''),
            unitRuleLabel: String(classRow.unit_rule_label ?? ''),
            unitRuleNotes: String(classRow.unit_rule_notes ?? ''),
            rewardTargetType:
              String(classRow.reward_target_type ?? row.reward_target_type ?? '').toLowerCase() ===
              'different_item'
                ? 'different_item'
                : 'same_item',
            rewardProductId: String(classRow.reward_product_id ?? row.reward_product_id ?? ''),
            rewardVariationId: String(classRow.reward_variation_id ?? row.reward_variation_id ?? ''),
            rewardUnitOptionId: String(classRow.reward_unit_option_id ?? row.reward_unit_option_id ?? ''),
            rewardRepeatMode:
              String(classRow.reward_repeat_mode ?? row.reward_repeat_mode ?? '').toLowerCase() ===
              'every'
                ? 'every'
                : 'one_time',
            rewardEveryQuantity: String(classRow.reward_every_quantity ?? row.reward_every_quantity ?? ''),
            qualificationScope:
              String(row.qualification_scope ?? '').toLowerCase() === 'assorted_same_product'
                ? 'assorted_same_product'
                : 'line',
          };
        });
      });

      const matchedSurchargeIds = new Set<string>();
      const surchargesByDiscountClassId = new Map<string, SurchargeItem[]>();
      const surchargesByDiscountId = new Map<string, SurchargeItem[]>();
      mappedSurcharges.forEach((item) => {
        if (item.linkedDiscountClassId) {
          const byClass = surchargesByDiscountClassId.get(item.linkedDiscountClassId) ?? [];
          byClass.push(item);
          surchargesByDiscountClassId.set(item.linkedDiscountClassId, byClass);
        }
        if (item.linkedDiscountId) {
          const byDiscount = surchargesByDiscountId.get(item.linkedDiscountId) ?? [];
          byDiscount.push(item);
          surchargesByDiscountId.set(item.linkedDiscountId, byDiscount);
        }
      });

      const mergedDiscounts = mappedDiscounts.map((item) => {
        const matchedPromo = (
          (item.discountClassId ? surchargesByDiscountClassId.get(item.discountClassId) ?? [] : [])
            .concat(
              item.discountRecordId
                ? surchargesByDiscountId.get(item.discountRecordId) ?? []
                : [],
            )
        ).find(
          (entry) => entry.surchargeType === 'Freebie' || entry.surchargeType === 'BonusQty',
        );
        if (!matchedPromo) {
          return item;
        }
        matchedSurchargeIds.add(matchedPromo.id);
        return {
          ...item,
          hasPromo: true,
          promoType:
            matchedPromo.surchargeType === 'BonusQty'
              ? ('BonusQty' as DiscountItem['promoType'])
              : ('Freebie' as DiscountItem['promoType']),
          promoRewardUnitCode: matchedPromo.rewardUnitCode || matchedPromo.orderUnitCode || '',
          promoRewardQuantity: matchedPromo.rewardQuantity || matchedPromo.freeQuantity || '1',
          promoRewardLabel: matchedPromo.rewardLabel || '',
          promoSourceSurchargeId: matchedPromo.id,
          promoRewardTargetType: matchedPromo.rewardTargetType || 'same_item',
          promoRewardProductId: matchedPromo.rewardProductId || '',
          promoRewardProductLabel: '',
          promoRewardVariationId: matchedPromo.rewardVariationId || '',
          promoRewardVariationLabel: '',
          promoRewardUnitOptionId: matchedPromo.rewardUnitOptionId || '',
          promoRewardRepeatMode: matchedPromo.rewardRepeatMode || 'one_time',
          promoRewardEveryQuantity: matchedPromo.rewardEveryQuantity || '',
          promoQualificationScope: matchedPromo.qualificationScope || 'line',
        };
      });

      setDiscounts(mergedDiscounts);
      setSurcharges(mappedSurcharges.filter((item) => !matchedSurchargeIds.has(item.id)));

      setIsLoadingProduct(false);
    };

    void loadProductForEdit();

    return () => {
      isMounted = false;
    };
  }, [editProductId, initialSection]);

  useEffect(() => {
    if (!snackbar) return;
    const timeout = window.setTimeout(() => setSnackbar(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  function scrollToSection(section: AddProductSection) {
    setActiveSection(section);
    const target =
      section === 'Basic Information'
        ? basicInformationRef.current
        : section === 'Images'
          ? imagesRef.current
          : variationRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const parseNumber = (value: string) => Number(value.replace(/,/g, '')) || 0;
  const parseNullableNonNegativeNumber = (value: string) => {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed.replace(/,/g, ''));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const normalizeSnapshotNumber = (value: unknown, fallback = 0) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const normalizeWeightUnit = (value: string): VariationUnitOptionItem['weightUnit'] =>
    ['mg', 'g', 'kg', 'lb'].includes(value) ? (value as VariationUnitOptionItem['weightUnit']) : 'kg';
  const normalizeDimensionUnit = (value: string): VariationUnitOptionItem['dimensionUnit'] =>
    ['mm', 'cm', 'm', 'in'].includes(value) ? (value as VariationUnitOptionItem['dimensionUnit']) : 'cm';

  function buildPersistedDiscountSnapshot(row: Record<string, any>): DiscountHistorySnapshot {
    const classes = Array.isArray(row.product_discount_classes)
      ? row.product_discount_classes
      : [];
    return {
      discount_id: row.id ? String(row.id) : null,
      product_id: String(row.product_id ?? ''),
      discount_group: row.discount_group ? String(row.discount_group) : null,
      discount_name: String(row.discount_name ?? ''),
      discount_kind: normalizeDiscountKind(row.discount_kind) || null,
      discount_type: String(row.discount_type ?? ''),
      discount_percent:
        row.discount_percent === null || row.discount_percent === undefined
          ? null
          : normalizeSnapshotNumber(row.discount_percent),
      amount:
        row.amount === null || row.amount === undefined
          ? null
          : normalizeSnapshotNumber(row.amount),
      status: String(row.status ?? 'Active'),
      starts_at: row.starts_at ? String(row.starts_at) : null,
      ends_at: row.ends_at ? String(row.ends_at) : null,
      priority: normalizeSnapshotNumber(row.priority),
      stackable: Boolean(row.stackable),
      calculation_method: row.calculation_method ? String(row.calculation_method) : null,
      apply_sequence: normalizeSnapshotNumber(row.apply_sequence, normalizeSnapshotNumber(row.priority)),
      applies_to: row.applies_to ? String(row.applies_to) : null,
      targeting: {
        min_quantity: normalizeSnapshotNumber(row.min_quantity, 1),
        max_quantity:
          row.max_quantity === null || row.max_quantity === undefined
            ? null
            : normalizeSnapshotNumber(row.max_quantity),
        branch_name: row.branch_name ? String(row.branch_name) : null,
        price_type: row.price_type ? String(row.price_type) : null,
        price_code: row.price_code ? String(row.price_code) : null,
        classes: classes.map((classRow: Record<string, any>) => ({
          variation_id: normalizeSnapshotValue(classRow.variation_id),
          class_name: normalizeSnapshotValue(classRow.class_name),
          price_code: normalizeSnapshotValue(classRow.price_code),
          branch_name: normalizeSnapshotValue(classRow.branch_name),
          price_type: normalizeSnapshotValue(classRow.price_type),
          unit_option_id: normalizeSnapshotValue(classRow.unit_option_id),
          order_unit_code: normalizeSnapshotValue(classRow.order_unit_code),
          unit_condition: normalizeSnapshotValue(classRow.unit_condition) ?? 'any_unit',
          min_order_quantity: normalizeSnapshotNumber(classRow.min_order_quantity, 1),
          max_order_quantity:
            classRow.max_order_quantity === null || classRow.max_order_quantity === undefined
              ? null
              : normalizeSnapshotNumber(classRow.max_order_quantity),
          min_base_quantity:
            classRow.min_base_quantity === null || classRow.min_base_quantity === undefined
              ? null
              : normalizeSnapshotNumber(classRow.min_base_quantity),
          max_base_quantity:
            classRow.max_base_quantity === null || classRow.max_base_quantity === undefined
              ? null
              : normalizeSnapshotNumber(classRow.max_base_quantity),
        })),
      },
    };
  }

  function buildDiscountSnapshotFromSource(input: {
    productId: string;
    source: DiscountItem;
    discountId: string | null;
    classRows: Array<Record<string, unknown>>;
  }): DiscountHistorySnapshot {
    return {
      discount_id: input.discountId,
      product_id: input.productId,
      discount_group: input.source.discountGroup || null,
      discount_name: input.source.discountName,
      discount_kind: input.source.discountKind || null,
      discount_type: input.source.discountType,
      discount_percent: input.source.discountType === 'Percent' ? parseNumber(input.source.amount) : null,
      amount: input.source.discountType === 'Amount' ? parseNumber(input.source.amount) : null,
      status: input.source.status || 'Active',
      starts_at: input.source.startsAt || null,
      ends_at: input.source.endsAt || null,
      priority: parseInt(input.source.priority || '0', 10) || 0,
      stackable: input.source.stackable,
      calculation_method: normalizeCalculationMethod(input.source.calculationMethod),
      apply_sequence: Math.max(1, parseInt(input.source.applySequence || '1', 10)),
      applies_to: input.source.appliesTo || null,
      targeting: {
        min_quantity: Math.max(1, parseInt(input.source.minQuantity || '1', 10)),
        max_quantity: input.source.maxQuantity ? parseInt(input.source.maxQuantity, 10) : null,
        branch_name: input.source.branchName || null,
        price_type: input.source.priceType || null,
        price_code: input.source.priceCode || null,
        classes: input.classRows.map((row) => ({ ...row })),
      },
    };
  }

  async function loadExistingDiscountHistorySnapshots(productId: string) {
    const { data, error } = await supabase
      .from('product_discounts')
      .select(
        'id, product_id, discount_kind, discount_name, discount_type, discount_percent, amount, status, min_quantity, max_quantity, branch_name, price_type, price_code, priority, stackable, calculation_method, apply_sequence, discount_group, applies_to, starts_at, ends_at, product_discount_classes!left(variation_id, class_name, price_code, branch_name, price_type, unit_option_id, order_unit_code, unit_condition, min_order_quantity, max_order_quantity, min_base_quantity, max_base_quantity)',
      )
      .eq('product_id', productId);

    if (error) {
      console.warn('[discount-history] Unable to load existing discount snapshots.', error);
      return new Map<string, DiscountHistorySnapshot>();
    }

    return new Map(
      ((data ?? []) as Array<Record<string, any>>).map((row) => {
        const snapshot = buildPersistedDiscountSnapshot(row);
        return [getDiscountHistoryKey(snapshot), snapshot] as const;
      }),
    );
  }

  async function resolveDiscountHistoryActor(): Promise<DiscountHistoryActor> {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const authUserId = userData.user?.id;
      if (!authUserId) {
        return { changed_by: null, changed_by_name: null };
      }

      const { data } = await supabase
        .from('admin_accounts')
        .select('id, full_name, email')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (!data) {
        return { changed_by: null, changed_by_name: null };
      }

      return {
        changed_by: String(data.id ?? '') || null,
        changed_by_name:
          String(data.full_name ?? '').trim() ||
          String(data.email ?? '').trim() ||
          null,
      };
    } catch (error) {
      console.warn('[discount-history] Unable to resolve admin actor.', error);
      return { changed_by: null, changed_by_name: null };
    }
  }

  async function writeDiscountHistoryRows(input: {
    productId: string;
    oldSnapshots: Map<string, DiscountHistorySnapshot>;
    newSnapshots: Array<{ compareKey: string; snapshot: DiscountHistorySnapshot }>;
  }) {
    const actor = await resolveDiscountHistoryActor();
    const rows = input.newSnapshots.flatMap(({ compareKey, snapshot }) => {
      const oldSnapshot = input.oldSnapshots.get(compareKey) ?? null;
      const actionType = determineDiscountHistoryAction(oldSnapshot, snapshot);
      if (!actionType) return [];
      return [{
        discount_id: snapshot.discount_id,
        product_id: input.productId,
        discount_group: snapshot.discount_group,
        action_type: actionType,
        old_snapshot: oldSnapshot,
        new_snapshot: snapshot,
        changed_by: actor.changed_by,
        changed_by_name: actor.changed_by_name,
        reason: null,
      }];
    });

    if (rows.length === 0) return;

    const { error } = await supabase.from('product_discount_history').insert(rows);
    if (error) {
      console.warn('[discount-history] Failed to insert discount history rows.', error);
    }
  }

  async function ensureProductRecord() {
    let productId = draftProductId ?? editProductId ?? null;

    if (
      !formValues.productName ||
      !formValues.skuCode ||
      !formValues.categoryId ||
      !formValues.brandId ||
      !formValues.description
    ) {
      throw new Error('Please complete required basic information fields first.');
    }

    if (productId) {
      const { error: updateProductError } = await supabase
        .from('products')
        .update({
          product_name: formValues.productName,
          sku_code: formValues.skuCode,
          category_id: formValues.categoryId,
          brand_id: formValues.brandId,
          description: formValues.description,
          status: formValues.status,
        })
        .eq('id', productId);

      if (updateProductError) {
        throw new Error(updateProductError.message);
      }

      return productId;
    }

    const { data: product, error: productError } = await supabase
      .from('products')
      .insert({
        product_name: formValues.productName,
        sku_code: formValues.skuCode,
        category_id: formValues.categoryId,
        brand_id: formValues.brandId,
        description: formValues.description,
        status: formValues.status,
      })
      .select('id')
      .single();

    if (productError || !product) {
      throw new Error(productError?.message ?? 'Failed to create product.');
    }

    productId = String(product.id);
    setDraftProductId(productId);
    return productId;
  }

  function validateForm() {
    if (
      !formValues.productName ||
      !formValues.skuCode ||
      !formValues.categoryId ||
      !formValues.brandId ||
      !formValues.description
    ) {
      setSubmitError('Please complete required basic information fields.');
      return false;
    }

    if (variations.length === 0) {
      setSubmitError('Please add at least one product variation before saving.');
      return false;
    }

    setSubmitError('');
    return true;
  }

  async function persistMediaForProduct(productId: string) {
    let latestMediaItems = mediaItems;
    const currentExistingMedia = mediaItems
      .filter((item) => item.isExisting)
      .map((item) => item.id);
    const removedExistingMediaIds = loadedExistingMediaIds.filter(
      (id) => !currentExistingMedia.includes(id),
    );

    if (removedExistingMediaIds.length > 0) {
      const removedMedia = loadedExistingMediaItems.filter((item) =>
        removedExistingMediaIds.includes(item.id),
      );
      const removablePaths = removedMedia
        .map((item) => item.mediaPath)
        .filter(Boolean) as string[];

      await supabase.from('product_media').delete().in('id', removedExistingMediaIds);
      if (removablePaths.length > 0) {
        await supabase.storage.from(mediaBucket).remove(removablePaths);
      }
    }

    const existingItems = mediaItems.filter((item) => item.isExisting);
    for (const [index, item] of existingItems.entries()) {
      await supabase
        .from('product_media')
        .update({
          sort_order: index,
          is_primary: item.id === mainMediaId,
          title: item.title || null,
          alt_text: item.altText || null,
        })
        .eq('id', item.id);
    }

    const newMediaItems = mediaItems.filter((item) => !item.isExisting && item.file);
    if (newMediaItems.length > 0) {
      const mediaRows: {
        product_id: string;
        media_type: 'image' | 'video';
        media_url: string;
        media_path: string;
        title: string | null;
        alt_text: string | null;
        is_primary: boolean;
        sort_order: number;
        status: 'Active';
        variation_id: null;
        thumbnail_url: null;
        thumbnail_path: null;
      }[] = [];

      for (const [index, item] of newMediaItems.entries()) {
        const file = item.file as File;
        const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const storagePath = `${productId}/${safeName}`;
        let usedBucket = mediaBucket;
        let uploadResult = await supabase.storage
          .from(usedBucket)
          .upload(storagePath, file, { upsert: false });

        if (
          uploadResult.error &&
          uploadResult.error.message.toLowerCase().includes('bucket')
        ) {
          usedBucket = mediaBucket === 'product-images' ? 'product-media' : 'product-images';
          uploadResult = await supabase.storage
            .from(usedBucket)
            .upload(storagePath, file, { upsert: false });
        }

        if (uploadResult.error) {
          throw new Error(`Media upload failed (${file.name}): ${uploadResult.error.message}`);
        }

        const { data: publicData } = supabase.storage.from(usedBucket).getPublicUrl(storagePath);
        mediaRows.push({
          product_id: productId,
          media_type: item.type,
          media_url: publicData.publicUrl,
          media_path: storagePath,
          title: item.title || null,
          alt_text: item.altText || null,
          is_primary: item.id === mainMediaId,
          sort_order: existingItems.length + index,
          status: 'Active',
          variation_id: null,
          thumbnail_url: null,
          thumbnail_path: null,
        });
      }

      const { data: insertedMediaRows, error: mediaError } = await supabase
        .from('product_media')
        .insert(mediaRows)
        .select('id, media_url, media_type, media_path, thumbnail_url, thumbnail_path, title, alt_text, is_primary');
      if (mediaError) throw new Error(mediaError.message);

      const insertedByPath = new Map<string, any>();
      (insertedMediaRows ?? []).forEach((row: any) => {
        insertedByPath.set(String(row.media_path ?? ''), row);
      });
      const pendingPaths = Array.from(insertedByPath.keys());
      const nextItems = mediaItems.map((item) => {
        if (item.isExisting || !item.file) return item;
        const path = pendingPaths.shift();
        if (!path) return item;
        const inserted = insertedByPath.get(path);
        if (!inserted) return item;
        return {
          ...item,
          id: String(inserted.id),
          previewUrl: String(inserted.media_url ?? item.previewUrl),
          isExisting: true,
          mediaPath: String(inserted.media_path ?? ''),
          thumbnailUrl: inserted.thumbnail_url ? String(inserted.thumbnail_url) : null,
          thumbnailPath: inserted.thumbnail_path ? String(inserted.thumbnail_path) : null,
          variationId: null,
          status: 'Active',
          file: undefined,
        };
      });
      latestMediaItems = nextItems;
      setMediaItems(nextItems);
      const existingNow = nextItems.filter((item) => item.isExisting);
      setLoadedExistingMediaItems(existingNow);
      setLoadedExistingMediaIds(existingNow.map((item) => item.id));
    }

    if (newMediaItems.length === 0) {
      const existingAfterSave = mediaItems.filter((item) => item.isExisting);
      latestMediaItems = existingAfterSave;
      setLoadedExistingMediaItems(existingAfterSave);
      setLoadedExistingMediaIds(existingAfterSave.map((item) => item.id));
    }

    const { data: primaryMediaRow } = await supabase
      .from('product_media')
      .select('id')
      .eq('product_id', productId)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle();

    await supabase
      .from('products')
      .update({ primary_media_id: primaryMediaRow?.id ?? null })
      .eq('id', productId);

    return latestMediaItems;
  }

  async function handleRegister() {
    if (!validateForm()) {
      return;
    }

    const unitValidationError = getVariationUnitValidationError(
      variationUnitOptions,
      variations,
      unitDefinitions,
      unitAliases,
    );
    if (unitValidationError) {
      setSubmitError(unitValidationError);
      setSaveNotice({ type: 'error', message: unitValidationError });
      return;
    }

    setIsSaving(true);
    setSubmitError('');
    setSaveNotice({ type: 'info', message: 'Saving product data...' });

    try {
      const productId = await ensureProductRecord();

      if (!productId) throw new Error('Product reference missing.');

      const persistedMediaItems = await persistMediaForProduct(productId);
      const oldDiscountSnapshots = await loadExistingDiscountHistorySnapshots(productId);

      const [
        { data: existingVariationRows, error: existingVariationError },
        { data: existingDiscountRows, error: existingDiscountError },
        { data: existingSurchargeRows, error: existingSurchargeError },
      ] = await Promise.all([
        supabase
          .from('product_variations')
          .select('id, sku_code, price_code')
          .eq('product_id', productId),
        supabase
          .from('product_discounts')
          .select('id')
          .eq('product_id', productId),
        supabase
          .from('product_surcharges')
          .select('id')
          .eq('product_id', productId),
      ]);
      if (existingVariationError) throw new Error(existingVariationError.message);
      if (existingDiscountError) throw new Error(existingDiscountError.message);
      if (existingSurchargeError) throw new Error(existingSurchargeError.message);

      const variationRows = variations.map((item, index) => ({
        id: getStableUuid(item.id),
        product_id: productId,
        branch_name: PRICE_CODE_META[item.priceCode]?.branchName ?? item.branchName,
        price_type: PRICE_CODE_META[item.priceCode]?.priceType ?? item.priceType,
        variation_name: item.variationName || null,
        class_name: item.className,
        price: parseNumber(item.price),
        sku_code: item.skuCode,
        stock_quantity: Math.max(0, parseInt(item.stockQuantity || '0', 10) || 0),
        availability: item.availability,
        price_code: item.priceCode || null,
        sort_order: index,
      }));
      const { data: insertedVariationRows, error: variationError } = await supabase
        .from('product_variations')
        .upsert(variationRows, { onConflict: 'id' })
        .select('id, variation_name, class_name, sku_code, price_code');
      if (variationError) throw new Error(variationError.message);

      await syncInventoryLinksForVariationRows({
        productId,
        variationRows,
      });

      const submittedVariationIds = new Set(variationRows.map((row) => String(row.id)));
      const removedVariationIds = ((existingVariationRows ?? []) as Array<Record<string, unknown>>)
        .map((row) => String(row.id ?? ''))
        .filter((id) => id && !submittedVariationIds.has(id));

      if (removedVariationIds.length > 0) {
        const { data: referencedVariationRows, error: referencedVariationError } = await supabase
          .from('order_items')
          .select('variation_id')
          .in('variation_id', removedVariationIds);
        if (referencedVariationError) throw new Error(referencedVariationError.message);

        const referencedVariationIds = new Set(
          ((referencedVariationRows ?? []) as Array<Record<string, unknown>>)
            .map((row) => String(row.variation_id ?? ''))
            .filter(Boolean),
        );
        const deletableVariationIds = removedVariationIds.filter((id) => !referencedVariationIds.has(id));
        const retiredVariationIds = removedVariationIds.filter((id) => referencedVariationIds.has(id));

        if (retiredVariationIds.length > 0) {
          const { error: retireVariationError } = await supabase
            .from('product_variations')
            .update({ availability: 'Unavailable' })
            .in('id', retiredVariationIds);
          if (retireVariationError) throw new Error(retireVariationError.message);
        }

        if (deletableVariationIds.length > 0) {
          const { error: deleteInventoryLinksError } = await supabase
            .from('inventory_item_variation_links')
            .delete()
            .in('product_variation_id', deletableVariationIds);
          if (deleteInventoryLinksError) throw new Error(deleteInventoryLinksError.message);

          const { error: deleteVariationError } = await supabase
            .from('product_variations')
            .delete()
            .in('id', deletableVariationIds);
          if (deleteVariationError) throw new Error(deleteVariationError.message);
        }
      }

      const variationLookup = new Map<string, string>();
      const variationClassLookup = new Map<string, string>();
      const variationIdsByCardKey = new Map<string, string[]>();
      (insertedVariationRows ?? []).forEach((row: any) => {
        const variationName = String(row.variation_name ?? row.class_name ?? '').trim();
        const skuCode = String(row.sku_code ?? '').trim();
        const priceCode = String(row.price_code ?? '');
        const rowId = String(row.id);
        const cardKey = buildVariationCardKey(variationName, skuCode);
        const scopedCardKey = `${cardKey}::${priceCode}`;
        const directRowKey = `${rowId}::${priceCode}`;
        const className = String(row.class_name ?? row.variation_name ?? 'Promo Class');

        [scopedCardKey, directRowKey].forEach((key) => {
          variationLookup.set(key, rowId);
          variationClassLookup.set(key, className);
        });
        variationIdsByCardKey.set(cardKey, [...(variationIdsByCardKey.get(cardKey) ?? []), rowId]);
      });

      const productImageMediaById = new Map(
        persistedMediaItems
          .filter((item) => item.isExisting && item.type === 'image' && !item.variationId)
          .map((item) => [item.id, item] as const),
      );
      const { error: variationMediaDeleteError } = await supabase
        .from('product_media')
        .delete()
        .eq('product_id', productId)
        .not('variation_id', 'is', null);
      if (variationMediaDeleteError) throw new Error(variationMediaDeleteError.message);

      const variationMediaRows = Object.entries(variationPreviewMediaByCardId).flatMap(
        ([cardKey, mediaId]) => {
          const sourceMedia = productImageMediaById.get(mediaId);
          const variationIdsForCard = variationIdsByCardKey.get(cardKey) ?? [];
          if (!sourceMedia || variationIdsForCard.length === 0) {
            return [];
          }
          return variationIdsForCard.map((variationId, index) => ({
            product_id: productId,
            variation_id: variationId,
            media_type: sourceMedia.type,
            media_url: sourceMedia.previewUrl,
            media_path: sourceMedia.mediaPath,
            thumbnail_url: sourceMedia.thumbnailUrl ?? null,
            thumbnail_path: sourceMedia.thumbnailPath ?? null,
            title: sourceMedia.title || null,
            alt_text: sourceMedia.altText || null,
            is_primary: true,
            sort_order: index,
            status: 'Active',
          }));
        },
      );
      if (variationMediaRows.length > 0) {
        const { error: variationMediaError } = await supabase
          .from('product_media')
          .insert(variationMediaRows as any[]);
        if (variationMediaError) throw new Error(variationMediaError.message);
      }

      const resolveVariationDbId = (variationIdOrKey: string, priceCode: string) => {
        const normalizedVariationKey = String(variationIdOrKey).trim().toLowerCase();
        const normalizedScopedKey = `${normalizedVariationKey}::${priceCode}`;
        const byKey =
          variationLookup.get(`${variationIdOrKey}::${priceCode}`) ??
          variationLookup.get(normalizedScopedKey);
        if (byKey) return byKey;
        const fallbackByVariation = Array.from(variationLookup.entries()).find(([key]) =>
          key.startsWith(`${normalizedVariationKey}::`),
        );
        if (fallbackByVariation) {
          return fallbackByVariation[1];
        }
        const fallbackByPriceCode = Array.from(variationLookup.entries()).find(([key]) =>
          key.endsWith(`::${priceCode}`),
        );
        return fallbackByPriceCode?.[1] ?? null;
      };

      const resolveVariationClassName = (
        variationIdOrKey: string,
        priceCode: string,
        fallbackName: string,
      ) => {
        const normalizedScopedKey = `${String(variationIdOrKey).trim().toLowerCase()}::${priceCode}`;
        return (
          variationClassLookup.get(`${variationIdOrKey}::${priceCode}`) ??
          variationClassLookup.get(normalizedScopedKey) ??
          fallbackName
        );
      };

      const resolveRepresentativeVariationDbId = (variationIdOrKey: string) => {
        for (const priceCode of ['R1', 'R2', 'W1', 'W2', 'SP', 'CP']) {
          const variationId = resolveVariationDbId(variationIdOrKey, priceCode);
          if (variationId) {
            return variationId;
          }
        }
        return null;
      };

      const normalizedUnitOptions = variationUnitOptions.reduce<VariationUnitOptionItem[]>(
        (result, item, index) => {
          const variationDbId = resolveRepresentativeVariationDbId(item.variationId);
          if (!variationDbId || !item.unitCode.trim()) {
            return result;
          }

          const hasDefaultAlready = result.some(
            (current) => current.variationId === item.variationId && current.isDefault,
          );

          result.push({
            ...item,
            id: item.id || crypto.randomUUID(),
            variationId: variationDbId,
            unitCode: item.unitCode.trim().toLowerCase(),
            unitLabel:
              item.unitLabel.trim() ||
              getCanonicalUnitLabel(item.unitCode, unitDefinitions),
            baseUnitCode: item.baseUnitCode.trim().toLowerCase() || 'pc',
            quantityInBaseUnit: item.quantityInBaseUnit || '1',
            minOrderQuantity: item.minOrderQuantity || '1',
            orderIncrement: item.orderIncrement || '1',
            sortOrder: item.sortOrder || String(index),
            isDefault: item.isDefault && !hasDefaultAlready,
            isOrderable: item.isOrderable,
            weightValue: item.weightValue || '',
            weightUnit: normalizeWeightUnit(item.weightUnit),
            lengthValue: item.lengthValue || '',
            widthValue: item.widthValue || '',
            heightValue: item.heightValue || '',
            dimensionUnit: normalizeDimensionUnit(item.dimensionUnit),
            shippingNotes: item.shippingNotes || '',
          });
          return result;
        },
        [],
      );

      const unitOptionLookup = new Map<string, string>();
      const localUnitOptionLookup = new Map(
        variationUnitOptions.map((item) => [item.id, item] as const),
      );

      if (normalizedUnitOptions.length > 0) {
        const packagingSummaryByVariationId = new Map<string, string>();
        const normalizedUnitOptionsByVariation = normalizedUnitOptions.reduce<Map<string, VariationUnitOptionItem[]>>(
          (groups, item) => {
            groups.set(item.variationId, [...(groups.get(item.variationId) ?? []), item]);
            return groups;
          },
          new Map(),
        );
        normalizedUnitOptionsByVariation.forEach((items, variationId) => {
          const baseUnitCode =
            items.find((item) => item.isDefault)?.baseUnitCode ??
            items[0]?.baseUnitCode ??
            'pc';
          packagingSummaryByVariationId.set(
            variationId,
            generatePackagingSummary(items, baseUnitCode).summary,
          );
        });

        const persistedUnitOptionIdBySourceId = new Map(
          normalizedUnitOptions.map((item) => [item.id, getStableUuid(item.id)] as const),
        );
        const unitOptionRows = normalizedUnitOptions.map((item, index) => ({
          id: persistedUnitOptionIdBySourceId.get(item.id),
          variation_id: item.variationId,
          unit_code: item.unitCode,
          unit_label: item.unitLabel,
          base_unit_code: item.baseUnitCode,
          quantity_in_base_unit: Number(item.quantityInBaseUnit || '1') || 1,
          price_override: item.priceOverride ? parseNumber(item.priceOverride) : null,
          packaging_text: packagingSummaryByVariationId.get(item.variationId) || null,
          min_order_quantity: Number(item.minOrderQuantity || '1') || 1,
          order_increment: Number(item.orderIncrement || '1') || 1,
          is_default: item.isDefault,
          is_orderable: item.isOrderable,
          status: item.status,
          sort_order: Number(item.sortOrder || String(index)) || index,
          notes: item.notes || null,
          weight_value: parseNullableNonNegativeNumber(item.weightValue),
          weight_unit: normalizeWeightUnit(item.weightUnit),
          length_value: parseNullableNonNegativeNumber(item.lengthValue),
          width_value: parseNullableNonNegativeNumber(item.widthValue),
          height_value: parseNullableNonNegativeNumber(item.heightValue),
          dimension_unit: normalizeDimensionUnit(item.dimensionUnit),
          shipping_notes: item.shippingNotes || null,
        }));

        const { error: unitOptionInsertError } = await supabase
          .from('product_variation_unit_options')
          .upsert(unitOptionRows, { onConflict: 'id' })
          .select('id, variation_id, unit_code, sort_order');

        if (unitOptionInsertError) {
          throw new Error(unitOptionInsertError.message);
        }

        normalizedUnitOptions.forEach((item) => {
          const persistedId = persistedUnitOptionIdBySourceId.get(item.id);
          if (!persistedId) return;
          unitOptionLookup.set(item.id, persistedId);
        });

        const submittedUnitOptionIds = new Set(unitOptionRows.map((row) => String(row.id)));
        const submittedVariationIdsForUnits = Array.from(
          new Set(unitOptionRows.map((row) => String(row.variation_id))),
        );
        const { data: existingUnitRows, error: existingUnitError } = await supabase
          .from('product_variation_unit_options')
          .select('id')
          .in('variation_id', submittedVariationIdsForUnits);
        if (existingUnitError) throw new Error(existingUnitError.message);

        const removedUnitOptionIds = ((existingUnitRows ?? []) as Array<Record<string, unknown>>)
          .map((row) => String(row.id ?? ''))
          .filter((id) => id && !submittedUnitOptionIds.has(id));

        if (removedUnitOptionIds.length > 0) {
          const { data: referencedUnitRows, error: referencedUnitError } = await supabase
            .from('order_items')
            .select('unit_option_id')
            .in('unit_option_id', removedUnitOptionIds);
          if (referencedUnitError) throw new Error(referencedUnitError.message);

          const referencedUnitOptionIds = new Set(
            ((referencedUnitRows ?? []) as Array<Record<string, unknown>>)
              .map((row) => String(row.unit_option_id ?? ''))
              .filter(Boolean),
          );
          const deletableUnitOptionIds = removedUnitOptionIds.filter((id) => !referencedUnitOptionIds.has(id));
          const retiredUnitOptionIds = removedUnitOptionIds.filter((id) => referencedUnitOptionIds.has(id));

          if (retiredUnitOptionIds.length > 0) {
            const { error: retireUnitError } = await supabase
              .from('product_variation_unit_options')
              .update({ status: 'Inactive', is_orderable: false })
              .in('id', retiredUnitOptionIds);
            if (retireUnitError) throw new Error(retireUnitError.message);
          }

          if (deletableUnitOptionIds.length > 0) {
            const { error: deleteUnitError } = await supabase
              .from('product_variation_unit_options')
              .delete()
              .in('id', deletableUnitOptionIds);
            if (deleteUnitError) throw new Error(deleteUnitError.message);
          }
        }
      }

      const resolveRewardSelection = (item: {
        variationId: string;
        priceCode: string;
        rewardTargetType: string;
        rewardProductId: string;
        rewardVariationId: string;
        rewardUnitOptionId: string;
        rewardUnitCode: string;
      }) => {
        if (item.rewardTargetType === 'same_item') {
          const localRewardOption = localUnitOptionLookup.get(item.rewardUnitOptionId);
          const resolvedRewardUnitOptionId =
            unitOptionLookup.get(item.rewardUnitOptionId) ??
            (isUuid(item.rewardUnitOptionId) ? item.rewardUnitOptionId : null);

          return {
            rewardProductId: productId,
            rewardVariationId:
              resolveVariationDbId(item.variationId, item.priceCode) ?? '',
            rewardUnitOptionId: resolvedRewardUnitOptionId,
            rewardUnitCode:
              localRewardOption?.unitCode?.trim() || item.rewardUnitCode || null,
          };
        }

        return {
          rewardProductId: item.rewardProductId || null,
          rewardVariationId: item.rewardVariationId || null,
          rewardUnitOptionId: isUuid(item.rewardUnitOptionId)
            ? item.rewardUnitOptionId
            : null,
          rewardUnitCode: item.rewardUnitCode || null,
        };
      };

      const discountIdBySourceId = new Map<string, string>();
      const discountClassIdBySourceId = new Map<string, string>();
      const newDiscountHistorySnapshots: Array<{
        compareKey: string;
        snapshot: DiscountHistorySnapshot;
      }> = [];

      if (discounts.length > 0) {
        const discountEntries = Array.from(
          discounts.reduce<Map<string, { source: DiscountItem; index: number }>>((entries, item, index) => {
            const persistedId = getStableUuid(item.discountRecordId || item.id);
            if (!entries.has(persistedId)) {
              entries.set(persistedId, { source: item, index });
            }
            discountIdBySourceId.set(item.id, persistedId);
            return entries;
          }, new Map()),
        );
        const discountRows = discountEntries.map(([id, { source: item, index }]) => ({
          id,
          product_id: productId,
          discount_kind: item.discountKind || null,
          discount_name: item.discountName,
          discount_type: item.discountType,
          discount_percent:
            item.discountType === 'Percent' ? parseNumber(item.amount) : null,
          amount: item.discountType === 'Amount' ? parseNumber(item.amount) : null,
          description: item.description || null,
          status: item.status || 'Active',
          min_quantity: Math.max(1, parseInt(item.minQuantity || '1', 10)),
          max_quantity: item.maxQuantity ? parseInt(item.maxQuantity, 10) : null,
          branch_name: item.branchName || null,
          price_type: item.priceType || null,
          price_code: item.priceCode || null,
          calculation_method: normalizeCalculationMethod(item.calculationMethod),
          apply_sequence: Math.max(1, parseInt(item.applySequence || '1', 10)),
          discount_group: item.discountGroup || null,
          applies_to: item.appliesTo || null,
          stackable: item.stackable,
          priority: parseInt(item.priority || String(index), 10) || index,
          starts_at: item.startsAt || null,
          ends_at: item.endsAt || null,
        }));
        const { error: discountInsertError } = await supabase
          .from('product_discounts')
          .upsert(discountRows, { onConflict: 'id' })
          .select('id');
        if (discountInsertError) throw new Error(discountInsertError.message);

        const submittedDiscountIds = new Set(discountRows.map((row) => String(row.id)));
        const removedDiscountIds = ((existingDiscountRows ?? []) as Array<Record<string, unknown>>)
          .map((row) => String(row.id ?? ''))
          .filter((id) => id && !submittedDiscountIds.has(id));
        const submittedDiscountIdList = Array.from(submittedDiscountIds);
        if (submittedDiscountIdList.length > 0) {
          const { error: deleteDiscountClassError } = await supabase
            .from('product_discount_classes')
            .delete()
            .in('discount_id', submittedDiscountIdList);
          if (deleteDiscountClassError) throw new Error(deleteDiscountClassError.message);
        }

        const discountClassRows = discounts.map((source) => ({
                discount_id: discountIdBySourceId.get(source.id) ?? getStableUuid(source.discountRecordId || source.id),
                variation_id: resolveVariationDbId(source.variationId, source.priceCode),
                class_name: resolveVariationClassName(
                  source.variationId,
                  source.priceCode,
                  source.discountName || 'Discount Class',
                ),
                price_code: source.priceCode || null,
                branch_name: source.branchName || null,
                price_type: source.priceType || null,
                unit_option_id:
                  source.unitCondition === 'selected_unit'
                    ? unitOptionLookup.get(source.unitOptionId) ?? null
                    : null,
                order_unit_code:
                  source.unitCondition === 'selected_unit'
                    ? source.orderUnitCode || null
                    : null,
                unit_condition: source.unitCondition || 'any_unit',
                min_order_quantity: Math.max(
                  1,
                  Number(source.minOrderQuantity || source.minQuantity || '1') || 1,
                ),
                max_order_quantity: source.maxOrderQuantity
                  ? Number(source.maxOrderQuantity)
                  : null,
                min_base_quantity: source.minBaseQuantity
                  ? Number(source.minBaseQuantity)
                  : null,
                max_base_quantity: source.maxBaseQuantity
                  ? Number(source.maxBaseQuantity)
                  : null,
                unit_rule_label: null,
                unit_rule_notes: null,
              }));
        if (discountClassRows.length > 0) {
          const { data: insertedDiscountClassRows, error: classInsertError } = await supabase
            .from('product_discount_classes')
            .insert(discountClassRows as any[])
            .select('id, discount_id');
          if (classInsertError) throw new Error(classInsertError.message);
          (insertedDiscountClassRows ?? []).forEach((insertedRow: any, index: number) => {
            const source = discounts[index];
            if (source) {
              discountClassIdBySourceId.set(source.id, String(insertedRow.id));
            }
          });
        }

        if (removedDiscountIds.length > 0) {
          const { data: referencedDiscountRows, error: referencedDiscountError } = await supabase
            .from('order_items')
            .select('discount_id')
            .in('discount_id', removedDiscountIds);
          if (referencedDiscountError) throw new Error(referencedDiscountError.message);

          const referencedDiscountIds = new Set(
            ((referencedDiscountRows ?? []) as Array<Record<string, unknown>>)
              .map((row) => String(row.discount_id ?? ''))
              .filter(Boolean),
          );
          const deletableDiscountIds = removedDiscountIds.filter((id) => !referencedDiscountIds.has(id));
          const retiredDiscountIds = removedDiscountIds.filter((id) => referencedDiscountIds.has(id));

          if (retiredDiscountIds.length > 0) {
            const { error: retireDiscountError } = await supabase
              .from('product_discounts')
              .update({ status: 'Inactive' })
              .in('id', retiredDiscountIds);
            if (retireDiscountError) throw new Error(retireDiscountError.message);
          }

          if (deletableDiscountIds.length > 0) {
            const { error: deleteDiscountError } = await supabase
              .from('product_discounts')
              .delete()
              .in('id', deletableDiscountIds);
            if (deleteDiscountError) throw new Error(deleteDiscountError.message);
          }
        }

        discountEntries.forEach(([discountId, { source }]) => {
          const classRowsForSource = discountClassRows.filter((row) => row.discount_id === discountId);
          newDiscountHistorySnapshots.push({
            compareKey: source.discountGroup || source.discountRecordId || source.id,
            snapshot: buildDiscountSnapshotFromSource({
              productId,
              source,
              discountId,
              classRows: classRowsForSource,
            }),
          });
        });
      } else {
        const removedDiscountIds = ((existingDiscountRows ?? []) as Array<Record<string, unknown>>)
          .map((row) => String(row.id ?? ''))
          .filter(Boolean);

        if (removedDiscountIds.length > 0) {
          const { data: referencedDiscountRows, error: referencedDiscountError } = await supabase
            .from('order_items')
            .select('discount_id')
            .in('discount_id', removedDiscountIds);
          if (referencedDiscountError) throw new Error(referencedDiscountError.message);

          const referencedDiscountIds = new Set(
            ((referencedDiscountRows ?? []) as Array<Record<string, unknown>>)
              .map((row) => String(row.discount_id ?? ''))
              .filter(Boolean),
          );
          const deletableDiscountIds = removedDiscountIds.filter((id) => !referencedDiscountIds.has(id));
          const retiredDiscountIds = removedDiscountIds.filter((id) => referencedDiscountIds.has(id));

          if (retiredDiscountIds.length > 0) {
            const { error: retireDiscountError } = await supabase
              .from('product_discounts')
              .update({ status: 'Inactive' })
              .in('id', retiredDiscountIds);
            if (retireDiscountError) throw new Error(retireDiscountError.message);
          }

          if (deletableDiscountIds.length > 0) {
            const { error: deleteDiscountError } = await supabase
              .from('product_discounts')
              .delete()
              .in('id', deletableDiscountIds);
            if (deleteDiscountError) throw new Error(deleteDiscountError.message);
          }
        }
      }

      const derivedPromoSurcharges: SurchargeItem[] = discounts
        .filter((item) => item.hasPromo)
        .map((item, index) => ({
          id: item.promoSourceSurchargeId || `promo-${item.id || index}`,
          linkedDiscountId: discountIdBySourceId.get(item.id) ?? '',
          linkedDiscountClassId: discountClassIdBySourceId.get(item.id) ?? '',
          variationId: item.variationId,
          surchargeName: item.discountName || 'Promo / Freebie',
          surchargeType: item.promoType || 'Freebie',
          amount: '',
          freeQuantity: item.promoRewardQuantity || '0',
          minQuantity: item.minOrderQuantity || item.minQuantity || '1',
          maxQuantity: item.maxOrderQuantity || item.maxQuantity || '',
          branchName: item.branchName,
          priceType: item.priceType,
          priceCode: item.priceCode,
          description: '',
          status: item.status,
          priority: item.priority || String(index),
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          unitOptionId: item.unitOptionId,
          orderUnitCode: item.orderUnitCode,
          unitCondition: item.unitCondition,
          minOrderQuantity: item.minOrderQuantity || item.minQuantity || '1',
          maxOrderQuantity: item.maxOrderQuantity || item.maxQuantity || '',
          minBaseQuantity: item.minBaseQuantity,
          maxBaseQuantity: item.maxBaseQuantity,
          rewardUnitCode: item.promoRewardUnitCode,
          rewardQuantity: item.promoRewardQuantity || '0',
          rewardLabel:
            item.promoRewardLabel ||
            (item.promoRewardQuantity && item.promoRewardUnitCode
              ? `free ${item.promoRewardQuantity} ${item.promoRewardUnitCode}${
                  item.promoRewardTargetType === 'different_item' && item.promoRewardProductLabel
                    ? ` of ${item.promoRewardProductLabel}`
                    : item.promoRewardTargetType === 'same_item'
                      ? ' of this item'
                      : ''
                }`
              : ''),
          unitRuleLabel: '',
          unitRuleNotes: '',
          rewardTargetType: item.promoRewardTargetType,
          rewardProductId: item.promoRewardTargetType === 'same_item' ? productId : item.promoRewardProductId,
          rewardVariationId:
            item.promoRewardTargetType === 'same_item' ? resolveVariationDbId(item.variationId, item.priceCode) ?? '' : item.promoRewardVariationId,
          rewardUnitOptionId: item.promoRewardUnitOptionId,
          rewardRepeatMode: item.promoRewardRepeatMode,
          rewardEveryQuantity:
            item.promoRewardRepeatMode === 'every'
              ? item.promoRewardEveryQuantity || item.minOrderQuantity || '1'
              : '',
          qualificationScope: item.promoQualificationScope || 'line',
        }));

      const allSurchargesToSave = [...surcharges, ...derivedPromoSurcharges];

      const resolvedSurchargesToSave = allSurchargesToSave.map((item) => {
        const resolvedRewardSelection = resolveRewardSelection({
          variationId: item.variationId,
          priceCode: item.priceCode,
          rewardTargetType: item.rewardTargetType,
          rewardProductId: item.rewardProductId,
          rewardVariationId: item.rewardVariationId,
          rewardUnitOptionId: item.rewardUnitOptionId,
          rewardUnitCode: item.rewardUnitCode,
        });

        if (
          (item.surchargeType === 'Freebie' || item.surchargeType === 'BonusQty') &&
          !resolvedRewardSelection.rewardUnitOptionId
        ) {
          throw new Error('Reward unit option is required before saving promo/freebie.');
        }

        return {
          ...item,
          rewardProductId: resolvedRewardSelection.rewardProductId ?? '',
          rewardVariationId: resolvedRewardSelection.rewardVariationId ?? '',
          rewardUnitOptionId: resolvedRewardSelection.rewardUnitOptionId ?? '',
          rewardUnitCode: resolvedRewardSelection.rewardUnitCode ?? '',
        };
      });

      const persistedSurchargeIdBySourceId = resolvedSurchargesToSave.reduce<Map<string, string>>(
        (ids, item) => {
          const parentId =
            getSyntheticParentUuid(item.id) ||
            (isUuid(item.linkedDiscountId) && String(item.id).startsWith('promo-')
              ? item.linkedDiscountId
              : item.id);
          ids.set(item.id, getStableUuid(parentId));
          return ids;
        },
        new Map(),
      );
      const submittedSurchargeIds = new Set(Array.from(persistedSurchargeIdBySourceId.values()));
      const removedSurchargeIds = ((existingSurchargeRows ?? []) as Array<Record<string, unknown>>)
        .map((row) => String(row.id ?? ''))
        .filter((id) => id && !submittedSurchargeIds.has(id));

      if (resolvedSurchargesToSave.length > 0) {
        const surchargeEntries = Array.from(
          resolvedSurchargesToSave.reduce<Map<string, { source: SurchargeItem; index: number }>>(
            (entries, item, index) => {
              const persistedId = persistedSurchargeIdBySourceId.get(item.id) ?? getStableUuid(item.id);
              if (!entries.has(persistedId)) {
                entries.set(persistedId, { source: item, index });
              }
              return entries;
            },
            new Map(),
          ),
        );
        const surchargeRows = surchargeEntries.map(([id, { source: item, index }]) => ({
          id,
          product_id: productId,
          linked_discount_id: item.linkedDiscountId || null,
          surcharge_name: item.surchargeName,
          surcharge_type: item.surchargeType,
          surcharge_percent:
            item.surchargeType === 'Percent' ? parseNumber(item.amount) : null,
          amount: item.surchargeType === 'Amount' ? parseNumber(item.amount) : null,
          description: item.description || null,
          status: item.status || 'Active',
          free_quantity: parseInt(item.freeQuantity || '0', 10) || 0,
          free_item_label: item.rewardLabel || null,
          qualification_scope:
            item.surchargeType === 'Freebie' || item.surchargeType === 'BonusQty'
              ? item.qualificationScope || 'line'
              : 'line',
          reward_target_type: item.rewardTargetType || 'same_item',
          reward_product_id: item.rewardProductId || null,
          reward_variation_id: item.rewardVariationId || null,
          reward_unit_option_id: item.rewardUnitOptionId || null,
          reward_unit_code: item.rewardUnitCode || null,
          reward_repeat_mode: item.rewardRepeatMode || 'one_time',
          reward_every_quantity:
            item.rewardRepeatMode === 'every'
              ? Number(item.rewardEveryQuantity || item.minOrderQuantity || '1')
              : null,
          min_quantity: Math.max(1, parseInt(item.minQuantity || '1', 10)),
          max_quantity: item.maxQuantity ? parseInt(item.maxQuantity, 10) : null,
          branch_name: item.branchName || null,
          price_type: item.priceType || null,
          price_code: item.priceCode || null,
          priority: parseInt(item.priority || String(index), 10) || index,
          starts_at: item.startsAt || null,
          ends_at: item.endsAt || null,
        }));
        const { error: surchargeInsertError } = await supabase
          .from('product_surcharges')
          .upsert(surchargeRows, { onConflict: 'id' })
          .select('id');
        if (surchargeInsertError) throw new Error(surchargeInsertError.message);

        const submittedSurchargeIdList = Array.from(submittedSurchargeIds);
        if (submittedSurchargeIdList.length > 0) {
          const { error: deleteSurchargeClassError } = await supabase
            .from('product_surcharge_classes')
            .delete()
            .in('surcharge_id', submittedSurchargeIdList);
          if (deleteSurchargeClassError) throw new Error(deleteSurchargeClassError.message);
        }

        const classRows = resolvedSurchargesToSave.map((source) => ({
                surcharge_id: persistedSurchargeIdBySourceId.get(source.id) ?? getStableUuid(source.id),
                linked_discount_class_id: source.linkedDiscountClassId || null,
                variation_id: resolveVariationDbId(source.variationId, source.priceCode),
                class_name: resolveVariationClassName(
                  source.variationId,
                  source.priceCode,
                  source.surchargeName || 'Promo Class',
                ),
                price_code: source.priceCode || null,
                branch_name: source.branchName || null,
                price_type: source.priceType || null,
                unit_option_id:
                  source.unitCondition === 'selected_unit'
                    ? unitOptionLookup.get(source.unitOptionId) ?? null
                    : null,
                order_unit_code:
                  source.unitCondition === 'selected_unit'
                    ? source.orderUnitCode || null
                    : null,
                unit_condition: source.unitCondition || 'any_unit',
                min_order_quantity: Math.max(
                  1,
                  Number(source.minOrderQuantity || source.minQuantity || '1') || 1,
                ),
                max_order_quantity: source.maxOrderQuantity
                  ? Number(source.maxOrderQuantity)
                  : null,
                min_base_quantity: source.minBaseQuantity
                  ? Number(source.minBaseQuantity)
                  : null,
                max_base_quantity: source.maxBaseQuantity
                  ? Number(source.maxBaseQuantity)
                  : null,
                reward_target_type: source.rewardTargetType || 'same_item',
                reward_product_id: source.rewardProductId || null,
                reward_variation_id: source.rewardVariationId || null,
                reward_unit_option_id: source.rewardUnitOptionId || null,
                reward_unit_code: source.rewardUnitCode || null,
                reward_quantity: source.rewardQuantity
                  ? Number(source.rewardQuantity)
                  : null,
                reward_label: source.rewardLabel || null,
                reward_repeat_mode: source.rewardRepeatMode || 'one_time',
                reward_every_quantity:
                  source.rewardRepeatMode === 'every'
                    ? Number(source.rewardEveryQuantity || source.minOrderQuantity || '1')
                    : null,
                unit_rule_label: null,
                unit_rule_notes: null,
              }));

        if (classRows.length > 0) {
          const { error: surchargeClassInsertError } = await supabase
            .from('product_surcharge_classes')
            .insert(classRows as any[]);
          if (surchargeClassInsertError) throw new Error(surchargeClassInsertError.message);
        }
      }

      if (removedSurchargeIds.length > 0) {
        const { data: referencedSurchargeRows, error: referencedSurchargeError } = await supabase
          .from('order_items')
          .select('promo_id')
          .in('promo_id', removedSurchargeIds);
        if (referencedSurchargeError) throw new Error(referencedSurchargeError.message);

        const referencedSurchargeIds = new Set(
          ((referencedSurchargeRows ?? []) as Array<Record<string, unknown>>)
            .map((row) => String(row.promo_id ?? ''))
            .filter(Boolean),
        );
        const deletableSurchargeIds = removedSurchargeIds.filter((id) => !referencedSurchargeIds.has(id));
        const retiredSurchargeIds = removedSurchargeIds.filter((id) => referencedSurchargeIds.has(id));

        if (retiredSurchargeIds.length > 0) {
          const { error: retireSurchargeError } = await supabase
            .from('product_surcharges')
            .update({ status: 'Inactive' })
            .in('id', retiredSurchargeIds);
          if (retireSurchargeError) throw new Error(retireSurchargeError.message);
        }

        if (deletableSurchargeIds.length > 0) {
          const { error: deleteSurchargeError } = await supabase
            .from('product_surcharges')
            .delete()
            .in('id', deletableSurchargeIds);
          if (deleteSurchargeError) throw new Error(deleteSurchargeError.message);
        }
      }

      await writeDiscountHistoryRows({
        productId,
        oldSnapshots: oldDiscountSnapshots,
        newSnapshots: newDiscountHistorySnapshots,
      });

      const { data: verifyProduct, error: verifyError } = await supabase
        .from('products')
        .select('id')
        .eq('id', productId)
        .single();
      if (verifyError || !verifyProduct) {
        throw new Error(
          verifyError?.message ?? 'Saved, but verification in products table failed.',
        );
      }

      setSaveNotice({
        type: 'success',
        message: `${isEditMode ? 'Product updated' : 'Product created'} successfully.`,
      });
      setSnackbar({
        type: 'success',
        message: `${isEditMode ? 'Product updated' : 'Product created'} successfully.`,
      });
      onSaved?.(productId, formValues.categoryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save product.';
      setSubmitError(message);
      setSaveNotice({ type: 'error', message });
      setSnackbar({ type: 'error', message });
    } finally {
      setIsSaving(false);
    }
  }

  const isEmbedded = layout === 'embedded';

  function handleBack() {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex > 0) {
      setActiveSection(sections[currentIndex - 1]);
    }
  }

  function handleBasicNext() {
    void handleSaveBasicInformation();
  }

  function handleMediaNext() {
    void handleSaveMediaSection();
  }

  async function handleSaveBasicInformation() {
    setIsSaving(true);
    setSubmitError('');

    try {
      const productId = await ensureProductRecord();
      setSaveNotice({
        type: 'success',
        message: 'Basic information saved successfully.',
      });
      setSnackbar({
        type: 'success',
        message: 'Basic information saved.',
      });
      onSaved?.(productId, formValues.categoryId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to save basic information.';
      setSubmitError(message);
      setSaveNotice({ type: 'error', message });
      setSnackbar({ type: 'error', message });
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveMediaSection() {
    setIsSaving(true);
    setSubmitError('');

    try {
      const productId = await ensureProductRecord();
      await persistMediaForProduct(productId);
      setSaveNotice({
        type: 'success',
        message: 'Images saved successfully.',
      });
      setSnackbar({
        type: 'success',
        message: 'Images saved.',
      });
      onSaved?.(productId, formValues.categoryId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save images.';
      setSubmitError(message);
      setSaveNotice({ type: 'error', message });
      setSnackbar({ type: 'error', message });
    } finally {
      setIsSaving(false);
    }
  }

  const isEditorLoading = isLoadingProduct || isLoadingLookups;

  return (
    <section
      className={`${styles.container} ${isEmbedded ? styles.containerEmbedded : ''} ${
        isEditMode ? styles.containerEdit : ''
      }`}
    >
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <h2 className={styles.title}>{isEditMode ? 'Edit Product' : 'Add Product'}</h2>
          <p className={styles.subtitle}>
            Update basic details, media, and pricing in one workspace.
          </p>
        </div>
        <div className={styles.navigation} role="tablist" aria-label="Product sections">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={activeSection === section}
              className={`${styles.navButton} ${
                activeSection === section ? styles.navButtonActive : ''
              }`}
              onClick={() => scrollToSection(section)}
            >
              {section}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {isEditorLoading ? (
          <section className={styles.editorSection} aria-busy="true" aria-live="polite">
            <div className={styles.sectionHeading}>
              <div className={`${styles.skeletonBlock} ${styles.skeletonTitle}`}></div>
            </div>
            <div className={styles.skeletonGrid}>
              <div className={styles.skeletonField}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}></div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonInput}`}></div>
              </div>
              <div className={styles.skeletonField}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}></div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonInput}`}></div>
              </div>
              <div className={styles.skeletonField}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}></div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonInput}`}></div>
              </div>
              <div className={styles.skeletonField}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}></div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonInput}`}></div>
              </div>
              <div className={`${styles.skeletonField} ${styles.skeletonFieldWide}`}>
                <div className={`${styles.skeletonBlock} ${styles.skeletonLabel}`}></div>
                <div className={`${styles.skeletonBlock} ${styles.skeletonTextarea}`}></div>
              </div>
            </div>
            <div className={styles.skeletonFooter}>
              <div className={`${styles.skeletonBlock} ${styles.skeletonButtonSecondary}`}></div>
              <div className={`${styles.skeletonBlock} ${styles.skeletonButtonPrimary}`}></div>
            </div>
          </section>
        ) : null}
        {submitError ? <p className={styles.placeholderText}>{submitError}</p> : null}
        {saveNotice ? (
          <p
            className={`${styles.saveNotice} ${
              saveNotice.type === 'success'
                ? styles.saveNoticeSuccess
                : saveNotice.type === 'error'
                  ? styles.saveNoticeError
                  : styles.saveNoticeInfo
            }`}
          >
            {saveNotice.message}
          </p>
        ) : null}

        {!isEditorLoading && activeSection === 'Basic Information' ? (
          <section ref={basicInformationRef} className={styles.editorSection}>
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle}>Basic Information</h3>
            </div>
            <BasicInformation
              onCancel={onCancel}
              onNext={handleBasicNext}
              nextLabel="Save"
              value={formValues}
              onChange={setFormValues}
              categories={categories}
              brands={brands}
            />
          </section>
        ) : null}

        {!isEditorLoading && activeSection === 'Images' ? (
          <section ref={imagesRef} className={styles.editorSection}>
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle}>Images</h3>
            </div>
            <Media
              onBack={handleBack}
              onNext={handleMediaNext}
              nextLabel="Save"
              items={mediaItems}
              mainMediaId={mainMediaId}
              onChange={setMediaItems}
              onMainMediaChange={setMainMediaId}
            />
          </section>
        ) : null}

        {!isEditorLoading && activeSection === 'Variation & Pricing' ? (
          <section ref={variationRef} className={styles.editorSection}>
            <div className={styles.sectionHeading}>
              <h3 className={styles.sectionTitle}>Variation & Pricing</h3>
            </div>
            <VarAndPrice
              onBack={handleBack}
              onNext={() => void handleRegister()}
              onNextLabel="Save Product"
              isSubmitting={isSaving}
              isLoading={isLoadingProduct}
              defaultBaseSku={formValues.skuCode}
              items={variations}
              unitDefinitions={unitDefinitions}
              unitAliases={unitAliases}
              unitOptions={variationUnitOptions}
              mediaItems={mediaItems}
              mainMediaId={mainMediaId}
              variationPreviewMediaByCardId={variationPreviewMediaByCardId}
              discounts={discounts}
              surcharges={surcharges}
              onChange={setVariations}
              onUnitOptionsChange={setVariationUnitOptions}
              onVariationPreviewMediaChange={setVariationPreviewMediaByCardId}
              onDiscountsChange={setDiscounts}
              onSurchargesChange={setSurcharges}
            />
          </section>
        ) : null}
      </div>

      {snackbar ? (
        <div
          className={`${styles.snackbar} ${
            snackbar.type === 'success'
              ? styles.snackbarSuccess
              : snackbar.type === 'error'
                ? styles.snackbarError
                : styles.snackbarInfo
          }`}
        >
          {snackbar.message}
        </div>
      ) : null}
    </section>
  );
}
