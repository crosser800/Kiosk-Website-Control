import { supabase } from '../lib/supabase';
import {
  type DiscountClassRule,
  type DiscountRule,
  type OrderCatalogPrice,
  type OrderCatalogUnitOption,
  type OrderPriceCode,
  type SurchargeClassRule,
  type SurchargeRule,
  computeOrderUnitPrice,
  toSafeNumber,
} from './orderPricing';

export type OrderCatalogProduct = {
  id: string;
  categoryId: string;
  categoryName: string;
  productName: string;
  skuCode: string;
  status: string;
  variations: OrderCatalogVariation[];
};

export type OrderCatalogVariation = {
  id: string;
  productId: string;
  variationName: string;
  skuCode: string;
  stockQuantity: number;
  availability: string;
  groupingKey: string;
  prices: Partial<Record<OrderPriceCode, OrderCatalogPrice>>;
  unitOptions: OrderCatalogUnitOption[];
  discounts: DiscountRule[];
  surcharges: SurchargeRule[];
};

export type OrderCatalogPriceClass = {
  id: string;
  priceCode: string;
  priceLabel: string;
  preferenceCode: string;
  status: string;
  sortOrder: number;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  product_name: string | null;
  sku_code: string | null;
  status: string | null;
  product_categories?: { category_title?: string | null } | Array<{ category_title?: string | null }> | null;
};

type VariationRow = {
  id: string;
  product_id: string | null;
  variation_name: string | null;
  class_name: string | null;
  branch_name: string | null;
  price_type: string | null;
  price_code: string | null;
  price: number | null;
  sku_code: string | null;
  stock_quantity: number | null;
  availability: string | null;
  sort_order: number | null;
};

type UnitOptionRow = {
  id: string;
  variation_id: string | null;
  unit_code: string | null;
  unit_label: string | null;
  base_unit_code: string | null;
  quantity_in_base_unit: number | null;
  price_override: number | null;
  packaging_text: string | null;
  min_order_quantity: number | null;
  order_increment: number | null;
  is_default: boolean | null;
  is_orderable: boolean | null;
  status: string | null;
  sort_order: number | null;
  notes: string | null;
};

type DiscountRow = {
  id: string;
  product_id: string | null;
  discount_name: string | null;
  discount_type: string | null;
  discount_percent: number | null;
  amount: number | null;
  status: string | null;
  min_quantity: number | null;
  max_quantity: number | null;
  branch_name: string | null;
  price_type: string | null;
  price_code: string | null;
  priority: number | null;
  apply_sequence: number | null;
  calculation_method: string | null;
  discount_group: string | null;
  applies_to: string | null;
  stackable: boolean | null;
  starts_at: string | null;
  ends_at: string | null;
};

type DiscountClassRow = {
  id: string;
  discount_id: string | null;
  variation_id: string | null;
  price_code: string | null;
  branch_name: string | null;
  price_type: string | null;
  unit_option_id: string | null;
  order_unit_code: string | null;
  unit_condition: string | null;
  min_order_quantity: number | null;
  max_order_quantity: number | null;
  min_base_quantity: number | null;
  max_base_quantity: number | null;
};

type SurchargeRow = {
  id: string;
  product_id: string | null;
  surcharge_name: string | null;
  surcharge_type: string | null;
  surcharge_percent: number | null;
  amount: number | null;
  free_quantity: number | null;
  status: string | null;
  min_quantity: number | null;
  max_quantity: number | null;
  branch_name: string | null;
  price_type: string | null;
  price_code: string | null;
  priority: number | null;
  starts_at: string | null;
  ends_at: string | null;
};

type SurchargeClassRow = DiscountClassRow & {
  surcharge_id: string | null;
  reward_quantity: number | null;
  reward_repeat_mode: string | null;
  reward_every_quantity: number | null;
};

type PriceClassRow = {
  id: string;
  price_code: string | null;
  price_label: string | null;
  preference_code: string | null;
  status: string | null;
  sort_order: number | null;
};

const PRICE_CODE_ORDER: OrderPriceCode[] = ['R1', 'R2', 'W1', 'W2', 'SP', 'CP'];

