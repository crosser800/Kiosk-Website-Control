import { useState } from 'react';
import styles from './ProductCategoryWorkspace.module.css';
import { getVariationSummary, isActiveStatus } from './productCardPresentation';
import type { ProductListItem } from './productWorkspaceData';

type ProductBrowseCardProps = {
  product: ProductListItem;
  isActive?: boolean;
  onOpen: (product: ProductListItem) => void;
  // Extra context for the tooltip / accessible name (e.g. why a search matched).
  hint?: string;
  // 'tile': image on top (search results grid).
  // 'row': image left, details right (category sidebar). The category line is
  // omitted there because the sidebar is already scoped to one category.
  layout?: 'tile' | 'row';
};

// Product card for the Products page. Shows name, product SKU, variation
// summary, category (tile only) and status; size follows --product-card-min.
export default function ProductBrowseCard({
  product,
  isActive = false,
  onOpen,
  hint,
  layout = 'tile',
}: ProductBrowseCardProps) {
  // Remember which URL failed, so a new thumbnail for the same product still loads.
  const [failedImageUrl, setFailedImageUrl] = useState('');
  const variationSummary = getVariationSummary(product.variationLabels, product.variationCount);
  const categoryLabel = product.categoryTitle || 'Uncategorized';
  const showImage = Boolean(product.thumbnailUrl) && failedImageUrl !== product.thumbnailUrl;
  // The data layer uses '-' for a product without a SKU.
  const hasSku = Boolean(product.skuCode.trim()) && product.skuCode.trim() !== '-';
  const isRow = layout === 'row';
  const tooltip = [product.name, hasSku ? product.skuCode : '', variationSummary, isRow ? '' : categoryLabel, hint]
    .filter(Boolean)
    .join('\n');

  const media = showImage ? (
    <img
      src={product.thumbnailUrl}
      alt=""
      className={styles.productTileImage}
      loading="lazy"
      decoding="async"
      onError={() => setFailedImageUrl(product.thumbnailUrl)}
    />
  ) : (
    <span className={styles.productTilePlaceholder}>
      <i className="fa-solid fa-box" aria-hidden="true"></i>
    </span>
  );
  const statusClass = isActiveStatus(product.status) ? styles.statusActive : styles.statusInactive;
  const variationLine = (
    <span className={styles.productTileLine}>
      <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
      <span className={styles.productTileLineText}>{variationSummary}</span>
    </span>
  );

  return (
    <button
      type="button"
      className={`${isRow ? styles.productRow : styles.productTile} ${isActive ? styles.productTileActive : ''}`}
      onClick={() => onOpen(product)}
      aria-label={`Open ${product.name}${hint ? ` (${hint})` : ''}`}
      aria-current={isActive ? 'true' : undefined}
      title={tooltip}
    >
      {isRow ? (
        <>
          <span className={styles.productRowMedia}>{media}</span>
          <span className={styles.productRowBody}>
            <span className={styles.productRowName}>{product.name}</span>
            {hasSku ? <span className={styles.productTileSku}>{product.skuCode}</span> : null}
            {variationLine}
            <span className={`${styles.statusBadge} ${styles.productRowBadge} ${statusClass}`}>{product.status}</span>
          </span>
        </>
      ) : (
        <>
          <span className={styles.productTileMedia}>
            {media}
            <span className={`${styles.statusBadge} ${styles.productTileBadge} ${statusClass}`}>{product.status}</span>
          </span>
          <span className={styles.productTileBody}>
            <span className={styles.productTileName}>{product.name}</span>
            {hasSku ? <span className={styles.productTileSku}>{product.skuCode}</span> : null}
            {variationLine}
            <span className={styles.productTileLine}>
              <i className="fa-solid fa-folder" aria-hidden="true"></i>
              <span className={styles.productTileLineText}>{categoryLabel}</span>
            </span>
          </span>
        </>
      )}
    </button>
  );
}
