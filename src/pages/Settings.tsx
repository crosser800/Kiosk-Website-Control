import { useMemo, useState } from 'react';
import AdministrationSettingsSection from '../components/settings/AdministrationSettingsSection';
import AgentGroupsSettingsSection from '../components/settings/AgentGroupsSettingsSection';
import BranchesSettingsSection from '../components/settings/BranchesSettingsSection';
import BrandsSettingsSection from '../components/settings/BrandsSettingsSection';
import CategoriesSettingsSection from '../components/settings/CategoriesSettingsSection';
import DeliveryTermsSettingsSection from '../components/settings/DeliveryTermsSettingsSection';
import InternalAdminRolesSettingsSection from '../components/settings/InternalAdminRolesSettingsSection';
import PreferenceTypesSettingsSection from '../components/settings/PreferenceTypesSettingsSection';
import PriceClassesSettingsSection from '../components/settings/PriceClassesSettingsSection';
import ThemeToggle from '../components/ThemeToggle';
import {
  type SettingPanel,
  type StatusValue,
} from '../components/settings/settingsShared';
import styles from './Settings.module.css';

type PreferenceOption = {
  label: string;
  value: string;
};

type PreferenceTypeRecord = {
  id: string;
  preference_name: string;
  preference_code: string;
  description: string;
  status: StatusValue;
  sort_order: number;
};

type SettingsProps = {
  isDark: boolean;
  onToggleTheme: () => void;
};

export default function Settings({ isDark, onToggleTheme }: SettingsProps) {
  const [activePanel, setActivePanel] = useState<SettingPanel | null>(null);
  const [preferenceTypeRecords, setPreferenceTypeRecords] = useState<PreferenceTypeRecord[]>([]);

  const preferenceOptions = useMemo<PreferenceOption[]>(
    () =>
      preferenceTypeRecords.map((item) => ({
        label: `${item.preference_name} (${item.preference_code})`,
        value: item.preference_code,
      })),
    [preferenceTypeRecords],
  );

  function togglePanel(panel: SettingPanel) {
    setActivePanel((currentPanel) => (currentPanel === panel ? null : panel));
  }

  return (
    <div className={styles.settings}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Control center</p>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            Maintain system masters and configuration panels in one cleaner themed workspace.
          </p>
        </div>
      </section>

      <div className={`${styles.settingContainer} ${activePanel === 'appearance' ? styles.active : ''}`}>
        <button
          type="button"
          className={styles.dropdownButton}
          onClick={() => togglePanel('appearance')}
          aria-expanded={activePanel === 'appearance'}
          aria-controls="appearance-panel"
        >
          <span className={styles.leadingIcon}>
            <i className="fa-solid fa-palette" aria-hidden="true"></i>
          </span>
          <span className={styles.buttonText}>Appearance</span>
          <i className={`fa-solid fa-chevron-down ${styles.chevron}`} aria-hidden="true"></i>
        </button>

        <div
          id="appearance-panel"
          className={styles.panelWrap}
          aria-hidden={activePanel !== 'appearance'}
        >
          <div className={styles.panelInner}>
            <div className={styles.appearancePanel}>
              <div>
                <p className={styles.appearanceTitle}>Dark mode</p>
                <p className={styles.appearanceText}>
                  Switch the admin workspace between light and dark appearance.
                </p>
              </div>
              <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
            </div>
          </div>
        </div>
      </div>

      <AdministrationSettingsSection activePanel={activePanel} onToggle={togglePanel} />
      <InternalAdminRolesSettingsSection activePanel={activePanel} onToggle={togglePanel} />
      <AgentGroupsSettingsSection activePanel={activePanel} onToggle={togglePanel} />
      <BranchesSettingsSection activePanel={activePanel} onToggle={togglePanel} />
      <PreferenceTypesSettingsSection
        activePanel={activePanel}
        onToggle={togglePanel}
        onItemsChange={setPreferenceTypeRecords}
      />
      <PriceClassesSettingsSection
        activePanel={activePanel}
        onToggle={togglePanel}
        preferenceOptions={preferenceOptions}
      />
      <DeliveryTermsSettingsSection activePanel={activePanel} onToggle={togglePanel} />
      <CategoriesSettingsSection activePanel={activePanel} onToggle={togglePanel} />
      <BrandsSettingsSection activePanel={activePanel} onToggle={togglePanel} />
    </div>
  );
}
