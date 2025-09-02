// public/theme.js — pre-paint apply
(function(){
  const KEY='ui-theme', root=document.documentElement;
  function apply(t){ root.setAttribute('data-theme', t); }
  try {
    const saved = localStorage.getItem(KEY);
    const pref = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    apply(saved || pref || 'dark');
    document.addEventListener('DOMContentLoaded', () => {
      const btn = document.getElementById('themeToggle');
      if (btn) btn.addEventListener('click', () => {
        const next = (root.getAttribute('data-theme') === 'light') ? 'dark' : 'light';
        apply(next); try{ localStorage.setItem(KEY, next); }catch{}
      });
    });
  } catch(e){ apply('dark'); }
})();
