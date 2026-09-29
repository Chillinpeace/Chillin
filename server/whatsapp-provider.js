import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';

const clean = (value) => String(value ?? '').trim();

function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

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
    req.whatsappOwner = owner;
    next();
  } catch (error) {
    console.error('WhatsApp auth error:', error);
    return res.status(500).json({ success: false, error: 'Authentication check failed.' });
  }
}

function mode() {
  const explicit = clean(process.env.PEACELY_WHATSAPP_MODE).toLowerCase();
  if (['mock', 'sandbox', 'live'].includes(explicit)) return explicit;
  const env = clean(process.env.PEACELY_ENV || process.env.NODE_ENV).toLowerCase();
  return env === 'production' ? 'live' : 'mock';
}

function credentials() {
  return {
    accessToken: clean(process.env.META_WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_ACCESS_TOKEN),
    phoneNumberId: clean(process.env.META_WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_NUMBER_ID),
  };
}

function graphApiVersion() {
  return clean(process.env.META_GRAPH_API_VERSION || process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0');
}

function configured() {
  const c = credentials();
  return Boolean(c.accessToken && c.phoneNumberId);
}

function normalizePhone(value) {
  let phone = String(value || '').replace(/[^0-9]/g, '');
  if (phone.length === 10) phone = '91' + phone;
  return phone;
}

function modeAllowsText() {
  return clean(process.env.PEACELY_WHATSAPP_ALLOW_TEXT_MESSAGES).toLowerCase() === 'true';
}

async function ensureWhatsAppSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER,
      invoice_id INTEGER,
      channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
      type VARCHAR(50) NOT NULL DEFAULT 'manual',
      recipient VARCHAR(255) DEFAULT '',
      message TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'queued',
      provider_message_id VARCHAR(255),
      provider_status VARCHAR(40) DEFAULT '',
      provider_error TEXT DEFAULT '',
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS provider_message_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS provider_status VARCHAR(40) DEFAULT '',
      ADD COLUMN IF NOT EXISTS provider_error TEXT DEFAULT '';
    CREATE INDEX IF NOT EXISTS idx_notifications_provider_message_id
      ON notifications(provider_message_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_owner_created
      ON notifications(owner_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS peacely_whatsapp_webhook_events (
      id BIGSERIAL PRIMARY KEY,
      event_key VARCHAR(500) NOT NULL UNIQUE,
      provider_message_id VARCHAR(255) DEFAULT '',
      status VARCHAR(40) DEFAULT '',
      owner_id INTEGER,
      notification_id INTEGER,
      error_text TEXT DEFAULT '',
      event_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_wa_webhook_events_message
      ON peacely_whatsapp_webhook_events(provider_message_id);
  `);
}

function webhookVerifyToken() {
  return clean(process.env.META_WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN);
}

function webhookAppSecret() {
  return clean(process.env.META_WHATSAPP_APP_SECRET || process.env.WHATSAPP_APP_SECRET || process.env.META_APP_SECRET);
}

function webhookUnsignedAllowed() {
  return clean(process.env.PEACELY_WHATSAPP_WEBHOOK_ALLOW_UNSIGNED).toLowerCase() === 'true' && mode() !== 'live';
}

function verifyWebhookSignature(req) {
  const secret = webhookAppSecret();
  const signature = clean(req.headers['x-hub-signature-256']);
  const rawBody = String(req.rawBody || '');
  if (!secret || !signature || !rawBody) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const webhookStatusRank = { accepted: 0, sent: 1, delivered: 2, read: 3, failed: 99 };

async function applyWhatsAppStatus({ providerMessageId, status, errorText = '', eventAt = null, eventKey }) {
  await ensureWhatsAppSchema();
  const normalizedStatus = clean(status).toLowerCase();
  if (!providerMessageId || !Object.prototype.hasOwnProperty.call(webhookStatusRank, normalizedStatus)) return { processed: false, reason: 'invalid_status' };

  const existing = await query(
    "SELECT id,owner_id,provider_status,status FROM notifications WHERE provider_message_id=$1 AND channel='whatsapp' ORDER BY id DESC LIMIT 1",
    [providerMessageId],
  );
  const notification = existing.rows[0];
  if (!notification) return { processed: false, reason: 'unmatched_message' };

  const eventInsert = await query(
    "INSERT INTO peacely_whatsapp_webhook_events (event_key,provider_message_id,status,owner_id,notification_id,error_text,event_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_key) DO NOTHING RETURNING id",
    [eventKey, providerMessageId, normalizedStatus, notification.owner_id, notification.id, clean(errorText), eventAt ? new Date(eventAt) : null],
  );
  if (!eventInsert.rows.length) return { processed: true, duplicate: true, notification_id: notification.id };

  const currentRank = webhookStatusRank[clean(notification.provider_status).toLowerCase()] ?? 0;
  const incomingRank = webhookStatusRank[normalizedStatus];
  if (incomingRank < currentRank || (currentRank === 99 && incomingRank !== 99)) {
    return { processed: true, ignored: true, notification_id: notification.id };
  }

  const updated = await query(
    "UPDATE notifications SET provider_status=$1, status=CASE WHEN $1='failed' THEN 'failed' WHEN $1 IN ('sent','delivered','read') THEN $1 ELSE status END, provider_error=CASE WHEN $1='failed' THEN $2 ELSE COALESCE(NULLIF(provider_error,''),'') END, sent_at=CASE WHEN $1 IN ('sent','delivered','read') THEN COALESCE(sent_at,CURRENT_TIMESTAMP) ELSE sent_at END WHERE id=$3 RETURNING id,owner_id,provider_status,status",
    [normalizedStatus, clean(errorText), notification.id],
  );

  if (updated.rows[0]) {
    await query(
      "INSERT INTO peacely_audit_log (owner_id,actor_type,actor_id,action,entity_type,entity_id,metadata,environment) VALUES($1,'system','meta-whatsapp','whatsapp.delivery_status','notification',$2,$3::jsonb,$4)",
      [notification.owner_id, String(notification.id), JSON.stringify({ provider_message_id: providerMessageId, status: normalizedStatus, error: clean(errorText), event_key: eventKey }), mode() === 'live' ? 'production' : 'development'],
    ).catch((error) => console.error('WhatsApp delivery audit failed:', error));
  }

  return { processed: true, notification_id: notification.id, status: normalizedStatus };
}

async function tenantForOwner(ownerId, tenantId) {
  const result = await query(
    `SELECT t.id,t.name,t.phone,t.email,p.id AS property_id,p.name AS property_name
     FROM tenants t
     INNER JOIN properties p ON p.id=t.property_id
     WHERE t.id=$1 AND p.owner_id=$2
     LIMIT 1`,
    [tenantId, ownerId],
  );
  return result.rows[0] || null;
}

async function sendMeta(payload) {
  const c = credentials();
  if (!configured()) throw new Error('WhatsApp Cloud API credentials are not configured.');

  const response = await fetch(
    `https://graph.facebook.com/${graphApiVersion()}/${encodeURIComponent(c.phoneNumberId)}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
  );

  const responseText = await response.text();
  let data = null;
  try { data = responseText ? JSON.parse(responseText) : null; } catch {}

  if (!response.ok) {
    const detail = clean(data?.error?.message) || `WhatsApp API returned HTTP ${response.status}.`;
    throw new Error(detail);
  }

  const messageId = clean(data?.messages?.[0]?.id);
  if (!messageId) throw new Error('WhatsApp API did not return a message ID.');
  return { messageId, response: data };
}

async function sendWhatsAppMessage({ to, text, templateName = '', languageCode = 'en', parameters = [] }) {
  const providerMode = mode();
  const phone = normalizePhone(to);
  if (!/^91[6-9][0-9]{9}$/.test(phone)) throw new Error('A valid Indian WhatsApp number is required.');

  if (providerMode === 'mock') {
    return { provider: 'whatsapp', mode: 'mock', messageId: `mock_${crypto.randomBytes(8).toString('hex')}` };
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
  };

  if (clean(templateName)) {
    payload.type = 'template';
    payload.template = {
      name: clean(templateName),
      language: { code: clean(languageCode) || 'en' },
    };
    if (Array.isArray(parameters) && parameters.length) {
      payload.template.components = [{
        type: 'body',
        parameters: parameters.map((value) => ({
          type: 'text',
          text: String(value ?? ''),
        })),
      }];
    }
  } else {
    if (providerMode === 'live' && !modeAllowsText()) {
      throw new Error('Production WhatsApp messages must use an approved template unless PEACELY_WHATSAPP_ALLOW_TEXT_MESSAGES=true is explicitly enabled for an active conversation.');
    }
    payload.type = 'text';
    payload.text = { preview_url: true, body: clean(text) };
  }

  const result = await sendMeta(payload);
  return { provider: 'whatsapp', mode: providerMode, messageId: result.messageId };
}

async function recordNotification(ownerId, tenantId, invoiceId, recipient, message, result, type = 'manual_whatsapp') {
  await ensureWhatsAppSchema();
  const inserted = await query(
    `INSERT INTO notifications(owner_id,tenant_id,invoice_id,channel,type,recipient,message,status,provider_message_id,provider_status,sent_at)
     VALUES($1,$2,$3,'whatsapp',$4,$5,$6,'sent',$7,'accepted',CURRENT_TIMESTAMP)
     RETURNING id`,
    [ownerId, tenantId || null, invoiceId || null, type, recipient, message, result.messageId],
  );
  return inserted.rows[0]?.id || null;
}

router.get('/webhooks/whatsapp', async (req, res) => {
  const modeValue = clean(req.query['hub.mode']);
  const token = clean(req.query['hub.verify_token']);
  const challenge = clean(req.query['hub.challenge']);
  const expectedToken = webhookVerifyToken();
  if (modeValue === 'subscribe' && expectedToken && token === expectedToken && challenge) return res.status(200).type('text/plain').send(challenge);
  return res.status(403).json({ success: false, error: 'WhatsApp webhook verification failed.' });
});

router.post('/webhooks/whatsapp', async (req, res) => {
  if (!verifyWebhookSignature(req) && !webhookUnsignedAllowed()) return res.status(401).json({ success: false, error: 'Invalid WhatsApp webhook signature.' });
  const body = req.body || {};
  if (body.object !== 'whatsapp_business_account') return res.status(404).json({ success: false, error: 'Unsupported webhook object.' });

  let processed = 0, duplicates = 0, unmatched = 0;
  for (const entry of Array.isArray(body.entry) ? body.entry : []) {
    for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
      const value = change?.value || {};
      for (const status of Array.isArray(value.statuses) ? value.statuses : []) {
        const providerMessageId = clean(status?.id);
        const deliveryStatus = clean(status?.status).toLowerCase();
        if (!providerMessageId || !deliveryStatus) continue;
        const errors = Array.isArray(status?.errors) ? status.errors : [];
        const errorText = errors.map((item) => clean(item?.title || item?.message || item?.code)).filter(Boolean).join('; ');
        const eventKey = [providerMessageId, deliveryStatus, clean(status?.timestamp), clean(entry?.id)].join('|');
        const result = await applyWhatsAppStatus({ providerMessageId, status: deliveryStatus, errorText, eventAt: status?.timestamp ? Number(status.timestamp) * 1000 : null, eventKey });
        if (result.duplicate) duplicates += 1;
        else if (result.reason === 'unmatched_message') unmatched += 1;
        else if (result.processed) processed += 1;
      }
    }
  }
  return res.status(200).json({ success: true, processed, duplicates, unmatched });
});

router.get('/whatsapp/status', auth, async (req, res) => {
  await ensureWhatsAppSchema();
  const c = credentials();
  return res.json({
    success: true,
    provider: 'Meta WhatsApp Cloud API',
    mode: mode(),
    configured: configured(),
    phone_number_id_configured: Boolean(c.phoneNumberId),
    access_token_configured: Boolean(c.accessToken),
    graph_api_version: graphApiVersion(),
    text_messages_allowed: mode() !== 'live' || modeAllowsText(),
    automation_enabled: clean(process.env.PEACELY_WHATSAPP_AUTOMATION_ENABLED).toLowerCase() === 'true',
  });
});

router.get('/whatsapp/notifications', auth, async (req, res) => {
  await ensureWhatsAppSchema();
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 50));
  const result = await query(
    `SELECT n.id,n.tenant_id,n.invoice_id,n.channel,n.type,n.recipient,n.message,n.status,
            n.provider_message_id,n.provider_status,n.provider_error,n.sent_at,n.created_at,
            t.name AS tenant_name
     FROM notifications n
     LEFT JOIN tenants t ON t.id=n.tenant_id
     WHERE n.owner_id=$1
       AND n.channel='whatsapp'
     ORDER BY n.created_at DESC
     LIMIT $2`,
    [req.whatsappOwner.id, limit],
  );
  return res.json({ success: true, notifications: result.rows });
});

