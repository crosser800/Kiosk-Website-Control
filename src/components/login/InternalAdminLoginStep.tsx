import type { FormEvent } from 'react';
import PasswordField from './PasswordField';
import styles from '../../pages/Login.module.css';

type InternalAdminLoginStepProps = {
  username: string;
  password: string;
  error: string;
  info: string;
  isSubmitting: boolean;
  onUsernameChange: (username: string) => void;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onGatewayLogout: () => void;
};

export default function InternalAdminLoginStep({
  username,
  password,
  error,
  info,
  isSubmitting,
  onUsernameChange,
  onPasswordChange,
  onSubmit,
  onGatewayLogout,
}: InternalAdminLoginStepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <>
      <div className={styles.formHeader}>
        <h2>Internal Admin Login</h2>
        <p>Enter your employee username and password to continue.</p>
      </div>

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
        />

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

        <button type="button" disabled={isSubmitting} className={styles.secondaryAction} onClick={onGatewayLogout}>
          Log Out Operations Account
        </button>
      </form>
    </>
  );
}
