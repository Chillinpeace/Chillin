(() => {
  'use strict';

  let loading = false;

  function boot() {
    const root = document.getElementById('peacely-phase4-root');
    if (!root || !root.querySelector('.p4-nav')) return;
    if (root.querySelector('.p59-tab')) return;
    if (loading) return;

    loading = true;
    const script = document.createElement('script');
    script.src = '/peacely-phase5-9.js?v=' + Date.now();
    script.async = false;
    script.onload = () => {
      loading = false;
      window.setTimeout(() => {
        if (!root.querySelector('.p59-tab')) boot();
      }, 100);
    };
    script.onerror = () => {
      loading = false;
      window.setTimeout(boot, 500);
    };
    document.head.appendChild(script);
  }

  const observer = new MutationObserver(boot);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('load', boot);
  [100,300,700,1500,3000,5000,8000].forEach(ms => window.setTimeout(boot, ms));
})();