export async function loadOrderCatalog(): Promise<OrderCatalogProduct[]> {
  const [
    productsRes,
    variationsRes,
    unitOptionsRes,
    priceClassesRes,
    discountsRes,
    discountClassesRes,
    surchargesRes,
    surchargeClassesRes,
  ] = await Promise.all([
    supabase
      .from('products')
      .select('id, category_id, product_name, sku_code, status, product_categories(category_title)')
      .eq('status', 'Active')
      .order('product_name', { ascending: true }),
    supabase
      .from('product_variations')
      .select('id, product_id, variation_name, class_name, branch_name, price_type, price_code, price, sku_code, stock_quantity, availability, sort_order')
      .order('sort_order', { ascending: true }),
    supabase
      .from('product_variation_unit_options')
      .select('id, variation_id, unit_code, unit_label, base_unit_code, quantity_in_base_unit, price_override, packaging_text, min_order_quantity, order_increment, is_default, is_orderable, status, sort_order, notes')
      .eq('status', 'Active')
      .order('sort_order', { ascending: true }),
    supabase
      .from('price_classes')
      .select('id, price_code, price_label, preference_code, status, sort_order')
      .eq('status', 'Active')
      .order('sort_order', { ascending: true }),
    supabase
      .from('product_discounts')
      .select('id, product_id, discount_name, discount_type, discount_percent, amount, status, min_quantity, max_quantity, branch_name, price_type, price_code, priority, apply_sequence, calculation_method, discount_group, applies_to, stackable, starts_at, ends_at')
      .order('apply_sequence', { ascending: true })
      .order('priority', { ascending: true }),
    supabase
      .from('product_discount_classes')
      .select('id, discount_id, variation_id, price_code, branch_name, price_type, unit_option_id, order_unit_code, unit_condition, min_order_quantity, max_order_quantity, min_base_quantity, max_base_quantity'),
    supabase
      .from('product_surcharges')
      .select('id, product_id, surcharge_name, surcharge_type, surcharge_percent, amount, free_quantity, status, min_quantity, max_quantity, branch_name, price_type, price_code, priority, starts_at, ends_at')
      .order('priority', { ascending: true }),
    supabase
      .from('product_surcharge_classes')
      .select('id, surcharge_id, variation_id, price_code, branch_name, price_type, unit_option_id, order_unit_code, unit_condition, min_order_quantity, max_order_quantity, min_base_quantity, max_base_quantity, reward_quantity, reward_repeat_mode, reward_every_quantity'),
  ]);

  const loadError =
    productsRes.error ??
    variationsRes.error ??
    unitOptionsRes.error ??
    priceClassesRes.error ??
    discountsRes.error ??
    discountClassesRes.error ??
    surchargesRes.error ??
    surchargeClassesRes.error;

  if (loadError) {
    throw new Error(loadError.message);
  }

  return buildOrderCatalog({
    products: (productsRes.data ?? []) as ProductRow[],
    variations: (variationsRes.data ?? []) as VariationRow[],
    unitOptions: (unitOptionsRes.data ?? []) as UnitOptionRow[],
    discounts: (discountsRes.data ?? []) as DiscountRow[],
    discountClasses: (discountClassesRes.data ?? []) as DiscountClassRow[],
    surcharges: (surchargesRes.data ?? []) as SurchargeRow[],
    surchargeClasses: (surchargeClassesRes.data ?? []) as SurchargeClassRow[],
  });
}

export async function loadOrderPriceClasses(): Promise<OrderCatalogPriceClass[]> {
  const { data, error } = await supabase
    .from('price_classes')
    .select('id, price_code, price_label, preference_code, status, sort_order')
    .eq('status', 'Active')
    .order('sort_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PriceClassRow[]).map((row) => ({
    id: String(row.id),
    priceCode: String(row.price_code ?? ''),
    priceLabel: String(row.price_label ?? ''),
    preferenceCode: String(row.preference_code ?? ''),
    status: String(row.status ?? ''),
    sortOrder: toSafeNumber(row.sort_order, 0),
  }));
}

