import { useEffect, useState } from 'react';
import AccountHandling from '../components/settings/AccountHandling';
import BranchTypes from '../components/settings/BranchTypes';
import DeliveryTerms from '../components/settings/DeliveryTerms';
import {
  getAccountHandlingItems,
  subscribeAccountHandlingItems,
} from '../services/accountHandling';
import { getBranchTypeItems, subscribeBranchTypeItems } from '../services/branchTypes';
import { getDeliveryTermItems, subscribeDeliveryTermItems } from '../services/deliveryTerms';
import styles from './Settings.module.css';

type SettingPanel = 'accountHandling' | 'branchTypes' | 'deliveryTerms';

type CountableItem = {
  status: 'active' | 'inactive';
};

function getCounts(items: CountableItem[]) {
  return {
    active: items.filter((item) => item.status === 'active').length,
    inactive: items.filter((item) => item.status === 'inactive').length,
    total: items.length,
  };
}

export default function Settings() {
  const [activePanel, setActivePanel] = useState<SettingPanel | null>(null);
  const [accountHandlings, setAccountHandlings] = useState(() => getAccountHandlingItems());
  const [branchTypes, setBranchTypes] = useState(() => getBranchTypeItems());
  const [deliveryTerms, setDeliveryTerms] = useState(() => getDeliveryTermItems());
  const isAccountHandlingOpen = activePanel === 'accountHandling';
  const isBranchTypesOpen = activePanel === 'branchTypes';
  const isDeliveryTermsOpen = activePanel === 'deliveryTerms';
  const accountHandlingCounts = getCounts(accountHandlings);
  const branchTypeCounts = getCounts(branchTypes);
  const deliveryTermCounts = getCounts(deliveryTerms);

  useEffect(() => subscribeAccountHandlingItems(setAccountHandlings), []);
  useEffect(() => subscribeBranchTypeItems(setBranchTypes), []);
  useEffect(() => subscribeDeliveryTermItems(setDeliveryTerms), []);

  function togglePanel(panel: SettingPanel) {
    setActivePanel((currentPanel) => (currentPanel === panel ? null : panel));
  }

  function renderCountPills(counts: ReturnType<typeof getCounts>) {
    return (
      <span className={styles.countPills} aria-hidden="true">
        <span className={styles.countPill}>{counts.total} total</span>
        <span className={styles.countPill}>{counts.active} active</span>
        <span className={styles.countPill}>{counts.inactive} inactive</span>
      </span>
    );
  }

  return (
    <div className={styles.settings}>
      <div className={`${styles.settingContainer} ${isAccountHandlingOpen ? styles.active : ''}`}>
        <button
          type="button"
          className={styles.dropdownButton}
          onClick={() => togglePanel('accountHandling')}
          aria-expanded={isAccountHandlingOpen}
          aria-controls="account-handling-panel"
        >
          <span className={styles.leadingIcon}>
            <i className="fa-solid fa-users-gear" aria-hidden="true"></i>
          </span>
          <span className={styles.buttonText}>Accounts Handling</span>
          {renderCountPills(accountHandlingCounts)}
          <i className={`fa-solid fa-chevron-down ${styles.chevron}`} aria-hidden="true"></i>
        </button>

        <div
          id="account-handling-panel"
          className={styles.panelWrap}
          aria-hidden={!isAccountHandlingOpen}
        >
          <div className={styles.panelInner}>
            <AccountHandling />
          </div>
        </div>
      </div>

      <div className={`${styles.settingContainer} ${isBranchTypesOpen ? styles.active : ''}`}>
        <button
          type="button"
          className={styles.dropdownButton}
          onClick={() => togglePanel('branchTypes')}
          aria-expanded={isBranchTypesOpen}
          aria-controls="branch-types-panel"
        >
          <span className={styles.leadingIcon}>
            <i className="fa-solid fa-store" aria-hidden="true"></i>
          </span>
          <span className={styles.buttonText}>Branch Types</span>
          {renderCountPills(branchTypeCounts)}
          <i className={`fa-solid fa-chevron-down ${styles.chevron}`} aria-hidden="true"></i>
        </button>

        <div
          id="branch-types-panel"
          className={styles.panelWrap}
          aria-hidden={!isBranchTypesOpen}
        >
          <div className={styles.panelInner}>
            <BranchTypes />
          </div>
        </div>
      </div>

      <div className={`${styles.settingContainer} ${isDeliveryTermsOpen ? styles.active : ''}`}>
        <button
          type="button"
          className={styles.dropdownButton}
          onClick={() => togglePanel('deliveryTerms')}
          aria-expanded={isDeliveryTermsOpen}
          aria-controls="delivery-terms-panel"
        >
          <span className={styles.leadingIcon}>
            <i className="fa-solid fa-truck-fast" aria-hidden="true"></i>
          </span>
          <span className={styles.buttonText}>Delivery Terms</span>
          {renderCountPills(deliveryTermCounts)}
          <i className={`fa-solid fa-chevron-down ${styles.chevron}`} aria-hidden="true"></i>
        </button>

        <div
          id="delivery-terms-panel"
          className={styles.panelWrap}
          aria-hidden={!isDeliveryTermsOpen}
        >
          <div className={styles.panelInner}>
            <DeliveryTerms />
          </div>
        </div>
      </div>
    </div>
  );
}
