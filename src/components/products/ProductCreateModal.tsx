import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import BasicInformation from './addProducts/BasicInformation';
import type { ProductFormState } from './addProducts/types';
import styles from './ProductCreateModal.module.css';

type OptionItem = { id: string; label: string };

type ProductCreateModalProps = {
  initialCategoryId?: string | null;
  onClose: () => void;
  onCreated: (productId: string, categoryId: string) => void;
};

const initialFormState: ProductFormState = {
  productName: '',
  skuCode: '',
  categoryId: '',
  brandId: '',
  description: '',
  status: 'Active',
};

export default function ProductCreateModal({
  initialCategoryId = null,
  onClose,
  onCreated,
}: ProductCreateModalProps) {
  const [formValues, setFormValues] = useState<ProductFormState>({
    ...initialFormState,
    categoryId: initialCategoryId ?? '',
  });
  const [categories, setCategories] = useState<OptionItem[]>([]);
  const [brands, setBrands] = useState<OptionItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let mounted = true;

    const loadLookups = async () => {
      setIsLoading(true);
      const [{ data: categoryRows, error: categoryError }, { data: brandRows, error: brandError }] =
        await Promise.all([
          supabase
            .from('product_categories')
            .select('id, category_title, status')
            .order('category_title'),
          supabase.from('brands').select('id, brand_name, status').order('brand_name'),
        ]);

      if (!mounted) {
        return;
      }

      if (categoryError || brandError) {
        setErrorMessage(categoryError?.message ?? brandError?.message ?? 'Failed to load form data.');
        setIsLoading(false);
        return;
      }

      setCategories(
        (categoryRows ?? []).map((row) => ({
          id: String(row.id),
          label: `${String(row.category_title ?? '')}${
            String(row.status ?? '').toLowerCase() === 'inactive' ? ' (Inactive)' : ''
          }`,
        })),
      );
      setBrands(
        (brandRows ?? []).map((row) => ({
          id: String(row.id),
          label: `${String(row.brand_name ?? '')}${
            String(row.status ?? '').toLowerCase() === 'inactive' ? ' (Inactive)' : ''
          }`,
        })),
      );
      setIsLoading(false);
    };

    void loadLookups();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleCreate() {
    if (
      !formValues.productName ||
      !formValues.skuCode ||
      !formValues.categoryId ||
      !formValues.brandId ||
      !formValues.description
    ) {
      setErrorMessage('Please complete required basic information fields.');
      return;
    }

    setIsSaving(true);
    setErrorMessage('');

    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          product_name: formValues.productName,
          sku_code: formValues.skuCode,
          category_id: formValues.categoryId,
          brand_id: formValues.brandId,
          description: formValues.description,
          status: formValues.status,
        })
        .select('id')
        .single();

      if (error || !data) {
        throw new Error(error?.message ?? 'Failed to create product.');
      }

      onCreated(String(data.id), formValues.categoryId);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to create product.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className={styles.overlay}>
      <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="create-product-title">
        <div className={styles.header}>
          <div>
            <h2 id="create-product-title" className={styles.title}>Add Product</h2>
            <p className={styles.subtitle}>Create the product first, then continue with images and variations.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close add product modal">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {isLoading ? (
          <div className={styles.skeletonWrap} aria-hidden="true">
            <div className={styles.skeletonGrid}>
              <div className={styles.skeletonField}>
                <div className={styles.skeletonLabel}></div>
                <div className={styles.skeletonInput}></div>
              </div>
              <div className={styles.skeletonField}>
                <div className={styles.skeletonLabel}></div>
                <div className={styles.skeletonInput}></div>
              </div>
              <div className={styles.skeletonField}>
                <div className={styles.skeletonLabel}></div>
                <div className={styles.skeletonInput}></div>
              </div>
              <div className={styles.skeletonField}>
                <div className={styles.skeletonLabel}></div>
                <div className={styles.skeletonInput}></div>
              </div>
              <div className={`${styles.skeletonField} ${styles.skeletonFieldWide}`}>
                <div className={styles.skeletonLabel}></div>
                <div className={styles.skeletonTextarea}></div>
              </div>
            </div>

            <div className={styles.skeletonFooter}>
              <div className={styles.skeletonStatus}>
                <div className={styles.skeletonLabel}></div>
                <div className={styles.skeletonInput}></div>
              </div>
              <div className={styles.skeletonActions}>
                <div className={styles.skeletonButtonMuted}></div>
                <div className={styles.skeletonButtonPrimary}></div>
              </div>
            </div>
          </div>
        ) : null}
        {errorMessage ? <p className={styles.error}>{errorMessage}</p> : null}

        {!isLoading ? (
          <BasicInformation
            onCancel={onClose}
            onNext={() => void handleCreate()}
            nextLabel={isSaving ? 'Saving...' : 'Save'}
            value={formValues}
            onChange={setFormValues}
            categories={categories}
            brands={brands}
          />
        ) : null}
      </section>
    </div>
  );
}
