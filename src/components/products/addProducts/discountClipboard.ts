// Pure helpers for copying a "Manage Adjustments" setup from one
// (variation, price code) context to another inside the SAME product editor.
//
// Nothing here touches React, Supabase or the database. A paste only ever
// produces new draft rows; persistence still goes through the existing
// saveDiscountModal -> handleRegister flow.
//
// Identity rules (see handleRegister in AddProduct.tsx):
//   - DiscountDraftRow.id becomes the product_discounts.id (or the
//     product_surcharges.id for surcharge rows) on save, so every pasted row
//     gets a brand-new id. Reusing a source id would make the target class
//     attach to the SOURCE header, so editing one would silently edit both.
//   - discountGroup drives stacking (cascading), history matching and the
//     pricing engine's group selection, so each source group is mapped to
//     exactly one new target group.
//   - promoSourceSurchargeId is cleared; the derived promo surcharge is rebuilt
//     from the new discount id by the existing save path.
//   - discountRecordId / discountClassId / linkedDiscount* live on
//     DiscountItem / SurchargeItem, not on draft rows; saveDiscountModal
//     already writes them as ''.
//
// Only type imports here, so the module also runs under `node --test`.

import type {
  DiscountItem,
  DiscountKind,
  QualificationScope,
  RewardRepeatMode,
  RewardTargetType,
  UnitCondition,
} from '../../../services/types';
import type { PromoDurationPreset, PromoValidityMode } from './discountLifecycle';

export type PriceCode = 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP';

export type DiscountDraftRow = {
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
  promoGiftCheckEnabled: boolean;
  promoGiftCheckId: string;
  promoGiftCheckCode: string;
  promoGiftCheckName: string;
  promoGiftCheckQuantity: string;
};

export type AdjustmentClipboard = {
  // Product the setup was copied from. A paste into any other product scope is
  // refused, so data can never leak from Product A into Product B.
  sourceProductScope: string;
  sourceVariationId: string;
  sourceVariationLabel: string;
  sourcePriceCode: PriceCode;
  copiedAt: number;
  rows: ReadonlyArray<Readonly<DiscountDraftRow>>;
  // Source unit-option id -> unit code, captured at copy time so a paste into
  // a different variation can match units by code instead of by source id.
  unitCodeById: Readonly<Record<string, string>>;
};

export type ClipboardUnitOption = { id: string; unitCode: string };

export type PasteTarget = {
  productScope: string;
  variationId: string;
  priceCode: PriceCode;
  // False when the target variation has no row for this price code.
  hasPriceRow: boolean;
  // Orderable unit options of the target variation.
  unitOptions: ClipboardUnitOption[];
  // Valid same-product reward variations for the target context (already
  // excludes the target variation itself and variations without this code).
  sameProductRewardVariationIds: string[];
  getRewardVariationUnitOptions: (variationId: string) => ClipboardUnitOption[];
  // Price of one order unit for the target price code; null when it cannot be
  // determined (e.g. blank price). unitOptionId '' means the base unit.
  getUnitPrice: (unitOptionId: string) => number | null;
};

// Result of re-matching a different-product reward variation (a
// price-code-specific product_variations row) to the target price code.
export type DifferentItemRewardResolution =
  | { status: 'remap'; variationId: string; unitOptionId: string }
  | { status: 'clear'; reason: string };

export type PasteIssue = {
  level: 'warning' | 'blocking';
  groupKey: string;
  message: string;
};

export type PreparedPaste = {
  rows: DiscountDraftRow[];
  issues: PasteIssue[];
  // New group keys in the order they were pasted.
  groupKeys: string[];
};

export type PasteMode = 'replace' | 'append';

export function getDraftGroupKey(row: Pick<DiscountDraftRow, 'discountGroup' | 'id'>) {
  return row.discountGroup.trim() || `legacy-${row.id}`;
}

