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
  signOutAdmin,
  type AuthAccessState,
} from './services/auth';
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
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] =
    useState(false);
  const [isAccountProfileOpen, setIsAccountProfileOpen] =
    useState(false);
  const [isLoggingOut, setIsLoggingOut] =
    useState(false);
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

  const currentAdminProfile = useCurrentAdminProfile(
    authAccessState.kind === 'admin',
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
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener(
        'change',
        handleChange,
      );
    };
  }, []);

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
    currentAdminProfile.profile?.fullName ||
    (authAccessState.kind === 'admin' &&
    authAccessState.email
      ? authAccessState.email.split('@')[0]
      : 'Admin User');

  const sidebarAccountRole =
    currentAdminProfile.profile?.roleLabel ||
    (authAccessState.kind === 'admin' &&
    authAccessState.role === 'admin'
      ? 'Admin'
      : 'Super Admin');

  const sidebarAccountImage =
    currentAdminProfile.profile?.profileImageUrl
      ? getVersionedImageUrl(
          currentAdminProfile.profile.profileImageUrl,
          currentAdminProfile.profile.updatedAt,
        )
      : '';

  const handleNavigate = (item: string) => {
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
      await signOutAdmin();
    } finally {
      setAuthAccessState({ kind: 'none' });
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

  if (isInitializingAuth) {
    return null;
  }

  if (!isAuthenticated) {
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
        isCollapsed={
          isCollapsed || isCompactNavigation
        }
        canToggle={!isCompactNavigation}
        onToggle={setIsCollapsed}
        onLogout={handleLogoutRequest}
        onAccount={() => setIsAccountProfileOpen(true)}
        accountName={sidebarAccountName}
        accountRole={sidebarAccountRole}
        accountImageUrl={sidebarAccountImage}
      />

      <Header
        active={headerTitle}
        isDark={isDark}
        onToggle={toggleTheme}
        isCollapsed={
          isCollapsed || isCompactNavigation
        }
      />

      <MainContent
        contentKey={`${active}-${productView}`}
        isCollapsed={
          isCollapsed || isCompactNavigation
        }
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
