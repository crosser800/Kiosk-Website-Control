import type { InternalThemePreference } from '../services/internalAdminAuth';

const GLOBAL_THEME_KEY = 'kiosk-admin-theme-preference';
const INTERNAL_THEME_KEY_PREFIX = 'kiosk-admin-theme-preference:internal:';
const LAST_INTERNAL_ACCOUNT_KEY = 'kiosk-admin-theme-preference:internal:last-account-id';

function isThemePreference(value: unknown): value is InternalThemePreference {
  return value === 'dark' || value === 'light';
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readStorage(key: string): InternalThemePreference | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const value = window.localStorage.getItem(key);
    return isThemePreference(value) ? value : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, preference: InternalThemePreference) {
  writeStringStorage(key, preference);
}

function writeStringStorage(key: string, value: string) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Theme storage is a UX optimization; ignore quota/private-mode errors.
  }
}

export function getCachedThemePreference(internalAccountId?: string | null) {
  if (internalAccountId) {
    const accountPreference = readStorage(`${INTERNAL_THEME_KEY_PREFIX}${internalAccountId}`);
    if (accountPreference) {
      return accountPreference;
    }
  }

  return readStorage(GLOBAL_THEME_KEY);
}

export function getInitialThemePreference(): InternalThemePreference {
  let lastInternalAccountId: string | null = null;
  if (canUseStorage()) {
    try {
      lastInternalAccountId = window.localStorage.getItem(LAST_INTERNAL_ACCOUNT_KEY);
    } catch {
      lastInternalAccountId = null;
    }
  }

  return getCachedThemePreference(lastInternalAccountId) ?? 'light';
}

export function cacheThemePreference(
  preference: InternalThemePreference,
  internalAccountId?: string | null,
) {
  writeStorage(GLOBAL_THEME_KEY, preference);

  if (internalAccountId) {
    writeStringStorage(LAST_INTERNAL_ACCOUNT_KEY, internalAccountId);
    writeStorage(`${INTERNAL_THEME_KEY_PREFIX}${internalAccountId}`, preference);
  }
}

export function applyThemePreference(preference: InternalThemePreference) {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.classList.toggle('dark', preference === 'dark');
  document.documentElement.style.colorScheme = preference;
}
