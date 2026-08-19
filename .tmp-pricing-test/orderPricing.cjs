"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toSafeNumber = toSafeNumber;
exports.computeOrderUnitPrice = computeOrderUnitPrice;
exports.calculateOrderLine = calculateOrderLine;
function toSafeNumber(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}
function computeOrderUnitPrice(price, unitOption) {
    const override = toSafeNumber(unitOption.priceOverride, Number.NaN);
    if (Number.isFinite(override) && override > 0) {
        return override;
    }
    const multiplier = Math.max(1, toSafeNumber(unitOption.quantityInBaseUnit, 1));
    return toSafeNumber(price.basePrice, 0) * multiplier;
}
function calculateOrderLine(input) {
    const quantity = Math.max(1, toSafeNumber(input.quantity, 1));
    const packagingMultiplier = Math.max(1, toSafeNumber(input.unitOption.quantityInBaseUnit, 1));
    const computedUnitPrice = computeOrderUnitPrice(input.price, input.unitOption);
    const grossSubtotal = computedUnitPrice * quantity;
    const context = {
        variationId: input.price.variationId,
        price: input.price,
        unitOption: input.unitOption,
        quantity,
        baseQuantity: quantity * packagingMultiplier,
        branchName: input.branchName,
        priceType: input.priceType,
        orderDate: input.orderDate ?? new Date(),
    };
    const discountEvaluations = dedupeRules(input.discounts ?? [], 'discount').map((rule) => evaluateDiscountRule(rule, context));
    const surchargeEvaluations = dedupeRules(input.surcharges ?? [], 'surcharge').map((rule) => evaluateSurchargeRule(rule, context));
    const eligibleDiscountRules = discountEvaluations
        .filter((evaluation) => evaluation.reasons.length === 0)
        .map((evaluation) => evaluation.rule)
        .sort(compareDiscountRules);
    const selectedDiscountRules = selectBestDiscountRuleGroup(eligibleDiscountRules);
    const discountPromotions = calculateDiscountPromotions(selectedDiscountRules, grossSubtotal);
    const surchargePromotions = surchargeEvaluations
        .filter((evaluation) => evaluation.reasons.length === 0)
        .map((evaluation) => evaluation.rule)
        .sort(comparePromotions)
        .map((rule) => {
        const surchargeAmount = rule.type === 'Percent'
            ? grossSubtotal * ((rule.percent ?? 0) / 100)
            : rule.type === 'Amount'
                ? rule.amount ?? 0
                : 0;
        return {
            id: rule.id,
            source: 'surcharge',
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
function comparePromotions(left, right) {
    return left.priority - right.priority;
}
function compareDiscountRules(left, right) {
    const leftOrder = toSafeNumber(left.applySequence, Number.NaN);
    const rightOrder = toSafeNumber(right.applySequence, Number.NaN);
    if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
    }
    if (Number.isFinite(leftOrder) !== Number.isFinite(rightOrder)) {
        return Number.isFinite(leftOrder) ? -1 : 1;
    }
    return left.priority - right.priority;
}
function selectBestDiscountRuleGroup(rules) {
    if (rules.length <= 1)
        return rules;
    const groups = new Map();
    rules.forEach((rule) => {
        const key = normalizeText(rule.discountGroup) || rule.id;
        groups.set(key, [...(groups.get(key) ?? []), rule]);
    });
    const sortedGroups = Array.from(groups.values()).sort((left, right) => {
        const kindOrder = compareDiscountRuleGroupKind(left, right);
        if (kindOrder !== 0) {
            return kindOrder;
        }
        const leftSpecificity = getDiscountRuleGroupSpecificity(left);
        const rightSpecificity = getDiscountRuleGroupSpecificity(right);
        if (leftSpecificity !== rightSpecificity) {
            return rightSpecificity - leftSpecificity;
        }
        return Math.min(...left.map((rule) => rule.priority)) - Math.min(...right.map((rule) => rule.priority));
    });
    return (sortedGroups[0] ?? []).slice().sort(compareDiscountRules);
}
function compareDiscountRuleGroupKind(left, right) {
    const leftIsPromo = left.some((rule) => normalizeText(rule.discountKind) === 'promo');
    const rightIsPromo = right.some((rule) => normalizeText(rule.discountKind) === 'promo');
    const leftIsBase = left.every((rule) => normalizeText(rule.discountKind) === 'base');
    const rightIsBase = right.every((rule) => normalizeText(rule.discountKind) === 'base');
    if (leftIsPromo && rightIsBase)
        return -1;
    if (rightIsPromo && leftIsBase)
        return 1;
    return 0;
}
function getDiscountRuleGroupSpecificity(rules) {
    return Math.max(...rules.map((rule) => Math.max(toSafeNumber(rule.minQuantity, 1), ...rule.classes.map((item) => toSafeNumber(item.minOrderQuantity, 1)))));
}
function calculateDiscountPromotions(rules, grossSubtotal) {
    const cascadingGroups = new Set(rules
        .filter((rule) => isCascadingRule(rule))
        .map((rule) => normalizeText(rule.discountGroup) || rule.id));
    const remainingByGroup = new Map();
    return rules.map((rule) => {
        const groupKey = normalizeText(rule.discountGroup) || rule.id;
        const usesCascading = cascadingGroups.has(groupKey) && isCascadingRule(rule);
        const basis = usesCascading ? remainingByGroup.get(groupKey) ?? grossSubtotal : grossSubtotal;
        const discountAmount = rule.type === 'Percent'
            ? basis * ((rule.percent ?? 0) / 100)
            : Math.min(rule.amount ?? 0, basis);
        const boundedDiscount = Math.min(Math.max(0, discountAmount), basis);
        if (usesCascading) {
            remainingByGroup.set(groupKey, Math.max(0, basis - boundedDiscount));
        }
        return {
            id: rule.id,
            source: 'discount',
            dedupeKey: createPromotionDedupeKey(rule, 'discount'),
            name: rule.name,
            type: rule.type,
            priority: rule.priority,
            stackable: rule.stackable,
            discountAmount: boundedDiscount,
            surchargeAmount: 0,
            freeQuantity: 0,
            description: describeDiscountRule(rule, boundedDiscount),
        };
    });
}
function isCascadingRule(rule) {
    return (rule.stackable === true &&
        String(rule.calculationMethod ?? '').trim().toLowerCase() === 'cascading');
}
function evaluateDiscountRule(rule, context) {
    return {
        rule,
        source: 'discount',
        dedupeKey: createPromotionDedupeKey(rule, 'discount'),
        reasons: getRuleIneligibilityReasons(rule, context),
    };
}
function evaluateSurchargeRule(rule, context) {
    return {
        rule,
        source: 'surcharge',
        dedupeKey: createPromotionDedupeKey(rule, 'surcharge'),
        reasons: getRuleIneligibilityReasons(rule, context),
    };
}
function getRuleIneligibilityReasons(rule, context) {
    const reasons = [];
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
function getClassIneligibilityReasons(rule, context) {
    const reasons = [];
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
    if (usesSelectedUnit &&
        (!isNullableTextMatch(rule.unitOptionId, context.unitOption.id) ||
            !isNullableTextMatch(rule.orderUnitCode, context.unitOption.unitCode))) {
        reasons.push('wrong_unit');
    }
    addQuantityReasons(reasons, quantityForRule, rule.minOrderQuantity, rule.maxOrderQuantity);
    addQuantityReasons(reasons, context.baseQuantity, rule.minBaseQuantity, rule.maxBaseQuantity);
    return Array.from(new Set(reasons));
}
function addQuantityReasons(reasons, quantity, minQuantity, maxQuantity) {
    if (quantity < Math.max(0, minQuantity ?? 0)) {
        reasons.push('below_minimum_quantity');
    }
    if (maxQuantity !== null && maxQuantity > 0 && quantity > maxQuantity) {
        reasons.push('above_maximum_quantity');
    }
}
function isActive(status) {
    return String(status ?? '').trim().toLowerCase() === 'active';
}
function isInDateRange(startsAt, endsAt, orderDate) {
    const time = orderDate.getTime();
    const start = startsAt ? Date.parse(startsAt) : Number.NaN;
    const end = endsAt ? Date.parse(endsAt) : Number.NaN;
    return ((Number.isNaN(start) || time >= start) &&
        (Number.isNaN(end) || time <= end));
}
function isNullableTextMatch(ruleValue, actualValue) {
    if (!ruleValue) {
        return true;
    }
    const normalizedRule = ruleValue.trim().toLowerCase();
    if (!normalizedRule || normalizedRule === 'both') {
        return true;
    }
    return normalizedRule === String(actualValue ?? '').trim().toLowerCase();
}
function getRewardQuantity(rule, quantity) {
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
function dedupeRules(rules, source) {
    const seen = new Set();
    return rules.filter((rule) => {
        const key = createPromotionDedupeKey(rule, source);
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
function createPromotionDedupeKey(rule, source) {
    const classes = rule.classes
        .map((item) => [
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
    ].join('|'))
        .sort()
        .join('::');
    return [
        source,
        'discountKind' in rule ? normalizeText(rule.discountKind) : '',
        normalizeText(rule.priceCode),
        normalizeText(rule.priceType),
        normalizeText(rule.branchName),
        normalizeText(rule.type),
        'calculationMethod' in rule ? normalizeText(rule.calculationMethod) : '',
        'discountGroup' in rule ? normalizeText(rule.discountGroup) : '',
        'applySequence' in rule ? rule.applySequence ?? '' : '',
        rule.minQuantity,
        rule.maxQuantity ?? '',
        rule.percent ?? '',
        rule.amount ?? '',
        'freeQuantity' in rule ? rule.freeQuantity ?? '' : '',
        classes,
    ].join('::');
}
function toPromotionEligibility(evaluation) {
    return {
        id: evaluation.rule.id,
        source: evaluation.source,
        dedupeKey: evaluation.dedupeKey,
        name: evaluation.rule.name,
        type: evaluation.rule.type,
        priority: evaluation.rule.priority,
        stackable: 'stackable' in evaluation.rule ? evaluation.rule.stackable : true,
        description: evaluation.source === 'discount'
            ? describeDiscountRule(evaluation.rule, 0)
            : describeSurchargeRule(evaluation.rule, 0, getRewardQuantity(evaluation.rule, 1)),
        reasons: evaluation.reasons,
    };
}
function describeDiscountRule(rule, discountAmount) {
    if (rule.type === 'Percent' && rule.percent) {
        return `${rule.percent}% discount${discountAmount > 0 ? ` (${formatAmount(discountAmount)})` : ''}`;
    }
    if (rule.type === 'Amount' && rule.amount) {
        return `${formatAmount(rule.amount)} discount`;
    }
    return rule.type || 'Discount';
}
function describeSurchargeRule(rule, surchargeAmount, freeQuantity) {
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
function formatAmount(value) {
    return `PHP ${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function normalizeText(value) {
    return String(value ?? '').trim().toLowerCase();
}
