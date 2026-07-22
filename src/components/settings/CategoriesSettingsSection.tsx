import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import SupabaseSettingsSection from './SupabaseSettingsSection';
import sectionStyles from './SupabaseSettingsSection.module.css';
import SettingsAccordionItem from './SettingsAccordionItem';
import useSupabaseSettingsSection from './useSupabaseSettingsSection';
import { supabase } from '../../lib/supabase';
import {
  STATUS_OPTIONS,
  createSlug,
  matchesSearch,
  normalizeStatus,
  statusBadge,
  type SettingPanel,
  type StatusValue,
} from './settingsShared';

type CategoryRecord = {
  id: string;
  category_title: string;
  category_slug: string;
  category_image_url: string;
  category_image_path: string;
  status: StatusValue;
};

type CategoryForm = {
  category_title: string;
  category_slug: string;
  category_image_url: string;
  category_image_path: string;
  status: StatusValue;
};

type Props = {
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
};

const categoryMediaBucket = import.meta.env.VITE_SUPABASE_CATEGORY_MEDIA_BUCKET ?? 'category-images';
const fallbackCategoryMediaBucket = 'product-images';
const maxCategoryImageSizeInBytes = 5 * 1024 * 1024;

async function removeCategoryImageFromStorage(storagePath: string) {
  await Promise.all([
    supabase.storage.from(categoryMediaBucket).remove([storagePath]),
    supabase.storage.from(fallbackCategoryMediaBucket).remove([storagePath]),
  ]);
}

export default function CategoriesSettingsSection({ activePanel, onToggle }: Props) {
  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState('');
  const [imageError, setImageError] = useState('');

  const categories = useSupabaseSettingsSection<CategoryRecord, CategoryForm>({
    table: 'product_categories',
    selectQuery:
      'id, category_title, category_slug, category_image_url, category_image_path, status, created_at, updated_at',
    emptyForm: {
      category_title: '',
      category_slug: '',
      category_image_url: '',
      category_image_path: '',
      status: 'Active',
    },
    mapRow: (row) => ({
      id: String(row.id),
      category_title: String(row.category_title ?? ''),
      category_slug: String(row.category_slug ?? ''),
      category_image_url: String(row.category_image_url ?? ''),
      category_image_path: String(row.category_image_path ?? ''),
      status: normalizeStatus(row.status),
    }),
    mapRecordToForm: (record) => ({
      category_title: record.category_title,
      category_slug: record.category_slug,
      category_image_url: record.category_image_url,
      category_image_path: record.category_image_path,
      status: record.status,
    }),
    mapFormToPayload: (form) => ({
      category_title: form.category_title.trim(),
      category_slug: (form.category_slug.trim() || createSlug(form.category_title.trim())) || null,
      category_image_url: form.category_image_url.trim() || null,
      category_image_path: form.category_image_path.trim() || null,
      status: form.status,
    }),
    validate: (form, items, editingId) => {
      if (!form.category_title.trim()) {
        return 'Category title is required.';
      }

      const slug = form.category_slug.trim() || createSlug(form.category_title.trim());
      const duplicate = items.some(
        (item) =>
          item.id !== editingId &&
          (item.category_title.toLowerCase() === form.category_title.trim().toLowerCase() ||
            item.category_slug.toLowerCase() === slug.toLowerCase()),
      );

      return duplicate ? 'Category title or slug already exists.' : null;
    },
    preparePayload: async ({ editingId, form, items }) => {
      const previousRecord = editingId ? items.find((item) => item.id === editingId) ?? null : null;
      const previousPath = previousRecord?.category_image_path?.trim() || '';
      const imageWasRemoved = !selectedImageFile && !form.category_image_url.trim() && Boolean(previousPath);

      if (!selectedImageFile) {
        return imageWasRemoved
          ? {
              afterSave: async () => {
                await removeCategoryImageFromStorage(previousPath);
              },
            }
          : undefined;
      }

      const extension = selectedImageFile.name.split('.').pop()?.toLowerCase() || 'jpg';
      const safeExtension = extension.replace(/[^a-z0-9]/g, '') || 'jpg';
      const slugSource = form.category_title.trim() || form.category_slug.trim() || 'category';
      const fileName = `${Date.now()}-${createSlug(slugSource) || 'category'}.${safeExtension}`;
      const storagePath = `product-categories/${editingId ?? 'new'}/${fileName}`;

      let activeBucket = categoryMediaBucket;
      let uploadResult = await supabase.storage.from(activeBucket).upload(storagePath, selectedImageFile, {
        upsert: false,
      });

      if (uploadResult.error && uploadResult.error.message.toLowerCase().includes('bucket')) {
        activeBucket = fallbackCategoryMediaBucket;
        uploadResult = await supabase.storage.from(activeBucket).upload(storagePath, selectedImageFile, {
          upsert: false,
        });
      }

      if (uploadResult.error) {
        throw new Error(`Category image upload failed: ${uploadResult.error.message}`);
      }

      const { data: publicData } = supabase.storage.from(activeBucket).getPublicUrl(storagePath);

      return {
        payload: {
          category_image_url: publicData.publicUrl,
          category_image_path: storagePath,
        },
        afterSave: async () => {
          setSelectedImageFile(null);
          if (previousPath && previousPath !== storagePath) {
            await removeCategoryImageFromStorage(previousPath);
          }
        },
        onError: async () => {
          await supabase.storage.from(activeBucket).remove([storagePath]);
        },
      };
    },
    sortOrderColumn: null,
    orderBy: [{ column: 'category_title', ascending: true }],
  });

  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreviewUrl('');
      return;
    }

    const objectUrl = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImageFile]);

  useEffect(() => {
    setSelectedImageFile(null);
    setImageError('');
  }, [categories.editingId]);

  function handleImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setImageError('Please upload an image file only.');
      return;
    }

    if (file.size > maxCategoryImageSizeInBytes) {
      setImageError('Please upload an image smaller than 5 MB.');
      return;
    }

    setImageError('');
    setSelectedImageFile(file);
  }

  function clearCategoryImage() {
    setImageError('');
    setSelectedImageFile(null);
    categories.updateField('category_image_url', '');
    categories.updateField('category_image_path', '');
  }

  function handleCancelEdit() {
    setImageError('');
    setSelectedImageFile(null);
    categories.resetForm();
  }

  return (
    <SettingsAccordionItem
      panel="categories"
      activePanel={activePanel}
      onToggle={onToggle}
      iconClassName="fa-solid fa-folder-tree"
      title="Product Categories"
      counts={categories.counts}
    >
      {activePanel === 'categories' ? (
        <CategoriesSectionContent
          categories={categories}
          imageError={imageError}
          onCancelEdit={handleCancelEdit}
          onImageClear={clearCategoryImage}
          onImageSelect={handleImageSelect}
          selectedImageFile={selectedImageFile}
          selectedImagePreviewUrl={selectedImagePreviewUrl}
        />
      ) : null}
    </SettingsAccordionItem>
  );
}

