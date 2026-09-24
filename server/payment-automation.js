import express from 'express';
import crypto from 'crypto';
import PDFDocument from 'pdfkit';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';

const clean = (v) => String(v ?? '').trim();
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};


const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  });
};

const cookies = (req) => {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
};

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

async function ownerFromRequest(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const result = await query(
    'SELECT o.id,o.name,o.email FROM sessions s INNER JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1',
    [hash(token)],
  );
  return result.rows[0] || null;
}

async function auth(req, res, next) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success: false, error: 'Authentication required.' });
    req.paymentOwner = owner;
    next();
  } catch (error) {
    console.error('Payment automation auth error:', error);
    return res.status(500).json({ success: false, error: 'Authentication check failed.' });
  }
}

const baseUrl = () =>
  String(process.env.APP_BASE_URL || 'https://chillin-production.up.railway.app').replace(/\/$/, '');

const normalizePhone = (value) => {
  let phone = String(value || '').replace(/[^0-9]/g, '');
  if (phone.length === 10) phone = `91${phone}`;
  return phone;
};

async function ensurePaymentColumns() {
  await query(`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(40) DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_link_id VARCHAR(100) DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_link_cf_id VARCHAR(100) DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_link_url TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_link_status VARCHAR(40) DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_link_created_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS payment_link_paid_amount NUMERIC(12,2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS receipt_token VARCHAR(80) DEFAULT '',
      ADD COLUMN IF NOT EXISTS payment_token VARCHAR(80) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_link_id ON invoices(payment_link_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_token ON invoices(payment_token);
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, tenant_id INTEGER, invoice_id INTEGER,
      channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp', type VARCHAR(50) NOT NULL DEFAULT 'manual',
      recipient VARCHAR(255) DEFAULT '', message TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'queued',
      provider_message_id VARCHAR(255), sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notifications_owner_created ON notifications(owner_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS automation_settings (
      owner_id INTEGER PRIMARY KEY, reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      reminder_days_before INTEGER NOT NULL DEFAULT 3, overdue_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      recurring_invoices_enabled BOOLEAN NOT NULL DEFAULT TRUE, last_run_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS owner_payment_details (
      owner_id INTEGER PRIMARY KEY,
      upi_id VARCHAR(255) DEFAULT '',
      phone VARCHAR(40) DEFAULT '',
      qr_code_data TEXT DEFAULT '',
      payment_instructions TEXT DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getOwnerPaymentDetails(ownerId) {
  const result = await query(
    'SELECT owner_id,upi_id,phone,qr_code_data,payment_instructions,updated_at FROM owner_payment_details WHERE owner_id=$1 LIMIT 1',
    [ownerId],
  );
  return result.rows[0] || null;
}

async function loadInvoice(invoiceId) {
  const result = await query(
    `SELECT
       i.id,i.invoice_number,i.tenant_id,i.amount,i.month,i.due_date,i.status,
       i.paid_amount,i.payment_link_url,i.payment_link_status,i.payment_token,
       t.name AS tenant_name,t.phone,t.email,p.name AS property_name,p.address
     FROM invoices i
     INNER JOIN tenants t ON t.id=i.tenant_id
     INNER JOIN properties p ON p.id=t.property_id
     WHERE i.id=$1
     LIMIT 1`,
    [invoiceId],
  );
  return result.rows[0] || null;
}

async function ownerOwnsInvoice(ownerId, invoiceId) {
  const result = await query(
    `SELECT i.id FROM invoices i
     INNER JOIN tenants t ON t.id=i.tenant_id
     INNER JOIN properties p ON p.id=t.property_id
     WHERE i.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [invoiceId, ownerId],
  );
  return Boolean(result.rows.length);
}

async function createPaymentToken(invoiceId) {
  const existing = await query(
    'SELECT payment_token FROM invoices WHERE id=$1 LIMIT 1',
    [invoiceId],
  );
  if (clean(existing.rows[0]?.payment_token)) return existing.rows[0].payment_token;

  const token = crypto.randomBytes(24).toString('hex');
  await query(
    'UPDATE invoices SET payment_token=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',
    [token, invoiceId],
  );
  return token;
}

