import { useEffect, useState } from 'react';
import './App.css';
import logo from './assets/2B LOGO.png';
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
import { supabase } from './lib/supabase';
import { signOutAdmin } from './services/auth';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializingAuth, setIsInitializingAuth] = useState(true);
  const [isLoginTransitionActive, setIsLoginTransitionActive] = useState(false);
  const [isAppReadyAfterLogin, setIsAppReadyAfterLogin] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
  };

  const handleNavigate = (item: string) => {
    setActive(item);
  };

  const handleLogin = async () => {
    setActive('Dashboard');
    setIsAppReadyAfterLogin(false);
    setIsLoginTransitionActive(true);
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setIsAppReadyAfterLogin(Boolean(data.session));
      setIsInitializingAuth(false);
    };

    void initAuth();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
      if (!session) {
        setIsLoginTransitionActive(false);
        setIsAppReadyAfterLogin(false);
        setIsLogoutConfirmOpen(false);
        setIsLoggingOut(false);
      }
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isLoginTransitionActive || !isAuthenticated) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsLoginTransitionActive(false);
      setIsAppReadyAfterLogin(true);
    }, 950);

    return () => window.clearTimeout(timeout);
  }, [isAuthenticated, isLoginTransitionActive]);

  const handleLogoutRequest = () => {
    setIsLogoutConfirmOpen(true);
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await signOutAdmin();
    setIsAuthenticated(false);
    setIsCollapsed(false);
  };

  const renderPage = () => {
    switch (active) {
      case 'Dashboard':
        return <Dashboard />;
      case 'Products':
        return <Products />;
      case 'Order':
        return <Orders />;
      case 'Sales':
        return <Sales />;
      case 'Accounts':
        return <Accounts />;
      case 'Settings':
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  if (isInitializingAuth) {
    return null;
  }

  if (!isAuthenticated && !isLoginTransitionActive) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <>
      {isAuthenticated && isAppReadyAfterLogin ? (
        <div className="app-container">
          <Sidebar
            active={active}
            onNavigate={handleNavigate}
            isCollapsed={isCollapsed}
            onToggle={setIsCollapsed}
            onLogout={handleLogoutRequest}
          />
          <Header
            active={active}
            isDark={isDark}
            onToggle={toggleTheme}
            isCollapsed={isCollapsed}
          />
          <MainContent
            isCollapsed={isCollapsed}
            contentKey={active}
          >
            {renderPage()}
          </MainContent>
        </div>
      ) : null}

      {isLoginTransitionActive ? (
        <div className="login-transition" aria-hidden="true">
          <div className="login-transition__glow"></div>
          <img
            src={logo}
            alt=""
            className="login-transition__logo"
          />
        </div>
      ) : null}

      {isLogoutConfirmOpen ? (
        <div className="auth-confirm-overlay" role="presentation">
          <div
            className="auth-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Confirm logout"
          >
            <p className="auth-confirm-eyebrow">Confirm action</p>
            <h2 className="auth-confirm-title">Are you sure you want to log out?</h2>
            <p className="auth-confirm-text">
              This helps prevent unwanted logout while you are still working.
            </p>
            <div className="auth-confirm-actions">
              <button
                type="button"
                className="auth-confirm-cancel"
                onClick={() => setIsLogoutConfirmOpen(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
              <button
                type="button"
                className="auth-confirm-proceed"
                onClick={() => void handleLogout()}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? 'Logging out...' : 'Yes, Log out'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
