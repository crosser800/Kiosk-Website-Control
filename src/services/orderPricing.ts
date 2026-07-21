export type OrderPriceCode = 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP';

export type OrderCatalogPrice = {
  id: string;
  variationId: string;
  priceCode: OrderPriceCode;
  priceType: string;
  branchName: string;
  basePrice: number;
  className: string;
};

export type OrderCatalogUnitOption = {
  id: string;
  variationId: string;
  unitCode: string;
  unitLabel: string;
  baseUnitCode: string;
  quantityInBaseUnit: number;
  priceOverride: number | null;
  packagingText: string;
  minOrderQuantity: number;
  orderIncrement: number;
  isDefault: boolean;
  isOrderable: boolean;
  status: string;
  sortOrder: number;
  notes: string;
};

export type ApplicablePromotion = {
  id: string;
  source: 'discount' | 'surcharge';
  dedupeKey: string;
  name: string;
  type: 'Percent' | 'Amount' | 'Freebie' | 'BonusQty' | string;
  priority: number;
  stackable: boolean;
  discountAmount: number;
  surchargeAmount: number;
  freeQuantity: number;
  description: string;
};

export type PromotionIneligibilityReason =
  | 'inactive'
  | 'outside_effective_date'
  | 'wrong_price_class'
  | 'wrong_unit'
  | 'below_minimum_quantity'
  | 'above_maximum_quantity'
  | 'wrong_branch'
  | 'wrong_price_type'
  | 'wrong_variation';

export type PromotionEligibility = {
  id: string;
  source: 'discount' | 'surcharge';
  dedupeKey: string;
  name: string;
  type: string;
  priority: number;
  stackable: boolean;
  description: string;
  reasons: PromotionIneligibilityReason[];
};

export type OrderItemDraft = {
  productId: string;
  variationId: string;
  priceCode: OrderPriceCode;
  unitOptionId: string;
  quantity: number;
  branchName?: string;
  priceType?: string;
  orderDate?: Date;
};

export type DiscountRule = {
  id: string;
  name: string;
  type: 'Percent' | 'Amount' | string;
  percent: number | null;
  amount: number | null;
  status: string;
  minQuantity: number;
  maxQuantity: number | null;
  branchName: string | null;
  priceType: string | null;
  priceCode: string | null;
  priority: number;
  stackable: boolean;
  startsAt: string | null;
  endsAt: string | null;
  classes: DiscountClassRule[];
};

export type DiscountClassRule = {
  id: string;
  variationId: string | null;
  priceCode: string | null;
  branchName: string | null;
  priceType: string | null;
  unitOptionId: string | null;
  orderUnitCode: string | null;
  unitCondition: string;
  minOrderQuantity: number;
  maxOrderQuantity: number | null;
  minBaseQuantity: number | null;
  maxBaseQuantity: number | null;
};

export type SurchargeRule = {
  id: string;
  name: string;
  type: 'Amount' | 'Percent' | 'Freebie' | 'BonusQty' | string;
  percent: number | null;
  amount: number | null;
  freeQuantity: number;
  status: string;
  minQuantity: number;
  maxQuantity: number | null;
  branchName: string | null;
  priceType: string | null;
  priceCode: string | null;
  priority: number;
  startsAt: string | null;
  endsAt: string | null;
  classes: SurchargeClassRule[];
};

export type SurchargeClassRule = DiscountClassRule & {
  rewardQuantity: number | null;
  rewardRepeatMode: string;
  rewardEveryQuantity: number | null;
};

export type OrderLineCalculation = {
  basePrice: number;
  packagingMultiplier: number;
  computedUnitPrice: number;
  quantity: number;
  grossSubtotal: number;
  appliedPromotions: ApplicablePromotion[];
  availablePromotions: PromotionEligibility[];
  ineligiblePromotions: PromotionEligibility[];
  discountAmount: number;
  surchargeAmount: number;
  freeQuantity: number;
  finalLineTotal: number;
};

type RuleMatchContext = {
  variationId: string;
  price: OrderCatalogPrice;
  unitOption: OrderCatalogUnitOption;
  quantity: number;
  baseQuantity: number;
  branchName?: string;
  priceType?: string;
  orderDate: Date;
};

