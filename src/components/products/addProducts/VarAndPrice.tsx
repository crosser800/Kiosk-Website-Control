import { useEffect, useState } from 'react';
import { getBranchTypeOptions, subscribeBranchTypeOptions } from '../../../services/branchTypes';
import styles from './VarAndPrice.module.css';
import type { VariationItem } from './types';

type VarAndPriceProps = {
  onBack: () => void;
  onNext: () => void;
  items: VariationItem[];
  onChange: (items: VariationItem[]) => void;
};

function formatPriceInput(value: string) {
  const sanitizedValue = value.replace(/[^\d.]/g, '');
  const [rawInteger = '', rawDecimal = ''] = sanitizedValue.split('.');
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = Number(normalizedInteger).toLocaleString('en-US');
  const limitedDecimal = rawDecimal.slice(0, 2);
  return sanitizedValue.includes('.') ? `${formattedInteger}.${limitedDecimal}` : formattedInteger;
}

function formatPriceForDisplay(value: string) {
  const numericValue = Number(value.replace(/,/g, ''));
  if (Number.isNaN(numericValue) || value.trim() === '') return '-';
  return numericValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function VarAndPrice({ onBack, onNext, items, onChange }: VarAndPriceProps) {
  const [draft, setDraft] = useState<VariationItem>({
    id: '',
    priceType: '',
    variationName: '',
    className: '',
    priceCode: '',
    branchName: '',
    price: '',
    skuCode: '',
    availability: '',
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [branchOptions, setBranchOptions] = useState<string[]>(() => getBranchTypeOptions());

  useEffect(() => subscribeBranchTypeOptions(setBranchOptions), []);

  function resetDraft() {
    setDraft({ id: '', priceType: '', variationName: '', className: '', priceCode: '', branchName: '', price: '', skuCode: '', availability: '' });
    setEditingId(null);
  }

  function handleSaveVariation() {
    if (!draft.priceType || !draft.className || !draft.branchName || !draft.price || !draft.skuCode || !draft.availability) {
      return;
    }

    const nextItem: VariationItem = { ...draft, id: editingId ?? crypto.randomUUID() };
    const nextItems = editingId ? items.map((item) => (item.id === editingId ? nextItem : item)) : [...items, nextItem];
    onChange(nextItems);
    resetDraft();
  }

  function handleEdit(itemId: string) {
    const selected = items.find((item) => item.id === itemId);
    if (!selected) return;
    setDraft(selected);
    setEditingId(selected.id);
  }

  function handleDelete(itemId: string) {
    onChange(items.filter((item) => item.id !== itemId));
    if (editingId === itemId) resetDraft();
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Variations</h3>
        <button type="button" className={styles.addButton} onClick={handleSaveVariation}>{editingId ? 'Update Variation' : 'Add Variation'}</button>
      </div>

      <div className={styles.itemsContainer}>
        <div className={styles.tableHeader}>
          <span>Type</span><span>Variation</span><span>Class</span><span>Branch</span><span>Price</span><span>SKU</span><span>Availability</span><span>Code</span><span>Action</span>
        </div>

        {items.length === 0 ? (
          <div className={styles.emptyState}>No variations yet.</div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.tableRow}>
              <span className={styles.value}>{item.priceType}</span>
              <span className={styles.value}>{item.variationName || '-'}</span>
              <span className={styles.value}>{item.className}</span>
              <span className={styles.value}>{item.branchName}</span>
              <span className={styles.value}>{formatPriceForDisplay(item.price)}</span>
              <span className={styles.value}>{item.skuCode}</span>
              <span className={styles.value}>{item.availability}</span>
              <span className={styles.value}>{item.priceCode || '-'}</span>
              <div className={styles.actionCell}>
                <button type="button" className={styles.secondaryAction} onClick={() => handleEdit(item.id)}>Edit</button>
                <button type="button" className={styles.deleteAction} onClick={() => handleDelete(item.id)}>Delete</button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className={styles.previewRow}>
        <select className={styles.select} value={draft.priceType} onChange={(e) => setDraft({ ...draft, priceType: e.target.value as VariationItem['priceType'] })}>
          <option value="">Price Type</option><option value="Retail">Retail</option><option value="Wholesale">Wholesale</option>
        </select>
        <input type="text" className={styles.input} placeholder="Variation Name" value={draft.variationName} onChange={(e) => setDraft({ ...draft, variationName: e.target.value })} />
        <input type="text" className={styles.input} placeholder="Class Name" value={draft.className} onChange={(e) => setDraft({ ...draft, className: e.target.value })} />
        <select className={styles.select} value={draft.branchName} onChange={(e) => setDraft({ ...draft, branchName: e.target.value as VariationItem['branchName'] })}>
          <option value="">Branch</option>
          {branchOptions.map((branchOption) => (
            <option key={branchOption} value={branchOption}>{branchOption}</option>
          ))}
        </select>
        <input type="text" className={styles.input} placeholder="0.00" value={draft.price} onChange={(e) => setDraft({ ...draft, price: formatPriceInput(e.target.value) })} />
        <input type="text" className={styles.input} placeholder="SKU" value={draft.skuCode} onChange={(e) => setDraft({ ...draft, skuCode: e.target.value.toUpperCase() })} />
        <select className={styles.select} value={draft.availability} onChange={(e) => setDraft({ ...draft, availability: e.target.value as VariationItem['availability'] })}>
          <option value="">Availability</option><option value="Available">Available</option><option value="Unavailable">Unavailable</option>
        </select>
        <select className={styles.select} value={draft.priceCode} onChange={(e) => setDraft({ ...draft, priceCode: e.target.value as VariationItem['priceCode'] })}>
          <option value="">Price Code</option><option value="R1">R1</option><option value="R2">R2</option><option value="W1">W1</option><option value="W2">W2</option>
        </select>
        <button type="button" className={styles.secondaryAction} onClick={resetDraft}>Clear</button>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onBack}>Back</button>
        <button type="button" className={styles.registerButton} onClick={onNext}>Next</button>
      </div>
    </section>
  );
}
