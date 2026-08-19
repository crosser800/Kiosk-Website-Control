import type { DiscountKind, ItemStatus } from './types';

export type DiscountDerivedState = 'Inactive' | 'Scheduled' | 'Active' | 'Expired';
export type DiscountActivationMode = 'Inactive' | 'Now' | 'Scheduled';
export type PromoValidityMode = 'Fixed' | 'Duration';
export type PromoDurationPreset = '7d' | '14d' | '30d' | '1m' | '3m' | 'custom';

export function normalizeDiscountKind(value: unknown): DiscountKind {
  return value === 'Base' || value === 'Promo' ? value : '';
}

export function getDiscountKindLabel(kind: DiscountKind) {
  if (kind === 'Base') return 'Base';
  if (kind === 'Promo') return 'Promo';
  return 'Legacy / Unclassified';
}

export function getDiscountDerivedState(input: {
  status: string;
  startsAt?: string | null;
  endsAt?: string | null;
  now?: Date;
}): DiscountDerivedState {
  if (String(input.status ?? '').trim().toLowerCase() === 'inactive') {
    return 'Inactive';
  }

  const nowTime = (input.now ?? new Date()).getTime();
  const startTime = parseIsoTime(input.startsAt);
  const endTime = parseIsoTime(input.endsAt);

  if (startTime !== null && startTime > nowTime) {
    return 'Scheduled';
  }
  if (endTime !== null && endTime < nowTime) {
    return 'Expired';
  }
  return 'Active';
}

export function getActivationMode(input: {
  status: ItemStatus;
  startsAt?: string | null;
  now?: Date;
}): DiscountActivationMode {
  if (input.status === 'Inactive') {
    return 'Inactive';
  }
  const startTime = parseIsoTime(input.startsAt);
  if (startTime !== null && startTime > (input.now ?? new Date()).getTime()) {
    return 'Scheduled';
  }
  return 'Now';
}

export function toDatetimeLocalValue(isoValue: string | null | undefined) {
  if (!isoValue) return '';
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return '';

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function datetimeLocalToIso(localValue: string) {
  if (!localValue) return '';
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function formatDiscountDateRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
) {
  const startLabel = formatShortDateTime(startsAt);
  const endLabel = formatShortDateTime(endsAt);
  if (startLabel && endLabel) return `${startLabel} -> ${endLabel}`;
  if (startLabel) return `Starts ${startLabel}`;
  if (endLabel) return `Ends ${endLabel}`;
  return 'No expiration';
}

export function applyDurationPreset(
  startIso: string | null | undefined,
  preset: PromoDurationPreset,
  now = new Date(),
) {
  if (preset === 'custom') return '';
  const start = startIso ? new Date(startIso) : now;
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start);

  switch (preset) {
    case '7d':
      end.setDate(end.getDate() + 7);
      break;
    case '14d':
      end.setDate(end.getDate() + 14);
      break;
    case '30d':
      end.setDate(end.getDate() + 30);
      break;
    case '1m':
      end.setMonth(end.getMonth() + 1);
      break;
    case '3m':
      end.setMonth(end.getMonth() + 3);
      break;
  }

  return end.toISOString();
}

export function getDefaultScheduledStart(now = new Date()) {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setSeconds(0, 0);
  return next.toISOString();
}

export function validateDiscountTiming(input: {
  discountKind: DiscountKind;
  activationMode: DiscountActivationMode;
  startsAt?: string | null;
  endsAt?: string | null;
  now?: Date;
}) {
  const nowTime = (input.now ?? new Date()).getTime();
  const startTime = parseIsoTime(input.startsAt);
  const endTime = parseIsoTime(input.endsAt);

  if (input.discountKind === 'Promo' && input.activationMode === 'Scheduled') {
    if (startTime === null) return 'Choose a future start date/time before scheduling this promo.';
    if (startTime <= nowTime) return 'Scheduled promos need a future start date/time.';
  }

  if (input.discountKind === 'Promo' && endTime === null) {
    return 'Choose an end date/time for this promo.';
  }

  if (input.discountKind === 'Promo' && startTime !== null && endTime !== null && endTime < startTime) {
    return 'Promo end date/time cannot be earlier than its start date/time.';
  }

  return '';
}

function parseIsoTime(value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
}

function formatShortDateTime(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}
