import type {
  OrderCatalogPrice,
  OrderCatalogUnitOption,
  OrderLineCalculation,
  OrderPriceCode,
  SurchargeRule,
} from '../../services/orderPricing';
import type { OrderCatalogPriceClass } from '../../services/orderCatalog';

export type CreateOrderCustomerType = 'existing' | 'guest';

export type CreateOrderAgent = {
  id: string;
  fullName: string;
  agentCode: string;
  companyName: string;
  email: string;
  status: string;
};

export type CreateOrderBranch = {
  id: string;
  branchName: string;
  branchCode: string;
};

export type CreateOrderTerm = {
  id: string;
  termName: string;
  termCode: string;
  isDefault: boolean;
};

export type CreateOrderClient = {
  id: string;
  clientCode: string;
  clientName: string;
  companyName: string;
  contactPerson: string;
  contactNumber: string;
  email: string;
  address: string;
  tin: string;
  status: string;
  customClientCode: string;
  defaultPriceCode: string;
  defaultDeliveryTermId: string;
};

export type CreateOrderPricePreference = {
  id: string;
  priceCode: OrderPriceCode;
  priceType: string;
  branchApplicability: string;
  displayLabel: string;
};

export type CreateOrderCartItem = {
  id: string;
  productId: string;
  productName: string;
  productCode: string;
  variationId: string;
  variationName: string;
  variationSku: string;
  unitOption: OrderCatalogUnitOption;
  price: OrderCatalogPrice;
  surcharges: SurchargeRule[];
  priceCode: OrderPriceCode;
  pricePreference: CreateOrderPricePreference;
  quantity: number;
  calculation: OrderLineCalculation;
};

export type CreateOrderTotals = {
  lineItems: number;
  paidQuantity: number;
  freeQuantity: number;
  subtotal: number;
  discountTotal: number;
  surchargeTotal: number;
  grandTotal: number;
};

export type CreateOrderDraft = {
  agentId: string;
  pricePreferenceId: string;
  pricePreference: CreateOrderPricePreference | null;
  customerType: CreateOrderCustomerType;
  agentClientId: string;
  clientName: string;
  guestFullName: string;
  guestCompany: string;
  guestAddress: string;
  guestTin: string;
  guestMobileNumber: string;
  guestEmail: string;
  guestNotes: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  termId: string;
  notes: string;
  items: CreateOrderCartItem[];
  totals: CreateOrderTotals;
};

export function mapPriceClassToPreference(priceClass: OrderCatalogPriceClass): CreateOrderPricePreference | null {
  const priceCode = priceClass.priceCode as OrderPriceCode;
  if (!['R1', 'R2', 'W1', 'W2', 'SP', 'CP'].includes(priceCode)) {
    return null;
  }

  return {
    id: priceClass.id,
    priceCode,
    priceType: priceClass.preferenceCode || priceClass.priceLabel,
    branchApplicability: priceClass.priceLabel,
    displayLabel: `${priceClass.priceCode} - ${priceClass.priceLabel || priceClass.preferenceCode || priceClass.priceCode}`,
  };
}
