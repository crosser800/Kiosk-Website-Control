import { useState } from 'react';
import type { FormEvent } from 'react';
import logo from '../assets/2B LOGO.png';
import { completeRequiredPasswordChange } from '../services/auth';
import styles from './CreateNewPassword.module.css';

type CreateNewPasswordProps = {
  onComplete: () => void | Promise<void>;
};

function validatePassword(password: string, confirmPassword: string) {
  if (!password || !confirmPassword) return 'Enter and confirm your new password.';
  if (password !== confirmPassword) return 'Passwords do not match.';
  if (password === 'password') return 'Choose a password different from the temporary password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Z]/.test(password)) return 'Password must include at least one uppercase letter.';
  if (!/[a-z]/.test(password)) return 'Password must include at least one lowercase letter.';
  if (!/\d/.test(password)) return 'Password must include at least one number.';
  return '';
}

export default function CreateNewPassword({ onComplete }: CreateNewPasswordProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextPassword = password.trim();
    const nextConfirmPassword = confirmPassword.trim();
    const validation = validatePassword(nextPassword, nextConfirmPassword);

    if (validation) {
      setError(validation);
      return;
    }

    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await completeRequiredPasswordChange(nextPassword);
      setSuccess('Password updated successfully.');
      await onComplete();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to update password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.screen}>
      <section className={styles.card} aria-label="Create new password">
        <div className={styles.brand}>
          <img src={logo} alt="BESTBUILT logo" />
          <div>
            <p className={styles.eyebrow}>Security required</p>
            <h1>Create New Password</h1>
            <p>Your password was reset by an admin. Create a new password before continuing.</p>
          </div>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <label htmlFor="new-password">New Password</label>
          <div className={styles.passwordField}>
            <input
              id="new-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((current) => !current)}
              aria-label={showPassword ? 'Hide new password' : 'Show new password'}
              aria-pressed={showPassword}
            >
              <i className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
            </button>
          </div>

          <label htmlFor="confirm-new-password">Confirm New Password</label>
          <div className={styles.passwordField}>
            <input
              id="confirm-new-password"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
              aria-pressed={showConfirmPassword}
            >
              <i className={`fa-solid ${showConfirmPassword ? 'fa-eye-slash' : 'fa-eye'}`} aria-hidden="true"></i>
            </button>
          </div>

          <ul className={styles.requirements}>
            <li>At least 8 characters</li>
            <li>Uppercase and lowercase letters</li>
            <li>At least one number</li>
            <li>Different from the temporary password</li>
          </ul>

          {error ? <p className={styles.error}>{error}</p> : null}
          {success ? <p className={styles.success}>{success}</p> : null}

          <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
            {isSubmitting ? 'Saving New Password...' : 'Save New Password'}
          </button>
        </form>
      </section>
    </div>
  );
}
