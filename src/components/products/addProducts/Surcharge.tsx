import { useState } from 'react';
import styles from './VarAndPrice.module.css';
import type { SurchargeItem } from './types';

type SurchargeProps = {
  onBack: () => void;
  onSubmit: () => void;
  items: SurchargeItem[];
  onChange: (items: SurchargeItem[]) => void;
  isSaving: boolean;
};

const emptySurcharge: SurchargeItem = {
  id: '',
  linkedDiscountId: '',
  linkedDiscountClassId: '',
  variationId: '',
  surchargeName: '',
  surchargeType: 'Amount',
  amount: '',
  freeQuantity: '0',
  minQuantity: '1',
  maxQuantity: '',
  branchName: '',
  priceType: '',
  priceCode: '',
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
  rewardUnitCode: '',
  rewardQuantity: '0',
  rewardLabel: '',
  unitRuleLabel: '',
  unitRuleNotes: '',
  rewardTargetType: 'same_item',
  rewardProductId: '',
  rewardVariationId: '',
  rewardUnitOptionId: '',
  rewardRepeatMode: 'one_time',
  rewardEveryQuantity: '',
  qualificationScope: 'line',
};

export default function Surcharge({ onBack, onSubmit, items, onChange, isSaving }: SurchargeProps) {
  const [draft, setDraft] = useState<SurchargeItem>(emptySurcharge);
  const [editingId, setEditingId] = useState<string | null>(null);

  function resetDraft() {
    setDraft(emptySurcharge);
    setEditingId(null);
  }

  function saveItem() {
    if (!draft.surchargeName) return;
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
        <h3 className={styles.title}>Promo / Freebie</h3>
        <button type="button" className={styles.addButton} onClick={saveItem}>{editingId ? 'Update Promo' : 'Add Promo'}</button>
      </div>
      <div className={styles.itemsContainer}>
        <div className={styles.tableHeader}>
          <span>Name</span><span>Type</span><span>Amount</span><span>Free Qty</span><span>Min Qty</span><span>Max Qty</span><span>Branch</span><span>Price Type</span><span>Code</span><span>Action</span>
        </div>
        {items.length === 0 ? (
          <div className={styles.emptyState}>No promo/freebie rules yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.tableRow}>
              <span>{item.surchargeName}</span><span>{item.surchargeType}</span><span>{item.amount || '-'}</span><span>{item.freeQuantity}</span><span>{item.minQuantity}</span><span>{item.maxQuantity || '-'}</span><span>{item.branchName || '-'}</span><span>{item.priceType || '-'}</span><span>{item.priceCode || '-'}</span>
              <div className={styles.actionCell}>
                <button type="button" className={styles.secondaryAction} onClick={() => editItem(item.id)}>Edit</button>
                <button type="button" className={styles.deleteAction} onClick={() => deleteItem(item.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>
      <div className={styles.previewRow}>
        <input className={styles.input} placeholder="Promo Name" value={draft.surchargeName} onChange={(e) => setDraft({ ...draft, surchargeName: e.target.value })} />
        <select className={styles.select} value={draft.surchargeType} onChange={(e) => setDraft({ ...draft, surchargeType: e.target.value as SurchargeItem['surchargeType'] })}><option value="Amount">Amount</option><option value="Percent">Percent</option><option value="Freebie">Freebie</option><option value="BonusQty">BonusQty</option></select>
        <input className={styles.input} placeholder="Amount/Percent" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
        <input className={styles.input} placeholder="Free Qty" value={draft.freeQuantity} onChange={(e) => setDraft({ ...draft, freeQuantity: e.target.value })} />
        <input className={styles.input} placeholder="Min Qty" value={draft.minQuantity} onChange={(e) => setDraft({ ...draft, minQuantity: e.target.value })} />
        <input className={styles.input} placeholder="Max Qty" value={draft.maxQuantity} onChange={(e) => setDraft({ ...draft, maxQuantity: e.target.value })} />
        <select className={styles.select} value={draft.branchName} onChange={(e) => setDraft({ ...draft, branchName: e.target.value as SurchargeItem['branchName'] })}><option value="">Branch</option><option value="Manila">Manila</option><option value="Cebu">Cebu</option><option value="Both">Both</option></select>
        <select className={styles.select} value={draft.priceType} onChange={(e) => setDraft({ ...draft, priceType: e.target.value as SurchargeItem['priceType'] })}><option value="">Price Type</option><option value="Retail">Retail</option><option value="Wholesale">Wholesale</option><option value="Special">Special</option><option value="Concept Store">Concept Store</option></select>
        <select className={styles.select} value={draft.priceCode} onChange={(e) => setDraft({ ...draft, priceCode: e.target.value as SurchargeItem['priceCode'] })}><option value="">Price Code</option><option value="R1">R1</option><option value="R2">R2</option><option value="W1">W1</option><option value="W2">W2</option><option value="SP">SP</option><option value="CP">CP</option></select>
        <button type="button" className={styles.secondaryAction} onClick={resetDraft}>Clear</button>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onBack}>Back</button>
        <button type="button" className={styles.registerButton} onClick={onSubmit} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Register'}
        </button>
      </div>
    </section>
  );
}
