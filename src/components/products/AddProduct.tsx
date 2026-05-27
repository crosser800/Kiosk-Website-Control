import { useEffect, useMemo, useState } from 'react';
import styles from './AddProduct.module.css';
import BasicInformation from './addProducts/BasicInformation';
import Media from './addProducts/Media';
import VarAndPrice from './addProducts/VarAndPrice';
import Discount from './addProducts/Discount';
import Surcharge from './addProducts/Surcharge';
import { supabase } from '../../lib/supabase';
import type { DiscountItem, MediaItem, ProductFormState, SurchargeItem, VariationItem } from './addProducts/types';

type AddProductSection = 'Basic Information' | 'Images' | 'Variation & Pricing' | 'Discount' | 'Surcharge';

type AddProductProps = {
  onCancel: () => void;
  editProductId?: string | null;
};

type OptionItem = { id: string; label: string };

const sections: AddProductSection[] = ['Basic Information', 'Images', 'Variation & Pricing', 'Discount', 'Surcharge'];

const initialFormState: ProductFormState = {
  productName: '',
  skuCode: '',
  categoryId: '',
  brandId: '',
  description: '',
  status: 'Active',
};

const mediaBucket = import.meta.env.VITE_SUPABASE_PRODUCT_MEDIA_BUCKET ?? 'product-media';

