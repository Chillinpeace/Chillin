(() => {
  'use strict';

  const removeHiddenUI = () => {
    const controls = [
      ...document.querySelectorAll('button, a, [role="button"]'),
    ];

    const analyticsControls = controls.filter((element) => {
      const text = String(element.textContent || '').trim();
      return /analytics$/i.test(text) || element.dataset?.tab === 'analytics';
    });

    for (const control of analyticsControls) {
      if (control.classList.contains('active')) {
        const dashboardControl = document.querySelector('[data-tab="dashboard"]') ||
          [...document.querySelectorAll('button, a, [role="button"]')]
            .find((element) => /^(?:🏠\s*)?home$/i.test(String(element.textContent || '').trim()));

        if (dashboardControl && dashboardControl !== control) {
          dashboardControl.click();
        }
      }

      control.remove();
    }

    const paymentControls = [
      ...document.querySelectorAll('button, a, [role="button"]'),
    ].filter((element) => {
      const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      return /^\+\s*payment$/i.test(text);
    });

    paymentControls.forEach((element) => element.remove());

    document
      .querySelectorAll('.peacely-ops-tab[data-tab="analytics"]')
      .forEach((element) => element.remove());

    document
      .querySelectorAll('.peacely-analytics-section, .peacely-analytics-grid, .peacely-analytics-note')
      .forEach((element) => element.remove());

    document.querySelectorAll('.view-container').forEach((container) => {
      const heading = [...container.querySelectorAll('h1, h2, h3')]
        .find((element) => /^analytics$/i.test(String(element.textContent || '').trim()));

      if (heading) {
        container.remove();
      }
    });
  };

  const observer = new MutationObserver(removeHiddenUI);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  window.setTimeout(removeHiddenUI, 50);
  window.setTimeout(removeHiddenUI, 150);
  window.setTimeout(removeHiddenUI, 500);
  window.setTimeout(removeHiddenUI, 1500);
  window.setInterval(removeHiddenUI, 2000);
})();
