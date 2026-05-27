import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import Orders from './pages/Orders';
import Sales from './pages/Sales';
import Accounts from './pages/Accounts';
import Settings from './pages/Settings';

type ProductView = 'summary' | 'add';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [productView, setProductView] = useState<ProductView>('summary');

  const toggleTheme = () => {
    setIsDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle('dark', next);
      return next;
    });
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
        return <Settings />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        active={active}
        onNavigate={handleNavigate}
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
      />
      <Header
        active={headerTitle}
        isDark={isDark}
        onToggle={toggleTheme}
        isCollapsed={isCollapsed}
      />
      <MainContent isCollapsed={isCollapsed}>
        {renderPage()}
      </MainContent>
    </div>
  );
}
