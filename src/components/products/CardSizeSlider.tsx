import { useId, useState, type CSSProperties, type RefObject } from 'react';
import styles from './CardSizeSlider.module.css';
import { getCardSizePercent, readCardSize, writeCardSize, type CardSizeRange } from './cardSizePreferences';

type CardSizeSliderProps = {
  // Short visible label ("Category" / "Product") and its Font Awesome icon.
  label: string;
  icon: string;
  // Full accessible name, e.g. "Category card size".
  accessibleLabel: string;
  // Icon-only (narrow places); the label stays available to screen readers.
  hideLabel?: boolean;
  storageKey: string;
  range: CardSizeRange;
  // CSS custom property set on `targetRef` (the workspace root). Writing it
  // directly keeps resizing out of React: the workspace — and the product
  // editor inside it — does not re-render while the slider moves.
  cssVariable: string;
  targetRef: RefObject<HTMLElement | null>;
};

export default function CardSizeSlider({
  label,
  icon,
  accessibleLabel,
  hideLabel = false,
  storageKey,
  range,
  cssVariable,
  targetRef,
}: CardSizeSliderProps) {
  const inputId = useId();
  const [value, setValue] = useState(() => readCardSize(storageKey, range));

  function handleChange(nextRaw: string) {
    const next = writeCardSize(storageKey, Number(nextRaw), range);
    setValue(next);
    targetRef.current?.style.setProperty(cssVariable, `${next}px`);
  }

  return (
    <div className={styles.control}>
      <label className={styles.label} htmlFor={inputId} title={accessibleLabel}>
        <i className={`fa-solid ${icon} ${styles.icon}`} aria-hidden="true"></i>
        <span className={hideLabel ? styles.visuallyHidden : undefined}>{label}</span>
      </label>
      <input
        id={inputId}
        className={styles.slider}
        type="range"
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(event) => handleChange(event.target.value)}
        aria-label={accessibleLabel}
        aria-valuetext={`${accessibleLabel}: ${value} pixels minimum card width`}
        style={{ '--slider-fill': `${getCardSizePercent(value, range)}%` } as CSSProperties}
      />
    </div>
  );
}
