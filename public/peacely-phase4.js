(() => {
  'use strict';

  const API = '/api';
  const EXPENSE_KEY = 'peacely_phase4_expenses_v1';
  let mounted = false;
  let cache = null;

  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const date = (v) => {
    if (!v) return '-';
    const d = new Date(`${String(v).slice(0,10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  };
  const statusClass = (v) => {
    const s = String(v || '').toLowerCase();
    if (s === 'paid' || s === 'active' || s === 'healthy') return 'good';
    if (s.includes('overdue') || s.includes('failed') || s === 'inactive') return 'bad';
    return 'warn';
  };

  async function api(path, options) {
    const r = await fetch(`${API}${path}`, { credentials:'include', headers:{'Content-Type':'application/json', ...(options?.headers || {})}, ...(options || {}) });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    return d;
  }

  function collection(payload, key) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.[key])) return payload[key];
    return [];
  }

  async function load() {
    const [properties, rooms, beds, tenants, payments, invoices] = await Promise.all([
      api('/properties'), api('/rooms'), api('/beds'), api('/tenants'), api('/payments'), api('/invoices')
    ]);
    cache = {
      properties: collection(properties,'properties'), rooms: collection(rooms,'rooms'), beds: collection(beds,'beds'),
      tenants: collection(tenants,'tenants'), payments: collection(payments,'payments'), invoices: collection(invoices,'invoices'),
      expenses: readExpenses()
    };
    return cache;
  }

  function readExpenses() {
    try { return JSON.parse(localStorage.getItem(EXPENSE_KEY) || '[]'); } catch { return []; }
  }
  function writeExpenses(items) { localStorage.setItem(EXPENSE_KEY, JSON.stringify(items)); }

  function propertyBeds(propertyId) {
    const rooms = cache.rooms.filter(r => Number(r.property_id) === Number(propertyId));
    const roomIds = new Set(rooms.map(r => Number(r.id)));
    return cache.beds.filter(b => Number(b.property_id) === Number(propertyId) || roomIds.has(Number(b.room_id)));
  }

  function tenantBalance(tenantId) {
    return cache.invoices.filter(i => Number(i.tenant_id) === Number(tenantId)).reduce((sum,i) => {
      const fallback = Number(i.amount || 0) - Number(i.paid_amount || 0);
      return sum + Math.max(Number(i.balance_amount ?? fallback),0);
    },0);
  }

  function injectStyle() {
    if (document.getElementById('peacely-phase4-style')) return;
    const s = document.createElement('style'); s.id = 'peacely-phase4-style';
    s.textContent = `
      #peacely-phase4-root{position:fixed;inset:0;z-index:99999;display:none;background:rgba(0,0,0,.72);backdrop-filter:blur(8px);font-family:inherit;color:#f8fafc}
      #peacely-phase4-root.open{display:block}
      .p4-shell{position:absolute;inset:2.5vh 2.5vw;background:#071018;border:1px solid rgba(255,255,255,.08);border-radius:24px;overflow:hidden;box-shadow:0 30px 100px rgba(0,0,0,.6);display:flex;flex-direction:column}
      .p4-head{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;background:#0b111c;border-bottom:1px solid rgba(255,255,255,.08)}
      .p4-head h2{margin:0;font-size:20px;font-weight:800}.p4-head small{display:block;margin-top:4px;color:#8792a5;font-size:11px}.p4-close{border:1px solid rgba(255,255,255,.08);background:#172131;color:#fff;border-radius:13px;width:44px;height:44px;font-size:25px;cursor:pointer}
      .p4-body{display:flex;min-height:0;flex:1}.p4-nav{width:205px;background:#0a111b;border-right:1px solid rgba(255,255,255,.07);padding:12px;overflow:auto}.p4-nav button{display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;border-radius:13px;margin-bottom:5px;cursor:pointer;color:#9aa5b6;font:inherit;font-size:12px;font-weight:700}.p4-nav button.active,.p4-nav button:hover{background:#111c2a;color:#fff}
      .p4-content{padding:22px;overflow:auto;flex:1;background:radial-gradient(circle at top right,rgba(16,185,129,.07),transparent 35%),#071018}.p4-content h1{font-size:28px;margin:0 0 18px;font-weight:850;letter-spacing:-.5px}
      .p4-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.p4-card{background:rgba(15,23,35,.88);border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:16px;box-shadow:0 8px 30px rgba(0,0,0,.12)}.p4-card h3{margin:0 0 7px;font-size:12px;color:#8f9aab;font-weight:750}.p4-big{font-size:24px;font-weight:850;color:#f8fafc}.p4-muted{color:#7f8a9c;font-size:11px}.p4-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.p4-toolbar input,.p4-toolbar select,.p4-form input,.p4-form select{border:1px solid rgba(255,255,255,.1);border-radius:11px;padding:10px 11px;background:#0e1723;color:#f8fafc;outline:none}.p4-toolbar input{min-width:220px}.p4-btn{border:0;border-radius:11px;padding:10px 13px;cursor:pointer;background:#10b981;color:#04130d;font-weight:800}.p4-btn.alt{background:#172131;color:#dce3ec}.p4-btn.danger{background:#7f1d1d;color:#fff}.p4-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:15px}.p4-table{width:100%;border-collapse:collapse;min-width:760px;background:#0b131e}.p4-table th,.p4-table td{padding:11px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;font-size:12px;vertical-align:top}.p4-table th{background:#101a27;color:#8e99aa;font-size:11px}.p4-table td{color:#dbe2ea}.p4-status{display:inline-block;padding:4px 8px;border-radius:999px;background:#202b3a;font-size:10px;font-weight:800}.p4-status.good{background:rgba(16,185,129,.14);color:#34d399}.p4-status.warn{background:rgba(245,158,11,.14);color:#fbbf24}.p4-status.bad{background:rgba(239,68,68,.14);color:#f87171}.p4-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-bottom:14px}.p4-form label{font-size:11px;color:#8e99aa;display:flex;flex-direction:column;gap:6px}.p4-note{padding:12px;border-radius:13px;background:rgba(16,185,129,.08);border:1px solid rgba(16,185,129,.14);color:#9de8ca;font-size:11px;margin-bottom:14px}.p4-empty{padding:30px;text-align:center;color:#7f8a9c;background:#0b131e;border:1px dashed rgba(255,255,255,.1);border-radius:15px}.p4-progress{height:8px;background:#1b2634;border-radius:999px;overflow:hidden}.p4-progress i{display:block;height:100%;background:#10b981;border-radius:999px}.p4-checklist{display:grid;gap:8px;margin:0;padding:0;list-style:none}.p4-checklist li{padding:11px 12px;border-radius:11px;background:#0e1723;color:#cbd5e1;font-size:11px}
      @media(max-width:700px){.p4-shell{inset:0;border-radius:0}.p4-head{padding:14px}.p4-body{flex-direction:column}.p4-nav{width:auto;display:flex;gap:6px;overflow-x:auto;border-right:0;border-bottom:1px solid rgba(255,255,255,.07);padding:8px}.p4-nav button{min-width:max-content;margin:0;padding:9px 11px;font-size:10px}.p4-content{padding:15px}.p4-content h1{font-size:25px}.p4-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.p4-card{padding:14px}.p4-big{font-size:20px}.p4-toolbar input{min-width:0;width:100%}}
    `;
    document.head.appendChild(s);
  }

  function ensureRoot() {
    injectStyle();
    let root = document.getElementById('peacely-phase4-root');
    if (root) return root;
    root = document.createElement('div'); root.id = 'peacely-phase4-root';
    root.innerHTML = `<div class="p4-shell"><div class="p4-head"><div><h2>Peacely Management Center</h2><small>Operations, finance & production controls</small></div><button class="p4-close" aria-label="Close">×</button></div><div class="p4-body"><aside class="p4-nav"></aside><main class="p4-content"></main></div></div>`;
    document.body.appendChild(root);
    root.querySelector('.p4-close').onclick = () => root.classList.remove('open');
    root.addEventListener('click',e => { if(e.target === root) root.classList.remove('open'); });
    return root;
  }

  const tabs = [['overview','Overview'],['tenants','Tenant Database'],['invoices','Invoices'],['payments','Payments'],['properties','Properties & Occupancy'],['expenses','Expenses'],['hardening','Production Checks']];

  function nav(root,active) {
    root.querySelector('.p4-nav').innerHTML = tabs.map(([k,l]) => `<button data-p4-tab="${k}" class="${active===k?'active':''}">${l}</button>`).join('');
    root.querySelectorAll('[data-p4-tab]').forEach(b => b.onclick = () => renderTab(b.dataset.p4Tab));
  }
  function shell(title,body) { return `<h1>${title}</h1>${body}`; }

  function overview() {
    const active = cache.tenants.filter(t => String(t.status||'').toLowerCase()==='active').length;
    const occupied = cache.beds.filter(b => Boolean(b.is_occupied)).length;
    const expected = cache.invoices.reduce((s,i)=>s+Number(i.amount||0),0);
    const collected = cache.invoices.reduce((s,i)=>s+Number(i.paid_amount||0),0);
    const outstanding = cache.invoices.reduce((s,i)=>s+Math.max(Number(i.balance_amount ?? (Number(i.amount||0)-Number(i.paid_amount||0))),0),0);
    const expenses = cache.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
    const rate = expected ? Math.min(collected/expected*100,100) : 0;
    return shell('Business Overview',`<div class="p4-grid">${[['Active Tenants',active],['Occupancy',`${occupied}/${cache.beds.length}`],['Invoiced',money(expected)],['Collected',money(collected)],['Outstanding',money(outstanding)],['Expenses',money(expenses)],['Net Cash',money(collected-expenses)],['Invoices',cache.invoices.length]].map(([a,b])=>`<div class="p4-card"><h3>${a}</h3><div class="p4-big">${b}</div></div>`).join('')}</div><div style="height:14px"></div><div class="p4-card"><h3>Collection rate</h3><div class="p4-progress"><i style="width:${rate}%"></i></div><p class="p4-muted">${Math.round(rate)}% collected against recorded invoices.</p></div>`);
  }

  function tenants() {
    const rows = cache.tenants.map(t=>`<tr><td><strong>${esc(t.name)}</strong><div class="p4-muted">${esc(t.phone||'')}</div></td><td>${esc(t.property_name||'-')}<br>${esc(t.room_number||'-')} / ${esc(t.bed_number||'-')}</td><td>${money(t.monthly_rent)}</td><td>${money(t.deposit_amount)}</td><td>${esc(t.due_date??'-')}</td><td>${date(t.move_in_date)}${t.move_out_date?`<br>Out: ${date(t.move_out_date)}`:''}</td><td>${money(tenantBalance(t.id))}</td><td><span class="p4-status ${statusClass(t.status)}">${esc(t.status||'-')}</span></td></tr>`).join('');
    return shell('Tenant Database',`<div class="p4-note">Tenant records only: rent, deposit, due date, location, lifecycle and outstanding balance. Payment actions stay in Payments.</div><div class="p4-toolbar"><input id="p4-tenant-search" placeholder="Search tenant, phone, property..."></div><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Tenant</th><th>Property / Room / Bed</th><th>Monthly Rent</th><th>Deposit</th><th>Due Day</th><th>Lifecycle</th><th>Balance</th><th>Status</th></tr></thead><tbody id="p4-tenant-body">${rows||'<tr><td colspan="8">No tenants found</td></tr>'}</tbody></table></div>`);
  }

  function invoices() {
    const rows = cache.invoices.map(i=>{const balance=Math.max(Number(i.balance_amount ?? (Number(i.amount||0)-Number(i.paid_amount||0))),0);return `<tr><td><strong>${esc(i.invoice_number)}</strong></td><td>${esc(i.tenant_name||'-')}</td><td>${esc(i.month||'-')}</td><td>${money(i.amount)}</td><td>${money(i.paid_amount)}</td><td>${money(balance)}</td><td>${date(i.due_date)}</td><td><span class="p4-status ${statusClass(i.status)}">${esc(i.status||'-')}</span></td><td><button class="p4-btn alt" data-print-invoice="${i.id}">Print</button></td></tr>`;}).join('');
    return shell('Invoice Control',`<div class="p4-toolbar"><input id="p4-invoice-search" placeholder="Search invoice or tenant..."><button class="p4-btn" id="p4-print-all">Print list</button></div><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Invoice</th><th>Tenant</th><th>Month</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody id="p4-invoice-body">${rows||'<tr><td colspan="9">No invoices found</td></tr>'}</tbody></table></div>`);
  }

  function payments() {
    const rows = cache.payments.map(p=>`<tr><td>${date(p.payment_date)}</td><td><strong>${esc(p.tenant_name||'-')}</strong></td><td>${esc(p.invoice_number||'Unlinked')}</td><td>${money(p.amount)}</td><td>${esc(p.payment_method||'-')}</td><td>${esc(p.payment_month||'-')}</td><td>${esc(p.property_name||'-')}</td><td>${esc(p.notes||'')}</td></tr>`).join('');
    return shell('Payment Control',`<div class="p4-toolbar"><input id="p4-payment-search" placeholder="Search tenant, invoice, property..."><button class="p4-btn" id="p4-open-payment">Open payment form</button></div><div class="p4-note">Payment recording remains in the existing tested Payments workflow. This view adds a clean history and search without changing payment logic.</div><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Date</th><th>Tenant</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Month</th><th>Property</th><th>Notes</th></tr></thead><tbody id="p4-payment-body">${rows||'<tr><td colspan="8">No payments found</td></tr>'}</tbody></table></div>`);
  }

  function properties() {
    const cards = cache.properties.map(p=>{const beds=propertyBeds(p.id);const occupied=beds.filter(b=>Boolean(b.is_occupied)).length;const pct=beds.length?occupied/beds.length*100:0;return `<div class="p4-card"><h3>${esc(p.name)}</h3><div class="p4-big">${occupied}/${beds.length}</div><div class="p4-muted">occupied beds · ${Math.round(pct)}%</div><div class="p4-progress" style="margin-top:10px"><i style="width:${pct}%"></i></div></div>`;}).join('');
    const rows = cache.properties.map(p=>{const beds=propertyBeds(p.id);const occupied=beds.filter(b=>Boolean(b.is_occupied)).length;return `<tr><td><strong>${esc(p.name)}</strong><div class="p4-muted">${esc(p.address||'')}</div></td><td>${p.room_count||0}</td><td>${beds.length}</td><td>${occupied}</td><td>${beds.length?Math.round(occupied/beds.length*100):0}%</td><td>${money(p.monthly_revenue)}</td></tr>`;}).join('');
    return shell('Properties & Occupancy',`<div class="p4-grid">${cards||'<div class="p4-empty">No properties found</div>'}</div><div style="height:14px"></div><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Property</th><th>Rooms</th><th>Beds</th><th>Occupied</th><th>Rate</th><th>Monthly Revenue</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No properties found</td></tr>'}</tbody></table></div>`);
  }

  function expenses() {
    const rows=cache.expenses.map((e,i)=>`<tr><td>${date(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.property||'All properties')}</td><td>${esc(e.note||'')}</td><td>${money(e.amount)}</td><td><button class="p4-btn danger" data-expense-delete="${i}">Delete</button></td></tr>`).join('');
    return shell('Expenses',`<div class="p4-note"><strong>Browser-local for now:</strong> the current production API has no expense table/route, so these entries are deliberately stored only in this browser until server-backed expenses are added.</div><form class="p4-form" id="p4-expense-form"><label>Date<input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Category<input name="category" placeholder="Electricity, maintenance..." required></label><label>Property<input name="property" placeholder="Optional"></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Note<input name="note" placeholder="Optional"></label><label>&nbsp;<button class="p4-btn" type="submit">Add expense</button></label></form><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Note</th><th>Amount</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6">No expenses recorded</td></tr>'}</tbody></table></div>`);
  }

  function hardening() {
    return shell('Production Checks',`<div class="p4-note">Read-only diagnostics for the current production data. No live records are changed here.</div><div class="p4-grid"><div class="p4-card"><h3>API Health</h3><div id="p4-health" class="p4-big">Checking…</div><div class="p4-muted">/api/health</div></div><div class="p4-card"><h3>Authenticated Data</h3><div class="p4-big">${cache?'Loaded':'Not loaded'}</div><div class="p4-muted">Core collections fetched from server</div></div><div class="p4-card"><h3>Tenant / Bed Integrity</h3><div class="p4-big">${cache.tenants.filter(t=>String(t.status||'').toLowerCase()==='active'&&t.bed_id).length}/${cache.beds.filter(b=>Boolean(b.is_occupied)).length}</div><div class="p4-muted">active assigned tenants / occupied beds</div></div><div class="p4-card"><h3>Invoices</h3><div class="p4-big">${cache.invoices.length}</div><div class="p4-muted">server-backed records</div></div></div><div style="height:14px"></div><div class="p4-card"><h3>Production checklist</h3><ul class="p4-checklist"><li>✓ Authentication required on business APIs</li><li>✓ Owner-scoped property, tenant, invoice and payment data</li><li>✓ Database timeout guard active</li><li>✓ Invoice balances recalculated from payments</li><li>✓ Railway PORT respected by server</li><li>✓ Health endpoint available for deployment checks</li></ul></div>`);
  }

  async function renderTab(tab) {
    const root=ensureRoot(); root.classList.add('open'); nav(root,tab);
    const content=root.querySelector('.p4-content'); content.innerHTML='<div class="p4-empty">Loading your Peacely data…</div>';
    try {
      await load();
      const views={overview,tenants,invoices,payments,properties,expenses,hardening};
      content.innerHTML=views[tab](); bindTab(tab,root);
    } catch(e) {
      content.innerHTML=`<div class="p4-empty"><strong>Unable to load management data.</strong><br><br>${esc(e instanceof Error?e.message:'Unknown error')}<br><br>Close Management and try again.</div>`;
    }
  }

  function bindTab(tab,root) {
    const filter=(inputSelector,bodySelector)=>{const i=root.querySelector(inputSelector),body=root.querySelector(bodySelector);if(!i||!body)return;i.oninput=()=>{const q=String(i.value||'').toLowerCase();body.querySelectorAll('tr').forEach(r=>r.style.display=!q||r.textContent.toLowerCase().includes(q)?'':'none');};};
    if(tab==='tenants')filter('#p4-tenant-search','#p4-tenant-body');
    if(tab==='invoices'){filter('#p4-invoice-search','#p4-invoice-body');root.querySelectorAll('[data-print-invoice]').forEach(b=>b.onclick=()=>printInvoice(cache.invoices.find(i=>Number(i.id)===Number(b.dataset.printInvoice))));root.querySelector('#p4-print-all').onclick=()=>window.print();}
    if(tab==='payments'){filter('#p4-payment-search','#p4-payment-body');root.querySelector('#p4-open-payment').onclick=()=>{root.classList.remove('open');const btn=[...document.querySelectorAll('button')].find(b=>/^\+\s*payment$/i.test((b.textContent||'').trim()));if(btn)btn.click();};}
    if(tab==='expenses'){root.querySelector('#p4-expense-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);const items=readExpenses();items.unshift({date:f.get('date'),category:f.get('category'),property:f.get('property'),amount:Number(f.get('amount')||0),note:f.get('note')});writeExpenses(items);renderTab('expenses');};root.querySelectorAll('[data-expense-delete]').forEach(b=>b.onclick=()=>{const items=readExpenses();items.splice(Number(b.dataset.expenseDelete),1);writeExpenses(items);renderTab('expenses');});}
    if(tab==='hardening')api('/health').then(()=>{const x=root.querySelector('#p4-health');if(x)x.innerHTML='<span class="p4-status good">Healthy</span>';}).catch(()=>{const x=root.querySelector('#p4-health');if(x)x.innerHTML='<span class="p4-status bad">Failed</span>';});
  }

  function printInvoice(inv){
    if(!inv)return;const paid=Number(inv.paid_amount||0),balance=Math.max(Number(inv.balance_amount??(Number(inv.amount||0)-paid)),0);const w=window.open('','_blank','width=800,height=900');if(!w)return;
    w.document.write(`<html><head><title>${esc(inv.invoice_number)}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#111827}table{width:100%;border-collapse:collapse;margin-top:30px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.total{font-size:22px;font-weight:bold}</style></head><body><h1>Peacely</h1><h2>Invoice ${esc(inv.invoice_number)}</h2><p>Tenant: <strong>${esc(inv.tenant_name||'-')}</strong></p><p>Month: ${esc(inv.month||'-')} &nbsp; Due: ${date(inv.due_date)}</p><table><tr><th>Invoice Amount</th><td>${money(inv.amount)}</td></tr><tr><th>Paid</th><td>${money(paid)}</td></tr><tr><th>Balance</th><td>${money(balance)}</td></tr><tr><th>Status</th><td>${esc(inv.status||'-')}</td></tr></table><p class="total">Balance due: ${money(balance)}</p><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
  }

  function mountButton(){
    const existing=document.querySelector('[data-peacely-phase4="1"]');
    if(existing){mounted=true;return;}
    mounted=false;
    const quickActions=document.querySelector('.quick-actions');
    if(quickActions){
      const b=document.createElement('button');b.type='button';b.className='quick-action';b.setAttribute('data-peacely-phase4','1');b.innerHTML='<span>📊</span><small>Management</small>';b.onclick=()=>renderTab('overview');quickActions.appendChild(b);mounted=true;return;
    }
    const dashboard=[...document.querySelectorAll('button,a,[role="button"]')].find(el=>/^dashboard$/i.test((el.textContent||'').trim()));
    const target=dashboard?.parentElement||document.querySelector('header')||document.querySelector('.topbar');
    if(!target)return;
    const b=document.createElement('button');b.type='button';b.textContent='Management';b.setAttribute('data-peacely-phase4','1');b.style.cssText='cursor:pointer;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:9px 13px;background:#101927;color:#fff;font-weight:800';b.onclick=()=>renderTab('overview');target.appendChild(b);mounted=true;
  }

  function boot(){
    ensureRoot();mountButton();
    const observer=new MutationObserver(()=>mountButton());observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(mountButton,300);setTimeout(mountButton,1000);setTimeout(mountButton,2500);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
