import type { FormEvent } from 'react';
import PasswordField from './PasswordField';
import styles from '../../pages/Login.module.css';

type PasswordLoginStepProps = {
  email: string;
  password: string;
  error: string;
  isSubmitting: boolean;
  onPasswordChange: (password: string) => void;
  onBack: () => void;
  onSubmit: () => void;
};

export default function PasswordLoginStep({
  email,
  password,
  error,
  isSubmitting,
  onPasswordChange,
  onBack,
  onSubmit,
}: PasswordLoginStepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <>
      <div className={styles.formHeader}>
        <h2>Enter your password</h2>
        <p>Use your administrator password to continue.</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.emailSummary}>
          <span>{email}</span>
          <button type="button" onClick={onBack}>
            Change Email
          </button>
        </div>

        <PasswordField
          id="password"
          label="Password"
          value={password}
          onChange={onPasswordChange}
          placeholder="Enter your password"
          autoComplete="current-password"
        />

        {error ? <p className={styles.error}>{error}</p> : null}

        <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
          {isSubmitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </>
  );
}
