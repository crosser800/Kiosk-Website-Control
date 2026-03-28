import styles from './MainContent.module.css';

type MainContentProps = {
  children: React.ReactNode;
  isCollapsed: boolean;
};

export default function MainContent({ children, isCollapsed }: MainContentProps) {
  return (
    <div className={`${styles.mainContent} ${isCollapsed ? styles.collapsed : ''}`}>
      {children}
    </div>
  );
}