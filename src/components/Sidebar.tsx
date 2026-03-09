import { useState } from 'react';
import styles from './Sidebar.module.css';

type SidebarProps = {
  active: string;
  onNavigate: (item: string) => void;
};

const navItems = [
  { name: 'Dashboard', icon: 'fa-solid fa-house' },
  { name: 'Product', icon: 'fa-solid fa-box' },
  { name: 'Order', icon: 'fa-solid fa-cart-shopping' },
  { name: 'Sales', icon: 'fa-solid fa-chart-line' },
  { name: 'Accounts', icon: 'fa-solid fa-user' },
  { name: 'Settings', icon: 'fa-solid fa-gear' },
];

export default function Sidebar({ active, onNavigate }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <div className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.header}>
        <div className={styles.logo}>
          <img
            src="https://scontent.fmnl4-7.fna.fbcdn.net/v/t39.30808-6/438305809_761408289526578_4101745812543014310_n.jpg?_nc_cat=104&ccb=1-7&_nc_sid=1d70fc&_nc_eui2=AeHDogL82pfmiPDYxyBsmBFxLkGpnGs5_f8uQamcazn9_6NnHKxsvF1fUnpBEbMjfhmUsl3PFwKwAdJtG3aeKJNj&_nc_ohc=Ze3spUpeyOkQ7kNvwHNgGvK&_nc_oc=AdkIaF-tG_4N306gVYgB1StXzQvPAxlQRQdMYXo4lfeJfnoZykRrcqRZXDQ8Izdv1YTWoFiNdSJqW63QZLXsYDxB&_nc_zt=23&_nc_ht=scontent.fmnl4-7.fna&_nc_gid=Ipw0c7zkyGlClpHHSUD4LA&_nc_ss=8&oh=00_Afv9CB4-5RTyG0EO_tjPD2BMh_lQveTFJvSibx5__ZIRhQ&oe=69A86950"
            alt="logo"
          />
          {!isCollapsed && <span>BESTBUILT</span>}
        </div>
        <button
          className={styles.toggleBtn}
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label="Toggle sidebar"
        >
          <i className="fa-solid fa-bars"></i>
        </button>
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
