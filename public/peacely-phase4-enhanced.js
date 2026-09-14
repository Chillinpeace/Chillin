(() => {
  'use strict';

  const API = '/api';
  const EXPENSE_KEY = 'peacely_phase4_expenses_v1';
  const state = { data: null, tab: 'overview', loading: false };

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const date = (v) => {
    if (!v) return '-';
    const d = new Date(`${String(v).slice(0,10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? esc(v) : d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'});
  };
  const norm = (v) => String(v || '').trim().toLowerCase();
  const collection = (payload, key) => Array.isArray(payload) ? payload : (Array.isArray(payload?.[key]) ? payload[key] : []);

  async function api(path, options = {}) {
    const r = await fetch(`${API}${path}`, { credentials:'include', ...options, headers:{'Content-Type':'application/json', ...(options.headers || {})} });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    return d;
  }

  async function loadData() {
    state.loading = true;
    const [properties, rooms, beds, tenants, payments, invoices, health] = await Promise.all([
      api('/properties'), api('/rooms'), api('/beds'), api('/tenants'), api('/payments'), api('/invoices'), api('/health').catch(() => ({success:false,status:'failed'}))
    ]);
    state.data = {
      properties: collection(properties,'properties'), rooms: collection(rooms,'rooms'), beds: collection(beds,'beds'),
      tenants: collection(tenants,'tenants'), payments: collection(payments,'payments'), invoices: collection(invoices,'invoices'),
      health, expenses: readExpenses()
    };
    state.loading = false;
    return state.data;
  }

  function readExpenses() {
    try { return JSON.parse(localStorage.getItem(EXPENSE_KEY) || '[]'); } catch { return []; }
  }
  function saveExpenses(items) { localStorage.setItem(EXPENSE_KEY, JSON.stringify(items)); }

  function tenantBalance(id) {
    return state.data.invoices.filter(i => Number(i.tenant_id) === Number(id)).reduce((s,i) => {
      const balance = Number(i.balance_amount ?? (Number(i.amount || 0) - Number(i.paid_amount || 0)));
      return s + Math.max(balance,0);
    },0);
  }

  function propertyRooms(id) { return state.data.rooms.filter(r => Number(r.property_id) === Number(id)); }
  function propertyBeds(id) {
    const rooms = propertyRooms(id);
    const ids = new Set(rooms.map(r => Number(r.id)));
    return state.data.beds.filter(b => ids.has(Number(b.room_id)) || Number(b.property_id) === Number(id));
  }

  function styles() {
    if (document.getElementById('p4e-style')) return;
    const s = document.createElement('style'); s.id='p4e-style';
    s.textContent = `
      #p4e-root{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.78);backdrop-filter:blur(8px);font-family:inherit;color:#eef2f7}
      .p4e-shell{position:absolute;inset:0;background:#071018;display:flex;flex-direction:column;overflow:hidden}
      .p4e-head{height:74px;flex:none;display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:#0b111c;border-bottom:1px solid rgba(255,255,255,.08)}
      .p4e-title{font-size:19px;font-weight:850}.p4e-sub{font-size:11px;color:#7f8b9d;margin-top:3px}.p4e-close{width:42px;height:42px;border:0;border-radius:12px;background:#172131;color:white;font-size:25px}
      .p4e-body{display:flex;min-height:0;flex:1}.p4e-nav{width:210px;flex:none;padding:12px;background:#09111b;border-right:1px solid rgba(255,255,255,.07);overflow:auto}.p4e-nav button{width:100%;border:0;background:transparent;color:#9aa6b8;text-align:left;border-radius:12px;padding:12px;margin-bottom:5px;font:inherit;font-size:12px;font-weight:750}.p4e-nav button.active{background:#102235;color:#fff}.p4e-main{flex:1;overflow:auto;padding:20px;background:radial-gradient(circle at top right,rgba(16,185,129,.08),transparent 35%),#071018}.p4e-main h1{font-size:28px;margin:0 0 17px;letter-spacing:-.5px}.p4e-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.p4e-card{background:#0d1722;border:1px solid rgba(255,255,255,.08);border-radius:17px;padding:15px}.p4e-label{font-size:11px;color:#8591a3;font-weight:750}.p4e-big{font-size:23px;font-weight:850;margin-top:6px}.p4e-muted{font-size:11px;color:#778396}.p4e-toolbar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:13px}.p4e-input,.p4e-select{background:#0e1723;color:#eef2f7;border:1px solid rgba(255,255,255,.1);border-radius:10px;padding:10px 11px;outline:none}.p4e-input{min-width:220px}.p4e-btn{border:0;border-radius:10px;padding:10px 13px;background:#10b981;color:#03150f;font-weight:850;cursor:pointer}.p4e-btn.alt{background:#172131;color:#dbe4ee}.p4e-btn.danger{background:#7f1d1d;color:white}.p4e-table-wrap{overflow:auto;border:1px solid rgba(255,255,255,.07);border-radius:14px}.p4e-table{width:100%;border-collapse:collapse;min-width:760px}.p4e-table th,.p4e-table td{padding:10px;border-bottom:1px solid rgba(255,255,255,.06);font-size:11px;text-align:left;vertical-align:top}.p4e-table th{background:#101a27;color:#8995a7}.p4e-pill{display:inline-block;border-radius:999px;padding:4px 8px;font-size:9px;font-weight:850;background:#202b3a}.p4e-good{color:#34d399;background:rgba(16,185,129,.12)}.p4e-warn{color:#fbbf24;background:rgba(245,158,11,.12)}.p4e-bad{color:#f87171;background:rgba(239,68,68,.12)}.p4e-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin-bottom:13px}.p4e-form label{font-size:10px;color:#8792a4;display:flex;flex-direction:column;gap:5px}.p4e-note{padding:11px;border-radius:12px;background:rgba(16,185,129,.07);border:1px solid rgba(16,185,129,.13);font-size:10px;color:#a7e9cf;margin-bottom:12px}.p4e-chart{display:flex;align-items:flex-end;gap:8px;height:170px;padding-top:12px}.p4e-bar{flex:1;min-width:20px;background:#10b981;border-radius:7px 7px 2px 2px;position:relative}.p4e-bar span{position:absolute;bottom:-19px;left:50%;transform:translateX(-50%);font-size:9px;color:#7f8b9c}.p4e-empty{text-align:center;padding:28px;color:#7f8b9c;border:1px dashed rgba(255,255,255,.1);border-radius:13px}.p4e-toast{position:fixed;right:18px;bottom:18px;background:#142132;color:#fff;border:1px solid rgba(255,255,255,.1);padding:11px 14px;border-radius:11px;z-index:100002;font-size:11px}
      @media(max-width:700px){.p4e-head{height:68px}.p4e-body{flex-direction:column}.p4e-nav{width:auto;height:55px;display:flex;gap:5px;overflow-x:auto;padding:7px;border-right:0;border-bottom:1px solid rgba(255,255,255,.07)}.p4e-nav button{width:auto;min-width:max-content;margin:0;padding:9px 11px;font-size:10px}.p4e-main{padding:14px}.p4e-main h1{font-size:24px}.p4e-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.p4e-input{min-width:0;width:100%}}
    `;
    document.head.appendChild(s);
  }

  function ensureRoot() {
    styles();
    let root = document.getElementById('p4e-root');
    if (root) return root;
    root=document.createElement('div');root.id='p4e-root';
    root.innerHTML='<div class="p4e-shell"><header class="p4e-head"><div><div class="p4e-title">Peacely Management Center</div><div class="p4e-sub">Unified operations, finance & production control</div></div><button class="p4e-close">×</button></header><div class="p4e-body"><aside class="p4e-nav"></aside><main class="p4e-main"></main></div></div>';
    document.body.appendChild(root);
    root.querySelector('.p4e-close').onclick=()=>root.remove();
    return root;
  }

  const tabs=[['overview','Overview'],['tenants','Tenant Database'],['invoices','Invoices'],['payments','Payments'],['properties','Properties & Occupancy'],['expenses','Expenses'],['monthly','Monthly Finance'],['checks','Production Checks']];

  function nav(root){
    root.querySelector('.p4e-nav').innerHTML=tabs.map(([k,l])=>`<button class="${state.tab===k?'active':''}" data-tab="${k}">${l}</button>`).join('');
    root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;render();});
  }
  function card(label,value,sub=''){return `<div class="p4e-card"><div class="p4e-label">${label}</div><div class="p4e-big">${value}</div>${sub?`<div class="p4e-muted">${sub}</div>`:''}</div>`;}
  function pill(v){const s=norm(v);const c=(s==='paid'||s==='active'||s==='healthy'||s==='ok')?'p4e-good':(s.includes('overdue')||s.includes('failed')||s==='inactive'?'p4e-bad':'p4e-warn');return `<span class="p4e-pill ${c}">${esc(v||'-')}</span>`;}

  function overview(){
    const d=state.data, active=d.tenants.filter(t=>norm(t.status)==='active').length, occ=d.beds.filter(b=>Boolean(b.is_occupied)).length;
    const invoiced=d.invoices.reduce((s,i)=>s+Number(i.amount||0),0), collected=d.invoices.reduce((s,i)=>s+Number(i.paid_amount||0),0), outstanding=d.invoices.reduce((s,i)=>s+Math.max(Number(i.balance_amount ?? (Number(i.amount||0)-Number(i.paid_amount||0))),0),0), expenses=d.expenses.reduce((s,e)=>s+Number(e.amount||0),0);
    const rate=invoiced?Math.min(collected/invoiced*100,100):0;
    return `<h1>Business Overview</h1><div class="p4e-grid">${card('Active Tenants',active)}${card('Occupancy',`${occ}/${d.beds.length}`)}${card('Invoiced',money(invoiced))}${card('Collected',money(collected))}${card('Outstanding',money(outstanding))}${card('Expenses',money(expenses))}${card('Net Cash',money(collected-expenses))}${card('Properties',d.properties.length)}</div><div style="height:12px"></div><div class="p4e-card"><div class="p4e-label">Collection Rate</div><div style="height:8px;background:#1b2634;border-radius:99px;margin-top:10px;overflow:hidden"><div style="height:100%;width:${rate}%;background:#10b981;border-radius:99px"></div></div><div class="p4e-muted" style="margin-top:8px">${Math.round(rate)}% collected against recorded invoices.</div></div>`;
  }

  function tenants(){
    const rows=state.data.tenants.map(t=>`<tr><td><strong>${esc(t.name)}</strong><div class="p4e-muted">${esc(t.phone||'')}</div></td><td>${esc(t.property_name||'-')}<br>${esc(t.room_number||'-')} / ${esc(t.bed_number||'-')}</td><td>${money(t.monthly_rent)}</td><td>${money(t.deposit_amount)}</td><td>${esc(t.due_date??'-')}</td><td>${date(t.move_in_date)}${t.move_out_date?`<br>Out: ${date(t.move_out_date)}`:''}</td><td>${money(tenantBalance(t.id))}</td><td>${pill(t.status)}</td></tr>`).join('');
    return `<h1>Tenant Database</h1><div class="p4e-note">Tenant master database: rent, deposit, due date, property, room, bed and lifecycle. Payment operations remain in Payments.</div><div class="p4e-toolbar"><input class="p4e-input" id="tenant-search" placeholder="Search tenant, phone, property..."></div><div class="p4e-table-wrap"><table class="p4e-table"><thead><tr><th>Tenant</th><th>Location</th><th>Monthly Rent</th><th>Deposit</th><th>Due Day</th><th>Move Dates</th><th>Balance</th><th>Status</th></tr></thead><tbody id="tenant-rows">${rows||'<tr><td colspan="8">No tenants</td></tr>'}</tbody></table></div>`;
  }

  function invoices(){
    const rows=state.data.invoices.map(i=>{const bal=Math.max(Number(i.balance_amount ?? (Number(i.amount||0)-Number(i.paid_amount||0))),0);return `<tr><td><strong>${esc(i.invoice_number)}</strong></td><td>${esc(i.tenant_name||'-')}</td><td>${esc(i.month||'-')}</td><td>${money(i.amount)}</td><td>${money(i.paid_amount)}</td><td>${money(bal)}</td><td>${date(i.due_date)}</td><td>${pill(i.status)}</td><td><button class="p4e-btn alt" data-print="${i.id}">Print</button></td></tr>`;}).join('');
    return `<h1>Invoice Control</h1><div class="p4e-toolbar"><input class="p4e-input" id="invoice-search" placeholder="Search invoice or tenant..."><button class="p4e-btn" id="print-invoices">Print List</button></div><div class="p4e-table-wrap"><table class="p4e-table"><thead><tr><th>Invoice</th><th>Tenant</th><th>Month</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody id="invoice-rows">${rows||'<tr><td colspan="9">No invoices</td></tr>'}</tbody></table></div>`;
  }

  function payments(){
    const rows=state.data.payments.map(p=>`<tr><td>${date(p.payment_date)}</td><td><strong>${esc(p.tenant_name||'-')}</strong></td><td>${esc(p.invoice_number||'Unlinked')}</td><td>${money(p.amount)}</td><td>${esc(p.payment_method||'-')}</td><td>${esc(p.payment_month||'-')}</td><td>${esc(p.property_name||'-')}</td><td>${esc(p.notes||'')}</td></tr>`).join('');
    return `<h1>Payment Control</h1><div class="p4e-toolbar"><input class="p4e-input" id="payment-search" placeholder="Search tenant, invoice, property..."><button class="p4e-btn" id="open-payment">+ Payment</button></div><div class="p4e-table-wrap"><table class="p4e-table"><thead><tr><th>Date</th><th>Tenant</th><th>Invoice</th><th>Amount</th><th>Method</th><th>Month</th><th>Property</th><th>Notes</th></tr></thead><tbody id="payment-rows">${rows||'<tr><td colspan="8">No payments</td></tr>'}</tbody></table></div>`;
  }

  function properties(){
    const rows=state.data.properties.map(p=>{const rooms=propertyRooms(p.id), beds=propertyBeds(p.id), occupied=beds.filter(b=>Boolean(b.is_occupied)).length, active=state.data.tenants.filter(t=>Number(t.property_id)===Number(p.id)&&norm(t.status)==='active').length, revenue=state.data.tenants.filter(t=>Number(t.property_id)===Number(p.id)&&norm(t.status)==='active').reduce((s,t)=>s+Number(t.monthly_rent||0),0), rate=beds.length?occupied/beds.length*100:0;return `<tr><td><strong>${esc(p.name)}</strong><div class="p4e-muted">${esc(p.address||'')}</div></td><td>${rooms.length}</td><td>${beds.length}</td><td>${occupied}</td><td>${Math.round(rate)}%</td><td>${active}</td><td>${money(revenue)}</td></tr>`;}).join('');
    return `<h1>Properties & Occupancy</h1><div class="p4e-grid">${state.data.properties.map(p=>{const b=propertyBeds(p.id),o=b.filter(x=>Boolean(x.is_occupied)).length,r=b.length?o/b.length*100:0;return `<div class="p4e-card"><div class="p4e-label">${esc(p.name)}</div><div class="p4e-big">${o}/${b.length}</div><div class="p4e-muted">${Math.round(r)}% occupied</div></div>`;}).join('')}</div><div style="height:13px"></div><div class="p4e-table-wrap"><table class="p4e-table"><thead><tr><th>Property</th><th>Rooms</th><th>Beds</th><th>Occupied</th><th>Occupancy</th><th>Active Tenants</th><th>Monthly Revenue</th></tr></thead><tbody>${rows||'<tr><td colspan="7">No properties</td></tr>'}</tbody></table></div>`;
  }

  function expenses(){
    const total=state.data.expenses.reduce((s,e)=>s+Number(e.amount||0),0), rows=state.data.expenses.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(e=>`<tr><td>${date(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.property||'-')}</td><td>${money(e.amount)}</td><td>${esc(e.note||'')}</td><td><button class="p4e-btn danger" data-delete-expense="${esc(e.id)}">Delete</button></td></tr>`).join('');
    return `<h1>Expenses</h1><div class="p4e-note">Expenses are recorded for Peacely financial reporting. Current deployment stores these entries in this browser until the server expense table is added; do not treat browser-only entries as backed-up financial records.</div><div class="p4e-grid">${card('Recorded Expenses',money(total))}${card('Expense Entries',state.data.expenses.length)}</div><div style="height:13px"></div><form class="p4e-form" id="expense-form"><label>Date<input class="p4e-input" type="date" name="date" required></label><label>Category<select class="p4e-select" name="category"><option>Maintenance</option><option>Electricity</option><option>Water</option><option>Internet</option><option>Staff</option><option>Supplies</option><option>Other</option></select></label><label>Property<select class="p4e-select" name="property"><option value="">All / General</option>${state.data.properties.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></label><label>Amount<input class="p4e-input" type="number" name="amount" min="0.01" step="0.01" required></label><label>Note<input class="p4e-input" name="note" placeholder="Optional note"></label><div style="display:flex;align-items:end"><button class="p4e-btn">Add Expense</button></div></form><div class="p4e-table-wrap"><table class="p4e-table"><thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody>${rows||'<tr><td colspan="6">No expenses</td></tr>'}</tbody></table></div>`;
  }

  function monthly(){
    const now=new Date(), months=[];
    for(let n=5;n>=0;n--){const d=new Date(now.getFullYear(),now.getMonth()-n,1),key=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label=d.toLocaleDateString('en-IN',{month:'short'});const inv=state.data.invoices.filter(i=>String(i.month||'').slice(0,7)===key||String(i.month||'').toLowerCase().includes(label.toLowerCase()));const pay=state.data.payments.filter(p=>String(p.payment_month||'').slice(0,7)===key||String(p.payment_date||'').slice(0,7)===key);const ex=state.data.expenses.filter(e=>String(e.date||'').slice(0,7)===key);months.push({key,label,inv:inv.reduce((s,i)=>s+Number(i.amount||0),0),paid:pay.reduce((s,p)=>s+Number(p.amount||0),0),exp:ex.reduce((s,e)=>s+Number(e.amount||0),0)});}
    const max=Math.max(...months.map(m=>Math.max(m.paid,m.inv,m.exp)),1), latest=months[months.length-1];
    return `<h1>Monthly Finance</h1><div class="p4e-grid">${card('Current Month Invoiced',money(latest.inv))}${card('Current Month Collected',money(latest.paid))}${card('Current Month Expenses',money(latest.exp))}${card('Current Month Net',money(latest.paid-latest.exp))}</div><div style="height:14px"></div><div class="p4e-card"><div class="p4e-label">Six Month Activity</div><div class="p4e-chart">${months.map(m=>`<div class="p4e-bar" style="height:${Math.max(4,Math.round(Math.max(m.paid,m.inv,m.exp)/max*135))}px" title="${m.label}: ${money(m.paid)} collected"><span>${m.label}</span></div>`).join('')}</div></div><div style="height:26px"></div><div class="p4e-table-wrap"><table class="p4e-table"><thead><tr><th>Month</th><th>Invoiced</th><th>Collected</th><th>Expenses</th><th>Net</th></tr></thead><tbody>${months.map(m=>`<tr><td>${m.label}</td><td>${money(m.inv)}</td><td>${money(m.paid)}</td><td>${money(m.exp)}</td><td>${money(m.paid-m.exp)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function checks(){
    const d=state.data, active=d.tenants.filter(t=>norm(t.status)==='active'), activeBeds=active.filter(t=>t.bed_id!=null).map(t=>Number(t.bed_id)), duplicateBeds=activeBeds.filter((x,i,a)=>a.indexOf(x)!==i), occupied=d.beds.filter(b=>Boolean(b.is_occupied)).length, assigned=new Set(activeBeds).size, healthOk=Boolean(d.health?.success&&norm(d.health?.status)==='ok');
    const checks=[['API health',healthOk?'Healthy':'Failed',healthOk],['Authenticated data',d.properties.length+d.tenants.length+d.invoices.length>=0?'Loaded':'Unavailable',true],['Active tenant bed assignments',duplicateBeds.length?'Duplicate active bed assignment':'No duplicate active bed assignment',!duplicateBeds.length],['Occupied bed reconciliation',occupied>=assigned?`Occupied ${occupied}, active assignments ${assigned}`:'Possible occupancy mismatch',occupied>=assigned],['Invoice records',`${d.invoices.length} recorded`,true],['Payment records',`${d.payments.length} recorded`,true]];
    return `<h1>Production Checks</h1><div class="p4e-note">Read-only production diagnostics. These checks use the same authenticated APIs as the Management Center.</div><div class="p4e-grid">${checks.map(c=>`<div class="p4e-card"><div class="p4e-label">${esc(c[0])}</div><div style="margin-top:9px">${pill(c[1])}</div></div>`).join('')}</div>`;
  }

  function render(){
    const root=ensureRoot();nav(root);const main=root.querySelector('.p4e-main');if(!state.data){main.innerHTML='<div class="p4e-empty">Loading Peacely data…</div>';return;}const views={overview,tenants,invoices,payments,properties,expenses,monthly,checks};main.innerHTML=views[state.tab]();bind();root.style.display='block';}

  function bind(){
    const root=document.getElementById('p4e-root'); if(!root)return;
    const filter=(inputId,bodyId,terms)=>{const input=root.querySelector('#'+inputId),body=root.querySelector('#'+bodyId);if(!input||!body)return;input.oninput=()=>{const q=norm(input.value);body.querySelectorAll('tr').forEach(r=>r.style.display=!q||terms(r).includes(q)?'':'none');};};
    filter('tenant-search','tenant-rows',r=>norm(r.textContent));filter('invoice-search','invoice-rows',r=>norm(r.textContent));filter('payment-search','payment-rows',r=>norm(r.textContent));
    root.querySelectorAll('[data-print]').forEach(b=>b.onclick=()=>{const i=state.data.invoices.find(x=>Number(x.id)===Number(b.dataset.print));if(!i)return;const w=window.open('','_blank','width=800,height=700');if(!w){toast('Allow pop-ups to print invoices');return;}w.document.write(`<html><head><title>${esc(i.invoice_number)}</title></head><body style="font-family:Arial;padding:40px"><h1>Peacely Invoice</h1><h2>${esc(i.invoice_number)}</h2><p>Tenant: ${esc(i.tenant_name||'-')}</p><p>Month: ${esc(i.month||'-')}</p><p>Amount: ${money(i.amount)}</p><p>Paid: ${money(i.paid_amount)}</p><p>Balance: ${money(Number(i.balance_amount ?? Number(i.amount||0)-Number(i.paid_amount||0)))}</p><p>Due: ${date(i.due_date)}</p><script>window.onload=()=>window.print();<\/script></body></html>`);w.document.close();});
    root.querySelector('#print-invoices')?.addEventListener('click',()=>window.print());
    root.querySelector('#open-payment')?.addEventListener('click',()=>{const btn=[...document.querySelectorAll('button')].find(b=>/^\+\s*payment$/i.test(b.textContent.trim()));if(btn)btn.click();else toast('Open Payments from the main navigation to record a payment.');});
    root.querySelector('#expense-form')?.addEventListener('submit',e=>{e.preventDefault();const f=new FormData(e.currentTarget),amount=Number(f.get('amount')||0);if(!amount||amount<0)return;const items=readExpenses();items.push({id:Date.now(),date:f.get('date'),category:f.get('category'),property:f.get('property'),amount,note:f.get('note')});saveExpenses(items);state.data.expenses=items;render();toast('Expense recorded');});
    root.querySelectorAll('[data-delete-expense]').forEach(b=>b.onclick=()=>{const items=readExpenses().filter(x=>String(x.id)!==String(b.dataset.deleteExpense));saveExpenses(items);state.data.expenses=items;render();toast('Expense deleted');});
  }

  function toast(message){const old=document.querySelector('.p4e-toast');if(old)old.remove();const t=document.createElement('div');t.className='p4e-toast';t.textContent=message;document.body.appendChild(t);setTimeout(()=>t.remove(),2400);}

  async function open(){
    try{await loadData();state.tab='overview';render();}catch(e){state.loading=false;const root=ensureRoot();root.style.display='block';root.querySelector('.p4e-main').innerHTML=`<div class="p4e-empty">Unable to load Management data.<br><small>${esc(e.message)}</small><br><br><button class="p4e-btn" id="p4e-retry">Retry</button></div>`;root.querySelector('#p4e-retry').onclick=open;}
  }

  function hookManagement(){
    const handler=(e)=>{const el=e.target.closest?.('button,a,[role="button"]');if(!el)return;if(/^management$/i.test(el.textContent.trim())){e.preventDefault();e.stopImmediatePropagation();open();}};
    document.addEventListener('click',handler,true);
  }

  hookManagement();
  window.addEventListener('peacely:refresh',()=>{if(document.getElementById('p4e-root')?.style.display==='block')open();});
})();
