import styles from './MainContent.module.css';

type MainContentProps = {
  children: React.ReactNode;
  isCollapsed: boolean;
  contentKey: string;
};

export default function MainContent({ children, isCollapsed, contentKey }: MainContentProps) {
  return (
    <div className={`${styles.mainContent} ${isCollapsed ? styles.collapsed : ''}`}>
      <div key={contentKey} className={styles.contentFrame}>
        {children}
      </div>
    </div>
  );
}