export default function AddProduct({ onCancel, editProductId }: AddProductProps) {
  const [activeSection, setActiveSection] = useState<AddProductSection>('Basic Information');
  const [formValues, setFormValues] = useState<ProductFormState>(initialFormState);
  const [categories, setCategories] = useState<OptionItem[]>([]);
  const [brands, setBrands] = useState<OptionItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [mainMediaId, setMainMediaId] = useState<string | null>(null);
  const [variations, setVariations] = useState<VariationItem[]>([]);
  const [discounts, setDiscounts] = useState<DiscountItem[]>([]);
  const [surcharges, setSurcharges] = useState<SurchargeItem[]>([]);
  const [loadedExistingMediaIds, setLoadedExistingMediaIds] = useState<string[]>([]);
  const [loadedExistingMediaItems, setLoadedExistingMediaItems] = useState<MediaItem[]>([]);
  const [submitError, setSubmitError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProduct, setIsLoadingProduct] = useState(false);

  const isEditMode = useMemo(() => Boolean(editProductId), [editProductId]);

  useEffect(() => {
    const loadLookups = async () => {
      const [{ data: categoryRows }, { data: brandRows }] = await Promise.all([
        supabase.from('product_categories').select('id, category_title').eq('status', 'Active').order('category_title'),
        supabase.from('brands').select('id, brand_name').eq('status', 'Active').order('brand_name'),
      ]);

      setCategories((categoryRows ?? []).map((row) => ({ id: row.id as string, label: row.category_title as string })));
      setBrands((brandRows ?? []).map((row) => ({ id: row.id as string, label: row.brand_name as string })));
    };

    void loadLookups();
  }, []);

  useEffect(() => {
    const loadProductForEdit = async () => {
      if (!editProductId) {
        setFormValues(initialFormState);
        setMediaItems([]);
        setMainMediaId(null);
        setVariations([]);
        setDiscounts([]);
        setSurcharges([]);
        setLoadedExistingMediaIds([]);
        setLoadedExistingMediaItems([]);
        return;
      }

      setIsLoadingProduct(true);
      setSubmitError('');

      const [productRes, mediaRes, variationRes, discountRes, surchargeRes] = await Promise.all([
        supabase.from('products').select('id, product_name, sku_code, category_id, brand_id, description, status').eq('id', editProductId).single(),
        supabase.from('product_media').select('id, media_url, media_type, media_path, is_primary').eq('product_id', editProductId).order('sort_order', { ascending: true }),
        supabase.from('product_variations').select('id, price_type, variation_name, class_name, price_code, branch_name, price, sku_code, availability').eq('product_id', editProductId).order('sort_order', { ascending: true }),
        supabase.from('product_discounts').select('id, discount_name, discount_type, discount_percent, amount, min_quantity, max_quantity, branch_name, price_type, price_code').eq('product_id', editProductId).order('priority', { ascending: true }),
        supabase.from('product_surcharges').select('id, surcharge_name, surcharge_type, surcharge_percent, amount, free_quantity, min_quantity, max_quantity, branch_name, price_type, price_code').eq('product_id', editProductId).order('priority', { ascending: true }),
      ]);

      if (productRes.error || !productRes.data) {
        setSubmitError(productRes.error?.message ?? 'Failed to load product details.');
        setIsLoadingProduct(false);
        return;
      }

      setFormValues({
        productName: String(productRes.data.product_name ?? ''),
        skuCode: String(productRes.data.sku_code ?? ''),
        categoryId: String(productRes.data.category_id ?? ''),
        brandId: String(productRes.data.brand_id ?? ''),
        description: String(productRes.data.description ?? ''),
        status: (productRes.data.status as 'Active' | 'Inactive') ?? 'Active',
      });

      const mappedMedia: MediaItem[] = (mediaRes.data ?? []).map((row) => ({
        id: String(row.id),
        fileName: String(row.media_path ?? row.media_url ?? 'Media'),
        previewUrl: String(row.media_url ?? ''),
        type: (row.media_type as 'image' | 'video') ?? 'image',
        isExisting: true,
        mediaPath: row.media_path ? String(row.media_path) : null,
      }));
      setMediaItems(mappedMedia);
      setLoadedExistingMediaIds(mappedMedia.map((item) => item.id));
      setLoadedExistingMediaItems(mappedMedia);
      setMainMediaId((mediaRes.data ?? []).find((row) => row.is_primary)?.id ?? mappedMedia[0]?.id ?? null);

      const mappedVariations: VariationItem[] = (variationRes.data ?? []).map((row) => ({
        id: String(row.id),
        priceType: (row.price_type as VariationItem['priceType']) ?? '',
        variationName: String(row.variation_name ?? ''),
        className: String(row.class_name ?? ''),
        priceCode: (row.price_code as VariationItem['priceCode']) ?? '',
        branchName: (row.branch_name as VariationItem['branchName']) ?? '',
        price: row.price ? Number(row.price).toLocaleString('en-US') : '',
        skuCode: String(row.sku_code ?? ''),
        availability: (row.availability as VariationItem['availability']) ?? '',
      }));
      setVariations(mappedVariations);

      const mappedDiscounts: DiscountItem[] = (discountRes.data ?? []).map((row) => ({
        id: String(row.id),
        discountName: String(row.discount_name ?? ''),
        discountType: (row.discount_type as DiscountItem['discountType']) ?? 'Percent',
        amount: String(row.discount_type === 'Percent' ? row.discount_percent ?? '' : row.amount ?? ''),
        minQuantity: String(row.min_quantity ?? '1'),
        maxQuantity: String(row.max_quantity ?? ''),
        branchName: (row.branch_name as DiscountItem['branchName']) ?? '',
        priceType: (row.price_type as DiscountItem['priceType']) ?? '',
        priceCode: (row.price_code as DiscountItem['priceCode']) ?? '',
      }));
      setDiscounts(mappedDiscounts);

      const mappedSurcharges: SurchargeItem[] = (surchargeRes.data ?? []).map((row) => ({
        id: String(row.id),
        surchargeName: String(row.surcharge_name ?? ''),
        surchargeType: (row.surcharge_type as SurchargeItem['surchargeType']) ?? 'Amount',
        amount: String(row.surcharge_type === 'Percent' ? row.surcharge_percent ?? '' : row.amount ?? ''),
        freeQuantity: String(row.free_quantity ?? '0'),
        minQuantity: String(row.min_quantity ?? '1'),
        maxQuantity: String(row.max_quantity ?? ''),
        branchName: (row.branch_name as SurchargeItem['branchName']) ?? '',
        priceType: (row.price_type as SurchargeItem['priceType']) ?? '',
        priceCode: (row.price_code as SurchargeItem['priceCode']) ?? '',
      }));
      setSurcharges(mappedSurcharges);

      setIsLoadingProduct(false);
    };

    void loadProductForEdit();
  }, [editProductId]);

  const handleBack = () => {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex > 0) setActiveSection(sections[currentIndex - 1]);
  };

  const handleNext = () => {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex < sections.length - 1) setActiveSection(sections[currentIndex + 1]);
  };

  const parseNumber = (value: string) => Number(value.replace(/,/g, '')) || 0;

  async function handleRegister() {
    if (!formValues.productName || !formValues.skuCode || !formValues.categoryId || !formValues.brandId) {
      setSubmitError('Please complete required basic information fields.');
      return;
    }
    if (variations.length === 0) {
      setSubmitError('Please add at least one product variation before registering.');
      return;
    }

    setIsSaving(true);
    setSubmitError('');

    try {
      let productId = editProductId ?? null;

      if (isEditMode && productId) {
        const { error: updateProductError } = await supabase
          .from('products')
          .update({
            product_name: formValues.productName,
            sku_code: formValues.skuCode,
            category_id: formValues.categoryId,
            brand_id: formValues.brandId,
            description: formValues.description,
            status: formValues.status,
          })
          .eq('id', productId);

        if (updateProductError) throw new Error(updateProductError.message);
      } else {
        const { data: product, error: productError } = await supabase
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

        if (productError || !product) {
          throw new Error(productError?.message ?? 'Failed to create product.');
        }
        productId = String(product.id);
      }

      if (!productId) throw new Error('Product reference missing.');

      const currentExistingMedia = mediaItems.filter((item) => item.isExisting).map((item) => item.id);
      const removedExistingMediaIds = loadedExistingMediaIds.filter((id) => !currentExistingMedia.includes(id));

      if (removedExistingMediaIds.length > 0) {
        const removedMedia = loadedExistingMediaItems.filter((item) => removedExistingMediaIds.includes(item.id));
        const removablePaths = removedMedia.map((item) => item.mediaPath).filter(Boolean) as string[];

        await supabase.from('product_media').delete().in('id', removedExistingMediaIds);
        if (removablePaths.length > 0) {
          await supabase.storage.from(mediaBucket).remove(removablePaths);
        }
      }

      const existingItems = mediaItems.filter((item) => item.isExisting);
      for (const [index, item] of existingItems.entries()) {
        await supabase
          .from('product_media')
          .update({
            sort_order: index,
            is_primary: item.id === mainMediaId,
          })
          .eq('id', item.id);
      }

      const newMediaItems = mediaItems.filter((item) => !item.isExisting && item.file);
      if (newMediaItems.length > 0) {
        const mediaRows: { product_id: string; media_type: 'image' | 'video'; media_url: string; media_path: string; is_primary: boolean; sort_order: number; status: 'Active' }[] = [];

        for (const [index, item] of newMediaItems.entries()) {
          const file = item.file as File;
          const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
          const storagePath = `${productId}/${safeName}`;
          const { error: uploadError } = await supabase.storage.from(mediaBucket).upload(storagePath, file, { upsert: false });
          if (uploadError) throw new Error(`Media upload failed (${file.name}): ${uploadError.message}`);

          const { data: publicData } = supabase.storage.from(mediaBucket).getPublicUrl(storagePath);
          mediaRows.push({
            product_id: productId,
            media_type: item.type,
            media_url: publicData.publicUrl,
            media_path: storagePath,
            is_primary: item.id === mainMediaId,
            sort_order: existingItems.length + index,
            status: 'Active',
          });
        }

        const { error: mediaError } = await supabase.from('product_media').insert(mediaRows);
        if (mediaError) throw new Error(mediaError.message);
      }

      const { data: primaryMediaRow } = await supabase
        .from('product_media')
        .select('id')
        .eq('product_id', productId)
        .eq('is_primary', true)
        .limit(1)
        .maybeSingle();

      await supabase.from('products').update({ primary_media_id: primaryMediaRow?.id ?? null }).eq('id', productId);

      await Promise.all([
        supabase.from('product_variations').delete().eq('product_id', productId),
        supabase.from('product_discounts').delete().eq('product_id', productId),
        supabase.from('product_surcharges').delete().eq('product_id', productId),
      ]);

      const variationRows = variations.map((item, index) => ({
        product_id: productId,
        branch_name: item.branchName,
        price_type: item.priceType,
        variation_name: item.variationName || null,
        class_name: item.className,
        price: parseNumber(item.price),
        sku_code: item.skuCode,
        availability: item.availability,
        price_code: item.priceCode || null,
        sort_order: index,
      }));
      const { error: variationError } = await supabase.from('product_variations').insert(variationRows);
      if (variationError) throw new Error(variationError.message);

      if (discounts.length > 0) {
        const discountRows = discounts.map((item, index) => ({
          product_id: productId,
          discount_name: item.discountName,
          discount_type: item.discountType,
          discount_percent: item.discountType === 'Percent' ? parseNumber(item.amount) : null,
          amount: item.discountType === 'Amount' ? parseNumber(item.amount) : null,
          min_quantity: Math.max(1, parseInt(item.minQuantity || '1', 10)),
          max_quantity: item.maxQuantity ? parseInt(item.maxQuantity, 10) : null,
          branch_name: item.branchName || null,
          price_type: item.priceType || null,
          price_code: item.priceCode || null,
          priority: index,
        }));
        const { error } = await supabase.from('product_discounts').insert(discountRows);
        if (error) throw new Error(error.message);
      }

      if (surcharges.length > 0) {
        const surchargeRows = surcharges.map((item, index) => ({
          product_id: productId,
          surcharge_name: item.surchargeName,
          surcharge_type: item.surchargeType,
          surcharge_percent: item.surchargeType === 'Percent' ? parseNumber(item.amount) : null,
          amount: item.surchargeType === 'Amount' ? parseNumber(item.amount) : null,
          free_quantity: parseInt(item.freeQuantity || '0', 10) || 0,
          min_quantity: Math.max(1, parseInt(item.minQuantity || '1', 10)),
          max_quantity: item.maxQuantity ? parseInt(item.maxQuantity, 10) : null,
          branch_name: item.branchName || null,
          price_type: item.priceType || null,
          price_code: item.priceCode || null,
          priority: index,
        }));
        const { error } = await supabase.from('product_surcharges').insert(surchargeRows);
        if (error) throw new Error(error.message);
      }

      onCancel();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to save product.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>{isEditMode ? 'Edit Product' : 'Add Product'}</h2>
        <div className={styles.navigation} role="tablist" aria-label="Add product sections">
          {sections.map((section) => (
            <button
              key={section}
              type="button"
              role="tab"
              aria-selected={activeSection === section}
              className={`${styles.navButton} ${activeSection === section ? styles.navButtonActive : ''}`}
              onClick={() => setActiveSection(section)}
            >
              {section}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.content}>
        {isLoadingProduct ? <p className={styles.placeholderText}>Loading product details...</p> : null}
        {submitError ? <p className={styles.placeholderText}>{submitError}</p> : null}
        {activeSection === 'Basic Information' ? (
          <BasicInformation onCancel={onCancel} onNext={handleNext} value={formValues} onChange={setFormValues} categories={categories} brands={brands} />
        ) : activeSection === 'Images' ? (
          <Media onBack={handleBack} onNext={handleNext} items={mediaItems} mainMediaId={mainMediaId} onChange={setMediaItems} onMainMediaChange={setMainMediaId} />
        ) : activeSection === 'Variation & Pricing' ? (
          <VarAndPrice onBack={handleBack} onNext={handleNext} items={variations} onChange={setVariations} />
        ) : activeSection === 'Discount' ? (
          <Discount onBack={handleBack} onNext={handleNext} items={discounts} onChange={setDiscounts} />
        ) : (
          <Surcharge onBack={handleBack} onSubmit={handleRegister} items={surcharges} onChange={setSurcharges} isSaving={isSaving} />
        )}
      </div>
    </section>
  );
}
