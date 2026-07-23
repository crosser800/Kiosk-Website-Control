export const BUSINESS_TIME_ZONE = 'Asia/Manila';
export const COMPLETED_DISPLAY_STATUS = 'Completed';
export const COMPLETED_RAW_STATUSES = ['Completed', 'Delivered'] as const;
export const ORDER_STATUS_FIELD = 'order_status';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

export type CompletedSalesRange = {
  start: Date;
  end: Date;
};

export type CompletedSalesRanges = {
  daily: CompletedSalesRange;
  yesterday: CompletedSalesRange;
  monthly: CompletedSalesRange;
  lastMonth: CompletedSalesRange;
  yearly: CompletedSalesRange;
  previousYear: CompletedSalesRange;
  ytd: CompletedSalesRange;
  lastYearYtd: CompletedSalesRange;
};

export type BusinessDateRanges = CompletedSalesRanges & {
  currentWeek: CompletedSalesRange;
  previousWeek: CompletedSalesRange;
  today: CompletedSalesRange;
  yesterdayRange: CompletedSalesRange;
  currentMonth: CompletedSalesRange;
  currentYear: CompletedSalesRange;
};

function toManilaParts(date = new Date()) {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    monthIndex: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
  };
}

function fromManilaLocal(year: number, monthIndex: number, day: number) {
  return new Date(Date.UTC(year, monthIndex, day) - MANILA_OFFSET_MS);
}

export function getCompletedSalesRanges(now = new Date()): CompletedSalesRanges {
  const { year, monthIndex, day } = toManilaParts(now);

  const todayStart = fromManilaLocal(year, monthIndex, day);
  const tomorrowStart = fromManilaLocal(year, monthIndex, day + 1);
  const yesterdayStart = fromManilaLocal(year, monthIndex, day - 1);
  const currentMonthStart = fromManilaLocal(year, monthIndex, 1);
  const nextMonthStart = fromManilaLocal(year, monthIndex + 1, 1);
  const previousMonthStart = fromManilaLocal(year, monthIndex - 1, 1);
  const currentYearStart = fromManilaLocal(year, 0, 1);
  const nextYearStart = fromManilaLocal(year + 1, 0, 1);
  const previousYearStart = fromManilaLocal(year - 1, 0, 1);
  const sameDayLastYearExclusive = fromManilaLocal(year - 1, monthIndex, day + 1);

  return {
    daily: { start: todayStart, end: tomorrowStart },
    yesterday: { start: yesterdayStart, end: todayStart },
    monthly: { start: currentMonthStart, end: nextMonthStart },
    lastMonth: { start: previousMonthStart, end: currentMonthStart },
    yearly: { start: currentYearStart, end: nextYearStart },
    previousYear: { start: previousYearStart, end: currentYearStart },
    ytd: { start: currentYearStart, end: tomorrowStart },
    lastYearYtd: { start: previousYearStart, end: sameDayLastYearExclusive },
  };
}

export function getBusinessDateRanges(now = new Date()): BusinessDateRanges {
  const completedRanges = getCompletedSalesRanges(now);
  const { year, monthIndex, day } = toManilaParts(now);
  const todayStart = fromManilaLocal(year, monthIndex, day);
  const dayOfWeek = new Date(todayStart.getTime() + MANILA_OFFSET_MS).getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const currentWeekStart = fromManilaLocal(year, monthIndex, day - daysSinceMonday);
  const nextWeekStart = fromManilaLocal(year, monthIndex, day - daysSinceMonday + 7);
  const previousWeekStart = fromManilaLocal(year, monthIndex, day - daysSinceMonday - 7);

  return {
    ...completedRanges,
    currentWeek: { start: currentWeekStart, end: nextWeekStart },
    previousWeek: { start: previousWeekStart, end: currentWeekStart },
    today: completedRanges.daily,
    yesterdayRange: completedRanges.yesterday,
    currentMonth: completedRanges.monthly,
    currentYear: completedRanges.yearly,
  };
}

export function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

export function toBusinessDayLabel(value: Date) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIME_ZONE,
    weekday: 'short',
  }).format(value);
}

export function toBusinessDateLabel(value: Date) {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: BUSINESS_TIME_ZONE,
    month: 'short',
    day: 'numeric',
  }).format(value);
}

export function parseCompletedAt(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isCompletedAtInRange(value: string | null | undefined, range: CompletedSalesRange) {
  const completedAt = parseCompletedAt(value);
  return Boolean(completedAt && completedAt >= range.start && completedAt < range.end);
}

export function toBusinessDateKey(value: string | null | undefined) {
  const parsed = parseCompletedAt(value);
  if (!parsed) return '';
  const { year, monthIndex, day } = toManilaParts(parsed);
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function resolveCompletedAt<Row extends { id: string; updated_at: string | null; created_at: string | null }>(
  row: Row,
  completedHistoryByOrderId: Map<string, string>,
) {
  return completedHistoryByOrderId.get(String(row.id)) ?? row.updated_at ?? row.created_at;
}
