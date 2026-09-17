(() => {
  'use strict';

  if (window.__peacelyPhase5Booted) return;
  window.__peacelyPhase5Booted = true;

  const API = '/api';
  const TAB = 'phase5-automation';
  let rendering = false;

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'
  }[c]));
  const money = v => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const date = v => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';

  async function api(path, options = {}) {
    const r = await fetch(API + path, {
      credentials: 'include',
      ...options,
      headers: { 'Content-Type':'application/json', ...(options.headers || {}) }
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  }

  function getParts() {
    const root = document.getElementById('peacely-phase4-root');
    if (!root) return null;
    const nav = root.querySelector('.p4-nav');
    const content = root.querySelector('.p4-content');
    if (!nav || !content) return null;
    return { root, nav, content };
  }

  function style() {
    if (document.getElementById('p5-style')) return;
    const s = document.createElement('style');
    s.id = 'p5-style';
    s.textContent = `
      .p5-tab{display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;border-radius:13px;margin-bottom:5px;cursor:pointer;color:#9aa5b6;font:inherit;font-size:12px;font-weight:700}
      .p5-tab:hover,.p5-tab.active{background:#111c2a;color:#fff}
      .p5-card{background:#0e1723;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;margin-bottom:10px}
      .p5-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .p5-value{font-size:22px;font-weight:850}.p5-label{color:#8e99aa;font-size:10px;margin-bottom:5px}
      .p5-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.p5-btn{border:0;border-radius:10px;padding:9px 12px;background:#10b981;color:#04130d;font-weight:800;cursor:pointer}.p5-btn.alt{background:#172131;color:#dce3ec}
      .p5-input,.p5-select{box-sizing:border-box;width:100%;margin-top:6px;padding:9px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#0e1723;color:#fff;font:inherit}
      .p5-note{padding:11px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);color:#9de8ca;margin-bottom:12px}.p5-error{padding:12px;border-radius:12px;background:#35151a;color:#fecaca;margin-bottom:12px}
      .p5-row{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}.p5-row:last-child{border-bottom:0}.p5-muted{color:#8e99aa;font-size:11px}.p5-badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#172131;color:#dce3ec;font-size:10px;font-weight:700}
      @media(min-width:701px){.p5-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function setTabActive(active) {
    const parts = getParts();
    if (!parts) return;
    parts.nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    if (active) active.classList.add('active');
  }

  async function renderAutomation() {
    const parts = getParts();
    if (!parts || rendering) return;
    rendering = true;
    const { content } = parts;
    content.innerHTML = '<h1>Automation & Communication</h1><div class="p5-note">Loading automation controls…</div>';

    try {
      const [settings, due, notifications] = await Promise.all([
        api('/automation/settings'), api('/automation/due'), api('/notifications')
      ]);
      const dueSoon = Array.isArray(due?.due) ? due.due : [];
      const overdue = Array.isArray(due?.overdue) ? due.overdue : [];
      const logs = Array.isArray(notifications) ? notifications : [];
      const allDue = [...dueSoon, ...overdue];

      content.innerHTML = `
        <h1>Automation & Communication</h1>
        <div class="p5-note">Phase 5 handles rent-due reminders, overdue follow-ups, notification history and recurring-invoice settings. Messages are queued for delivery and are not falsely marked as sent.</div>
        <div class="p5-grid">
          <div class="p5-card"><div class="p5-label">Due Soon</div><div class="p5-value">${dueSoon.length}</div></div>
          <div class="p5-card"><div class="p5-label">Overdue</div><div class="p5-value">${overdue.length}</div></div>
          <div class="p5-card"><div class="p5-label">Notification Log</div><div class="p5-value">${logs.length}</div></div>
          <div class="p5-card"><div class="p5-label">Reminders</div><div class="p5-value">${settings?.reminders_enabled ? 'ON' : 'OFF'}</div></div>
        </div>
        <div class="p5-card">
          <div class="p5-label">Automation Settings</div>
          <label class="p5-muted">Reminders Enabled<select id="p5-reminders" class="p5-select"><option value="true" ${settings?.reminders_enabled?'selected':''}>Yes</option><option value="false" ${!settings?.reminders_enabled?'selected':''}>No</option></select></label>
          <label class="p5-muted" style="display:block;margin-top:10px">Days Before Due<input id="p5-days" class="p5-input" type="number" min="0" max="30" value="${Number(settings?.reminder_days_before ?? 3)}"></label>
          <label class="p5-muted" style="display:block;margin-top:10px">Overdue Reminders<select id="p5-overdue" class="p5-select"><option value="true" ${settings?.overdue_reminders_enabled?'selected':''}>Yes</option><option value="false" ${!settings?.overdue_reminders_enabled?'selected':''}>No</option></select></label>
          <label class="p5-muted" style="display:block;margin-top:10px">Recurring Invoice Engine<select id="p5-recurring" class="p5-select"><option value="false" ${!settings?.recurring_invoices_enabled?'selected':''}>Off</option><option value="true" ${settings?.recurring_invoices_enabled?'selected':''}>On</option></select></label>
          <div class="p5-actions"><button class="p5-btn" id="p5-save">Save Settings</button><button class="p5-btn alt" id="p5-refresh">Refresh</button></div>
        </div>
        <div class="p5-card"><div class="p5-label">Due & Overdue Reminders</div>
          ${allDue.length ? allDue.map(item => `<div class="p5-row"><strong>${esc(item.name)}</strong> <span class="p5-badge">${esc(item.status || 'Pending')}</span><div class="p5-muted">${esc(item.invoice_number || '')} · ${money(item.amount)} · Due ${date(item.due_date)} · ${esc(item.property_name || '')}</div><button class="p5-btn alt p5-queue" data-tenant="${Number(item.tenant_id)}" data-invoice="${Number(item.invoice_id)}" data-phone="${esc(item.phone || '')}" style="margin-top:7px">Queue WhatsApp Reminder</button></div>`).join('') : '<div class="p5-muted">No due or overdue reminders currently match the automation settings.</div>'}
        </div>
        <div class="p5-card"><div class="p5-label">Notification History</div>
          ${logs.length ? logs.slice(0,20).map(item => `<div class="p5-row"><strong>${esc(item.tenant_name || item.recipient || 'Notification')}</strong> <span class="p5-badge">${esc(item.status || 'queued')}</span><div class="p5-muted">${esc(item.type || 'manual')} · ${esc(item.channel || '')} · ${esc(item.invoice_number || '')}</div><div style="margin-top:4px">${esc(item.message || '')}</div>${String(item.status).toLowerCase()==='queued'?`<button class="p5-btn alt p5-sent" data-id="${Number(item.id)}" style="margin-top:7px">Mark Sent</button>`:''}</div>`).join('') : '<div class="p5-muted">No notification history yet.</div>'}
        </div>`;

      document.getElementById('p5-save')?.addEventListener('click', async () => {
        try {
          await api('/automation/settings',{method:'PUT',body:JSON.stringify({
            reminders_enabled:document.getElementById('p5-reminders').value==='true',
            reminder_days_before:Number(document.getElementById('p5-days').value),
            overdue_reminders_enabled:document.getElementById('p5-overdue').value==='true',
            recurring_invoices_enabled:document.getElementById('p5-recurring').value==='true'
          })});
          await renderAutomation();
        } catch(e) { content.insertAdjacentHTML('afterbegin',`<div class="p5-error">${esc(e.message)}</div>`); }
      });
      document.getElementById('p5-refresh')?.addEventListener('click', renderAutomation);
      content.querySelectorAll('.p5-queue').forEach(button => button.addEventListener('click', async () => {
        try {
          button.disabled = true;
          await api('/notifications/queue',{method:'POST',body:JSON.stringify({tenant_id:Number(button.dataset.tenant),invoice_id:Number(button.dataset.invoice),channel:'whatsapp',type:'rent_reminder',recipient:button.dataset.phone||'',message:`Hello, this is a rent reminder from Peacely. Invoice ${button.dataset.invoice} is due/overdue. Please arrange payment. Thank you.`})});
          await renderAutomation();
        } catch(e) { button.disabled=false; content.insertAdjacentHTML('afterbegin',`<div class="p5-error">${esc(e.message)}</div>`); }
      }));
      content.querySelectorAll('.p5-sent').forEach(button => button.addEventListener('click', async () => {
        try { button.disabled=true; await api(`/notifications/${Number(button.dataset.id)}/mark-sent`,{method:'POST'}); await renderAutomation(); }
        catch(e) { button.disabled=false; content.insertAdjacentHTML('afterbegin',`<div class="p5-error">${esc(e.message)}</div>`); }
      }));
    } catch(e) {
      content.innerHTML = `<h1>Automation & Communication</h1><div class="p5-error">${esc(e.message)}</div><div class="p5-note">The Phase 5 Automation tab is loaded, but the automation backend returned an error. Existing Peacely data is unchanged.</div>`;
    } finally { rendering = false; }
  }

  function ensureTab() {
    style();
    const parts = getParts();
    if (!parts) return;
    let button = parts.nav.querySelector(`[data-p5="${TAB}"]`);
    if (button) return;
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'p5-tab';
    button.dataset.p5 = TAB;
    button.textContent = 'Automation';
    button.addEventListener('click', () => { setTabActive(button); renderAutomation(); });
    parts.nav.appendChild(button);
  }

  const observer = new MutationObserver(() => ensureTab());
  observer.observe(document.documentElement, { childList:true, subtree:true });
  [0,100,300,700,1500,3000,5000].forEach(ms => setTimeout(ensureTab, ms));
})();
