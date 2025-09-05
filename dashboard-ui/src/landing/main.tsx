// Enhanced landing page entry point with theme management
import './landing.css';

// Theme management for landing page
const setAttr = (name: string, val: string) => document.documentElement.setAttribute(name, val);
const getAttr = (name: string, fallback: string) => document.documentElement.getAttribute(name) || fallback;

// Initialize theme from localStorage on page load
const initTheme = () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  setAttr('data-theme', savedTheme);
  
  // Update body classes based on theme
  const body = document.body;
  if (savedTheme === 'light') {
    body.classList.add('theme-light');
    body.classList.remove('theme-dark');
  } else {
    body.classList.add('theme-dark');
    body.classList.remove('theme-light');
  }
};

// Initialize theme when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initTheme);
} else {
  initTheme();
}

// Optional: AOS animations (if needed)
// import AOS from 'aos';
// import 'aos/dist/aos.css';
// AOS.init({ duration: 700, once: true, offset: 60 });
