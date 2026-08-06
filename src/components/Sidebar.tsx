import { useEffect, useRef, useState } from 'react';
import styles from './Sidebar.module.css';
import logo from '../assets/2B LOGO.png';

type SidebarProps = {
  active: string;
  onNavigate: (item: string) => void;
  isCollapsed: boolean;
  canToggle: boolean;
  onToggle: (val: boolean) => void;
  onLogout: () => void;
  onAccount: () => void;
  accountName: string;
  accountRole: string;
  accountImageUrl?: string;
  allowedItems?: string[];
};

const navItems = [
  { name: 'Dashboard', icon: 'fa-solid fa-house' },
  { name: 'Products', icon: 'fa-solid fa-box' },
  { name: 'Order', icon: 'fa-solid fa-cart-shopping' },
  { name: 'Sales', icon: 'fa-solid fa-chart-line' },
  { name: 'Accounts', icon: 'fa-solid fa-user' },
  { name: 'Settings', icon: 'fa-solid fa-gear' },
];

export default function Sidebar({
  active,
  onNavigate,
  isCollapsed,
  canToggle,
  onToggle,
  onLogout,
  onAccount,
  accountName,
  accountRole,
  accountImageUrl = '',
  allowedItems,
}: SidebarProps) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] =
    useState(false);
  const accountAreaRef = useRef<HTMLDivElement | null>(null);
  const accountInitial =
    accountName.trim().charAt(0).toUpperCase() || 'A';
  const visibleNavItems = allowedItems
    ? navItems.filter((item) => allowedItems.includes(item.name))
    : navItems;

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        accountAreaRef.current?.contains(
          event.target as Node,
        )
      ) {
        return;
      }

      setIsAccountMenuOpen(false);
    };

    window.addEventListener('pointerdown', handlePointerDown);
    return () =>
      window.removeEventListener(
        'pointerdown',
        handlePointerDown,
      );
  }, [isAccountMenuOpen]);

  const handleAccountClick = () => {
    setIsAccountMenuOpen(false);
    onAccount();
  };

  const handleLogoutClick = () => {
    setIsAccountMenuOpen(false);
    onLogout();
  };

  return (
    <aside id="app-sidebar" className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        {isCollapsed && canToggle ? (
          <button
            className={`${styles.logo} ${styles.logoBtn}`}
            onClick={() => onToggle(false)}
            aria-label="Open sidebar"
          >
            <img src={logo} alt="logo" />
          </button>
        ) : isCollapsed ? (
          <div className={styles.logo}>
            <img src={logo} alt="BestBuilt" />
          </div>
        ) : (
          <>
            <div className={styles.logo}>
              <img src={logo} alt="logo" />
            </div>
            <button
              type="button"
              className={styles.toggleBtn}
              onClick={() => onToggle(true)}
              aria-label="Close sidebar"
              title="Close sidebar"
            >
              <i className={`fa-solid fa-bars ${styles.desktopToggleIcon}`} aria-hidden="true"></i>
              <i className={`fa-solid fa-arrow-left ${styles.mobileToggleIcon}`} aria-hidden="true"></i>
            </button>
          </>
        )}
      </div>

      <nav className={styles.nav}>
        {visibleNavItems.map((item) => (
          <button
            key={item.name}
            type="button"
            className={`${styles.navItem} ${active === item.name ? styles.active : ''}`}
            onClick={() => {
              setIsAccountMenuOpen(false);
              onNavigate(item.name);
            }}
            aria-label={item.name}
            aria-current={active === item.name ? 'page' : undefined}
            title={isCollapsed ? item.name : ''}
          >
            <span className={styles.iconWrap}>
              <i className={`${item.icon} ${styles.icon}`}></i>
            </span>
            <span className={styles.label}>{item.name}</span>
          </button>
        ))}
      </nav>

      <div className={styles.accountArea} ref={accountAreaRef}>
        {isAccountMenuOpen ? (
          <div className={styles.accountMenu} role="menu">
            <button
              type="button"
              className={styles.accountMenuItem}
              onClick={handleAccountClick}
              role="menuitem"
            >
              <i className="fa-regular fa-circle-user"></i>
              <span>Account</span>
            </button>
            <button
              type="button"
              className={styles.accountMenuItem}
              onClick={handleLogoutClick}
              role="menuitem"
            >
              <i className="fa-solid fa-arrow-right-from-bracket"></i>
              <span>Logout</span>
            </button>
          </div>
        ) : null}

        <div
          className={styles.accountCard}
          onClick={() =>
            setIsAccountMenuOpen((current) => !current)
          }
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' ||
              event.key === ' '
            ) {
              event.preventDefault();
              setIsAccountMenuOpen(
                (current) => !current,
              );
            }
          }}
          role="button"
          tabIndex={0}
          title="Account menu"
        >
          <span className={styles.accountAvatar}>
            {accountImageUrl ? (
              <img src={accountImageUrl} alt="" />
            ) : (
              accountInitial
            )}
          </span>
          <span className={styles.accountInfo}>
            <span className={styles.accountName}>
              {accountName}
            </span>
            <span className={styles.accountRole}>
              {accountRole}
            </span>
          </span>
          <button
            type="button"
            className={styles.accountMenuBtn}
            onClick={(event) => {
              event.stopPropagation();
              setIsAccountMenuOpen((current) => !current)
            }}
            aria-label="Open account menu"
            aria-expanded={isAccountMenuOpen}
            title="Account menu"
          >
            <i className="fa-solid fa-ellipsis-vertical"></i>
          </button>
        </div>
      </div>
    </aside>
  );
}
