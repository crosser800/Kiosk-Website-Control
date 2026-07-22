import { useState } from 'react';
import type { FormEvent } from 'react';
import logo from '../assets/2B LOGO.png';
import { signInAdmin } from '../services/auth';
import styles from './Login.module.css';

type LoginProps = {
  onLogin: () => void | Promise<void>;
};

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await signInAdmin(email.trim(), password);
      await onLogin();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Login failed.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.loginScreen}>
      <div className={styles.loginCard}>
        <div className={styles.brandPanel}>
          <div className={styles.brand}>
            <img src={logo} alt="BESTBUILT logo" />
            <div className={styles.brandCopy}>
              <p className={styles.eyebrow}>2B admin workspace</p>
              <p>Kiosk Website Control</p>
            </div>
          </div>

          <div className={styles.brandArt} aria-hidden="true">
            <div className={styles.brandWave}></div>
          </div>
        </div>

        <div className={styles.formPanel}>
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
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter your email"
            />

            <label htmlFor="password">Password</label>
            <div className={styles.passwordField}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
              <button
                type="button"
                className={styles.passwordToggle}
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                <i
                  className={`fa-solid ${showPassword ? 'fa-eye-slash' : 'fa-eye'}`}
                  aria-hidden="true"
                ></i>
              </button>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
              {isSubmitting ? 'Signing in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
