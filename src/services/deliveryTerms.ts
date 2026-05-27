const STORAGE_KEY = 'kiosk.deliveryTermOptions';
const CHANGE_EVENT = 'delivery-term-options-changed';

export type DeliveryTermStatus = 'active' | 'inactive';

export type DeliveryTermOption = {
  id: string;
  name: string;
  code: string;
  deliveryDays: string;
  description: string;
  status: DeliveryTermStatus;
};

export type DeliveryTermInput = Omit<DeliveryTermOption, 'id'>;

const defaultDeliveryTerms: DeliveryTermOption[] = [];

function isDeliveryTermStatus(status: unknown): status is DeliveryTermStatus {
  return status === 'active' || status === 'inactive';
}

function createId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `delivery-term-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeOptions(options: unknown[]) {
  const seen = new Set<string>();

  return options.reduce<DeliveryTermOption[]>((result, option) => {
    if (!option || typeof option !== 'object' || !('name' in option)) {
      return result;
    }

    const rawOption = option as Partial<DeliveryTermOption> & { deliveryDate?: unknown };
    const name = typeof rawOption.name === 'string' ? rawOption.name.trim() : '';
    const code = typeof rawOption.code === 'string' ? rawOption.code.trim() : '';
    const key = `${name.toLowerCase()}|${code.toLowerCase()}`;

    if (!name || !code || seen.has(key)) {
      return result;
    }

    seen.add(key);
    result.push({
      id: typeof rawOption.id === 'string' && rawOption.id ? rawOption.id : createId(),
      name,
      code,
      deliveryDays:
        typeof rawOption.deliveryDays === 'string'
          ? rawOption.deliveryDays.trim()
          : typeof rawOption.deliveryDate === 'string'
            ? rawOption.deliveryDate.trim()
            : '',
      description:
        typeof rawOption.description === 'string' ? rawOption.description.trim() : '',
      status: isDeliveryTermStatus(rawOption.status) ? rawOption.status : 'active',
    });

    return result;
  }, []);
}

export function getDeliveryTermItems() {
  if (typeof window === 'undefined') {
    return defaultDeliveryTerms;
  }

  const storedOptions = window.localStorage.getItem(STORAGE_KEY);

  if (!storedOptions) {
    return defaultDeliveryTerms;
  }

  try {
    const parsedOptions: unknown = JSON.parse(storedOptions);

    if (!Array.isArray(parsedOptions)) {
      return defaultDeliveryTerms;
    }

    return normalizeOptions(parsedOptions);
  } catch {
    return defaultDeliveryTerms;
  }
}

export function getDeliveryTermOptions() {
  return getDeliveryTermItems().filter((option) => option.status === 'active');
}

export function saveDeliveryTermItems(options: DeliveryTermOption[]) {
  const normalizedOptions = normalizeOptions(options);

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedOptions));
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }

  return normalizedOptions;
}

export function addDeliveryTermOption(option: DeliveryTermInput) {
  return saveDeliveryTermItems([...getDeliveryTermItems(), { ...option, id: createId() }]);
}

export function updateDeliveryTermOption(optionId: string, option: DeliveryTermInput) {
  return saveDeliveryTermItems(
    getDeliveryTermItems().map((currentOption) =>
      currentOption.id === optionId ? { ...option, id: optionId } : currentOption,
    ),
  );
}

export function removeDeliveryTermOption(optionId: string) {
  return saveDeliveryTermItems(
    getDeliveryTermItems().filter((currentOption) => currentOption.id !== optionId),
  );
}

export function subscribeDeliveryTermItems(callback: (options: DeliveryTermOption[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getDeliveryTermItems());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getDeliveryTermItems());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}

export function subscribeDeliveryTermOptions(callback: (options: DeliveryTermOption[]) => void) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleChange = () => {
    callback(getDeliveryTermOptions());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback(getDeliveryTermOptions());
    }
  };

  window.addEventListener(CHANGE_EVENT, handleChange);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, handleChange);
    window.removeEventListener('storage', handleStorage);
  };
}