export function buildOrderCatalog(input: {
  products: ProductRow[];
  variations: VariationRow[];
  unitOptions: UnitOptionRow[];
  discounts: DiscountRow[];
  discountClasses: DiscountClassRow[];
  surcharges: SurchargeRow[];
  surchargeClasses: SurchargeClassRow[];
}) {
  const unitOptionsByVariationId = groupBy(input.unitOptions, (row) => String(row.variation_id ?? ''));
  const discountClassesByDiscountId = groupBy(input.discountClasses, (row) => String(row.discount_id ?? ''));
  const surchargeClassesBySurchargeId = groupBy(input.surchargeClasses, (row) => String(row.surcharge_id ?? ''));
  const discountsByProductId = groupBy(input.discounts, (row) => String(row.product_id ?? ''));
  const surchargesByProductId = groupBy(input.surcharges, (row) => String(row.product_id ?? ''));
  const variationsByProductId = groupBy(input.variations, (row) => String(row.product_id ?? ''));

  return input.products.map((product) => {
    const productId = String(product.id);
    const groupedVariations = groupVariationRows(variationsByProductId.get(productId) ?? []);
    const productDiscounts = (discountsByProductId.get(productId) ?? []).map((row) =>
      mapDiscountRule(row, discountClassesByDiscountId.get(String(row.id)) ?? []),
    );
    const productSurcharges = (surchargesByProductId.get(productId) ?? []).map((row) =>
      mapSurchargeRule(row, surchargeClassesBySurchargeId.get(String(row.id)) ?? []),
    );

    return {
      id: productId,
      categoryId: String(product.category_id ?? ''),
      categoryName: getCategoryName(product.product_categories),
      productName: String(product.product_name ?? 'Untitled Product'),
      skuCode: String(product.sku_code ?? ''),
      status: String(product.status ?? ''),
      variations: groupedVariations.map((group) =>
        buildCatalogVariation({
          productId,
          rows: group,
          unitOptionsByVariationId,
          discounts: productDiscounts,
          surcharges: productSurcharges,
        }),
      ),
    } satisfies OrderCatalogProduct;
  });
}

export function flattenOrderCatalogForAddItem(products: OrderCatalogProduct[]) {
  return products.flatMap((product) =>
    product.variations.flatMap((variation) =>
      PRICE_CODE_ORDER.flatMap((priceCode) => {
        const price = variation.prices[priceCode];
        if (!price) {
          return [];
        }
        return [
          {
            id: price.variationId,
            productId: product.id,
            categoryId: product.categoryId,
            categoryName: product.categoryName,
            productName: product.productName,
            productCode: product.skuCode,
            variationLabel: variation.variationName,
            branchName: price.branchName,
            priceType: price.priceType,
            priceCode: price.priceCode,
            unitPrice: price.basePrice,
            availability: variation.availability,
            unitOptions: variation.unitOptions.map((option) => ({
              id: option.id,
              unitCode: option.unitCode,
              unitLabel: option.unitLabel,
              priceOverride: option.priceOverride,
              minOrderQuantity: option.minOrderQuantity,
              sortOrder: option.sortOrder,
              isDefault: option.isDefault,
              quantityInBaseUnit: option.quantityInBaseUnit,
              computedPrice: computeOrderUnitPrice(price, option),
            })),
          },
        ];
      }),
    ),
  );
}

