const STORAGE_KEY = 'kiosk.accountHandlingOptions';
const CHANGE_EVENT = 'account-handling-options-changed';

export type AccountHandlingStatus = 'active' | 'inactive';

export type AccountHandlingOption = {
  name: string;
  status: AccountHandlingStatus;
};

const defaultAccountHandlings: AccountHandlingOption[] = [];

function isAccountHandlingStatus(status: unknown): status is AccountHandlingStatus {
  return status === 'active' || status === 'inactive';
}

function normalizeOptions(options: unknown[]) {
  const seen = new Set<string>();

  return options.reduce<AccountHandlingOption[]>((result, option) => {
    const nextOption =
      typeof option === 'string'
        ? { name: option, status: 'active' as const }
        : option &&
            typeof option === 'object' &&
            'name' in option &&
            typeof option.name === 'string'
          ? {
              name: option.name,
              status:
                'status' in option && isAccountHandlingStatus(option.status)
                  ? option.status
                  : ('active' as const),
            }
          : null;

    if (!nextOption) {
      return result;
    }

    const name = nextOption.name.trim();
    const key = name.toLowerCase();

    if (!name || seen.has(key)) {
      return result;
    }

    seen.add(key);
    result.push({ name, status: nextOption.status });
    return result;
  }, []);
}

export function getAccountHandlingItems() {
  if (typeof window === 'undefined') {
    return defaultAccountHandlings;
  }

  const storedOptions = window.localStorage.getItem(STORAGE_KEY);

  if (!storedOptions) {
    return defaultAccountHandlings;
  }

  try {
    const parsedOptions: unknown = JSON.parse(storedOptions);

    if (!Array.isArray(parsedOptions)) {
      return defaultAccountHandlings;
    }

    return normalizeOptions(parsedOptions);
  } catch {
    return defaultAccountHandlings;
  }
}

export function getAccountHandlingOptions() {
  return getAccountHandlingItems()
    .filter((option) => option.status === 'active')
    .map((option) => option.name);
}

export function saveAccountHandlingItems(options: AccountHandlingOption[]) {
  const normalizedOptions = normalizeOptions(options);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedOptions));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  return normalizedOptions;
}

export function addAccountHandlingOption(option: string) {
  return saveAccountHandlingItems([
    ...getAccountHandlingItems(),
    { name: option, status: 'active' },
  ]);
}

export function removeAccountHandlingOption(option: string) {
  return saveAccountHandlingItems(
    getAccountHandlingItems().filter((currentOption) => currentOption.name !== option),
  );
}

export function renameAccountHandlingOption(currentName: string, nextName: string) {
  return saveAccountHandlingItems(
    getAccountHandlingItems().map((option) =>
      option.name === currentName ? { ...option, name: nextName } : option,
    ),
  );
}

export function updateAccountHandlingStatus(
  optionName: string,
  status: AccountHandlingStatus,
) {
  return saveAccountHandlingItems(
    getAccountHandlingItems().map((option) =>
      option.name === optionName ? { ...option, status } : option,
    ),
  );
}

export function subscribeAccountHandlingItems(callback: (options: AccountHandlingOption[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getAccountHandlingItems());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getAccountHandlingItems());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function subscribeAccountHandlingOptions(callback: (options: string[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getAccountHandlingOptions());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getAccountHandlingOptions());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}
