import { useState } from 'react';
import styles from './VarAndPrice.module.css';
import type { DiscountItem } from './types';

type DiscountProps = {
  onBack: () => void;
  onNext: () => void;
  items: DiscountItem[];
  onChange: (items: DiscountItem[]) => void;
};

const emptyDiscount: DiscountItem = {
  id: '',
  discountRecordId: '',
  discountClassId: '',
  variationId: '',
  discountName: '',
  discountType: 'Percent',
  amount: '',
  minQuantity: '1',
  maxQuantity: '',
  branchName: '',
  priceType: '',
  priceCode: '',
  calculationMethod: 'Cascading',
  applySequence: '1',
  discountGroup: '',
  appliesTo: 'UnitPrice',
  stackable: true,
  description: '',
  status: 'Active',
  priority: '0',
  startsAt: '',
  endsAt: '',
  unitOptionId: '',
  orderUnitCode: '',
  unitCondition: 'any_unit',
  minOrderQuantity: '1',
  maxOrderQuantity: '',
  minBaseQuantity: '',
  maxBaseQuantity: '',
  unitRuleLabel: '',
  unitRuleNotes: '',
  hasPromo: false,
  promoType: 'Freebie',
  promoRewardUnitCode: '',
  promoRewardQuantity: '1',
  promoRewardLabel: '',
  promoSourceSurchargeId: '',
  promoRewardTargetType: 'same_item',
  promoRewardProductId: '',
  promoRewardProductLabel: '',
  promoRewardVariationId: '',
  promoRewardVariationLabel: '',
  promoRewardUnitOptionId: '',
  promoRewardRepeatMode: 'one_time',
  promoRewardEveryQuantity: '',
};

export default function Discount({ onBack, onNext, items, onChange }: DiscountProps) {
  const [draft, setDraft] = useState<DiscountItem>(emptyDiscount);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetDraft() {
    setDraft(emptyDiscount);
    setEditingId(null);
  }

  function saveItem() {
    if (!draft.discountName || !draft.amount) return;
    const next = { ...draft, id: editingId ?? crypto.randomUUID() };
    const nextItems = editingId ? items.map((item) => (item.id === editingId ? next : item)) : [...items, next];
    onChange(nextItems);
    resetDraft();
  }

  function editItem(id: string) {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setDraft(item);
    setEditingId(id);
  }

  function deleteItem(id: string) {
    onChange(items.filter((item) => item.id !== id));
    if (editingId === id) resetDraft();
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Discount</h3>
        <button type="button" className={styles.addButton} onClick={saveItem}>{editingId ? 'Update Discount' : 'Add Discount'}</button>
      </div>
      <div className={styles.itemsContainer}>
        <div className={styles.tableHeader}>
          <span>Name</span><span>Type</span><span>Amount</span><span>Min Qty</span><span>Max Qty</span><span>Sequence</span><span>Group</span><span>Branch</span><span>Price Type</span><span>Code</span><span>Action</span>
        </div>
        {items.length === 0 ? (
          <div className={styles.emptyState}>No discounts yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.tableRow}>
              <span>{item.discountName}</span><span>{item.discountType}</span><span>{item.amount}</span><span>{item.minQuantity}</span><span>{item.maxQuantity || '-'}</span><span>{item.applySequence}</span><span>{item.discountGroup || '-'}</span><span>{item.branchName || '-'}</span><span>{item.priceType || '-'}</span><span>{item.priceCode || '-'}</span>
              <div className={styles.actionCell}>
                <button type="button" className={styles.secondaryAction} onClick={() => editItem(item.id)}>Edit</button>
                <button type="button" className={styles.deleteAction} onClick={() => deleteItem(item.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className={styles.previewRow}>
        <input className={styles.input} placeholder="Discount Name" value={draft.discountName} onChange={(e) => setDraft({ ...draft, discountName: e.target.value })} />
        <select className={styles.select} value={draft.discountType} onChange={(e) => setDraft({ ...draft, discountType: e.target.value as DiscountItem['discountType'] })}><option value="Percent">Percent</option><option value="Amount">Amount</option></select>
        <input className={styles.input} placeholder="Amount/Percent" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <input className={styles.input} placeholder="Min Qty" value={draft.minQuantity} onChange={(e) => setDraft({ ...draft, minQuantity: e.target.value })} />
        <input className={styles.input} placeholder="Max Qty" value={draft.maxQuantity} onChange={(e) => setDraft({ ...draft, maxQuantity: e.target.value })} />
        <input className={styles.input} placeholder="Apply Sequence" value={draft.applySequence} onChange={(e) => setDraft({ ...draft, applySequence: e.target.value })} />
        <input className={styles.input} placeholder="Discount Group" value={draft.discountGroup} onChange={(e) => setDraft({ ...draft, discountGroup: e.target.value })} />
        <select className={styles.select} value={draft.branchName} onChange={(e) => setDraft({ ...draft, branchName: e.target.value as DiscountItem['branchName'] })}><option value="">Branch</option><option value="Manila">Manila</option><option value="Cebu">Cebu</option><option value="Both">Both</option></select>
        <select className={styles.select} value={draft.priceType} onChange={(e) => setDraft({ ...draft, priceType: e.target.value as DiscountItem['priceType'] })}><option value="">Price Type</option><option value="Retail">Retail</option><option value="Wholesale">Wholesale</option><option value="Special">Special</option><option value="Concept Store">Concept Store</option></select>
        <select className={styles.select} value={draft.priceCode} onChange={(e) => setDraft({ ...draft, priceCode: e.target.value as DiscountItem['priceCode'] })}><option value="">Price Code</option><option value="R1">R1</option><option value="R2">R2</option><option value="W1">W1</option><option value="W2">W2</option><option value="SP">SP</option><option value="CP">CP</option></select>
        <select className={styles.select} value={draft.calculationMethod} onChange={(e) => setDraft({ ...draft, calculationMethod: e.target.value as DiscountItem['calculationMethod'] })}><option value="Cascading">Calc: Cascading</option><option value="Single">Calc: Single</option></select>
        <select className={styles.select} value={draft.appliesTo} onChange={(e) => setDraft({ ...draft, appliesTo: e.target.value as DiscountItem['appliesTo'] })}><option value="UnitPrice">Applies to UnitPrice</option><option value="LineTotal">Applies to LineTotal</option></select>
        <button type="button" className={styles.secondaryAction} onClick={resetDraft}>Clear</button>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onBack}>Back</button>
        <button type="button" className={styles.registerButton} onClick={onNext}>Next</button>
      </div>
    </section>
  );
}
