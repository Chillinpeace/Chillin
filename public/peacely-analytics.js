(() => {
  'use strict';

  const textOf = (element) => String(element?.textContent || '').replace(/\s+/g, ' ').trim();
  const controls = () => [...document.querySelectorAll('button, a, [role="button"]')];

  const removeAnalytics = () => {
    controls().filter((element) => /analytics$/i.test(textOf(element)) || element.dataset?.tab === 'analytics')
      .forEach((element) => element.remove());

    document.querySelectorAll('.peacely-ops-tab[data-tab="analytics"], .peacely-analytics-section, .peacely-analytics-grid, .peacely-analytics-note')
      .forEach((element) => element.remove());

    document.querySelectorAll('.view-container').forEach((container) => {
      const heading = [...container.querySelectorAll('h1, h2, h3')].find((element) => /^analytics$/i.test(textOf(element)));
      if (heading) container.remove();
    });
  };

  const isPaymentsContainer = (element) => {
    const container = element?.closest?.('.view-container');
    if (!container) return false;
    return [...container.querySelectorAll('h1, h2, h3')].some((heading) => /^payments$/i.test(textOf(heading)));
  };

  const keepPaymentActionOnlyInPayments = () => {
    controls().filter((element) => /^\+\s*payment$/i.test(textOf(element))).forEach((element) => {
      if (!isPaymentsContainer(element)) element.remove();
    });
  };

  const findTenantsContainer = () => {
    const heading = [...document.querySelectorAll('h1, h2, h3')].find((element) => /^tenants$/i.test(textOf(element)));
    return heading?.closest('.view-container') || null;
  };

  const tenantCardByName = (name) => {
    const container = findTenantsContainer();
    if (!container) return null;
    return [...container.querySelectorAll('.tenant-card')].find((card) => {
      const heading = card.querySelector('h3');
      return textOf(heading) === String(name || '').trim();
    }) || null;
  };

  const cleanTenantCards = async () => {
    const container = findTenantsContainer();
    if (!container) return;

    // Tenant screen is the tenant database only. Payment/reminder actions belong in Payments.
    container.querySelectorAll('.tenant-card').forEach((card) => {
      const actionButtons = [...card.querySelectorAll('button')];
      actionButtons.forEach((button) => {
        const label = textOf(button);
        if (/^(pay|whatsapp)$/i.test(label)) button.remove();
      });

      const finance = card.querySelector('.tenant-finance');
      if (finance) {
        const values = [...finance.querySelectorAll('div')];
        values.forEach((item) => {
          const label = textOf(item.querySelector('span'));
          if (/^(paid|pending)$/i.test(label)) item.remove();
        });
      }
    });

    if (container.dataset.tenantDatabaseLoaded === '1') return;
    container.dataset.tenantDatabaseLoaded = 'loading';

    try {
      const response = await fetch('/api/tenants', { credentials: 'include' });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load tenant database.');

      const tenants = Array.isArray(payload) ? payload : [];
      tenants.forEach((tenant) => {
        const card = tenantCardByName(tenant.name);
        if (!card || card.querySelector('.peacely-tenant-database')) return;

        const database = document.createElement('div');
        database.className = 'peacely-tenant-database';
        database.style.cssText = 'display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:12px 0;padding:12px;border:1px solid rgba(0,0,0,.08);border-radius:12px;';

        const fields = [
          ['Monthly Rent', `₹${Number(tenant.monthly_rent || 0).toLocaleString('en-IN')}`],
          ['Deposit', `₹${Number(tenant.deposit_amount || 0).toLocaleString('en-IN')}`],
          ['Due Date', tenant.due_date ? String(tenant.due_date) : '-'],
          ['Move In', tenant.move_in_date ? new Date(tenant.move_in_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'],
          ['Property', tenant.property_name || '-'],
          ['Room / Bed', `${tenant.room_number || '-'} / ${tenant.bed_number || '-'}`],
        ];

        fields.forEach(([label, value]) => {
          const field = document.createElement('div');
          field.innerHTML = `<span style="display:block;font-size:12px;opacity:.65;margin-bottom:3px">${label}</span><strong style="font-size:14px">${value}</strong>`;
          database.appendChild(field);
        });

        const finance = card.querySelector('.tenant-finance');
        if (finance) finance.replaceWith(database);
        else card.appendChild(database);
      });

      container.dataset.tenantDatabaseLoaded = '1';
    } catch {
      container.dataset.tenantDatabaseLoaded = '0';
    }
  };

  const showMoveOutPicker = async () => {
    try {
      const response = await fetch('/api/tenants', { credentials: 'include' });
      const payload = await response.json().catch(() => []);
      if (!response.ok) throw new Error(payload?.error || 'Unable to load tenants.');

      const activeTenants = (Array.isArray(payload) ? payload : [])
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
          if (!result.ok) throw new Error(data?.error || 'Unable to move out tenant.');
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
    const container = findTenantsContainer();
    if (!container || document.getElementById('peacely-moveout-button')) return;

    const button = document.createElement('button');
    button.id = 'peacely-moveout-button';
    button.type = 'button';
    button.textContent = 'Move Out Tenant';
    button.style.cssText = 'display:block;width:100%;margin:10px 0 16px;padding:12px 16px;border:0;border-radius:12px;background:#111;color:#fff;font-weight:700;font-size:15px;cursor:pointer;';
    button.addEventListener('click', showMoveOutPicker);

    const heading = [...container.querySelectorAll('h1, h2, h3')].find((element) => /^tenants$/i.test(textOf(element)));
    if (heading?.parentElement) heading.parentElement.appendChild(button);
    else container.insertBefore(button, container.firstChild);
  };

  const addPaymentActions = () => {
    const container = [...document.querySelectorAll('.view-container')].find((candidate) =>
      [...candidate.querySelectorAll('h1, h2, h3')].some((heading) => /^payments$/i.test(textOf(heading)))
    );
    if (!container) return;

    [...container.querySelectorAll('.glass-card')].forEach((card) => {
      if (card.querySelector('.peacely-payment-actions')) return;

      const invoiceText = [...card.querySelectorAll('*')].find((element) => textOf(element).startsWith('INV-'));
      const invoiceNumber = invoiceText ? textOf(invoiceText) : '';
      const buttons = document.createElement('div');
      buttons.className = 'peacely-payment-actions';
      buttons.style.cssText = 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;';

      const pay = document.createElement('button');
      pay.type = 'button';
      pay.textContent = 'Pay';
      pay.style.cssText = 'padding:9px 14px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:700;';
      pay.onclick = () => {
        const headerPay = [...container.querySelectorAll('button')].find((button) => /^\+\s*payment$/i.test(textOf(button)));
        if (headerPay) headerPay.click();
      };
      buttons.appendChild(pay);

      if (invoiceNumber) {
        const wa = document.createElement('button');
        wa.type = 'button';
        wa.textContent = 'WhatsApp Invoice';
        wa.style.cssText = 'padding:9px 14px;border:1px solid #ddd;border-radius:10px;background:#fff;font-weight:700;';
        wa.onclick = () => {
          window.open(`https://wa.me/?text=${encodeURIComponent(`Invoice ${invoiceNumber} from Peacely`)}`, '_blank');
        };
        buttons.appendChild(wa);
      }

      card.appendChild(buttons);
    });
  };

  const refreshUI = () => {
    removeAnalytics();
    keepPaymentActionOnlyInPayments();
    cleanTenantCards();
    addMoveOutControl();
    addPaymentActions();
  };

  const observer = new MutationObserver(refreshUI);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  window.setTimeout(refreshUI, 50);
  window.setTimeout(refreshUI, 150);
  window.setTimeout(refreshUI, 500);
  window.setTimeout(refreshUI, 1500);
  window.setInterval(refreshUI, 2000);
})();
