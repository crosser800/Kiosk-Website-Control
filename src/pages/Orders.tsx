import { useState } from 'react';
import CreateOrderWorkspace from '../components/orders/CreateOrderWorkspace';
import OrderSummary from '../components/orders/OrderSummary';
import summaryStyles from '../components/orders/OrderSummary.module.css';
import styles from './Orders.module.css';

type DateFilterMode = 'single' | 'range';

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={summaryStyles.filterIcon}>
      <path d="M7 3v3M17 3v3M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function formatIsoDate(isoDate: string) {
  if (!isoDate) return '-';
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? isoDate : parsed.toLocaleDateString('en-PH');
}

export default function Orders() {
  const today = new Date();
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('single');
  const [calendarMonth, setCalendarMonth] = useState(today.getMonth());
  const [calendarYear, setCalendarYear] = useState(today.getFullYear());
  const [tempSingleDate, setTempSingleDate] = useState<string | null>(null);
  const [tempRangeStart, setTempRangeStart] = useState<string | null>(null);
  const [tempRangeEnd, setTempRangeEnd] = useState<string | null>(null);
  const [appliedSingleDate, setAppliedSingleDate] = useState<string | null>(null);
  const [appliedRangeStart, setAppliedRangeStart] = useState<string | null>(null);
  const [appliedRangeEnd, setAppliedRangeEnd] = useState<string | null>(null);
  const [isCreateOrderOpen, setIsCreateOrderOpen] = useState(false);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);

  function buildCalendarDays() {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const cells: Array<{ iso: string; day: number; isCurrentMonth: boolean }> = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push({ iso: '', day: 0, isCurrentMonth: false });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      cells.push({ iso, day, isCurrentMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ iso: '', day: 0, isCurrentMonth: false });
    return cells;
  }

  function handleCalendarDateClick(iso: string) {
    if (!iso) return;
    if (dateFilterMode === 'single') {
      setTempSingleDate(iso);
      return;
    }
    if (!tempRangeStart || (tempRangeStart && tempRangeEnd)) {
      setTempRangeStart(iso);
      setTempRangeEnd(null);
      return;
    }
    if (iso < tempRangeStart) {
      setTempRangeEnd(tempRangeStart);
      setTempRangeStart(iso);
      return;
    }
    setTempRangeEnd(iso);
  }

  function isInTempRange(iso: string) {
    if (!iso || !tempRangeStart || !tempRangeEnd) return false;
    return iso >= tempRangeStart && iso <= tempRangeEnd;
  }

  function applyDateFilter() {
    if (dateFilterMode === 'single') {
      setAppliedSingleDate(tempSingleDate);
      setAppliedRangeStart(null);
      setAppliedRangeEnd(null);
    } else {
      setAppliedSingleDate(null);
      setAppliedRangeStart(tempRangeStart);
      setAppliedRangeEnd(tempRangeEnd);
    }
    setIsDateFilterOpen(false);
  }

  function clearDateFilter() {
    setAppliedSingleDate(null);
    setAppliedRangeStart(null);
    setAppliedRangeEnd(null);
    setTempSingleDate(null);
    setTempRangeStart(null);
    setTempRangeEnd(null);
  }

  return (
    <div className={styles.orders}>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Operations workspace</p>
          <h1 className={styles.title}>Orders</h1>
          <p className={styles.subtitle}>
            Monitor order flow, review schedule windows, and manage status updates in one place.
          </p>
        </div>
        <div className={styles.heroActions}>
          <button type="button" className={styles.createOrderButton} onClick={() => setIsCreateOrderOpen(true)}>
            Create Order
          </button>
          {appliedSingleDate || (appliedRangeStart && appliedRangeEnd) ? (
            <button type="button" className={summaryStyles.clearFilterButton} onClick={clearDateFilter}>
              Clear Filter
            </button>
          ) : null}
          <button type="button" className={summaryStyles.dateFilterButton} onClick={() => setIsDateFilterOpen((prev) => !prev)}>
            <CalendarIcon />
            <span>Filter Date</span>
          </button>
        </div>
      </section>

      {isDateFilterOpen ? (
        <div className={summaryStyles.dateFilterOverlay} role="presentation">
          <div className={summaryStyles.dateFilterModal} role="dialog" aria-modal="true" aria-label="Filter orders by date">
            <div className={summaryStyles.modalHeader}>
              <h3 className={summaryStyles.modalTitle}>Filter Date</h3>
              <button type="button" className={summaryStyles.modalClose} onClick={() => setIsDateFilterOpen(false)} aria-label="Close date filter">
                <i className="fa-solid fa-xmark" aria-hidden="true"></i>
              </button>
            </div>
            <div className={summaryStyles.dateFilterPopover}>
              <div className={summaryStyles.dateModeTabs}>
                <button type="button" className={`${summaryStyles.dateModeTab} ${dateFilterMode === 'single' ? summaryStyles.dateModeTabActive : ''}`} onClick={() => setDateFilterMode('single')}>Single</button>
                <button type="button" className={`${summaryStyles.dateModeTab} ${dateFilterMode === 'range' ? summaryStyles.dateModeTabActive : ''}`} onClick={() => setDateFilterMode('range')}>Range</button>
              </div>
              <div className={summaryStyles.calendarControls}>
                <select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))}>
                  {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((month, index) => (
                    <option key={month} value={index}>{month}</option>
                  ))}
                </select>
                <select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))}>
                  {Array.from({ length: 9 }, (_, i) => today.getFullYear() - 4 + i).map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>
              <div className={summaryStyles.calendarGrid}>
                {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => <span key={day} className={summaryStyles.calendarHead}>{day}</span>)}
                {buildCalendarDays().map((cell, index) => {
                  const isSelectedSingle = dateFilterMode === 'single' && tempSingleDate === cell.iso;
                  const isStart = dateFilterMode === 'range' && tempRangeStart === cell.iso;
                  const isEnd = dateFilterMode === 'range' && tempRangeEnd === cell.iso;
                  const isRange = dateFilterMode === 'range' && isInTempRange(cell.iso);
                  return (
                    <button
                      key={`${cell.iso}-${index}`}
                      type="button"
                      className={`${summaryStyles.calendarCell} ${!cell.isCurrentMonth ? summaryStyles.calendarCellEmpty : ''} ${isSelectedSingle || isStart || isEnd ? summaryStyles.calendarCellSelected : ''} ${isRange ? summaryStyles.calendarCellRange : ''}`}
                      onClick={() => handleCalendarDateClick(cell.iso)}
                      disabled={!cell.isCurrentMonth}
                    >
                      {cell.day || ''}
                    </button>
                  );
                })}
              </div>
              <div className={summaryStyles.dateFilterFooter}>
                <span className={summaryStyles.datePreview}>
                  {dateFilterMode === 'single'
                    ? `Selected: ${tempSingleDate ? formatIsoDate(tempSingleDate) : '-'}`
                    : `Range: ${tempRangeStart ? formatIsoDate(tempRangeStart) : '-'} to ${tempRangeEnd ? formatIsoDate(tempRangeEnd) : '-'}`}
                </span>
                <button type="button" className={summaryStyles.confirmProceed} onClick={applyDateFilter}>Apply</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <OrderSummary
        appliedSingleDate={appliedSingleDate}
        appliedRangeStart={appliedRangeStart}
        appliedRangeEnd={appliedRangeEnd}
        refreshKey={ordersRefreshKey}
      />

      {isCreateOrderOpen ? (
        <CreateOrderWorkspace
          onClose={() => setIsCreateOrderOpen(false)}
          onCreated={() => setOrdersRefreshKey((current) => current + 1)}
        />
      ) : null}
    </div>
  );
}
