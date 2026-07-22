import { useEffect, useState } from 'react';
import './App.css';

import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';

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

type ProductView = 'summary' | 'add';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
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
  ) => {
    setAuthAccessState(accessState);

    if (accessState.kind === 'admin') {
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

        applyAccessState(accessState);
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
          if (
            event === 'SIGNED_OUT' ||
            !session
          ) {
            setAuthAccessState({ kind: 'none' });
            return;
          }

          /*
           * Resolve the actual admin/agent access state
           * after sign-in or token restoration.
           */
          window.setTimeout(() => {
            void resolveAuthenticatedAccess()
              .then((accessState) => {
                if (mounted) {
                  applyAccessState(accessState);
                }
              })
              .catch((error) => {
                console.error(
                  'Failed to resolve authenticated access:',
                  error,
                );

                if (mounted) {
                  setAuthAccessState({
                    kind: 'none',
                  });
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

  const handleNavigate = (item: string) => {
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

      applyAccessState(accessState);
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

  const handleLogout = async () => {
    try {
      await signOutAdmin();
    } finally {
      setAuthAccessState({ kind: 'none' });
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
        applyAccessState(accessState);
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
        onLogout={handleLogout}
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
    </div>
  );
}