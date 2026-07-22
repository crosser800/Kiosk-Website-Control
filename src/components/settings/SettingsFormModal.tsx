import { createPortal } from 'react-dom';
import styles from './SettingsFormModal.module.css';

type SettingsFormModalProps = {
  isOpen: boolean;
  title: string;
  subtitle: string;
  primaryLabel: string;
  isSubmitting?: boolean;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
  children: React.ReactNode;
};

export default function SettingsFormModal({
  isOpen,
  title,
  subtitle,
  primaryLabel,
  isSubmitting = false,
  onClose,
  onSubmit,
  children,
}: SettingsFormModalProps) {
  if (!isOpen) {
    return null;
  }

  const modalContent = (
    <div className={styles.overlay} role="presentation">
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <div>
            <h3 className={styles.title}>{title}</h3>
            <p className={styles.subtitle}>{subtitle}</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close form">
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>

        {children}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={() => void onSubmit()}
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Saving...' : primaryLabel}
          </button>
          <button type="button" className={styles.secondaryButton} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
}
