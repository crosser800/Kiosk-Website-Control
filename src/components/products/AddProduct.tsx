import { useEffect, useMemo, useState } from 'react';
import styles from './AddProduct.module.css';
import BasicInformation from './addProducts/BasicInformation';
import Media from './addProducts/Media';
import VarAndPrice from './addProducts/VarAndPrice';
import { supabase } from '../../lib/supabase';
import type { DiscountItem, MediaItem, ProductFormState, SurchargeItem, VariationItem } from '../../services/types';

type AddProductSection = 'Basic Information' | 'Images' | 'Variation & Pricing';

type AddProductProps = {
  onCancel: () => void;
  editProductId?: string | null;
};

type OptionItem = { id: string; label: string };

const sections: AddProductSection[] = ['Basic Information', 'Images', 'Variation & Pricing'];

const initialFormState: ProductFormState = {
  productName: '',
  skuCode: '',
  categoryId: '',
  brandId: '',
  description: '',
  status: 'Active',
};

const mediaBucket = import.meta.env.VITE_SUPABASE_PRODUCT_MEDIA_BUCKET ?? 'product-images';
const PRICE_CODE_META: Record<string, { branchName: VariationItem['branchName']; priceType: VariationItem['priceType'] }> = {
  R1: { branchName: 'Manila', priceType: 'Retail' },
  R2: { branchName: 'Cebu', priceType: 'Retail' },
  W1: { branchName: 'Manila', priceType: 'Wholesale' },
  W2: { branchName: 'Cebu', priceType: 'Wholesale' },
  SP: { branchName: 'Both', priceType: 'Special' },
  CP: { branchName: 'Both', priceType: 'Concept Store' },
};

