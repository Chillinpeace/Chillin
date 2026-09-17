(() => {
  'use strict';

  if (window.__peacelyPhase6Booted) return;
  window.__peacelyPhase6Booted = true;

  const API = '/api';
  const TAB = 'phase6-financial';
  let rendering = false;

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const date = (v) => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
  const today = () => new Date().toISOString().slice(0,10);
  const yearStart = () => `${new Date().getFullYear()}-01-01`;

  async function api(path) {
    const r = await fetch(API + path, { credentials:'include' });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  }

  function parts() {
    const root = document.getElementById('peacely-phase4-root');
    if (!root) return null;
    const nav = root.querySelector('.p4-nav');
    const content = root.querySelector('.p4-content');
    return nav && content ? {root,nav,content} : null;
  }

  function style() {
    if (document.getElementById('p6-style')) return;
    const s = document.createElement('style');
    s.id = 'p6-style';
    s.textContent = `
      .p6-tab{display:block;width:100%;border:0;background:transparent;text-align:left;padding:12px;border-radius:13px;margin-bottom:5px;cursor:pointer;color:#9aa5b6;font:inherit;font-size:12px;font-weight:700}
      .p6-tab:hover,.p6-tab.active{background:#111c2a;color:#fff}
      .p6-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:14px}
      .p6-card{background:#0e1723;border:1px solid rgba(255,255,255,.08);border-radius:15px;padding:14px;margin-bottom:10px;overflow:hidden}
      .p6-label{color:#8e99aa;font-size:10px;margin-bottom:5px}.p6-value{font-size:22px;font-weight:850}.p6-muted{color:#8e99aa;font-size:11px}.p6-note{padding:11px;border-radius:12px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.15);color:#b9d5ff;margin-bottom:12px}.p6-error{padding:12px;border-radius:12px;background:#35151a;color:#fecaca;margin-bottom:12px}
      .p6-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:14px}.p6-toolbar label{color:#8e99aa;font-size:11px}.p6-input,.p6-select{box-sizing:border-box;width:100%;margin-top:6px;padding:9px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#0e1723;color:#fff;font:inherit}.p6-toolbar label{min-width:130px}.p6-btn{border:0;border-radius:10px;padding:9px 12px;background:#10b981;color:#04130d;font-weight:800;cursor:pointer}.p6-btn.alt{background:#172131;color:#dce3ec}.p6-table-wrap{overflow:auto}.p6-table{width:100%;border-collapse:collapse;font-size:11px}.p6-table th,.p6-table td{padding:9px 7px;text-align:left;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}.p6-table th{color:#8e99aa;font-weight:700}.p6-badge{display:inline-block;padding:4px 8px;border-radius:999px;background:#172131;color:#dce3ec;font-size:10px;font-weight:700}.p6-row{padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06)}.p6-row:last-child{border-bottom:0}
      @media(min-width:701px){.p6-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
    `;
    document.head.appendChild(s);
  }

  function activeTab(button) {
    const p = parts();
    if (!p) return;
    p.nav.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    button?.classList.add('active');
  }

  async function loadTenants() {
    const d = await api('/tenants');
    return Array.isArray(d) ? d : [];
  }

  async function renderFinancial() {
    const p = parts();
    if (!p || rendering) return;
    rendering = true;
    const {content:c} = p;
    const from = c.querySelector('#p6-from')?.value || yearStart();
    const to = c.querySelector('#p6-to')?.value || today();
    c.innerHTML = '<h1>Financial Intelligence</h1><div class="p6-note">Loading financial reports…</div>';
    try {
      const [financial, aging, properties, tenants] = await Promise.all([
        api(`/reports/financial?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api('/reports/aging'),
        api('/reports/property-profitability'),
        loadTenants()
      ]);
      const monthly = Array.isArray(financial?.monthly) ? financial.monthly : [];
      const categories = Array.isArray(financial?.categories) ? financial.categories : [];
      const items = Array.isArray(aging?.items) ? aging.items : [];
      const buckets = aging?.buckets || {};
      const propertyRows = Array.isArray(properties) ? properties : [];

      c.innerHTML = `
        <h1>Financial Intelligence</h1>
        <div class="p6-note">Advanced income, expense, cash-flow, profitability, outstanding-rent ageing and tenant financial history using the live Peacely records for your account.</div>
        <div class="p6-toolbar">
          <label>From<input id="p6-from" class="p6-input" type="date" value="${esc(from)}"></label>
          <label>To<input id="p6-to" class="p6-input" type="date" value="${esc(to)}"></label>
          <button class="p6-btn" id="p6-refresh">Refresh Report</button>
          <button class="p6-btn alt" id="p6-export">Export Financial PDF</button>
        </div>
        <div class="p6-grid">
          <div class="p6-card"><div class="p6-label">Invoiced</div><div class="p6-value">${money(financial?.invoiced)}</div><div class="p6-muted">Invoices due in range</div></div>
          <div class="p6-card"><div class="p6-label">Collected</div><div class="p6-value">${money(financial?.collected)}</div><div class="p6-muted">Recorded payments</div></div>
          <div class="p6-card"><div class="p6-label">Expenses</div><div class="p6-value">${money(financial?.expenses)}</div><div class="p6-muted">Recorded expenses</div></div>
          <div class="p6-card"><div class="p6-label">Net Cash</div><div class="p6-value">${money(financial?.net_cash)}</div><div class="p6-muted">Collected minus expenses</div></div>
          <div class="p6-card"><div class="p6-label">Outstanding</div><div class="p6-value">${money(financial?.outstanding)}</div><div class="p6-muted">Invoice balance in range</div></div>
          <div class="p6-card"><div class="p6-label">Payments</div><div class="p6-value">${Number(financial?.payment_count || 0)}</div><div class="p6-muted">Payment records</div></div>
          <div class="p6-card"><div class="p6-label">Expense Entries</div><div class="p6-value">${Number(financial?.expense_count || 0)}</div><div class="p6-muted">Expense records</div></div>
          <div class="p6-card"><div class="p6-label">Ageing Balance</div><div class="p6-value">${money(items.reduce((s,x)=>s+Number(x.balance||0),0))}</div><div class="p6-muted">Open invoice balances</div></div>
        </div>
        <div class="p6-card"><div class="p6-label">Outstanding Rent Ageing</div>
          <div class="p6-grid" style="margin-top:10px">
            <div><div class="p6-muted">Current</div><strong>${money(buckets.current)}</strong></div>
            <div><div class="p6-muted">1–30 Days</div><strong>${money(buckets['1_30'])}</strong></div>
            <div><div class="p6-muted">31–60 Days</div><strong>${money(buckets['31_60'])}</strong></div>
            <div><div class="p6-muted">61–90 Days</div><strong>${money(buckets['61_90'])}</strong></div>
          </div>
          <div><span class="p6-muted">90+ Days:</span> <strong>${money(buckets['90_plus'])}</strong></div>
          <div class="p6-table-wrap" style="margin-top:10px"><table class="p6-table"><thead><tr><th>Tenant</th><th>Property</th><th>Invoice</th><th>Due</th><th>Days</th><th>Balance</th></tr></thead><tbody>${items.length ? items.map(x=>`<tr><td>${esc(x.tenant_name)}</td><td>${esc(x.property_name)}</td><td>${esc(x.invoice_number)}</td><td>${date(x.due_date)}</td><td>${Number(x.days_overdue||0)}</td><td>${money(x.balance)}</td></tr>`).join('') : '<tr><td colspan="6">No outstanding invoice balances.</td></tr>'}</tbody></table></div>
        </div>
        <div class="p6-card"><div class="p6-label">Property Profitability</div><div class="p6-muted" style="margin-bottom:10px">Current active-tenant monthly rent less recorded property expenses.</div>
          <div class="p6-table-wrap"><table class="p6-table"><thead><tr><th>Property</th><th>Active Tenants</th><th>Occupancy</th><th>Monthly Rent</th><th>Expenses</th><th>Profit</th></tr></thead><tbody>${propertyRows.length ? propertyRows.map(x=>`<tr><td>${esc(x.name)}</td><td>${Number(x.active_tenants||0)}</td><td>${Number(x.occupied||0)}/${Number(x.beds||0)}</td><td>${money(x.income)}</td><td>${money(x.expenses)}</td><td>${money(x.profit)}</td></tr>`).join('') : '<tr><td colspan="6">No properties found.</td></tr>'}</tbody></table></div>
        </div>
        <div class="p6-card"><div class="p6-label">Monthly P&amp;L / Cash Flow</div><div class="p6-table-wrap"><table class="p6-table"><thead><tr><th>Month</th><th>Invoiced</th><th>Collected</th><th>Expenses</th><th>Net Cash</th></tr></thead><tbody>${monthly.length ? monthly.map(x=>`<tr><td>${esc(x.month)}</td><td>${money(x.invoiced)}</td><td>${money(x.collected)}</td><td>${money(x.expenses)}</td><td>${money(Number(x.collected||0)-Number(x.expenses||0))}</td></tr>`).join('') : '<tr><td colspan="5">No monthly data in this range.</td></tr>'}</tbody></table></div></div>
        <div class="p6-card"><div class="p6-label">Expense Analytics</div><div class="p6-table-wrap"><table class="p6-table"><thead><tr><th>Category</th><th>Entries</th><th>Amount</th></tr></thead><tbody>${categories.length ? categories.map(x=>`<tr><td>${esc(x.category||'Other')}</td><td>${Number(x.count||0)}</td><td>${money(x.amount)}</td></tr>`).join('') : '<tr><td colspan="3">No expenses in this range.</td></tr>'}</tbody></table></div></div>
        <div class="p6-card"><div class="p6-label">Tenant Financial History</div>
          <div class="p6-toolbar"><label style="flex:1;min-width:200px">Tenant<select id="p6-tenant" class="p6-select"><option value="">Select a tenant</option>${tenants.map(t=>`<option value="${Number(t.id)}">${esc(t.name)}${t.property_name?` — ${esc(t.property_name)}`:''}</option>`).join('')}</select></label></div>
          <div id="p6-tenant-history" class="p6-muted">Select a tenant to load invoices and payment history.</div>
        </div>`;

      c.querySelector('#p6-refresh').onclick = () => renderFinancial();
      c.querySelector('#p6-export').onclick = async () => {
        if (typeof window.peacelyExportFinancialPdf !== 'function') {
          alert('PDF export is still loading. Please refresh Peacely once and try again.');
          return;
        }
        await window.peacelyExportFinancialPdf();
      };
      c.querySelector('#p6-tenant').onchange = async (e) => {
        const box = c.querySelector('#p6-tenant-history');
        const id = Number(e.target.value);
        if (!id) { box.innerHTML='Select a tenant to load invoices and payment history.'; return; }
        box.innerHTML='Loading tenant financial history…';
        try {
          const h=await api(`/reports/tenant/${id}/history`);
          const invoices=Array.isArray(h?.invoices)?h.invoices:[];
          const payments=Array.isArray(h?.payments)?h.payments:[];
          const invTotal=invoices.reduce((s,x)=>s+Number(x.amount||0),0);
          const paidTotal=invoices.reduce((s,x)=>s+Number(x.paid_amount||0),0);
          box.innerHTML=`<div class="p6-grid"><div><div class="p6-muted">Total Invoiced</div><strong>${money(invTotal)}</strong></div><div><div class="p6-muted">Allocated Paid</div><strong>${money(paidTotal)}</strong></div><div><div class="p6-muted">Balance</div><strong>${money(Math.max(invTotal-paidTotal,0))}</strong></div><div><div class="p6-muted">Payments</div><strong>${payments.length}</strong></div></div><div class="p6-table-wrap"><table class="p6-table"><thead><tr><th>Invoice</th><th>Due</th><th>Amount</th><th>Paid</th><th>Status</th></tr></thead><tbody>${invoices.length?invoices.map(x=>`<tr><td>${esc(x.invoice_number||'-')}</td><td>${date(x.due_date)}</td><td>${money(x.amount)}</td><td>${money(x.paid_amount)}</td><td><span class="p6-badge">${esc(x.status||'')}</span></td></tr>`).join(''):'<tr><td colspan="5">No invoices found.</td></tr>'}</tbody></table></div><div class="p6-table-wrap" style="margin-top:14px"><table class="p6-table"><thead><tr><th>Payment Date</th><th>Amount</th><th>Method</th><th>Invoice</th></tr></thead><tbody>${payments.length?payments.map(x=>`<tr><td>${date(x.payment_date)}</td><td>${money(x.amount)}</td><td>${esc(x.payment_method||x.method||'-')}</td><td>${esc(x.invoice_number||x.invoice_id||'-')}</td></tr>`).join(''):'<tr><td colspan="4">No payments found.</td></tr>'}</tbody></table></div>`;
        } catch(err) { box.innerHTML=`<div class="p6-error">${esc(err.message)}</div>`; }
      };
    } catch(e) {
      c.innerHTML=`<h1>Financial Intelligence</h1><div class="p6-error">${esc(e.message)}</div><div class="p6-note">The Phase 6 interface loaded, but one or more financial report endpoints returned an error. Existing Peacely data is unchanged.</div>`;
    } finally { rendering=false; }
  }

  function ensureTab() {
    style();
    const p=parts();
    if(!p) return;
    if(p.nav.querySelector(`[data-p6="${TAB}"]`)) return;
    const b=document.createElement('button');
    b.type='button'; b.className='p6-tab'; b.dataset.p6=TAB; b.textContent='Financial Intelligence';
    b.addEventListener('click',()=>{activeTab(b);renderFinancial();});
    p.nav.appendChild(b);
  }

  const observer=new MutationObserver(()=>ensureTab());
  observer.observe(document.documentElement,{childList:true,subtree:true});
  [0,100,300,700,1500,3000,5000].forEach(ms=>setTimeout(ensureTab,ms));
})();