async function buildInvoicePdf(invoice) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  const chunks = [];

  doc.on('data', (chunk) => chunks.push(chunk));
  const finished = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.fontSize(24).text('Peacely', { align: 'center' });
  doc.moveDown();
  doc.fontSize(18).text('Paid Rent Invoice', { align: 'center' });
  doc.moveDown(1.5);
  doc.fontSize(11).text(`Invoice: ${invoice.invoice_number}`);
  doc.text(`Tenant: ${invoice.tenant_name}`);
  doc.text(`Property: ${invoice.property_name}`);
  doc.text(`Month: ${invoice.month || '-'}`);
  doc.text(`Due date: ${formatDate(invoice.due_date)}`);
  doc.text('Payment status: PAID');
  doc.moveDown();
  doc.fontSize(14).text(`Amount paid: ₹${num(invoice.paid_amount).toLocaleString('en-IN')}`);
  doc.moveDown(2);
  doc.fontSize(10).text('Payment was confirmed by the property owner in Peacely.');
  doc.moveDown();
  doc.text('Thank you for your payment.');
  doc.end();

  return finished;
}

async function preparePaidInvoiceReceipt(invoiceId) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || clean(invoice.status).toLowerCase() !== 'paid') return '';

  const existing = await query(
    'SELECT receipt_token FROM invoices WHERE id=$1 LIMIT 1',
    [invoiceId],
  );
  const existingToken = clean(existing.rows[0]?.receipt_token);
  if (existingToken) {
    return `${baseUrl()}/api/payment-automation/receipt/${existingToken}.pdf`;
  }

  const token = crypto.randomBytes(24).toString('hex');
  await query(
    'UPDATE invoices SET receipt_token=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',
    [token, invoiceId],
  );
  return `${baseUrl()}/api/payment-automation/receipt/${token}.pdf`;
}
async function markInvoicePaidManually(ownerId, invoiceId) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice || !await ownerOwnsInvoice(ownerId, invoiceId)) {
    throw new Error('Invoice not found.');
  }

  const amount = num(invoice.amount);
  const paidAmount = num(invoice.paid_amount);
  const balance = Math.max(amount - paidAmount, 0);

  if (clean(invoice.status).toLowerCase() === 'cancelled') {
    throw new Error('Cancelled invoices cannot be marked as paid.');
  }
  if (balance <= 0 || clean(invoice.status).toLowerCase() === 'paid') {
    return { invoice, alreadyPaid: true };
  }

  await query(
    `UPDATE invoices
     SET paid_amount=amount,
         status='Paid',
         paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),
         payment_link_status='manual_owner_confirmed',
         updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND paid_amount < amount`,
    [invoiceId],
  );

  const existing = await query(
    'SELECT id FROM payments WHERE invoice_id=$1 AND LOWER(COALESCE(payment_method,\'\'))=LOWER($2) ORDER BY id DESC LIMIT 1',
    [invoiceId, 'UPI - Owner Confirmed'],
  );

  if (!existing.rows.length) {
    await query(
      `INSERT INTO payments(tenant_id,invoice_id,amount,payment_date,payment_method,payment_month,notes)
       VALUES($1,$2,$3,CURRENT_DATE,$4,$5,$6)`,
      [
        invoice.tenant_id,
        invoiceId,
        balance,
        'UPI - Owner Confirmed',
        invoice.month || '',
        'Owner confirmed that the tenant payment was received directly.',
      ],
    );
  }

  const updatedInvoice = await loadInvoice(invoiceId);

  await query(
    `INSERT INTO notifications(owner_id,tenant_id,invoice_id,channel,type,recipient,message,status,sent_at)
     VALUES($1,$2,$3,'system','payment_confirmed',$4,$5,'sent',CURRENT_TIMESTAMP)`,
    [
      ownerId,
      updatedInvoice.tenant_id,
      invoiceId,
      normalizePhone(updatedInvoice.phone),
      `Payment confirmed for ${updatedInvoice.invoice_number}: ₹${num(updatedInvoice.amount).toLocaleString('en-IN')}`,
    ],
  );

  try {
    await preparePaidInvoiceReceipt(invoiceId);
  } catch (error) {
    console.error(`Paid invoice receipt preparation failed for invoice ${invoiceId}:`, error.message);
  }

  return { invoice: await loadInvoice(invoiceId), alreadyPaid: false };
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dueDateForMonth(year, monthIndex, dueDay) {
  const day = Math.min(Math.max(Number(dueDay) || 1, 1), 28);
  return new Date(Date.UTC(year, monthIndex, day, 23, 59, 59));
}

