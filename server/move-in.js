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
     WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`,
    [hash(token)],
  );
  return r.rows[0] || null;
}

async function ensureMoveInSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_move_in_reports (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
      tenant_acknowledged_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS peacely_evidence (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER,
      property_id INTEGER,
      room_id INTEGER,
      bed_id INTEGER,
      stage VARCHAR(30) NOT NULL DEFAULT 'move_in',
      category VARCHAR(80) NOT NULL DEFAULT 'general',
      file_name VARCHAR(255) DEFAULT '',
      mime_type VARCHAR(120) DEFAULT '',
      file_url TEXT DEFAULT '',
      note TEXT DEFAULT '',
      captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_movein_owner_tenant
      ON peacely_move_in_reports(owner_id,tenant_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_owner_tenant
      ON peacely_evidence(owner_id,tenant_id,stage);
  `);
}

async function tenant(ownerId, tenantId) {
  const r = await query(
    `SELECT t.id,t.property_id,t.room_id,t.bed_id,t.name,t.status,
            p.name AS property_name,r.room_number,b.bed_number
     FROM tenants t
     JOIN properties p ON p.id=t.property_id
     LEFT JOIN rooms r ON r.id=t.room_id
     LEFT JOIN beds b ON b.id=t.bed_id
     WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [tenantId,ownerId],
  );
  return r.rows[0] || null;
}

router.get('/api/move-in/:tenantId', async (req,res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureMoveInSchema();

    const tenantId = Number(req.params.tenantId);
    const t = await tenant(owner.id,tenantId);
    if (!t) return res.status(404).json({success:false,error:'Tenant not found.'});

    const [report,evidence] = await Promise.all([
      query(
        `SELECT id,status,checklist,tenant_acknowledged_at,completed_at,created_at,updated_at
         FROM peacely_move_in_reports
         WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC LIMIT 1`,
        [owner.id,tenantId],
      ),
      query(
        `SELECT id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at
         FROM peacely_evidence
         WHERE owner_id=$1 AND tenant_id=$2 AND stage='move_in'
         ORDER BY captured_at DESC`,
        [owner.id,tenantId],
      ),
    ]);

    return res.json({success:true,tenant:t,report:report.rows[0]||null,evidence:evidence.rows});
  } catch(error) {
    console.error('Move-in read error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to load move-in report.'});
  }
});

router.post('/api/move-in', async (req,res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureMoveInSchema();

    const tenantId = Number(req.body?.tenant_id);
    const t = await tenant(owner.id,tenantId);
    if (!t) return res.status(404).json({success:false,error:'Tenant not found.'});

    const existing = await query(
      `SELECT id FROM peacely_move_in_reports
       WHERE owner_id=$1 AND tenant_id=$2 AND status<>'completed'
       ORDER BY id DESC LIMIT 1`,
      [owner.id,tenantId],
    );
    if (existing.rows[0]) return res.json({success:true,id:existing.rows[0].id,existing:true});

    const r = await query(
      `INSERT INTO peacely_move_in_reports(owner_id,tenant_id,status,checklist)
       VALUES($1,$2,'draft',$3::jsonb)
       RETURNING id,status,checklist,created_at,updated_at`,
      [owner.id,tenantId,JSON.stringify({
        tenant_verified:false,
        agreement_signed:false,
        deposit_received:false,
        rent_configured:false,
        bed_assigned:Boolean(t.bed_id),
      })],
    );

    await recordAudit(owner.id,'move-in.started','move_in_report',String(r.rows[0].id),{
      tenantId,propertyId:t.property_id,
    });
    return res.status(201).json({success:true,report:r.rows[0]});
  } catch(error) {
    console.error('Move-in start error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to start move-in.'});
  }
});

router.patch('/api/move-in/:reportId/checklist', async (req,res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureMoveInSchema();

    const reportId = Number(req.params.reportId);
    const r = await query(
      `SELECT id,tenant_id,checklist FROM peacely_move_in_reports
       WHERE id=$1 AND owner_id=$2 LIMIT 1`,
      [reportId,owner.id],
    );
    if (!r.rows[0]) return res.status(404).json({success:false,error:'Move-in report not found.'});

    const current = r.rows[0].checklist || {};
    const allowed = ['tenant_verified','agreement_signed','deposit_received','rent_configured','bed_assigned'];
    for (const key of allowed) {
      if (typeof req.body?.[key] === 'boolean') current[key] = req.body[key];
    }

    const updated = await query(
      `UPDATE peacely_move_in_reports
       SET checklist=$1::jsonb,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND owner_id=$3
       RETURNING id,status,checklist,updated_at`,
      [JSON.stringify(current),reportId,owner.id],
    );

    await recordAudit(owner.id,'move-in.checklist.updated','move_in_report',String(reportId),{
      tenantId:r.rows[0].tenant_id,newValues:current,
    });
    return res.json({success:true,report:updated.rows[0]});
  } catch(error) {
    console.error('Move-in checklist error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to update move-in checklist.'});
  }
});

router.post('/api/move-in/:reportId/evidence', async (req,res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureMoveInSchema();

    const reportId = Number(req.params.reportId);
    const r = await query(
      `SELECT m.id,m.tenant_id,t.property_id,t.room_id,t.bed_id
       FROM peacely_move_in_reports m
       JOIN tenants t ON t.id=m.tenant_id
       JOIN properties p ON p.id=t.property_id
       WHERE m.id=$1 AND m.owner_id=$2 AND p.owner_id=$2 LIMIT 1`,
      [reportId,owner.id],
    );
    if (!r.rows[0]) return res.status(404).json({success:false,error:'Move-in report not found.'});

    const fileUrl = String(req.body?.file_url || '').trim();
    if (!fileUrl) {
      return res.status(400).json({success:false,error:'Evidence must reference an approved storage URL. Raw media is not stored in the Peacely database.'});
    }

    const e = await query(
      `INSERT INTO peacely_evidence
       (owner_id,tenant_id,property_id,room_id,bed_id,stage,category,file_name,mime_type,file_url,note,captured_at)
       VALUES($1,$2,$3,$4,$5,'move_in',$6,$7,$8,$9,$10,COALESCE($11::timestamptz,CURRENT_TIMESTAMP))
       RETURNING id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at`,
      [
        owner.id,r.rows[0].tenant_id,r.rows[0].property_id,r.rows[0].room_id,r.rows[0].bed_id,
        String(req.body?.category||'general').slice(0,80),
        String(req.body?.file_name||'').slice(0,255),
        String(req.body?.mime_type||'').slice(0,120),
        fileUrl,
        String(req.body?.note||''),
        req.body?.captured_at || null,
      ],
    );

    await recordAudit(owner.id,'move-in.evidence.added','evidence',String(e.rows[0].id),{
      tenantId:r.rows[0].tenant_id,propertyId:r.rows[0].property_id,
      metadata:{category:e.rows[0].category,file_name:e.rows[0].file_name},
    });
    return res.status(201).json({success:true,evidence:e.rows[0]});
  } catch(error) {
    console.error('Move-in evidence error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to add move-in evidence.'});
  }
});

router.post('/api/move-in/:reportId/complete', async (req,res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureMoveInSchema();

    const reportId = Number(req.params.reportId);
    const r = await query(
      `SELECT id,tenant_id,checklist
       FROM peacely_move_in_reports
       WHERE id=$1 AND owner_id=$2 LIMIT 1`,
      [reportId,owner.id],
    );
    if (!r.rows[0]) return res.status(404).json({success:false,error:'Move-in report not found.'});

    const checklist = r.rows[0].checklist || {};
    const required = ['tenant_verified','agreement_signed','deposit_received','rent_configured','bed_assigned'];
    const missing = required.filter((key) => checklist[key] !== true);
    if (missing.length) {
      return res.status(409).json({success:false,error:'Move-in checklist is incomplete.',missing});
    }

    const updated = await query(
      `UPDATE peacely_move_in_reports
       SET status='completed',completed_at=CURRENT_TIMESTAMP,tenant_acknowledged_at=COALESCE(tenant_acknowledged_at,CURRENT_TIMESTAMP),
           updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND owner_id=$2
       RETURNING id,status,checklist,tenant_acknowledged_at,completed_at,updated_at`,
      [reportId,owner.id],
    );

    await recordAudit(owner.id,'move-in.completed','move_in_report',String(reportId),{
      tenantId:r.rows[0].tenant_id,newValues:{status:'completed',checklist},
    });
    return res.json({success:true,report:updated.rows[0]});
  } catch(error) {
    console.error('Move-in completion error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to complete move-in.'});
  }
});

export default router;
