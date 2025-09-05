import React from "react";
import { Button } from "../components/ui/button";
import { WebSocketStatus } from "../components/WebSocketStatus";

const setAttr = (name:string, val:string) => document.documentElement.setAttribute(name, val);
const getAttr = (name:string, fallback:string) => document.documentElement.getAttribute(name) || fallback;

export default function TopBar(){
  const [userRole, setUserRole] = React.useState<string | null>(null);
  
  React.useEffect(() => {
    // Fetch user data to check role
    fetch('/api/auth/me', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.ok && data.user) {
          setUserRole(data.user.role);
        }
      })
      .catch(() => {});
  }, []);
  
  const onAnalytics = () => {
    window.open('/analytics', '_blank');
  };
  
  const onHealth = () => {
    window.open('/health', '_blank');
  };
  
  const onAuditLogs = () => {
    window.open('/audit', '_blank');
  };
  
  const onLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout failed:', error);
      window.location.href = '/login';
    }
  };
  
  const onLogoClick = () => {
    window.location.href = '/';
  };
  
  const onTheme = () => {
    const cur = getAttr("data-theme", "dark");
    const next = cur === "light" ? "dark" : "light";
    setAttr("data-theme", next); localStorage.setItem("ui-theme", next);
    
    // Add visual feedback for theme change with enhanced animation
    const button = document.querySelector('[data-theme-toggle]') as HTMLElement;
    if (button) {
      button.style.transform = 'scale(0.95) rotate(180deg)';
      setTimeout(() => {
        button.style.transform = '';
      }, 200);
    }
  };
  
  React.useEffect(()=>{
    const t = localStorage.getItem("ui-theme"); if (t) setAttr("data-theme", t);
  }, []);
  
  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[var(--color-surface-0)]/80 backdrop-blur-xl transition-all duration-300 supports-[backdrop-filter]:bg-[var(--color-surface-0)]/60">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Enhanced Left section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div 
              onClick={onLogoClick}
              className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-accent shadow-glow animate-float relative overflow-hidden hover:shadow-[0_15px_40px_rgba(106,165,255,.4)] transition-all duration-300 group cursor-pointer"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <h1 className="text-lg font-semibold gradient-text">TraktSync Dashboard</h1>
          </div>
        </div>
        
        {/* Enhanced Center section - WebSocket Status */}
        <div className="hidden md:flex items-center">
          <WebSocketStatus />
        </div>
        
        {/* Enhanced Right section */}
        <div className="flex items-center gap-2">
          {/* Analytics Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onAnalytics}
            className="h-9 px-3 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
          >
            <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
            <span className="text-xs hidden sm:inline">Analytics</span>
          </Button>
          
          {/* Health Monitoring Button (Admin only) */}
          {userRole === 'admin' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onHealth}
              className="h-9 px-3 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
            >
              <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>
              </svg>
              <span className="text-xs hidden sm:inline">Health</span>
            </Button>
          )}
          
          {/* Audit Logs Button (Admin only) */}
          {userRole === 'admin' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAuditLogs}
              className="h-9 px-3 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
            >
              <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span className="text-xs hidden sm:inline">Audit</span>
            </Button>
          )}
          
          {/* Theme Toggle with enhanced icon */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onTheme}
            data-theme-toggle
            className="relative h-9 w-9 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
          >
            <svg className="h-4 w-4 transition-all duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path className="dark:hidden" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>
              <path className="hidden dark:block" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>
            </svg>
          </Button>
          
          {/* Logout Button - moved to the end */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="h-9 px-3 rounded-lg hover:bg-red-500/10 hover:text-red-400 focus:ring-2 focus:ring-red-500/50 transition-all duration-300 group"
          >
            <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
            </svg>
            <span className="text-xs hidden sm:inline">Logout</span>
          </Button>
        </div>
      </div>
      
      {/* Mobile WebSocket Status */}
      <div className="md:hidden px-6 pb-3 border-t border-white/5">
        <WebSocketStatus />
      </div>
    </div>
  );
}
