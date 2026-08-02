import { useEffect, useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import { createPortal } from 'react-dom';
import styles from './VarAndPrice.module.css';
import { supabase } from '../../../lib/supabase';
import type {
  DiscountItem,
  ProductUnitAliasDefinition,
  ProductUnitDefinition,
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

type GeneratedUnitOption = {
  unitCode: string;
  unitLabel: string;
  quantityInBaseUnit: string;
  packagingText: string;
  notes: string;
};

type DiscountDraftRow = {
  id: string;
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

const FALLBACK_UNIT_ALIASES: Record<string, string> = {
  pcs: 'pc',
  piece: 'pc',
  pieces: 'pc',
  ctns: 'ctn',
  boxes: 'box',
  pairs: 'pair',
  prs: 'pair',
  rolls: 'roll',
  tubes: 'tube',
  kgs: 'kg',
  packs: 'pack',
  units: 'unit',
};

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
  if (normalizedVariationName) {
    return `name::${normalizedVariationName}`;
  }
  return `sku::${normalizedSku}`;
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
  return PRICE_CODES.some((entry) => entry.code === value) ? (value as PriceCode) : null;
}

function parseNumberInput(value: string) {
  return Number(String(value).replace(/,/g, '')) || 0;
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

function getDiscountValueLabel(type: DiscountItem['discountType'], value: string) {
  if (!value) return '-';
  return type === 'Percent' ? `-${parseNumberInput(value)}%` : `-${formatCurrency(parseNumberInput(value))}`;
}

function getLessPhrase(type: DiscountItem['discountType'], value: string) {
  if (!value.trim()) return '';
  return type === 'Percent' ? `less ${parseNumberInput(value)}%` : `less ${formatCurrency(parseNumberInput(value))}`;
}

function getSuggestedNameValue(type: DiscountItem['discountType'], value: string) {
  if (!value.trim()) return '';
  return type === 'Percent' ? `-${parseNumberInput(value)}%` : `-${formatCurrency(parseNumberInput(value))}`;
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

function normalizeUnitCode(
  rawValue: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
) {
  const normalized = rawValue.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  const aliasMap = new Map<string, string>();
  Object.entries(FALLBACK_UNIT_ALIASES).forEach(([alias, code]) => {
    aliasMap.set(alias, code);
  });
  unitAliases.forEach((alias) => {
    aliasMap.set(alias.alias.trim().toLowerCase(), alias.unitCode.trim().toLowerCase());
  });
  unitDefinitions.forEach((unit) => {
    aliasMap.set(unit.code.trim().toLowerCase(), unit.code.trim().toLowerCase());
    aliasMap.set(unit.label.trim().toLowerCase(), unit.code.trim().toLowerCase());
  });

  return aliasMap.get(normalized) ?? normalized;
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

function formatDiscountCount(count: number) {
  return `${count} ${count === 1 ? 'discount' : 'discounts'}`;
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
  };
}

function parsePackagingText(
  rawValue: string,
  baseUnitCode: string,
  unitDefinitions: ProductUnitDefinition[],
  unitAliases: ProductUnitAliasDefinition[],
) {
  const segments = rawValue
    .split(':')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const generatedOptions: GeneratedUnitOption[] = [];
  const quantityByUnit = new Map<string, number>([[baseUnitCode, 1]]);
  const notes: string[] = [];

  segments.forEach((segment) => {
    const match = segment.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s*\/\s*([a-zA-Z]+)$/);
    if (!match) {
      notes.push(`Skipped "${segment}" because it could not be parsed.`);
      return;
    }

    const quantity = Number(match[1]);
    const fromUnit = normalizeUnitCode(match[2], unitDefinitions, unitAliases);
    const toUnit = normalizeUnitCode(match[3], unitDefinitions, unitAliases);

    if (!fromUnit || !toUnit) {
      notes.push(`Skipped "${segment}" because the unit could not be recognized.`);
      return;
    }

    const fromUnitBaseQuantity = quantityByUnit.get(fromUnit);
    const quantityInBaseUnit = fromUnitBaseQuantity ? quantity * fromUnitBaseQuantity : quantity;
    if (!fromUnitBaseQuantity && fromUnit !== baseUnitCode) {
      notes.push(`Used approximate conversion for "${segment}". Please review the generated row.`);
    }

    quantityByUnit.set(toUnit, quantityInBaseUnit);
    generatedOptions.push({
      unitCode: toUnit,
      unitLabel: toUnit,
      quantityInBaseUnit: String(quantityInBaseUnit),
      packagingText: segment,
      notes: fromUnitBaseQuantity || fromUnit === baseUnitCode ? '' : 'Please verify computed base quantity.',
    });
  });

  return {
    generatedOptions,
    message:
      generatedOptions.length > 0
        ? notes.length > 0
          ? notes[0]
          : 'Packaging text parsed successfully. Review and adjust the rows if needed.'
        : notes[0] ?? 'No packaging rows were generated.',
  };
}

export default function VarAndPrice({
  onBack,
  onNext,
  onNextLabel = 'Save Product',
  isSubmitting = false,
  isLoading = false,
  defaultBaseSku = '',
  items,
  unitDefinitions,
  unitAliases,
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
  const [packagingInputs, setPackagingInputs] = useState<Record<string, string>>({});
  const [parserMessages, setParserMessages] = useState<Record<string, string>>({});
  const [duplicateTarget, setDuplicateTarget] = useState<VariationCard | null>(null);
  const [imageSelectorCardId, setImageSelectorCardId] = useState<string | null>(null);

  const [discountDraft, setDiscountDraft] = useState<DiscountDraftRow[]>([]);
  const [activeDiscountTabId, setActiveDiscountTabId] = useState<string>('');
  const [discountModalError, setDiscountModalError] = useState('');
  const [discountManagedIds, setDiscountManagedIds] = useState<Set<string>>(new Set());
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
        'id, variation_id, unit_code, unit_label, base_unit_code, quantity_in_base_unit, price_override, packaging_text, min_order_quantity, order_increment, is_default, status, sort_order, notes',
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
      isOrderable: String(row.status ?? 'Active') !== 'Inactive',
      sortOrder: String(row.sort_order ?? '0'),
      notes: String(row.notes ?? ''),
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
        isOrderable: item.status !== 'Inactive',
        sortOrder: String(index),
      };
    });
    const copiedDiscounts = discounts
      .filter((item) => matchesVariation(card.id, card.rowIds[item.priceCode as PriceCode]))
      .map((item, index) => ({
        ...item,
        id: crypto.randomUUID(),
        discountRecordId: '',
        discountClassId: '',
        variationId: nextId,
        unitOptionId: unitIdMap.get(item.unitOptionId) ?? item.unitOptionId,
        promoRewardUnitOptionId: unitIdMap.get(item.promoRewardUnitOptionId) ?? item.promoRewardUnitOptionId,
        promoSourceSurchargeId: '',
        discountGroup: `${nextId}-${item.priceCode}`,
        applySequence: item.applySequence || String(index + 1),
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
    if (copiedDiscounts.length > 0) {
      onDiscountsChange([...discounts, ...copiedDiscounts]);
    }
    setPackagingInputs((current) => ({
      ...current,
      [nextId]: copiedUnitOptions.find((item) => item.packagingText)?.packagingText ?? '',
    }));
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
      const discountAmount =
        row.discountType === 'Percent'
          ? before * (amount / 100)
          : Math.min(amount, before);
      remainingPrice = roundMoney(Math.max(0, before - discountAmount));
      return {
        id: row.id,
        label: getDiscountValueLabel(row.discountType, row.amount),
        before,
        after: remainingPrice,
      };
    });
    const totalDiscount = roundMoney(Math.max(0, basePrice - remainingPrice));
    const effectiveDiscount = basePrice > 0 ? roundMoney((totalDiscount / basePrice) * 100) : 0;

    return {
      steps,
      finalPrice: remainingPrice,
      totalDiscount,
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
    const stackText = rows.map((row) => getLessPhrase(row.discountType, row.amount)).filter(Boolean);
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
      .map((row) => getSuggestedNameValue(row.discountType, row.amount))
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
      !orderableOptions.some((option) => option.id === rule.promoRewardUnitOptionId)
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
      status: 'Active',
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

  function normalizeDiscountRuleRows(rows: DiscountDraftRow[], groupKey: string) {
    const rule = rows[0] ?? createEmptyDiscountDraft();
    const group = groupKey.startsWith('legacy-') ? createDiscountGroupId() : groupKey;
    const stacked = rows.length > 1;

    return rows.map((row, index) => ({
      ...row,
      discountName: rule.discountName,
      unitCondition: rule.unitCondition,
      unitOptionId: rule.unitOptionId,
      minOrderQuantity: rule.minOrderQuantity || '1',
      maxOrderQuantity: rule.maxOrderQuantity,
      status: rule.status,
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
    setDiscountDraft((current) =>
      normalizeAllDiscountRules(
        current.map((item) => (getDraftRuleKey(item) === groupKey ? { ...item, ...patch } : item)),
      ),
    );
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
      orderIncrement: '1',
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
      isOrderable: item.status !== 'Inactive',
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
    updateCardUnitOptions(cardId, (currentOptions) => {
      const normalizedBaseUnitCode = nextBaseUnitCode || 'pc';
      const updatedOptions = currentOptions.map((item) => ({
        ...item,
        baseUnitCode: normalizedBaseUnitCode,
      }));
      const baseRowIndex = updatedOptions.findIndex(
        (item) => item.quantityInBaseUnit === '1' && item.isDefault,
      );

      if (baseRowIndex >= 0) {
        updatedOptions[baseRowIndex] = {
          ...updatedOptions[baseRowIndex],
          unitCode: normalizedBaseUnitCode,
          unitLabel: normalizedBaseUnitCode,
          baseUnitCode: normalizedBaseUnitCode,
          quantityInBaseUnit: '1',
          isDefault: true,
        };
        return updatedOptions;
      }

      return [createDefaultUnitOption(cardId, normalizedBaseUnitCode), ...updatedOptions.filter((item) => item.quantityInBaseUnit !== '1')];
    });
  }

  function handlePackagingParse(card: VariationCard) {
    const baseUnitCode = getCardBaseUnitCode(card.id);
    const packagingText = packagingInputs[card.id] ?? getCardUnitOptions(card.id).find((item) => item.packagingText)?.packagingText ?? '';
    const { generatedOptions, message } = parsePackagingText(
      packagingText,
      baseUnitCode,
      activeUnits,
      unitAliases,
    );

    setParserMessages((current) => ({ ...current, [card.id]: message }));
    if (generatedOptions.length === 0) {
      return;
    }

    updateCardUnitOptions(card.id, (currentOptions) => {
      const baseRow =
        currentOptions.find((item) => item.isDefault) ?? createDefaultUnitOption(card.id, baseUnitCode);
      const parsedRows = generatedOptions.map((item, index) => ({
        id: crypto.randomUUID(),
        variationId: card.id,
        unitCode: item.unitCode,
        unitLabel: item.unitLabel,
        baseUnitCode,
        quantityInBaseUnit: item.quantityInBaseUnit,
        priceOverride: '',
        packagingText: item.packagingText,
        minOrderQuantity: '1',
        orderIncrement: '1',
        isDefault: false,
        isOrderable: true,
        status: 'Active' as const,
        sortOrder: String(index + 1),
        notes: item.notes,
      }));
      return [
        {
          ...baseRow,
          unitCode: baseUnitCode,
          unitLabel: baseUnitCode,
          baseUnitCode,
          quantityInBaseUnit: '1',
          packagingText,
          isDefault: true,
        },
        ...parsedRows,
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
      stockQuantity: '0',
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
    const existing = discounts
      .filter((item) => matchVariation(item.variationId) && item.priceCode === code)
      .sort((a, b) => Number(a.applySequence || '1') - Number(b.applySequence || '1'))
      .map((item) => ({
        id: item.id,
        discountName: item.discountName,
        discountType: item.discountType,
        amount: item.amount,
        calculationMethod: item.calculationMethod || 'Single',
        applySequence: item.applySequence || '1',
        discountGroup: item.discountGroup || '',
        unitCondition: item.unitCondition || 'any_unit',
        unitOptionId: item.unitOptionId || '',
        minOrderQuantity: item.minOrderQuantity || item.minQuantity || '1',
        maxOrderQuantity: item.maxOrderQuantity || item.maxQuantity || '',
        status: item.status || 'Active',
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
        promoRewardSearchQuery: '',
      }));
    const visibleExisting = existing.map((item) => ({
      ...item,
      discountGroup: item.discountGroup || `legacy-${item.id}`,
    }));
    setDiscountDraft(
      visibleExisting.length > 0
        ? normalizeAllDiscountRules(visibleExisting)
        : [],
    );
    setDiscountManagedIds(new Set(visibleExisting.map((item) => item.id)));
    setActiveDiscountTabId(
      visibleExisting.length > 0
        ? getDraftRuleKey(visibleExisting[0])
        : '',
    );
  }

  function saveDiscountModal() {
    if (!discountContext) return;
    const codeConfig = PRICE_CODES.find((entry) => entry.code === discountContext.code);
    if (!codeConfig) return;
    const orderableOptions = getOrderableUnitOptions(discountContext.variationId);
    const currentCard = cards.find((card) => card.id === discountContext.variationId);
    const fallbackRowId = currentCard?.rowIds[discountContext.code];
    const matchVariation = matchesVariation(discountContext.variationId, fallbackRowId);
    const normalizedDraft = normalizeAllDiscountRules(discountDraft);
    const normalizedGroups = getDiscountRuleGroups(normalizedDraft);
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
    const validationError = normalizedDraft.find((item) => {
      const suggestedName = suggestedNameByGroup.get(getDraftRuleKey(item)) ?? '';
      if ((!item.discountName.trim() && !suggestedName) || !item.amount.trim()) {
        return true;
      }
      if (item.unitCondition === 'selected_unit' && !item.unitOptionId) {
        return true;
      }
      if (
        item.hasPromo &&
        (!item.promoRewardUnitOptionId || !item.promoRewardUnitCode || !item.promoRewardQuantity)
      ) {
        return true;
      }
      if (
        item.hasPromo &&
        item.promoRewardTargetType === 'same_item' &&
        !orderableOptions.some((option) => option.id === item.promoRewardUnitOptionId)
      ) {
        return true;
      }
      if (
        item.hasPromo &&
        item.promoRewardTargetType === 'different_item' &&
        (!item.promoRewardProductId || !item.promoRewardVariationId || !item.promoRewardUnitOptionId)
      ) {
        return true;
      }
      if (
        item.hasPromo &&
        item.promoRewardRepeatMode === 'every' &&
        (!item.promoRewardEveryQuantity || Number(item.promoRewardEveryQuantity) <= 0)
      ) {
        return true;
      }
      if (Number(item.minOrderQuantity || '0') <= 0) {
        return true;
      }
      return false;
    });
    if (validationError) {
      setDiscountModalError(
        'Complete the discount fields and choose a valid reward unit option before saving promo/freebie. Save the variation and unit options first if needed.',
      );
      return;
    }
    const filtered = discounts.filter((item) => {
      const samePriceContext = matchVariation(item.variationId) && item.priceCode === discountContext.code;
      if (!samePriceContext) return true;
      if (discountManagedIds.size === 0) return false;
      return !discountManagedIds.has(item.id);
    });
    const inserted: DiscountItem[] = normalizedDraft
      .filter((item) => (item.discountName.trim() || suggestedNameByGroup.get(getDraftRuleKey(item))) && item.amount.trim())
      .map((item, index) => ({
        id: item.id,
        discountRecordId: '',
        discountClassId: '',
        variationId: discountContext.variationId,
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
        startsAt: '',
        endsAt: '',
        unitCondition: item.unitCondition,
        unitOptionId: item.unitCondition === 'selected_unit' ? item.unitOptionId : '',
        orderUnitCode:
          item.unitCondition === 'selected_unit'
            ? getDraftUnitOption(discountContext.variationId, item.unitOptionId)?.unitCode ?? ''
            : '',
        minOrderQuantity: item.minOrderQuantity || '1',
        maxOrderQuantity: item.maxOrderQuantity,
        minBaseQuantity:
          item.unitCondition === 'selected_unit'
            ? computeBaseQuantityPreview(
                discountContext.variationId,
                item.unitCondition,
                item.unitOptionId,
                item.minOrderQuantity || '1',
              ).split(' ')[0] || ''
            : '',
        maxBaseQuantity:
          item.unitCondition === 'selected_unit'
            ? computeBaseQuantityPreview(
                discountContext.variationId,
                item.unitCondition,
                item.unitOptionId,
                item.maxOrderQuantity,
              ).split(' ')[0] || ''
            : '',
        unitRuleLabel: '',
        unitRuleNotes: '',
        hasPromo: item.hasPromo,
        promoType: item.promoType,
        promoRewardUnitCode: item.hasPromo ? item.promoRewardUnitCode : '',
        promoRewardQuantity: item.hasPromo ? item.promoRewardQuantity : '',
        promoRewardLabel:
          item.hasPromo && item.promoRewardQuantity && item.promoRewardUnitCode
            ? `free ${item.promoRewardQuantity} ${item.promoRewardUnitCode}${
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
        promoRewardUnitOptionId: item.hasPromo ? item.promoRewardUnitOptionId : '',
        promoRewardRepeatMode: item.hasPromo ? item.promoRewardRepeatMode : 'one_time',
        promoRewardEveryQuantity:
          item.hasPromo && item.promoRewardRepeatMode === 'every'
            ? item.promoRewardEveryQuantity
            : '',
      }));
    onDiscountsChange([...filtered, ...inserted]);
    setDiscountContext(null);
    setDiscountDraft([]);
    setActiveDiscountTabId('');
    setDiscountModalError('');
    setDiscountManagedIds(new Set());
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
            const packagingValue =
              packagingInputs[card.id] ??
              cardUnitOptions.find((item) => item.packagingText)?.packagingText ??
              '';

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
                            {(activeUnits.length > 0 ? activeUnits : [{ code: 'pc', label: 'pc', status: 'Active' }]).map((unit) => (
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
                        <label className={styles.fieldGroup}>
                          <span className={styles.fieldLabel}>Packaging Text Quick Input</span>
                          <input
                            className={styles.input}
                            value={packagingValue}
                            onChange={(event) =>
                              setPackagingInputs((current) => ({
                                ...current,
                                [card.id]: event.target.value,
                              }))
                            }
                            placeholder="100pcs/box:1000pcs/ctn"
                          />
                          <span className={styles.fieldHelper}>
                            Examples: 10pcs/pack:20pack/box:200pack/ctn, 180pcs/box:900pcs/ctn
                          </span>
                        </label>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => handlePackagingParse(card)}
                        >
                          Parse / Generate Units
                        </button>
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

                  {parserMessages[card.id] ? (
                    <p className={styles.parserMessage}>{parserMessages[card.id]}</p>
                  ) : null}

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
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? {
                                              ...item,
                                              unitCode: event.target.value,
                                              unitLabel: item.unitLabel || event.target.value,
                                            }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  <option value="">Select unit</option>
                                  {(activeUnits.length > 0
                                    ? activeUnits
                                    : [{ code: 'pc', label: 'pc', status: 'Active' }]).map(
                                    (unit) => (
                                      <option key={unit.code} value={unit.code}>
                                        {unit.label}
                                      </option>
                                    ),
                                  )}
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

                            <label className={styles.fieldGroup}>
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
                                              isOrderable: nextStatus === 'Active',
                                            }
                                          : item,
                                      ),
                                    );
                                  }}
                                >
                                  <option value="Active">Active</option>
                                  <option value="Inactive">Inactive</option>
                                </select>
                            </label>

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
                      const matchingDiscounts = discounts.filter(
                        (item) => matchVariation(item.variationId) && item.priceCode === entry.code,
                      );
                      const discountCount = countDiscountGroups(matchingDiscounts);
                      const discountWithPromoCount = countDiscountGroups(matchingDiscounts.filter(
                        (item) =>
                          item.hasPromo,
                      ));
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
                              Manage Discount ({formatDiscountCount(discountCount)})
                            </button>
                          </div>
                          {discountWithPromoCount > 0 ? (
                            <p className={styles.priceHint}>
                              {formatDiscountCount(discountCount)}, {discountWithPromoCount} with promo
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
              const stackingEnabled = false;
              return (
                <>
                  <div className={styles.modalHeader}>
                    <div>
                      <h4 className={styles.modalTitle}>Manage Discount: {discountContext.code}</h4>
                      <p className={styles.confirmText}>
                        Configure unit-aware discount rules for this price class.
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
                      <strong>Discounts:</strong> {discountRuleGroups.length}
                    </span>
                  </div>
                  {discountModalError ? <p className={styles.modalAlert}>{discountModalError}</p> : null}

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
                        + Add Discount
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

                        return (
                          <div key={ruleGroup.groupKey} className={styles.ruleCard}>
                            <div className={styles.ruleCardHeader}>
                              <span className={styles.rowIndex}>{ruleIndex + 1}</span>
                              <span className={styles.ruleSummary}>
                                Discount {ruleIndex + 1} - minimum {rule.minOrderQuantity || '1'} {getUnitOptionLabel(selectedOption)}
                              </span>
                              <button
                                type="button"
                                className={styles.deleteAction}
                                onClick={() => requestRemoveDiscountRule(ruleGroup.groupKey)}
                              >
                                Remove Discount
                              </button>
                            </div>

                            <div className={styles.ruleGrid}>
                              <input
                                className={styles.input}
                                placeholder="Discount name"
                                value={rule.discountName}
                                onChange={(event) => updateDiscountRule(ruleGroup.groupKey, { discountName: event.target.value })}
                              />
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
                              {rule.unitCondition === 'selected_unit' ? (
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
                              ) : null}
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
                              <input
                                className={styles.input}
                                placeholder="Max Order Qty (optional)"
                                value={rule.maxOrderQuantity}
                                onChange={(event) =>
                                  updateDiscountRule(ruleGroup.groupKey, {
                                    maxOrderQuantity: event.target.value.replace(/[^\d.]/g, ''),
                                  })
                                }
                              />
                              <select
                                className={styles.select}
                                value={rule.status}
                                onChange={(event) =>
                                  updateDiscountRule(ruleGroup.groupKey, {
                                    status: event.target.value as DiscountItem['status'],
                                  })
                                }
                              >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                              </select>
                            </div>

                            <h5 className={styles.modalSectionTitle}>Discount Stack</h5>
                            <div className={styles.stackList}>
                              {ruleGroup.rows.map((stackItem, stackIndex) => {
                                const isDragging = draggingDiscountStackId === stackItem.id;
                                const isDragOver =
                                  dragOverDiscountStackId === stackItem.id &&
                                  draggingDiscountStackId !== stackItem.id;

                                return (
                                  <div
                                    key={stackItem.id}
                                    className={`${styles.stackRow} ${isDragging ? styles.stackRowDragging : ''} ${
                                      isDragOver ? styles.stackRowDragOver : ''
                                    }`}
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
                                    <select
                                      className={`${styles.select} ${styles.stackTypeSelect}`}
                                      value={stackItem.discountType}
                                      onChange={(event) =>
                                        updateDiscountStack(stackItem.id, {
                                          discountType: event.target.value as DiscountItem['discountType'],
                                        })
                                      }
                                    >
                                      <option value="Percent">Percent</option>
                                      <option value="Amount">Amount</option>
                                    </select>
                                    <input
                                      className={`${styles.input} ${styles.stackValueInput}`}
                                      placeholder={stackItem.discountType === 'Percent' ? 'Discount %' : 'Amount'}
                                      value={stackItem.amount}
                                      onChange={(event) => updateDiscountStack(stackItem.id, { amount: event.target.value })}
                                    />
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
                                  </div>
                                );
                              })}
                            </div>
                            <button
                              type="button"
                              className={styles.secondaryAction}
                              onClick={() => addDiscountStack(ruleGroup.groupKey)}
                            >
                              + Add Discount Stack
                            </button>

                            <div className={styles.discountBasisPreview}>
                              <span><strong>Base:</strong> {formatCurrency(basePrice)}</span>
                              {stackingPreview.steps.map((step, stepIndex) => (
                                <span key={step.id}>
                                  <strong>{getDiscountValueLabel(ruleGroup.rows[stepIndex]?.discountType ?? 'Percent', ruleGroup.rows[stepIndex]?.amount ?? '')}</strong>{' '}
                                  -&gt; {formatCurrency(step.after)}
                                </span>
                              ))}
                              <span><strong>Final:</strong> {formatCurrency(stackingPreview.finalPrice)}</span>
                              <span><strong>Total Discount:</strong> {formatCurrency(stackingPreview.totalDiscount)}</span>
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
                                    {rule.promoRewardRepeatMode === 'every' ? (
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
                                    ) : (
                                      <div className={styles.readOnlyValue}>
                                        Reward is given once when condition is met.
                                      </div>
                                    )}
                                  </div>

                                  {rule.promoRewardTargetType === 'same_item' ? (
                                    <div className={styles.ruleGrid}>
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
                                      <div className={styles.readOnlyValue}>
                                        {rule.promoRewardQuantity && rule.promoRewardUnitCode
                                          ? `free ${rule.promoRewardQuantity} ${rule.promoRewardUnitCode}`
                                          : 'Reward preview'}
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <div className={styles.ruleGrid}>
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
                                        <div className={styles.readOnlyValue}>
                                          {rule.promoRewardProductLabel || 'No reward product selected'}
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
                                      </div>
                                    </>
                                  )}
                                  <div className={styles.readOnlyValue}>
                                    {buildPromoPreview(
                                      rule,
                                      getUnitOptionLabel(selectedOption),
                                      rewardUnitLabel,
                                    ) || 'Reward display preview'}
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
                                startsAt: '',
                                endsAt: '',
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
                                <option value="Percent">Percent</option>
                                <option value="Amount">Amount</option>
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
              <button type="button" className={styles.cancelButton} onClick={() => {
                setDiscountContext(null);
                setDiscountDraft([]);
                setActiveDiscountTabId('');
                setDiscountModalError('');
                setDiscountManagedIds(new Set());
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
