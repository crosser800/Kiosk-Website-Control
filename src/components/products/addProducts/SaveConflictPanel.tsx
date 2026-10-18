import { useState } from 'react';
import styles from './SaveConflictPanel.module.css';
import {
  loadVariationConflictPreview,
  type OrphanSkuGroup,
  type VariationConflictPreview,
  type VariationSkuConflict,
} from './variationSkuConflicts';
import type { UnitOptionConflict } from './unitOptionReconciliation';

export type SaveConflictState =
  | { kind: 'sku'; conflicts: VariationSkuConflict[]; ignoredOrphans: OrphanSkuGroup[] }
  | { kind: 'unit'; conflicts: UnitOptionConflict[] };

type SaveConflictPanelProps = {
  conflict: SaveConflictState;
  onGoToVariation: (cardKey: string) => void;
  onGoToUnitOption: (cardKey: string, unitOptionId: string) => void;
  // Absent when this editor cannot open another product (no host workspace).
  // Resolves to an error message, or null once navigation happened.
  onOpenProduct?: (conflict: VariationSkuConflict) => Promise<string | null>;
  onDismiss: () => void;
};

const SCOPE_LABEL: Record<VariationSkuConflict['scope'], string> = {
  other_product: 'Another product',
  same_product: 'This product',
  same_save: 'This edit (unsaved)',
};

