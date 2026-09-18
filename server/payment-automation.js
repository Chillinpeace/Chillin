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

const cashfreeConfigured = () =>
  Boolean(process.env.CASHFREE_CLIENT_ID && process.env.CASHFREE_CLIENT_SECRET);

const whatsappConfigured = () =>
  Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN &&
    process.env.WHATSAPP_PHONE_NUMBER_ID &&
    process.env.WHATSAPP_REMINDER_TEMPLATE,
  );

const baseUrl = () =>
  String(process.env.APP_BASE_URL || 'https://chillin-production.up.railway.app').replace(/\/$/, '');

const cashfreeBase = () =>
  String(process.env.CASHFREE_ENV || 'production').toLowerCase() === 'sandbox'
    ? 'https://sandbox.cashfree.com/pg'
    : 'https://api.cashfree.com/pg';

const cashfreeVersion = () => process.env.CASHFREE_API_VERSION || '2025-01-01';

const whatsappVersion = () => process.env.WHATSAPP_GRAPH_VERSION || 'v23.0';

const normalizePhone = (value) => {
  let phone = String(value || '').replace(/[^0-9]/g, '');
  if (phone.length === 10) phone = `91${phone}`;
  return phone;
};

async function cashfreeRequest(path, options = {}) {
  if (!cashfreeConfigured()) throw new Error('Cashfree is not configured.');

  const response = await fetch(`${cashfreeBase()}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-client-id': process.env.CASHFREE_CLIENT_ID,
      'x-client-secret': process.env.CASHFREE_CLIENT_SECRET,
      'x-api-version': cashfreeVersion(),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message || data?.error || `Cashfree request failed: ${response.status}`);
  }
  return data;
}

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
      ADD COLUMN IF NOT EXISTS receipt_token VARCHAR(80) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_invoices_payment_link_id ON invoices(payment_link_id);
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
    CREATE TABLE IF NOT EXISTS cashfree_vendors (
      owner_id INTEGER PRIMARY KEY,
      vendor_id VARCHAR(120) NOT NULL UNIQUE,
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      settlement_method VARCHAR(20) NOT NULL DEFAULT '',
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

async function getOwnerCashfreeVendor(ownerId) {
  const result = await query(
    'SELECT owner_id,vendor_id,status,settlement_method FROM cashfree_vendors WHERE owner_id=$1 LIMIT 1',
    [ownerId],
  );
  return result.rows[0] || null;
}

async function createCashfreeVendor(owner, body) {
  if (!cashfreeConfigured()) throw new Error('Cashfree is not configured.');

  const vendorId = `PEACELY_OWNER_${owner.id}`;
  const settlementMethod = clean(body?.settlement_method).toLowerCase();
  const name = clean(body?.name || owner.name).replace(/[^a-zA-Z0-9 .\/-&]/g, '').slice(0, 100);
  const email = clean(body?.email || owner.email);
  const phone = normalizePhone(body?.phone || body?.mobile || '');

  if (!name || !email || !phone) throw new Error('Owner name, email and phone are required.');

  const payload = {
    vendor_id: vendorId,
    status: 'ACTIVE',
    name,
    email,
    phone,
    verify_account: true,
    dashboard_access: false,
    schedule_option: Number(body?.schedule_option || 1),
    kyc_details: {
      account_type: clean(body?.account_type || 'BUSINESS').toUpperCase(),
      ...(clean(body?.business_type) ? { business_type: clean(body.business_type).toUpperCase() } : {}),
      ...(clean(body?.pan) ? { pan: clean(body.pan).toUpperCase() } : {}),
      ...(clean(body?.gst) ? { gst: clean(body.gst).toUpperCase() } : {}),
      ...(body?.uidai ? { uidai: Number(body.uidai) } : {}),
    },
  };

  if (settlementMethod === 'upi') {
    const vpa = clean(body?.upi_vpa);
    const accountHolder = clean(body?.account_holder || name);
    if (!vpa) throw new Error('UPI ID is required.');
    payload.upi = { vpa, account_holder: accountHolder };
  } else {
    const accountNumber = clean(body?.account_number);
    const ifsc = clean(body?.ifsc).toUpperCase();
    const accountHolder = clean(body?.account_holder || name);
    if (!accountNumber || !ifsc) throw new Error('Bank account number and IFSC are required.');
    payload.bank = { account_number: accountNumber, account_holder: accountHolder, ifsc };
  }

  const data = await cashfreeRequest('/easy-split/vendors', {
    method: 'POST',
    headers: {
      'x-api-version': process.env.CASHFREE_EASY_SPLIT_API_VERSION || '2025-01-01',
      'x-idempotency-key': `peacely-vendor-${owner.id}`,
    },
    body: JSON.stringify(payload),
  });

  const status = clean(data?.status || 'IN_BENE_CREATION').toUpperCase();

  await query(
    `INSERT INTO cashfree_vendors(owner_id,vendor_id,status,settlement_method,updated_at)
     VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP)
     ON CONFLICT(owner_id) DO UPDATE SET vendor_id=EXCLUDED.vendor_id,status=EXCLUDED.status,
       settlement_method=EXCLUDED.settlement_method,updated_at=CURRENT_TIMESTAMP`,
    [owner.id, vendorId, status, settlementMethod],
  );

  return { ...data, vendor_id: vendorId, status };
}

async function splitPaidOrderToOwner(orderId, invoiceId, amount) {
  if (!orderId || !invoiceId || amount <= 0 || !cashfreeConfigured()) return null;

  const ownerResult = await query(
    `SELECT p.owner_id
     FROM invoices i
     INNER JOIN tenants t ON t.id=i.tenant_id
     INNER JOIN properties p ON p.id=t.property_id
     WHERE i.id=$1 LIMIT 1`,
    [invoiceId],
  );
  const ownerId = ownerResult.rows[0]?.owner_id;
  if (!ownerId) return null;

  const vendor = await getOwnerCashfreeVendor(ownerId);
  if (!vendor || clean(vendor.status).toUpperCase() !== 'ACTIVE') {
    console.warn(`Cashfree vendor is not ACTIVE for owner ${ownerId}; payment remains in merchant ledger.`);
    return null;
  }

  const result = await cashfreeRequest(`/easy-split/orders/${encodeURIComponent(orderId)}/split`, {
    method: 'POST',
    headers: {
      'x-api-version': process.env.CASHFREE_EASY_SPLIT_API_VERSION || '2025-01-01',
      'x-idempotency-key': `peacely-split-${invoiceId}`,
    },
    body: JSON.stringify({
      split: [{
        vendor_id: vendor.vendor_id,
        amount: Number(amount),
        tags: {
          invoice_id: String(invoiceId),
          peacely_owner_id: String(ownerId),
        },
      }],
      disable_split: true,
    }),
  });

  return result;
}

async function createPaymentLink(invoice) {
  if (!cashfreeConfigured()) return null;

  const tenantPhone = normalizePhone(invoice.phone);
  const dueDate = new Date(`${invoice.due_date}T23:59:59+05:30`);
  dueDate.setDate(dueDate.getDate() + 7);

  const linkId = `PEACELY-${invoice.id}`;
  const ownerResult = await query(
    `SELECT p.owner_id FROM tenants t INNER JOIN properties p ON p.id=t.property_id WHERE t.id=$1 LIMIT 1`,
    [invoice.tenant_id],
  );
  const ownerVendor = ownerResult.rows[0]?.owner_id ? await getOwnerCashfreeVendor(ownerResult.rows[0].owner_id) : null;
  const notifyUrl = `${baseUrl()}/api/payment-automation/webhook/cashfree`;

  const payload = {
    customer_details: {
      customer_name: invoice.tenant_name,
      customer_phone: tenantPhone,
      ...(invoice.email ? { customer_email: invoice.email } : {}),
    },
    link_amount: Number(invoice.amount),
    link_auto_reminders: true,
    link_currency: 'INR',
    link_expiry_time: dueDate.toISOString(),
    link_id: linkId,
    link_partial_payments: false,
    link_notes: {
      invoice_id: String(invoice.id),
      tenant_id: String(invoice.tenant_id),
      ...(ownerVendor?.vendor_id ? { vendor_id: ownerVendor.vendor_id } : {}),
    },
    link_meta: {
      notify_url: notifyUrl,
      return_url: `${baseUrl()}/?payment=success&invoice=${invoice.id}`,
      upi_intent: true,
    },
    link_purpose: `Rent ${invoice.month || ''} - ${invoice.invoice_number}`.trim(),
  };

  const data = await cashfreeRequest('/links', {
    method: 'POST',
    headers: {
      'x-idempotency-key': `peacely-invoice-${invoice.id}`,
    },
    body: JSON.stringify(payload),
  });

  await query(
    `UPDATE invoices
     SET payment_provider='cashfree',
         payment_link_id=$1,
         payment_link_cf_id=$2,
         payment_link_url=$3,
         payment_link_status=$4,
         payment_link_created_at=CURRENT_TIMESTAMP,
         payment_link_paid_amount=$5,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=$6`,
    [
      clean(data?.link_id) || linkId,
      clean(data?.cf_link_id),
      clean(data?.link_url),
      clean(data?.link_status) || 'ACTIVE',
      num(data?.link_amount_paid),
      invoice.id,
    ],
  );

  return data;
}

async function loadInvoice(invoiceId) {
  const result = await query(
    `SELECT
       i.id,i.invoice_number,i.tenant_id,i.amount,i.month,i.due_date,i.status,
       i.paid_amount,i.payment_link_id,i.payment_link_cf_id,i.payment_link_url,i.payment_link_status,
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

async function ensureLinkForInvoice(invoiceId) {
  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return null;
  if (clean(invoice.payment_link_url)) return invoice;
  if (!cashfreeConfigured()) return invoice;
  try {
    await createPaymentLink(invoice);
    return await loadInvoice(invoiceId);
  } catch (error) {
    console.error(`Payment link creation failed for invoice ${invoiceId}:`, error.message);
    return invoice;
  }
}

function verifyCashfreeWebhook(req) {
  const signature = clean(req.headers['x-webhook-signature']);
  const timestamp = clean(req.headers['x-webhook-timestamp']);
  const rawBody = String(req.rawBody || '');
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_CLIENT_SECRET;

  if (!signature || !timestamp || !rawBody || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('base64');

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function fetchCashfreeLink(linkId) {
  if (!cashfreeConfigured() || !linkId) return null;
  return cashfreeRequest(`/links/${encodeURIComponent(linkId)}`, { method: 'GET' });
}

async function markInvoicePaidFromCashfree(linkId, fallbackAmount = 0) {
  if (!linkId) return null;

  const reference = await query(
    `SELECT id,payment_link_id
     FROM invoices
     WHERE payment_link_id=$1 OR payment_link_cf_id=$1
     ORDER BY id DESC
     LIMIT 1`,
    [String(linkId)],
  );

  const merchantLinkId = reference.rows[0]?.payment_link_id || String(linkId);
  const link = await fetchCashfreeLink(merchantLinkId);
  if (!link) return null;

  const notes = link.link_notes || {};
  const invoiceId = Number(notes.invoice_id || reference.rows[0]?.id || 0);
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) return null;

  const invoice = await loadInvoice(invoiceId);
  if (!invoice) return null;

  const paidFromLink = num(link.link_amount_paid, fallbackAmount);
  const invoiceAmount = num(invoice.amount);
  const paidAmount = Math.min(Math.max(paidFromLink, 0), invoiceAmount);

  await query(
    `UPDATE invoices
     SET paid_amount=$1,
         payment_link_status=$2,
         payment_link_paid_amount=$3,
         status=CASE
           WHEN $1 >= amount AND amount > 0 THEN 'Paid'
           WHEN $1 > 0 THEN 'Partially Paid'
           WHEN due_date < CURRENT_DATE THEN 'Overdue'
           ELSE 'Pending'
         END,
         paid_at=CASE
           WHEN $1 >= amount AND amount > 0 THEN COALESCE(paid_at,CURRENT_TIMESTAMP)
           ELSE NULL
         END,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=$4`,
    [paidAmount, clean(link.link_status), paidAmount, invoiceId],
  );

  if (paidAmount > 0) {
    const existing = await query(
      'SELECT id FROM payments WHERE invoice_id=$1 AND payment_method=$2 ORDER BY id DESC LIMIT 1',
      [invoiceId, 'Cashfree'],
    );

    if (!existing.rows.length) {
      await query(
        `INSERT INTO payments(tenant_id,invoice_id,amount,payment_date,payment_method,payment_month,notes)
         VALUES($1,$2,$3,CURRENT_DATE,'Cashfree',$4,$5)`,
        [
          invoice.tenant_id,
          invoiceId,
          paidAmount,
          invoice.month || '',
          'Automatically recorded from Cashfree payment link.',
        ],
      );
    }
  }

  return await loadInvoice(invoiceId);
}

async function sendWhatsAppTemplate(to, templateName, bodyTexts = []) {
  if (!whatsappConfigured() || !templateName) return null;

  const response = await fetch(
    `https://graph.facebook.com/${whatsappVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizePhone(to),
        type: 'template',
        template: {
          name: templateName,
          language: {
            code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en_US',
          },
          components: bodyTexts.length
            ? [{
                type: 'body',
                parameters: bodyTexts.map((text) => ({
                  type: 'text',
                  text: String(text),
                })),
              }]
            : undefined,
        },
      }),
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || `WhatsApp request failed: ${response.status}`);
  }
  return data;
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
  doc.text(`Due date: ${invoice.due_date}`);
  doc.text(`Payment status: PAID`);
  doc.moveDown();
  doc.fontSize(14).text(`Amount paid: ₹${num(invoice.paid_amount).toLocaleString('en-IN')}`);
  doc.moveDown(2);
  doc.fontSize(10).text('Thank you for your payment.');
  doc.end();

  return finished;
}

async function sendPaidInvoice(invoiceId) {
  if (!whatsappConfigured()) return false;

  const invoice = await loadInvoice(invoiceId);
  if (!invoice || clean(invoice.status).toLowerCase() !== 'paid') return false;

  const pdf = await buildInvoicePdf(invoice);
  const token = crypto.randomBytes(24).toString('hex');

  await query(
    `ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_token VARCHAR(80) DEFAULT ''`,
  );
  await query(
    'UPDATE invoices SET receipt_token=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',
    [token, invoiceId],
  );

  const publicUrl = `${baseUrl()}/api/payment-automation/receipt/${token}.pdf`;

  const response = await fetch(
    `https://graph.facebook.com/${whatsappVersion()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(invoice.phone),
        type: 'document',
        document: {
          link: publicUrl,
          filename: `${invoice.invoice_number}.pdf`,
          caption: `Paid rent invoice ${invoice.invoice_number}`,
        },
      }),
    },
  );

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message || `WhatsApp receipt failed: ${response.status}`);
  }

  return true;
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

