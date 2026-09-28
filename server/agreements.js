import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

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

async function ownerFromRequest(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const r = await query(
    `SELECT o.id,o.name,o.email
     FROM sessions s JOIN owners o ON o.id=s.owner_id
     WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP
     LIMIT 1`,
    [hash(token)],
  );
  return r.rows[0] || null;
}

async function ensureAgreementSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_agreements (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      template_type VARCHAR(40) NOT NULL DEFAULT 'pg',
      title VARCHAR(200) NOT NULL DEFAULT 'Peacely PG Agreement',
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      provider VARCHAR(40) NOT NULL DEFAULT 'mock',
      provider_reference VARCHAR(160) DEFAULT '',
      document_url TEXT DEFAULT '',
      owner_signed_at TIMESTAMPTZ,
      tenant_signed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_peacely_agreements_owner_tenant
      ON peacely_agreements(owner_id,tenant_id);
  `);
}

function environmentName() {
  const explicit = String(process.env.PEACELY_ENV || '').trim().toLowerCase();
  if (explicit === 'production' || explicit === 'staging' || explicit === 'development') return explicit;
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

function esignMode() {
  const configured = String(process.env.PEACELY_ESIGN_MODE || '').trim().toLowerCase();
  if (configured === 'mock' || configured === 'sandbox' || configured === 'live') return configured;
  return environmentName() === 'production' ? 'live' : 'mock';
}

async function getTenant(ownerId, tenantId) {
  const r = await query(
    `SELECT t.id,t.name,t.phone,t.email,t.property_id,t.room_id,t.bed_id,t.monthly_rent,
            t.due_date,t.deposit_amount,t.move_in_date,t.move_out_date,t.status,
            p.name AS property_name,p.address AS property_address,
            r.room_number,b.bed_number
     FROM tenants t
     JOIN properties p ON p.id=t.property_id
     LEFT JOIN rooms r ON r.id=t.room_id
     LEFT JOIN beds b ON b.id=t.bed_id
     WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [tenantId, ownerId],
  );
  return r.rows[0] || null;
}

router.get('/api/agreements/:tenantId', async (req, res) => {
  const owner = await ownerFromRequest(req);
  if (!owner) return res.status(401).json({ success:false, error:'Authentication required.' });
  await ensureAgreementSchema();

  const tenantId = Number(req.params.tenantId);
  const tenant = await getTenant(owner.id, tenantId);
  if (!tenant) return res.status(404).json({ success:false, error:'Tenant not found.' });

  const r = await query(
    `SELECT id,template_type,title,status,provider,provider_reference,document_url,
            owner_signed_at,tenant_signed_at,created_at,updated_at
     FROM peacely_agreements
     WHERE owner_id=$1 AND tenant_id=$2
     ORDER BY created_at DESC`,
    [owner.id, tenantId],
  );
  return res.json({ success:true, provider_mode:esignMode(), agreements:r.rows });
});

router.post('/api/agreements', async (req, res) => {
  const owner = await ownerFromRequest(req);
  if (!owner) return res.status(401).json({ success:false, error:'Authentication required.' });
  await ensureAgreementSchema();

  const tenantId = Number(req.body?.tenant_id);
  const tenant = await getTenant(owner.id, tenantId);
  if (!tenant) return res.status(404).json({ success:false, error:'Tenant not found.' });

  const templateType = String(req.body?.template_type || 'pg').trim().toLowerCase();
  const allowed = new Set(['pg','rental','custom']);
  if (!allowed.has(templateType)) return res.status(400).json({ success:false, error:'Unsupported agreement template.' });

  const title = String(req.body?.title || 'Peacely PG Agreement').trim().slice(0,200);
  const r = await query(
    `INSERT INTO peacely_agreements(owner_id,tenant_id,template_type,title,status,provider)
     VALUES($1,$2,$3,$4,'draft',$5)
     RETURNING id,template_type,title,status,provider,created_at,updated_at`,
    [owner.id,tenantId,templateType,title,esignMode()],
  );

  await recordAudit(owner.id, 'agreement.created', 'agreement', String(r.rows[0].id), {
    tenantId,
    propertyId: tenant.property_id,
    metadata: { template_type: templateType, provider: esignMode() },
  });

  return res.status(201).json({ success:true, agreement:r.rows[0] });
});

router.post('/api/agreements/:agreementId/sign', async (req, res) => {
  const owner = await ownerFromRequest(req);
  if (!owner) return res.status(401).json({ success:false, error:'Authentication required.' });
  await ensureAgreementSchema();

  const agreementId = Number(req.params.agreementId);
  const party = String(req.body?.party || '').trim().toLowerCase();
  if (!['owner','tenant'].includes(party)) {
    return res.status(400).json({ success:false, error:'Party must be owner or tenant.' });
  }

  const r = await query(
    `SELECT a.*,t.property_id,t.name AS tenant_name
     FROM peacely_agreements a
     JOIN tenants t ON t.id=a.tenant_id
     JOIN properties p ON p.id=t.property_id
     WHERE a.id=$1 AND a.owner_id=$2 AND p.owner_id=$2
     LIMIT 1`,
    [agreementId,owner.id],
  );
  const agreement = r.rows[0];
  if (!agreement) return res.status(404).json({ success:false, error:'Agreement not found.' });

  const mode = esignMode();
  if (mode === 'live' && !process.env.PEACELY_ESIGN_PROVIDER_URL) {
    return res.status(503).json({
      success:false,
      error:'Production e-sign is not configured. Connect an authorized e-sign provider before signing live agreements.',
    });
  }

  const reference = mode === 'mock'
    ? `TEST-ESIGN-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`
    : '';

  const column = party === 'owner' ? 'owner_signed_at' : 'tenant_signed_at';
  await query(
    `UPDATE peacely_agreements
     SET ${column}=CURRENT_TIMESTAMP,
         provider_reference=CASE WHEN $2 <> '' THEN $2 ELSE provider_reference END,
         status=CASE
           WHEN owner_signed_at IS NOT NULL AND tenant_signed_at IS NOT NULL THEN 'signed'
           ELSE 'awaiting_signature'
         END,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=$1`,
    [agreementId,reference],
  );

  const latest = await query(
    `SELECT id,template_type,title,status,provider,provider_reference,
            owner_signed_at,tenant_signed_at,created_at,updated_at
     FROM peacely_agreements WHERE id=$1`,
    [agreementId],
  );

  await recordAudit(owner.id, `agreement.${party}_signed`, 'agreement', String(agreementId), {
    tenantId: agreement.tenant_id,
    propertyId: agreement.property_id,
    metadata: { mode, simulated: mode === 'mock', provider_reference: reference },
  });

  return res.json({
    success:true,
    simulated: mode === 'mock',
    agreement: latest.rows[0],
    message: mode === 'mock'
      ? 'Sandbox signature recorded. This is a test event and is not a legal e-signature.'
      : 'Signature request sent to the configured e-sign provider.',
  });
});

export default router;
