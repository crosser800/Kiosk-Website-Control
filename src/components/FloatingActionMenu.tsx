import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './FloatingActionMenu.module.css';
import { driveLinkToEmbedUrl, type PriceListLink, type PriceListRecord } from '../services/priceLists';

type Props = { onLogout: () => void; priceLists: PriceListRecord[] };
type ViewerRect = { x: number; y: number; width: number; height: number };
type ResizeDirection = 'move' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export default function FloatingActionMenu({ onLogout, priceLists }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [arePriceListsOpen, setArePriceListsOpen] = useState(false);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<PriceListLink | null>(null);
  const [isViewerMinimized, setIsViewerMinimized] = useState(false);
  const [viewerRect, setViewerRect] = useState<ViewerRect | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const pointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) { setIsOpen(false); setArePriceListsOpen(false); setExpandedRecordId(null); }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setIsOpen(false); setArePriceListsOpen(false); setExpandedRecordId(null); }
    };
    document.addEventListener('pointerdown', pointer); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', pointer); window.removeEventListener('keydown', key); };
  }, [isOpen]);

  const openLink = (link: PriceListLink) => {
    const width = Math.min(768, window.innerWidth - 32);
    const height = Math.min(672, window.innerHeight - 32);
    setViewerRect({ x: Math.max(16, window.innerWidth - width - 16), y: Math.max(16, window.innerHeight - height - 16), width, height });
    setViewer(link); setIsViewerMinimized(false); setIsOpen(false); setArePriceListsOpen(false); setExpandedRecordId(null);
  };
  const chooseRecord = (record: PriceListRecord) => {
    if (record.links.length === 1) openLink(record.links[0]);
    else setExpandedRecordId((current) => current === record.id ? null : record.id);
  };
  const expandedRecord = priceLists.find((record) => record.id === expandedRecordId);
  const beginViewerInteraction = (direction: ResizeDirection, event: ReactPointerEvent) => {
    if (event.button !== 0 || !viewerRef.current || isViewerMinimized) return;
    if (direction === 'move' && (event.target as HTMLElement).closest('button')) return;
    event.preventDefault();
    const bounds = viewerRef.current.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY;
    const start = { x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height };
    const move = (pointer: PointerEvent) => {
      const dx = pointer.clientX - startX; const dy = pointer.clientY - startY;
      let { x, y, width, height } = start;
      if (direction === 'move') { x += dx; y += dy; }
      if (direction.includes('e')) width += dx;
      if (direction.includes('s')) height += dy;
      if (direction.includes('w')) { x += dx; width -= dx; }
      if (direction.includes('n')) { y += dy; height -= dy; }
      const minWidth = Math.min(320, window.innerWidth); const minHeight = Math.min(240, window.innerHeight);
      if (width < minWidth) { if (direction.includes('w')) x -= minWidth - width; width = minWidth; }
      if (height < minHeight) { if (direction.includes('n')) y -= minHeight - height; height = minHeight; }
      width = Math.min(width, window.innerWidth); height = Math.min(height, window.innerHeight);
      x = Math.max(0, Math.min(x, window.innerWidth - width)); y = Math.max(0, Math.min(y, window.innerHeight - height));
      setViewerRect({ x, y, width, height });
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
  };
  const viewerStyle = viewerRect ? ({ left: viewerRect.x, top: viewerRect.y, width: isViewerMinimized ? Math.min(320, viewerRect.width) : viewerRect.width, height: isViewerMinimized ? 44.8 : viewerRect.height } as CSSProperties) : undefined;

  return <>
    {viewer ? <section ref={viewerRef} style={viewerStyle} className={`${styles.pdfViewer} ${isViewerMinimized ? styles.pdfViewerMinimized : ''}`} aria-label={`${viewer.name} PDF viewer`}>
      <header className={styles.pdfViewerHeader} onPointerDown={(event) => beginViewerInteraction('move', event)}>
        <span title={viewer.name}>{viewer.name}</span>
        <div>
          <button type="button" onClick={() => setIsViewerMinimized((value) => !value)} aria-label={isViewerMinimized ? 'Restore PDF' : 'Minimize PDF'} title={isViewerMinimized ? 'Restore' : 'Minimize'}><i className={`fa-solid ${isViewerMinimized ? 'fa-window-maximize' : 'fa-window-minimize'}`} /></button>
          <button type="button" onClick={() => setViewer(null)} aria-label="Close PDF" title="Close"><i className="fa-solid fa-xmark" /></button>
        </div>
      </header>
      {!isViewerMinimized ? <iframe src={driveLinkToEmbedUrl(viewer.embedUrl)} title={viewer.name} allow="autoplay" /> : null}
      {!isViewerMinimized ? (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const).map((direction) => <div key={direction} className={`${styles.resizeHandle} ${styles[`resize${direction.toUpperCase()}`]}`} onPointerDown={(event) => beginViewerInteraction(direction, event)} aria-hidden="true" />) : null}
    </section> : null}

    <div ref={menuRef} className={`${styles.menu} ${isOpen ? styles.open : ''}`}>
      <div className={styles.actions} aria-hidden={!isOpen}>
        {arePriceListsOpen && expandedRecord ? expandedRecord.links.map((link, index) => <button key={`${expandedRecord.id}-${index}`} type="button" className={`${styles.actionButton} ${styles.priceListRecord}`} onClick={() => openLink(link)} title={link.name}><span>{link.name}</span></button>) : null}
        {arePriceListsOpen ? priceLists.map((record) => <button key={record.id} type="button" className={`${styles.actionButton} ${styles.priceListRecord}`} onClick={() => chooseRecord(record)} title={record.name} aria-expanded={record.links.length > 1 ? expandedRecordId === record.id : undefined}><span>{record.name}</span>{record.links.length > 1 ? <i className={`fa-solid fa-chevron-${expandedRecordId === record.id ? 'up' : 'right'}`} /> : null}</button>) : null}
        <button type="button" className={styles.actionButton} onClick={() => { setArePriceListsOpen((value) => !value); setExpandedRecordId(null); }} tabIndex={isOpen ? 0 : -1} aria-label="Open price lists" title={priceLists.length ? 'Price Lists' : 'No active price lists'} aria-expanded={arePriceListsOpen}><i className="fa-solid fa-tags" /></button>
        <button type="button" className={`${styles.actionButton} ${styles.logoutButton}`} onClick={() => { setIsOpen(false); onLogout(); }} tabIndex={isOpen ? 0 : -1} aria-label="Log out" title="Log Out"><i className="fa-solid fa-right-from-bracket" /></button>
      </div>
      <button type="button" className={styles.trigger} onClick={() => setIsOpen((current) => { if (current) { setArePriceListsOpen(false); setExpandedRecordId(null); } return !current; })} aria-label={isOpen ? 'Close quick actions' : 'Open quick actions'} aria-expanded={isOpen}><i className="fa-solid fa-chevron-left" /></button>
    </div>
  </>;
}
