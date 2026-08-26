import { useEffect, useMemo, useState } from 'react';
import { driveLinkToEmbedUrl, loadPriceListSlots, PRICE_LIST_SLOT_COUNT, savePriceListSlots, type PriceListLink } from '../../services/priceLists';
import SettingsAccordionItem from './SettingsAccordionItem';
import sectionStyles from './SupabaseSettingsSection.module.css';
import type { SettingPanel } from './settingsShared';

type Props = { activePanel: SettingPanel | null; onToggle: (panel: SettingPanel) => void };

export default function PriceListsSettingsSection({ activePanel, onToggle }: Props) {
  const [links, setLinks] = useState<PriceListLink[]>(loadPriceListSlots);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (activePanel === 'priceLists') setLinks(loadPriceListSlots()); }, [activePanel]);
  const configured = useMemo(() => links.filter((link) => link.name.trim() && link.embedUrl.trim()).length, [links]);
  const counts = { total: PRICE_LIST_SLOT_COUNT, active: configured, inactive: PRICE_LIST_SLOT_COUNT - configured };
  const update = (index: number, field: keyof PriceListLink, value: string) => setLinks((current) => current.map((link, i) => i === index ? { ...link, [field]: value } : link));
  const save = () => {
    setError(''); setMessage('');
    const normalized = links.map((link) => ({ name: link.name.trim(), embedUrl: link.embedUrl.trim() }));
    for (let index = 0; index < normalized.length; index += 1) {
      const link = normalized[index];
      if (!link.name && !link.embedUrl) continue;
      if (!link.name || !link.embedUrl) { setError(`List ${index + 1} needs both a button name and an embed link.`); return; }
      if (!driveLinkToEmbedUrl(link.embedUrl)) { setError(`List ${index + 1} needs a valid Google Drive file sharing link.`); return; }
    }
    savePriceListSlots(normalized); setLinks(normalized); setMessage('Price lists saved on this device.');
  };

  return <SettingsAccordionItem panel="priceLists" activePanel={activePanel} onToggle={onToggle} iconClassName="fa-solid fa-file-pdf" title="Price Lists" counts={counts}>
    {activePanel === 'priceLists' ? <section className={sectionStyles.panel}>
      <div className={sectionStyles.header}><div><h2 className={sectionStyles.title}>Price Lists</h2><p className={sectionStyles.subtitle}>Configure up to 10 Google Drive PDF links. The program converts each sharing link for the built-in viewer.</p></div></div>
      <div className={sectionStyles.form}>
        {links.map((link, index) => <div className={sectionStyles.fieldWide} key={index}>
          <div className={sectionStyles.form}>
            <label className={sectionStyles.field}><span className={sectionStyles.label}>List {index + 1} — Button Name</span><input className={sectionStyles.input} value={link.name} onChange={(event) => update(index, 'name', event.target.value)} placeholder={`Price List ${index + 1}`} /></label>
            <label className={sectionStyles.field}><span className={sectionStyles.label}>Google Drive Link</span><input className={sectionStyles.input} value={link.embedUrl} onChange={(event) => update(index, 'embedUrl', event.target.value)} placeholder="https://drive.google.com/file/d/.../view" /></label>
          </div>
        </div>)}
      </div>
      <div className={sectionStyles.formActions}><button type="button" className={sectionStyles.primaryButton} onClick={save}>Save Price Lists</button></div>
      <div className={sectionStyles.message}>{error ? <p className={sectionStyles.error}>{error}</p> : null}{message ? <p className={sectionStyles.success}>{message}</p> : null}</div>
    </section> : null}
  </SettingsAccordionItem>;
}
