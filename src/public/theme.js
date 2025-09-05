// Enhanced theme.js with smooth transitions and system preference detection
(function() {
  const THEME_KEY = 'ui-theme';
  const PREFERENCE_KEY = 'theme-preference';
  const root = document.documentElement;
  
  // Theme configurations
  const themes = {
    light: {
      name: 'light',
      icon: '🌙',
      label: 'Dark mode'
    },
    dark: {
      name: 'dark', 
      icon: '☀️',
      label: 'Light mode'
    },
    auto: {
      name: 'auto',
      icon: '🔄',
      label: 'Auto mode'
    }
  };
  
  let currentTheme = 'dark';
  let systemPreference = 'dark';
  let userPreference = null;
  
  // Detect system preference
  function getSystemPreference() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  }
  
  // Apply theme with smooth transition
  function applyTheme(theme, withTransition = false) {
    if (withTransition) {
      root.style.transition = 'background-color 0.3s ease, color 0.3s ease';
      setTimeout(() => {
        root.style.transition = '';
      }, 300);
    }
    
    root.setAttribute('data-theme', theme);
    currentTheme = theme;
    
    // Update meta theme-color for mobile browsers
    const themeColor = theme === 'dark' ? '#0b0f17' : '#f8fafc';
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', themeColor);
    
    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('themeChanged', {
      detail: { theme, systemPreference, userPreference }
    }));
  }
  
  // Get effective theme (resolves 'auto' to actual theme)
  function getEffectiveTheme(preference) {
    if (preference === 'auto') {
      return systemPreference;
    }
    return preference || systemPreference;
  }
  
  // Save preference
  function savePreference(preference) {
    try {
      localStorage.setItem(PREFERENCE_KEY, preference);
      if (preference !== 'auto') {
        localStorage.setItem(THEME_KEY, preference);
      }
    } catch (e) {
      console.warn('Could not save theme preference:', e);
    }
  }
  
  // Load saved preference
  function loadPreference() {
    try {
      return localStorage.getItem(PREFERENCE_KEY) || localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }
  
  // Update theme button
  function updateThemeButton(btn) {
    if (!btn) return;
    
    const preference = userPreference || 'auto';
    const config = themes[preference] || themes.auto;
    
    // Update button content
    const iconElement = btn.querySelector('svg') || btn.querySelector('.theme-icon');
    const textElement = btn.querySelector('span') || btn;
    
    if (iconElement && textElement !== btn) {
      textElement.textContent = config.label;
    } else {
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          ${currentTheme === 'dark' 
            ? '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
            : '<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="1" x2="12" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="21" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="1" y1="12" x2="3" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="21" y1="12" x2="23" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'}
        </svg>
        <span>${config.label}</span>
      `;
    }
    
    btn.setAttribute('aria-label', `Switch to ${config.label.toLowerCase()}`);
    btn.setAttribute('title', `Currently: ${currentTheme}. Click for ${config.label.toLowerCase()}`);
  }
  
  // Cycle through themes: dark -> light -> auto -> dark
  function cycleTheme() {
    const currentPref = userPreference || 'auto';
    let nextPref;
    
    switch (currentPref) {
      case 'dark':
        nextPref = 'light';
        break;
      case 'light':
        nextPref = 'auto';
        break;
      case 'auto':
      default:
        nextPref = 'dark';
        break;
    }
    
    userPreference = nextPref;
    const effectiveTheme = getEffectiveTheme(nextPref);
    
    applyTheme(effectiveTheme, true);
    savePreference(nextPref);
    
    // Update all theme buttons
    document.querySelectorAll('#themeToggle, .theme-toggle').forEach(updateThemeButton);
    
    // Show toast notification
    showThemeNotification(nextPref, effectiveTheme);
  }
  
  // Show theme change notification
  function showThemeNotification(preference, theme) {
    const toast = document.createElement('div');
    toast.className = 'theme-toast';
    toast.innerHTML = `
      <div class="theme-toast-content">
        <span class="theme-toast-icon">${themes[preference]?.icon || '🎨'}</span>
        <span class="theme-toast-text">
          ${preference === 'auto' 
            ? `Auto mode (${theme === 'dark' ? 'Dark' : 'Light'})` 
            : `${theme === 'dark' ? 'Dark' : 'Light'} mode`}
        </span>
      </div>
    `;
    
    // Add toast styles
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 12px 16px;
      box-shadow: var(--shadow-lg);
      z-index: 1000;
      transform: translateX(100%);
      transition: transform 0.3s ease;
      color: var(--text);
      font-size: 14px;
      max-width: 250px;
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });
    
    // Remove after delay
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 2000);
  }
  
  // Listen for system preference changes
  function watchSystemPreference() {
    if (window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      
      const handleChange = (e) => {
        systemPreference = e.matches ? 'dark' : 'light';
        
        // Only update if user is on auto mode
        if (!userPreference || userPreference === 'auto') {
          applyTheme(systemPreference, true);
          document.querySelectorAll('#themeToggle, .theme-toggle').forEach(updateThemeButton);
        }
      };
      
      // Modern browsers
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else if (mediaQuery.addListener) {
        // Safari < 14
        mediaQuery.addListener(handleChange);
      }
    }
  }
  
  // Initialize theme system
  function initTheme() {
    systemPreference = getSystemPreference();
    userPreference = loadPreference();
    
    const effectiveTheme = getEffectiveTheme(userPreference);
    applyTheme(effectiveTheme);
    
    watchSystemPreference();
  }
  
  // Initialize immediately to prevent flash
  try {
    initTheme();
  } catch (e) {
    console.warn('Theme initialization error:', e);
    applyTheme('dark');
  }
  
  // Setup when DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    // Setup all theme toggle buttons
    document.querySelectorAll('#themeToggle, .theme-toggle').forEach(btn => {
      updateThemeButton(btn);
      btn.addEventListener('click', cycleTheme);
    });
    
    // Expose theme API globally
    window.theme = {
      current: () => currentTheme,
      preference: () => userPreference,
      system: () => systemPreference,
      set: (theme) => {
        if (themes[theme]) {
          userPreference = theme;
          const effectiveTheme = getEffectiveTheme(theme);
          applyTheme(effectiveTheme, true);
          savePreference(theme);
          document.querySelectorAll('#themeToggle, .theme-toggle').forEach(updateThemeButton);
        }
      },
      toggle: cycleTheme
    };
  });
  
})();
