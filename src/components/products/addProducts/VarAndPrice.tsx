import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './VarAndPrice.module.css';
import { supabase } from '../../../lib/supabase';
import {
  applyDurationPreset,
  datetimeLocalToIso,
  formatDiscountDateRange,
  getActivationMode,
  getDefaultScheduledStart,
  getDiscountDerivedState,
  getDiscountKindLabel,
  toDatetimeLocalValue,
  validateDiscountTiming,
  type DiscountActivationMode,
  type PromoDurationPreset,
  type PromoValidityMode,
} from './discountLifecycle';
import { generatePackagingSummary } from './packagingParser';
import type {
  DiscountItem,
  DiscountKind,
  ProductUnitAliasDefinition,
  ProductUnitDefinition,
  QualificationScope,
  RewardRepeatMode,
  RewardTargetType,
  SurchargeItem,
  UnitCondition,
  MediaItem,
  VariationItem,
  VariationUnitOptionItem,
} from './types';

type VarAndPriceProps = {
  onBack?: () => void;
  onNext?: () => void;
  onNextLabel?: string;
  isSubmitting?: boolean;
  isLoading?: boolean;
  defaultBaseSku?: string;
  items: VariationItem[];
  unitDefinitions: ProductUnitDefinition[];
  unitAliases: ProductUnitAliasDefinition[];
  unitOptions: VariationUnitOptionItem[];
  mediaItems: MediaItem[];
  mainMediaId: string | null;
  variationPreviewMediaByCardId: Record<string, string>;
  discounts: DiscountItem[];
  surcharges: SurchargeItem[];
  onChange: (items: VariationItem[]) => void;
  onUnitOptionsChange: (items: VariationUnitOptionItem[]) => void;
  onVariationPreviewMediaChange: (items: Record<string, string>) => void;
  onDiscountsChange: (items: DiscountItem[]) => void;
  onSurchargesChange: (items: SurchargeItem[]) => void;
  showFooterActions?: boolean;
};

type PriceCode = 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP';

type VariationCard = {
  id: string;
  variationName: string;
  baseSku: string;
  stockQuantity: string;
  availability: VariationItem['availability'];
  rowIds: Partial<Record<PriceCode, string>>;
  prices: Record<PriceCode, string>;
};

const WEIGHT_UNITS = ['mg', 'g', 'kg', 'lb'] as const;
const DIMENSION_UNITS = ['mm', 'cm', 'm', 'in'] as const;

type WeightUnit = VariationUnitOptionItem['weightUnit'];
type DimensionUnit = VariationUnitOptionItem['dimensionUnit'];

type DiscountDraftRow = {
  id: string;
  adjustmentKind: 'Discount' | 'Surcharge';
  discountKind: DiscountKind;
  discountName: string;
  discountType: DiscountItem['discountType'];
  amount: string;
  calculationMethod: DiscountItem['calculationMethod'];
  applySequence: string;
  discountGroup: string;
  unitCondition: UnitCondition;
  unitOptionId: string;
  minOrderQuantity: string;
  maxOrderQuantity: string;
  status: DiscountItem['status'];
  startsAt: string;
  endsAt: string;
  promoValidityMode: PromoValidityMode;
  promoDurationPreset: PromoDurationPreset;
  stackable: boolean;
  hasPromo: boolean;
  promoType: DiscountItem['promoType'];
  promoRewardUnitCode: string;
  promoRewardQuantity: string;
  promoSourceSurchargeId: string;
  promoRewardTargetType: RewardTargetType;
  promoRewardProductId: string;
  promoRewardProductLabel: string;
  promoRewardVariationId: string;
  promoRewardVariationLabel: string;
  promoRewardUnitOptionId: string;
  promoRewardRepeatMode: RewardRepeatMode;
  promoRewardEveryQuantity: string;
  promoQualificationScope: QualificationScope;
  promoRewardSearchQuery: string;
};

type RewardProductSearchItem = {
  id: string;
  productName: string;
  skuCode: string;
  brandName: string;
  categoryName: string;
};

type RewardVariationOption = {
  id: string;
  label: string;
};

function DuplicateIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
      <path
        d="M8 8h10v10H8V8z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

const PRICE_CODES: Array<{
  code: PriceCode;
  label: string;
  branchName: VariationItem['branchName'];
  priceType: VariationItem['priceType'];
}> = [
  { code: 'R1', label: 'Retail 1 (R1)', branchName: 'Manila', priceType: 'Retail' },
  { code: 'R2', label: 'Retail 2 (R2)', branchName: 'Cebu', priceType: 'Retail' },
  { code: 'W1', label: 'Wholesale 1 (W1)', branchName: 'Manila', priceType: 'Wholesale' },
  { code: 'W2', label: 'Wholesale 2 (W2)', branchName: 'Cebu', priceType: 'Wholesale' },
  { code: 'SP', label: 'Special', branchName: 'Both', priceType: 'Special' },
  { code: 'CP', label: 'Concept Store', branchName: 'Both', priceType: 'Concept Store' },
];

function buildVariationKey(variationName: string, baseSku: string) {
  return `${variationName.trim().toLowerCase()}::${baseSku.trim().toLowerCase()}`;
}

function toSkuToken(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildGroupKeyFromRow(item: VariationItem) {
  const normalizedVariationName = (item.variationName || item.className || '').trim().toLowerCase();
  const normalizedSku = item.skuCode.trim().toLowerCase();
  if (normalizedVariationName && normalizedSku) {
    return `${normalizedVariationName}::${normalizedSku}`;
  }
  if (normalizedVariationName) {
    return `${normalizedVariationName}::`;
  }
  return `::${normalizedSku}`;
}

function formatPriceInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, '');
  const [rawInteger = '', rawDecimal = ''] = sanitized.split('.');
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = Number(normalizedInteger).toLocaleString('en-US');
  const limitedDecimal = rawDecimal.slice(0, 2);
  return sanitized.includes('.') ? `${formattedInteger}.${limitedDecimal}` : formattedInteger;
}

function toPriceCode(value: string): PriceCode | null {
  const normalized = String(value ?? '').trim().toUpperCase();
  return PRICE_CODES.some((entry) => entry.code === normalized) ? (normalized as PriceCode) : null;
}

function parseNumberInput(value: string) {
  return Number(String(value).replace(/,/g, '')) || 0;
}

function normalizeAdjustmentValue(value: string) {
  const trimmed = String(value ?? '').replace(/,/g, '').trim();
  if (!trimmed) return '';
  const numeric = Number(trimmed);
  if (!Number.isFinite(numeric)) {
    return trimmed.toLowerCase();
  }
  return String(numeric);
}

function getAdjustmentDuplicateKey(row: Pick<DiscountDraftRow, 'adjustmentKind' | 'discountType' | 'amount'>) {
  const normalizedValue = normalizeAdjustmentValue(row.amount);
  if (!normalizedValue) return '';
  return [row.adjustmentKind, row.discountType, normalizedValue].join('::');
}

function getAdjustmentDuplicateMessage(row: Pick<DiscountDraftRow, 'adjustmentKind' | 'discountType' | 'amount'>) {
  const normalizedValue = normalizeAdjustmentValue(row.amount);
  const valueTypeLabel = row.discountType === 'Amount' ? 'Fixed Amount' : 'Percent';
  const valueLabel = row.discountType === 'Percent' ? `${normalizedValue}%` : normalizedValue;
  return `Duplicate adjustment. This ${row.adjustmentKind} / ${valueTypeLabel} / ${valueLabel} already exists in the stack.`;
}

function parseNullableNumberInput(value: string) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function sanitizeNonNegativeNumericInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, '');
  const [integer = '', ...decimalParts] = sanitized.split('.');
  const decimal = decimalParts.join('');
  return decimalParts.length > 0 ? `${integer}.${decimal}` : integer;
}

function normalizeWeightUnit(value: unknown): WeightUnit {
  return WEIGHT_UNITS.includes(value as WeightUnit) ? (value as WeightUnit) : 'kg';
}

function normalizeDimensionUnit(value: unknown): DimensionUnit {
  return DIMENSION_UNITS.includes(value as DimensionUnit) ? (value as DimensionUnit) : 'cm';
}

function formatPhysicalSummary(option: VariationUnitOptionItem) {
  const weight = parseNullableNumberInput(option.weightValue);
  const length = parseNullableNumberInput(option.lengthValue);
  const width = parseNullableNumberInput(option.widthValue);
  const height = parseNullableNumberInput(option.heightValue);
  const parts: string[] = [];

  if (weight !== null) {
    parts.push(`${option.weightValue} ${option.weightUnit}`);
  }

  if (length !== null && width !== null && height !== null) {
    parts.push(`${option.lengthValue} x ${option.widthValue} x ${option.heightValue} ${option.dimensionUnit}`);
  }

  return parts.join(' / ');
}