async function processCompletedMoveOuts() {
  const result = await query(
    `SELECT t.id,t.bed_id
     FROM tenants t
     INNER JOIN properties p ON p.id=t.property_id
     WHERE t.move_out_date IS NOT NULL
       AND t.move_out_date <= CURRENT_DATE
       AND LOWER(COALESCE(t.status,'')) NOT IN ('inactive','moved out')`,
  );

  for (const tenant of result.rows) {
    await query(
      'UPDATE tenants SET status=\'Inactive\', bed_id=NULL WHERE id=$1',
      [tenant.id],
    );
    if (tenant.bed_id) {
      await query('UPDATE beds SET is_occupied=FALSE WHERE id=$1', [tenant.bed_id]);
    }
  }

  return result.rows.length;
}

async function createDueInvoices() {
  const owners = await query(`
    SELECT DISTINCT p.owner_id
    FROM properties p
    INNER JOIN tenants t ON t.property_id=p.id
    WHERE LOWER(COALESCE(t.status,'')) IN ('active','move out notice')
      AND COALESCE(t.monthly_rent,0)>0
  `);

  let created = 0;

  for (const owner of owners.rows) {
    const settingsResult = await query(
      'SELECT reminders_enabled,reminder_days_before,overdue_reminders_enabled,recurring_invoices_enabled FROM automation_settings WHERE owner_id=$1 LIMIT 1',
      [owner.owner_id],
    );
    const settings = settingsResult.rows[0] || {
      reminders_enabled: true,
      reminder_days_before: 3,
      overdue_reminders_enabled: true,
      recurring_invoices_enabled: true,
    };

    if (!settings.recurring_invoices_enabled) continue;

    const today = new Date();
    const year = today.getUTCFullYear();
    const monthIndex = today.getUTCMonth();
    const reminderDays = Math.max(0, Math.min(30, Number(settings.reminder_days_before || 3)));

    const tenants = await query(
      `SELECT t.id,t.name,t.phone,t.email,t.monthly_rent,t.due_date,p.name AS property_name
       FROM tenants t
       INNER JOIN properties p ON p.id=t.property_id
       WHERE p.owner_id=$1
         AND LOWER(COALESCE(t.status,'')) IN ('active','move out notice')
         AND COALESCE(t.monthly_rent,0)>0`,
      [owner.owner_id],
    );

    for (const tenant of tenants.rows) {
      const due = dueDateForMonth(year, monthIndex, tenant.due_date);
      const dueIso = isoDate(due);
      const monthLabel = due.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const threshold = addDays(due, -reminderDays);
      const todayIso = isoDate(today);

      const reminderDue = todayIso >= isoDate(threshold);

      const existing = await query(
        `SELECT id,status FROM invoices
         WHERE tenant_id=$1 AND due_date >= date_trunc('month',$2::date)
           AND due_date < date_trunc('month',$2::date)+INTERVAL '1 month'
         ORDER BY id DESC LIMIT 1`,
        [tenant.id, dueIso],
      );

      let invoiceId = existing.rows[0]?.id || null;

      if (!invoiceId) {
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const result = await query(
          `INSERT INTO invoices(invoice_number,tenant_id,amount,month,due_date,status,paid_amount,delivery_status,payment_token)
           VALUES($1,$2,$3,$4,$5::date,
             CASE WHEN $5::date < CURRENT_DATE THEN 'Overdue' ELSE 'Pending' END,
             0,'Not Sent',$6)
           RETURNING id`,
          [
            invoiceNumber,
            tenant.id,
            num(tenant.monthly_rent),
            monthLabel,
            dueIso,
            crypto.randomBytes(24).toString('hex'),
          ],
        );
        invoiceId = result.rows[0].id;
        created += 1;
      } else {
        await createPaymentToken(invoiceId);
      }

      const invoice = await loadInvoice(invoiceId);
      if (invoice && reminderDue) {
        await sendDueReminderIfNeeded(invoice, settings);
      }
    }
  }

  return created;
}

