(() => {
  'use strict';

  if (window.__peacelyPhase6PdfBooted) return;
  window.__peacelyPhase6PdfBooted = true;

  const API = '/api';
  const today = () => new Date().toISOString().slice(0,10);
  const yearStart = () => `${new Date().getFullYear()}-01-01`;
  const money = (v) => `INR ${Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  const date = (v) => v ? new Date(`${String(v).slice(0,10)}T00:00:00`).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '-';
  const plain = (v) => String(v ?? '').normalize('NFKD').replace(/[^\x20-\x7E]/g, '').replace(/[\\()]/g, m => `\\${m}`);

  async function api(path) {
    const r = await fetch(API + path, { credentials:'include' });
    const d = await r.json().catch(() => null);
    if (!r.ok) throw new Error(d?.error || `Request failed (${r.status})`);
    return d;
  }

  function addSection(lines, title, rows) {
    lines.push('', title, '----------------------------------------');
    for (const row of rows) lines.push(row);
  }

  function buildPdf(lines) {
    const maxLines = 48;
    const pages = [];
    for (let i = 0; i < lines.length; i += maxLines) pages.push(lines.slice(i, i + maxLines));
    if (!pages.length) pages.push(['Peacely Financial Report']);

    const objects = [];
    const pageIds = [];
    const addObject = (body) => { objects.push(body); return objects.length; };
    const catalogId = addObject('');
    const pagesId = addObject('');
    const fontId = addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

    for (const pageLines of pages) {
      const commands = ['BT', '/F1 9 Tf', '40 800 Td', '11 TL'];
      pageLines.forEach((line, idx) => {
        const safe = plain(line).slice(0, 115);
        if (idx === 0) commands.push(`(${safe}) Tj`);
        else commands.push(`T* (${safe}) Tj`);
      });
      commands.push('ET');
      const stream = commands.join('\n');
      const streamId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`);
      pageIds.push(pageId);
    }

    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

    let pdf = '%PDF-1.4\n%Peacely\n';
    const offsets = [0];
    objects.forEach((obj, i) => {
      offsets[i + 1] = pdf.length;
      pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) pdf += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
    return new Blob([pdf], { type:'application/pdf' });
  }

  function downloadPdf(blob, from, to) {
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = `peacely-financial-${from}-to-${to}.pdf`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  async function exportPdf() {
    const from = document.getElementById('p6-from')?.value || yearStart();
    const to = document.getElementById('p6-to')?.value || today();
    const tenantId = Number(document.getElementById('p6-tenant')?.value || 0);
    const btn = document.getElementById('p6-export');
    if (btn) { btn.disabled = true; btn.textContent = 'Creating PDF…'; }

    try {
      const [financial, aging, properties] = await Promise.all([
        api(`/reports/financial?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),
        api('/reports/aging'),
        api('/reports/property-profitability')
      ]);
      let tenantHistory = null;
      if (tenantId) tenantHistory = await api(`/reports/tenant/${tenantId}/history`);

      const lines = [
        'PEACELY FINANCIAL REPORT',
        `Reporting period: ${date(from)} to ${date(to)}`,
        `Generated: ${new Date().toLocaleString('en-IN')}`,
        '',
        `Invoiced: ${money(financial?.invoiced)}`,
        `Collected: ${money(financial?.collected)}`,
        `Expenses: ${money(financial?.expenses)}`,
        `Net Cash: ${money(financial?.net_cash)}`,
        `Outstanding: ${money(financial?.outstanding)}`,
        `Payment records: ${Number(financial?.payment_count || 0)}`,
        `Expense entries: ${Number(financial?.expense_count || 0)}`
      ];

      const buckets = aging?.buckets || {};
      addSection(lines, 'OUTSTANDING RENT AGEING', [
        `Current: ${money(buckets.current)}`,
        `1-30 Days: ${money(buckets['1_30'])}`,
        `31-60 Days: ${money(buckets['31_60'])}`,
        `61-90 Days: ${money(buckets['61_90'])}`,
        `90+ Days: ${money(buckets['90_plus'])}`
      ]);

      const items = Array.isArray(aging?.items) ? aging.items : [];
      addSection(lines, 'OPEN INVOICE BALANCES', items.length ? items.map(x => `${x.tenant_name || '-'} | ${x.property_name || '-'} | ${x.invoice_number || '-'} | Due ${date(x.due_date)} | ${Number(x.days_overdue || 0)} days | ${money(x.balance)}`) : ['No outstanding invoice balances.']);

      const propertyRows = Array.isArray(properties) ? properties : [];
      addSection(lines, 'PROPERTY PROFITABILITY', propertyRows.length ? propertyRows.map(x => `${x.name || '-'} | Active ${Number(x.active_tenants || 0)} | Occupancy ${Number(x.occupied || 0)}/${Number(x.beds || 0)} | Rent ${money(x.income)} | Expenses ${money(x.expenses)} | Profit ${money(x.profit)}`) : ['No properties found.']);

      const monthly = Array.isArray(financial?.monthly) ? financial.monthly : [];
      addSection(lines, 'MONTHLY P&L / CASH FLOW', monthly.length ? monthly.map(x => `${x.month || '-'} | Invoiced ${money(x.invoiced)} | Collected ${money(x.collected)} | Expenses ${money(x.expenses)} | Net ${money(Number(x.collected || 0) - Number(x.expenses || 0))}`) : ['No monthly data in this range.']);

      const categories = Array.isArray(financial?.categories) ? financial.categories : [];
      addSection(lines, 'EXPENSE ANALYTICS', categories.length ? categories.map(x => `${x.category || 'Other'} | Entries ${Number(x.count || 0)} | ${money(x.amount)}`) : ['No expenses in this range.']);

      if (tenantHistory) {
        const tenant = tenantHistory?.tenant || {};
        const invoices = Array.isArray(tenantHistory?.invoices) ? tenantHistory.invoices : [];
        const payments = Array.isArray(tenantHistory?.payments) ? tenantHistory.payments : [];
        addSection(lines, 'TENANT FINANCIAL HISTORY', [
          `Tenant: ${tenant.name || '-'}`,
          `Property: ${tenant.property_name || '-'} | Room ${tenant.room_number || '-'} | Bed ${tenant.bed_number || '-'}`,
          '',
          'Invoices:'
        ]);
        for (const x of invoices) lines.push(`${x.invoice_number || '-'} | Due ${date(x.due_date)} | Amount ${money(x.amount)} | Paid ${money(x.paid_amount)} | ${x.status || '-'}`);
        lines.push('', 'Payments:');
        for (const x of payments) lines.push(`${date(x.payment_date)} | ${money(x.amount)} | ${x.payment_method || x.method || '-'} | Invoice ${x.invoice_number || x.invoice_id || '-'}`);
      }

      lines.push('', 'Generated from the live Peacely records available to the signed-in account.');
      const blob = buildPdf(lines);
      downloadPdf(blob, from, to);
    } catch (e) {
      alert(`Could not create PDF: ${e.message || e}`);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Export Financial PDF'; }
    }
  }

  window.peacelyExportFinancialPdf = exportPdf;
})();
