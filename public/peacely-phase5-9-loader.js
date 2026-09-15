(() => {
  'use strict';

  let loaded = false;

  function boot() {
    if (loaded) return;
    const root = document.getElementById('peacely-phase4-root');
    if (!root || !root.querySelector('.p4-nav')) return;
    if (root.querySelector('.p59-tab')) {
      loaded = true;
      return;
    }

    loaded = true;
    const script = document.createElement('script');
    script.src = '/peacely-phase5-9.js?boot=' + Date.now();
    script.async = false;
    document.head.appendChild(script);
  }

  const observer = new MutationObserver(boot);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.setTimeout(boot, 100);
  window.setTimeout(boot, 500);
  window.setTimeout(boot, 1500);
  window.setTimeout(boot, 3000);
})();
