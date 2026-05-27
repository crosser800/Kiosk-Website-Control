import { useEffect, useState } from 'react';
import {
  type DeliveryTermInput,
  type DeliveryTermStatus,
  addDeliveryTermOption,
  getDeliveryTermItems,
  removeDeliveryTermOption,
  subscribeDeliveryTermItems,
  updateDeliveryTermOption,
} from '../../services/deliveryTerms';
import styles from './DeliveryTerms.module.css';

const emptyTerm: DeliveryTermInput = {
  name: '',
  code: '',
  deliveryDays: '',
  description: '',
  status: 'active',
};

export default function DeliveryTerms() {
  const [terms, setTerms] = useState(() => getDeliveryTermItems());
  const [form, setForm] = useState<DeliveryTermInput>(emptyTerm);
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => subscribeDeliveryTermItems(setTerms), []);

  function updateField<Field extends keyof DeliveryTermInput>(
    field: Field,
    value: DeliveryTermInput[Field],
  ) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
  }

  function resetForm() {
    setForm(emptyTerm);
    setEditingId('');
    setError('');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextTerm = {
      ...form,
      name: form.name.trim(),
      code: form.code.trim(),
      deliveryDays: form.deliveryDays.trim(),
      description: form.description.trim(),
    };

    if (!nextTerm.name || !nextTerm.code || !nextTerm.deliveryDays || !nextTerm.description) {
      setError('Complete all delivery term fields.');
      return;
    }

    if (Number(nextTerm.deliveryDays) < 1) {
      setError('Delivery days must be at least 1.');
      return;
    }

    const hasDuplicate = terms.some(
      (term) =>
        term.id !== editingId &&
        (term.name.toLowerCase() === nextTerm.name.toLowerCase() ||
          term.code.toLowerCase() === nextTerm.code.toLowerCase()),
    );

    if (hasDuplicate) {
      setError('This delivery term name or code already exists.');
      return;
    }

    setTerms(
      editingId
        ? updateDeliveryTermOption(editingId, nextTerm)
        : addDeliveryTermOption(nextTerm),
    );
    resetForm();
  }

  function startEdit(termId: string) {
    const selectedTerm = terms.find((term) => term.id === termId);

    if (!selectedTerm) {
      return;
    }

    setEditingId(selectedTerm.id);
    setForm({
      name: selectedTerm.name,
      code: selectedTerm.code,
      deliveryDays: selectedTerm.deliveryDays,
      description: selectedTerm.description,
      status: selectedTerm.status,
    });
    setError('');
  }

  function getStatusClass(status: DeliveryTermStatus) {
    return status === 'active' ? styles.statusActive : styles.statusInactive;
  }

  return (
    <section className={styles.panel} aria-labelledby="delivery-terms-title">
      <div className={styles.header}>
        <div>
          <h2 id="delivery-terms-title" className={styles.title}>
            Delivery Terms
          </h2>
          <p className={styles.subtitle}>Customize the Terms dropdown for orders.</p>
        </div>
      </div>

      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.field}>
          <span className={styles.label}>Terms name</span>
          <input
            type="text"
            value={form.name}
            onChange={(event) => updateField('name', event.target.value)}
            placeholder="Cash on Delivery"
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Code</span>
          <input
            type="text"
            value={form.code}
            onChange={(event) => updateField('code', event.target.value.toUpperCase())}
            placeholder="COD"
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Delivery days</span>
          <input
            type="number"
            min="1"
            step="1"
            value={form.deliveryDays}
            onChange={(event) => updateField('deliveryDays', event.target.value)}
            placeholder="7"
            className={styles.input}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Status</span>
          <select
            value={form.status}
            onChange={(event) => updateField('status', event.target.value as DeliveryTermStatus)}
            className={`${styles.input} ${styles.select} ${getStatusClass(form.status)}`}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>

        <label className={`${styles.field} ${styles.descriptionField}`}>
          <span className={styles.label}>Description</span>
          <textarea
            value={form.description}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Describe the delivery term"
            className={styles.textarea}
          />
        </label>

        <div className={styles.formActions}>
          <button type="submit" className={styles.addButton}>
            <i className={`fa-solid ${editingId ? 'fa-check' : 'fa-plus'}`} aria-hidden="true"></i>
            <span>{editingId ? 'Save' : 'Add'}</span>
          </button>
          {editingId && (
            <button type="button" className={styles.cancelEditButton} onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.list} aria-live="polite">
        {terms.length > 0 ? (
          terms.map((term) => (
            <div key={term.id} className={styles.item}>
              <div className={styles.termMain}>
                <span className={styles.termName}>{term.name}</span>
                <span className={styles.termDescription}>{term.description}</span>
              </div>
              <span className={styles.termCode}>{term.code}</span>
              <span className={styles.termDate}>
                {term.deliveryDays} {Number(term.deliveryDays) === 1 ? 'day' : 'days'}
              </span>
              <span className={`${styles.statusBadge} ${getStatusClass(term.status)}`}>
                {term.status}
              </span>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => startEdit(term.id)}
                aria-label={`Edit ${term.name}`}
              >
                <i className="fa-solid fa-pen" aria-hidden="true"></i>
              </button>
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => setTerms(removeDeliveryTermOption(term.id))}
                aria-label={`Remove ${term.name}`}
              >
                <i className="fa-solid fa-trash" aria-hidden="true"></i>
              </button>
            </div>
          ))
        ) : (
          <p className={styles.empty}>No delivery terms added yet.</p>
        )}
      </div>
    </section>
  );
}
