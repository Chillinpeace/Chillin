(() => {
  'use strict';

  const API = '/api';
  const LEGACY_EXPENSE_KEY = 'peacely_phase4_expenses_v1';
  let currentMode = '';

  const esc = (v) => String(v ?? '').replace(/[&<>\"]/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '\"':'&quot;' }[c]));
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`;
  const monthKey = (v) => String(v || '').slice(0, 7);
  const today = () => new Date().toISOString().slice(0, 10);
  const todayMonth = () => today().slice(0, 7);

  async function get(path) {
    const r = await fetch(`${API}${path}`, { credentials: 'include' });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    return Array.isArray(d) ? d : (Array.isArray(d?.[path.split('/').filter(Boolean).pop()]) ? d[path.split('/').filter(Boolean).pop()] : d);
  }

  async function send(path, method, body) {
    const r = await fetch(`${API}${path}`, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed: ${r.status}`);
    return d;
  }

  async function loadAll() {
    const names = ['properties','rooms','beds','tenants','payments','invoices'];
    const values = await Promise.all(names.map((n) => get(`/${n}`)));
    return Object.fromEntries(names.map((n, i) => [n, Array.isArray(values[i]) ? values[i] : []]));
  }

  async function loadExpenses(month = '') {
    const suffix = month ? `?month=${encodeURIComponent(month)}` : '';
    const data = await get(`/expenses${suffix}`);
    return Array.isArray(data) ? data : [];
  }

  function months() {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 12; i += 1) {
      const value = new Date(d.getFullYear(), d.getMonth() - i, 1);
      out.push({
        key: `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`,
        label: value.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
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

  function download(name, text, type = 'text/plain;charset=utf-8') {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  function exportCsv(name, headers, rows) {
    download(name, [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\n'), 'text/csv;charset=utf-8');
  }

  function root() { return document.getElementById('peacely-phase4-root'); }
  function content() { return root()?.querySelector('.p4-content'); }
  function nav() { return root()?.querySelector('.p4-nav'); }

  function setActive(button) {
    nav()?.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    button?.classList.add('active');
  }

  async function renderExpenses() {
    currentMode = 'expenses';
    const r = root();
    const c = content();
    if (!r || !c) return;
    try {
      const [data, expenses] = await Promise.all([loadAll(), loadExpenses()]);
      const properties = data.properties || [];
      const localRaw = (() => { try { return JSON.parse(localStorage.getItem(LEGACY_EXPENSE_KEY) || '[]'); } catch { return []; } })();
      const localImport = expenses.length === 0 && localRaw.length > 0;
      c.innerHTML = `<h1>Expenses</h1>
        <div class="p4-note">Expenses are now stored securely on the Peacely server and are separated by owner. Each entry can be assigned to a property and is included in monthly finance.</div>
        ${localImport ? `<div class="p4-note" style="background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.16);color:#fbbf24">Older browser-local expenses were found. <button class="p4-btn" id="p4-import-legacy">Import ${localRaw.length} old entr${localRaw.length === 1 ? 'y' : 'ies'}</button></div>` : ''}
        <form class="p4-form" id="p4-expense-form">
          <label>Date<input id="p4-expense-date" type="date" value="${today()}" required></label>
          <label>Category<select id="p4-expense-category"><option>Maintenance</option><option>Utilities</option><option>Repairs</option><option>Cleaning</option><option>Staff</option><option>Property Tax</option><option>Internet</option><option>Supplies</option><option>Other</option></select></label>
          <label>Property<select id="p4-expense-property"><option value="">All / General</option>${properties.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
          <label>Amount<input id="p4-expense-amount" type="number" min="0.01" step="0.01" placeholder="0" required></label>
          <label style="grid-column:1/-1">Note<input id="p4-expense-note" maxlength="500" placeholder="Optional note"></label>
          <div style="display:flex;align-items:end"><button class="p4-btn" type="submit">Add Expense</button></div>
        </form>
        <div class="p4-toolbar"><input id="p4-expense-search" placeholder="Search category, property or note..."><button class="p4-btn alt" id="p4-expense-refresh">Refresh</button></div>
        <div class="p4-card" style="margin-bottom:14px"><h3>Total Recorded Expenses</h3><div class="p4-big" id="p4-expense-total">${money(expenses.reduce((s,e) => s + Number(e.amount || 0), 0))}</div><div class="p4-muted">${expenses.length} entries</div></div>
        <div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Amount</th><th>Note</th><th></th></tr></thead><tbody id="p4-expense-body"></tbody></table></div>`;

      const renderRows = () => {
        const q = String(c.querySelector('#p4-expense-search')?.value || '').toLowerCase();
        const rows = expenses.filter((e) => [e.category, e.property_name, e.note].join(' ').toLowerCase().includes(q));
        c.querySelector('#p4-expense-body').innerHTML = rows.length ? rows.map((e) => `<tr><td>${esc(e.expense_date)}</td><td>${esc(e.category)}</td><td>${esc(e.property_name || 'General')}</td><td>${money(e.amount)}</td><td>${esc(e.note || '')}</td><td><button class="p4-btn danger" data-expense-delete="${e.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="6">No expenses found.</td></tr>';
        c.querySelectorAll('[data-expense-delete]').forEach((b) => b.onclick = async () => {
          if (!confirm('Delete this expense?')) return;
          try { await send(`/expenses/${b.dataset.expenseDelete}`, 'DELETE'); await renderExpenses(); }
          catch (error) { alert(error.message); }
        });
      };
      renderRows();
      c.querySelector('#p4-expense-search').oninput = renderRows;
      c.querySelector('#p4-expense-refresh').onclick = renderExpenses;
      c.querySelector('#p4-expense-form').onsubmit = async (event) => {
        event.preventDefault();
        const button = event.submitter;
        button.disabled = true;
        try {
          await send('/expenses', 'POST', {
            expense_date: c.querySelector('#p4-expense-date').value,
            category: c.querySelector('#p4-expense-category').value,
            property_id: c.querySelector('#p4-expense-property').value,
            amount: c.querySelector('#p4-expense-amount').value,
            note: c.querySelector('#p4-expense-note').value,
          });
          await renderExpenses();
        } catch (error) { alert(error.message); }
        finally { button.disabled = false; }
      };
      const importButton = c.querySelector('#p4-import-legacy');
      if (importButton) importButton.onclick = async () => {
        importButton.disabled = true;
        let imported = 0;
        try {
          for (const e of localRaw) {
            const amount = Number(e.amount || 0);
            if (!amount || amount <= 0) continue;
            await send('/expenses', 'POST', {
              expense_date: /^\d{4}-\d{2}-\d{2}$/.test(String(e.date || '')) ? e.date : today(),
              category: e.category || 'Other',
              property_id: e.property_id || '',
              amount,
              note: e.note || e.notes || '',
            });
            imported += 1;
          }
          localStorage.removeItem(LEGACY_EXPENSE_KEY);
          alert(`${imported} expense entr${imported === 1 ? 'y' : 'ies'} imported.`);
          await renderExpenses();
        } catch (error) {
          alert(`Import stopped after ${imported} entries: ${error.message}`);
          importButton.disabled = false;
        }
      };
    } catch (error) {
      c.innerHTML = `<h1>Expenses</h1><div class="p4-empty">Unable to load server expenses: ${esc(error.message)}</div>`;
    }
  }

  async function renderFinance(selected) {
    currentMode = 'finance';
    const c = content();
    if (!c) return;
    const month = selected || todayMonth();
    try {
      const [data, expenses] = await Promise.all([loadAll(), loadExpenses(month)]);
      const inv = data.invoices.filter((i) => monthForInvoice(i) === month);
      const pay = data.payments.filter((p) => monthForPayment(p) === month);
      const invoiced = inv.reduce((s, i) => s + Number(i.amount || 0), 0);
      const collected = pay.reduce((s, p) => s + Number(p.amount || 0), 0);
      const invoicePaid = inv.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
      const actualCollected = collected || invoicePaid;
      const outstanding = Math.max(invoiced - invoicePaid, 0);
      const expenseTotal = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
      const rate = invoiced ? Math.min((invoicePaid / invoiced) * 100, 100) : 0;
      const categories = {};
      expenses.forEach((e) => { const key = e.category || 'Other'; categories[key] = (categories[key] || 0) + Number(e.amount || 0); });
      const categoryRows = Object.entries(categories).sort((a,b) => b[1] - a[1]).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('');
      c.innerHTML = `<h1>Monthly Finance</h1>
        <div class="p4-toolbar"><label style="display:flex;align-items:center;gap:8px;color:#8e99aa;font-size:11px">Month<select id="p4-finance-month">${months().map((m) => `<option value="${m.key}" ${m.key === month ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label><button class="p4-btn alt" id="p4-finance-refresh">Refresh</button></div>
        <div class="p4-grid"><div class="p4-card"><h3>Invoiced</h3><div class="p4-big">${money(invoiced)}</div></div><div class="p4-card"><h3>Collected</h3><div class="p4-big">${money(actualCollected)}</div></div><div class="p4-card"><h3>Outstanding</h3><div class="p4-big">${money(outstanding)}</div></div><div class="p4-card"><h3>Expenses</h3><div class="p4-big">${money(expenseTotal)}</div></div><div class="p4-card"><h3>Net Cash</h3><div class="p4-big">${money(actualCollected - expenseTotal)}</div></div><div class="p4-card"><h3>Collection Rate</h3><div class="p4-big">${Math.round(rate)}%</div></div></div>
        <div style="height:14px"></div><div class="p4-grid"><div class="p4-card"><h3>Expense by Category</h3><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="2">No expenses for this month</td></tr>'}</tbody></table></div></div><div class="p4-card"><h3>Month Summary</h3><p class="p4-muted">${inv.length} invoice${inv.length === 1 ? '' : 's'}, ${pay.length} payment${pay.length === 1 ? '' : 's'} and ${expenses.length} expense entr${expenses.length === 1 ? 'y' : 'ies'}.</p><div class="p4-big">${money(actualCollected - expenseTotal)}</div><div class="p4-muted">Net cash after recorded expenses</div></div></div>`;
      c.querySelector('#p4-finance-month').onchange = (e) => renderFinance(e.target.value);
      c.querySelector('#p4-finance-refresh').onclick = () => renderFinance(month);
    } catch (error) {
      c.innerHTML = `<h1>Monthly Finance</h1><div class="p4-empty">Unable to load finance data: ${esc(error.message)}</div>`;
    }
  }

  async function renderBackup() {
    currentMode = 'backup';
    const c = content();
    if (!c) return;
    c.innerHTML = `<h1>Data & Backup</h1><div class="p4-note">Download a local backup of the live records available to your account. Backup files never modify server data.</div><div class="p4-grid"><div class="p4-card"><h3>Tenant Database</h3><div class="p4-big">CSV</div><p class="p4-muted">Tenant, location, rent, deposit and lifecycle.</p><button class="p4-btn" id="p4-export-tenants">Export</button></div><div class="p4-card"><h3>Invoices</h3><div class="p4-big">CSV</div><p class="p4-muted">Invoice amounts, payments, balances and status.</p><button class="p4-btn" id="p4-export-invoices">Export</button></div><div class="p4-card"><h3>Payments</h3><div class="p4-big">CSV</div><p class="p4-muted">Payment date, tenant, invoice, method and notes.</p><button class="p4-btn" id="p4-export-payments">Export</button></div><div class="p4-card"><h3>Expenses</h3><div class="p4-big">CSV</div><p class="p4-muted">All server-backed expenses.</p><button class="p4-btn" id="p4-export-expenses">Export</button></div><div class="p4-card"><h3>Full Backup</h3><div class="p4-big">JSON</div><p class="p4-muted">Complete live dataset including expenses.</p><button class="p4-btn" id="p4-export-json">Download</button></div></div>`;
    try {
      const [data, expenses] = await Promise.all([loadAll(), loadExpenses()]);
      c.querySelector('#p4-export-tenants').onclick = () => exportCsv(`peacely-tenants-${todayMonth()}.csv`, ['Name','Phone','Email','Property','Room','Bed','Monthly Rent','Deposit','Due Date','Move In','Move Out','Status'], data.tenants.map((t) => [t.name,t.phone,t.email,t.property_name,t.room_number,t.bed_number,t.monthly_rent,t.deposit_amount,t.due_date,t.move_in_date,t.move_out_date,t.status]));
      c.querySelector('#p4-export-invoices').onclick = () => exportCsv(`peacely-invoices-${todayMonth()}.csv`, ['Invoice','Tenant','Month','Amount','Paid','Balance','Due Date','Status'], data.invoices.map((i) => [i.invoice_number,i.tenant_name,i.month,i.amount,i.paid_amount,i.balance_amount,i.due_date,i.status]));
      c.querySelector('#p4-export-payments').onclick = () => exportCsv(`peacely-payments-${todayMonth()}.csv`, ['Date','Tenant','Invoice','Amount','Method','Month','Property','Notes'], data.payments.map((p) => [p.payment_date,p.tenant_name,p.invoice_number,p.amount,p.payment_method,p.payment_month,p.property_name,p.notes]));
      c.querySelector('#p4-export-expenses').onclick = () => exportCsv(`peacely-expenses-${todayMonth()}.csv`, ['Date','Category','Property','Amount','Note'], expenses.map((e) => [e.expense_date,e.category,e.property_name,e.amount,e.note]));
      c.querySelector('#p4-export-json').onclick = () => download(`peacely-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ ...data, expenses, exported_at: new Date().toISOString() }, null, 2), 'application/json;charset=utf-8');
    } catch (error) {
      c.insertAdjacentHTML('beforeend', `<div class="p4-empty">Backup export could not load live data: ${esc(error.message)}</div>`);
    }
  }

  function addSpecialTabs(r) {
    const n = r.querySelector('.p4-nav');
    if (!n) return;
    if (!n.querySelector('[data-p4-final-finance]')) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.p4FinalFinance = '1'; b.textContent = 'Monthly Finance';
      b.onclick = () => { setActive(b); renderFinance(); };
      n.appendChild(b);
    }
    if (!n.querySelector('[data-p4-final-backup]')) {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.p4FinalBackup = '1'; b.textContent = 'Data & Backup';
      b.onclick = () => { setActive(b); renderBackup(); };
      n.appendChild(b);
    }

    const expenseTab = n.querySelector('[data-p4-tab="expenses"]');
    if (expenseTab) expenseTab.onclick = () => { setActive(expenseTab); renderExpenses(); };
  }

  function addRefresh(r) {
    const head = r.querySelector('.p4-head');
    if (!head || head.querySelector('[data-p4-final-refresh]')) return;
    const close = head.querySelector('.p4-close');
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.p4FinalRefresh = '1'; b.textContent = '↻'; b.title = 'Refresh Management data';
    b.style.cssText = 'border:1px solid rgba(255,255,255,.08);background:#172131;color:#fff;border-radius:13px;width:44px;height:44px;font-size:22px;cursor:pointer;margin-right:8px;';
    b.onclick = () => {
      if (currentMode === 'expenses') renderExpenses();
      else if (currentMode === 'finance') renderFinance();
      else if (currentMode === 'backup') renderBackup();
      else {
        const active = r.querySelector('.p4-nav button.active');
        if (active) active.click();
      }
    };
    close?.parentNode?.insertBefore(b, close);
  }

  function watch() {
    const r = root();
    if (!r || r.dataset.phase4FinalWatched) return;
    r.dataset.phase4FinalWatched = '1';
    const observer = new MutationObserver(() => {
      if (!r.classList.contains('open')) { currentMode = ''; return; }
      addSpecialTabs(r);
      addRefresh(r);
    });
    observer.observe(r, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    addSpecialTabs(r);
    addRefresh(r);
  }

  const boot = setInterval(() => {
    if (root()) { clearInterval(boot); watch(); }
  }, 300);
})();
