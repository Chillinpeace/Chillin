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

  const isTenantsScreen = () => {
    const controls = [...document.querySelectorAll('button, a, [role="button"]')];
    return controls.some((element) => {
      const text = String(element.textContent || '').replace(/\s+/g, ' ').trim();
      return /^tenants$/i.test(text) && element.classList.contains('active');
    });
  };

  const findTenantsContainer = () => {
    const heading = [...document.querySelectorAll('h1, h2, h3')]
      .find((element) => /^tenants$/i.test(String(element.textContent || '').trim()));

    if (!heading) return null;
    return heading.closest('.view-container') || heading.parentElement?.parentElement || heading.parentElement;
  };

  const showMoveOutPicker = async () => {
    try {
      const response = await fetch('/api/tenants', { credentials: 'include' });
      const tenants = await response.json();

      if (!response.ok) {
        throw new Error(tenants?.error || 'Unable to load tenants.');
      }

      const activeTenants = (Array.isArray(tenants) ? tenants : [])
        .filter((tenant) => String(tenant.status || '').trim().toLowerCase() === 'active');

      if (!activeTenants.length) {
        window.alert('There are no active tenants to move out.');
        return;
      }

      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';

      const panel = document.createElement('div');
      panel.style.cssText = 'width:min(420px,100%);background:#fff;border-radius:18px;padding:20px;box-shadow:0 20px 60px rgba(0,0,0,.25);';

      const title = document.createElement('h2');
      title.textContent = 'Move Out Tenant';
      title.style.cssText = 'margin:0 0 6px;font-size:22px;';

      const subtitle = document.createElement('p');
      subtitle.textContent = 'Select the active tenant and move-out date.';
      subtitle.style.cssText = 'margin:0 0 16px;opacity:.7;';

      const select = document.createElement('select');
      select.style.cssText = 'width:100%;padding:12px;border:1px solid #ddd;border-radius:10px;margin-bottom:12px;font-size:16px;';
      activeTenants.forEach((tenant) => {
        const option = document.createElement('option');
        option.value = String(tenant.id);
        option.textContent = `${tenant.name}${tenant.room_number ? ` • Room ${tenant.room_number}` : ''}`;
        select.appendChild(option);
      });

      const date = document.createElement('input');
      date.type = 'date';
      date.value = new Date().toISOString().slice(0, 10);
      date.style.cssText = 'width:100%;box-sizing:border-box;padding:12px;border:1px solid #ddd;border-radius:10px;margin-bottom:16px;font-size:16px;';

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel';
      cancel.style.cssText = 'padding:11px 16px;border:1px solid #ddd;background:#fff;border-radius:10px;font-weight:600;';
      cancel.onclick = () => overlay.remove();

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.textContent = 'Move Out';
      confirm.style.cssText = 'padding:11px 16px;border:0;background:#111;color:#fff;border-radius:10px;font-weight:700;';

      confirm.onclick = async () => {
        const tenant = activeTenants.find((item) => String(item.id) === select.value);
        if (!tenant || !date.value) return;

        if (!window.confirm(`Move ${tenant.name} out on ${date.value}? This will release the assigned bed.`)) return;

        confirm.disabled = true;
        confirm.textContent = 'Moving out...';

        try {
          const result = await fetch(`/api/tenants/${encodeURIComponent(tenant.id)}/move-out`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ move_out_date: date.value }),
          });

          const data = await result.json().catch(() => null);
          if (!result.ok) {
            throw new Error(data?.error || 'Unable to move out tenant.');
          }

          overlay.remove();
          window.alert(`${tenant.name} has been moved out successfully.`);
          window.location.reload();
        } catch (error) {
          confirm.disabled = false;
          confirm.textContent = 'Move Out';
          window.alert(error instanceof Error ? error.message : 'Unable to move out tenant.');
        }
      };

      actions.append(cancel, confirm);
      panel.append(title, subtitle, select, date, actions);
      overlay.appendChild(panel);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) overlay.remove();
      });
      document.body.appendChild(overlay);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to load tenants.');
    }
  };

  const addMoveOutControl = () => {
    if (!isTenantsScreen()) return;
    if (document.getElementById('peacely-moveout-button')) return;

    const container = findTenantsContainer();
    if (!container) return;

    const button = document.createElement('button');
    button.id = 'peacely-moveout-button';
    button.type = 'button';
    button.textContent = 'Move Out Tenant';
    button.style.cssText = 'display:block;width:100%;margin:10px 0 16px;padding:12px 16px;border:0;border-radius:12px;background:#111;color:#fff;font-weight:700;font-size:15px;cursor:pointer;';
    button.addEventListener('click', showMoveOutPicker);

    const heading = [...container.querySelectorAll('h1, h2, h3')]
      .find((element) => /^tenants$/i.test(String(element.textContent || '').trim()));

    if (heading?.parentElement) {
      heading.parentElement.appendChild(button);
    } else {
      container.insertBefore(button, container.firstChild);
    }
  };

  const refreshUI = () => {
    removeHiddenUI();
    addMoveOutControl();
  };

  const observer = new MutationObserver(refreshUI);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class'],
  });

  window.setTimeout(refreshUI, 50);
  window.setTimeout(refreshUI, 150);
  window.setTimeout(refreshUI, 500);
  window.setTimeout(refreshUI, 1500);
  window.setInterval(refreshUI, 2000);
})();
