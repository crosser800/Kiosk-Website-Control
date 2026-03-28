import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import MainContent from './components/MainContent';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';  // ← renamed to Products

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const toggleTheme = () => {
    setIsDark(!isDark);
    document.documentElement.classList.toggle('dark');
  };

  const renderPage = () => {
    switch (active) {
      case 'Dashboard':
        return <Dashboard />;
      case 'Products':
        return <Products />;
        
      case 'Order':
        return <div>Order Page — coming soon!</div>;
      case 'Sales':
        return <div>Sales Page — coming soon!</div>;
      case 'Accounts':
        return <div>Accounts Page — coming soon!</div>;
      case 'Settings':
        return <div>Settings Page — coming soon!</div>;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="app-container">
      <Sidebar
        active={active}
        onNavigate={setActive}
        isCollapsed={isCollapsed}
        onToggle={setIsCollapsed}
      />
      <Header
        active={active}
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