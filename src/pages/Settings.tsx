import { useMemo, useState } from 'react';
import BranchesSettingsSection from '../components/settings/BranchesSettingsSection';
import BrandsSettingsSection from '../components/settings/BrandsSettingsSection';
import CategoriesSettingsSection from '../components/settings/CategoriesSettingsSection';
import DeliveryTermsSettingsSection from '../components/settings/DeliveryTermsSettingsSection';
import PreferenceTypesSettingsSection from '../components/settings/PreferenceTypesSettingsSection';
import PriceClassesSettingsSection from '../components/settings/PriceClassesSettingsSection';
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

export default function Settings() {
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
