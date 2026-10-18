import styles from './ProductCategoryWorkspace.module.css';
import { getInitials, isActiveStatus } from './productCardPresentation';
import type { CategorySummary } from './productWorkspaceData';

type CategoryBrowseCardProps = {
  category: CategorySummary;
  onOpen: (categoryId: string) => void;
};

// "Browse by Category" card. Size comes from the grid (--category-card-min);
// the card adapts its own layout through container queries.
export default function CategoryBrowseCard({ category, onOpen }: CategoryBrowseCardProps) {
  return (
    <article className={styles.categoryCard}>
      <button
        type="button"
        className={styles.cardImageButton}
        onClick={() => onOpen(category.id)}
        aria-label={`Open ${category.title}`}
      >
        {category.imageUrl ? (
          <img
            src={category.imageUrl}
            alt={category.title}
            className={styles.categoryImage}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.categoryPlaceholder}>{getInitials(category.title)}</div>
        )}
      </button>

      <div className={styles.categoryBody}>
        <div className={styles.cardHeader}>
          <h3 className={styles.categoryTitle}>{category.title}</h3>
          <span
            className={`${styles.statusBadge} ${
              isActiveStatus(category.status) ? styles.statusActive : styles.statusInactive
            }`}
          >
            {category.status}
          </span>
        </div>

        <div className={styles.statsRow}>
          <span className={styles.statPill}>
            <i className="fa-solid fa-box-open" aria-hidden="true"></i>
            <span>{category.productCount}</span>
            <span className={styles.statLabel}>Product{category.productCount === 1 ? '' : 's'}</span>
          </span>
          <span className={styles.statPill}>
            <i className="fa-solid fa-layer-group" aria-hidden="true"></i>
            <span>{category.variationCount}</span>
            <span className={styles.statLabel}>Variation{category.variationCount === 1 ? '' : 's'}</span>
          </span>
        </div>

        <button
          type="button"
          className={styles.viewButton}
          onClick={() => onOpen(category.id)}
          aria-label={`View products in ${category.title}`}
          title={`View products in ${category.title}`}
        >
          <i className={`fa-solid fa-eye ${styles.viewButtonIcon}`} aria-hidden="true"></i>
          <span className={styles.viewButtonText}>View Products</span>
        </button>
      </div>
    </article>
  );
}
