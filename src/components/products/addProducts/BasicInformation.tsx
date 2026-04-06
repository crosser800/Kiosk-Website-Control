import { useState } from 'react';
import styles from './BasicInformation.module.css';

type BasicInformationProps = {
  onCancel: () => void;
  onNext: () => void;
};

type ProductFormState = {
  productName: string;
  skuCode: string;
  category: string;
  brand: string;
  description: string;
  status: string;
};

const initialFormState: ProductFormState = {
  productName: '',
  skuCode: '',
  category: '',
  brand: '',
  description: '',
  status: '',
};

export default function BasicInformation({
  onCancel,
  onNext,
}: BasicInformationProps) {
  const [formValues, setFormValues] = useState(initialFormState);

  function handleFieldChange(
    field: keyof ProductFormState,
    value: string,
  ) {
    setFormValues((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <form className={styles.form} onSubmit={(event) => event.preventDefault()}>
      <div className={styles.grid}>
        <div className={styles.field}>
          <label htmlFor="product-name" className={styles.label}>
            Product Name<span className={styles.required}>*</span>
          </label>
          <input
            id="product-name"
            type="text"
            placeholder="Enter Name"
            value={formValues.productName}
            onChange={(event) => handleFieldChange('productName', event.target.value)}
            className={styles.input}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="brand" className={styles.label}>
            Brand<span className={styles.required}>*</span>
          </label>
          <select
            id="brand"
            value={formValues.brand}
            onChange={(event) => handleFieldChange('brand', event.target.value)}
            className={styles.select}
            required
          >
            <option value=""></option>
          </select>
        </div>

        <div className={styles.field}>
          <label htmlFor="sku-code" className={styles.label}>
            SKU/ Code<span className={styles.required}>*</span>
          </label>
          <input
            id="sku-code"
            type="text"
            placeholder="Enter Code"
            value={formValues.skuCode}
            onChange={(event) => handleFieldChange('skuCode', event.target.value)}
            className={styles.input}
            required
          />
        </div>

        <div className={styles.field}>
          <label htmlFor="category" className={styles.label}>
            Category<span className={styles.required}>*</span>
          </label>
          <select
            id="category"
            value={formValues.category}
            onChange={(event) => handleFieldChange('category', event.target.value)}
            className={styles.select}
            required
          >
            <option value=""></option>
          </select>
        </div>

        <div className={`${styles.field} ${styles.descriptionField}`}>
          <label htmlFor="description" className={styles.label}>
            Description<span className={styles.required}>*</span>
          </label>
          <textarea
            id="description"
            placeholder="Enter Description"
            rows={3}
            value={formValues.description}
            onChange={(event) =>
              handleFieldChange('description', event.target.value)
            }
            className={styles.textarea}
            required
          />
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.statusField}>
          <label htmlFor="status" className={styles.label}>
            Status
          </label>
          <select
            id="status"
            value={formValues.status}
            onChange={(event) => handleFieldChange('status', event.target.value)}
            className={styles.select}
          >
            <option value="">Select Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.cancelButton}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className={styles.nextButton} onClick={onNext}>
            Next
          </button>
        </div>
      </div>
    </form>
  );
}
