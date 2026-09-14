(() => {
  'use strict';

  const API = '/api';
  const EXPENSE_KEY = 'peacely_phase4_expenses_v1';
  let mounted = false;
  let cache = null;

  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const date = (v) => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
  const monthKey = (v) => String(v || '').toLowerCase().trim();

  async function api(path, options) {
    const r = await fetch(`${API}${path}`, { credentials:'include', headers:{'Content-Type':'application/json'}, ...(options || {}) });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    return d;
  }

  function readExpenses() {
    try { return JSON.parse(localStorage.getItem(EXPENSE_KEY) || '[]'); } catch { return []; }
  }
  function writeExpenses(items) { localStorage.setItem(EXPENSE_KEY, JSON.stringify(items)); }

  async function load() {
    const [properties, rooms, beds, tenants, payments, invoices] = await Promise.all([
      api('/properties'), api('/rooms'), api('/beds'), api('/tenants'), api('/payments'), api('/invoices')
    ]);
    cache = {
      properties: properties?.properties || [], rooms: rooms?.rooms || [], beds: beds?.beds || [],
      tenants: tenants?.tenants || [], payments: payments?.payments || [], invoices: invoices?.invoices || [],
      expenses: readExpenses()
    };
    return cache;
  }

  function currentMonth() {
    return new Date().toLocaleString('en-IN', {month:'long', year:'numeric'});
  }

  function injectStyle() {
    if (document.getElementById('peacely-phase4-style')) return;
    const s = document.createElement('style');
    s.id = 'peacely-phase4-style';
    s.textContent = `
      #peacely-phase4-root{position:fixed;inset:0;z-index:99999;display:none;background:rgba(2,6,23,.72);backdrop-filter:blur(8px);font-family:inherit}
      #peacely-phase4-root.open{display:block}
      .p4-shell{position:absolute;inset:3vh 3vw;background:#f8fafc;color:#0f172a;border-radius:22px;overflow:hidden;box-shadow:0 25px 80px rgba(0,0,0,.35);display:flex;flex-direction:column}
      .p4-head{display:flex;align-items:center;justify-content:space-between;padding:18px 22px;background:#0f172a;color:white}
      .p4-head h2{margin:0;font-size:20px}.p4-head small{opacity:.7}.p4-close{border:0;background:rgba(255,255,255,.12);color:white;border-radius:10px;padding:9px 13px;font-size:20px;cursor:pointer}
      .p4-body{display:flex;min-height:0;flex:1}.p4-nav{width:190px;background:white;border-right:1px solid #e2e8f0;padding:12px;overflow:auto}.p4-nav button{display:block;width:100%;border:0;background:transparent;text-align:left;padding:11px 12px;border-radius:10px;margin-bottom:4px;cursor:pointer;color:#334155}.p4-nav button.active,.p4-nav button:hover{background:#e2e8f0;color:#0f172a;font-weight:700}
      .p4-content{padding:22px;overflow:auto;flex:1}.p4-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}.p4-card{background:white;border:1px solid #e2e8f0;border-radius:15px;padding:15px;box-shadow:0 4px 16px rgba(15,23,42,.04)}.p4-card h3{margin:0 0 7px;font-size:13px;color:#64748b}.p4-big{font-size:22px;font-weight:800}.p4-muted{color:#64748b;font-size:13px}.p4-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.p4-toolbar input,.p4-toolbar select,.p4-form input,.p4-form select{border:1px solid #cbd5e1;border-radius:9px;padding:9px 10px;background:white}.p4-btn{border:0;border-radius:9px;padding:9px 13px;cursor:pointer;background:#0f172a;color:white;font-weight:700}.p4-btn.alt{background:#e2e8f0;color:#0f172a}.p4-btn.danger{background:#991b1b}.p4-table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden}.p4-table th,.p4-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;font-size:13px;vertical-align:top}.p4-table th{background:#f1f5f9;color:#475569}.p4-status{display:inline-block;padding:4px 8px;border-radius:999px;background:#e2e8f0;font-size:11px;font-weight:700}.p4-status.good{background:#dcfce7;color:#166534}.p4-status.warn{background:#fef3c7;color:#92400e}.p4-status.bad{background:#fee2e2;color:#991b1b}.p4-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:14px}.p4-form label{font-size:12px;color:#475569;display:flex;flex-direction:column;gap:5px}.p4-note{padding:11px;border-radius:10px;background:#eff6ff;color:#1e3a8a;font-size:12px;margin-bottom:14px}.p4-empty{padding:25px;text-align:center;color:#64748b;background:white;border:1px dashed #cbd5e1;border-radius:12px}.p4-print{background:white;padding:30px;max-width:760px;margin:auto}.p4-print h1{margin-top:0}.p4-progress{height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden}.p4-progress i{display:block;height:100%;background:#0f172a}
      @media(max-width:700px){.p4-shell{inset:0;border-radius:0}.p4-nav{width:105px}.p4-content{padding:12px}.p4-head{padding:13px}.p4-table{font-size:11px}.p4-table th,.p4-table td{padding:7px}.p4-nav button{font-size:11px;padding:9px 7px}}
    `;
    document.head.appendChild(s);
  }

  function ensureRoot() {
    injectStyle();
    let root = document.getElementById('peacely-phase4-root');
    if (!root) {
      root = document.createElement('div'); root.id = 'peacely-phase4-root'; document.body.appendChild(root);
      root.innerHTML = `<div class="p4-shell"><div class="p4-head"><div><h2>Peacely Management Center</h2><small>Phase 4 · Operations, finance & production controls</small></div><button class="p4-close" aria-label="Close">×</button></div><div class="p4-body"><aside class="p4-nav"></aside><main class="p4-content"></main></div></div>`;
      root.querySelector('.p4-close').onclick = () => root.classList.remove('open');
      root.addEventListener('click', (e) => { if (e.target === root) root.classList.remove('open'); });
    }
    return root;
  }

  function nav(root, active) {
    const items = [['overview','Overview'],['tenants','Tenant Database'],['invoices','Invoices'],['payments','Payments'],['properties','Properties & Occupancy'],['expenses','Expenses'],['hardening','Production Checks']];
    root.querySelector('.p4-nav').innerHTML = items.map(([k,l]) => `<button data-p4-tab="${k}" class="${active===k?'active':''}">${l}</button>`).join('');
    root.querySelectorAll('[data-p4-tab]').forEach(b => b.onclick = () => renderTab(b.dataset.p4Tab));
  }

  function shell(title, body) { return `<h1 style="margin-top:0">${title}</h1>${body}`; }

  function overview() {
    const d = cache; const active = d.tenants.filter(t => String(t.status).toLowerCase()==='active');
    const occupied = d.beds.filter(b => b.is_occupied).length; const totalBeds = d.beds.length;
    const expected = d.invoices.reduce((s,i)=>s+Number(i.amount||0),0); const collected = d.payments.reduce((s,p)=>s+Number(p.amount||0),0);
    const outstanding = Math.max(expected-collected,0); const expenses = d.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
    const net = collected-expenses;
    return shell('Business Overview', `<div class="p4-grid">
      ${[['Active Tenants',active.length],['Occupancy',`${occupied}/${totalBeds}`],['Invoiced',money(expected)],['Collected',money(collected)],['Outstanding',money(outstanding)],['Expenses',money(expenses)],['Net Cash',money(net)],['Invoices',d.invoices.length]].map(x=>`<div class="p4-card"><h3>${x[0]}</h3><div class="p4-big">${x[1]}</div></div>`).join('')}
    </div><div style="height:14px"></div><div class="p4-card"><h3>Collection rate</h3><div class="p4-progress"><i style="width:${expected?Math.min(collected/expected*100,100):0}%"></i></div><p class="p4-muted">${expected?Math.round(collected/expected*100):0}% collected against recorded invoices. Net cash is collections minus recorded expenses.</p></div>`);
  }

  function tenants() {
    const rows = cache.tenants.map(t => {
      const inv = cache.invoices.filter(i=>Number(i.tenant_id)===Number(t.id)); const paid = cache.payments.filter(p=>Number(p.tenant_id)===Number(t.id)).reduce((s,p)=>s+Number(p.amount||0),0); const invoiced=inv.reduce((s,i)=>s+Number(i.amount||0),0);
      return `<tr><td><strong>${esc(t.name)}</strong><div class="p4-muted">${esc(t.phone||'')}</div></td><td>${esc(t.property_name||'-')}<br>${esc(t.room_number||'-')} / ${esc(t.bed_number||'-')}</td><td>${money(t.monthly_rent)}</td><td>${money(t.deposit_amount)}</td><td>${t.due_date||'-'}</td><td>${date(t.move_in_date)}${t.move_out_date?`<br>Out: ${date(t.move_out_date)}`:''}</td><td>${money(invoiced-paid)}</td><td><span class="p4-status ${String(t.status).toLowerCase()==='active'?'good':''}">${esc(t.status)}</span></td></tr>`;
    }).join('');
    return shell('Tenant Database', `<div class="p4-note">This is the operational tenant register: rent, deposit, due date, location, lifecycle and outstanding balance. Payment actions remain in Payments.</div><div class="p4-toolbar"><input id="p4-tenant-search" placeholder="Search tenant, phone, property..."></div><div style="overflow:auto"><table class="p4-table"><thead><tr><th>Tenant</th><th>Property / Room / Bed</th><th>Monthly Rent</th><th>Deposit</th><th>Due Day</th><th>Lifecycle</th><th>Balance</th><th>Status</th></tr></thead><tbody id="p4-tenant-body">${rows||'<tr><td colspan="8">No tenants</td></tr>'}</tbody></table></div>`);
  }

  function invoices() {
    const rows = cache.invoices.map(i => { const bal=Math.max(Number(i.amount||0)-Number(i.paid_amount||0),0); const cls=String(i.status).toLowerCase()==='paid'?'good':String(i.status).toLowerCase().includes('overdue')?'bad':'warn'; return `<tr><td>${esc(i.invoice_number)}</td><td>${esc(i.tenant_name||'-')}</td><td>${esc(i.month||'-')}</td><td>${money(i.amount)}</td><td>${money(i.paid_amount)}</td><td>${money(bal)}</td><td>${date(i.due_date)}</td><td><span class="p4-status ${cls}">${esc(i.status)}</span></td><td><button class="p4-btn alt" data-print-invoice="${i.id}">Print</button></td></tr>`; }).join('');
    return shell('Invoice Control', `<div class="p4-toolbar"><input id="p4-invoice-search" placeholder="Search invoice or tenant..."><button class="p4-btn" id="p4-print-all">Print list</button></div><div style="overflow:auto"><table class="p4-table"><thead><tr><th>Invoice</th><th>Tenant</th><th>Month</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody id="p4-invoice-body">${rows||'<tr><td colspan="9">No invoices</td></tr>'}</tbody></table></div>`);
  }

  function payments() {
    const rows = cache.payments.map(p=>`<tr><td>${date(p.payment_date)}</td><td>${esc(p.tenant_name||'-')}</td><td>${esc(p.invoice_number||'Unlinked')}</td><td>${money(p.amount)}</td><td>${esc(p.payment_method||'-')}</td><td>${esc(p.payment_month||'-')}</td><td>${esc(p.property_name||'-')}</td><td>${esc(p.notes||'')}</td></tr>`).join('');
    return shell('Payment Control', `<div class="p4-toolbar"><input id="p4-payment-search" placeholder="Search tenant, invoice, property..."><button class="p4-btn" id="p4-open-payment">Open payment form</button></div><div class="p4-note">Payment recording remains in the existing Payments workflow, preserving the tested pending → partial → paid behaviour. This view adds history, search and receipt printing.</div><div style="overflow:auto"><table class="p4-table"><thead><tr><th>Date</th><th>Tenant</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Month</th><th>Property</th><th>Notes</th></tr></thead><tbody id="p4-payment-body">${rows||'<tr><td colspan="8">No payments</td></tr>'}</tbody></table></div>`);
  }

  function properties() {
    const rows = cache.properties.map(p=>{const beds=cache.beds.filter(b=>Number(b.property_id)===Number(p.id));const occ=beds.filter(b=>b.is_occupied).length;const rate=beds.length?Math.round(occ/beds.length*100):0;return `<tr><td><strong>${esc(p.name)}</strong><div class="p4-muted">${esc(p.address||'')}</div></td><td>${p.room_count||0}</td><td>${beds.length}</td><td>${occ}</td><td>${rate}%</td><td>${money(p.monthly_revenue)}</td></tr>`;}).join('');
    return shell('Properties & Occupancy', `<div class="p4-grid">${cache.properties.map(p=>{const beds=cache.beds.filter(b=>Number(b.property_id)===Number(p.id));const occ=beds.filter(b=>b.is_occupied).length;return `<div class="p4-card"><h3>${esc(p.name)}</h3><div class="p4-big">${occ}/${beds.length}</div><div class="p4-muted">occupied beds</div><div class="p4-progress" style="margin-top:10px"><i style="width:${beds.length?occ/beds.length*100:0}%"></i></div></div>`}).join('')}</div><div style="height:14px"></div><div style="overflow:auto"><table class="p4-table"><thead><tr><th>Property</th><th>Rooms</th><th>Beds</th><th>Occupied</th><th>Rate</th><th>Monthly Revenue</th></tr></thead><tbody>${rows||'<tr><td colspan="6">No properties</td></tr>'}</tbody></table></div>`);
  }

  function expenses() {
    const rows=cache.expenses.map((e,i)=>`<tr><td>${date(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.property||'All properties')}</td><td>${esc(e.note||'')}</td><td>${money(e.amount)}</td><td><button class="p4-btn danger" data-expense-delete="${i}">Delete</button></td></tr>`).join('');
    return shell('Expenses', `<div class="p4-note"><strong>Expense tracking:</strong> this first release stores expenses in this browser's local storage because the current production API has no expense table/route yet. It is intentionally labelled so it is not mistaken for server-backed accounting.</div><form class="p4-form" id="p4-expense-form"><label>Date<input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></label><label>Category<input name="category" placeholder="Electricity, maintenance..." required></label><label>Property<input name="property" placeholder="Optional"></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Note<input name="note" placeholder="Optional"></label><label>&nbsp;<button class="p4-btn" type="submit">Add expense</button></label></form><div style="overflow:auto"><table class="p4-table"><thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Note</th><th>Amount</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6">No expenses recorded</td></tr>'}</tbody></table></div>`);
  }

  function hardening() {
    return shell('Production Checks', `<div class="p4-note">These checks are read-only diagnostics. They do not change your live data.</div><div class="p4-grid"><div class="p4-card"><h3>API Health</h3><div id="p4-health" class="p4-big">Checking…</div><div class="p4-muted">/api/health</div></div><div class="p4-card"><h3>Authenticated data</h3><div class="p4-big">${cache?'Loaded':'Not loaded'}</div><div class="p4-muted">Six core collections available</div></div><div class="p4-card"><h3>Tenant / Bed integrity</h3><div class="p4-big">${cache.tenants.filter(t=>t.status==='Active' && t.bed_id).length}/${cache.beds.filter(b=>b.is_occupied).length}</div><div class="p4-muted">active assigned tenants / occupied beds</div></div><div class="p4-card"><h3>Invoices</h3><div class="p4-big">${cache.invoices.length}</div><div class="p4-muted">server-backed records</div></div></div><div style="height:14px"></div><div class="p4-card"><h3>Hardening checklist</h3><ul><li>Authentication required on business APIs</li><li>Owner-scoped property, tenant, invoice and payment queries</li><li>Database timeout guard is active</li><li>Invoice balances are recalculated from payments</li><li>Railway PORT is respected by the server</li><li>Health endpoint exists for deployment checks</li></ul></div>`);
  }

  async function renderTab(tab) {
    const root=ensureRoot(); root.classList.add('open'); nav(root,tab);
    const content=root.querySelector('.p4-content');
    if (!cache) { content.innerHTML='<div class="p4-empty">Loading management data…</div>'; try { await load(); } catch(e){ content.innerHTML=`<div class="p4-empty">Unable to load: ${esc(e.message)}</div>`; return; } }
    const views={overview,tenants,invoices,payments,properties,expenses,hardening}; content.innerHTML=views[tab](); bindTab(tab,root);
  }

  function bindTab(tab,root) {
    if(tab==='tenants'){const i=root.querySelector('#p4-tenant-search'); const body=root.querySelector('#p4-tenant-body'); i.oninput=()=>{const q=i.value.toLowerCase();body.querySelectorAll('tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none')};}
    if(tab==='invoices'){const i=root.querySelector('#p4-invoice-search'); const body=root.querySelector('#p4-invoice-body'); i.oninput=()=>{const q=i.value.toLowerCase();body.querySelectorAll('tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none')}; root.querySelectorAll('[data-print-invoice]').forEach(b=>b.onclick=()=>printInvoice(cache.invoices.find(x=>Number(x.id)===Number(b.dataset.printInvoice)))); root.querySelector('#p4-print-all').onclick=()=>window.print();}
    if(tab==='payments'){const i=root.querySelector('#p4-payment-search'); const body=root.querySelector('#p4-payment-body'); i.oninput=()=>{const q=i.value.toLowerCase();body.querySelectorAll('tr').forEach(r=>r.style.display=r.textContent.toLowerCase().includes(q)?'':'none')}; root.querySelector('#p4-open-payment').onclick=()=>{root.classList.remove('open'); const btn=[...document.querySelectorAll('button')].find(b=>/\+\s*payment/i.test(b.textContent||'')); if(btn) btn.click();};}
    if(tab==='expenses'){root.querySelector('#p4-expense-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.currentTarget);const items=readExpenses();items.unshift({date:f.get('date'),category:f.get('category'),property:f.get('property'),amount:Number(f.get('amount')||0),note:f.get('note')});writeExpenses(items);cache.expenses=items;renderTab('expenses');};root.querySelectorAll('[data-expense-delete]').forEach(b=>b.onclick=()=>{const items=readExpenses();items.splice(Number(b.dataset.expenseDelete),1);writeExpenses(items);cache.expenses=items;renderTab('expenses');});}
    if(tab==='hardening'){api('/health').then(()=>{const x=root.querySelector('#p4-health');if(x)x.innerHTML='<span class="p4-status good">Healthy</span>';}).catch(()=>{const x=root.querySelector('#p4-health');if(x)x.innerHTML='<span class="p4-status bad">Failed</span>';});}
  }

  function printInvoice(inv){
    if(!inv)return; const paid=Number(inv.paid_amount||0),bal=Math.max(Number(inv.amount||0)-paid,0); const w=window.open('','_blank','width=800,height=900'); if(!w)return;
    w.document.write(`<html><head><title>${esc(inv.invoice_number)}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#111827}table{width:100%;border-collapse:collapse;margin-top:30px}td,th{padding:12px;border-bottom:1px solid #ddd;text-align:left}.total{font-size:22px;font-weight:bold}</style></head><body><h1>Peacely</h1><h2>Invoice ${esc(inv.invoice_number)}</h2><p>Tenant: <strong>${esc(inv.tenant_name||'-')}</strong></p><p>Month: ${esc(inv.month||'-')} &nbsp; Due: ${date(inv.due_date)}</p><table><tr><th>Invoice Amount</th><td>${money(inv.amount)}</td></tr><tr><th>Paid</th><td>${money(paid)}</td></tr><tr><th>Balance</th><td>${money(bal)}</td></tr><tr><th>Status</th><td>${esc(inv.status)}</td></tr></table><p class="total">Balance due: ${money(bal)}</p><script>window.onload=()=>window.print()<\/script></body></html>`); w.document.close();
  }

  function mountButton() {
    if (mounted) return;
    const candidates=[...document.querySelectorAll('button,a,[role="button"]')];
    const nav = candidates.find(el => /^dashboard$/i.test((el.textContent||'').trim()))?.parentElement;
    const target = nav || document.querySelector('header') || document.querySelector('.topbar') || document.body;
    if (!target) return;
    const b=document.createElement('button'); b.type='button'; b.textContent='Management'; b.setAttribute('data-peacely-phase4','1'); b.style.cssText='cursor:pointer'; b.onclick=()=>renderTab('overview');
    if (target === document.body) { b.style.cssText+=';position:fixed;right:14px;bottom:70px;z-index:9998;border:0;border-radius:10px;padding:10px 14px;background:#0f172a;color:#fff;font-weight:700'; }
    target.appendChild(b); mounted=true;
  }

  function boot(){
    ensureRoot(); mountButton();
    const observer=new MutationObserver(()=>{ if(!mounted) mountButton(); }); observer.observe(document.body,{childList:true,subtree:true});
    setTimeout(mountButton,500); setTimeout(mountButton,1500); setTimeout(mountButton,3000);
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();