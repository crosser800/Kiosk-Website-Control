import styles from './Header.module.css';
import ThemeToggle from './ThemeToggle';

type HeaderProps = {
  active: string;
  isDark: boolean;
  onToggle: () => void;
};

export default function Header({ active, isDark, onToggle }: HeaderProps) {
  return (
    <div className={styles.header}>
      <h1 className={styles.title}>{active}</h1>
      <ThemeToggle isDark={isDark} onToggle={onToggle} />
    </div>
  );
}
