(() => {
  'use strict';

  const API = '/api';
  const EXPENSE_KEY = 'peacely_phase4_expenses_v1';
  let open = false;
  let active = false;

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
    return Array.isArray(d) ? d : (d?.[path.slice(1)] || []);
  }

  async function load() {
    const [invoices, payments] = await Promise.all([get('/invoices'), get('/payments')]);
    return { invoices, payments, expenses: expenses() };
  }

  function months() {
    const out = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < 12; i += 1) {
      const value = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const key = `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}`;
      const label = value.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
      out.push({ key, label });
    }
    return out;
  }

  function monthForInvoice(i) {
    const raw = String(i.month || i.due_date || i.created_at || '');
    return monthKey(raw) || '';
  }

  function monthForPayment(p) {
    const raw = String(p.payment_month || p.payment_date || p.created_at || '');
    return monthKey(raw) || '';
  }

  function renderFinance(root, selected) {
    const content = root.querySelector('.p4-content');
    if (!content) return;
    const month = selected || todayMonth();
    load().then((data) => {
      const inv = data.invoices.filter(i => monthForInvoice(i) === month);
      const pay = data.payments.filter(p => monthForPayment(p) === month);
      const exp = data.expenses.filter(e => monthKey(e.date || e.created_at) === month);
      const invoiced = inv.reduce((s, i) => s + Number(i.amount || 0), 0);
      const collectedFromInvoices = inv.reduce((s, i) => s + Number(i.paid_amount || 0), 0);
      const collectedPayments = pay.reduce((s, p) => s + Number(p.amount || 0), 0);
      const collected = collectedPayments || collectedFromInvoices;
      const outstanding = Math.max(invoiced - collectedFromInvoices, 0);
      const expenseTotal = exp.reduce((s, e) => s + Number(e.amount || 0), 0);
      const net = collected - expenseTotal;
      const rate = invoiced ? Math.min(collectedFromInvoices / invoiced * 100, 100) : 0;
      const categories = {};
      exp.forEach(e => { const k = e.category || 'Other'; categories[k] = (categories[k] || 0) + Number(e.amount || 0); });
      const categoryRows = Object.entries(categories).sort((a,b) => b[1]-a[1]).map(([k,v]) => `<tr><td>${esc(k)}</td><td>${money(v)}</td></tr>`).join('');
      const recent = [...exp].sort((a,b) => String(b.date||'').localeCompare(String(a.date||''))).map(e => `<tr><td>${esc(e.date || '-')}</td><td>${esc(e.category || 'Other')}</td><td>${esc(e.property_name || e.property || '-')}</td><td>${money(e.amount)}</td><td>${esc(e.note || e.notes || '')}</td></tr>`).join('');
      content.innerHTML = `<h1>Monthly Finance</h1>
        <div class="p4-toolbar"><label style="display:flex;align-items:center;gap:8px;color:#8e99aa;font-size:11px">Month <select id="p4-finance-month">${months().map(m => `<option value="${m.key}" ${m.key===month?'selected':''}>${m.label}</option>`).join('')}</select></label></div>
        <div class="p4-grid">
          <div class="p4-card"><h3>Invoiced</h3><div class="p4-big">${money(invoiced)}</div></div>
          <div class="p4-card"><h3>Collected</h3><div class="p4-big">${money(collected)}</div></div>
          <div class="p4-card"><h3>Outstanding</h3><div class="p4-big">${money(outstanding)}</div></div>
          <div class="p4-card"><h3>Expenses</h3><div class="p4-big">${money(expenseTotal)}</div></div>
          <div class="p4-card"><h3>Net Cash</h3><div class="p4-big">${money(net)}</div></div>
          <div class="p4-card"><h3>Collection Rate</h3><div class="p4-big">${Math.round(rate)}%</div></div>
        </div>
        <div style="height:14px"></div>
        <div class="p4-note">Monthly finance combines the recorded invoice/payment data with Management Center expenses. Expense records remain browser-local until the server expense module is enabled.</div>
        <div class="p4-grid">
          <div class="p4-card"><h3>Expense by Category</h3><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Category</th><th>Amount</th></tr></thead><tbody>${categoryRows || '<tr><td colspan="2">No expenses for this month</td></tr>'}</tbody></table></div></div>
          <div class="p4-card"><h3>Expense Entries</h3><div class="p4-table-wrap"><table class="p4-table"><thead><tr><th>Date</th><th>Category</th><th>Property</th><th>Amount</th><th>Note</th></tr></thead><tbody>${recent || '<tr><td colspan="5">No expenses for this month</td></tr>'}</tbody></table></div></div>
        </div>`;
      const select = content.querySelector('#p4-finance-month');
      if (select) select.onchange = () => renderFinance(root, select.value);
    }).catch((error) => {
      content.innerHTML = `<h1>Monthly Finance</h1><div class="p4-empty">Unable to load finance data: ${esc(error.message)}</div>`;
    });
  }

  function ensureTab(root) {
    const nav = root.querySelector('.p4-nav');
    if (!nav || nav.querySelector('[data-p4-plus-finance]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.p4PlusFinance = '1';
    b.textContent = 'Monthly Finance';
    b.onclick = () => {
      nav.querySelectorAll('button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      active = true;
      renderFinance(root);
    };
    nav.appendChild(b);
  }

  function watch() {
    const root = document.getElementById('peacely-phase4-root');
    if (!root) return;
    const observer = new MutationObserver(() => {
      if (!root.classList.contains('open')) { open = false; active = false; return; }
      open = true;
      ensureTab(root);
      if (active && !root.querySelector('[data-p4-plus-finance]')?.classList.contains('active')) {
        ensureTab(root);
      }
    });
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    setInterval(() => { if (root.classList.contains('open')) ensureTab(root); }, 800);
  }

  const boot = setInterval(() => {
    if (document.getElementById('peacely-phase4-root')) {
      clearInterval(boot);
      watch();
    }
  }, 300);
})();