function normalizeUnitCode(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function parseAmount(value: string) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseTime(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function formatMoney(value: number) {
  return `PHP ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function buildAdjustmentClipboard(input: {
  productScope: string;
  variationId: string;
  variationLabel: string;
  priceCode: PriceCode;
  rows: DiscountDraftRow[];
  unitCodeById: Record<string, string>;
  copiedAt: number;
}): AdjustmentClipboard {
  // Rows only hold primitives, so a per-row spread fully detaches the
  // snapshot; freezing makes any later accidental mutation throw in strict mode.
  return Object.freeze({
    sourceProductScope: input.productScope,
    sourceVariationId: input.variationId,
    sourceVariationLabel: input.variationLabel,
    sourcePriceCode: input.priceCode,
    copiedAt: input.copiedAt,
    rows: Object.freeze(input.rows.map((row) => Object.freeze({ ...row }))),
    unitCodeById: Object.freeze({ ...input.unitCodeById }),
  });
}

// Returns why a paste is not allowed into this target, or '' when it is.
export function getPasteBlockReason(
  clipboard: AdjustmentClipboard | null,
  target: Pick<PasteTarget, 'productScope' | 'variationId' | 'priceCode' | 'hasPriceRow'>,
) {
  if (!clipboard) return 'Copy a setup first.';
  if (clipboard.sourceProductScope !== target.productScope) {
    return 'The copied setup belongs to a different product and cannot be pasted here.';
  }
  if (clipboard.rows.length === 0) return 'The copied setup has no adjustments.';
  if (!target.hasPriceRow) {
    return `This variation has no ${target.priceCode} price row, so there is nothing to attach the setup to.`;
  }
  if (
    clipboard.sourceVariationId === target.variationId &&
    clipboard.sourcePriceCode === target.priceCode
  ) {
    return 'This is the same variation and price code the setup was copied from.';
  }
  return '';
}

// Resolves a unit reference against the target's unit options: keep the id
// when it exists there, otherwise match by unit code, otherwise ''.
export function resolveUnitReference(
  unitOptionId: string,
  fallbackUnitCode: string,
  options: ClipboardUnitOption[],
): ClipboardUnitOption | null {
  if (unitOptionId) {
    const byId = options.find((option) => option.id === unitOptionId);
    if (byId) return byId;
  }
  const code = normalizeUnitCode(fallbackUnitCode);
  if (!code) return null;
  const byCode = options.filter((option) => normalizeUnitCode(option.unitCode) === code);
  // Ambiguous codes are never guessed.
  return byCode.length === 1 ? byCode[0] : null;
}

export function preparePastedRows(
  clipboard: AdjustmentClipboard,
  target: PasteTarget,
  options: {
    createId: () => string;
    createGroupId: () => string;
    // Keyed by the SOURCE different-item reward variation id. Missing entries
    // mean "keep as-is", which is only correct when the price code is unchanged.
    differentItemResolutions: Record<string, DifferentItemRewardResolution>;
    now: Date;
  },
): { ok: true; value: PreparedPaste } | { ok: false; error: string } {
  const blockReason = getPasteBlockReason(clipboard, target);
  if (blockReason) return { ok: false, error: blockReason };

  const groupIdBySource = new Map<string, string>();
  const groupKeys: string[] = [];
  const issues: PasteIssue[] = [];
  const issueKeys = new Set<string>();
  const addIssue = (issue: PasteIssue) => {
    const key = `${issue.level}|${issue.groupKey}|${issue.message}`;
    if (issueKeys.has(key)) return;
    issueKeys.add(key);
    issues.push(issue);
  };
  const priceCodeChanged = clipboard.sourcePriceCode !== target.priceCode;

  const rows = clipboard.rows.map((source) => {
    const sourceGroupKey = getDraftGroupKey(source);
    let groupKey = groupIdBySource.get(sourceGroupKey);
    if (!groupKey) {
      groupKey = options.createGroupId();
      groupIdBySource.set(sourceGroupKey, groupKey);
      groupKeys.push(groupKey);
    }

    const row: DiscountDraftRow = {
      ...source,
      id: options.createId(),
      discountGroup: groupKey,
      promoSourceSurchargeId: '',
      promoRewardSearchQuery: '',
    };

    if (row.unitCondition === 'selected_unit' && source.unitOptionId) {
      const match = resolveUnitReference(
        source.unitOptionId,
        clipboard.unitCodeById[source.unitOptionId] ?? '',
        target.unitOptions,
      );
      row.unitOptionId = match?.id ?? '';
      if (!match) {
        addIssue({
          level: 'blocking',
          groupKey,
          message: 'The order unit does not exist on this variation. Select an order unit.',
        });
      }
    }

    if (row.adjustmentKind === 'Discount' && row.hasPromo) {
      applyRewardCompatibility(row, source, clipboard, target, {
        priceCodeChanged,
        resolutions: options.differentItemResolutions,
        addIssue: (level, message) => addIssue({ level, groupKey: groupKey as string, message }),
      });
    }

    return row;
  });

  getPastedRowIssues(rows, target, options.now).forEach(addIssue);

  return { ok: true, value: { rows, issues, groupKeys } };
}

function applyRewardCompatibility(
  row: DiscountDraftRow,
  source: Readonly<DiscountDraftRow>,
  clipboard: AdjustmentClipboard,
  target: PasteTarget,
  context: {
    priceCodeChanged: boolean;
    resolutions: Record<string, DifferentItemRewardResolution>;
    addIssue: (level: PasteIssue['level'], message: string) => void;
  },
) {
  const clearRewardUnit = () => {
    row.promoRewardUnitOptionId = '';
    row.promoRewardUnitCode = '';
  };
  const sourceRewardCode =
    source.promoRewardUnitCode || clipboard.unitCodeById[source.promoRewardUnitOptionId] || '';

  if (row.promoRewardTargetType === 'same_item') {
    if (!source.promoRewardUnitOptionId && !sourceRewardCode) return;
    const match = resolveUnitReference(source.promoRewardUnitOptionId, sourceRewardCode, target.unitOptions);
    if (match) {
      row.promoRewardUnitOptionId = match.id;
      row.promoRewardUnitCode = match.unitCode;
    } else {
      clearRewardUnit();
      context.addIssue('blocking', 'The reward unit does not exist on this variation. Select a reward unit.');
    }
    return;
  }

  if (row.promoRewardTargetType === 'same_product_different_variant') {
    if (!target.sameProductRewardVariationIds.includes(source.promoRewardVariationId)) {
      row.promoRewardVariationId = '';
      row.promoRewardVariationLabel = '';
      clearRewardUnit();
      context.addIssue(
        'blocking',
        `The reward variation is not available for ${target.priceCode} on this variation. Select a reward variation.`,
      );
      return;
    }
    const match = resolveUnitReference(
      source.promoRewardUnitOptionId,
      sourceRewardCode,
      target.getRewardVariationUnitOptions(source.promoRewardVariationId),
    );
    if (match) {
      row.promoRewardUnitOptionId = match.id;
      row.promoRewardUnitCode = match.unitCode;
    } else {
      clearRewardUnit();
      context.addIssue('blocking', 'The reward unit is no longer available on the reward variation. Select a reward unit.');
    }
    return;
  }

  // different_item: the product id is global and kept. The variation id is a
  // price-code-specific row of the other product.
  if (!source.promoRewardVariationId) return;
  const resolution = context.resolutions[source.promoRewardVariationId];
  if (!resolution) {
    if (context.priceCodeChanged) {
      // Never keep a row that belongs to another price code.
      row.promoRewardVariationId = '';
      row.promoRewardVariationLabel = '';
      clearRewardUnit();
      context.addIssue('blocking', 'The reward variation could not be verified. Reselect the reward product.');
    }
    return;
  }
  if (resolution.status === 'clear') {
    row.promoRewardVariationId = '';
    row.promoRewardVariationLabel = '';
    clearRewardUnit();
    context.addIssue('blocking', resolution.reason);
    return;
  }
  row.promoRewardVariationId = resolution.variationId;
  // Cleared so the editor reloads the label of the re-matched row (the stored
  // label includes the source price code).
  row.promoRewardVariationLabel = '';
  if (!resolution.unitOptionId) {
    clearRewardUnit();
    context.addIssue('blocking', 'The reward unit could not be matched. Reselect the reward product.');
  } else {
    row.promoRewardUnitOptionId = resolution.unitOptionId;
  }
  if (context.priceCodeChanged) {
    context.addIssue('warning', `The reward variation was re-matched to its ${target.priceCode} price row.`);
  }
}

// Checks that only apply to pasted rows (the existing save validation already
// covers missing units, rewards and promo timing). Re-run at save time so a
// row the admin has since corrected is no longer blocked.
export function getPastedRowIssues(rows: DiscountDraftRow[], target: PasteTarget, now: Date): PasteIssue[] {
  const issues: PasteIssue[] = [];
  const nowTime = now.getTime();
  const groups = new Map<string, DiscountDraftRow[]>();
  rows.forEach((row) => {
    const key = getDraftGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });

  groups.forEach((groupRows, groupKey) => {
    const ordered = groupRows
      .slice()
      .sort((left, right) => Number(left.applySequence || '1') - Number(right.applySequence || '1'));
    const rule = ordered[0];
    if (!rule) return;

    const startTime = parseTime(rule.startsAt);
    const endTime = parseTime(rule.endsAt);
    const isBase = rule.adjustmentKind === 'Discount' && rule.discountKind === 'Base';
    // Base discounts never keep an end date (saveDiscountModal clears it).
    if (!isBase && endTime !== null && endTime < nowTime) {
      issues.push({
        level: 'blocking',
        groupKey,
        message: 'The end date/time is already in the past. Update the schedule before saving.',
      });
    } else if (rule.status === 'Active') {
      issues.push({
        level: 'warning',
        groupKey,
        message:
          startTime !== null && startTime > nowTime
            ? 'This rule is scheduled and will start automatically once the product is saved.'
            : 'This rule is Active and will apply immediately once the product is saved.',
      });
    }

    // Mirrors the editor's stacking preview: fixed amounts apply to the price
    // of one order unit (appliesTo = UnitPrice), cascading within the group.
    const hasFixedDiscount = ordered.some(
      (row) => row.adjustmentKind === 'Discount' && row.discountType === 'Amount' && row.amount.trim(),
    );
    if (!hasFixedDiscount) return;
    const unitPrice = target.getUnitPrice(rule.unitCondition === 'selected_unit' ? rule.unitOptionId : '');
    if (unitPrice === null || unitPrice <= 0) {
      issues.push({
        level: 'warning',
        groupKey,
        message: `The ${target.priceCode} price is blank, so the fixed discount amount could not be checked.`,
      });
      return;
    }
    let remaining = unitPrice;
    for (const row of ordered) {
      const amount = parseAmount(row.amount);
      if (row.adjustmentKind === 'Surcharge') {
        remaining += row.discountType === 'Percent' ? unitPrice * (amount / 100) : amount;
        continue;
      }
      if (row.discountType === 'Percent') {
        remaining -= remaining * (amount / 100);
        continue;
      }
      if (amount > remaining + 0.005) {
        issues.push({
          level: 'blocking',
          groupKey,
          message: `The fixed discount of ${formatMoney(amount)} is more than the ${target.priceCode} price it applies to (${formatMoney(remaining)}). Lower the amount before saving.`,
        });
        return;
      }
      remaining -= amount;
    }
  });

  return issues;
}

function getGroupFingerprint(rows: DiscountDraftRow[]) {
  return rows
    .slice()
    .sort((left, right) => Number(left.applySequence || '1') - Number(right.applySequence || '1'))
    .map((row) =>
      [
        row.adjustmentKind,
        row.discountKind,
        row.discountType,
        parseAmount(row.amount),
        row.unitCondition,
        row.unitCondition === 'selected_unit' ? row.unitOptionId : '',
        row.minOrderQuantity || '1',
        row.maxOrderQuantity,
        row.status,
        row.startsAt,
        row.endsAt,
        row.hasPromo,
        row.hasPromo ? row.promoType : '',
        row.hasPromo ? row.promoRewardTargetType : '',
        row.hasPromo ? row.promoRewardProductId : '',
        row.hasPromo ? row.promoRewardVariationId : '',
        row.hasPromo ? row.promoRewardUnitOptionId || row.promoRewardUnitCode : '',
        row.hasPromo ? row.promoRewardQuantity : '',
        row.hasPromo ? row.promoRewardRepeatMode : '',
        row.hasPromo ? row.promoRewardEveryQuantity : '',
        row.promoQualificationScope,
        row.promoGiftCheckEnabled ? row.promoGiftCheckId : '',
        row.promoGiftCheckEnabled ? row.promoGiftCheckQuantity : '',
      ]
        .map((value) => String(value ?? '').trim().toLowerCase())
        .join('|'),
    )
    .join('||');
}

function groupRows(rows: DiscountDraftRow[]) {
  const groups = new Map<string, DiscountDraftRow[]>();
  rows.forEach((row) => {
    const key = getDraftGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  });
  return groups;
}

// Replace: the pasted rows become the whole draft (existing target rows are
// removed from the DRAFT only; the existing managed-id bookkeeping deletes or
// retires them when the modal and product are saved).
// Append: existing rows keep their ids and groups; pasted groups are added as
// independent groups. An exact duplicate of an existing group is refused.
export function mergePastedRows(
  existing: DiscountDraftRow[],
  pasted: DiscountDraftRow[],
  mode: PasteMode,
): { ok: true; rows: DiscountDraftRow[] } | { ok: false; error: string } {
  if (mode === 'replace') return { ok: true, rows: pasted.map((row) => ({ ...row })) };

  const existingIds = new Set(existing.map((row) => row.id));
  const existingGroups = groupRows(existing);
  if (pasted.some((row) => existingIds.has(row.id) || existingGroups.has(getDraftGroupKey(row)))) {
    return { ok: false, error: 'Pasted rows must have new identities. Copy the setup again and retry.' };
  }
  const existingFingerprints = new Set(
    Array.from(existingGroups.values()).map((rows) => getGroupFingerprint(rows)),
  );
  const duplicate = Array.from(groupRows(pasted).values()).find((rows) =>
    existingFingerprints.has(getGroupFingerprint(rows)),
  );
  if (duplicate) {
    const name = duplicate[0]?.discountName.trim() || 'An adjustment';
    return {
      ok: false,
      error: `${name} already exists here with the same settings. Use Replace instead, or remove the duplicate first.`,
    };
  }
  return { ok: true, rows: [...existing.map((row) => ({ ...row })), ...pasted.map((row) => ({ ...row }))] };
}

export type RewardVariationRow = {
  id: string;
  productId: string;
  variationName: string;
  className: string;
  skuCode: string;
  priceCode: string;
  variationGroupId: string | null;
};

function isSameLogicalVariation(left: RewardVariationRow, right: RewardVariationRow) {
  if (left.productId !== right.productId) return false;
  if (left.variationGroupId && right.variationGroupId) {
    return left.variationGroupId === right.variationGroupId;
  }
  // Same text fallback as getLogicalVariationKey / RewardProductSelector.
  const textKey = (row: RewardVariationRow) =>
    `${String(row.variationName || row.className || '').trim().toLowerCase()}::${String(row.skuCode || '').trim().toLowerCase()}`;
  return textKey(left) === textKey(right);
}

// Re-matches a different-product reward row to the same logical variation's
// row for the target price code. Unit options belong to the logical variation
// (stored on one representative row; see orderCatalog buildCatalogVariation),
// so the reward unit is kept when it is owned by any row of that variation.
export function resolveDifferentItemReward(input: {
  sourceVariationId: string;
  sourceUnitOptionId: string;
  // variation_id the reward unit option row belongs to; '' when unknown.
  unitOptionVariationId: string;
  productRows: RewardVariationRow[];
  targetPriceCode: PriceCode;
}): DifferentItemRewardResolution {
  const source = input.productRows.find((row) => row.id === input.sourceVariationId);
  if (!source) {
    return { status: 'clear', reason: 'The reward variation no longer exists. Reselect the reward product.' };
  }
  const logicalRows = input.productRows.filter((row) => isSameLogicalVariation(row, source));
  const candidates = logicalRows.filter(
    (row) => row.priceCode.trim().toUpperCase() === input.targetPriceCode,
  );
  if (candidates.length !== 1) {
    return {
      status: 'clear',
      reason:
        candidates.length === 0
          ? `The reward variation has no ${input.targetPriceCode} price row. Reselect the reward product.`
          : `The reward variation has more than one ${input.targetPriceCode} price row. Reselect the reward product.`,
    };
  }
  const unitOwned =
    Boolean(input.sourceUnitOptionId) &&
    logicalRows.some((row) => row.id === input.unitOptionVariationId);
  return {
    status: 'remap',
    variationId: candidates[0].id,
    unitOptionId: unitOwned ? input.sourceUnitOptionId : '',
  };
}