async function sendDueReminderIfNeeded(invoice, settings) {
  if (!settings.reminders_enabled) return false;
  if (clean(invoice.status).toLowerCase() === 'paid') return false;

  const paymentDetails = await getOwnerPaymentDetails(
    (await query(
      `SELECT p.owner_id
       FROM invoices i
       INNER JOIN tenants t ON t.id=i.tenant_id
       INNER JOIN properties p ON p.id=t.property_id
       WHERE i.id=$1 LIMIT 1`,
      [invoice.id],
    )).rows[0]?.owner_id,
  );

  if (!paymentDetails || (!clean(paymentDetails.upi_id) && !clean(paymentDetails.phone) && !clean(paymentDetails.qr_code_data))) {
    console.warn(`No owner payment details configured for invoice ${invoice.id}; manual WhatsApp reminder is not ready.`);
    return false;
  }

  const today = new Date();
  const due = new Date(`${invoice.due_date}T00:00:00Z`);
  const daysUntilDue = Math.round((due.getTime() - new Date(isoDate(today)).getTime()) / 86400000);
  const reminderType = daysUntilDue < 0 ? 'payment_overdue' : 'payment_due';
  if (daysUntilDue < 0 && !settings.overdue_reminders_enabled) return false;

  const exists = await query(
    `SELECT id FROM notifications
     WHERE invoice_id=$1 AND type=$2 AND created_at::date=CURRENT_DATE
     LIMIT 1`,
    [invoice.id, reminderType],
  );
  if (exists.rows.length) return false;

  const paymentToken = await createPaymentToken(invoice.id);
  const paymentPageUrl = `${baseUrl()}/api/payment-automation/pay/${paymentToken}`;
  const manualMessage = `Hello ${invoice.tenant_name}, your rent of ₹${num(invoice.amount).toLocaleString('en-IN')} is due on ${invoice.due_date}. Pay directly to the property owner here: ${paymentPageUrl}`;

  await query(
    `INSERT INTO notifications(owner_id,tenant_id,invoice_id,channel,type,recipient,message,status,sent_at)
     SELECT p.owner_id,$1,$2,'whatsapp',$3,$4,$5,'ready',NULL
     FROM properties p
     INNER JOIN tenants t ON t.property_id=p.id
     WHERE t.id=$1
     LIMIT 1`,
    [invoice.tenant_id, invoice.id, reminderType, normalizePhone(invoice.phone), manualMessage],
  );

  return true;
}
async function runPaymentAutomation() {
  try {
    await ensurePaymentColumns();
    await processCompletedMoveOuts();
    const created = await createDueInvoices();
    console.log(`Payment automation cycle completed. Invoices created: ${created}`);
    return { created };
  } catch (error) {
    console.error('Payment automation cycle failed:', error);
    return { created: 0, error: error.message };
  }
}

router.get('/payment-automation/status', auth, async (req, res) => {
  await ensurePaymentColumns();

  const [pending, recent] = await Promise.all([
    query(
      `SELECT COUNT(*)::integer AS count
       FROM invoices i
       INNER JOIN tenants t ON t.id=i.tenant_id
       INNER JOIN properties p ON p.id=t.property_id
       WHERE p.owner_id=$1
         AND LOWER(COALESCE(i.status,'')) NOT IN ('paid','cancelled')
         AND GREATEST(i.amount-COALESCE(i.paid_amount,0),0)>0`,
      [req.paymentOwner.id],
    ),
    query(
      `SELECT COUNT(*)::integer AS count
       FROM invoices i
       INNER JOIN tenants t ON t.id=i.tenant_id
       INNER JOIN properties p ON p.id=t.property_id
       WHERE p.owner_id=$1
         AND LOWER(COALESCE(i.status,''))='paid'
         AND i.paid_at::date >= CURRENT_DATE-INTERVAL '30 days'`,
      [req.paymentOwner.id],
    ),
  ]);

  const paymentDetails = await getOwnerPaymentDetails(req.paymentOwner.id);

  res.json({
    success: true,
    provider: 'Owner Direct UPI',
    automatic: Boolean(paymentDetails && (
      clean(paymentDetails.upi_id) ||
      clean(paymentDetails.phone) ||
      clean(paymentDetails.qr_code_data)
    )),
    owner_payment_details: Boolean(paymentDetails),
    pending_invoices: Number(pending.rows[0]?.count || 0),
    paid_last_30_days: Number(recent.rows[0]?.count || 0),
  });
});

router.get('/payment-automation/payment-details', auth, async (req, res) => {
  await ensurePaymentColumns();
  const details = await getOwnerPaymentDetails(req.paymentOwner.id);
  return res.json({
    success: true,
    configured: Boolean(details),
    payment_details: details ? {
      upi_id: details.upi_id || '',
      phone: details.phone || '',
      qr_code_data: details.qr_code_data || '',
      payment_instructions: details.payment_instructions || '',
    } : {
      upi_id: '',
      phone: '',
      qr_code_data: '',
      payment_instructions: '',
    },
  });
});

