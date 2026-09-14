(() => {
  'use strict';

  const removeAnalyticsUI = () => {
    const analyticsButtons = [
      ...document.querySelectorAll('button, a, [role="button"]'),
    ].filter((element) => {
      const text = String(element.textContent || '').trim();
      return /^analytics$/i.test(text);
    });

    for (const button of analyticsButtons) {
      if (button.classList.contains('active')) {
        const dashboardButton = [
          ...document.querySelectorAll('button, a, [role="button"]'),
        ].find((element) => /^dashboard$/i.test(String(element.textContent || '').trim()));

        if (dashboardButton && dashboardButton !== button) {
          dashboardButton.click();
        }
      }

      button.remove();
    }

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

  const observer = new MutationObserver(() => removeAnalyticsUI());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  window.setTimeout(removeAnalyticsUI, 100);
  window.setTimeout(removeAnalyticsUI, 500);
  window.setTimeout(removeAnalyticsUI, 1500);
  window.setInterval(removeAnalyticsUI, 2000);
})();