export function toSafeNumber(value: unknown, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function computeOrderUnitPrice(price: OrderCatalogPrice, unitOption: OrderCatalogUnitOption) {
  const override = toSafeNumber(unitOption.priceOverride, Number.NaN);
  if (Number.isFinite(override) && override > 0) {
    return override;
  }

  const multiplier = Math.max(1, toSafeNumber(unitOption.quantityInBaseUnit, 1));
  return toSafeNumber(price.basePrice, 0) * multiplier;
}

export function calculateOrderLine(input: {
  price: OrderCatalogPrice;
  unitOption: OrderCatalogUnitOption;
  quantity: number;
  discounts?: DiscountRule[];
  surcharges?: SurchargeRule[];
  branchName?: string;
  priceType?: string;
  orderDate?: Date;
}): OrderLineCalculation {
  const quantity = Math.max(1, toSafeNumber(input.quantity, 1));
  const packagingMultiplier = Math.max(1, toSafeNumber(input.unitOption.quantityInBaseUnit, 1));
  const computedUnitPrice = computeOrderUnitPrice(input.price, input.unitOption);
  const grossSubtotal = computedUnitPrice * quantity;
  const context: RuleMatchContext = {
    variationId: input.price.variationId,
    price: input.price,
    unitOption: input.unitOption,
    quantity,
    baseQuantity: quantity * packagingMultiplier,
    branchName: input.branchName,
    priceType: input.priceType,
    orderDate: input.orderDate ?? new Date(),
  };

  const discountEvaluations = dedupeRules(input.discounts ?? [], 'discount').map((rule) =>
    evaluateDiscountRule(rule, context),
  );
  const surchargeEvaluations = dedupeRules(input.surcharges ?? [], 'surcharge').map((rule) =>
    evaluateSurchargeRule(rule, context),
  );
  const discountPromotions = discountEvaluations
    .filter((evaluation) => evaluation.reasons.length === 0)
    .map((evaluation) => evaluation.rule)
    .sort(comparePromotions)
    .filter(createStackingFilter())
    .map((rule) => {
      const discountAmount =
        rule.type === 'Percent'
          ? grossSubtotal * ((rule.percent ?? 0) / 100)
          : Math.min(rule.amount ?? 0, grossSubtotal);
      return {
        id: rule.id,
        source: 'discount' as const,
        dedupeKey: createPromotionDedupeKey(rule, 'discount'),
        name: rule.name,
        type: rule.type,
        priority: rule.priority,
        stackable: rule.stackable,
        discountAmount,
        surchargeAmount: 0,
        freeQuantity: 0,
        description: describeDiscountRule(rule, discountAmount),
      };
    });

  const surchargePromotions = surchargeEvaluations
    .filter((evaluation) => evaluation.reasons.length === 0)
    .map((evaluation) => evaluation.rule)
    .sort(comparePromotions)
    .map((rule) => {
      const surchargeAmount =
        rule.type === 'Percent'
          ? grossSubtotal * ((rule.percent ?? 0) / 100)
          : rule.type === 'Amount'
            ? rule.amount ?? 0
            : 0;
      return {
        id: rule.id,
        source: 'surcharge' as const,
        dedupeKey: createPromotionDedupeKey(rule, 'surcharge'),
        name: rule.name,
        type: rule.type,
        priority: rule.priority,
        stackable: true,
        discountAmount: 0,
        surchargeAmount,
        freeQuantity: getRewardQuantity(rule, quantity),
        description: describeSurchargeRule(rule, surchargeAmount, getRewardQuantity(rule, quantity)),
      };
    });

  const appliedPromotions = [...discountPromotions, ...surchargePromotions];
  const appliedKeys = new Set(appliedPromotions.map((promotion) => promotion.dedupeKey));
  const availablePromotions = [...discountEvaluations, ...surchargeEvaluations]
    .filter((evaluation) => evaluation.reasons.length === 0 && !appliedKeys.has(evaluation.dedupeKey))
    .map(toPromotionEligibility);
  const ineligiblePromotions = [...discountEvaluations, ...surchargeEvaluations]
    .filter((evaluation) => evaluation.reasons.length > 0)
    .map(toPromotionEligibility);
  const discountAmount = appliedPromotions.reduce((sum, item) => sum + item.discountAmount, 0);
  const surchargeAmount = appliedPromotions.reduce((sum, item) => sum + item.surchargeAmount, 0);
  const freeQuantity = appliedPromotions.reduce((sum, item) => sum + item.freeQuantity, 0);

  return {
    basePrice: input.price.basePrice,
    packagingMultiplier,
    computedUnitPrice,
    quantity,
    grossSubtotal,
    appliedPromotions,
    availablePromotions,
    ineligiblePromotions,
    discountAmount,
    surchargeAmount,
    freeQuantity,
    finalLineTotal: Math.max(0, grossSubtotal - discountAmount + surchargeAmount),
  };
}

type DiscountEvaluation = {
  rule: DiscountRule;
  source: 'discount';
  dedupeKey: string;
  reasons: PromotionIneligibilityReason[];
};

type SurchargeEvaluation = {
  rule: SurchargeRule;
  source: 'surcharge';
  dedupeKey: string;
  reasons: PromotionIneligibilityReason[];
};

function comparePromotions(left: { priority: number }, right: { priority: number }) {
  return left.priority - right.priority;
}

function createStackingFilter() {
  let acceptedNonStackable = false;
  return (rule: DiscountRule) => {
    if (acceptedNonStackable) {
      return rule.stackable;
    }
    if (!rule.stackable) {
      acceptedNonStackable = true;
    }
    return true;
  };
}

function evaluateDiscountRule(rule: DiscountRule, context: RuleMatchContext): DiscountEvaluation {
  return {
    rule,
    source: 'discount',
    dedupeKey: createPromotionDedupeKey(rule, 'discount'),
    reasons: getRuleIneligibilityReasons(rule, context),
  };
}

function evaluateSurchargeRule(rule: SurchargeRule, context: RuleMatchContext): SurchargeEvaluation {
  return {
    rule,
    source: 'surcharge',
    dedupeKey: createPromotionDedupeKey(rule, 'surcharge'),
    reasons: getRuleIneligibilityReasons(rule, context),
  };
}

function getRuleIneligibilityReasons(
  rule: {
    status: string;
    minQuantity: number;
    maxQuantity: number | null;
    branchName: string | null;
    priceType: string | null;
    priceCode: string | null;
    startsAt: string | null;
    endsAt: string | null;
    classes: DiscountClassRule[];
  },
  context: RuleMatchContext,
) {
  const reasons: PromotionIneligibilityReason[] = [];
  if (!isActive(rule.status)) {
    reasons.push('inactive');
  }
  if (!isInDateRange(rule.startsAt, rule.endsAt, context.orderDate)) {
    reasons.push('outside_effective_date');
  }
  addQuantityReasons(reasons, context.quantity, rule.minQuantity, rule.maxQuantity);
  if (!isNullableTextMatch(rule.branchName, context.branchName ?? context.price.branchName)) {
    reasons.push('wrong_branch');
  }
  if (!isNullableTextMatch(rule.priceType, context.priceType ?? context.price.priceType)) {
    reasons.push('wrong_price_type');
  }
  if (!isNullableTextMatch(rule.priceCode, context.price.priceCode)) {
    reasons.push('wrong_price_class');
  }
  if (rule.classes.length > 0) {
    const classReasons = rule.classes.map((item) => getClassIneligibilityReasons(item, context));
    if (!classReasons.some((item) => item.length === 0)) {
      reasons.push(...Array.from(new Set(classReasons.flat())));
    }
  }
  return Array.from(new Set(reasons));
}

function getClassIneligibilityReasons(rule: DiscountClassRule, context: RuleMatchContext) {
  const reasons: PromotionIneligibilityReason[] = [];
  const usesSelectedUnit = String(rule.unitCondition ?? '').toLowerCase() === 'selected_unit';
  const quantityForRule = usesSelectedUnit ? context.quantity : context.baseQuantity;

  if (!isNullableTextMatch(rule.variationId, context.variationId)) {
    reasons.push('wrong_variation');
  }
  if (!isNullableTextMatch(rule.priceCode, context.price.priceCode)) {
    reasons.push('wrong_price_class');
  }
  if (!isNullableTextMatch(rule.branchName, context.branchName ?? context.price.branchName)) {
    reasons.push('wrong_branch');
  }
  if (!isNullableTextMatch(rule.priceType, context.priceType ?? context.price.priceType)) {
    reasons.push('wrong_price_type');
  }
  if (
    usesSelectedUnit &&
    (!isNullableTextMatch(rule.unitOptionId, context.unitOption.id) ||
      !isNullableTextMatch(rule.orderUnitCode, context.unitOption.unitCode))
  ) {
    reasons.push('wrong_unit');
  }
  addQuantityReasons(reasons, quantityForRule, rule.minOrderQuantity, rule.maxOrderQuantity);
  addQuantityReasons(reasons, context.baseQuantity, rule.minBaseQuantity, rule.maxBaseQuantity);
  return Array.from(new Set(reasons));
}

function addQuantityReasons(
  reasons: PromotionIneligibilityReason[],
  quantity: number,
  minQuantity: number | null,
  maxQuantity: number | null,
) {
  if (quantity < Math.max(0, minQuantity ?? 0)) {
    reasons.push('below_minimum_quantity');
  }
  if (maxQuantity !== null && maxQuantity > 0 && quantity > maxQuantity) {
    reasons.push('above_maximum_quantity');
  }
}

function isActive(status: string) {
  return String(status ?? '').trim().toLowerCase() === 'active';
}

function isInDateRange(startsAt: string | null, endsAt: string | null, orderDate: Date) {
  const time = orderDate.getTime();
  const start = startsAt ? Date.parse(startsAt) : Number.NaN;
  const end = endsAt ? Date.parse(endsAt) : Number.NaN;
  return (
    (Number.isNaN(start) || time >= start) &&
    (Number.isNaN(end) || time <= end)
  );
}

function isNullableTextMatch(ruleValue: string | null, actualValue: string | null | undefined) {
  if (!ruleValue) {
    return true;
  }
  const normalizedRule = ruleValue.trim().toLowerCase();
  if (!normalizedRule || normalizedRule === 'both') {
    return true;
  }
  return normalizedRule === String(actualValue ?? '').trim().toLowerCase();
}

function getRewardQuantity(rule: SurchargeRule, quantity: number) {
  if (rule.type !== 'Freebie' && rule.type !== 'BonusQty') {
    return 0;
  }

  const classReward = rule.classes.find((item) => item.rewardQuantity !== null);
  const rewardQuantity = classReward?.rewardQuantity ?? rule.freeQuantity;
  if (!rewardQuantity) {
    return 0;
  }

  const repeatMode = classReward?.rewardRepeatMode || 'one_time';
  const everyQuantity = classReward?.rewardEveryQuantity ?? rule.minQuantity;
  if (repeatMode === 'every' && everyQuantity > 0) {
    return Math.floor(quantity / everyQuantity) * rewardQuantity;
  }
  return rewardQuantity;
}

function dedupeRules<Rule extends DiscountRule | SurchargeRule>(rules: Rule[], source: 'discount' | 'surcharge') {
  const seen = new Set<string>();
  return rules.filter((rule) => {
    const key = createPromotionDedupeKey(rule, source);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function createPromotionDedupeKey(rule: DiscountRule | SurchargeRule, source: 'discount' | 'surcharge') {
  const classes = rule.classes
    .map((item) =>
      [
        normalizeText(item.variationId),
        normalizeText(item.priceCode),
        normalizeText(item.branchName),
        normalizeText(item.priceType),
        normalizeText(item.unitOptionId),
        normalizeText(item.orderUnitCode),
        normalizeText(item.unitCondition),
        item.minOrderQuantity,
        item.maxOrderQuantity ?? '',
        item.minBaseQuantity ?? '',
        item.maxBaseQuantity ?? '',
        'rewardQuantity' in item ? item.rewardQuantity ?? '' : '',
        'rewardRepeatMode' in item ? normalizeText(item.rewardRepeatMode) : '',
        'rewardEveryQuantity' in item ? item.rewardEveryQuantity ?? '' : '',
      ].join('|'),
    )
    .sort()
    .join('::');
  return [
    source,
    normalizeText(rule.priceCode),
    normalizeText(rule.priceType),
    normalizeText(rule.branchName),
    normalizeText(rule.type),
    rule.minQuantity,
    rule.maxQuantity ?? '',
    rule.percent ?? '',
    rule.amount ?? '',
    'freeQuantity' in rule ? rule.freeQuantity ?? '' : '',
    classes,
  ].join('::');
}

function toPromotionEligibility(evaluation: DiscountEvaluation | SurchargeEvaluation): PromotionEligibility {
  return {
    id: evaluation.rule.id,
    source: evaluation.source,
    dedupeKey: evaluation.dedupeKey,
    name: evaluation.rule.name,
    type: evaluation.rule.type,
    priority: evaluation.rule.priority,
    stackable: 'stackable' in evaluation.rule ? evaluation.rule.stackable : true,
    description:
      evaluation.source === 'discount'
        ? describeDiscountRule(evaluation.rule, 0)
        : describeSurchargeRule(evaluation.rule, 0, getRewardQuantity(evaluation.rule, 1)),
    reasons: evaluation.reasons,
  };
}

function describeDiscountRule(rule: DiscountRule, discountAmount: number) {
  if (rule.type === 'Percent' && rule.percent) {
    return `${rule.percent}% discount${discountAmount > 0 ? ` (${formatAmount(discountAmount)})` : ''}`;
  }
  if (rule.type === 'Amount' && rule.amount) {
    return `${formatAmount(rule.amount)} discount`;
  }
  return rule.type || 'Discount';
}

function describeSurchargeRule(rule: SurchargeRule, surchargeAmount: number, freeQuantity: number) {
  if ((rule.type === 'Freebie' || rule.type === 'BonusQty') && freeQuantity > 0) {
    return `Free ${freeQuantity} unit${freeQuantity === 1 ? '' : 's'}`;
  }
  if (rule.type === 'Percent' && rule.percent) {
    return `${rule.percent}% surcharge${surchargeAmount > 0 ? ` (${formatAmount(surchargeAmount)})` : ''}`;
  }
  if (rule.type === 'Amount' && rule.amount) {
    return `${formatAmount(rule.amount)} surcharge`;
  }
  return rule.type || 'Surcharge';
}

function formatAmount(value: number) {
  return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function normalizeText(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}
