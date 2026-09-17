(() => {
  'use strict';

  const TABS = [
    ['automation', 'Automation'],
    ['finance-ai', 'Financial Intelligence'],
    ['operations', 'Operations'],
    ['team-security', 'Team & Security'],
    ['system', 'System Health']
  ];

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, (c) => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;'
  }[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const api = async (path, options = {}) => {
    const r = await fetch(`/api${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  };

  let active = 'automation';

  function root() {
    return document.getElementById('peacely-phase4-root');
  }

  function installStyle() {
    if (document.getElementById('p59-visibility-style')) return;
    const s = document.createElement('style');
    s.id = 'p59-visibility-style';
    s.textContent = `
      .p59v-tab{display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;border-radius:13px;margin-bottom:5px;cursor:pointer;color:#9aa5b6;font:inherit;font-size:12px;font-weight:700}
      .p59v-tab.active,.p59v-tab:hover{background:#111c2a;color:#fff}
      .p59v-card{background:#0e1723;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;margin-bottom:10px}
      .p59v-actions{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}
      .p59v-btn{border:0;border-radius:10px;padding:9px 12px;background:#10b981;color:#04130d;font-weight:800;cursor:pointer}
      .p59v-btn.alt{background:#172131;color:#dce3ec}
      .p59v-note{padding:11px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.15);color:#9de8ca;margin-bottom:12px}
      .p59v-error{padding:12px;border-radius:12px;background:#35151a;color:#fecaca;margin-bottom:12px}
      .p59v-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .p59v-big{font-size:22px;font-weight:850}
      .p59v-muted{color:#8e99aa;font-size:10px;margin-bottom:5px}
      @media(min-width:701px){.p59v-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function getContent(r) {
    return r && r.querySelector('.p4-content');
  }

  function renderTabs(r) {
    const nav = r?.querySelector('.p4-nav');
    if (!nav) return false;

    nav.querySelectorAll('.p59v-tab').forEach((b) => b.remove());

    TABS.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.className = 'p59v-tab';
      b.dataset.p59v = key;
      b.textContent = label;
      b.onclick = () => show(key);
      nav.appendChild(b);
    });
    mark(r, active);
    return true;
  }

  function mark(r, key) {
    r?.querySelectorAll('.p59v-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.p59v === key);
    });
  }

  async function automation() {
    const c = getContent(root());
    c.innerHTML = '<h1>Automation & Communication</h1><div class="p59v-note">Loading automation controls…</div>';
    try {
      const [settings, due, notifications] = await Promise.all([
        api('/automation/settings'),
        api('/automation/due'),
        api('/notifications')
      ]);
      const items = [...(due?.due || []), ...(due?.overdue || [])];
      c.innerHTML = `
        <h1>Automation & Communication</h1>
        <div class="p59v-note">Rent reminders, overdue follow-ups, notification history and recurring-invoice controls are connected to the Peacely backend.</div>
        <div class="p59v-grid">
          <div class="p59v-card"><div class="p59v-muted">Due Soon</div><div class="p59v-big">${items.filter(x => !(due?.overdue || []).includes(x)).length}</div></div>
          <div class="p59v-card"><div class="p59v-muted">Overdue</div><div class="p59v-big">${(due?.overdue || []).length}</div></div>
          <div class="p59v-card"><div class="p59v-muted">Notification Log</div><div class="p59v-big">${(notifications || []).length}</div></div>
          <div class="p59v-card"><div class="p59v-muted">Reminder Status</div><div class="p59v-big">${settings?.reminders_enabled ? 'ON' : 'OFF'}</div></div>
        </div>
        <div class="p59v-card">
          <div class="p59v-muted">Automation Settings</div>
          <div class="p59v-actions">
            <button class="p59v-btn" id="p59v-save">Save Settings</button>
            <button class="p59v-btn alt" id="p59v-refresh">Refresh</button>
          </div>
          <label class="p59v-muted">Reminders Enabled<br><select id="p59v-rem" style="margin-top:6px;padding:9px;border-radius:9px;background:#0e1723;color:#fff"><option value="true" ${settings?.reminders_enabled?'selected':''}>Yes</option><option value="false" ${!settings?.reminders_enabled?'selected':''}>No</option></select></label>
          <br><label class="p59v-muted">Days Before Due<br><input id="p59v-days" type="number" min="0" max="30" value="${Number(settings?.reminder_days_before ?? 3)}" style="margin-top:6px;padding:9px;border-radius:9px;background:#0e1723;color:#fff"></label>
          <br><label class="p59v-muted">Overdue Reminders<br><select id="p59v-over" style="margin-top:6px;padding:9px;border-radius:9px;background:#0e1723;color:#fff"><option value="true" ${settings?.overdue_reminders_enabled?'selected':''}>Yes</option><option value="false" ${!settings?.overdue_reminders_enabled?'selected':''}>No</option></select></label>
          <br><label class="p59v-muted">Recurring Invoice Engine<br><select id="p59v-rec" style="margin-top:6px;padding:9px;border-radius:9px;background:#0e1723;color:#fff"><option value="false" ${!settings?.recurring_invoices_enabled?'selected':''}>Off</option><option value="true" ${settings?.recurring_invoices_enabled?'selected':''}>On</option></select></label>
        </div>
        <div class="p59v-card"><div class="p59v-muted">Upcoming / Overdue</div>${items.length ? items.map(x => `<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06)"><strong>${esc(x.name)}</strong> · ${esc(x.invoice_number)} · ${money(x.amount)} · ${esc(x.status || '')}<br><button class="p59v-btn alt" data-queue="${x.tenant_id}" data-invoice="${x.invoice_id}" data-phone="${esc(x.phone || '')}" style="margin-top:6px">Queue WhatsApp Reminder</button></div>`).join('') : '<div>No reminders currently due.</div>'}</div>
      `;
      document.getElementById('p59v-save').onclick = async () => {
        await api('/automation/settings', { method:'PUT', body:JSON.stringify({
          reminders_enabled: document.getElementById('p59v-rem').value === 'true',
          reminder_days_before: Number(document.getElementById('p59v-days').value),
          overdue_reminders_enabled: document.getElementById('p59v-over').value === 'true',
          recurring_invoices_enabled: document.getElementById('p59v-rec').value === 'true'
        })});
        show('automation');
      };
      document.getElementById('p59v-refresh').onclick = () => show('automation');
      c.querySelectorAll('[data-queue]').forEach((b) => b.onclick = async () => {
        await api('/notifications/queue', { method:'POST', body:JSON.stringify({
          tenant_id:Number(b.dataset.queue), invoice_id:Number(b.dataset.invoice), channel:'whatsapp', type:'rent_reminder', recipient:b.dataset.phone,
          message:`Hello, this is a rent reminder from Peacely. Invoice ${b.dataset.invoice} is due/overdue. Please arrange payment. Thank you.`
        })});
        show('automation');
      });
    } catch (e) {
      c.innerHTML = `<h1>Automation & Communication</h1><div class="p59v-error">${esc(e.message)}</div><div class="p59v-note">The Automation option is loaded. The backend response above is the only remaining issue.</div>`;
    }
  }

  async function show(key) {
    const r = root();
    const c = getContent(r);
    if (!r || !c) return;
    active = key;
    mark(r, key);
    if (key === 'automation') return automation();
    c.innerHTML = `<h1>${esc(TABS.find(x => x[0] === key)?.[1] || key)}</h1><div class="p59v-note">This Phase 5–9 section is enabled. The full module will take over automatically when its primary module finishes loading.</div>`;
  }

  function boot() {
    const r = root();
    if (!r || !getContent(r)) return;
    installStyle();
    if (r.dataset.p59vBooted !== '1') {
      r.dataset.p59vBooted = '1';
      renderTabs(r);
      show(active);
    }
  }

  const observer = new MutationObserver(() => {
    const r = root();
    if (!r) return;
    if (r.dataset.p59vBooted !== '1') boot();
    if (r.dataset.p59vBooted === '1' && !r.querySelector('.p59v-tab')) renderTabs(r);
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });
  [0,100,300,700,1500,3000,5000,8000].forEach((ms) => setTimeout(boot, ms));
})();
