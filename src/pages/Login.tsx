import { useEffect, useState } from 'react';
import logo from '../assets/2B LOGO.png';
import AdminOtpVerificationStep, { adminVerificationCodeLength } from '../components/login/AdminOtpVerificationStep';
import CreateAdminPasswordStep from '../components/login/CreateAdminPasswordStep';
import EmailLoginStep from '../components/login/EmailLoginStep';
import PasswordLoginStep from '../components/login/PasswordLoginStep';
import {
  completeAdminActivation,
  isValidLoginEmail,
  normalizeLoginEmail,
  resolveAdminLoginMethod,
  startAdminActivation,
  validateAdminPassword,
  verifyAdminActivationOtp,
} from '../services/adminActivation';
import { signInAdmin } from '../services/auth';
import styles from './Login.module.css';

type LoginProps = {
  onLogin: () => void | Promise<void>;
};

type LoginStep = 'email' | 'password' | 'activation' | 'createPassword';

const unavailableMessage = 'Your administrator account does not exist.';
const inactiveMessage = 'Your administrator account is inactive. Please contact the system administrator.';
const successTransitionDurationMs = 2800;

function wait(duration: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function PasswordLoginLoading() {
  return (
    <div className={styles.loginLoadingState} role="status" aria-live="polite">
      <span className={styles.loadingLogoWrap}>
        <img src={logo} alt="" className={styles.loadingLogo} />
      </span>
      <div className={styles.loadingCopy}>
        <h2>Logging in...</h2>
        <p>Verifying your administrator access</p>
      </div>
      <span className={styles.loadingDots} aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </span>
    </div>
  );
}

function LoginSuccessTransition() {
  return (
    <div
      className={styles.successOverlay}
      role="status"
      aria-live="polite"
      aria-label="Login successful. Preparing your workspace."
    >
      <div className={styles.successCenter}>
        <div className={styles.logoPulseArea}>
          {[0, 1, 2, 3].map((ring) => (
            <span key={ring} className={styles.rippleRing}></span>
          ))}
          <img src={logo} alt="2B" className={styles.successLogo} />
        </div>

        <div className={styles.successMessage}>
          <h1>Welcome back</h1>
          <p>Preparing your workspace...</p>
        </div>
      </div>
    </div>
  );
}

export default function Login({ onLogin }: LoginProps) {
  const [step, setStep] = useState<LoginStep>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccessTransitionVisible, setIsSuccessTransitionVisible] = useState(false);
  const [hasSentOtp, setHasSentOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = window.setTimeout(() => {
      setResendCooldown((current) => Math.max(current - 1, 0));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [resendCooldown]);

  function resetForEmailChange() {
    setStep('email');
    setPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setOtpToken('');
    setError('');
    setInfo('');
    setHasSentOtp(false);
    setResendCooldown(0);
  }

  async function handleContinue() {
    const normalizedEmail = normalizeLoginEmail(email);

    if (!isValidLoginEmail(normalizedEmail)) {
      setError('Enter a valid email address.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      const resolution = await resolveAdminLoginMethod(normalizedEmail);
      setEmail(normalizedEmail);

      if (resolution.method === 'password') {
        setStep('password');
        return;
      }

      if (resolution.method === 'activation') {
        setStep('activation');
        return;
      }

      setError(resolution.reason === 'inactive' ? inactiveMessage : unavailableMessage);
    } catch (nextError) {
      console.error('Admin login method resolution failed', nextError);
      setError(nextError instanceof Error ? nextError.message : unavailableMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handlePasswordLogin() {
    if (!password.trim()) {
      setError('Enter your password.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await signInAdmin(email, password);
      setIsSuccessTransitionVisible(true);
      await wait(successTransitionDurationMs);
      await onLogin();
    } catch (submitError) {
      console.error('Admin password login failed', submitError);
      setError('Invalid email or password.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSendOtp() {
    if (resendCooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      await startAdminActivation(email);
      setHasSentOtp(true);
      setResendCooldown(60);
      setInfo('Verification code sent. Check your email for the numeric code.');
    } catch (nextError) {
      console.error('Admin activation OTP send failed', nextError);
      setError(nextError instanceof Error ? nextError.message : unavailableMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerifyOtp() {
    if (!new RegExp(`^\\d{${adminVerificationCodeLength}}$`).test(otpToken.trim())) {
      setError('Verification code must contain exactly 8 digits.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    setInfo('');

    try {
      await verifyAdminActivationOtp(email, otpToken);
      setStep('createPassword');
      setOtpToken('');
    } catch (nextError) {
      console.error('Admin activation OTP verification failed', nextError);
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'The verification code is invalid or has expired.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleActivateAccount() {
    const validation = validateAdminPassword(newPassword);

    if (!validation.isValid) {
      setError('Your password does not meet the requirements.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords must match.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await completeAdminActivation(newPassword);
      setIsSuccessTransitionVisible(true);
      await wait(successTransitionDurationMs);
      await onLogin();
    } catch (nextError) {
      console.error('Admin activation completion failed', nextError);
      setError(
        nextError instanceof Error
          ? nextError.message
          : 'Unable to activate this admin account.',
      );
    } finally {
      setIsSubmitting(false);
    }
  }

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
          <div key={`${step}-${step === 'password' && isSubmitting ? 'loading' : 'ready'}`} className={styles.stepScene}>
            {step === 'email' ? (
              <EmailLoginStep
                email={email}
                error={error}
                isSubmitting={isSubmitting}
                onEmailChange={(nextEmail) => {
                  setEmail(nextEmail);
                  setError('');
                }}
                onSubmit={() => void handleContinue()}
              />
            ) : null}

            {step === 'password' ? (
              isSubmitting ? (
                <PasswordLoginLoading />
              ) : (
                <PasswordLoginStep
                  email={email}
                  password={password}
                  error={error}
                  isSubmitting={isSubmitting}
                  onPasswordChange={(nextPassword) => {
                    setPassword(nextPassword);
                    setError('');
                  }}
                  onBack={resetForEmailChange}
                  onSubmit={() => void handlePasswordLogin()}
                />
              )
            ) : null}

            {step === 'activation' ? (
              <AdminOtpVerificationStep
                email={email}
                token={otpToken}
                error={error}
                info={info}
                cooldown={resendCooldown}
                isSending={isSubmitting && !hasSentOtp}
                isVerifying={isSubmitting && hasSentOtp}
                hasSentCode={hasSentOtp}
                onTokenChange={(nextToken) => {
                  setOtpToken(nextToken);
                  setError('');
                }}
                onSendCode={() => void handleSendOtp()}
                onVerify={() => void handleVerifyOtp()}
                onBack={resetForEmailChange}
              />
            ) : null}

            {step === 'createPassword' ? (
              <CreateAdminPasswordStep
                password={newPassword}
                confirmPassword={confirmPassword}
                error={error}
                isSubmitting={isSubmitting}
                onPasswordChange={(nextPassword) => {
                  setNewPassword(nextPassword);
                  setError('');
                }}
                onConfirmPasswordChange={(nextPassword) => {
                  setConfirmPassword(nextPassword);
                  setError('');
                }}
                onSubmit={() => void handleActivateAccount()}
              />
            ) : null}
          </div>
        </div>
      </div>

      {isSuccessTransitionVisible ? <LoginSuccessTransition /> : null}
    </div>
  );
}
