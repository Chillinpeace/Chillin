(() => {
  'use strict';

  if (window.__peacelyPhase6PdfBooted) return;
  window.__peacelyPhase6PdfBooted = true;

  const API = '/api';

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

  function printableTable(headers, rows, empty='No records.') {
    return `<table><thead><tr>${headers.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.join('') : `<tr><td colspan="${headers.length}">${esc(empty)}</td></tr>`}</tbody></table>`;
  }

  function row(values) {
    return `<tr>${values.map(v=>`<td>${v}</td>`).join('')}</tr>`;
  }

  function openPrintWindow(html) {
    const w = window.open('', '_blank');
    if (!w) {
      alert('Please allow pop-ups for Peacely to create the PDF report.');
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 350);
  }

  async function exportPdf() {
    const from = document.getElementById('p6-from')?.value || yearStart();
    const to = document.getElementById('p6-to')?.value || today();
    const tenantId = Number(document.getElementById('p6-tenant')?.value || 0);

    const btn = document.getElementById('p6-export-pdf');
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing PDF…'; }

    try {
      const [financial, aging, properties] = await Promise.all([
        api(`/reports/financial?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api('/reports/aging'),
        api('/reports/property-profitability')
      ]);

      let tenantHistory = null;
      if (tenantId) tenantHistory = await api(`/reports/tenant/${tenantId}/history`);

      const monthly = Array.isArray(financial?.monthly) ? financial.monthly : [];
      const categories = Array.isArray(financial?.categories) ? financial.categories : [];
      const items = Array.isArray(aging?.items) ? aging.items : [];
      const buckets = aging?.buckets || {};
      const propertyRows = Array.isArray(properties) ? properties : [];
      const invoices = Array.isArray(tenantHistory?.invoices) ? tenantHistory.invoices : [];
      const payments = Array.isArray(tenantHistory?.payments) ? tenantHistory.payments : [];

      const generated = new Date().toLocaleString('en-IN', { dateStyle:'medium', timeStyle:'short' });
      const title = `Peacely Financial Report — ${from} to ${to}`;
      const invTotal = invoices.reduce((s,x)=>s+Number(x.amount||0),0);
      const paidTotal = invoices.reduce((s,x)=>s+Number(x.paid_amount||0),0);

      const ageingRows = items.map(x => row([
        esc(x.tenant_name || '-'), esc(x.property_name || '-'), esc(x.invoice_number || '-'), date(x.due_date), Number(x.days_overdue||0), money(x.balance)
      ]));
      const propertyTableRows = propertyRows.map(x => row([
        esc(x.name || '-'), Number(x.active_tenants||0), `${Number(x.occupied||0)}/${Number(x.beds||0)}`, money(x.income), money(x.expenses), money(x.profit)
      ]));
      const monthlyRows = monthly.map(x => row([
        esc(x.month || '-'), money(x.invoiced), money(x.collected), money(x.expenses), money(Number(x.collected||0)-Number(x.expenses||0))
      ]));
      const categoryRows = categories.map(x => row([esc(x.category || 'Other'), Number(x.count||0), money(x.amount)]));

      const tenantSection = tenantHistory ? `
        <section>
          <h2>Tenant Financial History</h2>
          <div class="tenant-box"><strong>${esc(tenantHistory?.tenant?.name || 'Tenant')}</strong><br>
            ${esc(tenantHistory?.tenant?.property_name || '-')} · Room ${esc(tenantHistory?.tenant?.room_number || '-')} · Bed ${esc(tenantHistory?.tenant?.bed_number || '-')}<br>
            Total invoiced: <strong>${money(invTotal)}</strong> · Allocated paid: <strong>${money(paidTotal)}</strong> · Balance: <strong>${money(Math.max(invTotal-paidTotal,0))}</strong>
          </div>
          <h3>Invoices</h3>
          ${printableTable(['Invoice','Due','Amount','Paid','Status'], invoices.map(x=>row([esc(x.invoice_number||'-'),date(x.due_date),money(x.amount),money(x.paid_amount),esc(x.status||'-')])), 'No invoices found.')}
          <h3>Payments</h3>
          ${printableTable(['Date','Amount','Method','Reference','Invoice'], payments.map(x=>row([date(x.payment_date),money(x.amount),esc(x.payment_method||x.method||'-'),esc(x.reference||x.notes||'-'),esc(x.invoice_number||x.invoice_id||'-')])), 'No payments found.')}
        </section>` : '';

      const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
        @page{size:A4;margin:14mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;font-size:10px;line-height:1.35;margin:0}h1{font-size:21px;margin:0 0 4px}h2{font-size:15px;margin:20px 0 8px;border-bottom:1px solid #bbb;padding-bottom:4px}h3{font-size:12px;margin:14px 0 6px}.sub{color:#555;margin-bottom:14px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:12px 0}.metric{border:1px solid #ccc;border-radius:6px;padding:8px}.metric span{display:block;color:#666;font-size:8px}.metric strong{display:block;font-size:13px;margin-top:2px}table{width:100%;border-collapse:collapse;margin:5px 0 10px;page-break-inside:auto}tr{page-break-inside:avoid}th,td{border-bottom:1px solid #ddd;padding:5px;text-align:left;vertical-align:top}th{background:#f1f1f1;font-weight:700}section{page-break-inside:auto}.tenant-box{border:1px solid #ccc;border-radius:6px;padding:8px;background:#fafafa}@media print{.no-print{display:none}.page-break{page-break-before:always}}
      </style></head><body>
        <h1>Peacely Financial Report</h1>
        <div class="sub"><strong>Reporting period:</strong> ${esc(date(from))} to ${esc(date(to))}<br><strong>Generated:</strong> ${esc(generated)}</div>
        <div class="grid">
          <div class="metric"><span>Invoiced</span><strong>${money(financial?.invoiced)}</strong></div>
          <div class="metric"><span>Collected</span><strong>${money(financial?.collected)}</strong></div>
          <div class="metric"><span>Expenses</span><strong>${money(financial?.expenses)}</strong></div>
          <div class="metric"><span>Net Cash</span><strong>${money(financial?.net_cash)}</strong></div>
          <div class="metric"><span>Outstanding</span><strong>${money(financial?.outstanding)}</strong></div>
          <div class="metric"><span>Payments</span><strong>${Number(financial?.payment_count||0)}</strong></div>
          <div class="metric"><span>Expense Entries</span><strong>${Number(financial?.expense_count||0)}</strong></div>
          <div class="metric"><span>Open Ageing Balance</span><strong>${money(items.reduce((s,x)=>s+Number(x.balance||0),0))}</strong></div>
        </div>

        <section><h2>Outstanding Rent Ageing</h2>
          ${printableTable(['Bucket','Balance'],[
            row(['Current',money(buckets.current)]),row(['1–30 Days',money(buckets['1_30'])]),row(['31–60 Days',money(buckets['31_60'])]),row(['61–90 Days',money(buckets['61_90'])]),row(['90+ Days',money(buckets['90_plus'])])
          ])}
          ${printableTable(['Tenant','Property','Invoice','Due','Days','Balance'],ageingRows,'No outstanding invoice balances.')}
        </section>

        <section><h2>Property Profitability</h2><div class="sub">Active-tenant monthly rent less recorded property expenses.</div>
          ${printableTable(['Property','Active Tenants','Occupancy','Monthly Rent','Expenses','Profit'],propertyTableRows,'No properties found.')}
        </section>

        <section><h2>Monthly P&amp;L / Cash Flow</h2>
          ${printableTable(['Month','Invoiced','Collected','Expenses','Net Cash'],monthlyRows,'No monthly data in this range.')}
        </section>

        <section><h2>Expense Analytics</h2>
          ${printableTable(['Category','Entries','Amount'],categoryRows,'No expenses in this range.')}
        </section>
        ${tenantSection}
        <div class="sub" style="margin-top:20px">This report is generated from the live Peacely records available to the signed-in account. Property profitability follows the current Peacely calculation shown above.</div>
      </body></html>`;

      openPrintWindow(html);
    } catch (e) {
      alert(`Could not create PDF: ${e.message || e}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Export Financial PDF'; }
    }
  }

  function wire() {
    const btn = document.getElementById('p6-export');
    if (!btn || btn.dataset.pdfWired === '1') return;
    btn.dataset.pdfWired = '1';
    btn.id = 'p6-export-pdf';
    btn.textContent = 'Export Financial PDF';
    btn.title = 'Open a detailed print-ready financial report; choose Save as PDF on your phone.';
    btn.onclick = exportPdf;
  }

  const observer = new MutationObserver(wire);
  observer.observe(document.body, {childList:true, subtree:true});
  setInterval(wire, 1000);
  wire();
})();
