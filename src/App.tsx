import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Header from './components/Header';

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
      case 'Product':
        return (
          <div style={{ padding: '24px' }}>Product Page — coming soon!</div>
        );
      case 'Order':
        return <div style={{ padding: '24px' }}>Order Page — coming soon!</div>;
      case 'Sales':
        return <div style={{ padding: '24px' }}>Sales Page — coming soon!</div>;
      case 'Accounts':
        return (
          <div style={{ padding: '24px' }}>Accounts Page — coming soon!</div>
        );
      case 'Settings':
        return (
          <div style={{ padding: '24px' }}>Settings Page — coming soon!</div>
        );
      default:
        return <Dashboard />;
    }
  };

  return (
    <>
      <Sidebar active={active} onNavigate={setActive} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

      <div style={{ marginLeft: isCollapsed ? '80px' : '300px', display: 'flex', flexDirection: 'column', minHeight: '100vh', transition: 'margin-left 0.3s ease' }}>
        <Header active={active} isDark={isDark} onToggle={toggleTheme} />

        <div style={{ flex: 1, overflowY: 'auto' }}>{renderPage()}</div>
      </div>
    </>
  );
}
