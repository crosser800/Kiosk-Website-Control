import type { FormEvent } from 'react';
import { useState } from 'react';
import logo from '../../assets/2B LOGO.png';
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
  notDefault: 'Must not be "password"',
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
  const [hasTouchedConfirmPassword, setHasTouchedConfirmPassword] = useState(false);
  const validation = validateAdminPassword(password);
  const passwordsMatch = Boolean(password) && password === confirmPassword;
  const canShowMatchStatus = hasTouchedConfirmPassword || Boolean(confirmPassword);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHasTouchedConfirmPassword(true);
    onSubmit();
  }

  return (
    <>
      <div className={`${styles.formHeader} ${styles.passwordChangeHeader}`}>
        <img src={logo} alt="BESTBUILT logo" className={styles.passwordChangeLogo} />
        <h2>Change Password</h2>
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

        <div className={styles.passwordRules}>
          {(Object.keys(requirementLabels) as Array<keyof typeof requirementLabels>).map((key) => (
            <span key={key} className={validation.checks[key] ? styles.ruleMet : styles.rule}>
              <i className={`fa-solid ${validation.checks[key] ? 'fa-check' : 'fa-circle'}`} aria-hidden="true"></i>
              {requirementLabels[key]}
            </span>
          ))}
        </div>

        <PasswordField
          id="internal-confirm-password"
          label="Confirm New Password"
          value={confirmPassword}
          onChange={(nextPassword) => {
            setHasTouchedConfirmPassword(true);
            onConfirmPasswordChange(nextPassword);
          }}
          placeholder="Retype your new password"
          autoComplete="new-password"
          helperText={
            canShowMatchStatus ? (
              <span className={passwordsMatch ? styles.matchPassed : styles.matchFailed}>
                {passwordsMatch ? 'Passwords match.' : 'Passwords do not match.'}
              </span>
            ) : undefined
          }
          helperTone={canShowMatchStatus ? (passwordsMatch ? 'success' : 'error') : 'muted'}
        />

        {error ? <p className={styles.error}>{error}</p> : null}
        {info ? <p className={styles.info}>{info}</p> : null}

        <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
          {isSubmitting ? 'Saving...' : 'Change Password'}
        </button>
      </form>
    </>
  );
}