function formatPrice(value: number | null) {
  return value === null ? '-' : value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SaveConflictPanel({
  conflict,
  onGoToVariation,
  onGoToUnitOption,
  onOpenProduct,
  onDismiss,
}: SaveConflictPanelProps) {
  const [preview, setPreview] = useState<{ conflict: VariationSkuConflict; data: VariationConflictPreview } | null>(null);
  const [loadingKey, setLoadingKey] = useState('');
  const [actionError, setActionError] = useState('');

  async function openPreview(item: VariationSkuConflict, key: string) {
    setActionError('');
    setLoadingKey(key);
    try {
      const data = await loadVariationConflictPreview(item);
      if (!data) {
        setActionError(
          `The variation "${item.variationName}" no longer exists in "${item.productName || 'that product'}". Try saving again.`,
        );
        return;
      }
      setPreview({ conflict: item, data });
    } catch (error) {
      console.error('Failed to load conflicting variation preview', error);
      setActionError('Could not load the existing variation. Check your connection and try again.');
    } finally {
      setLoadingKey('');
    }
  }

  async function openProduct(item: VariationSkuConflict) {
    if (!onOpenProduct) return;
    setPreview(null);
    setActionError('');
    try {
      const message = await onOpenProduct(item);
      if (message) setActionError(message);
    } catch (error) {
      console.error('Failed to open conflicting product', error);
      setActionError('Could not open the existing product. Try again.');
    }
  }

  if (conflict.kind === 'unit') {
    return (
      <section className={styles.panel} role="alert" aria-live="assertive">
        <div className={styles.header}>
          <h4 className={styles.title}>Duplicate unit option</h4>
          <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
            ×
          </button>
        </div>
        <p className={styles.text}>
          Saving is blocked because a variation can only have one option per unit and quantity.
        </p>
        <ul className={styles.list}>
          {conflict.conflicts.map((item, index) => (
            <li key={`${item.variationId}-${item.unitCode}-${index}`} className={styles.item}>
              <div className={styles.itemBody}>
                <span className={styles.value}>
                  {item.unitCode.toUpperCase()}
                  {Number.isFinite(item.quantityInBaseUnit) ? ` × ${item.quantityInBaseUnit}` : ''}
                </span>
                <span className={styles.meta}>
                  {item.optionIds.length > 1
                    ? `Listed ${item.optionIds.length} times in the same variation.`
                    : 'Already saved for this variation.'}
                </span>
              </div>
              {item.cardKey && item.optionIds[0] ? (
                <button
                  type="button"
                  className={styles.action}
                  onClick={() => onGoToUnitOption(item.cardKey as string, item.optionIds[0])}
                >
                  Go to Existing Unit Option
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    );
  }

  // Orphans are only worth mentioning next to a SKU that is also blocked.
  const relevantOrphanCount = conflict.ignoredOrphans.filter((orphan) =>
    conflict.conflicts.some((item) => item.normalizedSku === orphan.sku.trim().toLowerCase()),
  ).length;

  return (
    <section className={styles.panel} role="alert" aria-live="assertive">
      <div className={styles.header}>
        <h4 className={styles.title}>
          {conflict.conflicts.length === 1 ? 'Duplicate variation SKU' : `Duplicate variation SKUs (${conflict.conflicts.length})`}
        </h4>
        <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
      <p className={styles.text}>
        Saving is blocked because each variation needs its own SKU. Change the SKU on your variation, or inspect the
        existing one below.
      </p>
      <ul className={styles.list}>
        {conflict.conflicts.map((item, index) => {
          const key = `${item.normalizedSku}-${item.variationGroupId ?? item.targetCardKey ?? index}`;
          return (
            <li key={key} className={styles.item}>
              <div className={styles.itemBody}>
                <span className={styles.value}>SKU {item.sku}</span>
                <span className={styles.meta}>
                  Your variation: <strong>{item.claimVariationName || 'Unnamed'}</strong>
                </span>
                <span className={styles.meta}>
                  <span className={styles.badge}>{SCOPE_LABEL[item.scope]}</span>
                  {item.scope === 'other_product' ? (
                    <>
                      {' '}
                      <strong>{item.productName || 'Unnamed product'}</strong>
                      {item.productStatus ? ` (${item.productStatus})` : ''} → variation{' '}
                    </>
                  ) : (
                    ' Variation '
                  )}
                  <strong>{item.variationName || 'Unnamed'}</strong>
                  {item.recordStatus !== 'Unsaved' ? ` · ${item.recordStatus}` : ''}
                  {item.existingSku && item.existingSku !== item.sku ? ` · saved as "${item.existingSku}"` : ''}
                </span>
                {item.scope === 'same_product' && !item.targetCardKey ? (
                  <span className={styles.meta}>
                    This variation was removed in this edit but is still saved. Save the removal first, or use a different
                    SKU.
                  </span>
                ) : null}
              </div>
              <div className={styles.actions}>
                {item.scope !== 'other_product' && item.targetCardKey ? (
                  <button type="button" className={styles.action} onClick={() => onGoToVariation(item.targetCardKey as string)}>
                    Go to Variation
                  </button>
                ) : null}
                {item.scope === 'other_product' && item.variationGroupId ? (
                  <button
                    type="button"
                    className={styles.action}
                    disabled={loadingKey === key}
                    onClick={() => void openPreview(item, key)}
                  >
                    {loadingKey === key ? 'Loading…' : 'View Existing Product'}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {relevantOrphanCount > 0 ? (
        <p className={styles.note}>
          Also found {relevantOrphanCount} unused record{relevantOrphanCount === 1 ? '' : 's'} (no saved variation) with
          this SKU. Unused records are ignored and do not block saving.
        </p>
      ) : null}
      {actionError ? <p className={styles.error}>{actionError}</p> : null}

      {preview ? (
        <div className={styles.overlay} role="presentation" onClick={() => setPreview(null)}>
          <div
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sku-conflict-preview-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h4 id="sku-conflict-preview-title" className={styles.title}>
              Existing variation (read-only)
            </h4>
            <dl className={styles.details}>
              <dt>Product</dt>
              <dd>
                {preview.data.productName || 'Unnamed product'}
                {preview.data.productStatus ? ` (${preview.data.productStatus})` : ''}
              </dd>
              <dt>Variation</dt>
              <dd>{preview.data.variationName || 'Unnamed'}</dd>
              <dt>SKU</dt>
              <dd>{preview.data.skuCode || '-'}</dd>
            </dl>
            {preview.data.prices.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    {preview.data.prices.map((price) => (
                      <th key={price.priceCode}>{price.priceCode}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {preview.data.prices.map((price) => (
                      <td key={price.priceCode}>{formatPrice(price.price)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : null}
            {preview.data.unitOptions.length > 0 ? (
              <p className={styles.meta}>
                Units:{' '}
                {preview.data.unitOptions
                  .map(
                    (unit) =>
                      `${unit.unitCode} × ${unit.quantityInBaseUnit} ${unit.baseUnitCode}${unit.status === 'Inactive' ? ' (inactive)' : ''}`,
                  )
                  .join(', ')}
              </p>
            ) : null}
            <div className={styles.dialogActions}>
              <button type="button" className={styles.secondary} onClick={() => setPreview(null)}>
                Close
              </button>
              {onOpenProduct ? (
                <button type="button" className={styles.primary} onClick={() => void openProduct(preview.conflict)}>
                  Open Product
                </button>
              ) : null}
            </div>
            {onOpenProduct ? (
              <p className={styles.note}>Opening the product leaves this editor. You will be asked about unsaved changes first.</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
