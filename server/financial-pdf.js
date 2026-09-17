import express from 'express';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
let expensesReady = null;

const clean = (v) => String(v ?? '').trim();
const num = (v) => Number(v || 0);
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(clean(v));
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

async function ensureExpenses() {
  if (!expensesReady) {
    expensesReady = query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        property_id INTEGER,
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        category VARCHAR(100) NOT NULL DEFAULT 'Other',
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_expenses_owner_date ON expenses(owner_id, expense_date);
      CREATE INDEX IF NOT EXISTS idx_expenses_owner_property ON expenses(owner_id, property_id);
    `).catch((e) => { expensesReady = null; throw e; });
  }
  return expensesReady;
}

async function ownerFromRequest(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const r = await query(`
    SELECT o.id,o.name,o.email
    FROM sessions s JOIN owners o ON o.id=s.owner_id
    WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP
    LIMIT 1
  `, [hash(token)]);
  return r.rows[0] || null;
}

function money(v) {
  return `₹${num(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeFilePart(v) {
  return clean(v).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'report';
}

function header(doc, title) {
  doc.font('Helvetica-Bold').fontSize(18).text(title);
  doc.font('Helvetica').fontSize(9).fillColor('#555').text('Peacely property, tenant and financial management');
  doc.moveDown(0.6).fillColor('#111');
}

function section(doc, title) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.6);
  doc.font('Helvetica-Bold').fontSize(12).text(title);
  doc.moveTo(50, doc.y + 3).lineTo(545, doc.y + 3).strokeColor('#bbbbbb').stroke();
  doc.moveDown(0.35).strokeColor('#000');
}

function table(doc, headers, rows, widths) {
  const x0 = 50;
  const total = widths.reduce((a,b)=>a+b,0);
  const rowH = 17;
  const drawRow = (values, bold = false, fill = false) => {
    if (doc.y + rowH > 760) doc.addPage();
    const y = doc.y;
    if (fill) doc.rect(x0, y - 2, total, rowH).fill('#eeeeee');
    doc.fillColor('#111').font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
    let x = x0;
    values.forEach((v,i) => {
      doc.text(clean(v).slice(0, 70), x + 3, y + 2, { width: widths[i] - 6, height: rowH - 3, ellipsis: true });
      x += widths[i];
    });
    doc.moveTo(x0, y + rowH - 2).lineTo(x0 + total, y + rowH - 2).strokeColor('#dddddd').stroke();
    doc.strokeColor('#000');
    doc.y = y + rowH;
  };
  drawRow(headers, true, true);
  for (const r of rows) drawRow(r);
  doc.moveDown(0.2);
}

router.get('/api/reports/financial.pdf', async (req, res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success:false, error:'Authentication required.' });
    await ensureExpenses();

    const fromRaw = clean(req.query.from) || `${new Date().getFullYear()}-01-01`;
    const toRaw = clean(req.query.to) || new Date().toISOString().slice(0,10);
    const from = validDate(fromRaw) ? fromRaw : `${new Date().getFullYear()}-01-01`;
    const to = validDate(toRaw) ? toRaw : new Date().toISOString().slice(0,10);
    const tenantId = Number(req.query.tenant_id || 0);
    const id = owner.id;

    const [income, invoiced, expenses, categories, monthly, aging, properties, tenantHistory] = await Promise.all([
      query(`SELECT COALESCE(SUM(pay.amount),0) AS collected,COUNT(pay.id)::integer AS payment_count FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND pay.payment_date BETWEEN $2::date AND $3::date`, [id,from,to]),
      query(`SELECT COALESCE(SUM(i.amount),0) AS invoiced,COALESCE(SUM(i.paid_amount),0) AS allocated FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND i.due_date BETWEEN $2::date AND $3::date`, [id,from,to]),
      query(`SELECT COALESCE(SUM(amount),0) AS expenses,COUNT(*)::integer AS expense_count FROM expenses WHERE owner_id=$1 AND expense_date BETWEEN $2::date AND $3::date`, [id,from,to]),
      query(`SELECT category,COALESCE(SUM(amount),0) AS amount,COUNT(*)::integer AS count FROM expenses WHERE owner_id=$1 AND expense_date BETWEEN $2::date AND $3::date GROUP BY category ORDER BY amount DESC`, [id,from,to]),
      query(`SELECT TO_CHAR(m,'YYYY-MM') AS month,COALESCE((SELECT SUM(pay.amount) FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND pay.payment_date>=m AND pay.payment_date<m+INTERVAL '1 month'),0) AS collected,COALESCE((SELECT SUM(i.amount) FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND i.due_date>=m AND i.due_date<m+INTERVAL '1 month'),0) AS invoiced,COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.owner_id=$1 AND e.expense_date>=m AND e.expense_date<m+INTERVAL '1 month'),0) AS expenses FROM generate_series(DATE_TRUNC('month',$2::date),DATE_TRUNC('month',$3::date),INTERVAL '1 month') m ORDER BY m`, [id,from,to]),
      query(`SELECT i.invoice_number,i.amount,i.paid_amount,i.due_date,GREATEST(0,CURRENT_DATE-i.due_date)::integer AS days_overdue,GREATEST(0,COALESCE(i.amount,0)-COALESCE(i.paid_amount,0)) AS balance,t.name AS tenant_name,p.name AS property_name FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND LOWER(COALESCE(i.status,'')) NOT IN('paid','cancelled') AND GREATEST(0,COALESCE(i.amount,0)-COALESCE(i.paid_amount,0))>0 ORDER BY days_overdue DESC,due_date`, [id]),
      query(`SELECT p.name,COUNT(DISTINCT CASE WHEN LOWER(COALESCE(t.status,''))='active' THEN t.id END)::integer AS active_tenants,COUNT(DISTINCT b.id)::integer AS beds,COUNT(DISTINCT CASE WHEN b.is_occupied THEN b.id END)::integer AS occupied,COALESCE(SUM(CASE WHEN LOWER(COALESCE(t.status,''))='active' THEN t.monthly_rent ELSE 0 END),0) AS income,COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.owner_id=$1 AND e.property_id=p.id),0) AS expenses FROM properties p LEFT JOIN tenants t ON t.property_id=p.id LEFT JOIN rooms r ON r.property_id=p.id LEFT JOIN beds b ON b.room_id=r.id WHERE p.owner_id=$1 GROUP BY p.id,p.name ORDER BY p.name`, [id]),
      tenantId ? query(`SELECT t.id,t.name,t.phone,t.email,p.name AS property_name,r.room_number,b.bed_number, t.monthly_rent,t.deposit_amount,t.move_in_date,t.move_out_date,t.status FROM tenants t JOIN properties p ON p.id=t.property_id LEFT JOIN rooms r ON r.id=t.room_id LEFT JOIN beds b ON b.id=t.bed_id WHERE t.id=$1 AND p.owner_id=$2`, [tenantId,id]).then(async tr => { if (!tr.rows.length) return null; const invoices=await query(`SELECT invoice_number,due_date,amount,paid_amount,status FROM invoices WHERE tenant_id=$1 ORDER BY due_date DESC,id DESC`,[tenantId]); const payments=await query(`SELECT payment_date,amount,payment_method,reference,notes,invoice_id FROM payments WHERE tenant_id=$1 ORDER BY payment_date DESC,id DESC`,[tenantId]); return {tenant:tr.rows[0],invoices:invoices.rows,payments:payments.rows}; }) : Promise.resolve(null)
    ]);

    const collected=num(income.rows[0]?.collected), billed=num(invoiced.rows[0]?.invoiced), allocated=num(invoiced.rows[0]?.allocated), expenseTotal=num(expenses.rows[0]?.expenses);
    const buckets={current:0,'1_30':0,'31_60':0,'61_90':0,'90_plus':0};
    for (const x of aging.rows) { const d=num(x.days_overdue); const k=d<=0?'current':d<=30?'1_30':d<=60?'31_60':d<=90?'61_90':'90_plus'; buckets[k]+=num(x.balance); }

    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="peacely-financial-${safeFilePart(from)}-to-${safeFilePart(to)}.pdf"`);
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');

    const doc = new PDFDocument({ size:'A4', margin:50, info:{ Title:'Peacely Financial Report', Author:'Peacely' } });
    doc.pipe(res);
    header(doc,'Peacely Financial Report');
    doc.fontSize(9).text(`Reporting period: ${from} to ${to}`);
    doc.text(`Generated: ${new Date().toLocaleString('en-IN')}`);
    doc.moveDown(0.5);

    table(doc,['Metric','Value'],[
      ['Invoiced',money(billed)],['Collected',money(collected)],['Expenses',money(expenseTotal)],['Net Cash',money(collected-expenseTotal)],
      ['Outstanding',money(Math.max(0,billed-allocated))],['Payment Records',String(income.rows[0]?.payment_count||0)],['Expense Entries',String(expenses.rows[0]?.expense_count||0)],['Open Ageing Balance',money(aging.rows.reduce((s,x)=>s+num(x.balance),0))]
    ],[260,235]);

    section(doc,'Outstanding Rent Ageing');
    table(doc,['Bucket','Balance'],[['Current',money(buckets.current)],['1–30 Days',money(buckets['1_30'])],['31–60 Days',money(buckets['31_60'])],['61–90 Days',money(buckets['61_90'])],['90+ Days',money(buckets['90_plus'])]],[260,235]);
    table(doc,['Tenant','Property','Invoice','Due','Days','Balance'], aging.rows.map(x=>[x.tenant_name,x.property_name,x.invoice_number,x.due_date,num(x.days_overdue),money(x.balance)]),[90,90,80,65,45,125]);

    section(doc,'Property Profitability');
    doc.fontSize(8).fillColor('#555').text('Active-tenant monthly rent less recorded property expenses.');
    doc.fillColor('#111');
    table(doc,['Property','Active','Occupancy','Monthly Rent','Expenses','Profit'], properties.rows.map(x=>[x.name,num(x.active_tenants),`${num(x.occupied)}/${num(x.beds)}`,money(x.income),money(x.expenses),money(num(x.income)-num(x.expenses))]),[105,55,70,100,85,80]);

    section(doc,'Monthly P&L / Cash Flow');
    table(doc,['Month','Invoiced','Collected','Expenses','Net Cash'], monthly.rows.map(x=>[x.month,money(x.invoiced),money(x.collected),money(x.expenses),money(num(x.collected)-num(x.expenses))]),[75,105,105,105,105]);

    section(doc,'Expense Analytics');
    table(doc,['Category','Entries','Amount'], categories.rows.map(x=>[x.category||'Other',num(x.count),money(x.amount)]),[260,80,155]);

    if (tenantHistory) {
      section(doc,'Tenant Financial History');
      const t=tenantHistory.tenant;
      doc.font('Helvetica-Bold').fontSize(10).text(t.name || 'Tenant');
      doc.font('Helvetica').fontSize(8).text(`Property: ${t.property_name||'-'} | Room: ${t.room_number||'-'} | Bed: ${t.bed_number||'-'}`);
      doc.text(`Monthly rent: ${money(t.monthly_rent)} | Deposit: ${money(t.deposit_amount)} | Status: ${t.status||'-'}`);
      doc.text(`Move in: ${t.move_in_date||'-'} | Move out: ${t.move_out_date||'-'}`);
      const invTotal=tenantHistory.invoices.reduce((s,x)=>s+num(x.amount),0);
      const paidTotal=tenantHistory.invoices.reduce((s,x)=>s+num(x.paid_amount),0);
      doc.text(`Total invoiced: ${money(invTotal)} | Allocated paid: ${money(paidTotal)} | Balance: ${money(Math.max(invTotal-paidTotal,0))}`);
      doc.moveDown(0.4);
      table(doc,['Invoice','Due','Amount','Paid','Status'],tenantHistory.invoices.map(x=>[x.invoice_number,x.due_date,money(x.amount),money(x.paid_amount),x.status||'-']),[105,75,100,100,115]);
      table(doc,['Date','Amount','Method','Reference','Invoice'],tenantHistory.payments.map(x=>[x.payment_date,money(x.amount),x.payment_method||'-',x.reference||x.notes||'-',x.invoice_id||'-']),[75,90,90,160,80]);
    }

    doc.moveDown(1);
    doc.fontSize(7).fillColor('#666').text('Generated from the live Peacely records available to the signed-in account.');
    doc.end();
  } catch (e) {
    console.error('Financial PDF export failed:', e);
    if (!res.headersSent) res.status(500).json({success:false,error:'Unable to generate financial PDF.'});
  }
});

export default router;
