const STORAGE_KEY = 'kiosk.branchTypeOptions';
const CHANGE_EVENT = 'branch-type-options-changed';

export type BranchTypeStatus = 'active' | 'inactive';

export type BranchTypeOption = {
  name: string;
  status: BranchTypeStatus;
};

const defaultBranchTypes: BranchTypeOption[] = [];

function isBranchTypeStatus(status: unknown): status is BranchTypeStatus {
  return status === 'active' || status === 'inactive';
}

function normalizeOptions(options: unknown[]) {
  const seen = new Set<string>();

  return options.reduce<BranchTypeOption[]>((result, option) => {
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
                'status' in option && isBranchTypeStatus(option.status)
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

export function getBranchTypeItems() {
  if (typeof window === 'undefined') {
    return defaultBranchTypes;
  }

  const storedOptions = window.localStorage.getItem(STORAGE_KEY);

  if (!storedOptions) {
    return defaultBranchTypes;
  }

  try {
    const parsedOptions: unknown = JSON.parse(storedOptions);

    if (!Array.isArray(parsedOptions)) {
      return defaultBranchTypes;
    }

    return normalizeOptions(parsedOptions);
  } catch {
    return defaultBranchTypes;
  }
}

export function getBranchTypeOptions() {
  return getBranchTypeItems()
    .filter((option) => option.status === 'active')
    .map((option) => option.name);
}

export function saveBranchTypeItems(options: BranchTypeOption[]) {
  const normalizedOptions = normalizeOptions(options);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedOptions));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  return normalizedOptions;
}

export function addBranchTypeOption(option: string) {
  return saveBranchTypeItems([...getBranchTypeItems(), { name: option, status: 'active' }]);
}

export function removeBranchTypeOption(option: string) {
  return saveBranchTypeItems(
    getBranchTypeItems().filter((currentOption) => currentOption.name !== option),
  );
}

export function renameBranchTypeOption(currentName: string, nextName: string) {
  return saveBranchTypeItems(
    getBranchTypeItems().map((option) =>
      option.name === currentName ? { ...option, name: nextName } : option,
    ),
  );
}

export function updateBranchTypeStatus(optionName: string, status: BranchTypeStatus) {
  return saveBranchTypeItems(
    getBranchTypeItems().map((option) =>
      option.name === optionName ? { ...option, status } : option,
    ),
  );
}

export function subscribeBranchTypeItems(callback: (options: BranchTypeOption[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getBranchTypeItems());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getBranchTypeItems());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function subscribeBranchTypeOptions(callback: (options: string[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getBranchTypeOptions());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getBranchTypeOptions());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}
