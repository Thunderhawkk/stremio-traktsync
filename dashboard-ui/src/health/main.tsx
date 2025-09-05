import React from 'react';
import { createRoot } from 'react-dom/client';
import HealthMonitoringPage from '../pages/HealthMonitoring';
import '../index.css';

// Import global styles to ensure consistent theming
function HealthApp() {
  // Apply theme from localStorage on mount
  React.useEffect(() => {
    const theme = localStorage.getItem('ui-theme') || 'dark';
    const density = localStorage.getItem('ui-density') || 'cozy';
    const bg = localStorage.getItem('ui-bg') || 'off';
    
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-density', density);
    document.documentElement.setAttribute('data-bg', bg);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface-0 to-surface-1">
      <HealthMonitoringPage />
    </div>
  );
}

const container = document.getElementById('health-root');
if (container) {
  const root = createRoot(container);
  root.render(<HealthApp />);
}