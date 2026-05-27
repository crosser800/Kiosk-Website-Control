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
  isExisting?: boolean;
  mediaPath?: string | null;
};

export type VariationItem = {
  id: string;
  priceType: 'Retail' | 'Wholesale' | '';
  variationName: string;
  className: string;
  priceCode: 'R1' | 'R2' | 'W1' | 'W2' | '';
  branchName: 'Manila' | 'Cebu' | '';
  price: string;
  skuCode: string;
  availability: 'Available' | 'Unavailable' | '';
};

export type DiscountItem = {
  id: string;
  discountName: string;
  discountType: 'Percent' | 'Amount';
  amount: string;
  minQuantity: string;
  maxQuantity: string;
  branchName: 'Manila' | 'Cebu' | '';
  priceType: 'Retail' | 'Wholesale' | '';
  priceCode: 'R1' | 'R2' | 'W1' | 'W2' | '';
};

export type SurchargeItem = {
  id: string;
  surchargeName: string;
  surchargeType: 'Amount' | 'Percent' | 'Freebie' | 'BonusQty';
  amount: string;
  freeQuantity: string;
  minQuantity: string;
  maxQuantity: string;
  branchName: 'Manila' | 'Cebu' | '';
  priceType: 'Retail' | 'Wholesale' | '';
  priceCode: 'R1' | 'R2' | 'W1' | 'W2' | '';
};
