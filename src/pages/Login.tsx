import { useState } from 'react';
import type { FormEvent } from 'react';
import logo from '../assets/2B LOGO.png';
import { signInAdmin } from '../services/auth';
import styles from './Login.module.css';

type LoginProps = {
  onLogin: () => void;
};

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      onLogin();
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
        <div className={styles.brand}>
          <img src={logo} alt="BESTBUILT logo" />
          <h1>BESTBUILT</h1>
          <p>Kiosk Website Control</p>
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
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter your password"
          />

          {error && <p className={styles.error}>{error}</p>}

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
