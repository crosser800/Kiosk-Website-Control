import type { FormEvent } from 'react';
import styles from '../../pages/Login.module.css';

type EmailLoginStepProps = {
  email: string;
  error: string;
  isSubmitting: boolean;
  onEmailChange: (email: string) => void;
  onSubmit: () => void;
};

export default function EmailLoginStep({
  email,
  error,
  isSubmitting,
  onEmailChange,
  onSubmit,
}: EmailLoginStepProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <>
      <div className={styles.formHeader}>
        <h2>Welcome back</h2>
        <p>Sign in to manage products, pricing, sales, and team settings.</p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="Enter your email"
          autoComplete="email"
          autoFocus
        />

        {error ? <p className={styles.error}>{error}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className={`${styles.submitButton} ${isSubmitting ? styles.checkingButton : ''}`}
        >
          <span className={styles.buttonContent}>
            {isSubmitting ? (
              <>
                <span className={styles.loadingDots} aria-hidden="true">
                  <span></span>
                  <span></span>
                  <span></span>
                </span>
                Checking account...
              </>
            ) : (
              'Continue'
            )}
          </span>
        </button>
      </form>
    </>
  );
}