router.put('/payment-automation/payment-details', auth, async (req, res) => {
  await ensurePaymentColumns();

  const upiId = clean(req.body?.upi_id);
  const phone = clean(req.body?.phone);
  const qrCodeData = clean(req.body?.qr_code_data);
  const paymentInstructions = clean(req.body?.payment_instructions);

  if (!upiId && !phone && !qrCodeData) {
    return res.status(400).json({
      success: false,
      error: 'Add at least a UPI ID, phone number, or QR code.',
    });
  }

  if (qrCodeData && !/^data:image\/(png|jpe?g|webp);base64,/i.test(qrCodeData)) {
    return res.status(400).json({
      success: false,
      error: 'QR code must be a PNG, JPG, JPEG, or WebP image.',
    });
  }

  await query(
    `INSERT INTO owner_payment_details(owner_id,upi_id,phone,qr_code_data,payment_instructions,updated_at)
     VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
     ON CONFLICT(owner_id) DO UPDATE SET
       upi_id=EXCLUDED.upi_id,
       phone=EXCLUDED.phone,
       qr_code_data=EXCLUDED.qr_code_data,
       payment_instructions=EXCLUDED.payment_instructions,
       updated_at=CURRENT_TIMESTAMP`,
    [req.paymentOwner.id, upiId, phone, qrCodeData, paymentInstructions],
  );

  const details = await getOwnerPaymentDetails(req.paymentOwner.id);
  return res.json({
    success: true,
    payment_details: {
      upi_id: details?.upi_id || '',
      phone: details?.phone || '',
      qr_code_data: details?.qr_code_data || '',
      payment_instructions: details?.payment_instructions || '',
    },
  });
});

router.post('/payment-automation/invoices/:id/mark-paid', auth, async (req, res) => {
  await ensurePaymentColumns();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ success: false, error: 'Invalid invoice.' });
  }

  try {
    const result = await markInvoicePaidManually(req.paymentOwner.id, id);

    // When the request comes from the Payments screen, use a native
    // browser POST -> redirect flow so mobile browsers do not block the
    // WhatsApp navigation after an awaited fetch request.
    if (String(req.query?.redirect || '').toLowerCase() === 'whatsapp') {
      return res.redirect(303, `/api/payment-automation/invoices/${id}/whatsapp-link`);
    }

    return res.json({
      success: true,
      already_paid: result.alreadyPaid,
      invoice: result.invoice,
      message: result.alreadyPaid
        ? 'Invoice is already paid.'
        : 'Payment confirmed and invoice marked as paid.',
    });
  } catch (error) {
    console.error('Manual payment confirmation failed:', error);
    return res.status(400).json({ success: false, error: error.message || 'Could not mark invoice as paid.' });
  }
});

