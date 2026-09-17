(() => {
  if (window.__peacelyPhase10Booted) return;
  window.__peacelyPhase10Booted = true;

  const esc = (v) => String(v ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const list = (v) => Array.isArray(v) ? v : (Array.isArray(v?.data) ? v.data : (Array.isArray(v?.items) ? v.items : []));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', {maximumFractionDigits: 0})}`;

  async function api(url) {
    const res = await fetch(url, {credentials:'include'});
    const text = await res.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}
    if (!res.ok) throw new Error(data?.error || data?.message || `Request failed (${res.status})`);
    return data;
  }

  let panel = null;
  let data = {properties:[], rooms:[], beds:[], tenants:[], invoices:[], payments:[], expenses:[]};

  async function load() {
    const endpoints = Object.keys(data).map((k) => ({k, url:`/api/${k}`}));
    const results = await Promise.all(endpoints.map(async ({k,url}) => {
      try { return [k, list(await api(url))]; } catch { return [k, []]; }
    }));
    results.forEach(([k,v]) => { data[k] = v; });
    render();
  }

  function propId(x) { return String(x.property_id ?? x.propertyId ?? x.property?.id ?? ''); }
  function propName(id) {
    const p = data.properties.find(x => String(x.id) === String(id));
    return p?.name || p?.property_name || (id ? `Property ${id}` : 'Unassigned');
  }

  function render() {
    if (!panel) return;
    const activeTenants = data.tenants.filter(t => String(t.status ?? 'active').toLowerCase() === 'active');
    const occupiedBeds = data.beds.filter(b => b.is_occupied === true || String(b.status).toLowerCase() === 'occupied').length;
    const totalBeds = data.beds.length;
    const monthlyRent = activeTenants.reduce((s,t) => s + Number(t.monthly_rent || t.rent || 0), 0);
    const outstanding = data.invoices.reduce((s,i) => s + Math.max(0, Number(i.amount || 0) - Number(i.paid_amount || 0)), 0);
    const expenses = data.expenses.reduce((s,e) => s + Number(e.amount || 0), 0);

    const cards = data.properties.map(p => {
      const id = String(p.id);
      const tenants = activeTenants.filter(t => propId(t) === id);
      const rooms = data.rooms.filter(r => propId(r) === id);
      const beds = data.beds.filter(b => propId(b) === id);
      const occupied = beds.filter(b => b.is_occupied === true || String(b.status).toLowerCase() === 'occupied').length;
      const rent = tenants.reduce((s,t) => s + Number(t.monthly_rent || t.rent || 0), 0);
      return `<div style="padding:16px;border:1px solid rgba(148,163,184,.18);border-radius:16px">
        <div style="font-size:18px;font-weight:800">${esc(p.name || p.property_name || `Property ${id}`)}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px;font-size:13px">
          <div>Rooms<br><strong>${rooms.length}</strong></div><div>Beds<br><strong>${beds.length}</strong></div>
          <div>Occupied<br><strong>${occupied}/${beds.length}</strong></div><div>Active tenants<br><strong>${tenants.length}</strong></div>
        </div><div style="margin-top:12px">Monthly rent <strong>${money(rent)}</strong></div>
      </div>`;
    }).join('');

    panel.querySelector('#p10-summary').innerHTML = `
      <div><span>Properties</span><strong>${data.properties.length}</strong></div>
      <div><span>Active tenants</span><strong>${activeTenants.length}</strong></div>
      <div><span>Occupancy</span><strong>${occupiedBeds}/${totalBeds}</strong></div>
      <div><span>Monthly rent</span><strong>${money(monthlyRent)}</strong></div>
      <div><span>Outstanding</span><strong>${money(outstanding)}</strong></div>
      <div><span>Recorded expenses</span><strong>${money(expenses)}</strong></div>`;
    panel.querySelector('#p10-properties').innerHTML = cards || '<div style="opacity:.65">No properties found.</div>';
  }

  function show() {
    if (panel) { panel.scrollIntoView({behavior:'smooth',block:'start'}); load(); return; }
    panel = document.createElement('section');
    panel.id = 'peacely-phase10-panel';
    panel.style.cssText = 'margin:18px auto;padding:20px;max-width:1100px;border:1px solid rgba(148,163,184,.2);border-radius:20px;background:rgba(15,23,42,.92);color:#e5e7eb;';
    panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
      <div><h2 style="margin:0 0 5px">Business Platform</h2><div style="opacity:.7;font-size:13px">Owner dashboard for your complete property portfolio.</div></div>
      <button id="p10-refresh" style="padding:10px 15px;border-radius:10px;border:1px solid rgba(148,163,184,.25);background:transparent;color:inherit;font-weight:700">Refresh</button>
    </div>
    <div id="p10-summary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:18px"></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
      <button id="p10-finance" style="padding:11px 15px;border:0;border-radius:10px;font-weight:800">Financial Intelligence</button>
      <button id="p10-ops" style="padding:11px 15px;border:1px solid rgba(148,163,184,.25);border-radius:10px;background:transparent;color:inherit;font-weight:800">Property Operations</button>
    </div>
    <h3 style="margin:24px 0 12px">Portfolio</h3>
    <div id="p10-properties" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px"></div>`;
    document.body.appendChild(panel);
    panel.querySelector('#p10-refresh').onclick = load;
    panel.querySelector('#p10-finance').onclick = () => clickTab('Financial Intelligence');
    panel.querySelector('#p10-ops').onclick = () => clickTab('Operations');
    load().catch(() => {});
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function clickTab(name) {
    const el = Array.from(document.querySelectorAll('button,[role="tab"],a')).find(x => (x.textContent || '').trim().toLowerCase() === name.toLowerCase());
    if (el) el.click();
  }

  function addTab() {
    const existing = Array.from(document.querySelectorAll('button,[role="tab"],a')).find(x => (x.textContent || '').trim().toLowerCase() === 'business platform');
    if (existing) return true;
    const nav = Array.from(document.querySelectorAll('button,[role="tab"],a')).find(x => /financial intelligence|operations/i.test((x.textContent || '').trim()));
    if (!nav?.parentElement) return false;
    const b = document.createElement('button');
    b.type='button'; b.textContent='Business Platform'; b.dataset.p10Tab='1';
    b.style.cssText='padding:12px 18px;border:0;background:transparent;color:inherit;font-weight:700;cursor:pointer;';
    b.onclick=show;
    nav.parentElement.appendChild(b);
    return true;
  }

  function boot() {
    addTab();
    const obs = new MutationObserver(() => { if (!document.querySelector('[data-p10-tab="1"]')) addTab(); });
    obs.observe(document.body,{childList:true,subtree:true});
    setTimeout(addTab,1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
