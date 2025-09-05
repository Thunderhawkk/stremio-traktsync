import React from "react";
import { Button } from "../components/ui/button";
import { WebSocketStatus } from "../components/WebSocketStatus";

const setAttr = (name:string, val:string) => document.documentElement.setAttribute(name, val);
const getAttr = (name:string, fallback:string) => document.documentElement.getAttribute(name) || fallback;

export default function TopBar(){
  const onCompact = () => {
    const cur = getAttr("data-density", "cozy");
    const next = cur === "compact" ? "cozy" : "compact";
    setAttr("data-density", next); localStorage.setItem("ui-density", next);
  };
  const onBackground = () => {
    const cur = getAttr("data-bg", "off");
    const next = cur === "on" ? "off" : "on";
    setAttr("data-bg", next); localStorage.setItem("ui-bg", next);
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
    const d = localStorage.getItem("ui-density"); if (d) setAttr("data-density", d);
    const b = localStorage.getItem("ui-bg"); if (b) setAttr("data-bg", b);
  }, []);
  
  return (
    <div className="sticky top-0 z-50 border-b border-white/10 bg-[var(--color-surface-0)]/80 backdrop-blur-xl transition-all duration-300 supports-[backdrop-filter]:bg-[var(--color-surface-0)]/60">
      <div className="flex items-center justify-between px-6 py-4">
        {/* Enhanced Left section */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-[var(--color-primary)] to-accent shadow-glow animate-float relative overflow-hidden hover:shadow-[0_15px_40px_rgba(106,165,255,.4)] transition-all duration-300 group">
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
          
          {/* Density Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onCompact}
            className="h-9 px-3 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
          >
            <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
            </svg>
            <span className="text-xs hidden sm:inline">Density</span>
          </Button>
          
          {/* Background Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onBackground}
            className="h-9 px-3 rounded-lg hover:bg-white/10 focus:ring-2 focus:ring-[var(--color-primary)]/50 transition-all duration-300 group"
          >
            <svg className="h-4 w-4 mr-1 transition-transform duration-200 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"></path>
            </svg>
            <span className="text-xs hidden sm:inline">Effects</span>
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
