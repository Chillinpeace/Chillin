import express from 'express';
import crypto from 'crypto';
import { pool, query } from './database.js';
import { recordAudit } from './sandbox.js';

const router = express.Router();
const clean = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

function cashfreeSecret() {
  return clean(process.env.PEACELY_CASHFREE_SECRET_KEY || process.env.CASHFREE_CLIENT_SECRET);
}

async function ensureSchema() {
  await query(`
    ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS cashfree_order_id VARCHAR(120) DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_invoices_cashfree_order_id
      ON invoices(cashfree_order_id);

    CREATE TABLE IF NOT EXISTS peacely_cashfree_webhook_events (
      id BIGSERIAL PRIMARY KEY,
      event_key VARCHAR(180) NOT NULL UNIQUE,
      event_type VARCHAR(120) NOT NULL DEFAULT '',
      order_id VARCHAR(120) NOT NULL DEFAULT '',
      payment_id VARCHAR(120) NOT NULL DEFAULT '',
      payload_hash VARCHAR(64) NOT NULL DEFAULT '',
      received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      processed_at TIMESTAMPTZ,
      status VARCHAR(30) NOT NULL DEFAULT 'received',
      error_message TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_cashfree_events_order
      ON peacely_cashfree_webhook_events(order_id,received_at DESC);
  `);
}

