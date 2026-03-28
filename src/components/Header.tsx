// Header.tsx
import styles from './Header.module.css';
import ThemeToggle from './ThemeToggle';

type HeaderProps = {
  active: string;
  isDark: boolean;
  onToggle: () => void;
  isCollapsed: boolean;   // ← add this
};

export default function Header({ active, isDark, onToggle, isCollapsed }: HeaderProps) {
  return (
    <div
      className={styles.header}
      style={{
        left: isCollapsed ? '80px' : '300px',   // adjusts with sidebar
        transition: 'left 0.3s ease',
      }}
    >
      <h1 className={styles.title}>{active}</h1>
      <ThemeToggle isDark={isDark} onToggle={onToggle} />
    </div>
  );
}