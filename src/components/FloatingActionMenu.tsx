import { useEffect, useRef, useState } from 'react';
import styles from './FloatingActionMenu.module.css';
import type { PriceListRecord } from '../services/priceLists';

type FloatingActionMenuProps = {
  onLogout: () => void;
  priceLists: PriceListRecord[];
};

export default function FloatingActionMenu({
  onLogout,
  priceLists,
}: FloatingActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [arePriceListsOpen, setArePriceListsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setArePriceListsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
        setArePriceListsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const runAction = (action?: () => void) => {
    setIsOpen(false);
    action?.();
  };

  return (
    <div
      ref={menuRef}
      className={`${styles.menu} ${isOpen ? styles.open : ''}`}
    >
      <div className={styles.actions} aria-hidden={!isOpen}>
        {arePriceListsOpen
          ? priceLists.map((priceList) => (
              <button
                key={priceList.id}
                type="button"
                className={`${styles.actionButton} ${styles.priceListRecord}`}
                onClick={() => {
                  window.open(priceList.fileUrl, '_blank', 'noopener,noreferrer');
                  setIsOpen(false);
                  setArePriceListsOpen(false);
                }}
                title={priceList.name}
              >
                <i className="fa-solid fa-file-pdf" aria-hidden="true" />
                <span>{priceList.name}</span>
              </button>
            ))
          : null}

        <button
          type="button"
          className={styles.actionButton}
          onClick={() => setArePriceListsOpen((current) => !current)}
          tabIndex={isOpen ? 0 : -1}
          aria-label="Open price list"
          title={priceLists.length ? 'Price Lists' : 'No active price lists'}
          aria-expanded={arePriceListsOpen}
        >
          <i className="fa-solid fa-tags" aria-hidden="true" />
        </button>

        <button
          type="button"
          className={`${styles.actionButton} ${styles.logoutButton}`}
          onClick={() => runAction(onLogout)}
          tabIndex={isOpen ? 0 : -1}
          aria-label="Log out"
          title="Log Out"
        >
          <i className="fa-solid fa-right-from-bracket" aria-hidden="true" />
        </button>
      </div>

      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setIsOpen((current) => {
            if (current) setArePriceListsOpen(false);
            return !current;
          });
        }}
        aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'}
        aria-expanded={isOpen}
      >
        <i className="fa-solid fa-chevron-left" aria-hidden="true" />
      </button>
    </div>
  );
}
