import styles from './Header.module.css';

type HeaderProps = {
  active: string;
  isCollapsed: boolean;
};

export default function Header({ active, isCollapsed }: HeaderProps) {
  return (
    <div className={`${styles.header} ${isCollapsed ? styles.collapsed : ''}`}>
      <h1 className={styles.title}>{active}</h1>
    </div>
  );
}
