import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import styles from './SearchableSelect.module.css';

type SearchableSelectProps<Option> = {
  label: string;
  placeholder: string;
  value: string;
  options: Option[];
  noResultsText: string;
  getOptionValue: (option: Option) => string;
  getOptionLabel: (option: Option) => string;
  getSearchText: (option: Option) => string;
  renderOption: (option: Option, state: { isSelected: boolean; isActive: boolean }) => ReactNode;
  onChange: (value: string) => void;
};

export default function SearchableSelect<Option>({
  label,
  placeholder,
  value,
  options,
  noResultsText,
  getOptionValue,
  getOptionLabel,
  getSearchText,
  renderOption,
  onChange,
}: SearchableSelectProps<Option>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedOption = useMemo(
    () => options.find((option) => getOptionValue(option) === value) ?? null,
    [getOptionValue, options, value],
  );
  const visibleOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const selectedLabel = selectedOption ? getOptionLabel(selectedOption).trim().toLowerCase() : '';
    if (!normalizedQuery || normalizedQuery === selectedLabel) {
      return options;
    }
    return options.filter((option) => getSearchText(option).toLowerCase().includes(normalizedQuery));
  }, [getOptionLabel, getSearchText, options, query, selectedOption]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery(selectedOption ? getOptionLabel(selectedOption) : '');
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [getOptionLabel, isOpen, selectedOption]);

  useEffect(() => {
    if (!isOpen) {
      setQuery(selectedOption ? getOptionLabel(selectedOption) : '');
    }
  }, [getOptionLabel, isOpen, selectedOption]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function openForSearch() {
    setIsOpen(true);
    setQuery(selectedOption ? getOptionLabel(selectedOption) : '');
  }

  function selectOption(option: Option) {
    onChange(getOptionValue(option));
    setQuery(getOptionLabel(option));
    setIsOpen(false);
  }

  function clearSelection() {
    onChange('');
    setQuery('');
    setIsOpen(true);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(visibleOptions.length - 1, 0)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      if (isOpen && visibleOptions[activeIndex]) {
        event.preventDefault();
        selectOption(visibleOptions[activeIndex]);
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      setQuery(selectedOption ? getOptionLabel(selectedOption) : '');
    }
  }

  const listboxId = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-options`;

  return (
    <div ref={rootRef} className={styles.combobox}>
      <label className={styles.label} htmlFor={`${listboxId}-input`}>{label}</label>
      <div className={styles.inputWrap}>
        <input
          ref={inputRef}
          id={`${listboxId}-input`}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && visibleOptions[activeIndex] ? `${listboxId}-${activeIndex}` : undefined}
          value={isOpen ? query : selectedOption ? getOptionLabel(selectedOption) : query}
          placeholder={placeholder}
          onFocus={openForSearch}
          onClick={openForSearch}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
            if (value) {
              onChange('');
            }
          }}
          onKeyDown={handleKeyDown}
        />
        {value ? (
          <button type="button" className={styles.clearButton} onClick={clearSelection} aria-label={`Clear ${label}`}>
            <i className="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        ) : null}
      </div>
      {isOpen ? (
        <div id={listboxId} role="listbox" className={styles.options}>
          {visibleOptions.length === 0 ? (
            <div className={styles.noResults}>{noResultsText}</div>
          ) : (
            visibleOptions.map((option, index) => {
              const optionValue = getOptionValue(option);
              const isSelected = optionValue === value;
              const isActive = index === activeIndex;
              return (
                <button
                  key={optionValue}
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`${styles.option} ${isSelected ? styles.selectedOption : ''} ${isActive ? styles.activeOption : ''}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  {renderOption(option, { isSelected, isActive })}
                </button>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}
