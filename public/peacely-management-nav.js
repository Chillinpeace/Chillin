(() => {
  'use strict';

  let moved = false;

  function moveManagementToBottomNav() {
    const management = document.querySelector('[data-peacely-phase4="1"]');
    const bottomNav = document.querySelector('.bottom-nav');
    if (!management || !bottomNav) return;

    // If it is already in the bottom navigation, keep it there.
    if (management.parentElement === bottomNav) {
      moved = true;
      return;
    }

    // Move the real Phase 4 button so its existing click handler is preserved.
    management.className = 'nav-item';
    management.removeAttribute('style');
    management.innerHTML = '<span class="nav-icon">📊</span><span class="nav-label">Management</span>';
    bottomNav.appendChild(management);
    moved = true;
  }

  function hideQuickActionFallback() {
    document.querySelectorAll('.quick-actions .quick-action').forEach((el) => {
      if (el.getAttribute('data-peacely-phase4') === '1') {
        el.style.display = 'none';
      }
    });
  }

  function boot() {
    moveManagementToBottomNav();
    hideQuickActionFallback();

    const observer = new MutationObserver(() => {
      if (!moved) moveManagementToBottomNav();
      hideQuickActionFallback();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    [250, 700, 1500, 3000].forEach((ms) => setTimeout(() => {
      moveManagementToBottomNav();
      hideQuickActionFallback();
    }, ms));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
