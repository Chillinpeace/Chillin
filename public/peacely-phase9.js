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

  let rootEl = null, panel = null;
  function findRoot(){ return document.getElementById('peacely-phase4-root'); }
  function findNav(){ return findRoot()?.querySelector('.p4-nav'); }

  function addTab(){
    const nav = findNav();
    if (!nav || nav.querySelector('[data-p9-tab="1"]')) return !!nav;
    const b = document.createElement('button');
    b.type='button'; b.dataset.p9Tab='1'; b.textContent='System Health';
    b.style.cssText='display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;border-radius:13px;margin-bottom:5px;cursor:pointer;color:#9aa5b6;font:inherit;font-size:12px;font-weight:700';
    b.onclick=showPanel;
    nav.appendChild(b);
    return true;
  }

  function showPanel(){
    if(panel){ panel.scrollIntoView({behavior:'smooth',block:'start'}); refresh(); return; }
    rootEl=findRoot();
    panel=document.createElement('section');
    panel.id='peacely-phase9-panel';
    panel.style.cssText='margin:18px auto;padding:20px;max-width:1100px;border:1px solid rgba(148,163,184,.2);border-radius:20px;background:rgba(15,23,42,.92);color:#e5e7eb';
    panel.innerHTML=`
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div><h2 style="margin:0 0 4px">System Health</h2><div style="opacity:.7;font-size:13px">Production health, database metrics, integrity checks and backup.</div></div>
        <button id="p9-refresh" style="padding:10px 15px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:transparent;color:inherit;font-weight:700">Refresh</button>
      </div>
      <div id="p9-status" style="margin-top:16px"></div>
      <div id="p9-metrics" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px"></div>
      <div id="p9-checks" style="margin-top:12px"></div>
      <div style="margin-top:12px;padding:15px;border:1px solid rgba(148,163,184,.18);border-radius:15px">
        <h3 style="margin:0 0 8px">Backup</h3>
        <div style="font-size:13px;opacity:.7;margin-bottom:10px">Download a current owner-scoped JSON backup of Peacely data.</div>
        <button id="p9-backup" style="padding:11px 15px;border:0;border-radius:10px;font-weight:800">Download Backup</button>
      </div>`;
    rootEl.appendChild(panel);
    panel.querySelector('#p9-refresh').onclick=refresh;
    panel.querySelector('#p9-backup').onclick=downloadBackup;
    panel.scrollIntoView({behavior:'smooth',block:'start'});
    refresh();
  }

  async function refresh(){
    if(!panel) return;
    const status=panel.querySelector('#p9-status'), metrics=panel.querySelector('#p9-metrics'), checks=panel.querySelector('#p9-checks');
    status.innerHTML='<div style="padding:12px;border-radius:12px;background:rgba(148,163,184,.08)">Checking production system…</div>';
    try{
      const [health,met,chk]=await Promise.all([api('/api/system/health'),api('/api/system/metrics'),api('/api/system/checks')]);
      status.innerHTML=`<div style="padding:12px;border-radius:12px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.18)"><strong>System status:</strong> ${esc(health?.status || health?.health || 'OK')} · Checked ${esc(new Date().toLocaleString('en-IN'))}</div>`;
      const values=[];
      const source=met?.metrics || met || {};
      for(const [k,v] of Object.entries(source)) if(['string','number','boolean'].includes(typeof v)) values.push([k,v]);
      metrics.innerHTML=(values.length?values.slice(0,12):[['metrics','Available']]).map(([k,v])=>`<div style="padding:14px;border:1px solid rgba(148,163,184,.18);border-radius:14px"><div style="font-size:11px;opacity:.65">${esc(k.replace(/_/g,' '))}</div><div style="font-size:20px;font-weight:850;margin-top:4px">${esc(typeof v==='number'?num(v):v)}</div></div>`).join('');
      const rows=arr(chk);
      checks.innerHTML=`<div style="padding:15px;border:1px solid rgba(148,163,184,.18);border-radius:15px"><h3 style="margin:0 0 10px">Integrity Checks</h3>${rows.length?rows.map(x=>`<div style="padding:9px 0;border-bottom:1px solid rgba(148,163,184,.1)"><strong>${esc(x.name||x.check||x.key||'Check')}</strong> · ${esc(x.status|| (x.ok===false?'Failed':'OK'))}${x.message?`<div style="font-size:12px;opacity:.7;margin-top:3px">${esc(x.message)}</div>`:''}</div>`).join(''):'<div style="opacity:.7">No check details returned.</div>'}</div>`;
    }catch(e){
      status.innerHTML=`<div style="padding:12px;border-radius:12px;background:#35151a;color:#fecaca">${esc(e.message)}</div>`;
      metrics.innerHTML=''; checks.innerHTML='';
    }
  }

  async function downloadBackup(){
    const b=panel?.querySelector('#p9-backup'); if(!b) return;
    b.disabled=true; b.textContent='Preparing…';
    try{
      const data=await api('/api/system/backup');
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob), a=document.createElement('a');
      a.href=url; a.download=`peacely-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      b.textContent='Backup Downloaded';
      setTimeout(()=>{b.textContent='Download Backup';b.disabled=false},1500);
    }catch(e){ alert(`Backup failed: ${e.message}`); b.textContent='Download Backup'; b.disabled=false; }
  }

  function boot(){
    if(!findRoot()) return;
    addTab();
  }
  const obs=new MutationObserver(boot);
  obs.observe(document.documentElement,{childList:true,subtree:true});
  [0,100,300,700,1500,3000,5000].forEach(ms=>setTimeout(boot,ms));
})();
