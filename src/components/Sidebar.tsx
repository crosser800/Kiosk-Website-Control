import styles from './Sidebar.module.css';
import logo from '../assets/2B LOGO.png';

type SidebarProps = {
  active: string;
  onNavigate: (item: string) => void;
  isCollapsed: boolean;
  onToggle: (val: boolean) => void;
  onLogout: () => void;
};

const navItems = [
  { name: 'Dashboard', icon: 'fa-solid fa-house' },
  { name: 'Products', icon: 'fa-solid fa-box' },
  { name: 'Order', icon: 'fa-solid fa-cart-shopping' },
  { name: 'Sales', icon: 'fa-solid fa-chart-line' },
  { name: 'Accounts', icon: 'fa-solid fa-user' },
  { name: 'Settings', icon: 'fa-solid fa-gear' },
];

export default function Sidebar({ active, onNavigate, isCollapsed, onToggle, onLogout }: SidebarProps) {
  return (
    <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        {isCollapsed ? (
          <button
            className={`${styles.logo} ${styles.logoBtn}`}
            onClick={() => onToggle(false)}
            aria-label="Open sidebar"
          >
            <img src={logo} alt="logo" />
          </button>
        ) : (
          <>
            <div className={styles.logo}>
              <img src={logo} alt="logo" />
            </div>
            <button
              className={styles.toggleBtn}
              onClick={() => onToggle(true)}
              aria-label="Close sidebar"
            >
              <i className="fa-solid fa-bars"></i>
            </button>
          </>
        )}
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <button
            key={item.name}
            type="button"
            className={`${styles.navItem} ${active === item.name ? styles.active : ''}`}
            onClick={() => onNavigate(item.name)}
            title={isCollapsed ? item.name : ''}
          >
            <span className={styles.iconWrap}>
              <i className={`${item.icon} ${styles.icon}`}></i>
            </span>
            {!isCollapsed && <span className={styles.label}>{item.name}</span>}
          </button>
        ))}
      </nav>

      <button type="button" className={styles.logout} onClick={onLogout}>
        <span className={styles.iconWrap}>
          <i className="fa-solid fa-right-from-bracket"></i>
        </span>
        {!isCollapsed && <span className={styles.label}>Logout</span>}
      </button>
    </div>
  );
}
