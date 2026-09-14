(() => {
  'use strict';

  const STYLE_ID = 'peacely-lifecycle-style';
  const PANEL_ID = 'peacely-lifecycle-panel';

  const today = () => new Date().toISOString().slice(0, 10);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const addStyles = () => {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} { margin: 0 0 18px; padding: 16px; border: 1px solid rgba(16,185,129,.28); border-radius: 18px; background: rgba(6,30,27,.72); box-shadow: 0 12px 32px rgba(0,0,0,.16); }
      #${PANEL_ID} h3 { margin: 0 0 5px; font-size: 17px; }
      #${PANEL_ID} p { margin: 0 0 12px; font-size: 12px; opacity: .72; }
      #${PANEL_ID} .pl-grid { display: grid; grid-template-columns: minmax(0,1fr) 150px auto; gap: 9px; align-items: end; }
      #${PANEL_ID} label { display:block; font-size:11px; opacity:.7; margin-bottom:5px; }
      #${PANEL_ID} select, #${PANEL_ID} input { width:100%; box-sizing:border-box; padding:10px 11px; border-radius:10px; border:1px solid rgba(148,163,184,.28); background:#0b1118; color:inherit; }
      #${PANEL_ID} button { padding:10px 14px; border:0; border-radius:10px; background:#dc2626; color:white; font-weight:800; cursor:pointer; white-space:nowrap; }
      #${PANEL_ID} button:disabled { opacity:.55; cursor:not-allowed; }
      #${PANEL_ID} .pl-msg { margin-top:10px; font-size:12px; }
      @media (max-width: 620px) { #${PANEL_ID} .pl-grid { grid-template-columns:1fr; } #${PANEL_ID} button { width:100%; } }
    `;
    document.head.appendChild(style);
  };

  const getTenants = async () => {
    const response = await fetch('/api/tenants', { credentials: 'include' });
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data?.error || `Unable to load tenants (${response.status})`);
    return Array.isArray(data) ? data : [];
  };

  const isTenantsTabActive = () => {
    const controls = [...document.querySelectorAll('button, a, [role="button"]')];
    return controls.some((el) => el.classList.contains('active') && /^tenants$/i.test(String(el.textContent || '').trim()));
  };

  const findTenantsView = () => {
    const headings = [...document.querySelectorAll('h1, h2, h3')];
    const heading = headings.find((el) => /^tenants$/i.test(String(el.textContent || '').trim()));
    return heading?.closest('.view-container') || null;
  };

  const render = async () => {
    const view = findTenantsView();
    if (!view || !isTenantsTabActive()) {
      document.getElementById(PANEL_ID)?.remove();
      return;
    }

    addStyles();
    let panel = document.getElementById(PANEL_ID);
    if (!panel) {
      panel = document.createElement('section');
      panel.id = PANEL_ID;
      const header = view.querySelector('h1, h2, h3')?.closest('div');
      view.insertBefore(panel, view.firstElementChild || null);
      panel.innerHTML = `
        <h3>Tenant Lifecycle</h3>
        <p>Move an active tenant out and release their assigned bed.</p>
        <div class="pl-grid">
          <div><label for="pl-tenant">Active tenant</label><select id="pl-tenant"><option value="">Loading tenants…</option></select></div>
          <div><label for="pl-date">Move-out date</label><input id="pl-date" type="date" value="${today()}"></div>
          <button id="pl-moveout" type="button">Move out</button>
        </div>
        <div class="pl-msg" id="pl-msg"></div>`;

      const select = panel.querySelector('#pl-tenant');
      const tenants = await getTenants();
      const active = tenants.filter((t) => String(t.status || '').trim().toLowerCase() === 'active');
      select.innerHTML = active.length
        ? active.map((t) => `<option value="${Number(t.id)}">${escapeHtml(t.name)}${t.property_name ? ` — ${escapeHtml(t.property_name)}` : ''}${t.room_number ? ` · Room ${escapeHtml(t.room_number)}` : ''}${t.bed_number ? ` · Bed ${escapeHtml(t.bed_number)}` : ''}</option>`).join('')
        : '<option value="">No active tenants</option>';

      panel.querySelector('#pl-moveout').addEventListener('click', async () => {
        const tenantId = Number(select.value);
        const date = panel.querySelector('#pl-date').value || today();
        const tenant = active.find((t) => Number(t.id) === tenantId);
        const msg = panel.querySelector('#pl-msg');
        if (!tenantId || !tenant) { msg.textContent = 'Select an active tenant first.'; return; }
        if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(date)) { msg.textContent = 'Choose a valid move-out date.'; return; }
        if (!window.confirm(`Move ${tenant.name} out on ${date}? This will release the assigned bed.`)) return;
        const button = panel.querySelector('#pl-moveout');
        button.disabled = true;
        msg.textContent = 'Moving tenant out…';
        try {
          const response = await fetch(`/api/tenants/${tenantId}/move-out`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ move_out_date: date }),
          });
          const data = await response.json().catch(() => null);
          if (!response.ok) throw new Error(data?.error || 'Move-out failed.');
          msg.textContent = 'Move-out completed. Refreshing Peacely…';
          window.setTimeout(() => window.location.reload(), 500);
        } catch (error) {
          msg.textContent = error instanceof Error ? error.message : 'Move-out failed.';
          button.disabled = false;
        }
      });
    }
  };

  const observer = new MutationObserver(() => {
    window.clearTimeout(window.__peacelyLifecycleTimer);
    window.__peacelyLifecycleTimer = window.setTimeout(() => render().catch(() => {}), 80);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.setTimeout(() => render().catch(() => {}), 300);
})();