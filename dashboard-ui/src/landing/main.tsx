// Enhanced landing page entry point with modern UI theme management
import './landing.css';

// Advanced theme management for landing page with dashboard consistency
const setAttr = (name: string, val: string) => document.documentElement.setAttribute(name, val);
const getAttr = (name: string, fallback: string) => document.documentElement.getAttribute(name) || fallback;

// Initialize modern UI theme on load
const initTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  const savedDensity = localStorage.getItem('ui-density') || 'cozy';
  const savedBackground = localStorage.getItem('ui-bg') || 'on';
  
  setAttr('data-theme', savedTheme);
  setAttr('data-density', savedDensity);
  setAttr('data-bg', savedBackground);
  
  // Update body classes to match dashboard styling
  document.body.className = savedTheme === 'light' 
    ? 'min-h-screen text-slate-900 bg-white selection:bg-[#3b82f6]/20 selection:text-slate-900 transition-all duration-500 ease-in-out'
    : 'min-h-screen text-slate-100 bg-[#0b0f17] [background-image:radial-gradient(1200px_800px_at_10%_-10%,rgba(106,165,255,.28),transparent_60%),radial-gradient(1200px_800px_at_110%_10%,rgba(192,132,252,.28),transparent_60%)] selection:bg-[#6aa5ff]/30 selection:text-white transition-all duration-500 ease-in-out';
  
  document.body.setAttribute('data-theme', savedTheme);
};

// Enhanced mobile menu functionality with modern animations
const initMobileMenu = () => {
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const menuIcon = mobileMenuBtn?.querySelector('svg path');
  
  if (!mobileMenuBtn || !mobileMenu || !menuIcon) return;
  
  mobileMenuBtn.addEventListener('click', function() {
    const isHidden = mobileMenu.classList.contains('hidden');
    
    if (isHidden) {
      mobileMenu.classList.remove('hidden');
      mobileMenu.style.maxHeight = '0';
      mobileMenu.style.opacity = '0';
      
      // Animate open with modern easing
      requestAnimationFrame(() => {
        mobileMenu.style.transition = 'max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
        mobileMenu.style.maxHeight = mobileMenu.scrollHeight + 'px';
        mobileMenu.style.opacity = '1';
      });
      
      // Modern hamburger to X animation
      menuIcon.setAttribute('d', 'M6 18L18 6M6 6l12 12');
      mobileMenuBtn.style.transform = 'rotate(90deg)';
    } else {
      // Animate close with spring easing
      mobileMenu.style.transition = 'max-height 0.3s cubic-bezier(0.6, 0, 0.4, 1), opacity 0.3s cubic-bezier(0.6, 0, 0.4, 1)';
      mobileMenu.style.maxHeight = '0';
      mobileMenu.style.opacity = '0';
      
      setTimeout(() => {
        mobileMenu.classList.add('hidden');
        mobileMenu.style.transition = '';
      }, 300);
      
      // X to hamburger animation
      menuIcon.setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
      mobileMenuBtn.style.transform = '';
    }
  });
  
  // Auto-close on link clicks with smooth transition
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.style.transition = 'max-height 0.3s cubic-bezier(0.6, 0, 0.4, 1), opacity 0.3s cubic-bezier(0.6, 0, 0.4, 1)';
      mobileMenu.style.maxHeight = '0';
      mobileMenu.style.opacity = '0';
      
      setTimeout(() => {
        mobileMenu.classList.add('hidden');
        mobileMenu.style.transition = '';
      }, 300);
      
      menuIcon.setAttribute('d', 'M4 6h16M4 12h16M4 18h16');
      mobileMenuBtn.style.transform = '';
    });
  });
};

// Enhanced theme toggle with dashboard-consistent behavior
const initThemeToggle = () => {
  const themeToggle = document.getElementById('theme-toggle');
  const themeIcon = document.getElementById('theme-icon');
  
  if (!themeToggle || !themeIcon) return;
  
  const updateThemeIcon = (theme: string) => {
    if (theme === 'light') {
      // Sun icon for light mode
      themeIcon.setAttribute('d', 'M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z');
    } else {
      // Moon icon for dark mode
      themeIcon.setAttribute('d', 'M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z');
    }
  };
  
  // Set initial icon
  const currentTheme = getAttr('data-theme', 'dark');
  updateThemeIcon(currentTheme);
  
  themeToggle.addEventListener('click', function() {
    const current = getAttr('data-theme', 'dark');
    const next = current === 'light' ? 'dark' : 'light';
    
    // Modern spring animation
    themeToggle.style.transform = 'scale(0.9) rotate(180deg)';
    setTimeout(() => {
      themeToggle.style.transform = '';
    }, 300);
    
    setAttr('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
    
    // Update body styling to match dashboard
    document.body.className = next === 'light'
      ? 'min-h-screen text-slate-900 bg-white selection:bg-[#3b82f6]/20 selection:text-slate-900 transition-all duration-500 ease-in-out'
      : 'min-h-screen text-slate-100 bg-[#0b0f17] [background-image:radial-gradient(1200px_800px_at_10%_-10%,rgba(106,165,255,.28),transparent_60%),radial-gradient(1200px_800px_at_110%_10%,rgba(192,132,252,.28),transparent_60%)] selection:bg-[#6aa5ff]/30 selection:text-white transition-all duration-500 ease-in-out';
    
    document.body.setAttribute('data-theme', next);
  });
};

// Smooth scroll for navigation links
const initSmoothScroll = () => {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (this: HTMLAnchorElement, e: Event) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href')!);
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    });
  });
};

// Initialize all modern features
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initMobileMenu();
  initThemeToggle();
  initSmoothScroll();
});