router.get('/payment-automation/pay/:token', async (req, res) => {
  const token = clean(req.params.token);
  if (!token) return res.status(404).end();

  await ensurePaymentColumns();
  const result = await query(
    `SELECT
       i.id,i.invoice_number,i.amount,i.month,i.due_date,i.status,i.paid_amount,
       t.name AS tenant_name,p.name AS property_name,
       p.owner_id,o.name AS owner_name,
       opd.upi_id,opd.phone,opd.qr_code_data,opd.payment_instructions
     FROM invoices i
     INNER JOIN tenants t ON t.id=i.tenant_id
     INNER JOIN properties p ON p.id=t.property_id
     INNER JOIN owners o ON o.id=p.owner_id
     LEFT JOIN owner_payment_details opd ON opd.owner_id=p.owner_id
     WHERE i.payment_token=$1
     LIMIT 1`,
    [token],
  );

  if (!result.rows.length) return res.status(404).send('Payment request not found.');
  const invoice = result.rows[0];
  const qr = clean(invoice.qr_code_data);

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const hasUpi = clean(invoice.upi_id);
  const upiLink = hasUpi
    ? 'upi://pay?pa=' + encodeURIComponent(invoice.upi_id) + '&pn=' + encodeURIComponent(invoice.owner_name || 'Owner') + '&am=' + encodeURIComponent(num(invoice.amount).toFixed(2)) + '&cu=INR'
    : '';
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html lang="en">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pay Rent - Peacely</title>
<style>
body{font-family:Arial,sans-serif;background:#f6f7fb;margin:0;padding:24px;color:#172033}
.card{max-width:520px;margin:0 auto;background:#fff;border-radius:20px;padding:24px;box-shadow:0 10px 35px rgba(0,0,0,.08)}
h1{margin:0 0 6px}.muted{color:#687386}.amount{font-size:34px;font-weight:700;margin:18px 0}.pay{display:block;width:100%;box-sizing:border-box;text-align:center;background:#111827;color:#fff;border:0;padding:14px;border-radius:12px;font-weight:700;margin:18px 0;cursor:pointer;font-size:16px}.detail{padding:14px;background:#f4f6f8;border-radius:12px;margin-top:10px}.qr{max-width:260px;width:100%;display:block;margin:18px auto;border-radius:12px}.note{white-space:pre-wrap}
</style>
</head>
<body>
<div class="card">
  <div class="muted">Peacely rent payment</div>
  <h1>${escapeHtml(invoice.property_name || 'Property')}</h1>
  <div class="muted">Tenant: ${escapeHtml(invoice.tenant_name)}</div>
  <div class="amount">₹${num(invoice.amount).toLocaleString('en-IN')}</div>
  <div class="muted">Invoice ${escapeHtml(invoice.invoice_number)} · Due ${escapeHtml(formatDate(invoice.due_date))}</div>
   ${hasUpi ? `<a class="pay" href="${upiLink}" style="text-decoration:none">Pay Now with UPI</a>` : `<button class="pay" type="button" onclick="document.getElementById('paymentOptions').scrollIntoView({behavior:'smooth',block:'center'})">Pay Now</button>`}
  <div id="paymentOptions">
  ${qr ? `
    <div class="detail" style="text-align:center">
      <strong>Scan the owner's UPI QR code</strong>
      <div class="muted" style="margin-top:6px">Open Slice or any UPI app, scan this QR, and pay ₹${num(invoice.amount).toLocaleString('en-IN')}.</div>
      <img class="qr" src="${qr}" alt="Owner UPI QR code">
    </div>
  ` : ''}
  ${hasUpi ? `
    <div class="detail">
      <strong>UPI ID</strong><br>
      <span id="upiId">${escapeHtml(invoice.upi_id)}</span><br>
      <button type="button" onclick="navigator.clipboard&&navigator.clipboard.writeText(${JSON.stringify(invoice.upi_id)}).then(()=>{this.textContent='Copied';this.style.background='#d9f7df'}).catch(()=>{this.textContent='Copy failed — select the UPI ID above'})" style="margin-top:8px;padding:10px 14px;border:0;border-radius:8px;background:#e9edf3;cursor:pointer;font-weight:700">Copy UPI ID</button>
       <div class="muted" style="margin-top:8px">If your UPI app declines Pay Now, copy this UPI ID and enter it manually in your UPI app. Some bank/UPI apps apply their own transaction checks.</div>
    </div>
  ` : ''}
  ${clean(invoice.phone) ? `<div class="detail"><strong>Phone</strong><br>${escapeHtml(invoice.phone)}</div>` : ''}
  ${clean(invoice.payment_instructions) ? `<div class="detail note">${escapeHtml(invoice.payment_instructions)}</div>` : ''}
  <div class="detail"><strong>After paying</strong><br>Inform the property owner.</div>
  </div>
</div>
</body>
</html>`);
});

router.get('/payment-automation/receipt/:token.pdf', async (req, res) => {
  const token = clean(req.params.token);
  if (!token) return res.status(404).end();

  await ensurePaymentColumns();
  const result = await query(
    `SELECT i.*,t.name AS tenant_name,t.phone,p.name AS property_name
     FROM invoices i
     INNER JOIN tenants t ON t.id=i.tenant_id
     INNER JOIN properties p ON p.id=t.property_id
     WHERE i.receipt_token=$1 AND LOWER(COALESCE(i.status,''))='paid'
     LIMIT 1`,
    [token],
  );

  if (!result.rows.length) return res.status(404).end();

  const pdf = await buildInvoicePdf(result.rows[0]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${result.rows[0].invoice_number}.pdf"`);
  res.end(pdf);
});

router.get('/payment-automation/invoices/:id/whatsapp-link', auth, async (req, res) => {
  await ensurePaymentColumns();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !await ownerOwnsInvoice(req.paymentOwner.id, id)) {
    return res.status(404).json({ success: false, error: 'Invoice not found.' });
  }

  const invoice = await loadInvoice(id);
  if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found.' });

  const paymentToken = await createPaymentToken(id);
  const paymentPageUrl = `${baseUrl()}/api/payment-automation/pay/${paymentToken}`;
  const receiptUrl = clean(invoice.status).toLowerCase() === 'paid'
    ? await preparePaidInvoiceReceipt(id)
    : '';
  const phone = normalizePhone(invoice.phone);
  if (!phone) {
    return res.status(400).json({ success: false, error: 'Tenant phone number is missing.' });
  }

  const message = clean(invoice.status).toLowerCase() === 'paid'
    ? `Hello ${invoice.tenant_name},\n\nYour rent payment for invoice ${invoice.invoice_number} has been confirmed in Peacely.\n\nAmount paid: ₹${num(invoice.paid_amount || invoice.amount).toLocaleString('en-IN')}\nPaid receipt: ${receiptUrl}`
    : `Hello ${invoice.tenant_name},\n\nHere is your rent invoice from Peacely.\n\nInvoice: ${invoice.invoice_number}\nMonth: ${invoice.month || '-'}\nAmount: ₹${num(invoice.amount).toLocaleString('en-IN')}\nDue date: ${formatDate(invoice.due_date)}\n\nPay directly to the property owner using the UPI/phone/QR details here:\n${paymentPageUrl}\n\nAfter paying, inform the owner.`;
  return res.redirect(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
});
router.get('/payment-automation/invoices/:id/payment-page', auth, async (req, res) => {
  await ensurePaymentColumns();
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !await ownerOwnsInvoice(req.paymentOwner.id, id)) {
    return res.status(404).json({ success: false, error: 'Invoice not found.' });
  }
  const token = await createPaymentToken(id);
  // Redirect directly to the public payment page. This avoids the
  // mobile-browser popup/async-navigation problem caused by returning
  // a JSON URL and then navigating after an awaited fetch.
  // Keep the redirect on the current Peacely origin. Using a relative
  // redirect avoids any APP_BASE_URL mismatch on Railway.
  return res.redirect(302, `/api/payment-automation/pay/${token}`);
});

router.get('/payment-automation/settings', auth, async (req, res) => {
  await ensurePaymentColumns();
  const result = await query(
    'SELECT reminders_enabled,reminder_days_before,overdue_reminders_enabled,recurring_invoices_enabled FROM automation_settings WHERE owner_id=$1 LIMIT 1',
    [req.paymentOwner.id],
  );
  const settings = result.rows[0] || {
    reminders_enabled: true,
    reminder_days_before: 3,
    overdue_reminders_enabled: true,
    recurring_invoices_enabled: true,
  };
  return res.json({
    success: true,
    settings: {
      reminders_enabled: Boolean(settings.reminders_enabled),
      reminder_days_before: Number(settings.reminder_days_before || 3),
      overdue_reminders_enabled: Boolean(settings.overdue_reminders_enabled),
      recurring_invoices_enabled: Boolean(settings.recurring_invoices_enabled),
    },
  });
});

router.put('/payment-automation/settings', auth, async (req, res) => {
  await ensurePaymentColumns();
  const remindersEnabled = req.body?.reminders_enabled !== false;
  const overdueEnabled = req.body?.overdue_reminders_enabled !== false;
  const recurringEnabled = req.body?.recurring_invoices_enabled !== false;
  const reminderDays = Math.min(Math.max(Number(req.body?.reminder_days_before ?? 3) || 0, 0), 30);

  await query(
    'INSERT INTO automation_settings(owner_id,reminders_enabled,reminder_days_before,overdue_reminders_enabled,recurring_invoices_enabled,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT(owner_id) DO UPDATE SET reminders_enabled=EXCLUDED.reminders_enabled,reminder_days_before=EXCLUDED.reminder_days_before,overdue_reminders_enabled=EXCLUDED.overdue_reminders_enabled,recurring_invoices_enabled=EXCLUDED.recurring_invoices_enabled,updated_at=CURRENT_TIMESTAMP',
    [req.paymentOwner.id, remindersEnabled, reminderDays, overdueEnabled, recurringEnabled],
  );

  return res.json({
    success: true,
    settings: {
      reminders_enabled: remindersEnabled,
      reminder_days_before: reminderDays,
      overdue_reminders_enabled: overdueEnabled,
      recurring_invoices_enabled: recurringEnabled,
    },
  });
});

export { runPaymentAutomation };
export default router;
