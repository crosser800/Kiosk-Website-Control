import { useEffect, useMemo, useState } from 'react';
import type { OrderCatalogProduct, OrderCatalogVariation } from '../../services/orderCatalog';
import { calculateOrderLine } from '../../services/orderPricing';
import type { CreateOrderCartItem, CreateOrderPricePreference, CreateOrderTotals } from './createOrderTypes';
import styles from './OrderItemConfigurator.module.css';

type Props = {
  products: OrderCatalogProduct[];
  branchName: string;
  pricePreference: CreateOrderPricePreference | null;
  cartItems: CreateOrderCartItem[];
  cartTotals: CreateOrderTotals;
  initialItem?: CreateOrderCartItem | null;
  onClose: () => void;
  onSave: (item: CreateOrderCartItem) => void;
};

function createLineId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `order-line-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatCurrency(value: number) {
  return value.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OrderItemConfigurator({
  products,
  branchName,
  pricePreference,
  cartItems,
  cartTotals,
  initialItem = null,
  onClose,
  onSave,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [productId, setProductId] = useState(initialItem?.productId ?? '');
  const [variationId, setVariationId] = useState(initialItem?.variationId ?? '');
  const [unitOptionId, setUnitOptionId] = useState(initialItem?.unitOption.id ?? '');
  const [quantity, setQuantity] = useState(initialItem ? String(initialItem.quantity) : '1');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [flyItemLabel, setFlyItemLabel] = useState('');
  const [isCartPulseActive, setIsCartPulseActive] = useState(false);
  const [isCartPreviewOpen, setIsCartPreviewOpen] = useState(false);

  const categoryOptions = useMemo(
    () =>
      Array.from(
        new Map(
          products
            .filter((product) => product.categoryId && product.categoryName)
            .map((product) => [product.categoryId, product.categoryName] as const),
        ).entries(),
      ).sort((left, right) => left[1].localeCompare(right[1])),
    [products],
  );

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((product) => {
      if (categoryId !== 'all' && product.categoryId !== categoryId) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [product.productName, product.skuCode, product.categoryName].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [categoryId, products, searchQuery]);

  const selectedProduct = useMemo(
    () => products.find((product) => product.id === productId) ?? null,
    [productId, products],
  );
  const selectedVariation = useMemo(
    () => selectedProduct?.variations.find((variation) => variation.id === variationId) ?? null,
    [selectedProduct, variationId],
  );
  const activeUnitOptions = useMemo(
    () =>
      (selectedVariation?.unitOptions ?? [])
        .filter((option) => option.isOrderable && option.status.toLowerCase() === 'active')
        .sort((left, right) => left.sortOrder - right.sortOrder),
    [selectedVariation],
  );
  const selectedUnitOption = useMemo(
    () => activeUnitOptions.find((option) => option.id === unitOptionId) ?? null,
    [activeUnitOptions, unitOptionId],
  );
  const selectedPrice = useMemo(() => {
    if (!selectedVariation || !pricePreference) {
      return null;
    }
    return selectedVariation.prices[pricePreference.priceCode] ?? null;
  }, [pricePreference, selectedVariation]);
  const minQuantity = selectedUnitOption?.minOrderQuantity ?? 1;
  const orderIncrement =
    selectedUnitOption?.orderIncrement && selectedUnitOption.orderIncrement > 0
      ? selectedUnitOption.orderIncrement
      : 1;
  const parsedQuantity = Number.parseInt(quantity || '', 10);
  const numericQuantity = Number.isFinite(parsedQuantity) ? parsedQuantity : minQuantity;
  const quantityValidation = getQuantityValidation(numericQuantity, minQuantity, orderIncrement);
  const calculation = useMemo(() => {
    if (!selectedPrice || !selectedUnitOption || !selectedVariation) {
      return null;
    }
    return calculateOrderLine({
      price: selectedPrice,
      unitOption: selectedUnitOption,
      quantity: Math.max(minQuantity, numericQuantity),
      discounts: selectedVariation.discounts,
      surcharges: selectedVariation.surcharges,
      branchName,
      priceType: selectedPrice.priceType,
    });
  }, [branchName, minQuantity, numericQuantity, selectedPrice, selectedUnitOption, selectedVariation]);
  const canSave =
    Boolean(selectedProduct && selectedVariation && selectedUnitOption && selectedPrice && pricePreference && calculation) &&
    !quantityValidation &&
    (calculation?.computedUnitPrice ?? 0) > 0;

  useEffect(() => {
    if (!selectedProduct || selectedProduct.variations.some((variation) => variation.id === variationId)) {
      return;
    }
    setVariationId('');
    setUnitOptionId('');
  }, [selectedProduct, variationId]);

  useEffect(() => {
    if (!selectedVariation) {
      return;
    }
    if (!unitOptionId || !activeUnitOptions.some((option) => option.id === unitOptionId)) {
      setUnitOptionId(activeUnitOptions.find((option) => option.isDefault)?.id ?? activeUnitOptions[0]?.id ?? '');
    }
  }, [activeUnitOptions, selectedVariation, unitOptionId]);

  function selectProduct(nextProductId: string) {
    setProductId(nextProductId);
    setVariationId('');
    setUnitOptionId('');
  }

  function selectVariation(variation: OrderCatalogVariation) {
    setVariationId(variation.id);
    const units = variation.unitOptions.filter(
      (option) => option.isOrderable && option.status.toLowerCase() === 'active',
    );
    setUnitOptionId(units.find((option) => option.isDefault)?.id ?? units[0]?.id ?? '');
  }

  function changeQuantity(delta: number) {
    const current = Number.isFinite(parsedQuantity) ? parsedQuantity : minQuantity;
    setQuantity(String(Math.max(minQuantity, current + delta)));
  }

  function addQuickQuantity(amount: number) {
    const current = Number.isFinite(parsedQuantity) ? parsedQuantity : 0;
    setQuantity(String(Math.max(minQuantity, current + amount)));
  }

  function handleSave() {
    setError('');
    setSuccessMessage('');
    if (!pricePreference) {
      setError('Select an order price preference before adding products.');
      return;
    }
    if (!selectedProduct || !selectedVariation || !selectedUnitOption || !selectedPrice || !calculation) {
      setError('Select a product, visual variation, order unit, and valid order price.');
      return;
    }
    if (quantityValidation || calculation.computedUnitPrice <= 0) {
      setError(quantityValidation || 'Computed unit price must be greater than zero.');
      return;
    }

    const savedItem: CreateOrderCartItem = {
      id: initialItem?.id ?? createLineId(),
      productId: selectedProduct.id,
      productName: selectedProduct.productName,
      productCode: selectedProduct.skuCode,
      variationId: selectedVariation.id,
      variationName: selectedVariation.variationName,
      variationSku: selectedVariation.skuCode,
      unitOption: selectedUnitOption,
      price: selectedPrice,
      priceCode: selectedPrice.priceCode,
      pricePreference,
      quantity: numericQuantity,
      calculation,
    };

    onSave(savedItem);
    setSuccessMessage(initialItem ? 'Cart item updated.' : 'Added to cart.');
    setFlyItemLabel(`${selectedProduct.productName} - ${selectedVariation.variationName}`);
    setIsCartPulseActive(true);
    window.setTimeout(() => {
      setFlyItemLabel('');
      setIsCartPulseActive(false);
    }, 700);
    window.setTimeout(() => setSuccessMessage(''), 1800);

    if (!initialItem) {
      setVariationId('');
      setUnitOptionId('');
      setQuantity(String(minQuantity));
    }
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Configure order item">
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{initialItem ? 'Edit Product' : 'Add Product'}</h3>
            <p className={styles.subtitle}>1 Product | 2 Variation | 3 Unit | 4 Price | 5 Quantity | 6 Promotion | 7 Add to Cart</p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={`${styles.cartIndicator} ${isCartPulseActive ? styles.cartPulse : ''}`}
              onClick={() => setIsCartPreviewOpen((current) => !current)}
              aria-label="View local cart preview"
            >
              <i className="fa-solid fa-cart-shopping" aria-hidden="true"></i>
              <span>Cart | {cartTotals.lineItems} items | {cartTotals.paidQuantity} qty | PHP {formatCurrency(cartTotals.grandTotal)}</span>
            </button>
            <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close product configurator">
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>
        </div>

        {isCartPreviewOpen ? (
          <div className={styles.cartPreview}>
            {cartItems.length === 0 ? (
              <p>No products added yet.</p>
            ) : (
              cartItems.slice(-5).map((item) => (
                <div key={item.id}>
                  <strong>{item.productName}</strong>
                  <span>{item.variationName} | {item.quantity} {item.unitOption.unitLabel} | PHP {formatCurrency(item.calculation.finalLineTotal)}</span>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className={styles.body}>
          <section className={styles.catalogPanel}>
            <div className={styles.stickyFilters}>
              <div className={styles.filterGrid}>
                <label className={styles.field}>
                  <span>Category</span>
                  <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                    <option value="all">All categories</option>
                    {categoryOptions.map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Search Product</span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Product name, product code, or SKU"
                  />
                </label>
              </div>
              <div className={styles.resultCount}>
                Showing {Math.min(filteredProducts.length, 32)} of {filteredProducts.length} products
              </div>
            </div>

            <div className={styles.productList}>
              {filteredProducts.length === 0 ? (
                <p className={styles.emptyText}>No active products matched the current search.</p>
              ) : (
                filteredProducts.slice(0, 32).map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    className={`${styles.productButton} ${productId === product.id ? styles.selectedButton : ''}`}
                    onClick={() => selectProduct(product.id)}
                  >
                    <strong>{product.productName}</strong>
                    <span>{product.skuCode || '-'} | {product.categoryName}</span>
                  </button>
                ))
              )}
            </div>
          </section>

          <section className={styles.configPanel}>
            <div className={styles.configScroll}>
              <div className={styles.stepBlock}>
                <h4 className={styles.stepTitle}>{selectedProduct ? 'Done' : '1.'} Product</h4>
                <p className={styles.stepSummary}>
                  {selectedProduct ? `${selectedProduct.productName} | ${selectedProduct.skuCode || '-'}` : 'Select from the product list.'}
                </p>
              </div>

              <div className={styles.stepBlock}>
                <h4 className={styles.stepTitle}>{selectedVariation ? 'Done' : '2.'} Variation</h4>
                <div className={styles.optionGrid}>
                  {selectedProduct ? (
                    selectedProduct.variations.map((variation) => (
                      <button
                        key={variation.id}
                        type="button"
                        className={`${styles.optionButton} ${variationId === variation.id ? styles.selectedButton : ''}`}
                        onClick={() => selectVariation(variation)}
                      >
                        <strong>{variation.variationName}</strong>
                        <span>{variation.skuCode || '-'}</span>
                        <small>{variation.availability || '-'}</small>
                      </button>
                    ))
                  ) : (
                    <p className={styles.emptyText}>Select a product first.</p>
                  )}
                </div>
              </div>

              <div className={styles.stepBlock}>
                <h4 className={styles.stepTitle}>{selectedUnitOption ? 'Done' : '3.'} Unit</h4>
                <div className={styles.optionGrid}>
                  {activeUnitOptions.length > 0 && selectedVariation ? (
                    activeUnitOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        className={`${styles.optionButton} ${unitOptionId === option.id ? styles.selectedButton : ''}`}
                        onClick={() => setUnitOptionId(option.id)}
                      >
                        <strong>{option.unitLabel}</strong>
                        <span>{formatUnitDescription(option)}</span>
                      </button>
                    ))
                  ) : (
                    <p className={styles.emptyText}>No active order units available.</p>
                  )}
                </div>
              </div>

              <div className={styles.stepBlock}>
                <h4 className={styles.stepTitle}>{selectedPrice ? 'Done' : '4.'} Price</h4>
                <div className={styles.priceSummary}>
                  <strong>Price Preference</strong>
                  <span>{pricePreference?.displayLabel ?? 'No order price preference selected'}</span>
                  {selectedVariation && !selectedPrice && pricePreference ? (
                    <small>This variation has no available price for {pricePreference.priceCode}.</small>
                  ) : null}
                  {selectedPrice && selectedUnitOption ? (
                    <>
                      <small>Base price: PHP {formatCurrency(selectedPrice.basePrice)}</small>
                      <small>Selected unit price: PHP {formatCurrency(calculation?.computedUnitPrice ?? 0)}</small>
                    </>
                  ) : null}
                </div>
              </div>

              <div className={styles.stepBlock}>
                <h4 className={styles.stepTitle}>{!quantityValidation ? 'Done' : '5.'} Quantity</h4>
                <div className={styles.quantityControl}>
                  <button type="button" onClick={() => changeQuantity(-orderIncrement)} disabled={numericQuantity <= minQuantity}>
                    -
                  </button>
                  <input
                    aria-label="Quantity"
                    inputMode="numeric"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value.replace(/[^\d]/g, ''))}
                    onBlur={() => {
                      if (!quantity || quantityValidation) {
                        setQuantity(String(Math.max(minQuantity, numericQuantity || minQuantity)));
                      }
                    }}
                  />
                  <button type="button" onClick={() => changeQuantity(orderIncrement)}>+</button>
                  <span>{pluralizeUnit(selectedUnitOption?.unitLabel ?? 'unit', numericQuantity)}</span>
                </div>
                <div className={styles.quickQuantities}>
                  {[5, 10, 20].map((amount) => (
                    <button key={amount} type="button" onClick={() => addQuickQuantity(amount)}>
                      +{amount}
                    </button>
                  ))}
                </div>
                {quantityValidation ? <p className={styles.errorText}>{quantityValidation}</p> : null}
                {calculation && calculation.freeQuantity > 0 ? (
                  <div className={styles.freeBadge}>
                    Free: {calculation.freeQuantity} {pluralizeUnit(selectedUnitOption?.unitLabel ?? 'unit', calculation.freeQuantity)}
                  </div>
                ) : null}
              </div>

              <div className={styles.previewPanel}>
                <h4 className={styles.stepTitle}>{calculation ? 'Done' : '6.'} Promotion and Pricing</h4>
                {calculation ? (
                  <>
                    <div className={styles.selectedConfig}>
                      <span>{selectedProduct?.productName}</span>
                      <span>{selectedVariation?.variationName}</span>
                      <span>{selectedUnitOption?.unitLabel}</span>
                      <span>{pricePreference?.displayLabel}</span>
                    </div>
                    <div className={styles.breakdownGrid}>
                      <span>Base price</span><strong>{formatCurrency(calculation.basePrice)}</strong>
                      <span>Packaging multiplier</span><strong>{calculation.packagingMultiplier}</strong>
                      <span>Unit price</span><strong>{formatCurrency(calculation.computedUnitPrice)}</strong>
                      <span>Quantity</span><strong>{calculation.quantity}</strong>
                      <span>Gross subtotal</span><strong>{formatCurrency(calculation.grossSubtotal)}</strong>
                      <span>Discount</span><strong>{formatCurrency(calculation.discountAmount)}</strong>
                      <span>Surcharge</span><strong>{formatCurrency(calculation.surchargeAmount)}</strong>
                      {calculation.freeQuantity > 0 ? (
                        <>
                          <span>Free quantity</span><strong>{calculation.freeQuantity}</strong>
                        </>
                      ) : null}
                      <span>Final line total</span><strong>{formatCurrency(calculation.finalLineTotal)}</strong>
                    </div>
                    <div className={styles.promoList}>
                      {calculation.appliedPromotions.length === 0 ? (
                        <p>No active promotion applies to this configuration.</p>
                      ) : (
                        calculation.appliedPromotions.map((promo) => (
                          <span key={promo.dedupeKey}>
                            <strong>{promo.name}</strong>
                            {promo.description}
                          </span>
                        ))
                      )}
                    </div>
                    {calculation.ineligiblePromotions.length > 0 ? (
                      <details className={styles.availablePromos}>
                        <summary>View Available Promotions</summary>
                        {calculation.ineligiblePromotions.slice(0, 8).map((promo) => (
                          <span key={promo.dedupeKey}>
                            {promo.name} | {formatReasons(promo.reasons)}
                          </span>
                        ))}
                      </details>
                    ) : null}
                  </>
                ) : (
                  <p className={styles.emptyText}>Complete the item setup to preview pricing.</p>
                )}
              </div>
            </div>
          </section>
        </div>

        {error ? <p className={styles.errorText}>{error}</p> : null}
        {successMessage ? <p className={styles.successText}>{successMessage}</p> : null}
        {flyItemLabel ? <span className={styles.flyToken}>{flyItemLabel}</span> : null}
        <div className={styles.footer}>
          <strong>PHP {formatCurrency(calculation?.finalLineTotal ?? 0)}</strong>
          <button type="button" className={styles.cancelButton} onClick={onClose}>Cancel</button>
          <button type="button" className={styles.primaryButton} disabled={!canSave} onClick={handleSave}>
            {initialItem ? 'Save Changes' : 'Add to Cart'}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatUnitDescription(option: { packagingText: string; quantityInBaseUnit: number; baseUnitCode: string }) {
  const packagingText = option.packagingText.trim();
  const generated =
    option.quantityInBaseUnit <= 1
      ? 'Base unit'
      : `Contains ${option.quantityInBaseUnit} ${pluralizeUnit(option.baseUnitCode, option.quantityInBaseUnit)}`;
  if (!packagingText) {
    return generated;
  }
  return packagingText.toLowerCase() === generated.toLowerCase() ? generated : packagingText;
}

function pluralizeUnit(unit: string, quantity: number) {
  const label = unit.trim() || 'unit';
  if (quantity === 1 || label.endsWith('s')) {
    return label;
  }
  return `${label}s`;
}

function getQuantityValidation(quantity: number, minQuantity: number, orderIncrement: number) {
  if (!Number.isInteger(quantity) || quantity < 1) {
    return 'Quantity must be a positive whole number.';
  }
  if (quantity < minQuantity) {
    return `Minimum order quantity is ${minQuantity}.`;
  }
  if (orderIncrement > 1 && (quantity - minQuantity) % orderIncrement !== 0) {
    return `Quantity must increase by ${orderIncrement}.`;
  }
  return '';
}

function formatReasons(reasons: string[]) {
  const labels: Record<string, string> = {
    inactive: 'inactive',
    outside_effective_date: 'outside effective date',
    wrong_price_class: 'wrong price class',
    wrong_unit: 'wrong unit',
    below_minimum_quantity: 'below minimum quantity',
    above_maximum_quantity: 'above maximum quantity',
    wrong_branch: 'wrong branch',
    wrong_price_type: 'wrong price type',
    wrong_variation: 'wrong variation',
  };
  return reasons.map((reason) => labels[reason] ?? reason).join(', ');
}
