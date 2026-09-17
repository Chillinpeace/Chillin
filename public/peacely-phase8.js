(() => {
  if (window.__peacelyPhase8Booted) return;
  window.__peacelyPhase8Booted = true;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const json = (v, fallback) => { try { return JSON.parse(v); } catch { return fallback; } };
  const arr = (v) => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : (Array.isArray(v?.items) ? v.items : []));

  async function api(url, options = {}) {
    const res = await fetch(url, { credentials: 'include', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
    const text = await res.text();
    const data = json(text, {});
    if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
    return data;
  }

  function addTab() {
    const candidates = Array.from(document.querySelectorAll('button,[role="tab"],a')).filter((el) =>
      /Overview|Tenant Database|Invoices|Payments|Properties & Occupancy|Expenses|Production Checks|Automation|Financial Intelligence|Operations/i.test(el.textContent || '')
    );
    if (!candidates.length) return false;
    const host = candidates[0].parentElement;
    if (!host || host.querySelector('[data-p8-tab="1"]')) return true;
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.p8Tab = '1'; b.textContent = 'Security & Team';
    b.style.cssText = 'padding:12px 18px;border:0;background:transparent;color:inherit;font-weight:700;cursor:pointer;';
    b.onclick = () => showPanel();
    host.appendChild(b);
    return true;
  }

  let panel = null;
  let properties = [];
  let team = [];
  let editingId = null;

  async function loadProperties() {
    try { properties = arr(await api('/api/properties')); }
    catch { properties = []; }
  }

  async function loadTeam() {
    const data = await api('/api/team');
    team = arr(data);
    renderTeam();
  }

  async function loadAudit() {
    const data = await api('/api/audit');
    const rows = arr(data);
    const el = panel?.querySelector('#p8-audit-list');
    if (!el) return;
    el.innerHTML = rows.length ? rows.slice(0, 100).map((x) => `
      <div style="padding:12px 0;border-bottom:1px solid rgba(148,163,184,.18)">
        <div style="font-weight:700">${esc(x.action || 'Activity')}</div>
        <div style="font-size:12px;opacity:.7">${esc(x.entity_type || '')}${x.entity_id ? ` #${esc(x.entity_id)}` : ''} · ${esc(x.created_at || '')}</div>
      </div>`).join('') : '<div style="opacity:.65">No activity recorded yet.</div>';
  }

  function showPanel() {
    if (panel) { panel.scrollIntoView({behavior:'smooth',block:'start'}); return; }
    panel = document.createElement('section');
    panel.id = 'peacely-phase8-panel';
    panel.style.cssText = 'margin:18px auto;padding:20px;max-width:1100px;border:1px solid rgba(148,163,184,.2);border-radius:20px;background:rgba(15,23,42,.88);color:#e5e7eb;';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div><h2 style="margin:0 0 4px">Security & Team</h2><div style="opacity:.7;font-size:13px">Manage staff access, permissions and account activity.</div></div>
        <button id="p8-refresh" style="padding:10px 15px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:transparent;color:inherit;font-weight:700">Refresh</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:16px;margin-top:18px">
        <div style="padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:16px">
          <h3 style="margin-top:0">Staff Account</h3>
          <input id="p8-name" placeholder="Name" style="width:100%;box-sizing:border-box;margin:6px 0;padding:12px;border-radius:10px;background:transparent;color:inherit;border:1px solid rgba(148,163,184,.25)">
          <input id="p8-email" type="email" placeholder="Email" style="width:100%;box-sizing:border-box;margin:6px 0;padding:12px;border-radius:10px;background:transparent;color:inherit;border:1px solid rgba(148,163,184,.25)">
          <input id="p8-password" type="password" placeholder="Password (new account)" style="width:100%;box-sizing:border-box;margin:6px 0;padding:12px;border-radius:10px;background:transparent;color:inherit;border:1px solid rgba(148,163,184,.25)">
          <select id="p8-role" style="width:100%;margin:6px 0;padding:12px;border-radius:10px;background:#111827;color:inherit;border:1px solid rgba(148,163,184,.25)">
            <option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option>
          </select>
          <label style="display:block;font-size:13px;margin:10px 0 5px">Property access</label>
          <select id="p8-properties" multiple size="4" style="width:100%;padding:8px;border-radius:10px;background:#111827;color:inherit;border:1px solid rgba(148,163,184,.25)"></select>
          <div style="font-size:11px;opacity:.6;margin-top:5px">Hold Ctrl/long-press to select multiple properties.</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px">
            <label><input id="p8-read" type="checkbox" checked> Read</label>
            <label><input id="p8-write" type="checkbox" checked> Write</label>
            <label><input id="p8-payments" type="checkbox"> Payments</label>
            <label><input id="p8-finance" type="checkbox"> Finance</label>
          </div>
          <div style="display:flex;gap:8px;margin-top:14px">
            <button id="p8-save" style="flex:1;padding:12px;border:0;border-radius:10px;font-weight:800">Save Staff</button>
            <button id="p8-cancel" style="padding:12px;border:1px solid rgba(148,163,184,.25);border-radius:10px;background:transparent;color:inherit;display:none">Cancel</button>
          </div>
        </div>
        <div style="padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:16px">
          <h3 style="margin-top:0">Staff Accounts</h3>
          <div id="p8-team-list"><div style="opacity:.65">Loading…</div></div>
        </div>
      </div>
      <div style="margin-top:16px;padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:16px">
        <h3 style="margin-top:0">Activity History</h3>
        <div id="p8-audit-list"><div style="opacity:.65">Loading…</div></div>
      </div>`;
    document.body.appendChild(panel);
    panel.querySelector('#p8-refresh').onclick = refresh;
    panel.querySelector('#p8-cancel').onclick = resetForm;
    panel.querySelector('#p8-save').onclick = saveStaff;
    loadProperties().then(renderPropertyOptions).then(refresh).catch(showError);
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function renderPropertyOptions() {
    const s = panel?.querySelector('#p8-properties'); if (!s) return;
    s.innerHTML = properties.map((p) => `<option value="${esc(p.id)}">${esc(p.name || `Property ${p.id}`)}</option>`).join('');
  }

  function renderTeam() {
    const el = panel?.querySelector('#p8-team-list'); if (!el) return;
    el.innerHTML = team.length ? team.map((x) => {
      const active = x.active !== false;
      const props = Array.isArray(x.property_ids) ? x.property_ids.length : 0;
      return `<div style="padding:12px 0;border-bottom:1px solid rgba(148,163,184,.18)">
        <div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(x.name)}</strong><span>${esc(x.role || 'manager')} · ${active ? 'Active' : 'Inactive'}</span></div>
        <div style="font-size:12px;opacity:.7">${esc(x.email)} · ${props ? `${props} properties` : 'All properties'}</div>
        <div style="display:flex;gap:7px;margin-top:8px;flex-wrap:wrap">
          <button data-edit="${esc(x.id)}" style="padding:7px 10px">Edit</button>
          <button data-reset="${esc(x.id)}" style="padding:7px 10px">Reset Session</button>
          <button data-toggle="${esc(x.id)}" data-active="${active}" style="padding:7px 10px">${active ? 'Disable' : 'Enable'}</button>
        </div></div>`;
    }).join('') : '<div style="opacity:.65">No staff accounts yet.</div>';
    el.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => editStaff(Number(b.dataset.edit)));
    el.querySelectorAll('[data-reset]').forEach((b) => b.onclick = () => resetSession(Number(b.dataset.reset)));
    el.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => toggleStaff(Number(b.dataset.toggle), b.dataset.active === 'true'));
  }

  function editStaff(id) {
    const x = team.find((u) => Number(u.id) === id); if (!x) return;
    editingId = id;
    panel.querySelector('#p8-name').value = x.name || '';
    panel.querySelector('#p8-email').value = x.email || '';
    panel.querySelector('#p8-password').value = '';
    panel.querySelector('#p8-role').value = x.role || 'manager';
    const ids = Array.isArray(x.property_ids) ? x.property_ids.map(String) : [];
    Array.from(panel.querySelector('#p8-properties').options).forEach((o) => { o.selected = ids.includes(o.value); });
    const perms = x.permissions || {};
    panel.querySelector('#p8-read').checked = perms.read !== false;
    panel.querySelector('#p8-write').checked = perms.write !== false;
    panel.querySelector('#p8-payments').checked = perms.payments === true;
    panel.querySelector('#p8-finance').checked = perms.finance === true;
    panel.querySelector('#p8-cancel').style.display = '';
    panel.querySelector('#p8-save').textContent = 'Update Staff';
    panel.scrollIntoView({behavior:'smooth'});
  }

  function resetForm() {
    editingId = null;
    ['#p8-name','#p8-email','#p8-password'].forEach((s) => panel.querySelector(s).value='');
    panel.querySelector('#p8-role').value='manager';
    Array.from(panel.querySelector('#p8-properties').options).forEach((o) => o.selected=false);
    panel.querySelector('#p8-read').checked=true; panel.querySelector('#p8-write').checked=true; panel.querySelector('#p8-payments').checked=false; panel.querySelector('#p8-finance').checked=false;
    panel.querySelector('#p8-cancel').style.display='none'; panel.querySelector('#p8-save').textContent='Save Staff';
  }

  async function saveStaff() {
    const name=panel.querySelector('#p8-name').value.trim(), email=panel.querySelector('#p8-email').value.trim(), password=panel.querySelector('#p8-password').value;
    if (!name || !email || (!editingId && !password)) return showError(new Error('Name, email and password are required for a new staff account.'));
    const property_ids=Array.from(panel.querySelector('#p8-properties').selectedOptions).map((o)=>Number(o.value)).filter(Boolean);
    const body={name,email,role:panel.querySelector('#p8-role').value,permissions:{read:panel.querySelector('#p8-read').checked,write:panel.querySelector('#p8-write').checked,payments:panel.querySelector('#p8-payments').checked,finance:panel.querySelector('#p8-finance').checked},property_ids};
    if (password) body.password=password;
    const b=panel.querySelector('#p8-save'); b.disabled=true; b.textContent='Saving…';
    try { await api(editingId ? `/api/team/${editingId}` : '/api/team', {method:editingId?'PUT':'POST',body:JSON.stringify(body)}); resetForm(); await refresh(); alert('Staff account saved.'); }
    catch(e){ showError(e); } finally { b.disabled=false; if(!editingId) b.textContent='Save Staff'; }
  }

  async function resetSession(id) { try { await api(`/api/team/${id}/reset-session`,{method:'POST'}); await refresh(); alert('Staff session reset.'); } catch(e){showError(e);} }
  async function toggleStaff(id, active) { try { await api(`/api/team/${id}`,{method:'PUT',body:JSON.stringify({active:!active})}); await refresh(); } catch(e){showError(e);} }

  async function refresh() { try { await Promise.all([loadTeam(),loadAudit()]); } catch(e){ showError(e); } }
  function showError(e) { const msg=e?.message||String(e); console.error('Phase 8:',e); if(panel) { const old=panel.querySelector('#p8-error'); if(old) old.remove(); const d=document.createElement('div'); d.id='p8-error'; d.style.cssText='margin-top:12px;padding:10px;border:1px solid #7f1d1d;border-radius:10px;color:#fecaca'; d.textContent=msg; panel.prepend(d); } }

  function boot() {
    addTab();
    const obs = new MutationObserver(() => { if (!document.querySelector('[data-p8-tab="1"]')) addTab(); });
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(() => { if (!panel) addTab(); }, 2500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
