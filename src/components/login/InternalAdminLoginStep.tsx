import type { FormEvent } from 'react';
import PasswordField from './PasswordField';
import styles from '../../pages/Login.module.css';

type InternalAdminLoginStepProps = {
  username: string;
  password: string;
  error: string;
  info: string;
  usernameError: string;
  isSubmitting: boolean;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
};

export default function InternalAdminLoginStep({
  username,
  password,
  error,
  info,
  usernameError,
  isSubmitting,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
}: InternalAdminLoginStepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <>
      <form onSubmit={handleSubmit} className={styles.form}>
        <label htmlFor="internal-username">Username</label>
        <input
          id="internal-username"
          type="text"
          value={username}
          onChange={(event) => onUsernameChange(event.target.value)}
          placeholder="2bphadmin"
          autoComplete="username"
          autoFocus
          aria-describedby={usernameError ? 'internal-username-helper' : undefined}
          aria-invalid={Boolean(usernameError)}
        />
        {usernameError ? (
          <p
            id="internal-username-helper"
            className={`${styles.fieldHelper} ${styles.fieldHelperError}`}
          >
            {usernameError}
          </p>
        ) : null}

        <PasswordField
          id="internal-password"
          label="Password"
          value={password}
          onChange={onPasswordChange}
          placeholder="Enter your password"
          autoComplete="current-password"
        />

        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.info}>{info}</p> : null}

        <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
          {isSubmitting ? 'Signing in...' : 'Login'}
        </button>
      </form>
    </>
  );
}
