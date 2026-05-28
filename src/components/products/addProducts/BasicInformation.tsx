import styles from './BasicInformation.module.css';
import type { ProductFormState } from './types';

type OptionItem = {
  id: string;
  label: string;
};

type BasicInformationProps = {
  onCancel: () => void;
  onNext: () => void;
  value: ProductFormState;
  categories: OptionItem[];
  brands: OptionItem[];
  onChange: (next: ProductFormState) => void;
};

export default function BasicInformation({ onCancel, onNext, value, categories, brands, onChange }: BasicInformationProps) {
  const statusClass =
    value.status === 'Active'
      ? styles.statusActive
      : value.status === 'Inactive'
        ? styles.statusInactive
        : '';

  function handleFieldChange(field: keyof ProductFormState, fieldValue: string) {
    onChange({ ...value, [field]: fieldValue } as ProductFormState);
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
            value={value.productName}
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
            value={value.brandId}
            onChange={(event) => handleFieldChange('brandId', event.target.value)}
            className={styles.select}
            required
          >
            <option value="">Select brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.label}
              </option>
            ))}
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
            value={value.skuCode}
            onChange={(event) => handleFieldChange('skuCode', event.target.value.toUpperCase())}
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
            value={value.categoryId}
            onChange={(event) => handleFieldChange('categoryId', event.target.value)}
            className={styles.select}
            required
          >
            <option value="">Select category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
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
            value={value.description}
            onChange={(event) => handleFieldChange('description', event.target.value)}
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
            value={value.status}
            onChange={(event) => handleFieldChange('status', event.target.value as 'Active' | 'Inactive')}
            className={`${styles.select} ${statusClass}`}
          >
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.cancelButton} onClick={onCancel}>
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
