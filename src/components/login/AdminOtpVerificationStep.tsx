import type { FormEvent } from 'react';
import { getMaskedEmail } from '../../services/adminActivation';
import styles from '../../pages/Login.module.css';

export const adminVerificationCodeLength = 8;

type AdminOtpVerificationStepProps = {
  email: string;
  token: string;
  error: string;
  info: string;
  cooldown: number;
  isSending: boolean;
  isVerifying: boolean;
  hasSentCode: boolean;
  onTokenChange: (token: string) => void;
  onSendCode: () => void;
  onVerify: () => void;
  onBack: () => void;
};

export default function AdminOtpVerificationStep({
  email,
  token,
  error,
  info,
  cooldown,
  isSending,
  isVerifying,
  hasSentCode,
  onTokenChange,
  onSendCode,
  onVerify,
  onBack,
}: AdminOtpVerificationStepProps) {
  const canVerify = token.length === adminVerificationCodeLength;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (hasSentCode) {
      onVerify();
      return;
    }
    onSendCode();
  }

  return (
    <>
      <div className={styles.formHeader}>
        <h2>{hasSentCode ? 'Enter verification code' : 'Verify your email'}</h2>
        <p>
          This administrator account requires first-time setup. We will send a
          verification code to the registered email.
        </p>
      </div>

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.emailSummary}>
          <span>{getMaskedEmail(email)}</span>
          <button type="button" onClick={onBack}>
            Change Email
          </button>
        </div>

        {hasSentCode ? (
          <>
            <label htmlFor="otp-code">Verification Code</label>
            <input
              id="otp-code"
              type="text"
              inputMode="numeric"
              maxLength={adminVerificationCodeLength}
              value={token}
              onChange={(event) =>
                onTokenChange(event.target.value.replace(/\D/g, '').slice(0, adminVerificationCodeLength))
              }
              placeholder="Enter the 8-digit verification code."
              autoComplete="one-time-code"
              autoFocus
            />
          </>
        ) : null}

        {info ? <p className={styles.info}>{info}</p> : null}
        {error ? <p className={styles.error}>{error}</p> : null}

        <button
          type="submit"
          disabled={isSending || isVerifying || (hasSentCode && !canVerify)}
          className={styles.submitButton}
        >
          {hasSentCode
            ? isVerifying
              ? 'Verifying...'
              : 'Verify'
            : isSending
              ? 'Sending...'
              : 'Send Verification Code'}
        </button>

        {hasSentCode ? (
          <button
            type="button"
            className={styles.secondaryAction}
            onClick={onSendCode}
            disabled={cooldown > 0 || isSending || isVerifying}
          >
            {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend Code'}
          </button>
        ) : null}
      </form>
    </>
  );
}