function buildCatalogVariation(input: {
  productId: string;
  rows: VariationRow[];
  unitOptionsByVariationId: Map<string, UnitOptionRow[]>;
  discounts: DiscountRule[];
  surcharges: SurchargeRule[];
}): OrderCatalogVariation {
  const firstRow = input.rows[0];
  const rowIds = new Set(input.rows.map((row) => String(row.id)));
  const prices: Partial<Record<OrderPriceCode, OrderCatalogPrice>> = {};

  input.rows.forEach((row) => {
    const priceCode = toPriceCode(row.price_code);
    if (!priceCode) {
      return;
    }
    prices[priceCode] = {
      id: String(row.id),
      variationId: String(row.id),
      priceCode,
      priceType: String(row.price_type ?? ''),
      branchName: String(row.branch_name ?? ''),
      basePrice: toSafeNumber(row.price, 0),
      className: String(row.class_name ?? row.variation_name ?? ''),
    };
  });

  const unitOptions = input.rows
    .flatMap((row) => input.unitOptionsByVariationId.get(String(row.id)) ?? [])
    .map(mapUnitOption)
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const representativeVariationId = findRepresentativeVariationId(input.rows);
  const groupedDiscounts = input.discounts
    .map((rule) => ({
      ...rule,
      classes: rule.classes.filter((item) => !item.variationId || rowIds.has(item.variationId)),
    }))
    .filter((rule) => input.discounts.find((item) => item.id === rule.id)?.classes.length === 0 || rule.classes.length > 0);
  const groupedSurcharges = input.surcharges
    .map((rule) => ({
      ...rule,
      classes: rule.classes.filter((item) => !item.variationId || rowIds.has(item.variationId)),
    }))
    .filter((rule) => input.surcharges.find((item) => item.id === rule.id)?.classes.length === 0 || rule.classes.length > 0);

  return {
    id: buildVariationGroupingKey(firstRow),
    productId: input.productId,
    variationName: String(firstRow?.variation_name ?? firstRow?.class_name ?? 'Variation'),
    skuCode: String(firstRow?.sku_code ?? ''),
    stockQuantity: Math.max(...input.rows.map((row) => toSafeNumber(row.stock_quantity, 0)), 0),
    availability: input.rows.some((row) => String(row.availability ?? '').toLowerCase() === 'available')
      ? 'Available'
      : String(firstRow?.availability ?? ''),
    groupingKey: buildVariationGroupingKey(firstRow),
    prices,
    unitOptions: unitOptions.length > 0 ? unitOptions : [createDefaultUnitOption(representativeVariationId)],
    discounts: groupedDiscounts,
    surcharges: groupedSurcharges,
  };
}

