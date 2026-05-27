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
import { supabase } from './lib/supabase';
import { signOutAdmin } from './services/auth';

type ProductView = 'summary' | 'add';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [productView, setProductView] = useState<ProductView>('summary');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitializingAuth, setIsInitializingAuth] = useState(true);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

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

  const handleLogin = () => {
    setIsAuthenticated(true);
    setActive('Dashboard');
  };

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setIsAuthenticated(Boolean(data.session));
      setIsInitializingAuth(false);
    };

    void initAuth();

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await signOutAdmin();
    setIsAuthenticated(false);
    setIsCollapsed(false);
    setProductView('summary');
  };

  const renderPage = () => {
    switch (active) {
      case 'Dashboard':
        return <Dashboard />;
      case 'Products':
        return (
          <Products
            view={productView}
            onOpenAddProduct={() => setProductView('add')}
            onCloseAddProduct={() => setProductView('summary')}
          />
        );
      case 'Order':
        return <Orders />;
      case 'Sales':
        return <Sales />;
      case 'Accounts':
        return <Accounts />;
      case 'Settings':
        return <div>Settings Page - coming soon!</div>;
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

  return (
    <div className="app-container">
      <Sidebar
        active={active}
        onNavigate={handleNavigate}
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
        onLogout={handleLogout}
      />
      <Header
        active={headerTitle}
        isDark={isDark}
        onToggle={toggleTheme}
        isCollapsed={isCollapsed}
      />
      <MainContent isCollapsed={isCollapsed}>{renderPage()}</MainContent>
    </div>
  );
}
