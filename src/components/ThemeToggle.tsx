import styles from './ThemeToggle.module.css';

type ThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
};

export default function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <button
      className={styles.button}
      onClick={onToggle}
      type="button"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <i className={`fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" />
    </button>
  );
}
