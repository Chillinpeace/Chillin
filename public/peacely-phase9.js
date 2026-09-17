(() => {
  'use strict';
  if (window.__peacelyPhase9Booted) return;
  window.__peacelyPhase9Booted = true;

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const num = (v) => Number(v || 0).toLocaleString('en-IN');
  const api = async (path, options = {}) => {
    const r = await fetch(path, { credentials:'include', headers:{'Content-Type':'application/json',...(options.headers||{})}, ...options });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  };
  const arr = v => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : (Array.isArray(v?.rows) ? v.rows : []));

  let root = null;
  let panel = null;
  let tabButton = null;

  function findRoot(){ return document.getElementById('peacely-phase4-root'); }
  function findNav(){ return findRoot()?.querySelector('.p4-nav'); }
  function findContent(){ return findRoot()?.querySelector('.p4-content'); }

  function addTab(){
    root = findRoot();
    const nav = findNav();
    if (!nav) return false;
    tabButton = nav.querySelector('[data-p9-tab="1"]');
    if (!tabButton) {
      tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.dataset.p9Tab = '1';
      tabButton.textContent = 'System Health';
      tabButton.className = 'p9-tab';
      nav.appendChild(tabButton);
    }
    tabButton.onclick = showPanel;
    return true;
  }

  function makePanel(){
    const content = findContent();
    if (!content) return null;
    panel = document.createElement('div');
    panel.id = 'peacely-phase9-panel';
    panel.innerHTML = `
      <h1>System Health</h1>
      <div style="padding:12px;border-radius:13px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.14);color:#9de8ca;font-size:11px;margin-bottom:14px">
        Production health, database metrics, integrity checks and owner backup.
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        <button class="p4-btn" id="p9-refresh">Refresh Health</button>
        <button class="p4-btn alt" id="p9-backup">Download Backup</button>
      </div>
      <div id="p9-status"></div>
      <div id="p9-metrics" class="p4-grid" style="margin-top:12px"></div>
      <div id="p9-checks" style="margin-top:12px"></div>`;
    content.replaceChildren(panel);
    panel.querySelector('#p9-refresh').onclick = refresh;
    panel.querySelector('#p9-backup').onclick = downloadBackup;
    return panel;
  }

  function showPanel(){
    root = findRoot();
    if (!root) return;
    root.classList.add('open');
    addTab();
    navActive();
    if (!panel || !document.getElementById('peacely-phase9-panel')) makePanel();
    refresh();
  }

  function navActive(){
    const nav = findNav();
    if (!nav) return;
    nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    const b = nav.querySelector('[data-p9-tab="1"]');
    if (b) b.classList.add('active');
  }

  async function refresh(){
    if(!panel) return;
    const status = panel.querySelector('#p9-status');
    const metrics = panel.querySelector('#p9-metrics');
    const checks = panel.querySelector('#p9-checks');
    status.innerHTML = '<div class="p4-note">Checking production system…</div>';
    metrics.innerHTML = '';
    checks.innerHTML = '';
    try{
      const [health, met, chk] = await Promise.all([
        api('/api/system/health'),
        api('/api/system/metrics'),
        api('/api/system/checks')
      ]);
      status.innerHTML = `<div class="p4-note"><strong>System status:</strong> ${esc(health?.status || health?.health || 'OK')} · Checked ${esc(new Date().toLocaleString('en-IN'))}</div>`;
      const source = met?.metrics || met || {};
      const values = [];
      for (const [k,v] of Object.entries(source)) {
        if(['string','number','boolean'].includes(typeof v)) values.push([k,v]);
      }
      metrics.innerHTML = (values.length ? values.slice(0,12) : [['metrics','Available']]).map(([k,v]) =>
        `<div class="p4-card"><h3>${esc(k.replace(/_/g,' '))}</h3><div class="p4-big">${esc(typeof v === 'number' ? num(v) : v)}</div></div>`
      ).join('');
      const rows = arr(chk);
      checks.innerHTML = `<div class="p4-card"><h3>Integrity Checks</h3>${rows.length ? rows.map(x =>
        `<div style="padding:9px 0;border-bottom:1px solid rgba(255,255,255,.06)"><strong>${esc(x.name||x.check||x.key||'Check')}</strong> · ${esc(x.status || (x.ok === false ? 'Failed' : 'OK'))}${x.message ? `<div class="p4-muted" style="margin-top:3px">${esc(x.message)}</div>` : ''}</div>`
      ).join('') : '<div class="p4-muted">No check details returned.</div>'}</div>`;
    } catch(e){
      status.innerHTML = `<div style="padding:12px;border-radius:13px;background:rgba(127,29,29,.35);color:#fecaca;border:1px solid rgba(248,113,113,.2)">${esc(e.message)}</div>`;
    }
  }

  async function downloadBackup(){
    const b = panel?.querySelector('#p9-backup');
    if(!b) return;
    b.disabled = true;
    b.textContent = 'Preparing…';
    try{
      const data = await api('/api/system/backup');
      const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `peacely-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      b.textContent = 'Backup Downloaded';
      setTimeout(() => { b.textContent = 'Download Backup'; b.disabled = false; }, 1500);
    } catch(e){
      alert(`Backup failed: ${e.message}`);
      b.textContent = 'Download Backup';
      b.disabled = false;
    }
  }

  function boot(){
    root = findRoot();
    if (!root) return;
    addTab();
  }

  const obs = new MutationObserver(() => {
    const before = tabButton;
    boot();
    if (before && !document.querySelector('[data-p9-tab="1"]')) tabButton = null;
  });
  obs.observe(document.documentElement, {childList:true,subtree:true});
  [0,100,300,700,1500,3000,5000].forEach(ms => setTimeout(boot,ms));
})();
