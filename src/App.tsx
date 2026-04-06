import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';

type ProductView = 'summary' | 'add';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [productView, setProductView] = useState<ProductView>('summary');

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
        return <div>Order Page - coming soon!</div>;
      case 'Sales':
        return <div>Sales Page - coming soon!</div>;
      case 'Accounts':
        return <div>Accounts Page - coming soon!</div>;
      case 'Settings':
        return <div>Settings Page - coming soon!</div>;
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