function CategoriesSectionContent({
  categories,
  selectedImageFile,
  selectedImagePreviewUrl,
  imageError,
  onCancelEdit,
  onImageSelect,
  onImageClear,
}: {
  categories: ReturnType<typeof useSupabaseSettingsSection<CategoryRecord, CategoryForm>>;
  selectedImageFile: File | null;
  selectedImagePreviewUrl: string;
  imageError: string;
  onCancelEdit: () => void;
  onImageSelect: (event: ChangeEvent<HTMLInputElement>) => void;
  onImageClear: () => void;
}) {
  const [searchValue, setSearchValue] = useState('');
  const [activePreviewImage, setActivePreviewImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  const filteredItems = useMemo(
    () =>
      categories.items.filter((item) =>
        matchesSearch(item, searchValue, ['category_title', 'category_slug', 'category_image_url', 'status']),
      ),
    [categories.items, searchValue],
  );

  const previewImageUrl = selectedImagePreviewUrl || categories.formValues.category_image_url.trim();
  const hasPreviewImage = Boolean(previewImageUrl);
  const lightbox =
    activePreviewImage && typeof document !== 'undefined'
      ? createPortal(
          <div
            className={sectionStyles.imageLightbox}
            role="presentation"
            onClick={() => setActivePreviewImage(null)}
          >
            <div
              className={sectionStyles.imageLightboxCard}
              role="dialog"
              aria-modal="true"
              aria-label="Category image preview"
              onClick={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                className={sectionStyles.imageLightboxClose}
                onClick={() => setActivePreviewImage(null)}
                aria-label="Close image preview"
              >
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
              <img
                src={activePreviewImage.src}
                alt={activePreviewImage.alt}
                className={sectionStyles.imageLightboxAsset}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <SupabaseSettingsSection
        title="Product Categories"
        subtitle="Manage the categories used by products.category_id."
        searchPlaceholder="Search categories"
        searchValue={searchValue}
        onSearchChange={setSearchValue}
        fields={[
          { key: 'category_title', label: 'Category title', type: 'text', required: true, placeholder: 'Cement' },
          { key: 'category_slug', label: 'Category slug', type: 'text', placeholder: 'Auto-generated if empty' },
          { key: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
        ]}
        renderForm={() => (
          <div className={sectionStyles.form}>
            <label className={sectionStyles.field}>
              <span className={sectionStyles.label}>Category title*</span>
              <input
                type="text"
                value={categories.formValues.category_title}
                onChange={(event) => categories.updateField('category_title', event.target.value)}
                placeholder="Cement"
                className={sectionStyles.input}
              />
            </label>

            <label className={sectionStyles.field}>
              <span className={sectionStyles.label}>Category slug</span>
              <input
                type="text"
                value={categories.formValues.category_slug}
                onChange={(event) => categories.updateField('category_slug', event.target.value)}
                placeholder="Auto-generated if empty"
                className={sectionStyles.input}
              />
            </label>

            <label className={sectionStyles.field}>
              <span className={sectionStyles.label}>Status*</span>
              <select
                value={categories.formValues.status}
                onChange={(event) => categories.updateField('status', event.target.value as StatusValue)}
                className={`${sectionStyles.input} ${sectionStyles.select}`}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className={sectionStyles.imageEditor}>
              <div className={sectionStyles.imageInputCard}>
                <div className={sectionStyles.imageInputHeader}>
                  <div>
                    <p className={sectionStyles.imageInputTitle}>Category Image</p>
                    <p className={sectionStyles.imageInputNote}>
                      Upload an image and we will save it securely behind the scenes.
                    </p>
                  </div>
                </div>

                <div className={sectionStyles.imageUrlRow}>
                  <input
                    id="category-image-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                    onChange={onImageSelect}
                    className={sectionStyles.fileInputHidden}
                  />
                  <label htmlFor="category-image-upload" className={sectionStyles.ghostButton}>
                    <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden="true"></i>
                    {hasPreviewImage ? 'Replace Image' : 'Upload Image'}
                  </label>
                  <button
                    type="button"
                    className={`${sectionStyles.ghostButton} ${sectionStyles.dangerGhostButton}`}
                    onClick={onImageClear}
                    disabled={!hasPreviewImage}
                  >
                    <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    Remove
                  </button>
                </div>

                <p className={sectionStyles.imageHelpText}>
                  Admins only see the preview. Storage path and database location stay hidden.
                </p>
                {selectedImageFile ? (
                  <p className={sectionStyles.imageHelpText}>Selected file: {selectedImageFile.name}</p>
                ) : null}
                {imageError ? <p className={sectionStyles.error}>{imageError}</p> : null}
              </div>

              <div className={sectionStyles.imagePreviewCard}>
                {hasPreviewImage ? (
                  <>
                    <img
                      src={previewImageUrl}
                      alt={categories.formValues.category_title || 'Category preview'}
                      className={sectionStyles.imagePreviewAsset}
                    />
                    <span className={sectionStyles.imagePreviewBadge}>
                      <i className="fa-regular fa-image" aria-hidden="true"></i>
                      Live Preview
                    </span>
                    <button
                      type="button"
                      className={sectionStyles.imageRemoveButton}
                      onClick={onImageClear}
                      aria-label="Remove category image"
                    >
                      <i className="fa-solid fa-xmark" aria-hidden="true"></i>
                    </button>
                  </>
                ) : (
                  <div className={sectionStyles.imagePreviewFallback}>
                    <i className="fa-regular fa-image" aria-hidden="true"></i>
                    <p className={sectionStyles.imagePreviewText}>
                      Your category image preview will appear here.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        formValues={categories.formValues}
        onFieldChange={categories.updateField}
        onSubmit={categories.submit}
        onCancelEdit={onCancelEdit}
        editingId={categories.editingId}
        isSaving={categories.isSaving}
        isLoading={categories.isLoading}
        loadError={categories.loadError}
        saveError={categories.saveError}
        items={filteredItems}
        rowTemplateColumns="minmax(14rem, 1.35fr) minmax(11rem, 1fr) minmax(7rem, 0.7fr) minmax(8rem, 0.7fr) minmax(12rem, 0.95fr)"
        columns={[
          { label: 'Title', render: (item) => item.category_title },
          { label: 'Slug', render: (item) => item.category_slug || '-', className: sectionStyles.cellMuted },
          {
            label: 'Image',
            className: sectionStyles.imageCell,
            render: (item) =>
              item.category_image_url ? (
                <button
                  type="button"
                  className={sectionStyles.imageThumbButton}
                  onClick={() =>
                    setActivePreviewImage({
                      src: item.category_image_url,
                      alt: item.category_title || 'Category image',
                    })
                  }
                  aria-label={`Preview ${item.category_title || 'category'} image`}
                >
                  <img
                    src={item.category_image_url}
                    alt={item.category_title || 'Category image'}
                    className={sectionStyles.imageThumb}
                  />
                </button>
              ) : (
                <div className={sectionStyles.imageThumbWrap}>
                  <span className={sectionStyles.imagePlaceholder}>
                    <i className="fa-regular fa-image" aria-hidden="true"></i>
                  </span>
                </div>
              ),
          },
          { label: 'Status', render: (item) => statusBadge(item.status), className: sectionStyles.statusCell },
        ]}
        onEdit={categories.startEdit}
        onToggleStatus={(item) => categories.updateStatus(item.id, item.status === 'Active' ? 'Inactive' : 'Active')}
        emptyText="No categories found yet."
      />
      {lightbox}
    </>
  );
}
