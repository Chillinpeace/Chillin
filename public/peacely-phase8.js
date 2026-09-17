(() => {
  'use strict';
  if (window.__peacelyPhase8Booted) return;
  window.__peacelyPhase8Booted = true;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const parse = (v) => { try { return JSON.parse(v); } catch { return {}; } };
  const list = (v) => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : (Array.isArray(v?.team) ? v.team : (Array.isArray(v?.items) ? v.items : [])));

  async function api(url, options = {}) {
    const r = await fetch(url, { credentials:'include', headers:{'Content-Type':'application/json', ...(options.headers || {})}, ...options });
    const text = await r.text();
    const d = parse(text);
    if (!r.ok) throw new Error(d?.error || d?.message || `Request failed (${r.status})`);
    return d;
  }

  let panel = null;
  let editingId = null;
  let team = [];
  let properties = [];

  function getManagementRoot() {
    return document.getElementById('peacely-phase4-root');
  }

  function installTab() {
    const root = getManagementRoot();
    if (!root || !root.querySelector('.p4-nav')) return false;
    const nav = root.querySelector('.p4-nav');
    let tab = nav.querySelector('[data-p8-tab="1"]');
    if (!tab) {
      tab = document.createElement('button');
      tab.type = 'button';
      tab.dataset.p8Tab = '1';
      tab.textContent = 'Security & Team';
      tab.style.cssText = 'display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;border-radius:13px;margin-bottom:5px;cursor:pointer;color:#9aa5b6;font:inherit;font-size:12px;font-weight:700;';
      nav.appendChild(tab);
    }
    tab.onclick = () => openPanel(root);
    return true;
  }

  function openPanel(root) {
    const content = root.querySelector('.p4-content');
    if (!content) return;
    root.querySelectorAll('.p4-nav button').forEach(b => b.classList.remove('active'));
    root.querySelector('[data-p8-tab="1"]')?.classList.add('active');
    content.innerHTML = `
      <h1>Security &amp; Team</h1>
      <div class="p4-note">Manage staff accounts, roles, property access and account activity. The owner account remains the administrator.</div>
      <div class="p4-grid">
        <div class="p4-card">
          <h3>Staff Account</h3>
          <div class="p4-form" style="margin-top:12px">
            <label>Name<input id="p8-name" placeholder="Staff name"></label>
            <label>Email<input id="p8-email" type="email" placeholder="Staff email"></label>
            <label>Password<input id="p8-password" type="password" placeholder="New password"></label>
            <label>Role<select id="p8-role"><option value="manager">Manager</option><option value="staff">Staff</option><option value="viewer">Viewer</option></select></label>
            <label>Property access<select id="p8-properties" multiple size="4"></select></label>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;font-size:12px">
            <label><input id="p8-read" type="checkbox" checked> Read</label>
            <label><input id="p8-write" type="checkbox" checked> Write</label>
            <label><input id="p8-payments" type="checkbox"> Payments</label>
            <label><input id="p8-finance" type="checkbox"> Finance</label>
          </div>
          <div class="p4-toolbar"><button class="p4-btn" id="p8-save">Save Staff</button><button class="p4-btn alt" id="p8-cancel" style="display:none">Cancel</button><button class="p4-btn alt" id="p8-refresh">Refresh</button></div>
        </div>
        <div class="p4-card"><h3>Staff Accounts</h3><div id="p8-team-list">Loading…</div></div>
      </div>
      <div class="p4-card" style="margin-top:14px"><h3>Activity History</h3><div id="p8-audit-list">Loading…</div></div>
      <div id="p8-error" style="display:none;margin-top:12px;padding:12px;border-radius:12px;background:#3f1720;color:#fecaca"></div>`;
    panel = content;
    content.querySelector('#p8-save').onclick = saveStaff;
    content.querySelector('#p8-cancel').onclick = resetForm;
    content.querySelector('#p8-refresh').onclick = refresh;
    loadProperties().then(renderProperties).then(refresh).catch(showError);
  }

  async function loadProperties() {
    try { properties = list(await api('/api/properties')); } catch { properties = []; }
  }
  function renderProperties() {
    const s = panel?.querySelector('#p8-properties'); if (!s) return;
    s.innerHTML = properties.map(p => `<option value="${esc(p.id)}">${esc(p.name || `Property ${p.id}`)}</option>`).join('');
  }
  async function loadTeam() { team = list(await api('/api/team')); renderTeam(); }
  async function loadAudit() { const rows = list(await api('/api/audit')); const el=panel?.querySelector('#p8-audit-list'); if(!el)return; el.innerHTML=rows.length ? rows.slice(0,100).map(x=>`<div style="padding:10px 0;border-bottom:1px solid rgba(255,255,255,.07)"><strong>${esc(x.action || 'Activity')}</strong><div class="p4-muted">${esc(x.entity_type || '')}${x.entity_id ? ` #${esc(x.entity_id)}`:''} · ${esc(x.created_at || '')}</div></div>`).join('') : '<div class="p4-muted">No activity recorded yet.</div>'; }
  function renderTeam() {
    const el=panel?.querySelector('#p8-team-list'); if(!el)return;
    el.innerHTML=team.length ? team.map(x=>{const active=x.active!==false; const pc=Array.isArray(x.property_ids)?x.property_ids.length:0; return `<div style="padding:11px 0;border-bottom:1px solid rgba(255,255,255,.07)"><strong>${esc(x.name)}</strong> <span class="p4-status ${active?'good':'bad'}">${esc(x.role||'manager')} · ${active?'Active':'Inactive'}</span><div class="p4-muted">${esc(x.email)} · ${pc?`${pc} properties`:'All properties'}</div><div class="p4-toolbar" style="margin:7px 0 0"><button class="p4-btn alt" data-p8-edit="${esc(x.id)}">Edit</button><button class="p4-btn alt" data-p8-reset="${esc(x.id)}">Reset Session</button><button class="p4-btn alt" data-p8-toggle="${esc(x.id)}" data-active="${active}">${active?'Disable':'Enable'}</button></div></div>`;}).join('') : '<div class="p4-muted">No staff accounts yet.</div>';
    el.querySelectorAll('[data-p8-edit]').forEach(b=>b.onclick=()=>editStaff(Number(b.dataset.p8Edit)));
    el.querySelectorAll('[data-p8-reset]').forEach(b=>b.onclick=()=>resetSession(Number(b.dataset.p8Reset)));
    el.querySelectorAll('[data-p8-toggle]').forEach(b=>b.onclick=()=>toggleStaff(Number(b.dataset.p8Toggle),b.dataset.active==='true'));
  }
  function editStaff(id){const x=team.find(u=>Number(u.id)===id);if(!x)return;editingId=id;panel.querySelector('#p8-name').value=x.name||'';panel.querySelector('#p8-email').value=x.email||'';panel.querySelector('#p8-password').value='';panel.querySelector('#p8-role').value=x.role||'manager';const ids=Array.isArray(x.property_ids)?x.property_ids.map(String):[];Array.from(panel.querySelector('#p8-properties').options).forEach(o=>o.selected=ids.includes(o.value));const p=x.permissions||{};panel.querySelector('#p8-read').checked=p.read!==false;panel.querySelector('#p8-write').checked=p.write!==false;panel.querySelector('#p8-payments').checked=p.payments===true;panel.querySelector('#p8-finance').checked=p.finance===true;panel.querySelector('#p8-cancel').style.display='inline-block';panel.querySelector('#p8-save').textContent='Update Staff';}
  function resetForm(){editingId=null;['#p8-name','#p8-email','#p8-password'].forEach(s=>panel.querySelector(s).value='');panel.querySelector('#p8-role').value='manager';Array.from(panel.querySelector('#p8-properties').options).forEach(o=>o.selected=false);panel.querySelector('#p8-read').checked=true;panel.querySelector('#p8-write').checked=true;panel.querySelector('#p8-payments').checked=false;panel.querySelector('#p8-finance').checked=false;panel.querySelector('#p8-cancel').style.display='none';panel.querySelector('#p8-save').textContent='Save Staff';}
  async function saveStaff(){const name=panel.querySelector('#p8-name').value.trim(),email=panel.querySelector('#p8-email').value.trim(),password=panel.querySelector('#p8-password').value;if(!name||!email||(!editingId&&!password))return showError(new Error('Name, email and password are required for a new staff account.'));const property_ids=Array.from(panel.querySelector('#p8-properties').selectedOptions).map(o=>Number(o.value)).filter(Boolean);const body={name,email,role:panel.querySelector('#p8-role').value,permissions:{read:panel.querySelector('#p8-read').checked,write:panel.querySelector('#p8-write').checked,payments:panel.querySelector('#p8-payments').checked,finance:panel.querySelector('#p8-finance').checked},property_ids};if(password)body.password=password;const b=panel.querySelector('#p8-save');b.disabled=true;b.textContent='Saving…';try{await api(editingId?`/api/team/${editingId}`:'/api/team',{method:editingId?'PUT':'POST',body:JSON.stringify(body)});resetForm();await refresh();alert('Staff account saved.');}catch(e){showError(e);}finally{b.disabled=false;if(!editingId)b.textContent='Save Staff';}}
  async function resetSession(id){try{await api(`/api/team/${id}/reset-session`,{method:'POST'});await refresh();alert('Staff session reset.');}catch(e){showError(e);}}
  async function toggleStaff(id,active){try{await api(`/api/team/${id}`,{method:'PUT',body:JSON.stringify({active:!active})});await refresh();}catch(e){showError(e);}}
  async function refresh(){try{await Promise.all([loadTeam(),loadAudit()]);}catch(e){showError(e);}}
  function showError(e){const el=panel?.querySelector('#p8-error');if(!el)return;el.style.display='block';el.textContent=e?.message||String(e);console.error('Phase 8:',e);}

  function boot(){
    const obs=new MutationObserver(()=>installTab());
    obs.observe(document.body,{childList:true,subtree:true});
    [0,100,300,700,1500,3000,5000].forEach(ms=>setTimeout(installTab,ms));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
