export type ProductFormState = {
  productName: string;
  skuCode: string;
  categoryId: string;
  brandId: string;
  description: string;
  status: 'Active' | 'Inactive';
};

export type MediaItem = {
  id: string;
  file?: File;
  fileName: string;
  previewUrl: string;
  type: 'image' | 'video';
  title?: string;
  altText?: string;
  isExisting?: boolean;
  mediaPath?: string | null;
};

export type VariationItem = {
  id: string;
  priceType: 'Retail' | 'Wholesale' | 'Special' | 'Concept Store' | '';
  variationName: string;
  className: string;
  priceCode: 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP' | '';
  branchName: 'Manila' | 'Cebu' | 'Both' | '';
  price: string;
  skuCode: string;
  stockQuantity: string;
  availability: 'Available' | 'Unavailable' | '';
};

export type ProductUnitDefinition = {
  code: string;
  label: string;
  status: string;
};

export type ProductUnitAliasDefinition = {
  alias: string;
  unitCode: string;
};

export type VariationUnitOptionItem = {
  id: string;
  variationId: string;
  unitCode: string;
  unitLabel: string;
  baseUnitCode: string;
  quantityInBaseUnit: string;
  priceOverride: string;
  packagingText: string;
  minOrderQuantity: string;
  orderIncrement: string;
  isDefault: boolean;
  isOrderable: boolean;
  status: 'Active' | 'Inactive';
  sortOrder: string;
  notes: string;
};

export type UnitCondition = 'any_unit' | 'selected_unit';
export type ItemStatus = 'Active' | 'Inactive';
export type RewardTargetType = 'same_item' | 'different_item';
export type RewardRepeatMode = 'one_time' | 'every';

export type DiscountItem = {
  id: string;
  discountRecordId: string;
  discountClassId: string;
  variationId: string;
  discountName: string;
  discountType: 'Percent' | 'Amount';
  amount: string;
  minQuantity: string;
  maxQuantity: string;
  branchName: 'Manila' | 'Cebu' | 'Both' | '';
  priceType: 'Retail' | 'Wholesale' | 'Special' | 'Concept Store' | '';
  priceCode: 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP' | '';
  calculationMethod: 'Single' | 'Cascading';
  applySequence: string;
  discountGroup: string;
  appliesTo: 'UnitPrice' | 'LineTotal' | '';
  stackable: boolean;
  description: string;
  status: ItemStatus;
  priority: string;
  startsAt: string;
  endsAt: string;
  unitOptionId: string;
  orderUnitCode: string;
  unitCondition: UnitCondition;
  minOrderQuantity: string;
  maxOrderQuantity: string;
  minBaseQuantity: string;
  maxBaseQuantity: string;
  unitRuleLabel: string;
  unitRuleNotes: string;
  hasPromo: boolean;
  promoType: 'Freebie' | 'BonusQty';
  promoRewardUnitCode: string;
  promoRewardQuantity: string;
  promoRewardLabel: string;
  promoSourceSurchargeId: string;
  promoRewardTargetType: RewardTargetType;
  promoRewardProductId: string;
  promoRewardProductLabel: string;
  promoRewardVariationId: string;
  promoRewardVariationLabel: string;
  promoRewardUnitOptionId: string;
  promoRewardRepeatMode: RewardRepeatMode;
  promoRewardEveryQuantity: string;
};

export type SurchargeItem = {
  id: string;
  linkedDiscountId: string;
  linkedDiscountClassId: string;
  variationId: string;
  surchargeName: string;
  surchargeType: 'Amount' | 'Percent' | 'Freebie' | 'BonusQty';
  amount: string;
  freeQuantity: string;
  minQuantity: string;
  maxQuantity: string;
  branchName: 'Manila' | 'Cebu' | 'Both' | '';
  priceType: 'Retail' | 'Wholesale' | 'Special' | 'Concept Store' | '';
  priceCode: 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP' | '';
  description: string;
  status: ItemStatus;
  priority: string;
  startsAt: string;
  endsAt: string;
  unitOptionId: string;
  orderUnitCode: string;
  unitCondition: UnitCondition;
  minOrderQuantity: string;
  maxOrderQuantity: string;
  minBaseQuantity: string;
  maxBaseQuantity: string;
  rewardUnitCode: string;
  rewardQuantity: string;
  rewardLabel: string;
  unitRuleLabel: string;
  unitRuleNotes: string;
  rewardTargetType: RewardTargetType;
  rewardProductId: string;
  rewardVariationId: string;
  rewardUnitOptionId: string;
  rewardRepeatMode: RewardRepeatMode;
  rewardEveryQuantity: string;
};
