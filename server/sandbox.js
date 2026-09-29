import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
  }
  return cookies;
}

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

async function getOwner(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const result = await query(
    `SELECT o.id, o.name, o.email
     FROM sessions s
     INNER JOIN owners o ON o.id = s.owner_id
     WHERE s.token_hash = $1 AND s.expires_at > CURRENT_TIMESTAMP
     LIMIT 1`,
    [hashValue(token)],
  );
  return result.rows[0] || null;
}

async function requireOwner(req, res, next) {
  try {
    const owner = await getOwner(req);
    if (!owner) return res.status(401).json({ success: false, error: 'Login required.' });
    req.owner = owner;
    next();
  } catch (error) {
    console.error('Sandbox authentication error:', error);
    return res.status(500).json({ success: false, error: 'Unable to verify session.' });
  }
}

async function ensureSandboxSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_audit_log (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER,
      actor_type VARCHAR(40) NOT NULL DEFAULT 'owner',
      actor_id VARCHAR(120) DEFAULT '',
      action VARCHAR(120) NOT NULL,
      entity_type VARCHAR(80) DEFAULT '',
      entity_id VARCHAR(120) DEFAULT '',
      property_id INTEGER,
      tenant_id INTEGER,
      old_values JSONB,
      new_values JSONB,
      metadata JSONB,
      environment VARCHAR(30) NOT NULL DEFAULT 'development',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_peacely_audit_owner_time
      ON peacely_audit_log(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_peacely_audit_entity
      ON peacely_audit_log(entity_type, entity_id);
  `);
}

ensureSandboxSchema().catch((error) => {
  console.error('Peacely sandbox schema warning:', error);
});

function environmentName() {
  const explicit = String(process.env.PEACELY_ENV || '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') return explicit;
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

function providerMode(provider) {
  const env = environmentName();
  const key = `PEACELY_${provider.toUpperCase()}_MODE`;
  const configured = String(process.env[key] || '').trim().toLowerCase();
  if (configured === 'mock' || configured === 'sandbox' || configured === 'live') return configured;
  if (env === 'production') return 'live';
  return provider === 'cashfree' ? 'sandbox' : 'mock';
}

function assertSimulationAllowed(res, provider) {
  if (environmentName() === 'production' && providerMode(provider) === 'live') {
    res.status(409).json({
      success: false,
      error: 'Live provider simulation is disabled in production.',
    });
    return false;
  }
  return true;
}

router.get('/api/sandbox/health', requireOwner, asyncHandler(async (req, res) => {
  const checks = {};
  try {
    await query('SELECT 1');
    checks.database = { status: 'connected' };
  } catch (error) {
    checks.database = { status: 'error', message: error?.message || 'Database unavailable.' };
  }

  const env = environmentName();
  const credentials = {
    openai: Boolean(String(process.env.OPENAI_API_KEY || '').trim()),
    cashfree: Boolean(String(process.env.CASHFREE_CLIENT_ID || '').trim() && String(process.env.CASHFREE_CLIENT_SECRET || '').trim()),
    verification: Boolean(String(process.env.DIGILOCKER_CLIENT_ID || '').trim() && String(process.env.DIGILOCKER_CLIENT_SECRET || '').trim()),
    whatsapp: Boolean(String(process.env.WHATSAPP_ACCESS_TOKEN || process.env.META_WHATSAPP_ACCESS_TOKEN || '').trim()),
  };

  checks.providers = Object.fromEntries(
    Object.entries(credentials).map(([name, configured]) => [
      name,
      {
        mode: providerMode(name === 'openai' ? 'ai' : name),
        credentials_configured: configured,
      },
    ]),
  );

  const overall = checks.database.status === 'connected' ? 'ok' : 'degraded';
  return res.status(overall === 'ok' ? 200 : 503).json({
    success: overall === 'ok',
    environment: env,
    overall,
    checks,
    warning: env !== 'production'
      ? 'Non-production environment: external provider simulations are available.'
      : 'Production environment: live provider credentials must be verified before real transactions.',
    timestamp: new Date().toISOString(),
  });
}));

router.get('/api/sandbox/config', requireOwner, asyncHandler(async (req, res) => {
  const env = environmentName();
  return res.json({
    success: true,
    environment: env,
    sandbox_enabled: env !== 'production',
    providers: {
      cashfree: providerMode('cashfree'),
      verification: providerMode('verification'),
      whatsapp: providerMode('whatsapp'),
      ai: providerMode('ai'),
      notifications: providerMode('notifications'),
    },
    safeguards: {
      real_payments_allowed: env === 'production' && providerMode('cashfree') === 'live',
      mock_payment_available: env !== 'production' || providerMode('cashfree') !== 'live',
      real_verification_allowed: env === 'production' && providerMode('verification') === 'live',
      mock_whatsapp_available: env !== 'production',
      mock_ai_available: env !== 'production',
    },
  });
}));

router.get('/api/sandbox/audit', requireOwner, asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const result = await query(
    `SELECT id, actor_type, actor_id, action, entity_type, entity_id,
            property_id, tenant_id, old_values, new_values, metadata,
            environment, created_at
     FROM peacely_audit_log
     WHERE owner_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [req.owner.id, limit],
  );
  return res.json({ success: true, events: result.rows });
}));

