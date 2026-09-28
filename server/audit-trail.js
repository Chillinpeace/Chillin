import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';

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

async function owner(req, res, next) {
  try {
    const token = cookies(req)[SESSION_COOKIE];
    if (!token) return res.status(401).json({ success:false, error:'Login required.' });
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const result = await query(
      'SELECT o.id,o.name,o.email FROM sessions s INNER JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1',
      [hash],
    );
    if (!result.rows[0]) return res.status(401).json({ success:false, error:'Login required.' });
    req.owner = result.rows[0];
    next();
  } catch (error) {
    console.error('Audit authentication error:', error);
    return res.status(500).json({ success:false, error:'Unable to verify session.' });
  }
}

async function ensureSchema() {
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
    CREATE INDEX IF NOT EXISTS idx_peacely_audit_owner_time ON peacely_audit_log(owner_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_peacely_audit_property_time ON peacely_audit_log(property_id,created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_peacely_audit_tenant_time ON peacely_audit_log(tenant_id,created_at DESC);
  `);
}

ensureSchema().catch((error) => console.error('Audit schema warning:', error));

router.get('/api/audit-trail', owner, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 100),1),500);
    const propertyId = Number(req.query.property_id);
    const tenantId = Number(req.query.tenant_id);
    const params = [req.owner.id];
    const filters = ['owner_id=$1'];

    if (Number.isInteger(propertyId) && propertyId > 0) {
      params.push(propertyId);
      filters.push(`property_id=$${params.length}`);
    }
    if (Number.isInteger(tenantId) && tenantId > 0) {
      params.push(tenantId);
      filters.push(`tenant_id=$${params.length}`);
    }

    params.push(limit);
    const result = await query(
      `SELECT id,actor_type,actor_id,action,entity_type,entity_id,
              property_id,tenant_id,old_values,new_values,metadata,
              environment,created_at
       FROM peacely_audit_log
       WHERE ${filters.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${params.length}`,
      params,
    );

    return res.json({ success:true, events:result.rows });
  } catch (error) {
    console.error('Audit trail read error:', error);
    return res.status(500).json({ success:false, error:'Unable to load audit trail.' });
  }
});

export default router;
