import type { FormEvent } from 'react';
import PasswordField from './PasswordField';
import { validateAdminPassword } from '../../services/adminActivation';
import styles from '../../pages/Login.module.css';

type InternalPasswordChangeStepProps = {
  password: string;
  confirmPassword: string;
  error: string;
  info: string;
  isSubmitting: boolean;
  onPasswordChange: (password: string) => void;
  onConfirmPasswordChange: (password: string) => void;
  onSubmit: () => void;
};

const requirementLabels = {
  length: 'At least 8 characters',
  uppercase: 'One uppercase letter',
  lowercase: 'One lowercase letter',
  number: 'One number',
  notDefault: 'Not the default password',
};

export default function InternalPasswordChangeStep({
  password,
  confirmPassword,
  error,
  info,
  isSubmitting,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmit,
}: InternalPasswordChangeStepProps) {
  const validation = validateAdminPassword(password);
  const passwordsMatch = Boolean(password) && password === confirmPassword;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <>
      <div className={styles.formHeader}>
        <h2>Change temporary password</h2>
        <p>Create a new password, then log in again with your username.</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <PasswordField
          id="internal-new-password"
          label="New Password"
          value={password}
          onChange={onPasswordChange}
          placeholder="Create a new password"
          autoComplete="new-password"
        />
        <PasswordField
          id="internal-confirm-password"
          label="Retype New Password"
          value={confirmPassword}
          onChange={onConfirmPasswordChange}
          placeholder="Retype your new password"
          autoComplete="new-password"
        />

        <div className={styles.passwordRules}>
          {(Object.keys(requirementLabels) as Array<keyof typeof requirementLabels>).map((key) => (
            <span key={key} className={validation.checks[key] ? styles.ruleMet : styles.rule}>
              <i className={`fa-solid ${validation.checks[key] ? 'fa-check' : 'fa-circle'}`} aria-hidden="true"></i>
              {requirementLabels[key]}
            </span>
          ))}
          <span className={passwordsMatch ? styles.ruleMet : styles.rule}>
            <i className={`fa-solid ${passwordsMatch ? 'fa-check' : 'fa-circle'}`} aria-hidden="true"></i>
            Passwords match
          </span>
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.info}>{info}</p> : null}

        <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
          {isSubmitting ? 'Saving...' : 'Change Password'}
        </button>
      </form>
    </>
  );
}
