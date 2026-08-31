import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './VarAndPrice.module.css';
import { supabase } from '../../../lib/supabase';

export type RewardSelectionValue = {
  productId: string;
  productLabel: string;
  variationId: string;
  variationLabel: string;
  unitOptionId: string;
  unitCode: string;
};

type RewardProductSelectorProps = {
  open: boolean;
  initialSelection?: Partial<RewardSelectionValue>;
  qualifyingPriceCode: string;
  onClose: () => void;
  onConfirm: (selection: RewardSelectionValue) => void;
};

type SelectorStep = 'product' | 'variation' | 'unit';

type ProductResult = {
  id: string;
  productName: string;
  skuCode: string;
};

type VariationResult = {
  id: string;
  label: string;
  rowId: string;
};

type UnitResult = {
  id: string;
  unitCode: string;
  label: string;
};

function getUnitResultLabel(unit: Pick<UnitResult, 'label' | 'unitCode'>) {
  return unit.label.trim() || unit.unitCode.trim() || 'unit';
}

function getInitialStep(initialSelection?: Partial<RewardSelectionValue>): SelectorStep {
  if (initialSelection?.productId && initialSelection?.variationId && initialSelection?.unitOptionId) {
    return 'unit';
  }
  if (initialSelection?.productId) {
    return 'variation';
  }
  return 'product';
}