router.post('/api/sandbox/payment', requireOwner, asyncHandler(async (req, res) => {
  if (!assertSimulationAllowed(res, 'cashfree')) return;
  const outcomes = new Set(['success', 'failure', 'cancelled', 'timeout', 'duplicate', 'webhook', 'refund']);
  const outcome = String(req.body?.outcome || 'success').toLowerCase();
  if (!outcomes.has(outcome)) {
    return res.status(400).json({ success: false, error: 'Unsupported payment simulation outcome.' });
  }

  const reference = `TEST-PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const result = {
    provider: providerMode('cashfree'),
    environment: environmentName(),
    simulated: true,
    outcome,
    reference,
    amount: Number(req.body?.amount || 0),
    invoice_id: req.body?.invoice_id ? Number(req.body.invoice_id) : null,
    timestamp: new Date().toISOString(),
  };

  await recordAudit(req.owner.id, 'sandbox.payment.simulated', 'payment', reference, {
    metadata: { outcome, result },
  });

  return res.json({ success: true, result });
}));

router.post('/api/sandbox/verification', requireOwner, asyncHandler(async (req, res) => {
  if (!assertSimulationAllowed(res, 'verification')) return;
  const outcomes = new Set(['success', 'failure', 'pending', 'consent_rejected', 'invalid_data', 'manual_review']);
  const outcome = String(req.body?.outcome || 'success').toLowerCase();
  if (!outcomes.has(outcome)) {
    return res.status(400).json({ success: false, error: 'Unsupported verification simulation outcome.' });
  }

  const reference = `TEST-KYC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const result = {
    provider: providerMode('verification'),
    environment: environmentName(),
    simulated: true,
    outcome,
    reference,
    tenant_id: req.body?.tenant_id ? Number(req.body.tenant_id) : null,
    masked_document: outcome === 'success' ? 'XXXX XXXX 1234' : '',
    timestamp: new Date().toISOString(),
  };

  await recordAudit(req.owner.id, 'sandbox.verification.simulated', 'tenant_verification', reference, {
    tenantId: result.tenant_id,
    metadata: { outcome, result },
  });

  return res.json({ success: true, result });
}));

