import { useEffect, useMemo, useState } from 'react';
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
  discounts: DiscountItem[];
  surcharges: SurchargeItem[];
  onChange: (items: VariationItem[]) => void;
  onUnitOptionsChange: (items: VariationUnitOptionItem[]) => void;
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

const PACKAGING_PRESETS = [
  '10pcs/pack:20pack/box:200pack/ctn',
  '100pcs/box:1000pcs/ctn',
  '180pcs/box:900pcs/ctn',
  '12pairs/pack:120pairs/ctn',
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

function getPreferredBasePriceCode(card: VariationCard): PriceCode {
  return (
    PRICE_CODES.find((entry) => card.prices[entry.code].trim())?.code ??
    'R1'
  );
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
  discounts,
  surcharges,
  onChange,
  onUnitOptionsChange,
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
  const [variationModalError, setVariationModalError] = useState('');
  const [activeCard, setActiveCard] = useState<VariationCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VariationCard | null>(null);
  const [isVariationModalOpen, setVariationModalOpen] = useState(false);
  const [discountContext, setDiscountContext] = useState<{ variationId: string; code: PriceCode } | null>(null);
  const [activeVariationTabId, setActiveVariationTabId] = useState<string>('');
  const [packagingInputs, setPackagingInputs] = useState<Record<string, string>>({});
  const [parserMessages, setParserMessages] = useState<Record<string, string>>({});

  const [discountDraft, setDiscountDraft] = useState<DiscountDraftRow[]>([]);
  const [activeDiscountTabId, setActiveDiscountTabId] = useState<string>('');
  const [discountModalError, setDiscountModalError] = useState('');
  const [selectedPackagingPresets, setSelectedPackagingPresets] = useState<Record<string, string>>({});
  const [rewardSearchResults, setRewardSearchResults] = useState<Record<string, RewardProductSearchItem[]>>({});
  const [rewardVariationOptions, setRewardVariationOptions] = useState<Record<string, RewardVariationOption[]>>({});
  const [rewardUnitOptions, setRewardUnitOptions] = useState<Record<string, VariationUnitOptionItem[]>>({});
  const [, setRewardSearchLoading] = useState<Record<string, boolean>>({});
  const [, setRewardVariationLoading] = useState<Record<string, boolean>>({});
  const [, setRewardUnitLoading] = useState<Record<string, boolean>>({});

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
    if (!activeDiscountTabId || !discountDraft.some((item) => item.id === activeDiscountTabId)) {
      setActiveDiscountTabId(discountDraft[0].id);
    }
  }, [activeDiscountTabId, discountDraft]);

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
        'id, variation_id, unit_code, unit_label, base_unit_code, quantity_in_base_unit, price_override, packaging_text, min_order_quantity, order_increment, is_default, is_orderable, status, sort_order, notes',
      )
      .eq('variation_id', variationId)
      .eq('status', 'Active')
      .eq('is_orderable', true)
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
      isOrderable: Boolean(row.is_orderable ?? true),
      status: String(row.status ?? 'Active') === 'Inactive' ? 'Inactive' : 'Active',
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

  function getOrderableUnitOptions(cardId: string) {
    return getCardUnitOptions(cardId).filter(
      (item) =>
        item.isOrderable &&
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

  function createEmptyDiscountDraft(): DiscountDraftRow {
    return {
      id: crypto.randomUUID(),
      discountName: '',
      discountType: 'Percent',
      amount: '',
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

  function handleApplyPackagingPreset(card: VariationCard) {
    const presetValue = selectedPackagingPresets[card.id] ?? '';
    if (!presetValue) {
      setParserMessages((current) => ({
        ...current,
        [card.id]: 'Select a quick-fill template first.',
      }));
      return;
    }

    setPackagingInputs((current) => ({
      ...current,
      [card.id]: presetValue,
    }));

    const baseUnitCode = getCardBaseUnitCode(card.id);
    const { generatedOptions, message } = parsePackagingText(
      presetValue,
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
        currentOptions.find((item) => item.isDefault) ??
        createDefaultUnitOption(card.id, baseUnitCode);
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
          packagingText: presetValue,
          isDefault: true,
        },
        ...parsedRows,
      ];
    });
  }

  function updateCardBasePrice(cardId: string, rawValue: string) {
    const priceCode = getPreferredBasePriceCode(cards.find((card) => card.id === cardId) ?? {
      id: cardId,
      variationName: '',
      baseSku: '',
      stockQuantity: '0',
      availability: 'Available',
      rowIds: {},
      prices: { R1: '', R2: '', W1: '', W2: '', SP: '', CP: '' },
    });
    pushCards(
      cards.map((card) =>
        card.id === cardId
          ? {
              ...card,
              prices: {
                ...card.prices,
                [priceCode]: formatPriceInput(rawValue),
              },
            }
          : card,
      ),
    );
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
    setDiscountDraft(
      existing.length > 0
        ? existing
        : [createEmptyDiscountDraft()],
    );
    setActiveDiscountTabId(existing[0]?.id ?? '');
  }

  function saveDiscountModal() {
    if (!discountContext) return;
    const codeConfig = PRICE_CODES.find((entry) => entry.code === discountContext.code);
    if (!codeConfig) return;
    const orderableOptions = getOrderableUnitOptions(discountContext.variationId);
    const currentCard = cards.find((card) => card.id === discountContext.variationId);
    const fallbackRowId = currentCard?.rowIds[discountContext.code];
    const matchVariation = matchesVariation(discountContext.variationId, fallbackRowId);
    const validationError = discountDraft.find((item) => {
      if (!item.discountName.trim() || !item.amount.trim()) {
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
    const filtered = discounts.filter(
      (item) => !(matchVariation(item.variationId) && item.priceCode === discountContext.code),
    );
    const inserted: DiscountItem[] = discountDraft
      .filter((item) => item.discountName.trim() && item.amount.trim())
      .map((item, index) => ({
        id: item.id,
        discountRecordId: '',
        discountClassId: '',
        variationId: discountContext.variationId,
        discountName: item.discountName.trim(),
        discountType: item.discountType,
        amount: item.amount,
        minQuantity: item.minOrderQuantity || '1',
        maxQuantity: item.maxOrderQuantity,
        branchName: codeConfig.branchName,
        priceType: codeConfig.priceType,
        priceCode: codeConfig.code,
        calculationMethod: 'Single',
        applySequence: String(index + 1),
        discountGroup: `${discountContext.variationId}-${discountContext.code}`,
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
            const cardBasePriceCode = getPreferredBasePriceCode(card);
            const basePrice = card.prices[cardBasePriceCode];
            const cardUnitOptions = getCardUnitOptions(card.id);
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

                        <label className={styles.fieldGroup}>
                          <span className={styles.fieldLabel}>Base Price / {baseUnitCode}</span>
                          <input
                            className={styles.input}
                            value={basePrice}
                            onChange={(event) => updateCardBasePrice(card.id, event.target.value)}
                            placeholder="0.00"
                          />
                          <span className={styles.fieldHelper}>
                            Price of 1 {baseUnitCode}.
                          </span>
                        </label>
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

                    <div className={styles.templatePanel}>
                      <div>
                        <h6 className={styles.templateTitle}>Packaging Template (Quick Fill)</h6>
                        <p className={styles.subsectionText}>
                          Choose a preset format to auto-generate order units for this variation.
                        </p>
                      </div>

                      <label className={styles.fieldGroup}>
                        <span className={styles.fieldLabel}>Select Template</span>
                        <select
                          className={styles.select}
                          value={selectedPackagingPresets[card.id] ?? ''}
                          onChange={(event) =>
                            setSelectedPackagingPresets((current) => ({
                              ...current,
                              [card.id]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Choose template</option>
                          {PACKAGING_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                        </select>
                      </label>

                      <div className={styles.templateActions}>
                        <button
                          type="button"
                          className={styles.secondaryAction}
                          onClick={() => handleApplyPackagingPreset(card)}
                        >
                          Apply Template
                        </button>
                      </div>

                      <p className={styles.templateHint}>
                        You can still edit the generated units before saving.
                      </p>
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
                        <span>Computed Price</span>
                        <span>Default</span>
                        <span>Orderable</span>
                        <span>Min Qty</span>
                        <span>Status</span>
                        <span>Actions</span>
                      </div>

                      {cardUnitOptions.map((option) => {
                        const computedPrice =
                          parseNumberInput(basePrice) * (Number(option.quantityInBaseUnit) || 1);

                        return (
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
                                <span className={styles.fieldLabel}>Computed Price</span>
                                <div className={styles.computedPrice}>{formatCurrency(computedPrice)}</div>
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

                            <label className={styles.toggleField}>
                                <span className={styles.fieldLabel}>Orderable</span>
                                <input
                                  type="checkbox"
                                  checked={option.isOrderable}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? { ...item, isOrderable: event.target.checked }
                                          : item,
                                        ),
                                    )
                                  }
                                />
                            </label>

                            <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Min Order Qty</span>
                                <input
                                  className={styles.input}
                                  value={option.minOrderQuantity}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? { ...item, minOrderQuantity: event.target.value.replace(/[^\d.]/g, '') }
                                          : item,
                                        ),
                                    )
                                  }
                                />
                            </label>

                            <label className={styles.fieldGroup}>
                                <span className={styles.fieldLabel}>Status</span>
                                <select
                                  className={styles.select}
                                  value={option.status}
                                  onChange={(event) =>
                                    updateCardUnitOptions(card.id, (currentOptions) =>
                                      currentOptions.map((item) =>
                                        item.id === option.id
                                          ? { ...item, status: event.target.value === 'Inactive' ? 'Inactive' : 'Active' }
                                          : item,
                                      ),
                                    )
                                  }
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
                        );
                      })}

                      <p className={styles.orderUnitsFooterNote}>
                        You can adjust the order rows per variation before saving. The computed price is based on the variation base price.
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
                      const discountCount = discounts.filter((item) => matchVariation(item.variationId) && item.priceCode === entry.code).length;
                      const discountWithPromoCount = discounts.filter(
                        (item) =>
                          matchVariation(item.variationId) &&
                          item.priceCode === entry.code &&
                          item.hasPromo,
                      ).length;
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
                              Manage Discount ({discountCount} rows)
                            </button>
                          </div>
                          {discountWithPromoCount > 0 ? (
                            <p className={styles.priceHint}>
                              {discountCount} discounts, {discountWithPromoCount} with promo
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

      {isVariationModalOpen && activeCard ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Variation Details</h4>
            {variationModalError ? <p className={styles.confirmText}>{variationModalError}</p> : null}
            <div className={styles.modalGrid}>
              <input className={styles.input} placeholder="Variation name" value={activeCard.variationName} onChange={(event) => setActiveCard({ ...activeCard, variationName: event.target.value })} />
              <input className={styles.input} placeholder="Base SKU code" value={activeCard.baseSku} onChange={(event) => setActiveCard({ ...activeCard, baseSku: event.target.value.toUpperCase() })} />
              <input className={styles.input} placeholder="Stock quantity" value={activeCard.stockQuantity} onChange={(event) => setActiveCard({ ...activeCard, stockQuantity: event.target.value.replace(/[^\d]/g, '') })} />
              {PRICE_CODES.map((entry) => (
                <input
                  key={entry.code}
                  className={styles.input}
                  placeholder={`${entry.code} price`}
                  value={activeCard.prices[entry.code]}
                  onChange={(event) =>
                    setActiveCard({
                      ...activeCard,
                      prices: { ...activeCard.prices, [entry.code]: formatPriceInput(event.target.value) },
                    })
                  }
                />
              ))}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setVariationModalOpen(false)}>Cancel</button>
              <button type="button" className={styles.registerButton} onClick={saveVariationCard}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

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

      {discountContext ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Manage Discount: {discountContext.code}</h4>
            <p className={styles.confirmText}>
              Configure unit-aware discount rules for this price class.
            </p>
            {discountModalError ? <p className={styles.confirmText}>{discountModalError}</p> : null}
            {(() => {
              const orderableOptions = getOrderableUnitOptions(discountContext.variationId);
              const activeTier =
                discountDraft.find((item) => item.id === activeDiscountTabId) ?? discountDraft[0] ?? null;
              return (
                <>
                  <div className={styles.ruleTabsHeader}>
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
                    <button
                      type="button"
                      className={styles.secondaryAction}
                      onClick={() => {
                        const nextRule = createEmptyDiscountDraft();
                        setDiscountDraft((current) => [...current, nextRule]);
                        setActiveDiscountTabId(nextRule.id);
                      }}
                    >
                      Add Discount Rule
                    </button>
                  </div>

                  <div className={styles.ruleList}>
                    {activeTier ? (() => {
                      const tier = activeTier;
                      const index = discountDraft.findIndex((item) => item.id === tier.id);
                      const selectedOption = getDraftUnitOption(
                        discountContext.variationId,
                        tier.unitOptionId,
                      );
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
                              calculationMethod: 'Single',
                              applySequence: String(index + 1),
                              discountGroup: '',
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
                              onClick={() => {
                                setDiscountDraft((current) => current.filter((item) => item.id !== tier.id));
                              }}
                            >
                              Remove
                            </button>
                          </div>

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
                </>
              );
            })()}
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => {
                setDiscountContext(null);
                setDiscountDraft([]);
                setActiveDiscountTabId('');
                setDiscountModalError('');
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