export default function RewardProductSelector({
  open,
  initialSelection,
  qualifyingPriceCode,
  onClose,
  onConfirm,
}: RewardProductSelectorProps) {
  // NOTE: the parent remounts this component (via a changing `key`) whenever a
  // different reward-target row opens the selector, so these lazy initializers
  // re-run fresh instead of needing an "on open, reset state" effect.
  const [step, setStep] = useState<SelectorStep>(() => getInitialStep(initialSelection));
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<{ id: string; label: string } | null>(() =>
    initialSelection?.productId
      ? { id: initialSelection.productId, label: initialSelection.productLabel || '' }
      : null,
  );
  const [variationResults, setVariationResults] = useState<VariationResult[]>([]);
  const [variationLoading, setVariationLoading] = useState(false);

  const [selectedVariation, setSelectedVariation] = useState<{ id: string; label: string } | null>(() =>
    initialSelection?.productId && initialSelection?.variationId
      ? { id: initialSelection.variationId, label: initialSelection.variationLabel || '' }
      : null,
  );
  const [unitResults, setUnitResults] = useState<UnitResult[]>([]);
  const [unitLoading, setUnitLoading] = useState(false);

  const [selectedUnit, setSelectedUnit] = useState<{ id: string; code: string; label: string } | null>(() =>
    initialSelection?.productId && initialSelection?.variationId && initialSelection?.unitOptionId
      ? {
          id: initialSelection.unitOptionId,
          code: initialSelection.unitCode || '',
          label: initialSelection.unitCode || '',
        }
      : null,
  );

  useEffect(() => {
    if (selectedProduct) {
      void loadVariationsForProduct(selectedProduct.id);
    }
    if (selectedVariation) {
      void loadUnitsForVariation(selectedVariation.id);
    }
    // Mount-only: pre-loads the option lists for a pre-populated selection
    // (editing an existing reward). Re-running this per keystroke/selection
    // would refetch lists the click handlers already fetch directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!open || step !== 'product') {
      return;
    }
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    const timeout = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, product_name, sku_code, status')
        .or(`product_name.ilike.%${query}%,sku_code.ilike.%${query}%`)
        .eq('status', 'Active')
        .limit(10);
      if (cancelled) return;
      if (error) {
        setSearchResults([]);
        setSearchLoading(false);
        return;
      }
      setSearchResults(
        ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
          id: String(row.id ?? ''),
          productName: String(row.product_name ?? ''),
          skuCode: String(row.sku_code ?? ''),
        })),
      );
      setSearchLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [open, step, searchQuery]);

  async function loadVariationsForProduct(productId: string) {
    setVariationLoading(true);
    const { data, error } = await supabase
      .from('product_variations')
      .select('id, variation_name, class_name, sku_code, price_code')
      .eq('product_id', productId)
      .order('sort_order', { ascending: true });

    if (error) {
      setVariationResults([]);
      setVariationLoading(false);
      return;
    }

    // Each logical variation (e.g. "Matte Black") is stored as one row per
    // price class (R1/R2/W1/W2/SP/CP). Group those rows so the picker shows
    // the variation once, then resolve to whichever row matches the price
    // class of the promo rule being configured, so the same pick works
    // regardless of which price class row it maps to underneath.
    const groups = new Map<string, { label: string; rowsByPriceCode: Map<string, string> }>();
    ((data ?? []) as Array<Record<string, unknown>>).forEach((row) => {
      const variationName = String(row.variation_name ?? row.class_name ?? 'Variation').trim();
      const skuCode = String(row.sku_code ?? '').trim();
      const groupKey = `${variationName.toLowerCase()}::${skuCode.toLowerCase()}`;
      const priceCode = String(row.price_code ?? '').trim().toUpperCase();
      const rowId = String(row.id ?? '');
      const existing = groups.get(groupKey);
      if (existing) {
        existing.rowsByPriceCode.set(priceCode, rowId);
      } else {
        groups.set(groupKey, { label: variationName, rowsByPriceCode: new Map([[priceCode, rowId]]) });
      }
    });

    const normalizedQualifyingCode = qualifyingPriceCode.trim().toUpperCase();
    const mapped: VariationResult[] = Array.from(groups.values())
      .map((group, index) => ({
        id: `${group.label.toLowerCase()}-${index}`,
        label: group.label,
        rowId: group.rowsByPriceCode.get(normalizedQualifyingCode) ?? '',
      }))
      .filter((result) => Boolean(result.rowId));

    setVariationResults(mapped);
    setVariationLoading(false);
  }

  async function loadUnitsForVariation(variationId: string) {
    setUnitLoading(true);
    const { data, error } = await supabase
      .from('product_variation_unit_options')
      .select('id, unit_code, unit_label')
      .eq('variation_id', variationId)
      .eq('status', 'Active')
      .order('sort_order', { ascending: true });

    if (error) {
      setUnitResults([]);
      setUnitLoading(false);
      return;
    }

    setUnitResults(
      ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id ?? ''),
        unitCode: String(row.unit_code ?? ''),
        label: String(row.unit_label ?? row.unit_code ?? ''),
      })),
    );
    setUnitLoading(false);
  }

  if (!open) {
    return null;
  }

  function handlePickProduct(product: ProductResult) {
    const next = { id: product.id, label: product.productName };
    setSelectedProduct(next);
    setSelectedVariation(null);
    setUnitResults([]);
    setSelectedUnit(null);
    setStep('variation');
    void loadVariationsForProduct(product.id);
  }

  function handlePickVariation(variation: VariationResult) {
    const next = { id: variation.rowId, label: variation.label };
    setSelectedVariation(next);
    setSelectedUnit(null);
    setStep('unit');
    void loadUnitsForVariation(variation.rowId);
  }

  function handlePickUnit(unit: UnitResult) {
    setSelectedUnit({ id: unit.id, code: unit.unitCode, label: getUnitResultLabel(unit) });
  }

  function handleConfirm() {
    if (!selectedProduct || !selectedVariation || !selectedUnit) {
      return;
    }
    onConfirm({
      productId: selectedProduct.id,
      productLabel: selectedProduct.label,
      variationId: selectedVariation.id,
      variationLabel: selectedVariation.label,
      unitOptionId: selectedUnit.id,
      unitCode: selectedUnit.code,
    });
  }

  const canConfirm = Boolean(selectedProduct && selectedVariation && selectedUnit);
  const stepNumber = step === 'product' ? 1 : step === 'variation' ? 2 : 3;

  return createPortal(
    (
      <div className={styles.modalOverlay}>
        <div className={styles.modal} role="dialog" aria-modal="true" aria-label="Select reward product">
          <div className={styles.modalHeader}>
            <div>
              <h4 className={styles.modalTitle}>
                {step === 'product'
                  ? 'Select Reward Product'
                  : step === 'variation'
                    ? 'Select Reward Variation'
                    : 'Select Reward Unit'}
              </h4>
              <p className={styles.confirmText}>Step {stepNumber} of 3</p>
            </div>
            <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close reward selector">
              <i className="fa-solid fa-xmark" aria-hidden="true"></i>
            </button>
          </div>

          {selectedProduct ? (
            <div className={styles.modalInfoGrid}>
              <span className={styles.infoCard}>
                <strong>Product:</strong> {selectedProduct.label}
              </span>
              {selectedVariation ? (
                <span className={styles.infoCard}>
                  <strong>Variation:</strong> {selectedVariation.label}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className={styles.modalContent}>
            {step === 'product' ? (
              <>
                <div className={styles.ruleGrid}>
                  <label className={styles.fieldGroup}>
                    <span className={styles.fieldLabel}>Search Product</span>
                    <input
                      className={styles.input}
                      placeholder="Search by product name or SKU"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      autoFocus
                    />
                  </label>
                </div>
                {searchLoading ? (
                  <div className={styles.emptyState}>Searching...</div>
                ) : searchResults.length > 0 ? (
                  <div className={styles.searchResults}>
                    {searchResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className={styles.searchResultItem}
                        onClick={() => handlePickProduct(result)}
                      >
                        {result.productName} {result.skuCode ? `(${result.skuCode})` : ''}
                      </button>
                    ))}
                  </div>
                ) : searchQuery.trim().length >= 2 ? (
                  <div className={styles.emptyState}>No products found.</div>
                ) : (
                  <div className={styles.emptyState}>Type at least 2 characters to search products.</div>
                )}
              </>
            ) : null}

            {step === 'variation' ? (
              <>
                {variationLoading ? (
                  <div className={styles.emptyState}>Loading variations...</div>
                ) : variationResults.length > 0 ? (
                  <div className={styles.searchResults}>
                    {variationResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className={`${styles.searchResultItem} ${
                          selectedVariation?.id === result.rowId ? styles.ruleTabActive : ''
                        }`}
                        onClick={() => handlePickVariation(result)}
                      >
                        {result.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    No variations with {qualifyingPriceCode} pricing available for this product.
                  </div>
                )}
              </>
            ) : null}

            {step === 'unit' ? (
              <>
                {unitLoading ? (
                  <div className={styles.emptyState}>Loading units...</div>
                ) : unitResults.length > 0 ? (
                  <div className={styles.searchResults}>
                    {unitResults.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        className={`${styles.searchResultItem} ${
                          selectedUnit?.id === result.id ? styles.ruleTabActive : ''
                        }`}
                        onClick={() => handlePickUnit(result)}
                      >
                        {getUnitResultLabel(result)}
                        {selectedUnit?.id === result.id ? ' ✓' : ''}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>No units available for this variation.</div>
                )}
              </>
            ) : null}
          </div>

          <div className={styles.actions}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancel
            </button>
            {step !== 'product' ? (
              <button
                type="button"
                className={styles.secondaryAction}
                onClick={() => setStep(step === 'unit' ? 'variation' : 'product')}
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              className={styles.registerButton}
              onClick={handleConfirm}
              disabled={!canConfirm}
            >
              Confirm Reward
            </button>
          </div>
        </div>
      </div>
    ),
    document.body,
  );
}