async function applyWhatsAppStatusForSandbox(ownerId, notificationId, messageId, outcome, eventKey) {
  await query(`
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

  const ranks = { sent: 1, delivered: 2, read: 3, failed: 99 };
  const current = await query(
    "SELECT provider_status FROM notifications WHERE id=$1 AND owner_id=$2 AND provider_message_id=$3 AND channel='whatsapp' LIMIT 1",
    [notificationId, ownerId, messageId],
  );
  if (!current.rows.length) return { processed: false, reason: 'notification_not_found' };

  const event = await query(
    "INSERT INTO peacely_whatsapp_webhook_events (event_key,provider_message_id,status,owner_id,notification_id,error_text) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO NOTHING RETURNING id",
    [eventKey, messageId, outcome, ownerId, notificationId, outcome === 'failed' ? 'Simulated delivery failure.' : ''],
  );
  if (!event.rows.length) return { processed: true, duplicate: true };

  const currentRank = ranks[String(current.rows[0].provider_status || '').toLowerCase()] || 0;
  const incomingRank = ranks[outcome] || 0;
  if (incomingRank < currentRank || (currentRank === 99 && incomingRank !== 99)) return { processed: true, ignored: true };

  await query(
    "UPDATE notifications SET provider_status=$1,status=CASE WHEN $1='failed' THEN 'failed' ELSE $1 END,provider_error=CASE WHEN $1='failed' THEN 'Simulated delivery failure.' ELSE '' END,sent_at=CASE WHEN $1 IN ('sent','delivered','read') THEN COALESCE(sent_at,CURRENT_TIMESTAMP) ELSE sent_at END WHERE id=$2 AND owner_id=$3",
    [outcome, notificationId, ownerId],
  );
  return { processed: true, status: outcome };
}

router.post('/api/sandbox/whatsapp', requireOwner, asyncHandler(async (req, res) => {
  if (!assertSimulationAllowed(res, 'whatsapp')) return;
  const outcomes = new Set(['sent', 'delivered', 'read', 'failed']);
  const outcome = String(req.body?.outcome || 'sent').toLowerCase();
  if (!outcomes.has(outcome)) {
    return res.status(400).json({ success: false, error: 'Unsupported WhatsApp simulation outcome.' });
  }

  const messageId = `TEST-WA-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  if (!notificationId && !messageId) {
    return res.status(400).json({ success: false, error: 'notification_id or message_id is required for delivery simulation.' });
  }

  let notification = null;
  if (notificationId) {
    const notificationResult = await query(
      "SELECT id,provider_message_id,tenant_id FROM notifications WHERE id=$1 AND owner_id=$2 AND channel='whatsapp' LIMIT 1",
      [notificationId, req.owner.id],
    );
    notification = notificationResult.rows[0] || null;
  } else {
    const notificationResult = await query(
      "SELECT id,provider_message_id,tenant_id FROM notifications WHERE provider_message_id=$1 AND owner_id=$2 AND channel='whatsapp' LIMIT 1",
      [messageId, req.owner.id],
    );
    notification = notificationResult.rows[0] || null;
  }
  if (!notification) return res.status(404).json({ success: false, error: 'WhatsApp notification not found for this owner.' });
  messageId = notification.provider_message_id;

  const result = {
    provider: providerMode('whatsapp'),
    environment: environmentName(),
    simulated: true,
    outcome,
    message_id: messageId,
    to: String(req.body?.to || ''),
    template: String(req.body?.template || 'peacely_test'),
    timestamp: new Date().toISOString(),
  };

  const eventKey = `sandbox|${messageId}|${outcome}|${Date.now()}`;
  const webhookResult = await applyWhatsAppStatusForSandbox(req.owner.id, notification.id, messageId, outcome, eventKey);

  await recordAudit(req.owner.id, 'sandbox.whatsapp.simulated', 'message', messageId, {
    tenantId: notification.tenant_id,
    metadata: { outcome, result, notification_id: notification.id, webhook_result: webhookResult },
  });

  return res.json({ success: true, result: { ...result, notification_id: notification.id, webhook_result: webhookResult } });
}));

