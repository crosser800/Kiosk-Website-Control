import { useState } from 'react';
import styles from '../../pages/Login.module.css';

type PasswordFieldProps = {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  autoComplete?: string;
  onChange: (value: string) => void;
};

export default function PasswordField({
  id,
  label,
  value,
  placeholder,
  autoComplete,
  onChange,
}: PasswordFieldProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className={styles.passwordField}>
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className={styles.passwordToggle}
          onClick={() => setIsVisible((current) => !current)}
          aria-label={isVisible ? 'Hide password' : 'Show password'}
          aria-pressed={isVisible}
        >
          <i
            className={`fa-solid ${isVisible ? 'fa-eye-slash' : 'fa-eye'}`}
            aria-hidden="true"
          ></i>
        </button>
      </div>
    </>
  );
}