async function createDueInvoices() {
  const owners = await query(`
    SELECT DISTINCT p.owner_id
    FROM properties p
    INNER JOIN tenants t ON t.property_id=p.id
    WHERE LOWER(COALESCE(t.status,''))='active'
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
       WHERE p.owner_id=$1 AND LOWER(COALESCE(t.status,''))='active' AND COALESCE(t.monthly_rent,0)>0`,
      [owner.owner_id],
    );

    for (const tenant of tenants.rows) {
      const due = dueDateForMonth(year, monthIndex, tenant.due_date);
      const dueIso = isoDate(due);
      const monthLabel = due.toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
      const threshold = addDays(due, -reminderDays);
      const todayIso = isoDate(today);

      if (todayIso < isoDate(threshold)) continue;

      const existing = await query(
        `SELECT id,status,payment_link_url FROM invoices
         WHERE tenant_id=$1 AND due_date >= date_trunc('month',$2::date)
           AND due_date < date_trunc('month',$2::date)+INTERVAL '1 month'
         ORDER BY id DESC LIMIT 1`,
        [tenant.id, dueIso],
      );

      let invoiceId = existing.rows[0]?.id || null;

      if (!invoiceId) {
        const invoiceNumber = `INV-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const result = await query(
          `INSERT INTO invoices(invoice_number,tenant_id,amount,month,due_date,status,paid_amount,delivery_status)
           VALUES($1,$2,$3,$4,$5::date,
             CASE WHEN $5::date < CURRENT_DATE THEN 'Overdue' ELSE 'Pending' END,
             0,'Not Sent')
           RETURNING id`,
          [invoiceNumber, tenant.id, num(tenant.monthly_rent), monthLabel, dueIso],
        );
        invoiceId = result.rows[0].id;
        created += 1;
      }

      const invoice = await ensureLinkForInvoice(invoiceId);
      if (invoice) {
        await sendDueReminderIfNeeded(invoice, settings);
      }
    }
  }

  return created;
}

async function sendDueReminderIfNeeded(invoice, settings) {
  if (!whatsappConfigured()) return false;
  if (!clean(invoice.payment_link_url)) return false;
  if (!settings.reminders_enabled) return false;
  if (clean(invoice.status).toLowerCase() === 'paid') return false;

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

  const template = process.env.WHATSAPP_REMINDER_TEMPLATE || 'peacely_rent_due';
  try {
    const result = await sendWhatsAppTemplate(
      invoice.phone,
      template,
      [
        invoice.tenant_name,
        `₹${num(invoice.amount).toLocaleString('en-IN')}`,
        invoice.due_date,
        invoice.payment_link_url,
      ],
    );

    await query(
      `INSERT INTO notifications(owner_id,tenant_id,invoice_id,channel,type,recipient,message,status,provider_message_id,sent_at)
       SELECT p.owner_id,$1,$2,'whatsapp',$3,$4,$5,'sent',$6,CURRENT_TIMESTAMP
       FROM properties p
       INNER JOIN tenants t ON t.property_id=p.id
       WHERE t.id=$1
       LIMIT 1`,
      [
        invoice.tenant_id,
        invoice.id,
        reminderType,
        normalizePhone(invoice.phone),
        `Automatic rent payment reminder: ${invoice.payment_link_url}`,
        result?.messages?.[0]?.id || '',
      ],
    );
    return true;
  } catch (error) {
    console.error(`WhatsApp reminder failed for invoice ${invoice.id}:`, error.message);
    return false;
  }
}

async function runPaymentAutomation() {
  try {
    await ensurePaymentColumns();
    await createDueInvoices();
  } catch (error) {
    console.error('Payment automation cycle failed:', error);
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

  const vendor = await getOwnerCashfreeVendor(req.paymentOwner.id);

  res.json({
    success: true,
    provider: 'Cashfree',
    automatic: cashfreeConfigured(),
    whatsapp: whatsappConfigured(),
    owner_vendor: Boolean(vendor),
    owner_vendor_status: vendor?.status || 'NOT_CONFIGURED',
    recurring_invoices: true,
    pending_invoices: Number(pending.rows[0]?.count || 0),
    paid_last_30_days: Number(recent.rows[0]?.count || 0),
  });
});

router.get('/payment-automation/vendor', auth, async (req, res) => {
  await ensurePaymentColumns();
  const vendor = await getOwnerCashfreeVendor(req.paymentOwner.id);
  return res.json({
    success: true,
    configured: Boolean(vendor),
    vendor: vendor ? {
      vendor_id: vendor.vendor_id,
      status: vendor.status,
      settlement_method: vendor.settlement_method,
    } : null,
  });
});

router.post('/payment-automation/vendor', auth, async (req, res) => {
  await ensurePaymentColumns();
  try {
    const vendor = await createCashfreeVendor(req.paymentOwner, req.body || {});
    return res.json({
      success: true,
      vendor: {
        vendor_id: vendor.vendor_id,
        status: vendor.status,
        settlement_method: clean(req.body?.settlement_method).toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Cashfree vendor onboarding failed:', error);
    return res.status(400).json({ success: false, error: error.message || 'Could not onboard owner for payments.' });
  }
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

router.post('/payment-automation/invoices/:id/link', auth, async (req, res) => {
  await ensurePaymentColumns();
  const id = Number(req.params.id);
  const invoice = await loadInvoice(id);
  if (!invoice || !await ownerOwnsInvoice(req.paymentOwner.id, id)) {
    return res.status(404).json({ success: false, error: 'Invoice not found.' });
  }
  const result = await ensureLinkForInvoice(id);
  return res.json({ success: true, invoice: result });
});

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

router.get('/payment-automation/receipt/:token.pdf', async (req, res) => {
  const token = clean(req.params.token);
  if (!token) return res.status(404).end();

  await ensurePaymentColumns();
  await query('ALTER TABLE invoices ADD COLUMN IF NOT EXISTS receipt_token VARCHAR(80) DEFAULT \'\'');

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

router.post('/payment-automation/webhook/cashfree', async (req, res) => {
  if (!verifyCashfreeWebhook(req)) {
    return res.status(401).json({ success: false, error: 'Invalid webhook signature.' });
  }

  try {
    const payload = req.body || {};
    const type = clean(payload.type || payload.event_type).toUpperCase();
    const success = type === 'PAYMENT_SUCCESS_WEBHOOK' || type.includes('PAYMENT_SUCCESS');

    if (!success) return res.json({ success: true, ignored: true });

    const order = payload?.data?.order || {};
    const payment = payload?.data?.payment || {};
    const cfLinkId =
      clean(order?.order_tags?.cf_link_id) ||
      clean(order?.order_tags?.payment_link_id) ||
      clean(payload?.data?.link?.link_id) ||
      clean(payload?.link_id);

    if (!cfLinkId) return res.json({ success: true, ignored: true });

    const orderId = clean(order?.order_id || order?.orderId || payload?.data?.order_id);
    const invoice = await markInvoicePaidFromCashfree(
      cfLinkId,
      num(payment?.payment_amount),
    );

    if (invoice?.status === 'Paid' && orderId) {
      try {
        await splitPaidOrderToOwner(orderId, invoice.id, num(invoice.amount));
      } catch (error) {
        console.error(`Cashfree Easy Split failed for invoice ${invoice.id}:`, error.message);
      }
    }

    if (invoice?.status === 'Paid') {
      try {
        await sendPaidInvoice(invoice.id);
      } catch (error) {
        console.error(`Paid invoice WhatsApp failed for invoice ${invoice.id}:`, error.message);
      }
    }

    return res.json({ success: true, invoice_id: invoice?.id || null, status: invoice?.status || null });
  } catch (error) {
    console.error('Cashfree webhook processing failed:', error);
    return res.status(500).json({ success: false, error: 'Webhook processing failed.' });
  }
});

export { runPaymentAutomation };
export default router;