router.post('/whatsapp/send', auth, async (req, res) => {
  await ensureWhatsAppSchema();

  const tenantId = Number(req.body?.tenant_id);
  if (!Number.isInteger(tenantId) || tenantId <= 0) {
    return res.status(400).json({ success: false, error: 'A valid tenant_id is required.' });
  }

  const tenant = await tenantForOwner(req.whatsappOwner.id, tenantId);
  if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found.' });

  const text = clean(req.body?.message);
  const templateName = clean(req.body?.template_name);
  const languageCode = clean(req.body?.language_code || 'en');
  const parameters = Array.isArray(req.body?.parameters) ? req.body.parameters.slice(0, 20) : [];
  if (!text && !templateName) {
    return res.status(400).json({ success: false, error: 'Provide a message or an approved template name.' });
  }

  const phone = normalizePhone(tenant.phone);
  if (!phone) return res.status(400).json({ success: false, error: 'Tenant phone number is missing.' });

  try {
    const result = await sendWhatsAppMessage({
      to: phone,
      text,
      templateName,
      languageCode,
      parameters,
    });
    const notificationId = await recordNotification(
      req.whatsappOwner.id,
      tenant.id,
      Number(req.body?.invoice_id) || null,
      phone,
      text || `WhatsApp template: ${templateName}`,
      result,
      clean(req.body?.type) || 'manual_whatsapp',
    );
    return res.json({ success: true, notification_id: notificationId, ...result });
  } catch (error) {
    console.error('WhatsApp send failed:', error);
    return res.status(400).json({ success: false, error: error.message || 'WhatsApp message could not be sent.' });
  }
});

export { sendWhatsAppMessage, normalizePhone, mode as whatsappMode, configured as whatsappConfigured };
export default router;
