import styles from '../../pages/Settings.module.css';
import type { SettingPanel } from './settingsShared';

type Counts = {
  total: number;
  active: number;
  inactive: number;
};

type SettingsAccordionItemProps = {
  panel: SettingPanel;
  activePanel: SettingPanel | null;
  onToggle: (panel: SettingPanel) => void;
  iconClassName: string;
  title: string;
  counts: Counts;
  children: React.ReactNode;
};

export default function SettingsAccordionItem({
  panel,
  activePanel,
  onToggle,
  iconClassName,
  title,
  counts,
  children,
}: SettingsAccordionItemProps) {
  const isOpen = activePanel === panel;

  return (
    <div className={`${styles.settingContainer} ${isOpen ? styles.active : ''}`}>
      <button
        type="button"
        className={styles.dropdownButton}
        onClick={() => onToggle(panel)}
        aria-expanded={isOpen}
        aria-controls={`${panel}-panel`}
      >
        <span className={styles.leadingIcon}>
          <i className={iconClassName} aria-hidden="true"></i>
        </span>
        <span className={styles.buttonText}>{title}</span>
        <span className={styles.countPills} aria-hidden="true">
          <span className={styles.countPill}>{counts.total} total</span>
          <span className={styles.countPill}>{counts.active} active</span>
          <span className={styles.countPill}>{counts.inactive} inactive</span>
        </span>
        <i className={`fa-solid fa-chevron-down ${styles.chevron}`} aria-hidden="true"></i>
      </button>

      <div id={`${panel}-panel`} className={styles.panelWrap} aria-hidden={!isOpen}>
        <div className={styles.panelInner}>{children}</div>
      </div>
    </div>
  );
}
