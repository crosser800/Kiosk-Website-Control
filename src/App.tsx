import { useEffect, useRef, useState } from 'react';
import './App.css';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import AccountProfilePanel from './components/account/AccountProfilePanel';

import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Sales from './pages/Sales';
import Accounts from './pages/Accounts';
import Login from './pages/Login';
import Settings from './pages/Settings';
import CreateNewPassword from './pages/CreateNewPassword';

import { supabase } from './lib/supabase';
import {
  resolveAuthenticatedAccess,
  signOutInternalAdminOnly,
  signOutAdmin,
  signOutOperationsGateway,
  type AuthAccessState,
} from './services/auth';
import { hasModulePermission } from './services/internalAdminAuth';
import { useCurrentAdminProfile } from './hooks/useCurrentAdminProfile';
import { getVersionedImageUrl } from './utils/profileImages';

type ProductView = 'summary' | 'add';

function logAppLifecycle(message: string, details: Record<string, unknown> = {}) {
  if (!import.meta.env.DEV) {
    return;
  }

  console.info(`[app-lifecycle] ${message}`, details);
}

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() =>
    window.matchMedia('(max-width: 1024px)').matches,
  );
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] =
    useState(false);
  const [isGatewayLogoutConfirmOpen, setIsGatewayLogoutConfirmOpen] =
    useState(false);
  const [isInternalBackConfirmOpen, setIsInternalBackConfirmOpen] =
    useState(false);
  const [isAccountProfileOpen, setIsAccountProfileOpen] =
    useState(false);
  const [isLoggingOut, setIsLoggingOut] =
    useState(false);
  const [isGatewayLoggingOut, setIsGatewayLoggingOut] =
    useState(false);
  const [isInternalBackLoggingOut, setIsInternalBackLoggingOut] =
    useState(false);
  const [gatewayLogoutPassword, setGatewayLogoutPassword] =
    useState('');
  const [gatewayLogoutPasswordError, setGatewayLogoutPasswordError] =
    useState('');
  const [productView, setProductView] =
    useState<ProductView>('summary');

  const [authAccessState, setAuthAccessState] =
    useState<AuthAccessState>({ kind: 'none' });

  const [isInitializingAuth, setIsInitializingAuth] =
    useState(true);

  const [isCompactNavigation, setIsCompactNavigation] =
    useState(() =>
      window.matchMedia('(max-width: 1024px)').matches,
    );

  const isAuthenticated =
    authAccessState.kind === 'admin' ||
    authAccessState.kind === 'agent_password_change';

  const activeRef = useRef(active);
  const productViewRef = useRef(productView);
  const authAccessStateRef = useRef(authAccessState);
  const isInitializingAuthRef = useRef(isInitializingAuth);
  const productNavigationGuardRef = useRef<(() => Promise<boolean>) | null>(null);
  const gatewayLogoutConfirmButtonRef =
    useRef<HTMLButtonElement | null>(null);
  const gatewayLogoutPasswordInputRef =
    useRef<HTMLInputElement | null>(null);
  const internalBackConfirmButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const currentAdminProfile = useCurrentAdminProfile(
    authAccessState.kind === 'admin' && !authAccessState.internalSession,
  );

  const internalPermissions =
    authAccessState.kind === 'admin'
      ? authAccessState.internalSession?.permissions ?? null
      : null;

  const allowedNavigationItems =
    internalPermissions === null
      ? undefined
      : ['Dashboard', 'Products', 'Order', 'Sales', 'Accounts', 'Settings'].filter((item) =>
          item === 'Dashboard' || hasModulePermission(internalPermissions, item),
        );

  useEffect(() => {
    activeRef.current = active;
    productViewRef.current = productView;
    authAccessStateRef.current = authAccessState;
    isInitializingAuthRef.current = isInitializingAuth;
  }, [active, productView, authAccessState, isInitializingAuth]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      logAppLifecycle('document visibility changed', {
        visibilityState: document.visibilityState,
        active: activeRef.current,
        productView: productViewRef.current,
      });
    };

    const handleWindowFocus = () => {
      logAppLifecycle('window focused', {
        active: activeRef.current,
        productView: productViewRef.current,
      });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia(
      '(max-width: 1024px)',
    );

    const handleChange = (
      event: MediaQueryListEvent,
    ) => {
      setIsCompactNavigation(event.matches);
      if (event.matches) {
        setIsCollapsed(true);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener(
        'change',
        handleChange,
      );
    };
  }, []);

  useEffect(() => {
    if (!isCompactNavigation || isCollapsed) {
      return;
    }

    window.history.pushState(
      { ...window.history.state, kioskSidebarOpen: true },
      '',
    );

    const handlePopState = () => {
      setIsCollapsed(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isCollapsed, isCompactNavigation]);

  const handleSidebarToggle = () => {
    if (isCompactNavigation && !isCollapsed) {
      window.history.back();
      return;
    }

    setIsCollapsed((current) => !current);
  };

  const handleSidebarCollapsedChange = (collapsed: boolean) => {
    if (collapsed && isCompactNavigation && !isCollapsed) {
      window.history.back();
      return;
    }

    setIsCollapsed(collapsed);
  };

  useEffect(() => {
    if (!isGatewayLogoutConfirmOpen) return;

    gatewayLogoutPasswordInputRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isGatewayLoggingOut) {
        setIsGatewayLogoutConfirmOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGatewayLogoutConfirmOpen, isGatewayLoggingOut]);

  useEffect(() => {
    if (!isInternalBackConfirmOpen) return;

    internalBackConfirmButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isInternalBackLoggingOut) {
        setIsInternalBackConfirmOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInternalBackConfirmOpen, isInternalBackLoggingOut]);

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current;

      document.documentElement.classList.toggle(
        'dark',
        next,
      );

      return next;
    });
  };

  const applyAccessState = (
    accessState: AuthAccessState,
    options: { resetNavigation?: boolean; reason?: string } = {},
  ) => {
    setAuthAccessState(accessState);

    if (options.resetNavigation && accessState.kind === 'admin') {
      logAppLifecycle('navigation reset after interactive auth', {
        reason: options.reason ?? 'unknown',
        from: activeRef.current,
      });
      setActive('Dashboard');
      setProductView('summary');
    }
  };

  useEffect(() => {
    let mounted = true;

    const initializeAuthentication = async () => {
      try {
        const accessState =
          await resolveAuthenticatedAccess();

        if (!mounted) {
          return;
        }

        applyAccessState(accessState, {
          reason: 'initial-session',
        });
      } catch (error) {
        console.error(
          'Failed to initialize authentication:',
          error,
        );

        if (mounted) {
          setAuthAccessState({ kind: 'none' });
        }
      } finally {
        if (mounted) {
          setIsInitializingAuth(false);
        }
      }
    };

    void initializeAuthentication();

    const { data: authSubscription } =
      supabase.auth.onAuthStateChange(
        (event, session) => {
          logAppLifecycle('supabase auth event', {
            event,
            hasSession: Boolean(session),
            active: activeRef.current,
            productView: productViewRef.current,
          });

          if (event === 'SIGNED_OUT') {
            logAppLifecycle('signed out navigation', {
              from: activeRef.current,
            });
            setAuthAccessState({ kind: 'none' });
            setIsInitializingAuth(false);
            return;
          }

          if (!session) {
            if (
              event === 'INITIAL_SESSION' ||
              authAccessStateRef.current.kind === 'none'
            ) {
              setAuthAccessState({ kind: 'none' });
            }
            return;
          }

          /*
           * Resolve the actual admin/agent access state
           * after sign-in, token refresh, or session restoration. Background
           * auth events must not navigate or remount the current workspace.
           */
          const shouldBlockUi =
            authAccessStateRef.current.kind === 'none' &&
            isInitializingAuthRef.current;

          if (shouldBlockUi) {
            setIsInitializingAuth(true);
          }

          window.setTimeout(() => {
            void resolveAuthenticatedAccess()
              .then((accessState) => {
                if (mounted) {
                  applyAccessState(accessState, {
                    reason: `auth-event:${event}`,
                  });
                }
              })
              .catch((error) => {
                console.error(
                  'Failed to resolve authenticated access:',
                  error,
                );

                if (mounted && authAccessStateRef.current.kind === 'none') {
                  setAuthAccessState({
                    kind: 'error',
                    message: 'Unable to verify account access. Please try again.',
                  });
                }
              })
              .finally(() => {
                if (mounted && shouldBlockUi) {
                  setIsInitializingAuth(false);
                }
              });
          }, 0);
        },
      );

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const headerTitle =
    active === 'Products' && productView === 'add'
      ? 'Products > Add New Product'
      : active;

  const sidebarAccountName =
    (authAccessState.kind === 'admin'
      ? authAccessState.internalSession?.account.fullName
      : '') ||
    currentAdminProfile.profile?.fullName ||
    (authAccessState.kind === 'admin' &&
    authAccessState.email
      ? authAccessState.email.split('@')[0]
      : 'Admin User');

  const sidebarAccountRole =
    (authAccessState.kind === 'admin' && authAccessState.internalSession ? 'Internal Admin' : '') ||
    currentAdminProfile.profile?.roleLabel ||
    (authAccessState.kind === 'admin' &&
    authAccessState.role === 'admin'
      ? 'Admin'
      : 'Super Admin');

  const internalProfileImage =
    authAccessState.kind === 'admin'
      ? authAccessState.internalSession?.account.profileImageUrl ?? ''
      : '';
  const sidebarAccountImage = internalProfileImage
    ? internalProfileImage
    : currentAdminProfile.profile?.profileImageUrl
      ? getVersionedImageUrl(
          currentAdminProfile.profile.profileImageUrl,
          currentAdminProfile.profile.updatedAt,
        )
      : '';

  const handleNavigate = async (item: string) => {
    if (allowedNavigationItems && !allowedNavigationItems.includes(item)) {
      return;
    }
    if (item !== 'Products' && productNavigationGuardRef.current) {
      const canLeaveProducts = await productNavigationGuardRef.current();
      if (!canLeaveProducts) {
        return;
      }
    }
    logAppLifecycle('user navigation', {
      from: activeRef.current,
      to: item,
    });
    setActive(item);

    if (item !== 'Products') {
      setProductView('summary');
    }
  };

  const handleLogin = async () => {
    setIsInitializingAuth(true);

    try {
      const accessState =
        await resolveAuthenticatedAccess();

      applyAccessState(accessState, {
        resetNavigation: true,
        reason: 'login',
      });
    } catch (error) {
      console.error(
        'Failed to resolve login access:',
        error,
      );

      setAuthAccessState({ kind: 'none' });
    } finally {
      setIsInitializingAuth(false);
    }
  };

  const handleLogoutRequest = () => {
    setIsLogoutConfirmOpen(true);
  };

  const handleGatewayLogoutRequest = () => {
    setGatewayLogoutPassword('');
    setGatewayLogoutPasswordError('');
    setIsGatewayLogoutConfirmOpen(true);
  };

  const handleBackToInternalLoginRequest = () => {
    setIsInternalBackConfirmOpen(true);
  };

  const handleCancelGatewayLogout = () => {
    if (isGatewayLoggingOut) {
      return;
    }

    setIsGatewayLogoutConfirmOpen(false);
    setGatewayLogoutPassword('');
    setGatewayLogoutPasswordError('');
  };

  const handleConfirmGatewayLogout = async () => {
    if (isGatewayLoggingOut) {
      return;
    }

    if (!gatewayLogoutPassword) {
      setGatewayLogoutPasswordError('Enter the Operations Account password.');
      return;
    }

    const email =
      authAccessStateRef.current.kind === 'internal_login_required' ||
      authAccessStateRef.current.kind === 'internal_password_change' ||
      authAccessStateRef.current.kind === 'admin'
        ? authAccessStateRef.current.email
        : null;

    if (!email) {
      setGatewayLogoutPasswordError('Unable to verify this Operations Account.');
      return;
    }

    setIsGatewayLoggingOut(true);
    setGatewayLogoutPasswordError('');

    try {
      const { error: passwordError } = await supabase.auth.signInWithPassword({
        email,
        password: gatewayLogoutPassword,
      });

      if (passwordError) {
        setGatewayLogoutPasswordError('Invalid Operations Account password.');
        return;
      }

      await signOutOperationsGateway();
      setAuthAccessState({ kind: 'none' });
      setActive('Dashboard');
      setProductView('summary');
      setIsCollapsed(false);
      setIsGatewayLogoutConfirmOpen(false);
      setGatewayLogoutPassword('');
    } finally {
      setIsGatewayLoggingOut(false);
    }
  };

  const handleBackToInternalLogin = async () => {
    const email =
      authAccessStateRef.current.kind === 'internal_password_change'
        ? authAccessStateRef.current.email
        : null;

    try {
      await signOutInternalAdminOnly();
    } catch (error) {
      console.error('Internal password-change back logout failed', error);
    } finally {
      setAuthAccessState({
        kind: 'internal_login_required',
        email,
      });
      setActive('Dashboard');
      setProductView('summary');
    }
  };

  const handleCancelBackToInternalLogin = () => {
    if (isInternalBackLoggingOut) {
      return;
    }

    setIsInternalBackConfirmOpen(false);
  };

  const handleConfirmBackToInternalLogin = async () => {
    if (isInternalBackLoggingOut) {
      return;
    }

    setIsInternalBackLoggingOut(true);

    try {
      await handleBackToInternalLogin();
      setIsInternalBackConfirmOpen(false);
    } finally {
      setIsInternalBackLoggingOut(false);
    }
  };

  const handleCancelLogout = () => {
    if (isLoggingOut) {
      return;
    }

    setIsLogoutConfirmOpen(false);
  };

  const handleConfirmLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      if (authAccessStateRef.current.kind === 'admin' && authAccessStateRef.current.internalSession) {
        await signOutInternalAdminOnly();
      } else {
        await signOutAdmin();
      }
    } finally {
      const nextAccessState =
        authAccessStateRef.current.kind === 'admin' && authAccessStateRef.current.internalSession
          ? ({ kind: 'internal_login_required', email: authAccessStateRef.current.email } as AuthAccessState)
          : ({ kind: 'none' } as AuthAccessState);
      setAuthAccessState(nextAccessState);
      setIsLogoutConfirmOpen(false);
      setIsLoggingOut(false);
      setIsCollapsed(false);
      setActive('Dashboard');
      setProductView('summary');
    }
  };

  const handlePasswordChangeComplete =
    async () => {
      const accessState =
        await resolveAuthenticatedAccess();

      if (accessState.kind === 'admin') {
        applyAccessState(accessState, {
          resetNavigation: true,
          reason: 'password-change-complete',
        });
        return;
      }

      /*
       * Agents currently use the admin web app only
       * for the mandatory password-change screen.
       * After completing it, sign them out so they
       * can log in through their intended portal.
       */
      await signOutAdmin();
      setAuthAccessState({ kind: 'none' });
    };

  const renderPage = () => {
    switch (active) {
      case 'Dashboard':
        return <Dashboard />;

      case 'Products':
        return (
          <Products
            view={productView}
            onRegisterNavigationGuard={(guard) => {
              productNavigationGuardRef.current = guard;
            }}
            onOpenAddProduct={() =>
              setProductView('add')
            }
            onCloseAddProduct={() =>
              setProductView('summary')
            }
          />
        );

      case 'Order':
        return <Orders />;

      case 'Sales':
        return <Sales />;

      case 'Accounts':
        return <Accounts />;

      case 'Settings':
        return (
          <Settings
            isDark={isDark}
            onToggleTheme={toggleTheme}
          />
        );

      default:
        return <Dashboard />;
    }
  };

  const renderGatewayLogoutConfirm = () =>
    isGatewayLogoutConfirmOpen ? (
      <div
        className="auth-confirm-overlay"
        role="presentation"
      >
        <section
          className="auth-confirm-modal logout-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gateway-logout-confirm-title"
          aria-describedby="gateway-logout-confirm-message"
        >
          <p className="auth-confirm-eyebrow logout-confirm-eyebrow">
            Operations
          </p>
          <h2
            id="gateway-logout-confirm-title"
            className="auth-confirm-title"
          >
            Log Out Operations Account?
          </h2>
          <p
            id="gateway-logout-confirm-message"
            className="auth-confirm-text"
          >
            You will be signed out of the Operations
            Account and returned to the main login screen.
          </p>
          <form
            className="auth-confirm-form"
            onSubmit={(event) => {
              event.preventDefault();
              void handleConfirmGatewayLogout();
            }}
          >
            <label
              className="auth-confirm-label"
              htmlFor="gateway-logout-password"
            >
              Operations Account Password
            </label>
            <input
              id="gateway-logout-password"
              ref={gatewayLogoutPasswordInputRef}
              className="auth-confirm-input"
              type="password"
              value={gatewayLogoutPassword}
              onChange={(event) => {
                setGatewayLogoutPassword(event.target.value);
                setGatewayLogoutPasswordError('');
              }}
              autoComplete="current-password"
              disabled={isGatewayLoggingOut}
              aria-invalid={gatewayLogoutPasswordError ? 'true' : 'false'}
              aria-describedby={
                gatewayLogoutPasswordError
                  ? 'gateway-logout-password-error'
                  : undefined
              }
            />
            {gatewayLogoutPasswordError ? (
              <p
                id="gateway-logout-password-error"
                className="auth-confirm-error"
              >
                {gatewayLogoutPasswordError}
              </p>
            ) : null}
            <div className="auth-confirm-actions">
              <button
                type="button"
                className="auth-confirm-cancel"
                onClick={handleCancelGatewayLogout}
                disabled={isGatewayLoggingOut}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="auth-confirm-proceed"
                disabled={isGatewayLoggingOut}
                ref={gatewayLogoutConfirmButtonRef}
              >
                {isGatewayLoggingOut
                  ? 'Logging Out...'
                  : 'Log Out'}
              </button>
            </div>
          </form>
        </section>
      </div>
    ) : null;

  const renderInternalBackConfirm = () =>
    isInternalBackConfirmOpen ? (
      <div
        className="auth-confirm-overlay"
        role="presentation"
      >
        <section
          className="auth-confirm-modal logout-confirm-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="internal-back-confirm-title"
          aria-describedby="internal-back-confirm-message"
        >
          <p className="auth-confirm-eyebrow logout-confirm-eyebrow">
            Password Change
          </p>
          <h2
            id="internal-back-confirm-title"
            className="auth-confirm-title"
          >
            Discard Password Change?
          </h2>
          <p
            id="internal-back-confirm-message"
            className="auth-confirm-text"
          >
            This will sign out of the Operations Account
            and return to Internal Login. Your new password
            will not be saved.
          </p>
          <div className="auth-confirm-actions">
            <button
              type="button"
              className="auth-confirm-cancel"
              onClick={handleCancelBackToInternalLogin}
              disabled={isInternalBackLoggingOut}
            >
              Cancel
            </button>
            <button
              type="button"
              className="auth-confirm-proceed"
              onClick={() => void handleConfirmBackToInternalLogin()}
              disabled={isInternalBackLoggingOut}
              ref={internalBackConfirmButtonRef}
            >
              {isInternalBackLoggingOut
                ? 'Continuing...'
                : 'Continue'}
            </button>
          </div>
        </section>
      </div>
    ) : null;

  if (isInitializingAuth) {
    return null;
  }

  if (!isAuthenticated) {
    if (authAccessState.kind === 'internal_login_required') {
      return (
        <>
          <Login
            mode="internal"
            onLogin={handleLogin}
            onGatewayLogout={handleGatewayLogoutRequest}
          />
          {renderGatewayLogoutConfirm()}
        </>
      );
    }

    if (authAccessState.kind === 'internal_password_change') {
      return (
        <>
          <Login
            mode="internalPasswordChange"
            onLogin={handleLogin}
            onBackToInternalLogin={handleBackToInternalLoginRequest}
          />
          {renderInternalBackConfirm()}
        </>
      );
    }

    return <Login onLogin={handleLogin} />;
  }

  if (
    authAccessState.kind ===
    'agent_password_change'
  ) {
    return (
      <CreateNewPassword
        onComplete={handlePasswordChangeComplete}
      />
    );
  }

  return (
    <div className="app-container">
      <Sidebar
        active={active}
        onNavigate={handleNavigate}
        isCollapsed={isCollapsed}
        canToggle={!isCompactNavigation}
        onToggle={handleSidebarCollapsedChange}
        onLogout={handleLogoutRequest}
        onAccount={() => setIsAccountProfileOpen(true)}
        accountName={sidebarAccountName}
        accountRole={sidebarAccountRole}
        accountImageUrl={sidebarAccountImage}
        allowedItems={allowedNavigationItems}
      />

      <Header
        active={headerTitle}
        isDark={isDark}
        onToggle={toggleTheme}
        isCollapsed={isCollapsed}
        onToggleSidebar={handleSidebarToggle}
      />

      <MainContent
        contentKey={`${active}-${productView}`}
        isCollapsed={isCollapsed}
      >
        {renderPage()}
      </MainContent>

      {isLogoutConfirmOpen ? (
        <div
          className="auth-confirm-overlay"
          role="presentation"
        >
          <section
            className="auth-confirm-modal logout-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="logout-confirm-title"
            aria-describedby="logout-confirm-message"
          >
            <p className="auth-confirm-eyebrow logout-confirm-eyebrow">
              Session
            </p>
            <h2
              id="logout-confirm-title"
              className="auth-confirm-title"
            >
              Log Out
            </h2>
            <p
              id="logout-confirm-message"
              className="auth-confirm-text"
            >
              Are you sure you want to log out of your
              account?
            </p>
            <p className="logout-confirm-support">
              Your current session will end and you will
              need to sign in again.
            </p>
            <div className="auth-confirm-actions">
              <button
                type="button"
                className="auth-confirm-cancel"
                onClick={handleCancelLogout}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="auth-confirm-proceed"
                onClick={handleConfirmLogout}
                disabled={isLoggingOut}
              >
                {isLoggingOut
                  ? 'Logging Out...'
                  : 'Log Out'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {renderGatewayLogoutConfirm()}

      {isAccountProfileOpen ? (
        <AccountProfilePanel
          profile={currentAdminProfile.profile}
          isLoading={currentAdminProfile.isLoading}
          error={currentAdminProfile.error}
          onReload={currentAdminProfile.reload}
          onProfileUpdated={currentAdminProfile.setProfile}
          onClose={() => setIsAccountProfileOpen(false)}
        />
      ) : null}
    </div>
  );
}
