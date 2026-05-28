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

export type DiscountItem = {
  id: string;
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
};

export type SurchargeItem = {
  id: string;
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
};
