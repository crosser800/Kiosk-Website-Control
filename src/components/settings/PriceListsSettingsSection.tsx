import { useEffect, useState } from 'react';
import {
  emptyPriceListSlots,
  loadPriceListSlots,
  savePriceListSlots,
  type PriceListCounts,
  type PriceListLink,
} from '../../services/priceLists';
import SettingsAccordionItem from './SettingsAccordionItem';
import sectionStyles from './SupabaseSettingsSection.module.css';
import type { SettingPanel } from './settingsShared';

type Props = { activePanel: SettingPanel | null; onToggle: (panel: SettingPanel) => void };

const emptyCounts: PriceListCounts = { total: 0, active: 0, inactive: 0 };

function isValidExternalUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

export default function PriceListsSettingsSection({ activePanel, onToggle }: Props) {
  const [links, setLinks] = useState<PriceListLink[]>(emptyPriceListSlots);
  const [counts, setCounts] = useState<PriceListCounts>(emptyCounts);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (activePanel !== 'priceLists') return;

    let isCurrent = true;
    setIsLoading(true);
    setError('');
    setMessage('');
    void loadPriceListSlots()
      .then(({ links: loadedLinks, counts: loadedCounts }) => {
        if (!isCurrent) return;
        setLinks(loadedLinks);
        setCounts(loadedCounts);
      })
      .catch((loadError) => {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : 'Failed to load price lists.');
      })
      .finally(() => {
        if (isCurrent) setIsLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [activePanel]);
  const update = (index: number, field: keyof PriceListLink, value: string) => setLinks((current) => current.map((link, i) => i === index ? { ...link, [field]: value } : link));
  const save = async () => {
    setError(''); setMessage('');
    const normalized = links.map((link, index) => ({ ...link, name: link.name.trim(), embedUrl: link.embedUrl.trim(), sortOrder: index + 1 }));
    for (let index = 0; index < normalized.length; index += 1) {
      const link = normalized[index];
      if (!link.name && !link.embedUrl) continue;
      if (!link.name || !link.embedUrl) { setError(`List ${index + 1} requires both Button Name and Google Drive Link.`); return; }
      if (!isValidExternalUrl(link.embedUrl)) { setError(`List ${index + 1} link must start with http:// or https://.`); return; }
    }
    setIsSaving(true);
    try {
      await savePriceListSlots(normalized);
      const { links: loadedLinks, counts: loadedCounts } = await loadPriceListSlots();
      setLinks(loadedLinks);
      setCounts(loadedCounts);
      setMessage('Price lists saved to database.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save price lists.');
    } finally {
      setIsSaving(false);
    }
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
      <div className={sectionStyles.formActions}><button type="button" className={sectionStyles.primaryButton} onClick={() => void save()} disabled={isLoading || isSaving}>{isSaving ? 'Saving...' : 'Save Price Lists'}</button></div>
      <div className={sectionStyles.message}>{error ? <p className={sectionStyles.error}>{error}</p> : null}{message ? <p className={sectionStyles.success}>{message}</p> : null}</div>
    </section> : null}
  </SettingsAccordionItem>;
}
