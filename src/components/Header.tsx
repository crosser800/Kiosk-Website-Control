import styles from './Header.module.css';
import ThemeToggle from './ThemeToggle';

type HeaderProps = {
  active: string;
  isCollapsed: boolean;
  isDark: boolean;
  onToggle: () => void;
};

export default function Header({
  active,
  isCollapsed,
  isDark,
  onToggle,
}: HeaderProps) {
  return (
    <div className={`${styles.header} ${isCollapsed ? styles.collapsed : ''}`}>
      <h1 className={styles.title}>{active}</h1>
      <ThemeToggle isDark={isDark} onToggle={onToggle} />
    </div>
  );
}