function groupVariationRows(rows: VariationRow[]) {
  const grouped = new Map<string, VariationRow[]>();
  rows.forEach((row) => {
    const key = buildVariationGroupingKey(row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });
  return Array.from(grouped.values());
}

function buildVariationGroupingKey(row?: VariationRow) {
  const variationName = String(row?.variation_name ?? row?.class_name ?? '').trim().toLowerCase();
  const skuCode = String(row?.sku_code ?? '').trim().toLowerCase();
  return `${variationName}::${skuCode}`;
}

function findRepresentativeVariationId(rows: VariationRow[]) {
  for (const priceCode of PRICE_CODE_ORDER) {
    const match = rows.find((row) => toPriceCode(row.price_code) === priceCode);
    if (match) {
      return String(match.id);
    }
  }
  return String(rows[0]?.id ?? '');
}

function mapUnitOption(row: UnitOptionRow): OrderCatalogUnitOption {
  const priceOverride = toSafeNumber(row.price_override, Number.NaN);
  return {
    id: String(row.id),
    variationId: String(row.variation_id ?? ''),
    unitCode: String(row.unit_code ?? '').trim(),
    unitLabel: String(row.unit_label ?? row.unit_code ?? 'Unit').trim(),
    baseUnitCode: String(row.base_unit_code ?? 'pc').trim(),
    quantityInBaseUnit: Math.max(1, toSafeNumber(row.quantity_in_base_unit, 1)),
    priceOverride: Number.isFinite(priceOverride) && priceOverride > 0 ? priceOverride : null,
    packagingText: String(row.packaging_text ?? ''),
    minOrderQuantity: Math.max(1, toSafeNumber(row.min_order_quantity, 1)),
    orderIncrement: Math.max(1, toSafeNumber(row.order_increment, 1)),
    isDefault: Boolean(row.is_default),
    isOrderable: row.is_orderable !== false,
    status: String(row.status ?? ''),
    sortOrder: toSafeNumber(row.sort_order, 0),
    notes: String(row.notes ?? ''),
  };
}

function createDefaultUnitOption(variationId: string): OrderCatalogUnitOption {
  return {
    id: `${variationId}:base-unit`,
    variationId,
    unitCode: 'pc',
    unitLabel: 'pc',
    baseUnitCode: 'pc',
    quantityInBaseUnit: 1,
    priceOverride: null,
    packagingText: '',
    minOrderQuantity: 1,
    orderIncrement: 1,
    isDefault: true,
    isOrderable: true,
    status: 'Active',
    sortOrder: 0,
    notes: '',
  };
}

function mapDiscountRule(row: DiscountRow, classes: DiscountClassRow[]): DiscountRule {
  return {
    id: String(row.id),
    name: String(row.discount_name ?? 'Discount'),
    type: String(row.discount_type ?? ''),
    percent: row.discount_percent === null ? null : toSafeNumber(row.discount_percent, 0),
    amount: row.amount === null ? null : toSafeNumber(row.amount, 0),
    status: String(row.status ?? ''),
    minQuantity: Math.max(1, toSafeNumber(row.min_quantity, 1)),
    maxQuantity: row.max_quantity === null ? null : toSafeNumber(row.max_quantity, 0),
    branchName: row.branch_name,
    priceType: row.price_type,
    priceCode: row.price_code,
    priority: toSafeNumber(row.priority, 0),
    applySequence: toSafeNumber(row.apply_sequence, toSafeNumber(row.priority, 0)),
    calculationMethod: row.calculation_method,
    discountGroup: row.discount_group,
    appliesTo: row.applies_to,
    stackable: Boolean(row.stackable),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    classes: classes.map(mapDiscountClassRule),
  };
}

function mapDiscountClassRule(row: DiscountClassRow): DiscountClassRule {
  return {
    id: String(row.id),
    variationId: row.variation_id,
    priceCode: row.price_code,
    branchName: row.branch_name,
    priceType: row.price_type,
    unitOptionId: row.unit_option_id,
    orderUnitCode: row.order_unit_code,
    unitCondition: String(row.unit_condition ?? 'any_unit'),
    minOrderQuantity: Math.max(1, toSafeNumber(row.min_order_quantity, 1)),
    maxOrderQuantity: row.max_order_quantity === null ? null : toSafeNumber(row.max_order_quantity, 0),
    minBaseQuantity: row.min_base_quantity === null ? null : toSafeNumber(row.min_base_quantity, 0),
    maxBaseQuantity: row.max_base_quantity === null ? null : toSafeNumber(row.max_base_quantity, 0),
  };
}

function mapSurchargeRule(row: SurchargeRow, classes: SurchargeClassRow[]): SurchargeRule {
  return {
    id: String(row.id),
    name: String(row.surcharge_name ?? 'Surcharge'),
    type: String(row.surcharge_type ?? ''),
    percent: row.surcharge_percent === null ? null : toSafeNumber(row.surcharge_percent, 0),
    amount: row.amount === null ? null : toSafeNumber(row.amount, 0),
    freeQuantity: toSafeNumber(row.free_quantity, 0),
    status: String(row.status ?? ''),
    minQuantity: Math.max(1, toSafeNumber(row.min_quantity, 1)),
    maxQuantity: row.max_quantity === null ? null : toSafeNumber(row.max_quantity, 0),
    branchName: row.branch_name,
    priceType: row.price_type,
    priceCode: row.price_code,
    priority: toSafeNumber(row.priority, 0),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    classes: classes.map(mapSurchargeClassRule),
  };
}

function mapSurchargeClassRule(row: SurchargeClassRow): SurchargeClassRule {
  return {
    ...mapDiscountClassRule(row),
    rewardQuantity: row.reward_quantity === null ? null : toSafeNumber(row.reward_quantity, 0),
    rewardRepeatMode: String(row.reward_repeat_mode ?? 'one_time'),
    rewardEveryQuantity: row.reward_every_quantity === null ? null : toSafeNumber(row.reward_every_quantity, 0),
  };
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce((result, item) => {
    const key = getKey(item);
    if (!key) {
      return result;
    }
    result.set(key, [...(result.get(key) ?? []), item]);
    return result;
  }, new Map<string, T[]>());
}

function toPriceCode(value: string | null): OrderPriceCode | null {
  const normalized = String(value ?? '').trim();
  return PRICE_CODE_ORDER.some((priceCode) => priceCode === normalized)
    ? (normalized as OrderPriceCode)
    : null;
}

function getCategoryName(value: ProductRow['product_categories']) {
  const category = Array.isArray(value) ? value[0] : value;
  return String(category?.category_title ?? 'Uncategorized');
}