function formatCurrency(value: number) {
  return `PHP ${value.toLocaleString('en-US', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

function getComputedUnitPrice(card: VariationCard, priceCode: PriceCode, quantityInBaseUnit: string) {
  const basePrice = parseNumberInput(card.prices[priceCode]);
  const unitQuantity = Number(quantityInBaseUnit) || 1;
  return basePrice * unitQuantity;
}

function getDiscountAmountPreview(
  baseAmount: number,
  discountType: DiscountItem['discountType'],
  discountValue: string,
) {
  const amount = parseNumberInput(discountValue);
  if (!baseAmount || !amount) {
    return 0;
  }
  return discountType === 'Percent' ? baseAmount * (amount / 100) : Math.min(amount, baseAmount);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getAdjustmentValueLabel(
  kind: DiscountDraftRow['adjustmentKind'],
  type: DiscountItem['discountType'],
  value: string,
) {
  if (!value) return '-';
  const sign = kind === 'Surcharge' ? '+' : '-';
  return type === 'Percent'
    ? `${sign}${parseNumberInput(value)}%`
    : `${sign}${formatCurrency(parseNumberInput(value))}`;
}

function getAdjustmentPhrase(
  kind: DiscountDraftRow['adjustmentKind'],
  type: DiscountItem['discountType'],
  value: string,
) {
  if (!value.trim()) return '';
  const verb = kind === 'Surcharge' ? 'add' : 'less';
  return type === 'Percent' ? `${verb} ${parseNumberInput(value)}%` : `${verb} ${formatCurrency(parseNumberInput(value))}`;
}

function getSuggestedNameValue(
  kind: DiscountDraftRow['adjustmentKind'],
  type: DiscountItem['discountType'],
  value: string,
) {
  if (!value.trim()) return '';
  const sign = kind === 'Surcharge' ? '+' : '-';
  return type === 'Percent' ? `${sign}${parseNumberInput(value)}%` : `${sign}${formatCurrency(parseNumberInput(value))}`;
}

function pluralizeUnitLabel(unitLabel: string, quantity: string) {
  const trimmed = unitLabel.trim() || 'unit';
  const amount = Number(quantity || '1');
  if (amount === 1 || trimmed.endsWith('s')) return trimmed;
  if (trimmed.endsWith('x') || trimmed.endsWith('ch') || trimmed.endsWith('sh')) return `${trimmed}es`;
  return `${trimmed}s`;
}

function formatSignedValue(type: DiscountItem['discountType'] | SurchargeItem['surchargeType'], value: string) {
  if (!value) {
    return '-';
  }
  if (type === 'Percent') {
    return `-${value}%`;
  }
  return `-${formatCurrency(parseNumberInput(value))}`;
}

function formatQuantityLabel(quantity: string, unitCode: string) {
  if (!quantity) {
    return unitCode || 'unit';
  }
  return `${quantity} ${unitCode || 'unit'}`;
}

function toVariationCards(items: VariationItem[]): VariationCard[] {
  const grouped = new Map<string, VariationCard>();
  for (const item of items) {
    const groupKey = buildGroupKeyFromRow(item);
    const existing = grouped.get(groupKey);
    const code = toPriceCode(item.priceCode);
    if (!existing) {
      const next: VariationCard = {
        id: buildVariationKey(item.variationName || item.className || groupKey, item.skuCode || ''),
        variationName: item.variationName || item.className || 'Variation',
        baseSku: item.skuCode || '',
        stockQuantity: item.stockQuantity || '0',
        availability: item.availability || 'Available',
        rowIds: {},
        prices: { R1: '', R2: '', W1: '', W2: '', SP: '', CP: '' },
      };
      if (code) {
        next.prices[code] = item.price;
        next.rowIds[code] = item.id;
      }
      grouped.set(groupKey, next);
      continue;
    }
    if (code) {
      existing.prices[code] = item.price;
      existing.rowIds[code] = item.id;
    }
    if (!existing.baseSku && item.skuCode) {
      existing.baseSku = item.skuCode;
    }
    if (!existing.stockQuantity && item.stockQuantity) {
      existing.stockQuantity = item.stockQuantity;
    }
    if (!existing.variationName && (item.variationName || item.className)) {
      existing.variationName = item.variationName || item.className;
    }
  }
  return Array.from(grouped.values());
}

function flattenCards(cards: VariationCard[]): VariationItem[] {
  return cards.flatMap((card) =>
    PRICE_CODES.map((entry) => ({
      id: card.rowIds[entry.code] ?? crypto.randomUUID(),
      priceType: entry.priceType,
      variationName: card.variationName,
      className: card.variationName,
      priceCode: entry.code,
      branchName: entry.branchName,
      price: card.prices[entry.code],
      skuCode: card.baseSku,
      stockQuantity: card.stockQuantity || '0',
      availability: card.availability || 'Available',
    })),
  );
}

function countDiscountGroups(items: DiscountItem[]) {
  return new Set(items.map((item) => item.discountGroup?.trim() || item.id)).size;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return Boolean(value && uuidPattern.test(String(value).trim()));
}

function getSyntheticParentUuid(value: string | null | undefined) {
  const text = String(value ?? '').trim();
  if (isUuid(text)) return text;
  const possibleUuid = text.slice(0, 36);
  return isUuid(possibleUuid) ? possibleUuid : '';
}

function getDiscountParentKey(item: DiscountItem) {
  return item.discountRecordId || item.id;
}

function getSurchargeParentKey(item: SurchargeItem) {
  return getSyntheticParentUuid(item.id) || item.id;
}

function normalizeCloneValue(value: string | number | boolean | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function getUnitCodeForCloneFingerprint(
  unitOptions: VariationUnitOptionItem[],
  unitOptionId: string,
  fallbackCode: string,
) {
  const option = unitOptions.find((entry) => entry.id === unitOptionId);
  return option?.unitCode || fallbackCode;
}

function getRewardUnitCodeForCloneFingerprint(
  unitOptions: VariationUnitOptionItem[],
  unitOptionId: string,
  fallbackCode: string,
) {
  const option = unitOptions.find((entry) => entry.id === unitOptionId);
  return option?.unitCode || fallbackCode;
}

function getDiscountCloneFingerprint(
  item: DiscountItem,
  unitOptions: VariationUnitOptionItem[] = [],
  sourceVariationId = item.variationId,
  destinationVariationId = '',
) {
  const orderUnitCode = getUnitCodeForCloneFingerprint(
    unitOptions,
    item.unitOptionId,
    item.orderUnitCode,
  );
  const rewardUnitCode = getRewardUnitCodeForCloneFingerprint(
    unitOptions,
    item.promoRewardUnitOptionId,
    item.promoRewardUnitCode,
  );

  return [
    sourceVariationId,
    destinationVariationId,
    item.priceCode,
    item.discountKind,
    item.discountName,
    item.discountType,
    item.amount,
    item.calculationMethod,
    item.unitCondition,
    item.unitCondition === 'selected_unit' ? orderUnitCode : '',
    item.minOrderQuantity || item.minQuantity,
    item.maxOrderQuantity || item.maxQuantity,
    item.status,
    item.startsAt,
    item.endsAt,
    item.hasPromo,
    item.promoType,
    rewardUnitCode,
    item.promoRewardQuantity,
    item.promoRewardTargetType,
    item.promoRewardProductId,
    item.promoRewardVariationId,
    item.promoRewardRepeatMode,
    item.promoRewardEveryQuantity,
    item.promoQualificationScope,
  ].map(normalizeCloneValue).join('|');
}

function getSurchargeCloneFingerprint(
  item: SurchargeItem,
  unitOptions: VariationUnitOptionItem[] = [],
  sourceVariationId = item.variationId,
  destinationVariationId = '',
) {
  const orderUnitCode = getUnitCodeForCloneFingerprint(
    unitOptions,
    item.unitOptionId,
    item.orderUnitCode,
  );
  const rewardUnitCode = getRewardUnitCodeForCloneFingerprint(
    unitOptions,
    item.rewardUnitOptionId,
    item.rewardUnitCode,
  );

  return [
    sourceVariationId,
    destinationVariationId,
    item.priceCode,
    item.surchargeName,
    item.surchargeType,
    item.amount,
    item.freeQuantity,
    item.unitCondition,
    item.unitCondition === 'selected_unit' ? orderUnitCode : '',
    item.minOrderQuantity || item.minQuantity,
    item.maxOrderQuantity || item.maxQuantity,
    item.status,
    item.startsAt,
    item.endsAt,
    rewardUnitCode,
    item.rewardQuantity,
    item.rewardTargetType,
    item.rewardProductId,
    item.rewardVariationId,
    item.rewardRepeatMode,
    item.rewardEveryQuantity,
    item.qualificationScope,
  ].map(normalizeCloneValue).join('|');
}

function uniqueByCloneFingerprint<Item>(
  items: Item[],
  getFingerprint: (item: Item) => string,
) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const fingerprint = getFingerprint(item);
    if (seen.has(fingerprint)) {
      return false;
    }
    seen.add(fingerprint);
    return true;
  });
}

function inferPromoValidityMode(startsAt: string, endsAt: string): PromoValidityMode {
  return startsAt || endsAt ? 'Fixed' : 'Duration';
}

function getDurationLabel(preset: PromoDurationPreset) {
  switch (preset) {
    case '7d':
      return '7 Days';
    case '14d':
      return '14 Days';
    case '30d':
      return '30 Days';
    case '1m':
      return '1 Month';
    case '3m':
      return '3 Months';
    case 'custom':
      return 'Custom';
  }
}

function getPromoEffectiveStart(rule: Pick<DiscountDraftRow, 'startsAt'>) {
  return rule.startsAt || new Date().toISOString();
}

function createDefaultUnitOption(
  variationId: string,
  baseUnitCode: string,
  sortOrder = 0,
): VariationUnitOptionItem {
  return {
    id: crypto.randomUUID(),
    variationId,
    unitCode: baseUnitCode,
    unitLabel: baseUnitCode,
    baseUnitCode,
    quantityInBaseUnit: '1',
    priceOverride: '',
    packagingText: '',
    minOrderQuantity: '1',
    orderIncrement: '1',
    isDefault: true,
    isOrderable: true,
    status: 'Active',
    sortOrder: String(sortOrder),
    notes: '',
    weightValue: '',
    weightUnit: 'kg',
    lengthValue: '',
    widthValue: '',
    heightValue: '',
    dimensionUnit: 'cm',
    shippingNotes: '',
  };
}

const DEFAULT_UNIT_CHOICES: ProductUnitDefinition[] = [
  { code: 'pc', label: 'pc', status: 'Active' },
];

export default function VarAndPrice({
  onBack,
  onNext,
  onNextLabel = 'Save Product',
  isSubmitting = false,
  isLoading = false,
  defaultBaseSku = '',
  items,
  unitDefinitions,
  unitOptions,
  mediaItems,
  mainMediaId,
  variationPreviewMediaByCardId,
  discounts,
  surcharges,
  onChange,
  onUnitOptionsChange,
  onVariationPreviewMediaChange,
  onDiscountsChange,
  onSurchargesChange,
  showFooterActions = true,
}: VarAndPriceProps) {
  const cards = useMemo(() => toVariationCards(items), [items]);
  const activeUnits = useMemo(
    () =>
      unitDefinitions.filter((unit) => String(unit.status).toLowerCase() === 'active'),
    [unitDefinitions],
  );
  const unitChoices = useMemo(
    () => (activeUnits.length > 0 ? activeUnits : DEFAULT_UNIT_CHOICES),
    [activeUnits],
  );
  const selectableMediaItems = useMemo(
    () =>
      mediaItems.filter(
        (item) =>
          item.type === 'image' &&
          item.isExisting &&
          !item.variationId &&
          String(item.status ?? 'Active').toLowerCase() === 'active',
      ),
    [mediaItems],
  );
  const [variationModalError, setVariationModalError] = useState('');
  const [activeCard, setActiveCard] = useState<VariationCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VariationCard | null>(null);
  const [isVariationModalOpen, setVariationModalOpen] = useState(false);
  const [discountContext, setDiscountContext] = useState<{ variationId: string; code: PriceCode } | null>(null);
  const [activeVariationTabId, setActiveVariationTabId] = useState<string>('');
  const [duplicateTarget, setDuplicateTarget] = useState<VariationCard | null>(null);
  const [imageSelectorCardId, setImageSelectorCardId] = useState<string | null>(null);

  const [discountDraft, setDiscountDraft] = useState<DiscountDraftRow[]>([]);
  const [activeDiscountTabId, setActiveDiscountTabId] = useState<string>('');
  const [discountModalError, setDiscountModalError] = useState('');
  const [discountManagedIds, setDiscountManagedIds] = useState<Set<string>>(new Set());
  const [surchargeManagedIds, setSurchargeManagedIds] = useState<Set<string>>(new Set());
  const [draggingDiscountStackId, setDraggingDiscountStackId] = useState<string | null>(null);
  const [dragOverDiscountStackId, setDragOverDiscountStackId] = useState<string | null>(null);
  const [pendingRemoveDiscountGroupId, setPendingRemoveDiscountGroupId] = useState<string | null>(null);
  const [pendingDisablePromoGroupId, setPendingDisablePromoGroupId] = useState<string | null>(null);
  const [rewardSearchResults, setRewardSearchResults] = useState<Record<string, RewardProductSearchItem[]>>({});
  const [rewardVariationOptions, setRewardVariationOptions] = useState<Record<string, RewardVariationOption[]>>({});
  const [rewardUnitOptions, setRewardUnitOptions] = useState<Record<string, VariationUnitOptionItem[]>>({});
  const [, setRewardSearchLoading] = useState<Record<string, boolean>>({});
  const [, setRewardVariationLoading] = useState<Record<string, boolean>>({});
  const [, setRewardUnitLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isVariationModalOpen) {
      return;
    }

    const previousBodyOverflow = document.body.style.overflow;
    const previousDocumentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousDocumentOverflow;
    };
  }, [isVariationModalOpen]);

  useEffect(() => {
    const activeSearchRows = discountDraft.filter(
      (item) =>
        item.hasPromo &&
        item.promoRewardTargetType === 'different_item' &&
        item.promoRewardSearchQuery.trim().length >= 2,
    );
    if (activeSearchRows.length === 0) {
      return;
    }

    const timeout = window.setTimeout(() => {
      activeSearchRows.forEach((row) => {
        void searchRewardProducts(row.id, row.promoRewardSearchQuery.trim());
      });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [discountDraft]);

  useEffect(() => {
    discountDraft.forEach((row) => {
      if (
        row.hasPromo &&
        row.promoRewardTargetType === 'different_item' &&
        row.promoRewardProductId &&
        !rewardVariationOptions[row.id]
      ) {
        void loadRewardVariations(row.id, row.promoRewardProductId);
      }
      if (
        row.hasPromo &&
        row.promoRewardTargetType === 'different_item' &&
        row.promoRewardProductId &&
        !row.promoRewardProductLabel
      ) {
        void loadRewardProductDetails(row.id, row.promoRewardProductId);
      }
      if (
        row.hasPromo &&
        row.promoRewardTargetType === 'different_item' &&
        row.promoRewardVariationId &&
        !row.promoRewardVariationLabel
      ) {
        void loadRewardVariationDetails(row.id, row.promoRewardVariationId);
      }
      if (
        row.hasPromo &&
        row.promoRewardVariationId &&
        !rewardUnitOptions[row.id]
      ) {
        void loadRewardUnitOptions(row.id, row.promoRewardVariationId);
      }
    });
  }, [discountDraft, rewardVariationOptions, rewardUnitOptions]);

  useEffect(() => {
    if (cards.length === 0) {
      if (activeVariationTabId) {
        setActiveVariationTabId('');
      }
      return;
    }
    if (!activeVariationTabId || !cards.some((item) => item.id === activeVariationTabId)) {
      setActiveVariationTabId(cards[0].id);
    }
  }, [activeVariationTabId, cards]);

  useEffect(() => {
    if (discountDraft.length === 0) {
      if (activeDiscountTabId) {
        setActiveDiscountTabId('');
      }
      return;
    }
    const groups = getDiscountRuleGroups();
    const hasActiveGroup = groups.some(
      (group) =>
        group.groupKey === activeDiscountTabId ||
        group.rows.some((item) => item.id === activeDiscountTabId),
    );
    if (!activeDiscountTabId || !hasActiveGroup) {
      setActiveDiscountTabId(groups[0]?.groupKey ?? discountDraft[0].id);
    }
  }, [activeDiscountTabId, discountDraft]);

  useEffect(() => {
    if (!pendingRemoveDiscountGroupId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPendingRemoveDiscountGroupId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingRemoveDiscountGroupId]);

  useEffect(() => {
    if (!pendingDisablePromoGroupId) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPendingDisablePromoGroupId(null);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingDisablePromoGroupId]);

  function pushCards(nextCards: VariationCard[]) {
    onChange(flattenCards(nextCards));
  }

  async function searchRewardProducts(rowId: string, query: string) {
    setRewardSearchLoading((current) => ({ ...current, [rowId]: true }));
    const { data, error } = await supabase
      .from('products')
      .select(
        'id, product_name, sku_code, status, brands(brand_name), product_categories(category_title)',
      )
      .or(`product_name.ilike.%${query}%,sku_code.ilike.%${query}%`)
      .eq('status', 'Active')
      .limit(10);

    if (error) {
      setRewardSearchResults((current) => ({ ...current, [rowId]: [] }));
      setRewardSearchLoading((current) => ({ ...current, [rowId]: false }));
      return;
    }

    const mapped = ((data ?? []) as Array<Record<string, any>>).map((row) => ({
      id: String(row.id),
      productName: String(row.product_name ?? ''),
      skuCode: String(row.sku_code ?? ''),
      brandName: Array.isArray(row.brands)
        ? String(row.brands[0]?.brand_name ?? '')
        : String(row.brands?.brand_name ?? ''),
      categoryName: Array.isArray(row.product_categories)
        ? String(row.product_categories[0]?.category_title ?? '')
        : String(row.product_categories?.category_title ?? ''),
    }));
    setRewardSearchResults((current) => ({ ...current, [rowId]: mapped }));
    setRewardSearchLoading((current) => ({ ...current, [rowId]: false }));
  }

  async function loadRewardProductDetails(rowId: string, productId: string) {
    const { data } = await supabase
      .from('products')
      .select('id, product_name, sku_code')
      .eq('id', productId)
      .maybeSingle();
    if (!data) {
      return;
    }
    setDiscountDraft((current) =>
      current.map((item) =>
        item.id === rowId
          ? {
              ...item,
              promoRewardProductId: String(data.id ?? productId),
              promoRewardProductLabel: String(data.product_name ?? data.sku_code ?? productId),
              promoRewardSearchQuery:
                item.promoRewardSearchQuery || String(data.product_name ?? data.sku_code ?? ''),
            }
          : item,
      ),
    );
  }

  async function loadRewardVariations(rowId: string, productId: string) {
    setRewardVariationLoading((current) => ({ ...current, [rowId]: true }));
    const { data, error } = await supabase
      .from('product_variations')
      .select('id, variation_name, class_name, branch_name, price_type, price_code')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    if (error) {
      setRewardVariationOptions((current) => ({ ...current, [rowId]: [] }));
      setRewardVariationLoading((current) => ({ ...current, [rowId]: false }));
      return;
    }

    const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ''),
      label: [
        String(row.variation_name ?? row.class_name ?? 'Variation'),
        String(row.price_code ?? ''),
        String(row.branch_name ?? ''),
      ]
        .filter(Boolean)
        .join(' • '),
    }));
    setRewardVariationOptions((current) => ({ ...current, [rowId]: mapped }));
    setRewardVariationLoading((current) => ({ ...current, [rowId]: false }));
  }

  async function loadRewardVariationDetails(rowId: string, variationId: string) {
    const { data } = await supabase
      .from('product_variations')
      .select('id, variation_name, class_name, branch_name, price_code')
      .eq('id', variationId)
      .maybeSingle();
    if (!data) {
      return;
    }
    const label = [
      String(data.variation_name ?? data.class_name ?? 'Variation'),
      String(data.price_code ?? ''),
      String(data.branch_name ?? ''),
    ]
      .filter(Boolean)
      .join(' • ');
    setDiscountDraft((current) =>
      current.map((item) =>
        item.id === rowId
          ? { ...item, promoRewardVariationId: variationId, promoRewardVariationLabel: label }
          : item,
      ),
    );
  }

  async function loadRewardUnitOptions(rowId: string, variationId: string) {
    setRewardUnitLoading((current) => ({ ...current, [rowId]: true }));
    const { data, error } = await supabase
      .from('product_variation_unit_options')
      .select(
        'id, variation_id, unit_code, unit_label, base_unit_code, quantity_in_base_unit, price_override, packaging_text, min_order_quantity, order_increment, is_default, is_orderable, status, sort_order, notes, weight_value, weight_unit, length_value, width_value, height_value, dimension_unit, shipping_notes',
      )
      .eq('variation_id', variationId)
      .eq('status', 'Active')
      .order('sort_order', { ascending: true });

    if (error) {
      setRewardUnitOptions((current) => ({ ...current, [rowId]: [] }));
      setRewardUnitLoading((current) => ({ ...current, [rowId]: false }));
      return;
    }

    const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id ?? ''),
      variationId: String(row.variation_id ?? ''),
      unitCode: String(row.unit_code ?? ''),
      unitLabel: String(row.unit_label ?? row.unit_code ?? ''),
      baseUnitCode: String(row.base_unit_code ?? ''),
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
      weightUnit: normalizeWeightUnit(row.weight_unit),
      lengthValue: row.length_value === null || row.length_value === undefined ? '' : String(row.length_value),
      widthValue: row.width_value === null || row.width_value === undefined ? '' : String(row.width_value),
      heightValue: row.height_value === null || row.height_value === undefined ? '' : String(row.height_value),
      dimensionUnit: normalizeDimensionUnit(row.dimension_unit),
      shippingNotes: String(row.shipping_notes ?? ''),
    } satisfies VariationUnitOptionItem));
    setRewardUnitOptions((current) => ({ ...current, [rowId]: mapped }));
    setRewardUnitLoading((current) => ({ ...current, [rowId]: false }));
  }

  function getCardUnitOptions(cardId: string) {
    const cardUnitOptions = unitOptions
      .filter((item) => item.variationId === cardId)
      .sort((left, right) => Number(left.sortOrder || '0') - Number(right.sortOrder || '0'));

    if (cardUnitOptions.length === 0) {
      return [createDefaultUnitOption(cardId, 'pc')];
    }

    return cardUnitOptions;
  }

  function getVariationLabel(cardId: string) {
    const card = cards.find((item) => item.id === cardId);
    if (!card) {
      return 'selected variation';
    }
    return card.baseSku ? `${card.variationName} (${card.baseSku})` : card.variationName;
  }

  function getSelectedPreviewMedia(cardId: string) {
    const mediaId = variationPreviewMediaByCardId[cardId];
    if (!mediaId) {
      return null;
    }
    return selectableMediaItems.find((item) => item.id === mediaId) ?? null;
  }

  function setVariationPreviewMedia(cardId: string, mediaId: string) {
    onVariationPreviewMediaChange({
      ...variationPreviewMediaByCardId,
      [cardId]: mediaId,
    });
  }

  function clearVariationPreviewMedia(cardId: string) {
    const nextSelections = { ...variationPreviewMediaByCardId };
    delete nextSelections[cardId];
    onVariationPreviewMediaChange(nextSelections);
  }

  function getUniqueCopyName(originalName: string) {
    const baseName = `${originalName || 'Variation'} Copy`;
    const existingNames = new Set(cards.map((card) => card.variationName.trim().toLowerCase()));
    if (!existingNames.has(baseName.toLowerCase())) {
      return baseName;
    }
    let suffix = 2;
    while (existingNames.has(`${baseName} ${suffix}`.toLowerCase())) {
      suffix += 1;
    }
    return `${baseName} ${suffix}`;
  }

  function getUniqueCopySku(originalSku: string, copyName: string) {
    const sourceToken = toSkuToken(originalSku) || toSkuToken(copyName) || 'VARIATION';
    const baseSku = sourceToken.endsWith('-COPY') ? sourceToken : `${sourceToken}-COPY`;
    const existingSkus = new Set(cards.map((card) => card.baseSku.trim().toUpperCase()));
    if (!existingSkus.has(baseSku)) {
      return baseSku;
    }
    let suffix = 2;
    while (existingSkus.has(`${baseSku}-${suffix}`)) {
      suffix += 1;
    }
    return `${baseSku}-${suffix}`;
  }

  function duplicateVariation(card: VariationCard) {
    const nextName = getUniqueCopyName(card.variationName);
    const nextSku = getUniqueCopySku(card.baseSku, nextName);
    const nextId = buildVariationKey(nextName, nextSku);
    const sourceOptions = getCardUnitOptions(card.id);
    const defaultIndex = Math.max(0, sourceOptions.findIndex((item) => item.isDefault));
    const unitIdMap = new Map<string, string>();
    const copiedUnitOptions = sourceOptions.map((item, index) => {
      const nextUnitId = crypto.randomUUID();
      unitIdMap.set(item.id, nextUnitId);
      return {
        ...item,
        id: nextUnitId,
        variationId: nextId,
        priceOverride: '',
        isDefault: index === defaultIndex,
        isOrderable: item.isOrderable,
        sortOrder: String(index),
      };
    });
    const copyScopedAdjustmentGroup = (() => {
      const groupMap = new Map<string, string>();
      return (groupKey: string, fallbackId: string) => {
        const sourceGroupKey = groupKey || fallbackId;
        if (!sourceGroupKey) {
          return '';
        }
        const existingGroup = groupMap.get(sourceGroupKey);
        if (existingGroup) {
          return existingGroup;
        }
        const nextGroup = `${nextId}-${crypto.randomUUID()}`;
        groupMap.set(sourceGroupKey, nextGroup);
        return nextGroup;
      };
    })();
    const copyDiscountRecordId = (() => {
      const parentIdMap = new Map<string, string>();
      return (item: DiscountItem) => {
        const sourceParentKey = getDiscountParentKey(item);
        const existingParentId = parentIdMap.get(sourceParentKey);
        if (existingParentId) {
          return existingParentId;
        }
        const nextParentId = crypto.randomUUID();
        parentIdMap.set(sourceParentKey, nextParentId);
        return nextParentId;
      };
    })();
    const copySurchargeId = (() => {
      const parentIdMap = new Map<string, string>();
      const classIndexMap = new Map<string, number>();
      return (item: SurchargeItem) => {
        const sourceParentKey = getSurchargeParentKey(item);
        let nextParentId = parentIdMap.get(sourceParentKey);
        if (!nextParentId) {
          nextParentId = crypto.randomUUID();
          parentIdMap.set(sourceParentKey, nextParentId);
        }
        const classIndex = classIndexMap.get(sourceParentKey) ?? 0;
        classIndexMap.set(sourceParentKey, classIndex + 1);
        return classIndex === 0 ? nextParentId : `${nextParentId}-${classIndex}`;
      };
    })();
    const sourceDiscounts = uniqueByCloneFingerprint(
      discounts.filter((item) => {
        const priceCode = toPriceCode(item.priceCode);
        return Boolean(priceCode && matchesVariation(card.id, card.rowIds[priceCode])(item.variationId));
      }),
      (item) => getDiscountCloneFingerprint(item, unitOptions, card.id, nextId),
    );
    const sourceSurcharges = uniqueByCloneFingerprint(
      surcharges.filter((item) => {
        const priceCode = toPriceCode(item.priceCode);
        return Boolean(priceCode && matchesVariation(card.id, card.rowIds[priceCode])(item.variationId));
      }),
      (item) => getSurchargeCloneFingerprint(item, unitOptions, card.id, nextId),
    );
    const copiedDiscounts = sourceDiscounts
      .map((item, index) => {
        const copiedId = crypto.randomUUID();
        const copiedParentId = copyDiscountRecordId(item);
        return {
          ...item,
          id: copiedId,
          discountRecordId: copiedParentId,
          discountClassId: '',
          variationId: nextId,
          unitOptionId: unitIdMap.get(item.unitOptionId) ?? item.unitOptionId,
          promoRewardUnitOptionId: unitIdMap.get(item.promoRewardUnitOptionId) ?? item.promoRewardUnitOptionId,
          promoSourceSurchargeId: '',
          discountGroup: copyScopedAdjustmentGroup(item.discountGroup, item.id || copiedId),
          applySequence: item.applySequence || String(index + 1),
        };
      });
    const copiedSurcharges = sourceSurcharges
      .map((item, index) => ({
        ...item,
        id: copySurchargeId(item),
        linkedDiscountId: '',
        linkedDiscountClassId: '',
        variationId: nextId,
        unitOptionId: unitIdMap.get(item.unitOptionId) ?? item.unitOptionId,
        rewardVariationId:
          item.rewardTargetType === 'same_item' && matchesVariation(item.rewardVariationId)
            ? nextId
            : item.rewardVariationId,
        rewardUnitOptionId: unitIdMap.get(item.rewardUnitOptionId) ?? item.rewardUnitOptionId,
        priority: item.priority || String(index + 1),
      }));
    const nextCard = {
      ...card,
      id: nextId,
      variationName: nextName,
      baseSku: nextSku,
      rowIds: {},
    };

    pushCards([...cards, nextCard]);
    onUnitOptionsChange([...unitOptions, ...copiedUnitOptions]);
    onDiscountsChange([...discounts, ...copiedDiscounts]);
    onSurchargesChange([...surcharges, ...copiedSurcharges]);
    clearVariationPreviewMedia(nextId);
    setActiveVariationTabId(nextId);
    setActiveCard(nextCard);
    setVariationModalError('');
    setVariationModalOpen(true);
    setDuplicateTarget(null);
  }

  function getOrderableUnitOptions(cardId: string) {
    return getCardUnitOptions(cardId).filter(
      (item) =>
        String(item.status).toLowerCase() === 'active' &&
        item.unitCode.trim(),
    );
  }

  function getUnitOptionLabel(option?: VariationUnitOptionItem | null) {
    return option?.unitLabel?.trim() || option?.unitCode?.trim() || 'unit';
  }

  function getUnitDefinition(unitCode: string) {
    const normalizedUnitCode = unitCode.trim().toLowerCase();
    return unitChoices.find((unit) => unit.code.trim().toLowerCase() === normalizedUnitCode) ?? null;
  }

  function getCanonicalUnitLabel(unitCode: string) {
    const normalizedUnitCode = unitCode.trim().toLowerCase();
    return getUnitDefinition(normalizedUnitCode)?.label?.trim() || normalizedUnitCode;
  }

  function getDraftUnitOption(
    variationId: string,
    unitOptionId: string,
    orderUnitCode?: string,
  ) {
    const available = getOrderableUnitOptions(variationId);
    return (
      available.find((item) => item.id === unitOptionId) ??
      available.find((item) => item.unitCode === orderUnitCode) ??
      null
    );
  }

  function getRewardUnitOption(rowId: string, tier: DiscountDraftRow) {
    if (tier.promoRewardTargetType === 'same_item') {
      return getDraftUnitOption(
        discountContext?.variationId ?? '',
        tier.promoRewardUnitOptionId,
        tier.promoRewardUnitCode,
      );
    }
    return (
      (rewardUnitOptions[rowId] ?? []).find((item) => item.id === tier.promoRewardUnitOptionId) ??
      (rewardUnitOptions[rowId] ?? []).find((item) => item.unitCode === tier.promoRewardUnitCode) ??
      null
    );
  }

  function computeBaseQuantityPreview(
    variationId: string,
    unitCondition: UnitCondition,
    unitOptionId: string,
    quantity: string,
  ) {
    if (unitCondition !== 'selected_unit') {
      return '';
    }
    const option = getDraftUnitOption(variationId, unitOptionId);
    if (!option || !quantity) {
      return '';
    }
    const orderQty = Number(quantity);
    const baseQty = orderQty * (Number(option.quantityInBaseUnit) || 0);
    if (!Number.isFinite(baseQty) || baseQty <= 0) {
      return '';
    }
    return `${baseQty} ${option.baseUnitCode || option.unitCode}`;
  }

  function buildDiscountSummary(item: DiscountItem) {
    const valueLabel = formatSignedValue(item.discountType, item.amount);
    const promoLabel =
      item.hasPromo && item.promoRewardQuantity && item.promoRewardUnitCode
        ? ` + free ${item.promoRewardQuantity} ${item.promoRewardUnitCode}`
        : '';
    if (item.unitCondition === 'selected_unit') {
      const option = getDraftUnitOption(item.variationId, item.unitOptionId, item.orderUnitCode);
      const unitLabel = getUnitOptionLabel(option) || item.orderUnitCode || 'unit';
      const minQty = item.minOrderQuantity || item.minQuantity || '1';
      if (minQty && Number(minQty) > 1) {
        return `${valueLabel} when min ${formatQuantityLabel(minQty, unitLabel)}${promoLabel}`;
      }
      return `${valueLabel} applies to ${unitLabel} order${promoLabel}`;
    }
    return `${valueLabel} applies to any unit${promoLabel}`;
  }

  function buildPromoPreview(
    tier: DiscountDraftRow,
    orderUnitLabel: string,
    rewardUnitLabel: string,
  ) {
    if (!tier.hasPromo || !tier.promoRewardQuantity || !rewardUnitLabel) {
      return '';
    }
    const targetLabel =
      tier.promoRewardTargetType === 'same_item'
        ? 'this item'
        : tier.promoRewardProductLabel || 'selected item';
    if (tier.promoRewardRepeatMode === 'every' && tier.promoRewardEveryQuantity) {
      return `Every ${tier.promoRewardEveryQuantity} ${orderUnitLabel}, get ${tier.promoRewardQuantity} ${rewardUnitLabel} of ${targetLabel} free.`;
    }
    return `Buy at least ${tier.minOrderQuantity || '1'} ${orderUnitLabel}, get ${tier.promoRewardQuantity} ${rewardUnitLabel} of ${targetLabel} free once.`;
  }

  function buildStackingPreview(rows: DiscountDraftRow[], basePrice: number) {
    const orderedRows = normalizeDiscountRuleRows(rows, getDraftRuleKey(rows[0] ?? createEmptyDiscountDraft()));
    let remainingPrice = roundMoney(basePrice);
    const eligibleRows = orderedRows.filter((row) => {
      const minQuantity = parseNumberInput(row.minOrderQuantity || '1') || 1;
      const maxQuantity = parseNumberInput(row.maxOrderQuantity);
      const previewQuantity = minQuantity;
      if (row.status !== 'Active') return false;
      if (!row.amount.trim()) return false;
      if (previewQuantity < minQuantity) return false;
      if (maxQuantity > 0 && previewQuantity > maxQuantity) return false;
      if (row.unitCondition === 'selected_unit' && !row.unitOptionId) return false;
      return true;
    });

    const steps = eligibleRows.map((row) => {
      const before = remainingPrice;
      const amount = parseNumberInput(row.amount);
      const adjustmentAmount =
        row.discountType === 'Percent'
          ? (row.adjustmentKind === 'Surcharge' ? basePrice : before) * (amount / 100)
          : amount;
      remainingPrice =
        row.adjustmentKind === 'Surcharge'
          ? roundMoney(before + adjustmentAmount)
          : roundMoney(Math.max(0, before - Math.min(adjustmentAmount, before)));
      return {
        id: row.id,
        kind: row.adjustmentKind,
        label: getAdjustmentValueLabel(row.adjustmentKind, row.discountType, row.amount),
        before,
        after: remainingPrice,
        amount: roundMoney(row.adjustmentKind === 'Discount' ? Math.min(adjustmentAmount, before) : adjustmentAmount),
      };
    });
    const totalDiscount = roundMoney(
      steps
        .filter((step) => step.kind === 'Discount')
        .reduce((sum, step) => sum + step.amount, 0),
    );
    const totalSurcharge = roundMoney(
      steps
        .filter((step) => step.kind === 'Surcharge')
        .reduce((sum, step) => sum + step.amount, 0),
    );
    const effectiveDiscount = basePrice > 0 ? roundMoney((totalDiscount / basePrice) * 100) : 0;

    return {
      steps,
      finalPrice: remainingPrice,
      totalDiscount,
      totalSurcharge,
      effectiveDiscount,
    };
  }

  function buildDiscountRulePreview(
    rule: DiscountDraftRow,
    rows: DiscountDraftRow[],
    selectedOption: VariationUnitOptionItem | null,
  ) {
    if (rule.unitCondition === 'selected_unit' && !rule.unitOptionId) {
      return 'Select an order unit to complete this rule.';
    }
    if (!rule.minOrderQuantity || Number(rule.minOrderQuantity) <= 0) {
      return 'Enter a minimum order quantity.';
    }
    if (rows.length === 0) {
      return 'Add at least one discount stack.';
    }
    const missingStackIndex = rows.findIndex((row) => !row.amount.trim());
    if (missingStackIndex >= 0) {
      return `Enter a value for Stack ${missingStackIndex + 1}.`;
    }

    const unitLabel =
      rule.unitCondition === 'selected_unit'
        ? getUnitOptionLabel(selectedOption)
        : 'unit';
    const minQty = rule.minOrderQuantity || '1';
    const maxQty = rule.maxOrderQuantity;
    const minLabel = `${minQty} ${pluralizeUnitLabel(unitLabel, minQty)}`;
    const maxLabel = `${maxQty} ${pluralizeUnitLabel(unitLabel, maxQty)}`;
    const quantityText = maxQty
      ? `Orders from ${minLabel} to ${maxLabel}`
      : `Orders of ${minLabel} and above`;
    const stackText = rows
      .map((row) => getAdjustmentPhrase(row.adjustmentKind, row.discountType, row.amount))
      .filter(Boolean);
    const discountText = stackText.length > 1
      ? `${stackText.slice(0, -1).join(', then ')}, then ${stackText[stackText.length - 1]}`
      : stackText[0] ?? '';
    const prefixes = [
      rule.status === 'Inactive' ? 'INACTIVE' : '',
      rule.hasPromo ? 'PROMO ENABLED' : '',
    ].filter(Boolean);
    const prefixText = prefixes.length > 0 ? `${prefixes.join(' — ')} — ` : '';
    const promoText = rule.hasPromo ? ', with the configured reward' : '';

    return `${prefixText}${quantityText}: ${discountText}${promoText}.`;
  }

  function buildSuggestedDiscountName(
    rule: DiscountDraftRow,
    rows: DiscountDraftRow[],
    selectedOption: VariationUnitOptionItem | null,
  ) {
    if (!rule.minOrderQuantity || rows.length === 0 || rows.some((row) => !row.amount.trim())) {
      return '';
    }
    const unitLabel =
      rule.unitCondition === 'selected_unit'
        ? getUnitOptionLabel(selectedOption)
        : 'unit';
    const quantityText = `${rule.minOrderQuantity} ${pluralizeUnitLabel(unitLabel, rule.minOrderQuantity)}`;
    const discountText = rows
      .map((row) => getSuggestedNameValue(row.adjustmentKind, row.discountType, row.amount))
      .filter(Boolean)
      .join(' ');
    return `${quantityText} order ${discountText}`.trim();
  }

  function buildOrderQuantityPreview(
    variationId: string,
    rule: DiscountDraftRow,
    selectedOption: VariationUnitOptionItem | null,
  ) {
    if (rule.unitCondition !== 'selected_unit') {
      return 'Quantity preview depends on the unit selected during ordering.';
    }
    if (!selectedOption) {
      return 'Select an order unit to preview the converted base quantity.';
    }
    const minQty = rule.minOrderQuantity || '1';
    const basePreview = computeBaseQuantityPreview(
      variationId,
      rule.unitCondition,
      rule.unitOptionId,
      minQty,
    );
    if (!basePreview) {
      return 'Enter a minimum order quantity to preview the converted base quantity.';
    }
    const [baseQuantity, ...baseUnitParts] = basePreview.split(' ');
    const baseUnit = baseUnitParts.join(' ') || selectedOption.baseUnitCode || selectedOption.unitCode;
    return `${minQty} ${pluralizeUnitLabel(getUnitOptionLabel(selectedOption), minQty)} = ${baseQuantity} ${pluralizeUnitLabel(baseUnit, baseQuantity)}`;
  }

  function getPromoValidationMessage(rule: DiscountDraftRow, orderableOptions: VariationUnitOptionItem[]) {
    if (!rule.hasPromo) return '';
    if (!rule.promoRewardQuantity || Number(rule.promoRewardQuantity) <= 0) {
      return 'Enter a reward quantity greater than zero.';
    }
    if (!rule.promoRewardUnitOptionId || !rule.promoRewardUnitCode) {
      return 'Select a reward unit.';
    }
    if (
      rule.promoRewardTargetType === 'same_item' &&
      !orderableOptions.some(
        (option) =>
          option.id === rule.promoRewardUnitOptionId ||
          option.unitCode.trim().toLowerCase() === rule.promoRewardUnitCode.trim().toLowerCase(),
      )
    ) {
      return 'Select a reward unit from this item.';
    }
    if (
      rule.promoRewardTargetType === 'different_item' &&
      (!rule.promoRewardProductId || !rule.promoRewardVariationId || !rule.promoRewardUnitOptionId)
    ) {
      return 'Select the reward product, variation, and unit.';
    }
    if (
      rule.promoRewardRepeatMode === 'every' &&
      (!rule.promoRewardEveryQuantity || Number(rule.promoRewardEveryQuantity) <= 0)
    ) {
      return 'Enter an every-quantity trigger greater than zero.';
    }
    return '';
  }

  function createEmptyDiscountDraft(): DiscountDraftRow {
    return {
      id: crypto.randomUUID(),
      adjustmentKind: 'Discount',
      discountKind: '',
      discountName: '',
      discountType: 'Percent',
      amount: '',
      calculationMethod: 'Single',
      applySequence: '1',
      discountGroup: '',
      unitCondition: 'any_unit',
      unitOptionId: '',
      minOrderQuantity: '1',
      maxOrderQuantity: '',
      status: 'Inactive',
      startsAt: '',
      endsAt: '',
      promoValidityMode: 'Fixed',
      promoDurationPreset: '7d',
      stackable: true,
      hasPromo: false,
      promoType: 'Freebie',
      promoRewardUnitCode: '',
      promoRewardQuantity: '1',
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
      promoRewardSearchQuery: '',
    };
  }

  function createDiscountGroupId() {
    return `rule-${discountContext?.variationId ?? 'variation'}-${discountContext?.code ?? 'price'}-${crypto.randomUUID()}`;
  }

  function getDraftRuleKey(row: DiscountDraftRow) {
    return row.discountGroup.trim() || `legacy-${row.id}`;
  }

  function getDiscountRuleGroups(rows = discountDraft) {
    const groups = new Map<string, DiscountDraftRow[]>();
    rows.forEach((row) => {
      const key = getDraftRuleKey(row);
      groups.set(key, [...(groups.get(key) ?? []), row]);
    });

    return Array.from(groups.entries()).map(([groupKey, groupRows]) => ({
      groupKey,
      rows: groupRows
        .slice()
        .sort(
          (left, right) =>
            Number(left.applySequence || '1') -
            Number(right.applySequence || '1'),
      ),
    }));
  }

  function getDuplicateAdjustmentMessages(rows = discountDraft) {
    const messages = new Map<string, string>();
    getDiscountRuleGroups(rows).forEach((group) => {
      const rowsByKey = new Map<string, DiscountDraftRow[]>();
      group.rows.forEach((row) => {
        const key = getAdjustmentDuplicateKey(row);
        if (!key) return;
        rowsByKey.set(key, [...(rowsByKey.get(key) ?? []), row]);
      });
      rowsByKey.forEach((matchingRows) => {
        if (matchingRows.length <= 1) return;
        const message = getAdjustmentDuplicateMessage(matchingRows[0]);
        matchingRows.forEach((row) => messages.set(row.id, message));
      });
    });
    return messages;
  }

  function normalizeDiscountRuleRows(rows: DiscountDraftRow[], groupKey: string) {
    const rule = rows[0] ?? createEmptyDiscountDraft();
    const group = groupKey.startsWith('legacy-') ? createDiscountGroupId() : groupKey;
    const stacked = rows.length > 1;

    return rows.map((row, index) => ({
      ...row,
      adjustmentKind: row.adjustmentKind || 'Discount',
      discountKind: rule.discountKind,
      discountName: rule.discountName,
      unitCondition: rule.unitCondition,
      unitOptionId: rule.unitOptionId,
      minOrderQuantity: rule.minOrderQuantity || '1',
      maxOrderQuantity: rule.maxOrderQuantity,
      status: rule.status,
      startsAt: rule.startsAt,
      endsAt: rule.endsAt,
      promoValidityMode: rule.promoValidityMode,
      promoDurationPreset: rule.promoDurationPreset,
      hasPromo: rule.hasPromo,
      promoType: rule.promoType,
      promoRewardUnitCode: rule.promoRewardUnitCode,
      promoRewardQuantity: rule.promoRewardQuantity,
      promoSourceSurchargeId: rule.promoSourceSurchargeId,
      promoRewardTargetType: rule.promoRewardTargetType,
      promoRewardProductId: rule.promoRewardProductId,
      promoRewardProductLabel: rule.promoRewardProductLabel,
      promoRewardVariationId: rule.promoRewardVariationId,
      promoRewardVariationLabel: rule.promoRewardVariationLabel,
      promoRewardUnitOptionId: rule.promoRewardUnitOptionId,
      promoRewardRepeatMode: rule.promoRewardRepeatMode,
      promoRewardEveryQuantity: rule.promoRewardEveryQuantity,
      promoQualificationScope: rule.promoQualificationScope || 'line',
      applySequence: String(index + 1),
      discountGroup: group,
      stackable: stacked,
      calculationMethod: stacked ? ('Cascading' as const) : ('Single' as const),
    }));
  }

  function normalizeAllDiscountRules(rows = discountDraft) {
    return getDiscountRuleGroups(rows).flatMap((group) =>
      normalizeDiscountRuleRows(group.rows, group.groupKey),
    );
  }

  function replaceDiscountGroupRows(
    current: DiscountDraftRow[],
    matchGroupKey: string,
    nextGroupRows: DiscountDraftRow[],
    nextGroupKey = matchGroupKey,
  ) {
    const normalizedGroupRows = normalizeDiscountRuleRows(nextGroupRows, nextGroupKey);
    const nextRows: DiscountDraftRow[] = [];
    let inserted = false;

    current.forEach((row) => {
      if (getDraftRuleKey(row) !== matchGroupKey) {
        nextRows.push(row);
        return;
      }
      if (!inserted) {
        nextRows.push(...normalizedGroupRows);
        inserted = true;
      }
    });

    if (!inserted) {
      nextRows.push(...normalizedGroupRows);
    }

    return normalizeAllDiscountRules(nextRows);
  }

  function addDiscountRule() {
    const nextRule = {
      ...createEmptyDiscountDraft(),
      discountName: '',
      discountGroup: createDiscountGroupId(),
    };
    setDiscountDraft((current) => [...current, nextRule]);
    setActiveDiscountTabId(nextRule.discountGroup);
  }

  function addDiscountStack(groupKey: string) {
    const group = getDiscountRuleGroups().find((item) => item.groupKey === groupKey);
    const base = group?.rows[0] ?? createEmptyDiscountDraft();
    const resolvedGroupKey = groupKey.startsWith('legacy-') ? createDiscountGroupId() : groupKey;
    const existingGroupRows = (group?.rows ?? []).map((row) => ({
      ...row,
      discountGroup: resolvedGroupKey,
    }));
    const nextStack = {
      ...base,
      id: crypto.randomUUID(),
      discountName: '',
      adjustmentKind: 'Discount' as const,
      discountType: 'Percent' as const,
      amount: '',
      applySequence: String((group?.rows.length ?? 0) + 1),
      discountGroup: resolvedGroupKey,
      stackable: true,
      calculationMethod: 'Cascading' as const,
      hasPromo: false,
    };
    setDiscountDraft((current) =>
      replaceDiscountGroupRows(current, groupKey, [...existingGroupRows, nextStack], resolvedGroupKey),
    );
    setActiveDiscountTabId(resolvedGroupKey);
  }

  function updateDiscountRule(groupKey: string, patch: Partial<DiscountDraftRow>) {
    setDiscountModalError('');
    setDiscountDraft((current) =>
      normalizeAllDiscountRules(
        current.map((item) => (getDraftRuleKey(item) === groupKey ? { ...item, ...patch } : item)),
      ),
    );
  }

  function updateDiscountKind(groupKey: string, discountKind: DiscountKind) {
    const patch: Partial<DiscountDraftRow> = { discountKind };
    if (discountKind === 'Base') {
      patch.endsAt = '';
      patch.promoValidityMode = 'Fixed';
    }
    updateDiscountRule(groupKey, patch);
  }

  function updateDiscountActivation(groupKey: string, activationMode: DiscountActivationMode) {
    const group = getDiscountRuleGroups().find((item) => item.groupKey === groupKey);
    const rule = group?.rows[0];
    if (!rule) return;

    if (activationMode === 'Inactive') {
      updateDiscountRule(groupKey, { status: 'Inactive' });
      return;
    }

    if (activationMode === 'Scheduled') {
      updateDiscountRule(groupKey, {
        status: 'Active',
        startsAt: rule.startsAt && Date.parse(rule.startsAt) > Date.now()
          ? rule.startsAt
          : getDefaultScheduledStart(),
      });
      return;
    }

    const startsAt = '';
    const endsAt =
      rule.discountKind === 'Promo' && rule.promoValidityMode === 'Duration'
        ? applyDurationPreset(startsAt, rule.promoDurationPreset)
        : rule.endsAt;
    updateDiscountRule(groupKey, { status: 'Active', startsAt, endsAt });
  }

  function updateDiscountStart(groupKey: string, startsAt: string) {
    const group = getDiscountRuleGroups().find((item) => item.groupKey === groupKey);
    const rule = group?.rows[0];
    const endsAt =
      rule?.discountKind === 'Promo' && rule.promoValidityMode === 'Duration'
        ? applyDurationPreset(startsAt, rule.promoDurationPreset)
        : undefined;
    updateDiscountRule(groupKey, {
      startsAt,
      ...(endsAt !== undefined && endsAt ? { endsAt } : {}),
    });
  }

  function updatePromoValidityMode(groupKey: string, promoValidityMode: PromoValidityMode) {
    const group = getDiscountRuleGroups().find((item) => item.groupKey === groupKey);
    const rule = group?.rows[0];
    if (!rule) return;
    const endsAt =
      promoValidityMode === 'Duration'
        ? applyDurationPreset(getPromoEffectiveStart(rule), rule.promoDurationPreset)
        : rule.endsAt;
    updateDiscountRule(groupKey, { promoValidityMode, endsAt });
  }

  function updatePromoDurationPreset(groupKey: string, promoDurationPreset: PromoDurationPreset) {
    const group = getDiscountRuleGroups().find((item) => item.groupKey === groupKey);
    const rule = group?.rows[0];
    if (!rule) return;
    updateDiscountRule(groupKey, {
      promoDurationPreset,
      endsAt: applyDurationPreset(getPromoEffectiveStart(rule), promoDurationPreset) || rule.endsAt,
    });
  }

  function updateDiscountPromo(groupKey: string, patch: Partial<DiscountDraftRow>) {
    updateDiscountRule(groupKey, patch);
  }

  function enableDiscountPromo(groupKey: string, enabled: boolean) {
    const group = getDiscountRuleGroups().find((item) => item.groupKey === groupKey);
    const rule = group?.rows[0];
    if (!rule) return;

    if (!enabled && rule.hasPromo && rule.promoSourceSurchargeId) {
      setPendingDisablePromoGroupId(groupKey);
      return;
    }

    updateDiscountPromo(groupKey, { hasPromo: enabled });
  }

  function confirmDisableDiscountPromo() {
    if (!pendingDisablePromoGroupId) return;
    updateDiscountPromo(pendingDisablePromoGroupId, { hasPromo: false });
    setPendingDisablePromoGroupId(null);
  }

  function updateDiscountStack(rowId: string, patch: Partial<DiscountDraftRow>) {
    setDiscountModalError('');
    setDiscountDraft((current) =>
      normalizeAllDiscountRules(current.map((item) => (item.id === rowId ? { ...item, ...patch } : item))),
    );
  }

  function requestRemoveDiscountRule(groupKey: string) {
    setPendingRemoveDiscountGroupId(groupKey);
  }

  function confirmRemoveDiscountRule() {
    if (!pendingRemoveDiscountGroupId) return;
    setDiscountDraft((current) => {
      const groups = getDiscountRuleGroups(current);
      const removedIndex = groups.findIndex((item) => item.groupKey === pendingRemoveDiscountGroupId);
      const next = current.filter((item) => getDraftRuleKey(item) !== pendingRemoveDiscountGroupId);
      const nextGroups = getDiscountRuleGroups(next);
      const nextActiveGroup =
        nextGroups[Math.max(0, removedIndex - 1)] ?? nextGroups[removedIndex] ?? nextGroups[0] ?? null;
      setActiveDiscountTabId(nextActiveGroup?.groupKey ?? '');
      return next.length > 0 ? normalizeAllDiscountRules(next) : [];
    });
    setPendingRemoveDiscountGroupId(null);
  }

  function removeDiscountStack(rowId: string) {
    setDiscountDraft((current) => normalizeAllDiscountRules(current.filter((item) => item.id !== rowId)));
  }

  function moveDiscountStack(rowId: string, direction: -1 | 1) {
    setDiscountDraft((current) => {
      const group = getDiscountRuleGroups(current).find((item) =>
        item.rows.some((row) => row.id === rowId),
      );
      if (!group) return current;
      const stackIndex = group.rows.findIndex((row) => row.id === rowId);
      const targetIndex = stackIndex + direction;
      if (targetIndex < 0 || targetIndex >= group.rows.length) return current;
      const nextGroupRows = group.rows.slice();
      const [item] = nextGroupRows.splice(stackIndex, 1);
      nextGroupRows.splice(targetIndex, 0, item);
      return replaceDiscountGroupRows(current, group.groupKey, nextGroupRows);
    });
  }

  function reorderDiscountStack(draggedId: string, targetId: string) {
    if (!draggedId || draggedId === targetId) return;

    setDiscountDraft((current) => {
      const group = getDiscountRuleGroups(current).find(
        (item) =>
          item.rows.some((row) => row.id === draggedId) &&
          item.rows.some((row) => row.id === targetId),
      );
      if (!group) return current;

      const draggedIndex = group.rows.findIndex((row) => row.id === draggedId);
      const targetIndex = group.rows.findIndex((row) => row.id === targetId);
      if (draggedIndex < 0 || targetIndex < 0) return current;

      const nextGroupRows = group.rows.slice();
      const [draggedItem] = nextGroupRows.splice(draggedIndex, 1);
      nextGroupRows.splice(targetIndex, 0, draggedItem);

      return replaceDiscountGroupRows(current, group.groupKey, nextGroupRows);
    });
  }

  function isDiscountStackDragInSameRule(targetId: string, draggedId = draggingDiscountStackId) {
    if (!draggedId || draggedId === targetId) {
      return false;
    }

    return getDiscountRuleGroups().some(
      (group) =>
        group.rows.some((row) => row.id === draggedId) &&
        group.rows.some((row) => row.id === targetId),
    );
  }

  function handleDiscountStackDragStart(event: DragEvent<HTMLButtonElement>, rowId: string) {
    setDraggingDiscountStackId(rowId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', rowId);
  }

  function handleDiscountStackDragOver(event: DragEvent<HTMLDivElement>, targetId: string) {
    if (!isDiscountStackDragInSameRule(targetId)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverDiscountStackId(targetId);
  }

  function handleDiscountStackDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    const draggedId = draggingDiscountStackId || event.dataTransfer.getData('text/plain');
    if (draggedId && isDiscountStackDragInSameRule(targetId, draggedId)) {
      reorderDiscountStack(draggedId, targetId);
    }
    setDraggingDiscountStackId(null);
    setDragOverDiscountStackId(null);
  }

  function clearDiscountStackDragState() {
    setDraggingDiscountStackId(null);
    setDragOverDiscountStackId(null);
  }

  function addStackedDiscountRule() {
    const firstGroup = getDiscountRuleGroups()[0];
    if (firstGroup) {
      addDiscountStack(firstGroup.groupKey);
    }
  }

  function removeDiscountDraftRow(rowId: string) {
    removeDiscountStack(rowId);
  }

  function moveDiscountDraftRow(rowId: string, direction: -1 | 1) {
    moveDiscountStack(rowId, direction);
  }

  function setStackingEnabled(enabled: boolean) {
    const firstGroup = getDiscountRuleGroups()[0];
    if (enabled && firstGroup && firstGroup.rows.length === 1) {
      addDiscountStack(firstGroup.groupKey);
    }
    if (!enabled && firstGroup && firstGroup.rows.length > 1) {
      setDiscountDraft((current) =>
        normalizeAllDiscountRules([
          firstGroup.rows[0],
          ...current.filter((row) => getDraftRuleKey(row) !== firstGroup.groupKey),
        ]),
      );
    }
  }

  function getCardBaseUnitCode(cardId: string) {
    const currentOptions = getCardUnitOptions(cardId);
    return currentOptions.find((item) => item.isDefault)?.baseUnitCode ?? currentOptions[0]?.baseUnitCode ?? 'pc';
  }

  function updateCardUnitOptions(
    cardId: string,
    updater: (current: VariationUnitOptionItem[]) => VariationUnitOptionItem[],
  ) {
    const currentOptions = getCardUnitOptions(cardId);
    const nextOptions = updater(currentOptions).map((item, index) => ({
      ...item,
      variationId: cardId,
      sortOrder: String(index),
    }));
    const normalizedBaseUnitCode =
      nextOptions.find((item) => item.isDefault)?.baseUnitCode ??
      nextOptions[0]?.baseUnitCode ??
      currentOptions.find((item) => item.isDefault)?.baseUnitCode ??
      currentOptions[0]?.baseUnitCode ??
      'pc';

    const normalizedNextOptions = nextOptions.map((item, index) => ({
      ...item,
      baseUnitCode: normalizedBaseUnitCode,
      isDefault: item.isDefault ? true : false,
      sortOrder: String(index),
    }));

    if (!normalizedNextOptions.some((item) => item.isDefault) && normalizedNextOptions[0]) {
      normalizedNextOptions[0] = { ...normalizedNextOptions[0], isDefault: true };
    }

    onUnitOptionsChange([
      ...unitOptions.filter((item) => item.variationId !== cardId),
      ...normalizedNextOptions,
    ]);
  }

  function handleBaseUnitChange(cardId: string, nextBaseUnitCode: string) {
    const currentOptions = getCardUnitOptions(cardId);
    const normalizedBaseUnitCode = nextBaseUnitCode || 'pc';
    const currentBaseUnitCode = getCardBaseUnitCode(cardId);
    if (normalizedBaseUnitCode === currentBaseUnitCode) {
      return;
    }

    const hasConfiguredPackageRows = currentOptions.some(
      (item) =>
        item.unitCode.trim().toLowerCase() !== currentBaseUnitCode ||
        String(item.quantityInBaseUnit || '').trim() !== '1',
    );
    if (
      hasConfiguredPackageRows &&
      !window.confirm(
        'Changing the base unit resets this variation to a single base-unit row. Re-enter package quantities after changing the base unit.',
      )
    ) {
      return;
    }

    updateCardUnitOptions(cardId, (currentOptions) => {
      const existingBaseRow = currentOptions.find((item) => item.isDefault) ?? currentOptions[0];
      return [
        {
          ...(existingBaseRow ?? createDefaultUnitOption(cardId, normalizedBaseUnitCode)),
          unitCode: normalizedBaseUnitCode,
          unitLabel: getCanonicalUnitLabel(normalizedBaseUnitCode),
          baseUnitCode: normalizedBaseUnitCode,
          quantityInBaseUnit: '1',
          packagingText: '',
          isDefault: true,
        },
      ];
    });
  }

  function openAddModal() {
    const nextId = crypto.randomUUID();
    setVariationModalError('');
    setActiveCard({
      id: nextId,
      variationName: '',
      baseSku: defaultBaseSku,
      stockQuantity: '9999',
      availability: 'Available',
      rowIds: {},
      prices: { R1: '', R2: '', W1: '', W2: '', SP: '', CP: '' },
    });
    setActiveVariationTabId(nextId);
    setVariationModalOpen(true);
  }

  function openEditModal(cardId: string) {
    const card = cards.find((entry) => entry.id === cardId);
    if (!card) return;
    setVariationModalError('');
    setActiveCard(card);
    setVariationModalOpen(true);
  }

  function saveVariationCard() {
    if (!activeCard || !activeCard.variationName.trim()) {
      setVariationModalError('Variation Name is required.');
      return;
    }
    const resolvedBaseSku = activeCard.baseSku.trim()
      ? activeCard.baseSku.trim()
      : toSkuToken(defaultBaseSku) || toSkuToken(activeCard.variationName) || 'VARIATION';
    setVariationModalError('');
    const previous = cards.find((card) => card.id === activeCard.id);
    const nextId = buildVariationKey(activeCard.variationName, resolvedBaseSku);
    const nextCard = { ...activeCard, id: nextId, baseSku: resolvedBaseSku };
    const exists = cards.some((card) => card.id === activeCard.id);
    const nextCards = exists
      ? cards.map((card) => (card.id === activeCard.id ? nextCard : card))
      : [...cards, nextCard];
    if (previous && previous.id !== nextCard.id) {
      onUnitOptionsChange(
        unitOptions.map((item) =>
          item.variationId === previous.id ? { ...item, variationId: nextCard.id } : item,
        ),
      );
      onDiscountsChange(
        discounts.map((item) =>
          item.variationId === previous.id ? { ...item, variationId: nextCard.id } : item,
        ),
      );
      onSurchargesChange(
        surcharges.map((item) =>
          item.variationId === previous.id ? { ...item, variationId: nextCard.id } : item,
        ),
      );
    }
    if (!exists) {
      onUnitOptionsChange([...unitOptions, createDefaultUnitOption(nextCard.id, 'pc')]);
    }
    pushCards(nextCards);
    setActiveVariationTabId(nextCard.id);
    setVariationModalOpen(false);
  }

  function deleteCard(cardId: string) {
    pushCards(cards.filter((card) => card.id !== cardId));
    onUnitOptionsChange(unitOptions.filter((item) => item.variationId !== cardId));
    onDiscountsChange(discounts.filter((item) => item.variationId !== cardId));
    onSurchargesChange(surcharges.filter((item) => item.variationId !== cardId));
    if (activeVariationTabId === cardId) {
      const nextCard = cards.find((card) => card.id !== cardId);
      setActiveVariationTabId(nextCard?.id ?? '');
    }
  }

  function matchesVariation(variationId: string, fallbackRowId?: string) {
    return (value: string) => value === variationId || (!!fallbackRowId && value === fallbackRowId);
  }

  function openDiscountModal(variationId: string, code: PriceCode, fallbackRowId?: string) {
    setDiscountContext({ variationId, code });
    setDiscountModalError('');
    const matchVariation = matchesVariation(variationId, fallbackRowId);
    const rawExistingDiscounts = discounts
      .filter((item) => matchVariation(item.variationId) && toPriceCode(item.priceCode) === code)
      .sort((a, b) => Number(a.applySequence || '1') - Number(b.applySequence || '1'));
    const existingDiscounts = rawExistingDiscounts
      .map((item) => ({
        id: item.id,
        adjustmentKind: 'Discount' as const,
        discountKind: (item.discountKind || '') as DiscountKind,
        discountName: item.discountName,
        discountType: item.discountType,
        amount: item.amount,
        calculationMethod: item.calculationMethod || 'Single',
        applySequence: item.applySequence || '1',
        discountGroup: item.discountGroup || `legacy-${item.discountRecordId || item.id}`,
        unitCondition: item.unitCondition || 'any_unit',
        unitOptionId: item.unitOptionId || '',
        minOrderQuantity: item.minOrderQuantity || item.minQuantity || '1',
        maxOrderQuantity: item.maxOrderQuantity || item.maxQuantity || '',
        status: item.status || 'Active',
        startsAt: item.startsAt || '',
        endsAt: item.endsAt || '',
        promoValidityMode: inferPromoValidityMode(item.startsAt || '', item.endsAt || ''),
        promoDurationPreset: '7d' as const,
        stackable: item.stackable,
        hasPromo: Boolean(item.hasPromo),
        promoType: item.promoType || 'Freebie',
        promoRewardUnitCode: item.promoRewardUnitCode || '',
        promoRewardQuantity: item.promoRewardQuantity || '1',
        promoSourceSurchargeId: item.promoSourceSurchargeId || '',
        promoRewardTargetType: item.promoRewardTargetType || 'same_item',
        promoRewardProductId: item.promoRewardProductId || '',
        promoRewardProductLabel: item.promoRewardProductLabel || '',
        promoRewardVariationId: item.promoRewardVariationId || '',
        promoRewardVariationLabel: item.promoRewardVariationLabel || '',
        promoRewardUnitOptionId: item.promoRewardUnitOptionId || '',
        promoRewardRepeatMode: item.promoRewardRepeatMode || 'one_time',
        promoRewardEveryQuantity: item.promoRewardEveryQuantity || '',
        promoQualificationScope: item.promoQualificationScope || 'line',
        promoRewardSearchQuery: '',
      }));
    const rawExistingSurcharges = surcharges
      .filter(
        (item) =>
          matchVariation(item.variationId) &&
          toPriceCode(item.priceCode) === code &&
          (item.surchargeType === 'Percent' || item.surchargeType === 'Amount'),
      )
      .sort((a, b) => Number(a.priority || '0') - Number(b.priority || '0'));
    const existingSurcharges = rawExistingSurcharges
      .map((item) => ({
        id: item.id,
        adjustmentKind: 'Surcharge' as const,
        discountKind: '' as DiscountKind,
        discountName: item.surchargeName,
        discountType: item.surchargeType === 'Percent' ? ('Percent' as const) : ('Amount' as const),
        amount: item.amount,
        calculationMethod: 'Single' as const,
        applySequence: item.priority || '1',
        discountGroup: item.id ? `surcharge-${item.id}` : '',
        unitCondition: item.unitCondition || 'any_unit',
        unitOptionId: item.unitOptionId || '',
        minOrderQuantity: item.minOrderQuantity || item.minQuantity || '1',
        maxOrderQuantity: item.maxOrderQuantity || item.maxQuantity || '',
        status: item.status || 'Active',
        startsAt: item.startsAt || '',
        endsAt: item.endsAt || '',
        promoValidityMode: 'Fixed' as const,
        promoDurationPreset: '7d' as const,
        stackable: false,
        hasPromo: false,
        promoType: 'Freebie' as const,
        promoRewardUnitCode: '',
        promoRewardQuantity: '1',
        promoSourceSurchargeId: '',
        promoRewardTargetType: 'same_item' as const,
        promoRewardProductId: '',
        promoRewardProductLabel: '',
        promoRewardVariationId: '',
        promoRewardVariationLabel: '',
        promoRewardUnitOptionId: '',
        promoRewardRepeatMode: 'one_time' as const,
        promoRewardEveryQuantity: '',
        promoQualificationScope: 'line' as const,
        promoRewardSearchQuery: '',
      }));
    const existing: DiscountDraftRow[] = [...existingDiscounts, ...existingSurcharges];
    const visibleExisting: DiscountDraftRow[] = existing.map((item) => ({
      ...item,
      discountGroup: item.discountGroup || `legacy-${item.id}`,
    }));
    setDiscountDraft(
      visibleExisting.length > 0
        ? normalizeAllDiscountRules(visibleExisting)
        : [],
    );
    setDiscountManagedIds(new Set(rawExistingDiscounts.map((item) => item.id)));
    setSurchargeManagedIds(new Set(rawExistingSurcharges.map((item) => item.id)));
    setActiveDiscountTabId(
      visibleExisting.length > 0
        ? getDraftRuleKey(visibleExisting[0])
        : '',
    );
  }

  function saveDiscountModal() {
    if (!discountContext) {
      setDiscountModalError('Open an adjustment context before saving.');
      return;
    }
    const codeConfig = PRICE_CODES.find((entry) => entry.code === discountContext.code);
    if (!codeConfig) {
      setDiscountModalError('Choose a valid price class before saving.');
      return;
    }
    const currentCard = cards.find((card) => card.id === discountContext.variationId);
    const fallbackRowId = currentCard?.rowIds[discountContext.code];
    const matchVariation = matchesVariation(discountContext.variationId, fallbackRowId);
    const normalizedDraft = normalizeAllDiscountRules(discountDraft);
    const normalizedGroups = getDiscountRuleGroups(normalizedDraft);
    const duplicateAdjustmentMessages = getDuplicateAdjustmentMessages(normalizedDraft);
    const duplicateAdjustmentMessage = Array.from(duplicateAdjustmentMessages.values())[0];
    if (duplicateAdjustmentMessage) {
      setDiscountDraft(normalizedDraft);
      setActiveDiscountTabId(
        normalizedDraft.find((row) => duplicateAdjustmentMessages.has(row.id))?.discountGroup ||
          normalizedDraft[0]?.discountGroup ||
          '',
      );
      setDiscountModalError(duplicateAdjustmentMessage);
      return;
    }
    const suggestedNameByGroup = new Map(
      normalizedGroups.map((group) => {
        const rule = group.rows[0];
        const selectedOption = rule
          ? getDraftUnitOption(discountContext.variationId, rule.unitOptionId)
          : null;
        return [
          group.groupKey,
          rule ? buildSuggestedDiscountName(rule, group.rows, selectedOption) : '',
        ] as const;
      }),
    );
    const getDraftValidationLabel = (item: DiscountDraftRow) => {
      const groupIndex = normalizedGroups.findIndex((group) =>
        group.rows.some((row) => row.id === item.id),
      );
      const group = groupIndex >= 0 ? normalizedGroups[groupIndex] : null;
      const stackIndex = group?.rows.findIndex((row) => row.id === item.id) ?? -1;
      const name =
        group?.rows[0]?.discountName.trim() ||
        suggestedNameByGroup.get(group?.groupKey ?? '') ||
        `Adjustment ${groupIndex >= 0 ? groupIndex + 1 : '?'}`;
      const stackSuffix =
        group && group.rows.length > 1 && stackIndex >= 0
          ? `, stack ${stackIndex + 1}`
          : '';
      return `${name}${stackSuffix}`;
    };
    const getDraftValidationMessage = (item: DiscountDraftRow) => {
      const label = getDraftValidationLabel(item);
      const suggestedName = suggestedNameByGroup.get(getDraftRuleKey(item)) ?? '';
      if ((!item.discountName.trim() && !suggestedName) || !item.amount.trim()) {
        const reason = item.adjustmentKind === 'Discount'
          ? 'Enter a discount value before saving this adjustment.'
          : 'Enter a surcharge value before saving this adjustment.';
        return `${label}: ${reason}`;
      }
      if (
        item.unitCondition === 'selected_unit' &&
        !getDraftUnitOption(discountContext.variationId, item.unitOptionId)
      ) {
        return `${label}: Select an order unit for the selected-unit rule.`;
      }
      if (item.adjustmentKind === 'Discount' && !item.discountKind) {
        return `${label}: Choose Base / Regular Discount or Promotional Discount before saving.`;
      }
      const timingMessage =
        item.adjustmentKind === 'Discount'
          ? validateDiscountTiming({
              discountKind: item.discountKind,
              activationMode: getActivationMode({ status: item.status, startsAt: item.startsAt }),
              startsAt: item.startsAt,
              endsAt: item.endsAt,
            })
          : '';
      if (
        item.adjustmentKind === 'Discount' &&
        timingMessage
      ) {
        return `${label}: ${timingMessage}`;
      }
      const sameItemRewardUnit =
        item.hasPromo && item.promoRewardTargetType === 'same_item'
          ? getDraftUnitOption(
              discountContext.variationId,
              item.promoRewardUnitOptionId,
              item.promoRewardUnitCode,
            )
          : null;
      if (
        item.adjustmentKind === 'Discount' &&
        item.hasPromo &&
        (!item.promoRewardQuantity || Number(item.promoRewardQuantity) <= 0)
      ) {
        return `${label}: Enter a reward quantity greater than zero before saving.`;
      }
      if (
        item.adjustmentKind === 'Discount' &&
        item.hasPromo &&
        item.promoRewardTargetType === 'same_item' &&
        !sameItemRewardUnit
      ) {
        return `${label}: Select a reward unit from this item before saving.`;
      }
      if (
        item.adjustmentKind === 'Discount' &&
        item.hasPromo &&
        item.promoRewardTargetType === 'different_item' &&
        (!item.promoRewardProductId || !item.promoRewardVariationId || !item.promoRewardUnitOptionId)
      ) {
        return `${label}: Select the reward product, variation, and unit before saving.`;
      }
      if (
        item.adjustmentKind === 'Discount' &&
        item.hasPromo &&
        item.promoRewardTargetType === 'different_item' &&
        !item.promoRewardUnitCode
      ) {
        return `${label}: Select a reward unit before saving.`;
      }
      if (
        item.adjustmentKind === 'Discount' &&
        item.hasPromo &&
        item.promoRewardRepeatMode === 'every' &&
        (!item.promoRewardEveryQuantity || Number(item.promoRewardEveryQuantity) <= 0)
      ) {
        return `${label}: Enter an every-quantity trigger greater than zero before saving.`;
      }
      if (Number(item.minOrderQuantity || '0') <= 0) {
        return `${label}: Enter a minimum order quantity greater than zero.`;
      }
      if (
        item.adjustmentKind === 'Discount' &&
        item.hasPromo &&
        item.promoQualificationScope !== 'line' &&
        item.promoQualificationScope !== 'assorted_same_product'
      ) {
        return `${label}: Choose a valid promo qualification scope before saving.`;
      }
      return '';
    };
    const validationError = normalizedDraft.map(getDraftValidationMessage).find(Boolean);
    if (validationError) {
      setDiscountModalError(validationError);
      return;
    }
    const filtered = discounts.filter((item) => {
      const samePriceContext = matchVariation(item.variationId) && toPriceCode(item.priceCode) === discountContext.code;
      if (!samePriceContext) return true;
      if (discountManagedIds.size === 0) return false;
      return !discountManagedIds.has(item.id);
    });
    const inserted: DiscountItem[] = normalizedDraft
      .filter(
        (item) =>
          item.adjustmentKind === 'Discount' &&
          (item.discountName.trim() || suggestedNameByGroup.get(getDraftRuleKey(item))) &&
          item.amount.trim(),
      )
      .map((item, index) => {
        const selectedOption =
          item.unitCondition === 'selected_unit'
            ? getDraftUnitOption(discountContext.variationId, item.unitOptionId)
            : null;
        const sameItemRewardUnit =
          item.hasPromo && item.promoRewardTargetType === 'same_item'
            ? getDraftUnitOption(
                discountContext.variationId,
                item.promoRewardUnitOptionId,
                item.promoRewardUnitCode,
              )
            : null;
        const promoRewardUnitOptionId =
          item.hasPromo && item.promoRewardTargetType === 'same_item'
            ? sameItemRewardUnit?.id ?? item.promoRewardUnitOptionId
            : item.hasPromo
              ? item.promoRewardUnitOptionId
              : '';
        const promoRewardUnitCode =
          item.hasPromo && item.promoRewardTargetType === 'same_item'
            ? sameItemRewardUnit?.unitCode ?? item.promoRewardUnitCode
            : item.hasPromo
              ? item.promoRewardUnitCode
              : '';

        return {
          id: item.id,
          discountRecordId: '',
          discountClassId: '',
          variationId: discountContext.variationId,
          discountKind: item.discountKind,
          discountName: item.discountName.trim() || suggestedNameByGroup.get(getDraftRuleKey(item)) || 'Discount',
          discountType: item.discountType,
          amount: item.amount,
          minQuantity: item.minOrderQuantity || '1',
          maxQuantity: item.maxOrderQuantity,
          branchName: codeConfig.branchName,
          priceType: codeConfig.priceType,
          priceCode: codeConfig.code,
          calculationMethod: item.calculationMethod,
          applySequence: item.applySequence || String(index + 1),
          discountGroup: item.discountGroup,
          appliesTo: 'UnitPrice',
          stackable: item.stackable,
          description: '',
          status: item.status,
          priority: String(index),
          startsAt: item.startsAt,
          endsAt: item.discountKind === 'Base' ? '' : item.endsAt,
          unitCondition: item.unitCondition,
          unitOptionId: selectedOption ? selectedOption.id : '',
          orderUnitCode:
            item.unitCondition === 'selected_unit'
              ? selectedOption?.unitCode ?? ''
              : '',
          minOrderQuantity: item.minOrderQuantity || '1',
          maxOrderQuantity: item.maxOrderQuantity,
          minBaseQuantity:
            item.unitCondition === 'selected_unit'
              ? computeBaseQuantityPreview(
                  discountContext.variationId,
                  item.unitCondition,
                  selectedOption?.id ?? item.unitOptionId,
                  item.minOrderQuantity || '1',
                ).split(' ')[0] || ''
              : '',
          maxBaseQuantity:
            item.unitCondition === 'selected_unit'
              ? computeBaseQuantityPreview(
                  discountContext.variationId,
                  item.unitCondition,
                  selectedOption?.id ?? item.unitOptionId,
                  item.maxOrderQuantity,
                ).split(' ')[0] || ''
              : '',
          unitRuleLabel: '',
          unitRuleNotes: '',
          hasPromo: item.hasPromo,
          promoType: item.promoType,
          promoRewardUnitCode,
          promoRewardQuantity: item.hasPromo ? item.promoRewardQuantity : '',
          promoRewardLabel:
            item.hasPromo && item.promoRewardQuantity && promoRewardUnitCode
              ? `free ${item.promoRewardQuantity} ${promoRewardUnitCode}${
                  item.promoRewardTargetType === 'different_item' && item.promoRewardProductLabel
                    ? ` of ${item.promoRewardProductLabel}`
                    : item.promoRewardTargetType === 'same_item'
                      ? ' of this item'
                      : ''
                }`
              : '',
          promoSourceSurchargeId: '',
          promoRewardTargetType: item.hasPromo ? item.promoRewardTargetType : 'same_item',
          promoRewardProductId:
            item.hasPromo && item.promoRewardTargetType === 'different_item'
              ? item.promoRewardProductId
              : '',
          promoRewardProductLabel:
            item.hasPromo && item.promoRewardTargetType === 'different_item'
              ? item.promoRewardProductLabel
              : '',
          promoRewardVariationId:
            item.hasPromo && item.promoRewardTargetType === 'different_item'
              ? item.promoRewardVariationId
              : '',
          promoRewardVariationLabel:
            item.hasPromo && item.promoRewardTargetType === 'different_item'
              ? item.promoRewardVariationLabel
              : '',
          promoRewardUnitOptionId,
          promoRewardRepeatMode: item.hasPromo ? item.promoRewardRepeatMode : 'one_time',
          promoRewardEveryQuantity:
            item.hasPromo && item.promoRewardRepeatMode === 'every'
              ? item.promoRewardEveryQuantity
              : '',
          promoQualificationScope: item.hasPromo ? item.promoQualificationScope || 'line' : 'line',
        };
      });
    const filteredSurcharges = surcharges.filter((item) => {
      const samePriceContext =
        matchVariation(item.variationId) &&
        toPriceCode(item.priceCode) === discountContext.code &&
        (item.surchargeType === 'Percent' || item.surchargeType === 'Amount');
      if (!samePriceContext) return true;
      if (surchargeManagedIds.size === 0) return true;
      return !surchargeManagedIds.has(item.id);
    });
    const insertedSurcharges: SurchargeItem[] = normalizedDraft
      .filter(
        (item) =>
          item.adjustmentKind === 'Surcharge' &&
          (item.discountName.trim() || suggestedNameByGroup.get(getDraftRuleKey(item))) &&
          item.amount.trim(),
      )
      .map((item, index) => {
        const selectedOption =
          item.unitCondition === 'selected_unit'
            ? getDraftUnitOption(discountContext.variationId, item.unitOptionId)
            : null;
        const minBasePreview =
          item.unitCondition === 'selected_unit'
            ? computeBaseQuantityPreview(
                discountContext.variationId,
                item.unitCondition,
                item.unitOptionId,
                item.minOrderQuantity || '1',
              )
            : '';
        const maxBasePreview =
          item.unitCondition === 'selected_unit'
            ? computeBaseQuantityPreview(
                discountContext.variationId,
                item.unitCondition,
                item.unitOptionId,
                item.maxOrderQuantity,
              )
            : '';

        return {
          id: item.id,
          linkedDiscountId: '',
          linkedDiscountClassId: '',
          variationId: discountContext.variationId,
          surchargeName: item.discountName.trim() || suggestedNameByGroup.get(getDraftRuleKey(item)) || 'Surcharge',
          surchargeType: item.discountType,
          amount: item.amount,
          freeQuantity: '0',
          minQuantity: item.minOrderQuantity || '1',
          maxQuantity: item.maxOrderQuantity,
          branchName: codeConfig.branchName,
          priceType: codeConfig.priceType,
          priceCode: codeConfig.code,
          description: '',
          status: item.status,
          priority: item.applySequence || String(index + 1),
          startsAt: item.startsAt,
          endsAt: item.endsAt,
          unitCondition: item.unitCondition,
          unitOptionId: item.unitCondition === 'selected_unit' ? item.unitOptionId : '',
          orderUnitCode: item.unitCondition === 'selected_unit' ? selectedOption?.unitCode ?? '' : '',
          minOrderQuantity: item.minOrderQuantity || '1',
          maxOrderQuantity: item.maxOrderQuantity,
          minBaseQuantity: minBasePreview.split(' ')[0] || '',
          maxBaseQuantity: maxBasePreview.split(' ')[0] || '',
          rewardUnitCode: '',
          rewardQuantity: '0',
          rewardLabel: '',
          unitRuleLabel: '',
          unitRuleNotes: '',
          rewardTargetType: 'same_item',
          rewardProductId: '',
          rewardVariationId: '',
          rewardUnitOptionId: '',
          rewardRepeatMode: 'one_time',
          rewardEveryQuantity: '',
          qualificationScope: 'line',
        };
      });
    onDiscountsChange([...filtered, ...inserted]);
    onSurchargesChange([...filteredSurcharges, ...insertedSurcharges]);
    setDiscountContext(null);
    setDiscountDraft([]);
    setActiveDiscountTabId('');
    setDiscountModalError('');
    setDiscountManagedIds(new Set());
    setSurchargeManagedIds(new Set());
    setPendingRemoveDiscountGroupId(null);
    setPendingDisablePromoGroupId(null);
    clearDiscountStackDragState();
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionHeader}>
        <div className={styles.variationTabs}>
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              className={`${styles.variationTab} ${
                activeVariationTabId === card.id ? styles.variationTabActive : ''
              }`}
              onClick={() => setActiveVariationTabId(card.id)}
            >
              {card.variationName.trim() || `Variation ${index + 1}`}
            </button>
          ))}
        </div>
        <button type="button" className={styles.addButton} onClick={openAddModal}>
          Add Variation
        </button>
      </div>

      {isLoading ? (
        <div className={styles.cardGrid}>
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className={styles.variationCardSkeleton}>
              <div className={styles.skeletonHeader}></div>
              <div className={styles.skeletonBody}></div>
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && cards.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateContent}>
            <p className={styles.emptyStateTitle}>No variation added yet.</p>
            <p className={styles.emptyStateText}>
              The new Unit & Packaging design appears inside each variation card. Click Add Variation to open it.
            </p>
            <button type="button" className={styles.addButton} onClick={openAddModal}>
              Add Variation
            </button>
          </div>
        </div>
      ) : null}

      <div className={styles.cardGrid}>
        {!isLoading &&
          cards.map((card) => {
            if (activeVariationTabId && card.id !== activeVariationTabId) {
              return null;
            }
            const baseUnitCode = getCardBaseUnitCode(card.id);
            const cardUnitOptions = getCardUnitOptions(card.id);
            const selectedPreviewMedia = getSelectedPreviewMedia(card.id);
            const packagingSummary = generatePackagingSummary(cardUnitOptions, baseUnitCode);

            return (
              <article key={card.id} className={styles.variationCard}>
                <div className={styles.cardHeader}>
                  <div>
                    <h4 className={styles.cardTitle}>{card.variationName}</h4>
                    <p className={styles.cardMeta}>SKU: {card.baseSku || '-'}</p>
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => openEditModal(card.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={styles.iconAction}
                      aria-label="Duplicate Variation"
                      title="Duplicate Variation"
                      onClick={() => setDuplicateTarget(card)}
                    >
                      <DuplicateIcon />
                    </button>
                    <button
                      type="button"
                      className={styles.deleteAction}
                      onClick={() => setDeleteTarget(card)}
                    >
                      Delete
                    </button>
                  </div>
                </div>

                <div className={styles.unitSection}>
                  <div className={styles.subsectionHeader}>
                    <div>
                      <h5 className={styles.subsectionTitle}>Unit & Packaging</h5>
                      <p className={styles.subsectionText}>
                        Define how this item can be ordered, such as per pc, box, or carton.
                      </p>
                    </div>
                  </div>

                  <div className={styles.packagingSetupGrid}>
                    <div className={styles.packagingSetupMain}>
                      <div className={styles.unitSummaryGrid}>
                        <label className={styles.fieldGroup}>
                          <span className={styles.fieldLabel}>Base Unit</span>
                          <select
                            className={styles.select}
                            value={baseUnitCode}
                            onChange={(event) => handleBaseUnitChange(card.id, event.target.value)}
                          >
                            {unitChoices.map((unit) => (
                              <option key={unit.code} value={unit.code}>
                                {unit.label}
                              </option>
                            ))}
                          </select>
                          <span className={styles.fieldHelper}>
                            Smallest pricing unit for this variation.
                          </span>
                        </label>

                        <div className={styles.fieldGroup}>
                          <span className={styles.fieldLabel}>Base Prices / {baseUnitCode}</span>
                          <div className={styles.basePriceSummaryGrid}>
                            {PRICE_CODES.map((entry) => (
                              <span key={entry.code} className={styles.basePriceSummaryItem}>
                                <strong>{entry.code}</strong>
                                {card.prices[entry.code] ? formatCurrency(parseNumberInput(card.prices[entry.code])) : '-'}
                              </span>
                            ))}
                          </div>
                          <span className={styles.fieldHelper}>
                            Read-only summary from this variation's price classes.
                          </span>
                        </div>
                      </div>

                      <div className={styles.packagingRow}>
                        <div className={styles.fieldGroup}>
                          <span className={styles.fieldLabel}>Generated Packaging Summary</span>
                          <div className={styles.input}>
                            {packagingSummary.summary || 'Add order unit rows to generate a packaging summary.'}
                          </div>
                          <span className={styles.fieldHelper}>
                            Derived from Order Units. The Contains value remains cumulative to {baseUnitCode}.
                          </span>
                          {packagingSummary.warnings.length > 0 ? (
                            <span className={styles.parserMessage}>{packagingSummary.warnings.join(' ')}</span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className={styles.variationPreviewPanel}>
                      <div>
                        <h6 className={styles.variationPreviewTitle}>Variation Preview Image</h6>
                        <p className={styles.subsectionText}>
                          Select the product image to display when this variation is selected in the kiosk.
                        </p>
                      </div>

                      <div className={styles.variationPreviewContent}>
                        {selectedPreviewMedia ? (
                          <div className={styles.variationPreviewThumbWrap}>
                            <img
                              src={selectedPreviewMedia.previewUrl}
                              alt={selectedPreviewMedia.altText || selectedPreviewMedia.title || selectedPreviewMedia.fileName}
                              className={styles.variationPreviewThumb}
                            />
                            {selectedPreviewMedia.id === mainMediaId ? (
                              <span className={styles.mediaBadge}>Primary</span>
                            ) : null}
                          </div>
                        ) : (
                          <div className={styles.variationPreviewFallback}>
                            No specific image selected. The kiosk will use the product's default image.
                          </div>
                        )}
                        <div className={styles.variationPreviewActions}>
                          <button
                            type="button"
                            className={styles.secondaryAction}
                            onClick={() => setImageSelectorCardId(card.id)}
                          >
                            Select Image
                          </button>
                          {selectedPreviewMedia ? (
                            <button
                              type="button"
                              className={styles.cancelButton}
                              onClick={() => clearVariationPreviewMedia(card.id)}
                            >
                              Clear Selection
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.unitOptionsPanel}>
                    <div className={styles.unitOptionsHeader}>
                      <span className={styles.subsectionMiniTitle}>Order Units</span>
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={() =>
                          updateCardUnitOptions(card.id, (currentOptions) => [
                            ...currentOptions,
                            {
                              id: crypto.randomUUID(),
                              variationId: card.id,
                              unitCode: '',
                              unitLabel: '',
                              baseUnitCode,
                              quantityInBaseUnit: '1',
                              priceOverride: '',
                              packagingText: '',
                              minOrderQuantity: '1',
                              orderIncrement: '1',
                              isDefault: false,
                              isOrderable: true,
                              status: 'Active',
                              sortOrder: String(currentOptions.length),
                              notes: '',
                              weightValue: '',
                              weightUnit: 'kg',
                              lengthValue: '',
                              widthValue: '',
                              heightValue: '',
                              dimensionUnit: 'cm',
                              shippingNotes: '',
                            },
                          ])
                        }
                      >
                        Add Unit Option
                      </button>
                    </div>

                    <div className={styles.orderUnitsTable}>
                      <div className={styles.orderUnitsHeader}>
                        <span>#</span>
                        <span>Unit</span>
                        <span>Contains</span>
                        <span>Physical Specs</span>
                        <span>Computed Prices</span>
                        <span>Default</span>
                        <span>Status</span>
                        <span>Actions</span>
                      </div>

                      {cardUnitOptions.map((option) => (
                          <div key={option.id} className={styles.orderUnitRow}>
                            <div className={styles.orderUnitCellIndex}>
                              {cardUnitOptions.findIndex((item) => item.id === option.id) + 1}
                            </div>

                            <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Unit</span>
                                <select
                                  className={styles.select}
                                  value={option.unitCode}
                                  onChange={(event) => {
                                    const nextUnitCode = event.target.value.trim().toLowerCase();
                                    if (
                                      nextUnitCode &&
                                      cardUnitOptions.some(
                                        (item) =>
                                          item.id !== option.id &&
                                          item.unitCode.trim().toLowerCase() === nextUnitCode.trim().toLowerCase(),
                                      )
                                    ) {
                                      window.alert('Each order unit can only be added once per variation.');
                                      return;
                                    }
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              unitCode: nextUnitCode,
                                              unitLabel: nextUnitCode ? getCanonicalUnitLabel(nextUnitCode) : '',
                                            }
                                          : item,
                                      ),
                                    );
                                  }}
                                >
                                  <option value="">Select unit</option>
                                  {unitChoices.map((unit) => (
                                    <option key={unit.code} value={unit.code}>
                                      {unit.label}
                                    </option>
                                  ))}
                                </select>
                            </label>

                            <div className={styles.containsCell}>
                              <span className={styles.fieldLabel}>
                                1 {option.unitCode || 'unit'} contains
                              </span>
                              <div className={styles.containsInline}>
                                <input
                                  className={styles.input}
                                  value={option.quantityInBaseUnit}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              quantityInBaseUnit: event.target.value.replace(/[^\d.]/g, ''),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                <span className={styles.containsSuffix}>{baseUnitCode}</span>
                              </div>
                              <span className={styles.fieldHelper}>
                                How many {baseUnitCode} are inside 1 {option.unitCode || 'unit'}?
                              </span>
                            </div>

                            <div className={styles.physicalSpecsCell}>
                              <span className={styles.fieldLabel}>Package Weight</span>
                              <div className={styles.physicalInline}>
                                <input
                                  className={styles.input}
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={option.weightValue}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              weightValue: sanitizeNonNegativeNumericInput(event.target.value),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                  placeholder="0"
                                />
                                <select
                                  className={styles.select}
                                  value={option.weightUnit}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              weightUnit: normalizeWeightUnit(event.target.value),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  {WEIGHT_UNITS.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <span className={styles.fieldLabel}>Package Dimensions</span>
                              <div className={styles.dimensionInline}>
                                {[
                                  ['lengthValue', 'l'],
                                  ['widthValue', 'w'],
                                  ['heightValue', 'h'],
                                ].map(([field, label]) => (
                                  <input
                                    key={field}
                                    className={styles.input}
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={option[field as 'lengthValue' | 'widthValue' | 'heightValue']}
                                    onChange={(event) =>
                                      updateCardUnitOptions(card.id, (currentOptions) =>
                                        currentOptions.map((item) =>
                                          item.id === option.id
                                            ? {
                                                ...item,
                                                [field]: sanitizeNonNegativeNumericInput(event.target.value),
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                    placeholder={label}
                                    aria-label={label}
                                  />
                                ))}
                                <select
                                  className={styles.select}
                                  value={option.dimensionUnit}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              dimensionUnit: normalizeDimensionUnit(event.target.value),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  {DIMENSION_UNITS.map((unit) => (
                                    <option key={unit} value={unit}>
                                      {unit}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <input
                                className={styles.input}
                                value={option.shippingNotes}
                                onChange={(event) =>
                                  updateCardUnitOptions(card.id, (currentOptions) =>
                                    currentOptions.map((item) =>
                                      item.id === option.id
                                        ? {
                                            ...item,
                                            shippingNotes: event.target.value,
                                          }
                                        : item,
                                    ),
                                  )
                                }
                                placeholder="Shipping notes"
                              />
                              {formatPhysicalSummary(option) ? (
                                <span className={styles.physicalSummary}>{formatPhysicalSummary(option)}</span>
                              ) : null}
                            </div>

                            <div className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Computed Prices</span>
                                <div className={styles.computedPriceGrid}>
                                  {PRICE_CODES.map((entry) => (
                                    <span key={entry.code} className={styles.computedPriceItem}>
                                      <strong>{entry.code}</strong>
                                      {formatCurrency(getComputedUnitPrice(card, entry.code, option.quantityInBaseUnit))}
                                    </span>
                                  ))}
                                </div>
                            </div>

                            <label className={styles.toggleField}>
                                <span className={styles.fieldLabel}>Default</span>
                                <input
                                  type="checkbox"
                                  checked={option.isDefault}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) => ({
                                        ...item,
                                        isDefault:
                                          item.id === option.id ? event.target.checked : false,
                                      })),
                                    )
                                  }
                                />
                            </label>

                            <div className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Status</span>
                                <select
                                  className={styles.select}
                                  value={option.status}
                                  onChange={(event) => {
                                    const nextStatus = event.target.value === 'Inactive' ? 'Inactive' : 'Active';
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              status: nextStatus,
                                            }
                                          : item,
                                      ),
                                    );
                                  }}
                                >
                                  <option value="Active">Active</option>
                                  <option value="Inactive">Inactive</option>
                                </select>
                                <label className={styles.toggleField}>
                                  <span className={styles.fieldLabel}>Orderable</span>
                                  <input
                                    type="checkbox"
                                    checked={option.isOrderable}
                                    onChange={(event) =>
                                      updateCardUnitOptions(card.id, (currentOptions) =>
                                        currentOptions.map((item) =>
                                          item.id === option.id
                                            ? {
                                                ...item,
                                                isOrderable: event.target.checked,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                            </div>

                            <div className={styles.unitOptionActions}>
                              <button
                                type="button"
                                className={styles.deleteAction}
                                onClick={() =>
                                  updateCardUnitOptions(card.id, (currentOptions) =>
                                    currentOptions.filter((item) => item.id !== option.id),
                                  )
                                }
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                      ))}

                      <p className={styles.orderUnitsFooterNote}>
                        You can adjust the order rows per variation before saving. Computed prices use each price class base price multiplied by the unit contains quantity.
                      </p>
                    </div>
                  </div>
                </div>

                <div className={styles.priceSection}>
                  <div className={styles.subsectionHeader}>
                    <div>
                      <h5 className={styles.subsectionTitle}>Price Classes</h5>
                      <p className={styles.subsectionText}>
                        Manage pricing and discount deals per price class.
                      </p>
                    </div>
                  </div>

                  <div className={styles.priceGrid}>
                    {PRICE_CODES.map((entry) => {
                      const fallbackRowId = card.rowIds[entry.code];
                      const matchVariation = matchesVariation(card.id, fallbackRowId);
                      const matchingDiscounts = uniqueByCloneFingerprint(
                        discounts.filter(
                          (item) => matchVariation(item.variationId) && toPriceCode(item.priceCode) === entry.code,
                        ),
                        (item) => getDiscountCloneFingerprint(item, unitOptions),
                      );
                      const matchingSurcharges = uniqueByCloneFingerprint(
                        surcharges.filter(
                          (item) =>
                            matchVariation(item.variationId) &&
                            toPriceCode(item.priceCode) === entry.code &&
                            (item.surchargeType === 'Percent' || item.surchargeType === 'Amount'),
                        ),
                        (item) => getSurchargeCloneFingerprint(item, unitOptions),
                      );
                      const adjustmentCount = countDiscountGroups(matchingDiscounts) + matchingSurcharges.length;
                      const discountWithPromoCount = countDiscountGroups(matchingDiscounts.filter(
                        (item) =>
                          item.hasPromo,
                      ));
                      const discountBadges = getDiscountRuleGroups(
                        matchingDiscounts.map((item) => ({
                          ...createEmptyDiscountDraft(),
                          id: item.id,
                          discountKind: item.discountKind,
                          discountName: item.discountName,
                          discountGroup: item.discountGroup,
                          status: item.status,
                          startsAt: item.startsAt,
                          endsAt: item.endsAt,
                        })),
                      ).map((group) => group.rows[0]).filter(Boolean);
                      return (
                        <div key={entry.code} className={styles.priceCell}>
                          <div className={styles.priceTop}>
                            <span className={styles.priceLabel}>{entry.code}</span>
                            <span className={styles.priceValue}>
                              {card.prices[entry.code] ? `PHP ${card.prices[entry.code]}` : '-'}
                            </span>
                          </div>
                          <p className={styles.priceHint}>{entry.label}</p>
                          <div className={styles.priceActions}>
                            <button
                              type="button"
                              className={styles.smallAction}
                              onClick={() => openDiscountModal(card.id, entry.code, fallbackRowId)}
                            >
                              Manage Adjustments ({adjustmentCount})
                            </button>
                          </div>
                          {discountWithPromoCount > 0 ? (
                            <p className={styles.priceHint}>
                              {adjustmentCount} adjustments, {discountWithPromoCount} with promo
                            </p>
                          ) : null}
                          {discountBadges.length > 0 ? (
                            <p className={styles.priceHint}>
                              {discountBadges.map((item) =>
                                `${getDiscountKindLabel(item.discountKind)} / ${getDiscountDerivedState({
                                  status: item.status,
                                  startsAt: item.startsAt,
                                  endsAt: item.endsAt,
                                })}${item.discountKind === 'Promo' ? ` (${formatDiscountDateRange(item.startsAt, item.endsAt)})` : ''}`,
                              ).join(' | ')}
                            </p>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
      </div>

      {isVariationModalOpen && activeCard ? createPortal((
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Variation Details</h4>
            {variationModalError ? <p className={styles.confirmText}>{variationModalError}</p> : null}
            <div className={styles.modalGrid}>
              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Variation Name</span>
                <input
                  className={styles.input}
                  placeholder="Enter variation name"
                  value={activeCard.variationName}
                  onChange={(event) => setActiveCard({ ...activeCard, variationName: event.target.value })}
                />
                <span className={styles.fieldHelper}>
                  Name shown for this product option in admin lists and order selection.
                </span>
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Variation SKU</span>
                <input
                  className={styles.input}
                  placeholder="Enter variation SKU"
                  value={activeCard.baseSku}
                  onChange={(event) => setActiveCard({ ...activeCard, baseSku: event.target.value.toUpperCase() })}
                />
                <span className={styles.fieldHelper}>
                  Code used to identify and group this variation across its price classes.
                </span>
              </label>

              <label className={styles.fieldGroup}>
                <span className={styles.fieldLabel}>Stock Quantity</span>
                <input
                  className={styles.input}
                  inputMode="numeric"
                  placeholder="Enter quantity"
                  value={activeCard.stockQuantity}
                  onChange={(event) => setActiveCard({ ...activeCard, stockQuantity: event.target.value.replace(/[^\d]/g, '') })}
                />
                <span className={styles.fieldHelper}>
                  Inventory quantity saved for this variation.
                </span>
              </label>

              <div className={styles.modalGridSpacer} aria-hidden="true"></div>

              <h5 className={styles.modalSectionTitle}>Pricing</h5>

              {PRICE_CODES.map((entry) => {
                const priceLabels: Record<PriceCode, { label: string; helper: string }> = {
                  R1: { label: 'R1 Price', helper: 'Retail price for Manila.' },
                  R2: { label: 'R2 Price', helper: 'Retail price for Cebu.' },
                  W1: { label: 'W1 Price', helper: 'Wholesale price for Manila.' },
                  W2: { label: 'W2 Price', helper: 'Wholesale price for Cebu.' },
                  SP: { label: 'Special Price', helper: 'Special price used for both branches.' },
                  CP: { label: 'Concept Store Price', helper: 'Concept Store price used for both branches.' },
                };
                return (
                  <label key={entry.code} className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>{priceLabels[entry.code].label}</span>
                    <span className={styles.priceInputGroup}>
                      <span className={styles.pricePrefix}>PHP</span>
                      <input
                        className={`${styles.input} ${styles.priceInput}`}
                        inputMode="decimal"
                        placeholder="Enter price"
                        value={activeCard.prices[entry.code]}
                        onChange={(event) =>
                          setActiveCard({
                            ...activeCard,
                            prices: { ...activeCard.prices, [entry.code]: formatPriceInput(event.target.value) },
                          })
                        }
                      />
                    </span>
                    <span className={styles.fieldHelper}>{priceLabels[entry.code].helper}</span>
                  </label>
                );
              })}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setVariationModalOpen(false)}>Cancel</button>
              <button type="button" className={styles.registerButton} onClick={saveVariationCard}>Save</button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {imageSelectorCardId ? createPortal((
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <div>
                <h4 className={styles.modalTitle}>Select Variation Preview Image</h4>
                <p className={styles.confirmText}>
                  Choose an uploaded product image for {getVariationLabel(imageSelectorCardId)}.
                </p>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                aria-label="Close image selector"
                onClick={() => setImageSelectorCardId(null)}
              >
                x
              </button>
            </div>
            {selectableMediaItems.length === 0 ? (
              <div className={styles.variationPreviewFallback}>
                No active product images are available yet. Upload product images first.
              </div>
            ) : (
              <div className={styles.mediaSelectorGrid}>
                {selectableMediaItems.map((item) => {
                  const isSelected = variationPreviewMediaByCardId[imageSelectorCardId] === item.id;
                  const mediaLabel = item.title || item.altText || item.fileName;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`${styles.mediaSelectorItem} ${isSelected ? styles.mediaSelectorItemSelected : ''}`}
                      onClick={() => {
                        setVariationPreviewMedia(imageSelectorCardId, item.id);
                        setImageSelectorCardId(null);
                      }}
                    >
                      <span className={styles.mediaSelectorThumbWrap}>
                        <img
                          src={item.previewUrl}
                          alt={item.altText || item.title || item.fileName}
                          className={styles.mediaSelectorThumb}
                        />
                        {item.id === mainMediaId ? <span className={styles.mediaBadge}>Primary</span> : null}
                      </span>
                      {mediaLabel ? <span className={styles.mediaSelectorLabel}>{mediaLabel}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setImageSelectorCardId(null)}>Cancel</button>
            </div>
          </div>
        </div>
      ), document.body) : null}

      {deleteTarget ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Delete Variation</h4>
            <p className={styles.confirmText}>
              Are you sure you want to delete {deleteTarget.variationName}?
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                type="button"
                className={styles.deleteAction}
                onClick={() => {
                  deleteCard(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {duplicateTarget ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Duplicate Variation</h4>
            <p className={styles.confirmText}>
              Create a copy of "{duplicateTarget.variationName}"? The duplicated variation will keep the same pricing and packaging setup and can be edited before saving.
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setDuplicateTarget(null)}>Cancel</button>
              <button
                type="button"
                className={styles.registerButton}
                onClick={() => duplicateVariation(duplicateTarget)}
              >
                Duplicate
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {discountContext ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Manage discount rules">
            {(() => {
              const currentCard = cards.find((card) => card.id === discountContext.variationId);
              const orderableOptions = getOrderableUnitOptions(discountContext.variationId);
              const discountRuleGroups = getDiscountRuleGroups();
              const selectedDiscountGroup =
                discountRuleGroups.find(
                  (group) =>
                    group.groupKey === activeDiscountTabId ||
                    group.rows.some((item) => item.id === activeDiscountTabId),
                ) ?? discountRuleGroups[0] ?? null;
              const selectedDiscountIndex = selectedDiscountGroup
                ? discountRuleGroups.findIndex((group) => group.groupKey === selectedDiscountGroup.groupKey)
                : -1;
              const pendingRemoveDiscountGroup = pendingRemoveDiscountGroupId
                ? discountRuleGroups.find((group) => group.groupKey === pendingRemoveDiscountGroupId) ?? null
                : null;
              const pendingRemoveDiscountIndex = pendingRemoveDiscountGroup
                ? discountRuleGroups.findIndex((group) => group.groupKey === pendingRemoveDiscountGroup.groupKey)
                : -1;
              const pendingRemoveDiscountName =
                pendingRemoveDiscountGroup?.rows[0]?.discountName.trim() ||
                (pendingRemoveDiscountIndex >= 0 ? `Discount ${pendingRemoveDiscountIndex + 1}` : 'selected discount');
              const pendingDisablePromoGroup = pendingDisablePromoGroupId
                ? discountRuleGroups.find((group) => group.groupKey === pendingDisablePromoGroupId) ?? null
                : null;
              const pendingDisablePromoIndex = pendingDisablePromoGroup
                ? discountRuleGroups.findIndex((group) => group.groupKey === pendingDisablePromoGroup.groupKey)
                : -1;
              const pendingDisablePromoName =
                pendingDisablePromoGroup?.rows[0]?.discountName.trim() ||
                (pendingDisablePromoIndex >= 0 ? `Discount ${pendingDisablePromoIndex + 1}` : 'selected discount');
              const activeTier: DiscountDraftRow | null =
                discountDraft.find((item) => item.id === activeDiscountTabId) ?? discountDraft[0] ?? null;
              const duplicateStackMessages = getDuplicateAdjustmentMessages();
              const firstDuplicateStackMessage = Array.from(duplicateStackMessages.values())[0] ?? '';
              const stackingEnabled = false;
              return (
                <>
                  <div className={styles.modalHeader}>
                    <div>
                      <h4 className={styles.modalTitle}>Manage Adjustments: {discountContext.code}</h4>
                      <p className={styles.confirmText}>
                        Configure unit-aware discount and surcharge rules for this price class.
                      </p>
                    </div>
                    <button
                      type="button"
                      className={styles.modalClose}
                      onClick={() => {
                        setDiscountContext(null);
                        setDiscountDraft([]);
                        setActiveDiscountTabId('');
                        setDiscountModalError('');
                        setDiscountManagedIds(new Set());
                        setSurchargeManagedIds(new Set());
                        setPendingRemoveDiscountGroupId(null);
                        setPendingDisablePromoGroupId(null);
                        clearDiscountStackDragState();
                      }}
                      aria-label="Close discount modal"
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                  </div>
                  <div className={styles.modalInfoGrid}>
                    <span className={styles.infoCard}>
                      <strong>Variation:</strong> {currentCard?.variationName || 'Variation'}
                    </span>
                    <span className={styles.infoCard}>
                      <strong>SKU:</strong> {currentCard?.baseSku || '-'}
                    </span>
                    <span className={styles.infoCard}>
                      <strong>Price Class:</strong> {discountContext.code}
                    </span>
                    <span className={styles.infoCard}>
                      <strong>Adjustments:</strong> {discountRuleGroups.length}
                    </span>
                  </div>
                  {discountModalError || firstDuplicateStackMessage ? (
                    <p className={styles.modalAlert}>{discountModalError || firstDuplicateStackMessage}</p>
                  ) : null}

                  <div className={styles.modalContent}>
                    <div className={styles.ruleTabsHeader}>
                      <div className={styles.ruleTabs}>
                        {discountRuleGroups.map((ruleGroup, index) => {
                          const rule = ruleGroup.rows[0];
                          const isSelected = selectedDiscountGroup?.groupKey === ruleGroup.groupKey;
                          return (
                            <button
                              key={ruleGroup.groupKey}
                              type="button"
                              className={`${styles.ruleTab} ${isSelected ? styles.ruleTabActive : ''}`}
                              onClick={() => setActiveDiscountTabId(ruleGroup.groupKey)}
                            >
                              {rule?.discountName.trim() || `Discount ${index + 1}`}
                            </button>
                          );
                        })}
                      </div>
                      <button type="button" className={styles.secondaryAction} onClick={addDiscountRule}>
                        + Add Adjustment
                      </button>
                    </div>

                    <div className={styles.ruleList}>
                      {selectedDiscountGroup ? [selectedDiscountGroup].map((ruleGroup) => {
                        const ruleIndex = selectedDiscountIndex;
                        const rule = ruleGroup.rows[0];
                        if (!rule) return null;
                        const selectedOption = getDraftUnitOption(
                          discountContext.variationId,
                          rule.unitOptionId,
                        );
                        const basePrice = currentCard
                          ? getComputedUnitPrice(currentCard, discountContext.code, '1')
                          : 0;
                        const stackingPreview = buildStackingPreview(ruleGroup.rows, basePrice);
                        const minBasePreview = computeBaseQuantityPreview(
                          discountContext.variationId,
                          rule.unitCondition,
                          rule.unitOptionId,
                          rule.minOrderQuantity,
                        );
                        const maxBasePreview = computeBaseQuantityPreview(
                          discountContext.variationId,
                          rule.unitCondition,
                          rule.unitOptionId,
                          rule.maxOrderQuantity,
                        );
                        const rewardUnitOption = getRewardUnitOption(rule.id, rule);
                        const rewardUnitLabel =
                          getUnitOptionLabel(rewardUnitOption) ||
                          rule.promoRewardUnitCode ||
                          'unit';
                        const discountRulePreview = buildDiscountRulePreview(
                          rule,
                          ruleGroup.rows,
                          selectedOption,
                        );
                        const suggestedDiscountName = buildSuggestedDiscountName(
                          rule,
                          ruleGroup.rows,
                          selectedOption,
                        );
                        const orderQuantityPreview = buildOrderQuantityPreview(
                          discountContext.variationId,
                          rule,
                          selectedOption,
                        );
                        const promoValidationMessage = getPromoValidationMessage(rule, orderableOptions);
                        const activationMode = getActivationMode({
                          status: rule.status,
                          startsAt: rule.startsAt,
                        });
                        const derivedState = getDiscountDerivedState({
                          status: rule.status,
                          startsAt: rule.startsAt,
                          endsAt: rule.endsAt,
                        });
                        const timingValidationMessage = validateDiscountTiming({
                          discountKind: rule.discountKind,
                          activationMode,
                          startsAt: rule.startsAt,
                          endsAt: rule.endsAt,
                        });

                        return (
                          <div key={ruleGroup.groupKey} className={styles.ruleCard}>
                            <div className={styles.ruleCardHeader}>
                              <span className={styles.rowIndex}>{ruleIndex + 1}</span>
                              <span className={styles.ruleSummary}>
                                Adjustment {ruleIndex + 1} - minimum {rule.minOrderQuantity || '1'} {getUnitOptionLabel(selectedOption)}
                              </span>
                              <span className={styles.readOnlyValue}>
                                {getDiscountKindLabel(rule.discountKind)} / {derivedState}
                              </span>
                              <button
                                type="button"
                                className={styles.deleteAction}
                                onClick={() => requestRemoveDiscountRule(ruleGroup.groupKey)}
                              >
                                Remove Adjustment
                              </button>
                            </div>

                            <div className={styles.ruleGrid}>
                              <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Adjustment Name</span>
                                <input
                                  className={styles.input}
                                  placeholder="Adjustment name"
                                  value={rule.discountName}
                                  onChange={(event) => updateDiscountRule(ruleGroup.groupKey, { discountName: event.target.value })}
                                />
                              </label>
                              <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Unit Rule</span>
                                <select
                                  className={styles.select}
                                  value={rule.unitCondition}
                                  onChange={(event) =>
                                    updateDiscountRule(ruleGroup.groupKey, {
                                      unitCondition: event.target.value as UnitCondition,
                                      unitOptionId: event.target.value === 'selected_unit' ? rule.unitOptionId : '',
                                    })
                                  }
                                >
                                  <option value="any_unit">Any unit</option>
                                  <option value="selected_unit">Selected unit only</option>
                                </select>
                              </label>
                              {rule.unitCondition === 'selected_unit' ? (
                                <label className={styles.fieldGroup}>
                                  <span className={styles.fieldLabel}>Order Unit</span>
                                  <select
                                    className={styles.select}
                                    value={rule.unitOptionId}
                                    onChange={(event) => updateDiscountRule(ruleGroup.groupKey, { unitOptionId: event.target.value })}
                                  >
                                    <option value="">Select order unit</option>
                                    {orderableOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {getUnitOptionLabel(option)}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                              ) : null}
                              <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Min Order Qty</span>
                                <input
                                  className={styles.input}
                                  placeholder="Min Order Qty"
                                  value={rule.minOrderQuantity}
                                  onChange={(event) =>
                                    updateDiscountRule(ruleGroup.groupKey, {
                                      minOrderQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                    })
                                  }
                                />
                              </label>
                              <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Max Order Qty</span>
                                <input
                                  className={styles.input}
                                  placeholder="Optional"
                                  value={rule.maxOrderQuantity}
                                  onChange={(event) =>
                                    updateDiscountRule(ruleGroup.groupKey, {
                                      maxOrderQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                    })
                                  }
                                />
                              </label>
                              <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Discount Type</span>
                                <select
                                  className={styles.select}
                                  value={rule.discountKind}
                                  onChange={(event) =>
                                    updateDiscountKind(ruleGroup.groupKey, event.target.value as DiscountKind)
                                  }
                                >
                                  <option value="">Legacy / Unclassified</option>
                                  <option value="Base">Base / Regular Discount</option>
                                  <option value="Promo">Promotional Discount</option>
                                </select>
                              </label>
                              <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Status</span>
                                <select
                                  className={styles.select}
                                  value={activationMode}
                                  onChange={(event) =>
                                    updateDiscountActivation(
                                      ruleGroup.groupKey,
                                      event.target.value as DiscountActivationMode,
                                    )
                                  }
                                >
                                  <option value="Inactive">Save Inactive</option>
                                  <option value="Now">Activate Now</option>
                                  <option value="Scheduled">Schedule</option>
                                </select>
                              </label>
                              {activationMode === 'Scheduled' || rule.startsAt ? (
                                <label className={styles.fieldGroup}>
                                  <span className={styles.fieldLabel}>Start Date/Time</span>
                                  <input
                                    className={styles.input}
                                    type="datetime-local"
                                    value={toDatetimeLocalValue(rule.startsAt)}
                                    onChange={(event) =>
                                      updateDiscountStart(
                                        ruleGroup.groupKey,
                                        datetimeLocalToIso(event.target.value),
                                      )
                                    }
                                  />
                                </label>
                              ) : null}
                              {rule.discountKind === 'Promo' ? (
                                <>
                                  <label className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>Promo Validity</span>
                                    <select
                                      className={styles.select}
                                      value={rule.promoValidityMode}
                                      onChange={(event) =>
                                        updatePromoValidityMode(
                                          ruleGroup.groupKey,
                                          event.target.value as PromoValidityMode,
                                        )
                                      }
                                    >
                                      <option value="Fixed">Fixed Dates</option>
                                      <option value="Duration">Duration</option>
                                    </select>
                                  </label>
                                  {rule.promoValidityMode === 'Duration' ? (
                                    <label className={styles.fieldGroup}>
                                      <span className={styles.fieldLabel}>Duration</span>
                                      <select
                                        className={styles.select}
                                        value={rule.promoDurationPreset}
                                        onChange={(event) =>
                                          updatePromoDurationPreset(
                                            ruleGroup.groupKey,
                                            event.target.value as PromoDurationPreset,
                                          )
                                        }
                                      >
                                        {(['7d', '14d', '30d', '1m', '3m', 'custom'] as PromoDurationPreset[]).map(
                                          (preset) => (
                                            <option key={preset} value={preset}>
                                              {getDurationLabel(preset)}
                                            </option>
                                          ),
                                        )}
                                      </select>
                                    </label>
                                  ) : null}
                                  <label className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>End Date/Time</span>
                                    <input
                                      className={styles.input}
                                      type="datetime-local"
                                      value={toDatetimeLocalValue(rule.endsAt)}
                                      onChange={(event) =>
                                        updateDiscountRule(ruleGroup.groupKey, {
                                          endsAt: datetimeLocalToIso(event.target.value),
                                          promoValidityMode: 'Fixed',
                                        })
                                      }
                                    />
                                  </label>
                                </>
                              ) : null}
                            </div>
                            <p className={styles.ruleNote}>
                              {rule.discountKind === 'Base'
                                ? `Base / Regular Discount. ${formatDiscountDateRange(rule.startsAt, '')}`
                                : rule.discountKind === 'Promo'
                                  ? `Promo validity: ${formatDiscountDateRange(rule.startsAt, rule.endsAt)}`
                                  : 'Legacy / Unclassified discount. Choose Base or Promo before saving changes.'}
                              {timingValidationMessage ? ` ${timingValidationMessage}` : ''}
                            </p>

                            <h5 className={styles.modalSectionTitle}>Price Adjustment Stack</h5>
                            <div className={styles.stackList}>
                              {ruleGroup.rows.map((stackItem, stackIndex) => {
                                const isDragging = draggingDiscountStackId === stackItem.id;
                                const isDragOver =
                                  dragOverDiscountStackId === stackItem.id &&
                                  draggingDiscountStackId !== stackItem.id;
                                const duplicateMessage = duplicateStackMessages.get(stackItem.id) ?? '';

                                return (
                                  <div
                                    key={stackItem.id}
                                    className={`${styles.stackRow} ${isDragging ? styles.stackRowDragging : ''} ${
                                      isDragOver ? styles.stackRowDragOver : ''
                                    } ${duplicateMessage ? styles.stackRowInvalid : ''}`}
                                    onDragOver={(event) => handleDiscountStackDragOver(event, stackItem.id)}
                                    onDrop={(event) => handleDiscountStackDrop(event, stackItem.id)}
                                  >
                                    <button
                                      type="button"
                                      className={styles.stackDragHandle}
                                      draggable
                                      title="Drag to reorder"
                                      aria-label="Drag to reorder"
                                      onDragStart={(event) => handleDiscountStackDragStart(event, stackItem.id)}
                                      onDragEnd={clearDiscountStackDragState}
                                    >
                                      <i className="fa-solid fa-grip-vertical" aria-hidden="true"></i>
                                    </button>
                                    <span className={styles.stackSequence}>{stackIndex + 1}</span>
                                    <label className={`${styles.stackField} ${styles.stackKindSelect}`}>
                                      <span className={styles.fieldLabel}>Adjustment Type</span>
                                      <select
                                        className={styles.select}
                                        value={stackItem.adjustmentKind}
                                        aria-invalid={Boolean(duplicateMessage)}
                                        onChange={(event) =>
                                          updateDiscountStack(stackItem.id, {
                                            adjustmentKind: event.target.value as DiscountDraftRow['adjustmentKind'],
                                            hasPromo: event.target.value === 'Surcharge' ? false : stackItem.hasPromo,
                                          })
                                        }
                                      >
                                        <option value="Discount">Discount</option>
                                        <option value="Surcharge">Surcharge</option>
                                      </select>
                                    </label>
                                    <label className={`${styles.stackField} ${styles.stackTypeSelect}`}>
                                      <span className={styles.fieldLabel}>Value Type</span>
                                      <select
                                        className={styles.select}
                                        value={stackItem.discountType}
                                        aria-invalid={Boolean(duplicateMessage)}
                                        onChange={(event) =>
                                          updateDiscountStack(stackItem.id, {
                                            discountType: event.target.value as DiscountItem['discountType'],
                                          })
                                        }
                                      >
                                        <option value="Percent">Percent (%)</option>
                                        <option value="Amount">Amount (Net)</option>
                                      </select>
                                    </label>
                                    <label className={`${styles.stackField} ${styles.stackValueInput}`}>
                                      <span className={styles.fieldLabel}>Value</span>
                                      <input
                                        className={styles.input}
                                        placeholder={stackItem.discountType === 'Percent' ? 'Percent (%)' : 'Amount (Net)'}
                                        value={stackItem.amount}
                                        aria-invalid={Boolean(duplicateMessage)}
                                        onChange={(event) => updateDiscountStack(stackItem.id, { amount: event.target.value })}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      className={styles.stackDeleteButton}
                                      title="Delete stack"
                                      aria-label="Delete stack"
                                      onClick={() => removeDiscountStack(stackItem.id)}
                                      disabled={ruleGroup.rows.length === 1}
                                    >
                                      <i className="fa-solid fa-trash" aria-hidden="true"></i>
                                    </button>
                                    {duplicateMessage ? (
                                      <p className={styles.stackErrorText}>{duplicateMessage}</p>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              className={styles.secondaryAction}
                              onClick={() => addDiscountStack(ruleGroup.groupKey)}
                            >
                              + Add Adjustment Stack
                            </button>

                            <div className={styles.adjustmentSummary}>
                              <div className={styles.adjustmentSummaryRow}>
                                <span>Base</span>
                                <strong>{formatCurrency(basePrice)}</strong>
                              </div>
                              {stackingPreview.steps.map((step, stepIndex) => (
                                <div key={step.id} className={styles.adjustmentSummaryRow}>
                                  <span>
                                    {getAdjustmentValueLabel(
                                      ruleGroup.rows[stepIndex]?.adjustmentKind ?? 'Discount',
                                      ruleGroup.rows[stepIndex]?.discountType ?? 'Percent',
                                      ruleGroup.rows[stepIndex]?.amount ?? '',
                                    )}
                                  </span>
                                  <strong>{formatCurrency(step.after)}</strong>
                                </div>
                              ))}
                              <div className={`${styles.adjustmentSummaryRow} ${styles.adjustmentSummaryFinal}`}>
                                <span>Final</span>
                                <strong>{formatCurrency(stackingPreview.finalPrice)}</strong>
                              </div>
                              <div className={styles.adjustmentSummaryTotals}>
                                <div className={styles.adjustmentSummaryRow}>
                                  <span>Total Discount</span>
                                  <strong>{formatCurrency(stackingPreview.totalDiscount)}</strong>
                                </div>
                                <div className={styles.adjustmentSummaryRow}>
                                  <span>Total Surcharge</span>
                                  <strong>{formatCurrency(stackingPreview.totalSurcharge)}</strong>
                                </div>
                              </div>
                            </div>

                            <div className={styles.encoderPreviewSection}>
                              <h5 className={styles.modalSectionTitle}>Discount Rule Preview</h5>
                              <p className={styles.encoderPreviewText}>{discountRulePreview}</p>
                            </div>

                            <div className={styles.encoderPreviewSection}>
                              <h5 className={styles.modalSectionTitle}>Suggested Discount Name</h5>
                              <div className={styles.suggestedNameRow}>
                                <p className={styles.encoderPreviewText}>
                                  {suggestedDiscountName || 'Complete the discount stack to generate a suggested name.'}
                                </p>
                                <button
                                  type="button"
                                  className={styles.secondaryAction}
                                  onClick={() => updateDiscountRule(ruleGroup.groupKey, { discountName: suggestedDiscountName })}
                                  disabled={!suggestedDiscountName || Boolean(rule.discountName.trim())}
                                >
                                  Use Suggested Name
                                </button>
                              </div>
                            </div>

                            <div className={styles.encoderPreviewSection}>
                              <h5 className={styles.modalSectionTitle}>Order Quantity Preview</h5>
                              <p className={styles.encoderPreviewText}>{orderQuantityPreview}</p>
                            </div>

                            <div className={styles.promoSection}>
                              <h5 className={styles.modalSectionTitle}>Promo</h5>
                              <label className={styles.toggleField}>
                                <span className={styles.fieldLabel}>Enable Promo</span>
                                <input
                                  type="checkbox"
                                  checked={rule.hasPromo}
                                  onChange={(event) => enableDiscountPromo(ruleGroup.groupKey, event.target.checked)}
                                />
                              </label>

                              {rule.hasPromo ? (
                                <>
                                  <h5 className={styles.modalSectionTitle}>Promo Configuration</h5>
                                  <div className={styles.ruleGrid}>
                                    <label className={styles.fieldGroup}>
                                      <span className={styles.fieldLabel}>Promo Type</span>
                                      <select
                                        className={styles.select}
                                        value={rule.promoType}
                                        onChange={(event) =>
                                          updateDiscountPromo(ruleGroup.groupKey, {
                                            promoType: event.target.value as DiscountItem['promoType'],
                                          })
                                        }
                                      >
                                        <option value="Freebie">Freebie</option>
                                        <option value="BonusQty">BonusQty</option>
                                      </select>
                                    </label>
                                    <label className={styles.fieldGroup}>
                                      <span className={styles.fieldLabel}>Reward Target</span>
                                      <select
                                        className={styles.select}
                                        value={rule.promoRewardTargetType}
                                        onChange={(event) =>
                                          updateDiscountPromo(ruleGroup.groupKey, {
                                            promoRewardTargetType: event.target.value as RewardTargetType,
                                            promoRewardProductId:
                                              event.target.value === 'same_item' ? '' : rule.promoRewardProductId,
                                            promoRewardProductLabel:
                                              event.target.value === 'same_item' ? '' : rule.promoRewardProductLabel,
                                            promoRewardVariationId:
                                              event.target.value === 'same_item' ? '' : rule.promoRewardVariationId,
                                            promoRewardVariationLabel:
                                              event.target.value === 'same_item' ? '' : rule.promoRewardVariationLabel,
                                            promoRewardUnitOptionId: '',
                                            promoRewardUnitCode: '',
                                          })
                                        }
                                      >
                                        <option value="same_item">Same item</option>
                                        <option value="different_item">Different item</option>
                                      </select>
                                    </label>
                                    <label className={styles.fieldGroup}>
                                      <span className={styles.fieldLabel}>Qualification Scope</span>
                                      <select
                                        className={styles.select}
                                        value={rule.promoQualificationScope || 'line'}
                                        onChange={(event) =>
                                          updateDiscountPromo(ruleGroup.groupKey, {
                                            promoQualificationScope: event.target.value as QualificationScope,
                                          })
                                        }
                                      >
                                        <option value="line">Per Line</option>
                                        <option value="assorted_same_product">Assorted Across Variations</option>
                                      </select>
                                    </label>
                                    <label className={styles.fieldGroup}>
                                      <span className={styles.fieldLabel}>Reward Quantity</span>
                                      <input
                                        className={styles.input}
                                        placeholder="Reward Quantity"
                                        value={rule.promoRewardQuantity}
                                        onChange={(event) =>
                                          updateDiscountPromo(ruleGroup.groupKey, {
                                            promoRewardQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                          })
                                        }
                                      />
                                    </label>
                                    <label className={styles.fieldGroup}>
                                      <span className={styles.fieldLabel}>Repeat Mode</span>
                                      <select
                                        className={styles.select}
                                        value={rule.promoRewardRepeatMode}
                                        onChange={(event) =>
                                          updateDiscountPromo(ruleGroup.groupKey, {
                                            promoRewardRepeatMode: event.target.value as RewardRepeatMode,
                                            promoRewardEveryQuantity:
                                              event.target.value === 'every'
                                                ? rule.promoRewardEveryQuantity || rule.minOrderQuantity || '1'
                                                : '',
                                          })
                                        }
                                      >
                                        <option value="one_time">One time only</option>
                                        <option value="every">Every quantity</option>
                                      </select>
                                    </label>
                                    {rule.promoRewardRepeatMode === 'every' ? (
                                      <label className={styles.fieldGroup}>
                                        <span className={styles.fieldLabel}>Every Quantity</span>
                                        <input
                                          className={styles.input}
                                          placeholder="Every Quantity"
                                          value={rule.promoRewardEveryQuantity}
                                          onChange={(event) =>
                                            updateDiscountPromo(ruleGroup.groupKey, {
                                              promoRewardEveryQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                            })
                                          }
                                        />
                                      </label>
                                    ) : (
                                      <div className={styles.readOnlyValue}>
                                        Reward is given once when condition is met.
                                      </div>
                                    )}
                                  </div>

                                  {rule.promoRewardTargetType === 'same_item' ? (
                                    <div className={styles.ruleGrid}>
                                      <label className={styles.fieldGroup}>
                                        <span className={styles.fieldLabel}>Reward Unit</span>
                                        <select
                                          className={styles.select}
                                          value={rule.promoRewardUnitOptionId}
                                          onChange={(event) =>
                                            updateDiscountPromo(ruleGroup.groupKey, {
                                              promoRewardUnitOptionId: event.target.value,
                                              promoRewardUnitCode:
                                                orderableOptions.find((option) => option.id === event.target.value)?.unitCode ?? '',
                                            })
                                          }
                                        >
                                          <option value="">Select reward unit</option>
                                          {orderableOptions.map((option) => (
                                            <option key={option.id} value={option.id}>
                                              {getUnitOptionLabel(option)}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <div className={styles.fieldGroup}>
                                        <span className={styles.fieldLabel}>Reward Preview</span>
                                        <div className={styles.readOnlyValue}>
                                          {rule.promoRewardQuantity && rule.promoRewardUnitCode
                                            ? `free ${rule.promoRewardQuantity} ${rule.promoRewardUnitCode}`
                                            : 'Reward preview'}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className={styles.ruleGrid}>
                                        <label className={styles.fieldGroup}>
                                          <span className={styles.fieldLabel}>Search Reward Product</span>
                                          <input
                                            className={styles.input}
                                            placeholder="Search Reward Product"
                                            value={rule.promoRewardSearchQuery}
                                            onChange={(event) =>
                                              updateDiscountPromo(ruleGroup.groupKey, {
                                                promoRewardSearchQuery: event.target.value,
                                              })
                                            }
                                          />
                                        </label>
                                        <div className={styles.fieldGroup}>
                                          <span className={styles.fieldLabel}>Selected Reward Product</span>
                                          <div className={styles.readOnlyValue}>
                                            {rule.promoRewardProductLabel || 'No reward product selected'}
                                          </div>
                                        </div>
                                      </div>
                                      {(rewardSearchResults[rule.id]?.length ?? 0) > 0 ? (
                                        <div className={styles.searchResults}>
                                          {rewardSearchResults[rule.id].map((result) => (
                                            <button
                                              key={result.id}
                                              type="button"
                                              className={styles.searchResultItem}
                                              onClick={() => {
                                                updateDiscountPromo(ruleGroup.groupKey, {
                                                  promoRewardProductId: result.id,
                                                  promoRewardProductLabel: result.productName,
                                                  promoRewardVariationId: '',
                                                  promoRewardVariationLabel: '',
                                                  promoRewardUnitOptionId: '',
                                                  promoRewardUnitCode: '',
                                                  promoRewardSearchQuery: result.productName,
                                                });
                                                setRewardVariationOptions((current) => ({ ...current, [rule.id]: [] }));
                                                setRewardUnitOptions((current) => ({ ...current, [rule.id]: [] }));
                                                void loadRewardVariations(rule.id, result.id);
                                              }}
                                            >
                                              {result.productName} {result.skuCode ? `(${result.skuCode})` : ''}
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                      <div className={styles.ruleGrid}>
                                        <label className={styles.fieldGroup}>
                                          <span className={styles.fieldLabel}>Reward Variation</span>
                                          <select
                                            className={styles.select}
                                            value={rule.promoRewardVariationId}
                                            onChange={(event) => {
                                              const selectedVariation = (rewardVariationOptions[rule.id] ?? []).find(
                                                (option) => option.id === event.target.value,
                                              );
                                              updateDiscountPromo(ruleGroup.groupKey, {
                                                promoRewardVariationId: event.target.value,
                                                promoRewardVariationLabel: selectedVariation?.label ?? '',
                                                promoRewardUnitOptionId: '',
                                                promoRewardUnitCode: '',
                                              });
                                              setRewardUnitOptions((current) => ({ ...current, [rule.id]: [] }));
                                              if (event.target.value) {
                                                void loadRewardUnitOptions(rule.id, event.target.value);
                                              }
                                            }}
                                          >
                                            <option value="">Select reward variation</option>
                                            {(rewardVariationOptions[rule.id] ?? []).map((option) => (
                                              <option key={option.id} value={option.id}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className={styles.fieldGroup}>
                                          <span className={styles.fieldLabel}>Reward Unit</span>
                                          <select
                                            className={styles.select}
                                            value={rule.promoRewardUnitOptionId}
                                            onChange={(event) =>
                                              updateDiscountPromo(ruleGroup.groupKey, {
                                                promoRewardUnitOptionId: event.target.value,
                                                promoRewardUnitCode:
                                                  (rewardUnitOptions[rule.id] ?? []).find((option) => option.id === event.target.value)?.unitCode ?? '',
                                              })
                                            }
                                          >
                                            <option value="">Select reward unit</option>
                                            {(rewardUnitOptions[rule.id] ?? []).map((option) => (
                                              <option key={option.id} value={option.id}>
                                                {getUnitOptionLabel(option)}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      </div>
                                    </>
                                  )}
                                  <div className={styles.fieldGroup}>
                                    <span className={styles.fieldLabel}>Reward Display Preview</span>
                                    <div className={styles.readOnlyValue}>
                                      {buildPromoPreview(
                                        rule,
                                        getUnitOptionLabel(selectedOption),
                                        rewardUnitLabel,
                                      ) || 'Reward display preview'}
                                    </div>
                                  </div>
                                  {promoValidationMessage ? (
                                    <p className={styles.modalAlert}>{promoValidationMessage}</p>
                                  ) : null}
                                </>
                              ) : null}
                            </div>

                            {minBasePreview || maxBasePreview ? (
                              <p className={styles.ruleNote}>
                                Base quantity preview: {minBasePreview || 'no minimum'}
                                {maxBasePreview ? ` to ${maxBasePreview}` : ''}
                              </p>
                            ) : null}
                          </div>
                        );
                      }) : (
                        <div className={styles.emptyState}>
                          <div className={styles.emptyStateContent}>
                            <p className={styles.emptyStateTitle}>No discounts yet.</p>
                            <p className={styles.emptyStateText}>Add a discount to configure eligibility and stack items.</p>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className={styles.ruleTabsHeader} style={{ display: 'none' }}>
                      <div className={styles.ruleTabs}>
                        {discountDraft.map((tier, index) => (
                          <button
                            key={tier.id}
                            type="button"
                            className={`${styles.ruleTab} ${
                              activeDiscountTabId === tier.id ? styles.ruleTabActive : ''
                            }`}
                            onClick={() => setActiveDiscountTabId(tier.id)}
                          >
                            {tier.discountName.trim() || `Discount ${index + 1}`}
                          </button>
                        ))}
                      </div>
                      {stackingEnabled ? (
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={addStackedDiscountRule}
                        >
                          + Add Another Stacked Discount
                        </button>
                      ) : null}
                    </div>

                    <div className={styles.ruleList} style={{ display: 'none' }}>
                      {activeTier ? (() => {
                        const tier = activeTier;
                        const index = discountDraft.findIndex((item) => item.id === tier.id);
                        const selectedOption = getDraftUnitOption(
                          discountContext.variationId,
                          tier.unitOptionId,
                        );
                        const discountBasisQuantity =
                          tier.unitCondition === 'selected_unit' && selectedOption
                            ? selectedOption.quantityInBaseUnit
                            : '1';
                        const discountBasisUnit =
                          tier.unitCondition === 'selected_unit' && selectedOption
                            ? getUnitOptionLabel(selectedOption)
                            : getCardBaseUnitCode(discountContext.variationId);
                        const discountBasisPrice = currentCard
                          ? getComputedUnitPrice(
                              currentCard,
                              discountContext.code,
                              discountBasisQuantity,
                            )
                          : 0;
                        const chainBasePrice = currentCard
                          ? getComputedUnitPrice(currentCard, discountContext.code, '1')
                          : 0;
                        const discountAmountPreview = getDiscountAmountPreview(
                          discountBasisPrice,
                          tier.discountType,
                          tier.amount,
                        );
                        const stackingPreview = buildStackingPreview(discountDraft, chainBasePrice);
                        const rewardUnitOption = getRewardUnitOption(tier.id, tier);
                        const rewardUnitLabel =
                          getUnitOptionLabel(rewardUnitOption) ||
                          tier.promoRewardUnitCode ||
                          'unit';
                        const minBasePreview = computeBaseQuantityPreview(
                          discountContext.variationId,
                          tier.unitCondition,
                          tier.unitOptionId,
                          tier.minOrderQuantity,
                        );
                        const maxBasePreview = computeBaseQuantityPreview(
                          discountContext.variationId,
                          tier.unitCondition,
                          tier.unitOptionId,
                          tier.maxOrderQuantity,
                        );
                        return (
                          <div key={tier.id} className={styles.ruleCard}>
                            <div className={styles.ruleCardHeader}>
                              <span className={styles.rowIndex}>{index + 1}</span>
                              <span className={styles.ruleSummary}>{buildDiscountSummary({
                                id: tier.id,
                                discountRecordId: '',
                                discountClassId: '',
                                variationId: discountContext.variationId,
                                discountKind: tier.discountKind,
                                discountName: tier.discountName,
                                discountType: tier.discountType,
                                amount: tier.amount,
                                minQuantity: tier.minOrderQuantity,
                                maxQuantity: tier.maxOrderQuantity,
                                branchName: '' as DiscountItem['branchName'],
                                priceType: '' as DiscountItem['priceType'],
                                priceCode: '' as DiscountItem['priceCode'],
                                calculationMethod: tier.calculationMethod,
                                applySequence: tier.applySequence || String(index + 1),
                                discountGroup: tier.discountGroup,
                                appliesTo: 'UnitPrice',
                                stackable: tier.stackable,
                                description: '',
                                status: tier.status,
                                priority: String(index),
                                startsAt: tier.startsAt,
                                endsAt: tier.endsAt,
                                unitOptionId: tier.unitOptionId,
                                orderUnitCode: selectedOption?.unitCode ?? '',
                                unitCondition: tier.unitCondition,
                                minOrderQuantity: tier.minOrderQuantity,
                                maxOrderQuantity: tier.maxOrderQuantity,
                                minBaseQuantity: minBasePreview.split(' ')[0] || '',
                                maxBaseQuantity: maxBasePreview.split(' ')[0] || '',
                                unitRuleLabel: '',
                                unitRuleNotes: '',
                                hasPromo: tier.hasPromo,
                                promoType: tier.promoType,
                                promoRewardUnitCode: tier.promoRewardUnitCode,
                                promoRewardQuantity: tier.promoRewardQuantity,
                                promoRewardLabel: '',
                                promoSourceSurchargeId: '',
                                promoRewardTargetType: tier.promoRewardTargetType,
                                promoRewardProductId: tier.promoRewardProductId,
                                promoRewardProductLabel: tier.promoRewardProductLabel,
                                promoRewardVariationId: tier.promoRewardVariationId,
                                promoRewardVariationLabel: tier.promoRewardVariationLabel,
                                promoRewardUnitOptionId: tier.promoRewardUnitOptionId,
                                promoRewardRepeatMode: tier.promoRewardRepeatMode,
                                promoRewardEveryQuantity: tier.promoRewardEveryQuantity,
                                promoQualificationScope: tier.promoQualificationScope || 'line',
                              })}</span>
                              <button
                                type="button"
                                className={styles.deleteAction}
                                onClick={() => removeDiscountDraftRow(tier.id)}
                                disabled={index === 0}
                              >
                                Remove
                              </button>
                              {stackingEnabled ? (
                                <>
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => moveDiscountDraftRow(tier.id, -1)}
                                    disabled={index === 0}
                                  >
                                    Move Up
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.secondaryAction}
                                    onClick={() => moveDiscountDraftRow(tier.id, 1)}
                                    disabled={index === discountDraft.length - 1}
                                  >
                                    Move Down
                                  </button>
                                </>
                              ) : null}
                            </div>

                            <div className={styles.discountBasisPreview}>
                              <span>
                                <strong>{discountContext.code} basis:</strong>{' '}
                                {formatCurrency(discountBasisPrice)} per {discountBasisUnit}
                              </span>
                              <span>
                                <strong>Discount preview:</strong>{' '}
                                {discountAmountPreview
                                  ? `${formatCurrency(discountAmountPreview)} off`
                                  : '-'}
                              </span>
                            </div>

                            {stackingEnabled ? (
                              <div className={styles.discountBasisPreview}>
                                <span><strong>Base Price:</strong> {formatCurrency(chainBasePrice)}</span>
                                {stackingPreview.steps.map((step, stepIndex) => (
                                  <span key={step.id}>
                                    <strong>Rule {stepIndex + 1}: {step.label}</strong>{' '}
                                    {formatCurrency(step.before)} -&gt; {formatCurrency(step.after)}
                                  </span>
                                ))}
                                <span><strong>Final Price:</strong> {formatCurrency(stackingPreview.finalPrice)}</span>
                                <span><strong>Total Discount:</strong> {formatCurrency(stackingPreview.totalDiscount)}</span>
                                <span><strong>Effective Discount:</strong> {stackingPreview.effectiveDiscount}%</span>
                              </div>
                            ) : null}

                            <div className={styles.ruleGrid}>
                              <input
                                className={styles.input}
                                placeholder="Discount Name"
                                value={tier.discountName}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id ? { ...item, discountName: event.target.value } : item,
                                    ),
                                  )
                                }
                              />
                              <select
                                className={styles.select}
                                value={tier.discountType}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id
                                        ? { ...item, discountType: event.target.value as DiscountItem['discountType'] }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <option value="Percent">Percent (%)</option>
                                <option value="Amount">Amount (Net)</option>
                              </select>
                              <input
                                className={styles.input}
                                placeholder={tier.discountType === 'Percent' ? 'Discount %' : 'Discount Amount'}
                                value={tier.amount}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id ? { ...item, amount: event.target.value } : item,
                                    ),
                                  )
                                }
                              />
                              <select
                                className={styles.select}
                                value={tier.unitCondition}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id
                                        ? {
                                            ...item,
                                            unitCondition: event.target.value as UnitCondition,
                                            unitOptionId:
                                              event.target.value === 'selected_unit'
                                                ? item.unitOptionId
                                                : '',
                                          }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <option value="any_unit">Any unit</option>
                                <option value="selected_unit">Selected unit only</option>
                              </select>
                              {tier.unitCondition === 'selected_unit' ? (
                                <select
                                  className={styles.select}
                                  value={tier.unitOptionId}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id ? { ...item, unitOptionId: event.target.value } : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Select order unit</option>
                                  {orderableOptions.map((option) => (
                                    <option key={option.id} value={option.id}>
                                      {getUnitOptionLabel(option)}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              <input
                                className={styles.input}
                                placeholder="Min Order Qty"
                                value={tier.minOrderQuantity}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id ? { ...item, minOrderQuantity: event.target.value.replace(/[^\d.]/g, '') } : item,
                                    ),
                                  )
                                }
                              />
                              <input
                                className={styles.input}
                                placeholder="Max Order Qty (optional)"
                                value={tier.maxOrderQuantity}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id ? { ...item, maxOrderQuantity: event.target.value.replace(/[^\d.]/g, '') } : item,
                                    ),
                                  )
                                }
                              />
                              <select
                                className={styles.select}
                                value={tier.status}
                                onChange={(event) =>
                                  setDiscountDraft((current) =>
                                    current.map((item) =>
                                      item.id === tier.id
                                        ? { ...item, status: event.target.value as DiscountItem['status'] }
                                        : item,
                                    ),
                                  )
                                }
                              >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                              </select>
                            </div>

                            {index === 0 ? (
                              <label className={styles.toggleField}>
                                <span className={styles.fieldLabel}>Stack another discount</span>
                                <input
                                  type="checkbox"
                                  checked={stackingEnabled}
                                  onChange={(event) => setStackingEnabled(event.target.checked)}
                                />
                              </label>
                            ) : null}

                            {index > 0 ? (
                              <p className={styles.ruleNote}>
                                Stacked Discount {index + 1} applies after the previous eligible discount.
                              </p>
                            ) : null}

                            <div className={styles.promoSection}>
                              <label className={styles.toggleField}>
                                <span className={styles.fieldLabel}>Enable Promo</span>
                                <input
                                  type="checkbox"
                                  checked={tier.hasPromo}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id
                                          ? {
                                              ...item,
                                              hasPromo: event.target.checked,
                                              promoRewardUnitCode: event.target.checked
                                                ? item.promoRewardUnitCode
                                                : '',
                                              promoRewardQuantity: event.target.checked
                                                ? item.promoRewardQuantity
                                                : '1',
                                              promoRewardProductId: event.target.checked
                                                ? item.promoRewardProductId
                                                : '',
                                              promoRewardProductLabel: event.target.checked
                                                ? item.promoRewardProductLabel
                                                : '',
                                              promoRewardVariationId: event.target.checked
                                                ? item.promoRewardVariationId
                                                : '',
                                              promoRewardVariationLabel: event.target.checked
                                                ? item.promoRewardVariationLabel
                                                : '',
                                              promoRewardUnitOptionId: event.target.checked
                                                ? item.promoRewardUnitOptionId
                                                : '',
                                              promoRewardRepeatMode: event.target.checked
                                                ? item.promoRewardRepeatMode
                                                : 'one_time',
                                              promoRewardEveryQuantity: event.target.checked
                                                ? item.promoRewardEveryQuantity
                                                : '',
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                              </label>

                            {tier.hasPromo ? (
                              <>
                              <div className={styles.ruleGrid}>
                                <select
                                  className={styles.select}
                                  value={tier.promoType}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id
                                          ? {
                                              ...item,
                                              promoType: event.target.value as DiscountItem['promoType'],
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="Freebie">Freebie</option>
                                  <option value="BonusQty">BonusQty</option>
                                </select>
                                <select
                                  className={styles.select}
                                  value={tier.promoQualificationScope}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id
                                          ? {
                                              ...item,
                                              promoQualificationScope: event.target.value as QualificationScope,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="line">Per Line</option>
                                  <option value="assorted_same_product">Assorted Across Variations</option>
                                </select>
                                <select
                                  className={styles.select}
                                  value={tier.promoRewardTargetType}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id
                                          ? {
                                              ...item,
                                              promoRewardTargetType: event.target.value as RewardTargetType,
                                              promoRewardProductId:
                                                event.target.value === 'same_item' ? '' : item.promoRewardProductId,
                                              promoRewardProductLabel:
                                                event.target.value === 'same_item' ? '' : item.promoRewardProductLabel,
                                              promoRewardVariationId:
                                                event.target.value === 'same_item' ? '' : item.promoRewardVariationId,
                                              promoRewardVariationLabel:
                                                event.target.value === 'same_item' ? '' : item.promoRewardVariationLabel,
                                              promoRewardUnitOptionId: '',
                                              promoRewardUnitCode: '',
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="same_item">Same item</option>
                                  <option value="different_item">Different item</option>
                                </select>
                                <input
                                  className={styles.input}
                                  placeholder="Reward Quantity"
                                  value={tier.promoRewardQuantity}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id
                                          ? {
                                              ...item,
                                              promoRewardQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                />
                                <select
                                  className={styles.select}
                                  value={tier.promoRewardRepeatMode}
                                  onChange={(event) =>
                                    setDiscountDraft((current) =>
                                      current.map((item) =>
                                        item.id === tier.id
                                          ? {
                                              ...item,
                                              promoRewardRepeatMode: event.target.value as RewardRepeatMode,
                                              promoRewardEveryQuantity:
                                                event.target.value === 'every'
                                                  ? item.promoRewardEveryQuantity || item.minOrderQuantity || '1'
                                                  : '',
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="one_time">One time only</option>
                                  <option value="every">Every quantity</option>
                                </select>
                                {tier.promoRewardRepeatMode === 'every' ? (
                                  <input
                                    className={styles.input}
                                    placeholder="Every Quantity"
                                    value={tier.promoRewardEveryQuantity}
                                    onChange={(event) =>
                                      setDiscountDraft((current) =>
                                        current.map((item) =>
                                          item.id === tier.id
                                            ? {
                                                ...item,
                                                promoRewardEveryQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                ) : (
                                  <div className={styles.readOnlyValue}>
                                    Reward is given once when condition is met.
                                  </div>
                                )}
                              </div>

                              {tier.promoRewardTargetType === 'same_item' ? (
                                <div className={styles.ruleGrid}>
                                  <select
                                    className={styles.select}
                                    value={tier.promoRewardUnitOptionId}
                                    onChange={(event) =>
                                      setDiscountDraft((current) =>
                                        current.map((item) =>
                                          item.id === tier.id
                                            ? {
                                                ...item,
                                                promoRewardUnitOptionId: event.target.value,
                                                promoRewardUnitCode:
                                                  orderableOptions.find((option) => option.id === event.target.value)?.unitCode ?? '',
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="">Select reward unit</option>
                                    {orderableOptions.map((option) => (
                                      <option key={option.id} value={option.id}>
                                        {getUnitOptionLabel(option)}
                                      </option>
                                    ))}
                                  </select>
                                  <div className={styles.readOnlyValue}>
                                    {tier.promoRewardQuantity && tier.promoRewardUnitCode
                                      ? `free ${tier.promoRewardQuantity} ${tier.promoRewardUnitCode}`
                                      : 'Reward preview'}
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className={styles.ruleGrid}>
                                    <input
                                      className={styles.input}
                                      placeholder="Search Reward Product"
                                      value={tier.promoRewardSearchQuery}
                                      onChange={(event) =>
                                        setDiscountDraft((current) =>
                                          current.map((item) =>
                                            item.id === tier.id
                                              ? { ...item, promoRewardSearchQuery: event.target.value }
                                              : item,
                                          ),
                                        )
                                      }
                                    />
                                    <div className={styles.readOnlyValue}>
                                      {tier.promoRewardProductLabel || 'No reward product selected'}
                                    </div>
                                  </div>
                                  {(rewardSearchResults[tier.id]?.length ?? 0) > 0 ? (
                                    <div className={styles.searchResults}>
                                      {rewardSearchResults[tier.id].map((result) => (
                                        <button
                                          key={result.id}
                                          type="button"
                                          className={styles.searchResultItem}
                                          onClick={() => {
                                            setDiscountDraft((current) =>
                                              current.map((item) =>
                                                item.id === tier.id
                                                  ? {
                                                      ...item,
                                                      promoRewardProductId: result.id,
                                                      promoRewardProductLabel: result.productName,
                                                      promoRewardVariationId: '',
                                                      promoRewardVariationLabel: '',
                                                      promoRewardUnitOptionId: '',
                                                      promoRewardUnitCode: '',
                                                      promoRewardSearchQuery: result.productName,
                                                    }
                                                  : item,
                                              ),
                                            );
                                            setRewardVariationOptions((current) => ({ ...current, [tier.id]: [] }));
                                            setRewardUnitOptions((current) => ({ ...current, [tier.id]: [] }));
                                            void loadRewardVariations(tier.id, result.id);
                                          }}
                                        >
                                          {result.productName} {result.skuCode ? `(${result.skuCode})` : ''}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                  <div className={styles.ruleGrid}>
                                    <select
                                      className={styles.select}
                                      value={tier.promoRewardVariationId}
                                      onChange={(event) => {
                                        const selectedVariation = (rewardVariationOptions[tier.id] ?? []).find(
                                          (option) => option.id === event.target.value,
                                        );
                                        setDiscountDraft((current) =>
                                          current.map((item) =>
                                            item.id === tier.id
                                              ? {
                                                  ...item,
                                                  promoRewardVariationId: event.target.value,
                                                  promoRewardVariationLabel: selectedVariation?.label ?? '',
                                                  promoRewardUnitOptionId: '',
                                                  promoRewardUnitCode: '',
                                                }
                                              : item,
                                          ),
                                        );
                                        setRewardUnitOptions((current) => ({ ...current, [tier.id]: [] }));
                                        if (event.target.value) {
                                          void loadRewardUnitOptions(tier.id, event.target.value);
                                        }
                                      }}
                                    >
                                      <option value="">Select reward variation</option>
                                      {(rewardVariationOptions[tier.id] ?? []).map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <select
                                      className={styles.select}
                                      value={tier.promoRewardUnitOptionId}
                                      onChange={(event) =>
                                        setDiscountDraft((current) =>
                                          current.map((item) =>
                                            item.id === tier.id
                                              ? {
                                                  ...item,
                                                  promoRewardUnitOptionId: event.target.value,
                                                  promoRewardUnitCode:
                                                    (rewardUnitOptions[tier.id] ?? []).find((option) => option.id === event.target.value)?.unitCode ?? '',
                                                }
                                              : item,
                                          ),
                                        )
                                      }
                                    >
                                      <option value="">Select reward unit</option>
                                      {(rewardUnitOptions[tier.id] ?? []).map((option) => (
                                        <option key={option.id} value={option.id}>
                                          {getUnitOptionLabel(option)}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </>
                              )}
                              <div className={styles.readOnlyValue}>
                                {buildPromoPreview(
                                  tier,
                                  getUnitOptionLabel(selectedOption),
                                  rewardUnitLabel,
                                ) || 'Reward display preview'}
                              </div>
                              </>
                            ) : null}
                            </div>

                            {tier.unitCondition === 'selected_unit' && orderableOptions.length === 0 ? (
                              <p className={styles.ruleNote}>
                                Define order units first before adding unit-specific discounts.
                              </p>
                            ) : null}
                            {minBasePreview ? (
                              <p className={styles.ruleNote}>
                                Applies when customer orders at least {formatQuantityLabel(
                                  tier.minOrderQuantity || '1',
                                  getUnitOptionLabel(selectedOption),
                                )} ({minBasePreview}).
                                {maxBasePreview ? ` Max preview: ${maxBasePreview}.` : ''}
                                {tier.hasPromo && rewardUnitLabel
                                  ? ` Promo: ${buildPromoPreview(
                                      tier,
                                      getUnitOptionLabel(selectedOption),
                                      rewardUnitLabel,
                                    )}`
                                  : ''}
                              </p>
                            ) : tier.unitCondition === 'any_unit' ? (
                              <p className={styles.ruleNote}>
                                Applies to any unit. Minimum order quantity defaults to 1.
                                {tier.hasPromo && rewardUnitLabel
                                  ? ` Promo: ${buildPromoPreview(
                                      tier,
                                      getUnitOptionLabel(selectedOption),
                                      rewardUnitLabel,
                                    )}`
                                  : ''}
                              </p>
                            ) : null}
                          </div>
                        );
                      })() : null}
                    </div>
                  </div>
                  {pendingRemoveDiscountGroup ? (
                    <div
                      className={styles.confirmOverlay}
                      role="presentation"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          setPendingRemoveDiscountGroupId(null);
                        }
                      }}
                    >
                      <div
                        className={styles.confirmDialog}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="remove-discount-title"
                        aria-describedby="remove-discount-message"
                      >
                        <div className={styles.modalHeader}>
                          <div>
                            <h4 id="remove-discount-title" className={styles.modalTitle}>
                              Remove Discount?
                            </h4>
                            <p id="remove-discount-message" className={styles.confirmText}>
                              This will remove the selected discount and all discount stack items inside it.
                            </p>
                          </div>
                          <button
                            type="button"
                            className={styles.modalClose}
                            onClick={() => setPendingRemoveDiscountGroupId(null)}
                            aria-label="Close remove discount confirmation"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                          </button>
                        </div>
                        <div className={styles.confirmDetail}>
                          <span>Discount</span>
                          <strong>{pendingRemoveDiscountName}</strong>
                        </div>
                        <p className={styles.confirmText}>
                          All discount stack items inside this discount will also be removed.
                        </p>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => setPendingRemoveDiscountGroupId(null)}
                            autoFocus
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.deleteAction}
                            onClick={confirmRemoveDiscountRule}
                          >
                            Remove Discount
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {pendingDisablePromoGroup ? (
                    <div
                      className={styles.confirmOverlay}
                      role="presentation"
                      onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                          setPendingDisablePromoGroupId(null);
                        }
                      }}
                    >
                      <div
                        className={styles.confirmDialog}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="disable-promo-title"
                        aria-describedby="disable-promo-message"
                      >
                        <div className={styles.modalHeader}>
                          <div>
                            <h4 id="disable-promo-title" className={styles.modalTitle}>
                              Disable Promo?
                            </h4>
                            <p id="disable-promo-message" className={styles.confirmText}>
                              This discount already has promo configuration. Disabling it may remove the linked reward settings.
                            </p>
                          </div>
                          <button
                            type="button"
                            className={styles.modalClose}
                            onClick={() => setPendingDisablePromoGroupId(null)}
                            aria-label="Close disable promo confirmation"
                          >
                            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                          </button>
                        </div>
                        <div className={styles.confirmDetail}>
                          <span>Discount</span>
                          <strong>{pendingDisablePromoName}</strong>
                        </div>
                        <div className={styles.actions}>
                          <button
                            type="button"
                            className={styles.cancelButton}
                            onClick={() => setPendingDisablePromoGroupId(null)}
                            autoFocus
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className={styles.deleteAction}
                            onClick={confirmDisableDiscountPromo}
                          >
                            Disable Promo
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              );
            })()}
            <div className={styles.modalFooterActions}>
              {discountModalError ? <p className={styles.modalAlert}>{discountModalError}</p> : null}
              <button type="button" className={styles.cancelButton} onClick={() => {
                setDiscountContext(null);
                setDiscountDraft([]);
                setActiveDiscountTabId('');
                setDiscountModalError('');
                setDiscountManagedIds(new Set());
                setSurchargeManagedIds(new Set());
                setPendingRemoveDiscountGroupId(null);
                setPendingDisablePromoGroupId(null);
                clearDiscountStackDragState();
              }}>Cancel</button>
              <button type="button" className={styles.registerButton} onClick={saveDiscountModal}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {showFooterActions ? (
        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onBack}>Back</button>
          <button type="button" className={styles.registerButton} onClick={onNext} disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : onNextLabel}
          </button>
        </div>
      ) : null}
    </section>
  );
}