function verifySignature(signature, timestamp, rawBody, secret) {
  if (!signature || !timestamp || !rawBody || !secret) return false;
  const signed = `${timestamp}${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');
  const actual = Buffer.from(String(signature));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && crypto.timingSafeEqual(actual, wanted);
}

function extractEvent(body) {
  const data = body?.data || {};
  const order = data?.order || body?.order || {};
  const payment = data?.payment || body?.payment || {};
  return {
    eventType: clean(body?.type || body?.event_type || body?.eventType),
    orderId: clean(order?.order_id || body?.order_id),
    paymentId: clean(payment?.cf_payment_id || payment?.payment_id || body?.cf_payment_id),
    paymentStatus: clean(payment?.payment_status || body?.payment_status).toUpperCase(),
    amount: num(payment?.payment_amount ?? order?.order_amount ?? body?.order_amount, NaN),
    currency: clean(order?.order_currency || body?.order_currency).toUpperCase(),
  };
}

router.post('/api/webhooks/cashfree', async (req, res) => {
  const rawBody = String(req.rawBody || '');
  const signature = clean(req.headers['x-webhook-signature']);
  const timestamp = clean(req.headers['x-webhook-timestamp']);
  const secret = cashfreeSecret();

  if (!secret) {
    return res.status(503).json({ success: false, error: 'Cashfree webhook secret is not configured.' });
  }

  const timestampMs = Number(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return res.status(401).json({ success: false, error: 'Expired or invalid webhook timestamp.' });
  }

  if (!verifySignature(signature, timestamp, rawBody, secret)) {
    return res.status(401).json({ success: false, error: 'Invalid Cashfree webhook signature.' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid webhook JSON.' });
  }

  const event = extractEvent(body);
  if (!event.orderId) return res.status(400).json({ success: false, error: 'Cashfree order id is missing.' });

  await ensureSchema();

  const eventKey = event.paymentId
    ? `${event.orderId}:${event.paymentId}:${event.eventType || event.paymentStatus}`
    : crypto.createHash('sha256').update(rawBody).digest('hex');

  const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO peacely_cashfree_webhook_events
       (event_key,event_type,order_id,payment_id,payload_hash)
       VALUES($1,$2,$3,$4,$5)
       ON CONFLICT (event_key) DO NOTHING
       RETURNING id`,
      [eventKey,event.eventType,event.orderId,event.paymentId,payloadHash],
    );

    if (!inserted.rows.length) {
      await client.query('COMMIT');
      return res.status(200).json({ success: true, duplicate: true });
    }

    const invoiceResult = await client.query(
      `SELECT i.id,i.invoice_number,i.tenant_id,i.amount,i.paid_amount,i.status,i.month,
              p.owner_id
       FROM invoices i
       INNER JOIN tenants t ON t.id=i.tenant_id
       INNER JOIN properties p ON p.id=t.property_id
       WHERE i.cashfree_order_id=$1
       LIMIT 1
       FOR UPDATE`,
      [event.orderId],
    );

    if (!invoiceResult.rows.length) {
      await client.query(
        `UPDATE peacely_cashfree_webhook_events
         SET status='unmatched',processed_at=CURRENT_TIMESTAMP,error_message=$2
         WHERE id=$1`,
        [inserted.rows[0].id,'No invoice is mapped to this Cashfree order.'],
      );
      await client.query('COMMIT');
      return res.status(202).json({ success: true, accepted: true, unmatched: true });
    }

    const invoice = invoiceResult.rows[0];
    const expectedAmount = num(invoice.amount);
    if (Number.isFinite(event.amount) && Math.abs(event.amount - expectedAmount) > 0.01) {
      await client.query(
        `UPDATE peacely_cashfree_webhook_events
         SET status='rejected',processed_at=CURRENT_TIMESTAMP,error_message=$2
         WHERE id=$1`,
        [inserted.rows[0].id,'Webhook payment amount does not match the invoice amount.'],
      );
      await client.query('COMMIT');
      return res.status(400).json({ success: false, error: 'Payment amount does not match the invoice.' });
    }

    if (event.currency && event.currency !== 'INR') {
      await client.query(
        `UPDATE peacely_cashfree_webhook_events
         SET status='rejected',processed_at=CURRENT_TIMESTAMP,error_message=$2
         WHERE id=$1`,
        [inserted.rows[0].id,'Unsupported payment currency.'],
      );
      await client.query('COMMIT');
      return res.status(400).json({ success: false, error: 'Unsupported payment currency.' });
    }

    if (event.paymentStatus === 'SUCCESS') {
      const transition = await client.query(
        `UPDATE invoices
         SET paid_amount=amount,
             status='Paid',
             paid_at=COALESCE(paid_at,CURRENT_TIMESTAMP),
             payment_link_status='cashfree_paid',
             updated_at=CURRENT_TIMESTAMP
         WHERE id=$1
           AND LOWER(COALESCE(status,'')) <> 'cancelled'
           AND NOT (LOWER(COALESCE(status,''))='paid' AND COALESCE(paid_amount,0) >= amount)
         RETURNING id`,
        [invoice.id],
      );

      if (transition.rows.length) {
        await client.query(
          `INSERT INTO payments
           (tenant_id,invoice_id,amount,payment_date,payment_method,payment_month,notes)
           VALUES($1,$2,$3,CURRENT_DATE,'Cashfree',COALESCE($4,''),$5)`,
          [
            invoice.tenant_id,
            invoice.id,
            expectedAmount,
            invoice.month,
            `Cashfree payment ${event.paymentId || event.orderId} confirmed by verified webhook.`,
          ],
        );
      }

      await client.query(
        `UPDATE peacely_cashfree_webhook_events
         SET status='processed',processed_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [inserted.rows[0].id],
      );

      await client.query('COMMIT');

      try {
        await recordAudit(invoice.owner_id, 'payment.cashfree.webhook_processed', 'invoice', String(invoice.id), {
          tenantId: invoice.tenant_id,
          metadata: {
            order_id: event.orderId,
            payment_id: event.paymentId,
            event_type: event.eventType,
            payment_status: event.paymentStatus,
          },
        });
      } catch (auditError) {
        console.error('Cashfree webhook audit logging failed:', auditError);
      }

      return res.status(200).json({ success: true, processed: true });
    }

    await client.query(
      `UPDATE peacely_cashfree_webhook_events
       SET status='ignored',processed_at=CURRENT_TIMESTAMP
       WHERE id=$1`,
      [inserted.rows[0].id],
    );
    await client.query('COMMIT');
    return res.status(200).json({ success: true, processed: false, status: event.paymentStatus || 'UNKNOWN' });
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('Cashfree webhook processing error:', error);
    return res.status(500).json({ success: false, error: 'Webhook processing failed.' });
  } finally {
    client.release();
  }
});

export default router;