function normalizeCalculationMethod(value: string | null | undefined): DiscountItem['calculationMethod'] {
  return String(value ?? '').toLowerCase() === 'single' ? 'Single' : 'Cascading';
}

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
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [saveNotice, setSaveNotice] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [draftProductId, setDraftProductId] = useState<string | null>(editProductId ?? null);
  const [snackbar, setSnackbar] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const isEditMode = useMemo(() => Boolean(editProductId), [editProductId]);
  const variationLocations = useMemo(() => {
    const locations = Array.from(
      new Set(
        variations
          .map((item) => String(item.branchName ?? '').trim())
          .filter((entry) => entry.length > 0)
      )
    );
    return locations.length > 0 ? locations.join(', ') : '-';
  }, [variations]);

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
        setSaveNotice(null);
        setDraftProductId(null);
        return;
      }

      setIsLoadingProduct(true);
      setSubmitError('');
      setSaveNotice(null);

      const [productRes, mediaRes, variationRes, discountRes, surchargeRes] = await Promise.all([
        supabase.from('products').select('id, product_name, sku_code, category_id, brand_id, description, status').eq('id', editProductId).single(),
        supabase.from('product_media').select('id, media_url, media_type, media_path, title, alt_text, is_primary').eq('product_id', editProductId).order('sort_order', { ascending: true }),
        supabase.from('product_variations').select('id, price_type, variation_name, class_name, price_code, branch_name, price, sku_code, stock_quantity, availability').eq('product_id', editProductId).order('sort_order', { ascending: true }),
        supabase
          .from('product_discounts')
          .select('id, discount_name, discount_type, discount_percent, amount, min_quantity, max_quantity, branch_name, price_type, price_code, calculation_method, apply_sequence, discount_group, applies_to, stackable, product_discount_classes!left(variation_id, class_name, price_code, branch_name, price_type)')
          .eq('product_id', editProductId)
          .order('apply_sequence', { ascending: true }),
        supabase
          .from('product_surcharges')
          .select('id, surcharge_name, surcharge_type, surcharge_percent, amount, free_quantity, min_quantity, max_quantity, branch_name, price_type, price_code, priority, product_surcharge_classes!left(variation_id, class_name, price_code, branch_name, price_type)')
          .eq('product_id', editProductId)
          .order('priority', { ascending: true }),
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
      setDraftProductId(editProductId);

      const mappedMedia: MediaItem[] = (mediaRes.data ?? []).map((row) => ({
        id: String(row.id),
        fileName: String(row.media_path ?? row.media_url ?? 'Media'),
        previewUrl: String(row.media_url ?? ''),
        type: (row.media_type as 'image' | 'video') ?? 'image',
        title: String(row.title ?? ''),
        altText: String(row.alt_text ?? ''),
        isExisting: true,
        mediaPath: row.media_path ? String(row.media_path) : null,
      }));
      setMediaItems(mappedMedia);
      setLoadedExistingMediaIds(mappedMedia.map((item) => item.id));
      setLoadedExistingMediaItems(mappedMedia);
      setMainMediaId((mediaRes.data ?? []).find((row) => row.is_primary)?.id ?? mappedMedia[0]?.id ?? null);

      const mappedVariations: VariationItem[] = (variationRes.data ?? []).map((row) => {
        const priceCode = String(row.price_code ?? '') as VariationItem['priceCode'];
        const meta = PRICE_CODE_META[priceCode];
        return {
          id: String(row.id),
          priceType: meta?.priceType ?? ((row.price_type as VariationItem['priceType']) ?? ''),
          variationName: String(row.variation_name ?? ''),
          className: String(row.class_name ?? ''),
          priceCode,
          branchName: meta?.branchName ?? ((row.branch_name as VariationItem['branchName']) ?? ''),
          price: row.price ? Number(row.price).toLocaleString('en-US') : '',
          skuCode: String(row.sku_code ?? ''),
          stockQuantity: String(row.stock_quantity ?? '0'),
          availability: (row.availability as VariationItem['availability']) ?? '',
        };
      });
      setVariations(mappedVariations);
      const variationIdToKey = new Map<string, string>();
      const variationMetaById = new Map<string, { priceCode: string; branchName: string; priceType: string }>();
      (variationRes.data ?? []).forEach((row: any) => {
        const variationRowId = String(row.id);
        const variationName = String(row.variation_name ?? row.class_name ?? '').trim().toLowerCase();
        const skuCode = String(row.sku_code ?? '').trim().toLowerCase();
        const key = `${variationName}::${skuCode}`;
        variationIdToKey.set(variationRowId, key);
        variationMetaById.set(variationRowId, {
          priceCode: String(row.price_code ?? ''),
          branchName: String(row.branch_name ?? ''),
          priceType: String(row.price_type ?? ''),
        });
      });

      const mappedDiscounts: DiscountItem[] = (discountRes.data ?? []).flatMap((row: any) => {
        const classes = Array.isArray(row.product_discount_classes) ? row.product_discount_classes : [];
        if (classes.length === 0) {
          return [{
            id: String(row.id),
            variationId: '',
            discountName: String(row.discount_name ?? ''),
            discountType: (row.discount_type as DiscountItem['discountType']) ?? 'Percent',
            amount: String(row.discount_type === 'Percent' ? row.discount_percent ?? '' : row.amount ?? ''),
            minQuantity: String(row.min_quantity ?? '1'),
            maxQuantity: String(row.max_quantity ?? ''),
            branchName: (row.branch_name as DiscountItem['branchName']) ?? '',
            priceType: (row.price_type as DiscountItem['priceType']) ?? '',
            priceCode: (row.price_code as DiscountItem['priceCode']) ?? '',
            calculationMethod: normalizeCalculationMethod(row.calculation_method),
            applySequence: String(row.apply_sequence ?? '1'),
            discountGroup: String(row.discount_group ?? ''),
            appliesTo: (row.applies_to as DiscountItem['appliesTo']) ?? 'UnitPrice',
            stackable: Boolean(row.stackable ?? true),
          }];
        }
        return classes.map((classRow: any, classIndex: number) => ({
          id: classIndex === 0 ? String(row.id) : `${String(row.id)}-${classIndex}`,
          variationId: variationIdToKey.get(String(classRow.variation_id ?? '')) ?? String(classRow.variation_id ?? ''),
          discountName: String(row.discount_name ?? ''),
          discountType: (row.discount_type as DiscountItem['discountType']) ?? 'Percent',
          amount: String(row.discount_type === 'Percent' ? row.discount_percent ?? '' : row.amount ?? ''),
          minQuantity: String(row.min_quantity ?? '1'),
          maxQuantity: String(row.max_quantity ?? ''),
          branchName: (classRow.branch_name as DiscountItem['branchName']) ?? (row.branch_name as DiscountItem['branchName']) ?? '',
          priceType: (classRow.price_type as DiscountItem['priceType']) ?? (row.price_type as DiscountItem['priceType']) ?? '',
          priceCode: (classRow.price_code as DiscountItem['priceCode']) ?? (row.price_code as DiscountItem['priceCode']) ?? '',
          calculationMethod: normalizeCalculationMethod(row.calculation_method),
          applySequence: String(row.apply_sequence ?? '1'),
          discountGroup: String(row.discount_group ?? ''),
          appliesTo: (row.applies_to as DiscountItem['appliesTo']) ?? 'UnitPrice',
          stackable: Boolean(row.stackable ?? true),
        }));
      });
      setDiscounts(mappedDiscounts);

      const mappedSurcharges: SurchargeItem[] = (surchargeRes.data ?? []).flatMap((row: any) => {
        const classes = Array.isArray(row.product_surcharge_classes) ? row.product_surcharge_classes : [];
        if (classes.length === 0) {
          return [
            {
              id: String(row.id),
              variationId: '',
              surchargeName: String(row.surcharge_name ?? ''),
              surchargeType: (row.surcharge_type as SurchargeItem['surchargeType']) ?? 'Amount',
              amount: String(row.surcharge_type === 'Percent' ? row.surcharge_percent ?? '' : row.amount ?? ''),
              freeQuantity: String(row.free_quantity ?? '0'),
              minQuantity: String(row.min_quantity ?? '1'),
              maxQuantity: String(row.max_quantity ?? ''),
              branchName: (row.branch_name as SurchargeItem['branchName']) ?? '',
              priceType: (row.price_type as SurchargeItem['priceType']) ?? '',
              priceCode: (row.price_code as SurchargeItem['priceCode']) ?? '',
            },
          ];
        }

        return classes.map((classRow: any, classIndex: number) => {
          const rawVariationId = String(classRow.variation_id ?? '');
          const variationMeta = variationMetaById.get(rawVariationId);
          return {
          id: classIndex === 0 ? String(row.id) : `${String(row.id)}-${classIndex}`,
          variationId: variationIdToKey.get(rawVariationId) ?? rawVariationId,
          surchargeName: String(row.surcharge_name ?? ''),
          surchargeType: (row.surcharge_type as SurchargeItem['surchargeType']) ?? 'Amount',
          amount: String(row.surcharge_type === 'Percent' ? row.surcharge_percent ?? '' : row.amount ?? ''),
          freeQuantity: String(row.free_quantity ?? '0'),
          minQuantity: String(row.min_quantity ?? '1'),
          maxQuantity: String(row.max_quantity ?? ''),
          branchName: (classRow.branch_name as SurchargeItem['branchName']) ?? (row.branch_name as SurchargeItem['branchName']) ?? (variationMeta?.branchName as SurchargeItem['branchName']) ?? '',
          priceType: (classRow.price_type as SurchargeItem['priceType']) ?? (row.price_type as SurchargeItem['priceType']) ?? (variationMeta?.priceType as SurchargeItem['priceType']) ?? '',
          priceCode: (classRow.price_code as SurchargeItem['priceCode']) ?? (row.price_code as SurchargeItem['priceCode']) ?? (variationMeta?.priceCode as SurchargeItem['priceCode']) ?? '',
          };
        });
      });
      setSurcharges(mappedSurcharges);

      setIsLoadingProduct(false);
    };

    void loadProductForEdit();
  }, [editProductId]);

  useEffect(() => {
    if (!snackbar) return;
    const timeout = window.setTimeout(() => setSnackbar(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [snackbar]);

  const handleBack = () => {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex > 0) setActiveSection(sections[currentIndex - 1]);
  };

  const handleNext = () => {
    const currentIndex = sections.indexOf(activeSection);
    if (currentIndex < sections.length - 1) setActiveSection(sections[currentIndex + 1]);
  };

  const handleBasicNext = async () => {
    if (!formValues.productName || !formValues.skuCode || !formValues.categoryId || !formValues.brandId || !formValues.description) {
      setSubmitError('Please complete required basic information fields.');
      return;
    }
    setSubmitError('');
    setSaveNotice(null);

    try {
      const targetId = draftProductId ?? editProductId ?? null;
      if (targetId) {
        const { error } = await supabase
          .from('products')
          .update({
            product_name: formValues.productName,
            sku_code: formValues.skuCode,
            category_id: formValues.categoryId,
            brand_id: formValues.brandId,
            description: formValues.description,
            status: formValues.status,
          })
          .eq('id', targetId);
        if (error) throw new Error(error.message);
        setSnackbar({ type: 'success', message: `Main product updated. ID: ${targetId}` });
      } else {
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
        if (error || !data) throw new Error(error?.message ?? 'Failed to create product.');
        const nextId = String(data.id);
        setDraftProductId(nextId);
        setSnackbar({ type: 'success', message: `Main product saved to products table. ID: ${nextId}` });
      }
      handleNext();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save basic information.';
      setSubmitError(message);
      setSnackbar({ type: 'error', message });
    }
  };

  const handleMediaNext = async () => {
    setSubmitError('');
    setSaveNotice(null);
    try {
      const productId = draftProductId ?? editProductId ?? null;
      if (!productId) {
        throw new Error('Please save basic information first.');
      }
      await persistMediaForProduct(productId);
      setSnackbar({ type: 'success', message: `Media saved to product_media. Product ID: ${productId}` });
      handleNext();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save media.';
      setSubmitError(message);
      setSnackbar({ type: 'error', message });
    }
  };

  const parseNumber = (value: string) => Number(value.replace(/,/g, '')) || 0;

  async function persistMediaForProduct(productId: string) {
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
          title: item.title || null,
          alt_text: item.altText || null,
        })
        .eq('id', item.id);
    }

    const newMediaItems = mediaItems.filter((item) => !item.isExisting && item.file);
    if (newMediaItems.length > 0) {
      const mediaRows: { product_id: string; media_type: 'image' | 'video'; media_url: string; media_path: string; title: string | null; alt_text: string | null; is_primary: boolean; sort_order: number; status: 'Active' }[] = [];

      for (const [index, item] of newMediaItems.entries()) {
        const file = item.file as File;
        const safeName = `${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
        const storagePath = `${productId}/${safeName}`;
        let uploadErrorMessage = '';
        let usedBucket = mediaBucket;
        let uploadResult = await supabase.storage.from(usedBucket).upload(storagePath, file, { upsert: false });
        if (uploadResult.error && uploadResult.error.message.toLowerCase().includes('bucket')) {
          usedBucket = mediaBucket === 'product-images' ? 'product-media' : 'product-images';
          uploadResult = await supabase.storage.from(usedBucket).upload(storagePath, file, { upsert: false });
        }
        if (uploadResult.error) {
          uploadErrorMessage = uploadResult.error.message;
          throw new Error(`Media upload failed (${file.name}): ${uploadErrorMessage}`);
        }

        const { data: publicData } = supabase.storage.from(usedBucket).getPublicUrl(storagePath);
        mediaRows.push({
          product_id: productId,
          media_type: item.type,
          media_url: publicData.publicUrl,
          media_path: storagePath,
          title: item.title || null,
          alt_text: item.altText || null,
          is_primary: item.id === mainMediaId,
          sort_order: existingItems.length + index,
          status: 'Active',
        });
      }

      const { data: insertedMediaRows, error: mediaError } = await supabase
        .from('product_media')
        .insert(mediaRows)
        .select('id, media_url, media_type, media_path, title, alt_text, is_primary');
      if (mediaError) throw new Error(mediaError.message);

      const insertedByPath = new Map<string, any>();
      (insertedMediaRows ?? []).forEach((row: any) => {
        insertedByPath.set(String(row.media_path ?? ''), row);
      });
      const pendingPaths = Array.from(insertedByPath.keys());
      const nextItems = mediaItems.map((item) => {
        if (item.isExisting || !item.file) return item;
        const path = pendingPaths.shift();
        if (!path) return item;
        const inserted = insertedByPath.get(path);
        if (!inserted) return item;
        return {
          ...item,
          id: String(inserted.id),
          previewUrl: String(inserted.media_url ?? item.previewUrl),
          isExisting: true,
          mediaPath: String(inserted.media_path ?? ''),
          file: undefined,
        };
      });
      setMediaItems(nextItems);
      const existingNow = nextItems.filter((item) => item.isExisting);
      setLoadedExistingMediaItems(existingNow);
      setLoadedExistingMediaIds(existingNow.map((item) => item.id));
    }

    if (newMediaItems.length === 0) {
      const existingAfterSave = mediaItems.filter((item) => item.isExisting);
      setLoadedExistingMediaItems(existingAfterSave);
      setLoadedExistingMediaIds(existingAfterSave.map((item) => item.id));
    }

    const { data: primaryMediaRow } = await supabase
      .from('product_media')
      .select('id')
      .eq('product_id', productId)
      .eq('is_primary', true)
      .limit(1)
      .maybeSingle();

    await supabase.from('products').update({ primary_media_id: primaryMediaRow?.id ?? null }).eq('id', productId);
  }

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
    setSaveNotice({ type: 'info', message: 'Saving product data...' });

    try {
      let productId = draftProductId ?? editProductId ?? null;

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
        setDraftProductId(productId);
      }

      if (!productId) throw new Error('Product reference missing.');

      await persistMediaForProduct(productId);

      await Promise.all([
        supabase.from('product_variations').delete().eq('product_id', productId),
        supabase.from('product_discounts').delete().eq('product_id', productId),
        supabase.from('product_surcharges').delete().eq('product_id', productId),
      ]);

      const variationRows = variations.map((item, index) => ({
        product_id: productId,
        branch_name: (PRICE_CODE_META[item.priceCode]?.branchName ?? item.branchName),
        price_type: (PRICE_CODE_META[item.priceCode]?.priceType ?? item.priceType),
        variation_name: item.variationName || null,
        class_name: item.className,
        price: parseNumber(item.price),
        sku_code: item.skuCode,
        stock_quantity: Math.max(0, parseInt(item.stockQuantity || '0', 10) || 0),
        availability: item.availability,
        price_code: item.priceCode || null,
        sort_order: index,
      }));
      const { data: insertedVariationRows, error: variationError } = await supabase
        .from('product_variations')
        .insert(variationRows)
        .select('id, variation_name, class_name, sku_code, price_code');
      if (variationError) throw new Error(variationError.message);
      const variationLookup = new Map<string, string>();
      const variationClassLookup = new Map<string, string>();
      (insertedVariationRows ?? []).forEach((row: any) => {
        const variationName = String(row.variation_name ?? row.class_name ?? '').trim().toLowerCase();
        const skuCode = String(row.sku_code ?? '').trim().toLowerCase();
        const key = `${variationName}::${skuCode}::${String(row.price_code ?? '')}`;
        variationLookup.set(key, String(row.id));
        variationClassLookup.set(key, String(row.class_name ?? row.variation_name ?? 'Promo Class'));
      });

      const resolveVariationDbId = (variationIdOrKey: string, priceCode: string) => {
        const byKey = variationLookup.get(`${variationIdOrKey}::${priceCode}`);
        if (byKey) return byKey;
        const fallbackByPriceCode = Array.from(variationLookup.entries()).find(([key]) => key.endsWith(`::${priceCode}`));
        return fallbackByPriceCode?.[1] ?? null;
      };

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
          calculation_method: normalizeCalculationMethod(item.calculationMethod),
          apply_sequence: Math.max(1, parseInt(item.applySequence || '1', 10)),
          discount_group: item.discountGroup || null,
          applies_to: item.appliesTo || null,
          stackable: item.stackable,
          priority: index,
        }));
        const { data: insertedDiscounts, error: discountInsertError } = await supabase
          .from('product_discounts')
          .insert(discountRows)
          .select('id');
        if (discountInsertError) throw new Error(discountInsertError.message);

        const discountClassRows = (insertedDiscounts ?? []).flatMap((insertedRow: any, index: number) => {
          const source = discounts[index];
          if (!source) return [];
          return [{
            discount_id: String(insertedRow.id),
            variation_id: resolveVariationDbId(source.variationId, source.priceCode),
            class_name:
              variationClassLookup.get(`${source.variationId}::${source.priceCode}`) ??
              (source.discountName || 'Discount Class'),
            price_code: source.priceCode || null,
            branch_name: source.branchName || null,
            price_type: source.priceType || null,
          }];
        });
        if (discountClassRows.length > 0) {
          const { error: classInsertError } = await supabase.from('product_discount_classes').insert(discountClassRows as any[]);
          if (classInsertError) throw new Error(classInsertError.message);
        }
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
        const { data: insertedSurcharges, error: surchargeInsertError } = await supabase
          .from('product_surcharges')
          .insert(surchargeRows)
          .select('id');
        if (surchargeInsertError) throw new Error(surchargeInsertError.message);

        const classRows = (insertedSurcharges ?? []).flatMap((insertedRow: any, index: number) => {
            const source = surcharges[index];
            if (!source) return [];
            return [{
              surcharge_id: String(insertedRow.id),
              variation_id: resolveVariationDbId(source.variationId, source.priceCode),
              class_name:
                variationClassLookup.get(`${source.variationId}::${source.priceCode}`) ??
                (source.surchargeName || 'Promo Class'),
              price_code: source.priceCode || null,
              branch_name: source.branchName || null,
              price_type: source.priceType || null,
            }];
          });

        if (classRows.length > 0) {
          const { error: classInsertError } = await supabase.from('product_surcharge_classes').insert(classRows as any[]);
          if (classInsertError) throw new Error(classInsertError.message);
        }
      }

      const { data: verifyProduct, error: verifyError } = await supabase
        .from('products')
        .select('id, sku_code, product_name, created_at')
        .eq('id', productId)
        .single();
      if (verifyError || !verifyProduct) {
        throw new Error(verifyError?.message ?? 'Saved, but verification in products table failed.');
      }

      setSaveNotice({
        type: 'success',
        message: `${isEditMode ? 'Product updated' : 'Product inserted'} and verified in products table. ID: ${String(verifyProduct.id)}`,
      });
      setIsPreviewOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save product.';
      setSubmitError(message);
      setSaveNotice({ type: 'error', message });
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
        {saveNotice ? (
          <p className={`${styles.saveNotice} ${saveNotice.type === 'success' ? styles.saveNoticeSuccess : saveNotice.type === 'error' ? styles.saveNoticeError : styles.saveNoticeInfo}`}>
            {saveNotice.message}
          </p>
        ) : null}
        {activeSection === 'Basic Information' ? (
          <BasicInformation onCancel={onCancel} onNext={handleBasicNext} value={formValues} onChange={setFormValues} categories={categories} brands={brands} />
        ) : activeSection === 'Images' ? (
          <Media onBack={handleBack} onNext={handleMediaNext} items={mediaItems} mainMediaId={mainMediaId} onChange={setMediaItems} onMainMediaChange={setMainMediaId} />
        ) : (
          <VarAndPrice
            onBack={handleBack}
            onNext={() => setIsPreviewOpen(true)}
            onNextLabel="Save"
            isSubmitting={isSaving}
            isLoading={isLoadingProduct}
            defaultBaseSku={formValues.skuCode}
            items={variations}
            discounts={discounts}
            surcharges={surcharges}
            onChange={setVariations}
            onDiscountsChange={setDiscounts}
            onSurchargesChange={setSurcharges}
          />
        )}
      </div>

      {isPreviewOpen ? (
        <div className={styles.previewOverlay}>
          <div className={styles.previewModal}>
            <h3 className={styles.previewTitle}>Review Product Before Save</h3>

            <div className={styles.previewSection}>
              <h4>Basic Information</h4>
              <p><strong>Product:</strong> {formValues.productName || '-'}</p>
              <p><strong>Location:</strong> {variationLocations}</p>
              <p><strong>Code:</strong> {formValues.skuCode || '-'}</p>
              <p><strong>Variations:</strong> {variations.length}</p>
              <p><strong>Category:</strong> {categories.find((entry) => entry.id === formValues.categoryId)?.label ?? '-'}</p>
              <p><strong>Status:</strong> {formValues.status}</p>
            </div>

            <div className={styles.previewSection}>
              <h4>Details</h4>
              <p><strong>Description:</strong> {formValues.description || '-'}</p>
            </div>

            <div className={styles.previewSection}>
              <h4>Images / Videos</h4>
              <p><strong>Total Media:</strong> {mediaItems.length}</p>
              <p><strong>Main Media:</strong> {mediaItems.find((item) => item.id === mainMediaId)?.fileName ?? '-'}</p>
            </div>

            <div className={styles.previewSection}>
              <h4>Variations</h4>
              <p><strong>Variation Rows:</strong> {variations.length}</p>
              <p><strong>Discount Rows:</strong> {discounts.length}</p>
              <p><strong>Promo/Surcharge Rows:</strong> {surcharges.length}</p>
            </div>

            <div className={styles.previewActions}>
              <button type="button" className={styles.previewCancel} onClick={() => setIsPreviewOpen(false)}>Back</button>
              <button type="button" className={styles.previewSave} onClick={handleRegister} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Confirm Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {snackbar ? (
        <div className={`${styles.snackbar} ${snackbar.type === 'success' ? styles.snackbarSuccess : snackbar.type === 'error' ? styles.snackbarError : styles.snackbarInfo}`}>
          {snackbar.message}
        </div>
      ) : null}
    </section>
  );
}
