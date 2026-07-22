import { useMemo, useState } from 'react';
import styles from './VarAndPrice.module.css';
import type { DiscountItem, SurchargeItem, VariationItem } from '../../../services/types';

type VarAndPriceProps = {
  onBack: () => void;
  onNext: () => void;
  onNextLabel?: string;
  isSubmitting?: boolean;
  isLoading?: boolean;
  defaultBaseSku?: string;
  items: VariationItem[];
  discounts: DiscountItem[];
  surcharges: SurchargeItem[];
  onChange: (items: VariationItem[]) => void;
  onDiscountsChange: (items: DiscountItem[]) => void;
  onSurchargesChange: (items: SurchargeItem[]) => void;
};

type PriceCode = 'R1' | 'R2' | 'W1' | 'W2' | 'SP' | 'CP';

type VariationCard = {
  id: string;
  variationName: string;
  baseSku: string;
  stockQuantity: string;
  availability: VariationItem['availability'];
  rowIds: Partial<Record<PriceCode, string>>;
  prices: Record<PriceCode, string>;
};

function buildVariationKey(variationName: string, baseSku: string) {
  return `${variationName.trim().toLowerCase()}::${baseSku.trim().toLowerCase()}`;
}

function toSkuToken(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildGroupKeyFromRow(item: VariationItem) {
  const normalizedVariationName = (item.variationName || item.className || '').trim().toLowerCase();
  const normalizedSku = item.skuCode.trim().toLowerCase();
  if (normalizedVariationName) {
    return `name::${normalizedVariationName}`;
  }
  return `sku::${normalizedSku}`;
}

const PRICE_CODES: Array<{
  code: PriceCode;
  label: string;
  branchName: VariationItem['branchName'];
  priceType: VariationItem['priceType'];
}> = [
  { code: 'R1', label: 'Retail 1 (R1)', branchName: 'Manila', priceType: 'Retail' },
  { code: 'R2', label: 'Retail 2 (R2)', branchName: 'Cebu', priceType: 'Retail' },
  { code: 'W1', label: 'Wholesale 1 (W1)', branchName: 'Manila', priceType: 'Wholesale' },
  { code: 'W2', label: 'Wholesale 2 (W2)', branchName: 'Cebu', priceType: 'Wholesale' },
  { code: 'SP', label: 'Special', branchName: 'Both', priceType: 'Special' },
  { code: 'CP', label: 'Concept Store', branchName: 'Both', priceType: 'Concept Store' },
];

function formatPriceInput(value: string) {
  const sanitized = value.replace(/[^\d.]/g, '');
  const [rawInteger = '', rawDecimal = ''] = sanitized.split('.');
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = Number(normalizedInteger).toLocaleString('en-US');
  const limitedDecimal = rawDecimal.slice(0, 2);
  return sanitized.includes('.') ? `${formattedInteger}.${limitedDecimal}` : formattedInteger;
}

function toPriceCode(value: string): PriceCode | null {
  return PRICE_CODES.some((entry) => entry.code === value) ? (value as PriceCode) : null;
}

function toVariationCards(items: VariationItem[]): VariationCard[] {
  const grouped = new Map<string, VariationCard>();
  for (const item of items) {
    const groupKey = buildGroupKeyFromRow(item);
    const existing = grouped.get(groupKey);
    const code = toPriceCode(item.priceCode);
    if (!existing) {
      const next: VariationCard = {
        id: buildVariationKey(item.variationName || item.className || groupKey, item.skuCode || ''),
        variationName: item.variationName || item.className || 'Variation',
        baseSku: item.skuCode || '',
        stockQuantity: item.stockQuantity || '0',
        availability: item.availability || 'Available',
        rowIds: {},
        prices: { R1: '', R2: '', W1: '', W2: '', SP: '', CP: '' },
      };
      if (code) {
        next.prices[code] = item.price;
        next.rowIds[code] = item.id;
      }
      grouped.set(groupKey, next);
      continue;
    }
    if (code) {
      existing.prices[code] = item.price;
      existing.rowIds[code] = item.id;
    }
    if (!existing.baseSku && item.skuCode) {
      existing.baseSku = item.skuCode;
    }
    if (!existing.stockQuantity && item.stockQuantity) {
      existing.stockQuantity = item.stockQuantity;
    }
    if (!existing.variationName && (item.variationName || item.className)) {
      existing.variationName = item.variationName || item.className;
    }
  }
  return Array.from(grouped.values());
}

function flattenCards(cards: VariationCard[]): VariationItem[] {
  return cards.flatMap((card) =>
    PRICE_CODES.map((entry) => ({
      id: card.rowIds[entry.code] ?? crypto.randomUUID(),
      priceType: entry.priceType,
      variationName: card.variationName,
      className: card.variationName,
      priceCode: entry.code,
      branchName: entry.branchName,
      price: card.prices[entry.code],
      skuCode: card.baseSku,
      stockQuantity: card.stockQuantity || '0',
      availability: card.availability || 'Available',
    })),
  );
}

export default function VarAndPrice({
  onBack,
  onNext,
  onNextLabel = 'Save Product',
  isSubmitting = false,
  isLoading = false,
  defaultBaseSku = '',
  items,
  discounts,
  surcharges,
  onChange,
  onDiscountsChange,
  onSurchargesChange,
}: VarAndPriceProps) {
  const cards = useMemo(() => toVariationCards(items), [items]);
  const [variationModalError, setVariationModalError] = useState('');
  const [activeCard, setActiveCard] = useState<VariationCard | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<VariationCard | null>(null);
  const [isVariationModalOpen, setVariationModalOpen] = useState(false);
  const [discountContext, setDiscountContext] = useState<{ variationId: string; code: PriceCode } | null>(null);
  const [promoContext, setPromoContext] = useState<{ variationId: string; code: PriceCode } | null>(null);

  const [discountDraft, setDiscountDraft] = useState<Array<{ id: string; minQuantity: string; percent: string }>>([]);
  const [promoDraft, setPromoDraft] = useState<Array<{ id: string; minQuantity: string; maxQuantity: string; freeQuantity: string; label: string; priority: string }>>([]);

  function pushCards(nextCards: VariationCard[]) {
    onChange(flattenCards(nextCards));
  }

  function openAddModal() {
    setVariationModalError('');
    setActiveCard({
      id: crypto.randomUUID(),
      variationName: '',
      baseSku: defaultBaseSku,
      stockQuantity: '0',
      availability: 'Available',
      rowIds: {},
      prices: { R1: '', R2: '', W1: '', W2: '', SP: '', CP: '' },
    });
    setVariationModalOpen(true);
  }

  function openEditModal(cardId: string) {
    const card = cards.find((entry) => entry.id === cardId);
    if (!card) return;
    setVariationModalError('');
    setActiveCard(card);
    setVariationModalOpen(true);
  }

  function saveVariationCard() {
    if (!activeCard || !activeCard.variationName.trim()) {
      setVariationModalError('Variation Name is required.');
      return;
    }
    const resolvedBaseSku = activeCard.baseSku.trim()
      ? activeCard.baseSku.trim()
      : toSkuToken(defaultBaseSku) || toSkuToken(activeCard.variationName) || 'VARIATION';
    setVariationModalError('');
    const previous = cards.find((card) => card.id === activeCard.id);
    const nextId = buildVariationKey(activeCard.variationName, resolvedBaseSku);
    const nextCard = { ...activeCard, id: nextId, baseSku: resolvedBaseSku };
    const exists = cards.some((card) => card.id === activeCard.id);
    const nextCards = exists ? cards.map((card) => (card.id === activeCard.id ? nextCard : card)) : [...cards, nextCard];
    if (previous && previous.id !== nextCard.id) {
      onDiscountsChange(discounts.map((item) => (item.variationId === previous.id ? { ...item, variationId: nextCard.id } : item)));
      onSurchargesChange(surcharges.map((item) => (item.variationId === previous.id ? { ...item, variationId: nextCard.id } : item)));
    }
    pushCards(nextCards);
    setVariationModalOpen(false);
  }

  function deleteCard(cardId: string) {
    pushCards(cards.filter((card) => card.id !== cardId));
    onDiscountsChange(discounts.filter((item) => item.variationId !== cardId));
    onSurchargesChange(surcharges.filter((item) => item.variationId !== cardId));
  }

  function matchesVariation(variationId: string, fallbackRowId?: string) {
    return (value: string) => value === variationId || (!!fallbackRowId && value === fallbackRowId);
  }

  function openDiscountModal(variationId: string, code: PriceCode, fallbackRowId?: string) {
    setDiscountContext({ variationId, code });
    const matchVariation = matchesVariation(variationId, fallbackRowId);
    const existing = discounts
      .filter((item) => matchVariation(item.variationId) && item.priceCode === code)
      .sort((a, b) => Number(a.applySequence || '1') - Number(b.applySequence || '1'))
      .map((item) => ({
        id: item.id,
        minQuantity: item.minQuantity,
        percent: item.amount,
      }));
    setDiscountDraft(
      existing.length > 0
        ? existing
        : [{ id: crypto.randomUUID(), minQuantity: '', percent: '' }],
    );
  }

  function saveDiscountModal() {
    if (!discountContext) return;
    const codeConfig = PRICE_CODES.find((entry) => entry.code === discountContext.code);
    if (!codeConfig) return;
    const currentCard = cards.find((card) => card.id === discountContext.variationId);
    const fallbackRowId = currentCard?.rowIds[discountContext.code];
    const matchVariation = matchesVariation(discountContext.variationId, fallbackRowId);
    const filtered = discounts.filter(
      (item) => !(matchVariation(item.variationId) && item.priceCode === discountContext.code),
    );
    const inserted: DiscountItem[] = discountDraft
      .filter((item) => item.minQuantity && item.percent)
      .map((item, index) => ({
        id: item.id,
        variationId: discountContext.variationId,
        discountName: `Tier ${index + 1}`,
        discountType: 'Percent',
        amount: item.percent,
        minQuantity: item.minQuantity,
        maxQuantity: '',
        branchName: codeConfig.branchName,
        priceType: codeConfig.priceType,
        priceCode: codeConfig.code,
        calculationMethod: 'Cascading',
        applySequence: String(index + 1),
        discountGroup: `${discountContext.variationId}-${discountContext.code}`,
        appliesTo: 'UnitPrice',
        stackable: true,
      }));
    onDiscountsChange([...filtered, ...inserted]);
    setDiscountContext(null);
    setDiscountDraft([]);
  }

  function openPromoModal(variationId: string, code: PriceCode, fallbackRowId?: string) {
    setPromoContext({ variationId, code });
    const matchVariation = matchesVariation(variationId, fallbackRowId);
    const existing = surcharges
      .filter((item) => matchVariation(item.variationId) && item.priceCode === code)
      .sort((a, b) => Number(a.minQuantity) - Number(b.minQuantity))
      .map((item) => ({
        id: item.id,
        minQuantity: item.minQuantity,
        maxQuantity: item.maxQuantity,
        freeQuantity: item.freeQuantity,
        label: item.surchargeName,
        priority: '1',
      }));
    setPromoDraft(existing);
  }

  function savePromoModal() {
    if (!promoContext) return;
    const codeConfig = PRICE_CODES.find((entry) => entry.code === promoContext.code);
    if (!codeConfig) return;
    const currentCard = cards.find((card) => card.id === promoContext.variationId);
    const fallbackRowId = currentCard?.rowIds[promoContext.code];
    const matchVariation = matchesVariation(promoContext.variationId, fallbackRowId);
    const filtered = surcharges.filter(
      (item) => !(matchVariation(item.variationId) && item.priceCode === promoContext.code),
    );
    const inserted: SurchargeItem[] = promoDraft
      .filter((item) => item.minQuantity && item.freeQuantity)
      .map((item) => ({
        id: item.id,
        variationId: promoContext.variationId,
        surchargeName: item.label || 'Freebie Promo',
        surchargeType: 'Freebie',
        amount: '',
        freeQuantity: item.freeQuantity,
        minQuantity: item.minQuantity,
        maxQuantity: item.maxQuantity,
        branchName: codeConfig.branchName,
        priceType: codeConfig.priceType,
        priceCode: codeConfig.code,
      }));
    onSurchargesChange([...filtered, ...inserted]);
    setPromoContext(null);
    setPromoDraft([]);
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Variation & Pricing</h3>
        <button type="button" className={styles.addButton} onClick={openAddModal}>Add Variation</button>
      </div>

      {isLoading ? (
        <div className={styles.cardGrid}>
          {Array.from({ length: 3 }).map((_, index) => (
            <article key={index} className={styles.variationCardSkeleton}>
              <div className={styles.skeletonHeader}></div>
              <div className={styles.skeletonBody}></div>
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && cards.length === 0 ? <div className={styles.emptyState}>No variation cards yet.</div> : null}

      <div className={styles.cardGrid}>
        {!isLoading && cards.map((card) => (
          <article key={card.id} className={styles.variationCard}>
            <div className={styles.cardHeader}>
              <div>
                <h4 className={styles.cardTitle}>{card.variationName}</h4>
                <p className={styles.cardMeta}>SKU: {card.baseSku || '-'}</p>
              </div>
              <div className={styles.cardActions}>
                <button type="button" className={styles.secondaryAction} onClick={() => openEditModal(card.id)}>Edit</button>
                <button type="button" className={styles.deleteAction} onClick={() => setDeleteTarget(card)}>Delete</button>
              </div>
            </div>
            <div className={styles.priceGrid}>
              {PRICE_CODES.map((entry) => {
                const fallbackRowId = card.rowIds[entry.code];
                const matchVariation = matchesVariation(card.id, fallbackRowId);
                const discountCount = discounts.filter((item) => matchVariation(item.variationId) && item.priceCode === entry.code).length;
                const promoCount = surcharges.filter((item) => matchVariation(item.variationId) && item.priceCode === entry.code).length;
                return (
                  <div key={entry.code} className={styles.priceCell}>
                    <div className={styles.priceTop}>
                      <span className={styles.priceLabel}>{entry.code}</span>
                      <span className={styles.priceValue}>{card.prices[entry.code] ? `PHP ${card.prices[entry.code]}` : '-'}</span>
                    </div>
                    <p className={styles.priceHint}>{entry.label}</p>
                    <div className={styles.priceActions}>
                      <button type="button" className={styles.smallAction} onClick={() => openDiscountModal(card.id, entry.code, fallbackRowId)}>Manage Discount ({discountCount} rows)</button>
                      <button type="button" className={styles.smallAction} onClick={() => openPromoModal(card.id, entry.code, fallbackRowId)}>Manage Promo ({promoCount} rows)</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>

      {isVariationModalOpen && activeCard ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Variation Details</h4>
            {variationModalError ? <p className={styles.confirmText}>{variationModalError}</p> : null}
            <div className={styles.modalGrid}>
              <input className={styles.input} placeholder="Variation name" value={activeCard.variationName} onChange={(event) => setActiveCard({ ...activeCard, variationName: event.target.value })} />
              <input className={styles.input} placeholder="Base SKU code" value={activeCard.baseSku} onChange={(event) => setActiveCard({ ...activeCard, baseSku: event.target.value.toUpperCase() })} />
              <input className={styles.input} placeholder="Stock quantity" value={activeCard.stockQuantity} onChange={(event) => setActiveCard({ ...activeCard, stockQuantity: event.target.value.replace(/[^\d]/g, '') })} />
              {PRICE_CODES.map((entry) => (
                <input
                  key={entry.code}
                  className={styles.input}
                  placeholder={`${entry.code} price`}
                  value={activeCard.prices[entry.code]}
                  onChange={(event) =>
                    setActiveCard({
                      ...activeCard,
                      prices: { ...activeCard.prices, [entry.code]: formatPriceInput(event.target.value) },
                    })
                  }
                />
              ))}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setVariationModalOpen(false)}>Cancel</button>
              <button type="button" className={styles.registerButton} onClick={saveVariationCard}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Delete Variation</h4>
            <p className={styles.confirmText}>
              Are you sure you want to delete {deleteTarget.variationName}?
            </p>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                type="button"
                className={styles.deleteAction}
                onClick={() => {
                  deleteCard(deleteTarget.id);
                  setDeleteTarget(null);
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {discountContext ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Cascading Discount: {discountContext.code}</h4>
            <div className={styles.modalRowHeader}>
              <span>#</span>
              <span>Min Qty</span>
              <span>Discount %</span>
            </div>
            {discountDraft.map((tier) => (
              <div key={tier.id} className={styles.discountRow}>
                <span className={styles.rowIndex}>{discountDraft.findIndex((item) => item.id === tier.id) + 1}</span>
                <input className={styles.input} placeholder="Min qty" value={tier.minQuantity} onChange={(event) => setDiscountDraft(discountDraft.map((item) => (item.id === tier.id ? { ...item, minQuantity: event.target.value } : item)))} />
                <input className={styles.input} placeholder="Discount %" value={tier.percent} onChange={(event) => setDiscountDraft(discountDraft.map((item) => (item.id === tier.id ? { ...item, percent: event.target.value } : item)))} />
              </div>
            ))}
            <button type="button" className={styles.secondaryAction} onClick={() => setDiscountDraft([...discountDraft, { id: crypto.randomUUID(), minQuantity: '', percent: '' }])}>Add Tier</button>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setDiscountContext(null)}>Cancel</button>
              <button type="button" className={styles.registerButton} onClick={saveDiscountModal}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {promoContext ? (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h4 className={styles.modalTitle}>Promo / Freebie: {promoContext.code}</h4>
            <div className={styles.modalRowHeaderPromo}>
              <span>Promo Name</span>
              <span>Min Qty</span>
              <span>Max Qty</span>
              <span>Free Qty</span>
            </div>
            {promoDraft.map((tier) => (
              <div key={tier.id} className={styles.promoRow}>
                <input className={styles.input} placeholder="Promo name" value={tier.label} onChange={(event) => setPromoDraft(promoDraft.map((item) => (item.id === tier.id ? { ...item, label: event.target.value } : item)))} />
                <input className={styles.input} placeholder="Min qty" value={tier.minQuantity} onChange={(event) => setPromoDraft(promoDraft.map((item) => (item.id === tier.id ? { ...item, minQuantity: event.target.value } : item)))} />
                <input className={styles.input} placeholder="Max qty (optional)" value={tier.maxQuantity} onChange={(event) => setPromoDraft(promoDraft.map((item) => (item.id === tier.id ? { ...item, maxQuantity: event.target.value } : item)))} />
                <input className={styles.input} placeholder="Free qty" value={tier.freeQuantity} onChange={(event) => setPromoDraft(promoDraft.map((item) => (item.id === tier.id ? { ...item, freeQuantity: event.target.value } : item)))} />
              </div>
            ))}
            <button type="button" className={styles.secondaryAction} onClick={() => setPromoDraft([...promoDraft, { id: crypto.randomUUID(), minQuantity: '', maxQuantity: '', freeQuantity: '', label: 'Freebie Promo', priority: '1' }])}>Add Promo Tier</button>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelButton} onClick={() => setPromoContext(null)}>Cancel</button>
              <button type="button" className={styles.registerButton} onClick={savePromoModal}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onBack}>Back</button>
        <button type="button" className={styles.registerButton} onClick={onNext} disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : onNextLabel}
        </button>
      </div>
    </section>
  );
}
