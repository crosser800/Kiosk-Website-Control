import { useState } from 'react';
import styles from './VarAndPrice.module.css';

type VarAndPriceProps = {
  onCancel: () => void;
};

type VariationItem = {
  id: string;
  group: string;
  variation: string;
  branch: string;
  price: string;
  skuCode: string;
  availability: string;
};

function formatPriceInput(value: string) {
  const sanitizedValue = value.replace(/[^\d.]/g, '');
  const [rawInteger = '', rawDecimal = ''] = sanitizedValue.split('.');
  const normalizedInteger = rawInteger.replace(/^0+(?=\d)/, '') || '0';
  const formattedInteger = Number(normalizedInteger).toLocaleString('en-US');
  const limitedDecimal = rawDecimal.slice(0, 2);

  if (sanitizedValue.includes('.')) {
    return `${formattedInteger}.${limitedDecimal}`;
  }

  return formattedInteger;
}

function formatPriceForDisplay(value: string) {
  const numericValue = Number(value.replace(/,/g, ''));

  if (Number.isNaN(numericValue) || value.trim() === '') {
    return '-';
  }

  return numericValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.editIcon}>
      <path
        d="M4 20h4l10-10-4-4L4 16v4z"
        fill="none"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M12 6l4 4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export default function VarAndPrice({ onCancel }: VarAndPriceProps) {
  const [group, setGroup] = useState('');
  const [variation, setVariation] = useState('');
  const [branch, setBranch] = useState('');
  const [price, setPrice] = useState('');
  const [skuCode, setSkuCode] = useState('');
  const [availability, setAvailability] = useState('');
  const [items, setItems] = useState<VariationItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handlePriceChange(value: string) {
    const sanitizedValue = value.replace(/[^\d.]/g, '');
    const decimalParts = sanitizedValue.split('.');

    if (decimalParts.length > 2) {
      return;
    }

    setPrice(formatPriceInput(value));
  }

  function handleAddVariation() {
    const nextItem: VariationItem = {
      id: editingId ?? crypto.randomUUID(),
      group,
      variation,
      branch,
      price,
      skuCode,
      availability,
    };

    setItems((currentItems) => {
      if (editingId) {
        return currentItems.map((item) =>
          item.id === editingId ? nextItem : item,
        );
      }

      return [...currentItems, nextItem];
    });

    setGroup('');
    setVariation('');
    setBranch('');
    setPrice('');
    setSkuCode('');
    setAvailability('');
    setEditingId(null);
  }

  function handleEdit(itemId: string) {
    const selectedItem = items.find((item) => item.id === itemId);

    if (!selectedItem) {
      return;
    }

    setGroup(selectedItem.group);
    setVariation(selectedItem.variation);
    setBranch(selectedItem.branch);
    setPrice(selectedItem.price);
    setSkuCode(selectedItem.skuCode);
    setAvailability(selectedItem.availability);
    setEditingId(selectedItem.id);
  }

  return (
    <section className={styles.wrapper}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.title}>Variations</h3>

        <button
          type="button"
          className={styles.addButton}
          onClick={handleAddVariation}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.addIcon}>
            <path
              d="M12 5.25a.75.75 0 0 1 .75.75v5.25H18a.75.75 0 0 1 0 1.5h-5.25V18a.75.75 0 0 1-1.5 0v-5.25H6a.75.75 0 0 1 0-1.5h5.25V6a.75.75 0 0 1 .75-.75z"
              fill="currentColor"
            />
          </svg>
          Add Variation
        </button>
      </div>

      <div className={styles.itemsContainer}>
        <div className={styles.tableHeader}>
          <span>Group</span>
          <span>Variation</span>
          <span>Branch</span>
          <span>Price (PHP)</span>
          <span>SKU/Code</span>
          <span>Availability</span>
          <span>Action</span>
        </div>

        {items.length === 0 ? (
          <div className={styles.emptyState}>
            Variation rows will appear here once the separate variation screen is connected.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className={styles.tableRow}>
              <span className={styles.value}>{item.group || '-'}</span>
              <span className={styles.value}>{item.variation || '-'}</span>
              <span className={styles.value}>{item.branch || '-'}</span>
              <span className={styles.value}>{formatPriceForDisplay(item.price)}</span>
              <span className={styles.value}>{item.skuCode || '-'}</span>
              <span className={styles.value}>{item.availability || '-'}</span>
              <button
                type="button"
                className={styles.editButton}
                onClick={() => handleEdit(item.id)}
                aria-label="Edit variation"
              >
                <EditIcon />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={styles.previewRow}>
        <select
          className={styles.select}
          value={group}
          onChange={(event) => setGroup(event.target.value)}
        >
          <option value=""></option>
        </select>

        <select
          className={styles.select}
          value={variation}
          onChange={(event) => setVariation(event.target.value)}
        >
          <option value=""></option>
        </select>

        <select
          className={styles.select}
          value={branch}
          onChange={(event) => setBranch(event.target.value)}
        >
          <option value=""></option>
        </select>

        <input
          type="text"
          inputMode="decimal"
          className={styles.input}
          placeholder="0.00"
          value={price}
          onChange={(event) => handlePriceChange(event.target.value)}
        />

        <input
          type="text"
          className={styles.input}
          placeholder="ENTER CODE"
          value={skuCode}
          onChange={(event) => setSkuCode(event.target.value.toUpperCase())}
        />

        <select
          className={styles.select}
          value={availability}
          onChange={(event) => setAvailability(event.target.value)}
        >
          <option value=""></option>
          <option value="available">Available</option>
          <option value="unavailable">Unavailable</option>
        </select>

        <div className={styles.actionPlaceholder}>-</div>
      </div>

      <div className={styles.actions}>
        <button type="button" className={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className={styles.registerButton}>
          Register
        </button>
      </div>
    </section>
  );
}
