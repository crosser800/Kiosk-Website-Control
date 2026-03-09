import { useState } from 'react';
import './App.css';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Header from './components/Header';

export default function App() {
  const [active, setActive] = useState('Dashboard');
  const [isDark, setIsDark] = useState(false);

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
    <div style={{ display: 'flex' }}>
      <Sidebar active={active} onNavigate={setActive} />

      {/* Right side */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Header active={active} isDark={isDark} onToggle={toggleTheme} />

        {/* Page content */}
        <div style={{ flex: 1 }}>{renderPage()}</div>
      </div>
    </div>
  );
}
