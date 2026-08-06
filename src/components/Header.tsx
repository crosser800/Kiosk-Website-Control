import styles from './Header.module.css';
import ThemeToggle from './ThemeToggle';

type HeaderProps = {
  active: string;
  isCollapsed: boolean;
  isDark: boolean;
  onToggle: () => void;
  onToggleSidebar: () => void;
};

export default function Header({
  active,
  isCollapsed,
  isDark,
  onToggle,
  onToggleSidebar,
}: HeaderProps) {
  return (
    <div className={`${styles.header} ${isCollapsed ? styles.collapsed : ''}`}>
      <div className={styles.titleArea}>
        <button
          type="button"
          className={styles.menuButton}
          onClick={onToggleSidebar}
          aria-label={isCollapsed ? 'Open sidebar' : 'Close sidebar'}
          aria-expanded={!isCollapsed}
          aria-controls="app-sidebar"
        >
          <i className="fa-solid fa-bars" aria-hidden="true"></i>
        </button>
        <h1 className={styles.title}>{active}</h1>
      </div>
      <ThemeToggle isDark={isDark} onToggle={onToggle} />
    </div>
  );
}
