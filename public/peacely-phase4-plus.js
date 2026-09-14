(() => {
  'use strict';

  const API = '/api';
  const EXPENSE_KEY = 'peacely_phase4_expenses_v1';
  let activeFinance = false;

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const monthKey = (v) => String(v || '').slice(0, 7);
  const todayMonth = () => new Date().toISOString().slice(0, 7);

  function expenses() {
    try { return JSON.parse(localStorage.getItem(EXPENSE_KEY) || '[]'); } catch { return []; }
  }

  async function get(path) {
    const r = await fetch(`${API}${path}`, { credentials: 'include' });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    if (Array.isArray(d)) return d;
    const key = path.split('/').filter(Boolean).pop();
    return Array.isArray(d?.[key]) ? d[key] : [];
  }

  async function loadAll() {
    const names = ['properties','rooms','beds','tenants','payments','invoices'];
    const values = await Promise.all(names.map(n => get(`/${n}`)));
    return Object.fromEntries(names.map((n, i) => [n, values[i]]));
  }

  function months() {
    const out = [];
    const d = new Date(); d.setDate(1);
    for (let i = 0; i < 12; i += 1) {
      const value = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push({
        key: `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`,
        label: value.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
      });
    }
    return out;
  }

  function monthForInvoice(i) { return monthKey(i.month || i.due_date || i.created_at); }
  function monthForPayment(p) { return monthKey(p.payment_month || p.payment_date || p.created_at); }

  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function download(name, text, type='text/plain;charset=utf-8') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function exportCsv(name, headers, rows) {
    download(name, [headers, ...rows].map(r => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  async function renderFinance(root, selected) {
    const content = root.querySelector('.p4-content');
    if (!content) return;
    const month = selected || todayMonth();
    try {
      const data = await loadAll();
      const inv = data.invoices.filter(i => monthForInvoice(i) === month);
      const pay = data.payments.filter(p => monthForPayment(p) === month);
      const exp = expenses().filter(e => monthKey(e.date || e.created_at) === month);
      const invoiced = inv.reduce((s, i) => s + Number(i.amount || 0), 0);
      const invoiceCollected = inv.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
      const paymentsCollected = pay.reduce((s, p) => s + Number(p.amount || 0), 0);
      const collected = paymentsCollected || invoiceCollected;
      const outstanding = Math.max(invoiced - invoiceCollected, 0);
      const expenseTotal = exp.reduce((s, e) => s + Number(e.amount || 0), 0);
      const rate = invoiced ? Math.min(invoiceCollected / invoiced * 100, 100) : 0;
      const categories = {};
      exp.forEach(e => { const k = e.category || 'Other'; categories[k] = (categories[k] || 0) + Number(e.amount || 0); });
      const categoryRows = Object.entries(categories).sort((a,b) => b[1]-a[1]).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('');
      const recent = [...exp].sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).map(e => `<tr><td>${esc(e.date || '-')}</td><td>${esc(e.category || 'Other')}</td><td>${esc(e.property_name || e.property || '-')}</td><td>${money(e.amount)}</td><td>${esc(e.note || e.notes || '')}</td></tr>`).join('');
      content.innerHTML = `<h1>Monthly Finance</h1>
        <div class="p4-toolbar"><label style="display:flex;align-items:center;gap:8px;color:#8e99aa;font-size:11px">Month <select id="p4-finance-month">${months().map(m => `<option value="${m.key}" ${m.key===month?'selected':''}>${m.label}</option>`).join('')}</select></label><button class="p4-btn alt" id="p4-finance-refresh">Refresh</button></div>
        <div class="p4-grid">
          <div class="p4-card"><h3>Invoiced</h3><div class="p4-big">${money(invoiced)}</div></div>
          <div class="p4-card"><h3>Collected</h3><div class="p4-big">${money(collected)}</div></div>
          <div class="p4-card"><h3>Outstanding</h3><div class="p4-big">${money(outstanding)}</div></div>
          <div class="p4-card"><h3>Expenses</h3><div class="p4-big">${money(expenseTotal)}</div></div>
          <div class="p4-card"><h3>Net Cash</h3><div class="p4-big">${money(collected-expenseTotal)}</div></div>
          <div class="p4-card"><h3>Collection Rate</h3><div class="p4-big">${Math.round(rate)}%</div></div>
        </div>
        <div style="height:14px"></div>
        <div class="p4-note">Finance is calculated from live invoices and payments. Expense entries currently remain browser-local until the server expense module is enabled.</div>
        <div class="p4-grid">
          <div class="p4-card"><h3>Expense by Category</h3><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="2">No expenses for this month</td></tr>'}</tbody></table></div></div>
          <div class="p4-card"><h3>Expense Entries</h3><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Amount</th><th>Note</th></tr></thead><tbody>${recent || '<tr><td colspan="5">No expenses for this month</td></tr>'}</tbody></table></div></div>
        </div>`;
      content.querySelector('#p4-finance-month').onchange = (e) => renderFinance(root, e.target.value);
      content.querySelector('#p4-finance-refresh').onclick = () => renderFinance(root, month);
    } catch (e) {
      content.innerHTML = `<h1>Monthly Finance</h1><div class="p4-empty">Unable to load finance data: ${esc(e.message)}</div>`;
    }
  }

  async function renderBackup(root) {
    const content = root.querySelector('.p4-content');
    if (!content) return;
    content.innerHTML = `<h1>Data & Backup</h1><div class="p4-note">Download a local backup of the Peacely records currently available to your account. This does not alter server data.</div><div class="p4-grid"><div class="p4-card"><h3>Tenant Database</h3><div class="p4-big">Export CSV</div><p class="p4-muted">Names, contact, property, room, bed, rent, deposit and status.</p><button class="p4-btn" id="p4-export-tenants">Export</button></div><div class="p4-card"><h3>Invoices</h3><div class="p4-big">Export CSV</div><p class="p4-muted">Invoice number, tenant, month, amount, paid and balance.</p><button class="p4-btn" id="p4-export-invoices">Export</button></div><div class="p4-card"><h3>Payments</h3><div class="p4-big">Export CSV</div><p class="p4-muted">Payment date, tenant, invoice, amount, method and month.</p><button class="p4-btn" id="p4-export-payments">Export</button></div><div class="p4-card"><h3>Full Backup</h3><div class="p4-big">JSON</div><p class="p4-muted">Properties, rooms, beds, tenants, invoices, payments and local expenses.</p><button class="p4-btn" id="p4-export-json">Download Backup</button></div></div>`;
    try {
      const data = await loadAll();
      const localExpenses = expenses();
      content.querySelector('#p4-export-tenants').onclick = () => exportCsv(`peacely-tenants-${todayMonth()}.csv`, ['Name','Phone','Email','Property','Room','Bed','Monthly Rent','Deposit','Due Date','Move In','Move Out','Status'], data.tenants.map(t => [t.name,t.phone,t.email,t.property_name,t.room_number,t.bed_number,t.monthly_rent,t.deposit_amount,t.due_date,t.move_in_date,t.move_out_date,t.status]));
      content.querySelector('#p4-export-invoices').onclick = () => exportCsv(`peacely-invoices-${todayMonth()}.csv`, ['Invoice','Tenant','Month','Amount','Paid','Balance','Due Date','Status'], data.invoices.map(i => [i.invoice_number,i.tenant_name,i.month,i.amount,i.paid_amount,i.balance_amount,i.due_date,i.status]));
      content.querySelector('#p4-export-payments').onclick = () => exportCsv(`peacely-payments-${todayMonth()}.csv`, ['Date','Tenant','Invoice','Amount','Method','Month','Property','Notes'], data.payments.map(p => [p.payment_date,p.tenant_name,p.invoice_number,p.amount,p.payment_method,p.payment_month,p.property_name,p.notes]));
      content.querySelector('#p4-export-json').onclick = () => download(`peacely-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`, JSON.stringify({...data, expenses: localExpenses, exported_at: new Date().toISOString()}, null, 2), 'application/json;charset=utf-8');
    } catch (e) {
      content.insertAdjacentHTML('beforeend', `<div class="p4-empty">Backup export could not load live data: ${esc(e.message)}</div>`);
    }
  }

  function addTabs(root) {
    const nav = root.querySelector('.p4-nav');
    if (!nav) return;
    if (!nav.querySelector('[data-p4-plus-finance]')) {
      const b = document.createElement('button');
      b.type='button'; b.dataset.p4PlusFinance='1'; b.textContent='Monthly Finance';
      b.onclick=()=>{activeFinance=true; nav.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderFinance(root);};
      nav.appendChild(b);
    }
    if (!nav.querySelector('[data-p4-backup]')) {
      const b = document.createElement('button');
      b.type='button'; b.dataset.p4Backup='1'; b.textContent='Data & Backup';
      b.onclick=()=>{activeFinance=false; nav.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderBackup(root);};
      nav.appendChild(b);
    }
  }

  function addHeaderRefresh(root) {
    const head = root.querySelector('.p4-head');
    if (!head || head.querySelector('[data-p4-refresh]')) return;
    const close = head.querySelector('.p4-close');
    const b = document.createElement('button');
    b.type='button'; b.dataset.p4Refresh='1'; b.textContent='↻'; b.title='Refresh Management data';
    b.style.cssText='border:1px solid rgba(255,255,255,.08);background:#172131;color:#fff;border-radius:13px;width:44px;height:44px;font-size:22px;cursor:pointer;margin-right:8px;';
    b.onclick = async () => {
      const original = b.textContent; b.textContent='…';
      try {
        if (activeFinance) renderFinance(root);
        else {
          const tabs = root.querySelectorAll('.p4-nav button');
          const active = [...tabs].find(x=>x.classList.contains('active'));
          if (active && active.dataset.p4Backup) renderBackup(root);
          else if (active && active.dataset.p4PlusFinance) renderFinance(root);
          else if (active) { active.click(); }
        }
      } finally { setTimeout(()=>{b.textContent=original;},300); }
    };
    close?.parentNode?.insertBefore(b, close);
  }

  function watch() {
    const root = document.getElementById('peacely-phase4-root');
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (!root.classList.contains('open')) { activeFinance=false; return; }
      addTabs(root); addHeaderRefresh(root);
    });
    observer.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    setInterval(()=>{if(root.classList.contains('open')){addTabs(root);addHeaderRefresh(root);}},700);
  }

  const boot=setInterval(()=>{if(document.getElementById('peacely-phase4-root')){clearInterval(boot);watch();}},300);
})();