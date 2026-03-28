import styles from './Sidebar.module.css';
import logo from "../assets/2B LOGO.png";

type SidebarProps = {
  active: string;
  onNavigate: (item: string) => void;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
};

const navItems = [
  { name: 'Dashboard', icon: 'fa-solid fa-house' },
  { name: 'Product', icon: 'fa-solid fa-box' },
  { name: 'Order', icon: 'fa-solid fa-cart-shopping' },
  { name: 'Sales', icon: 'fa-solid fa-chart-line' },
  { name: 'Accounts', icon: 'fa-solid fa-user' },
  { name: 'Settings', icon: 'fa-solid fa-gear' },
];

export default function Sidebar({ active, onNavigate, isCollapsed, setIsCollapsed }: SidebarProps) {

  return (
    <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        {isCollapsed ? (
          <button
            className={`${styles.logo} ${styles.logoBtn}`}
            onClick={() => setIsCollapsed(false)}
            aria-label="Open sidebar"
          >
            <img src={logo} alt="logo" />
          </button>
        ) : (
          <>
            <div className={styles.logo}>
              <img src={logo} alt="logo" />
              <span>BESTBUILT</span>
            </div>
            <button
              className={styles.toggleBtn}
              onClick={() => setIsCollapsed(true)}
              aria-label="Close sidebar"
            >
              <i className="fa-solid fa-bars"></i>
            </button>
          </>
        )}
      </div>

      <nav className={styles.nav}>
        {navItems.map((item) => (
          <div
            key={item.name}
            className={`${styles.navItem} ${
              active === item.name ? styles.active : ''
            }`}
            onClick={() => onNavigate(item.name)}
            title={isCollapsed ? item.name : ''}
          >
            <i className={`${item.icon} ${styles.icon}`}></i>
            {!isCollapsed && <span className={styles.label}>{item.name}</span>}
          </div>
        ))}
      </nav>

      <div className={`${styles.logout} ${isCollapsed ? styles.iconOnly : ''}`}>
        <i className="fa-solid fa-right-from-bracket"></i>
        {!isCollapsed && <span className={styles.label}>Logout</span>}
      </div>
    </div>
  );
}