router.post('/api/sandbox/ai', requireOwner, asyncHandler(async (req, res) => {
  if (!assertSimulationAllowed(res, 'ai')) return;
  const prompt = String(req.body?.prompt || '').trim();
  if (!prompt) return res.status(400).json({ success: false, error: 'Prompt is required.' });

  const normalized = prompt.toLowerCase();
  let intent = 'unknown';
  if (normalized.includes('vacant') || normalized.includes('empty bed')) intent = 'list_vacant_beds';
  else if (normalized.includes('paid') || normalized.includes('rent')) intent = 'rent_status';
  else if (normalized.includes('maintenance') || normalized.includes('repair')) intent = 'maintenance_status';
  else if (normalized.includes('tenant')) intent = 'tenant_lookup';

  const result = {
    provider: providerMode('ai'),
    environment: environmentName(),
    simulated: true,
    intent,
    requires_confirmation: ['rent_status', 'list_vacant_beds', 'maintenance_status', 'tenant_lookup'].includes(intent),
    reply: intent === 'unknown'
      ? 'Sandbox AI received the command but could not map it to a supported Peacely intent yet.'
      : `Sandbox AI mapped this request to: ${intent}.`,
    timestamp: new Date().toISOString(),
  };

  await recordAudit(req.owner.id, 'sandbox.ai.simulated', 'ai_command', String(Date.now()), {
    metadata: { prompt, result },
  });

  return res.json({ success: true, result });
}));

router.post('/api/sandbox/reset', requireOwner, asyncHandler(async (req, res) => {
  if (environmentName() === 'production') {
    return res.status(409).json({ success: false, error: 'Sandbox reset is disabled in production.' });
  }

  await recordAudit(req.owner.id, 'sandbox.reset', 'sandbox', 'workspace', {
    metadata: { requested_at: new Date().toISOString() },
  });

  return res.json({
    success: true,
    message: 'Sandbox state reset marker created. No production data was changed.',
  });
}));


async function consumeProviderQuota(ownerId, provider, units = 1) {
  const safeProvider = String(provider || '').trim().toLowerCase();
  const amount = Math.max(Number(units) || 0, 0);
  if (!safeProvider || amount <= 0) return { allowed: true, used: 0, limit: null };

  const env = environmentName();
  if (env === 'development') return { allowed: true, used: 0, limit: null };

  const envKey = `PEACELY_${safeProvider.toUpperCase()}_DAILY_LIMIT`;
  const configured = Number(process.env[envKey]);
  const limit = Number.isFinite(configured) && configured > 0 ? configured : null;
  if (!limit) return { allowed: true, used: 0, limit: null };

  const result = await query(
    `SELECT COALESCE(SUM((metadata->>'units')::numeric),0) AS used
     FROM peacely_audit_log
     WHERE owner_id=$1
       AND action=$2
       AND created_at >= CURRENT_DATE`,
    [ownerId, `provider_usage.${safeProvider}`],
  );

  const used = Number(result.rows[0]?.used || 0);
  if (used + amount > limit) {
    return { allowed: false, used, limit };
  }

  await recordAudit(ownerId, `provider_usage.${safeProvider}`, 'provider', safeProvider, {
    metadata: { units: amount, environment: env },
  });

  return { allowed: true, used: used + amount, limit };
}

async function recordAudit(ownerId, action, entityType = '', entityId = '', options = {}) {
  await query(
    `INSERT INTO peacely_audit_log
      (owner_id, actor_type, actor_id, action, entity_type, entity_id,
       property_id, tenant_id, old_values, new_values, metadata, environment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [
      ownerId,
      options.actorType || 'owner',
      String(options.actorId || ownerId),
      action,
      entityType,
      String(entityId || ''),
      options.propertyId || null,
      options.tenantId || null,
      options.oldValues ? JSON.stringify(options.oldValues) : null,
      options.newValues ? JSON.stringify(options.newValues) : null,
      options.metadata ? JSON.stringify(options.metadata) : null,
      environmentName(),
    ],
  );
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('Sandbox route error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: error?.message || 'Sandbox error.' });
      }
    }
  };
}

export { recordAudit, consumeProviderQuota };
export default router;
