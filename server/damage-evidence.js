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

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_damage_reports (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      move_in_report_id BIGINT,
      move_out_report_id BIGINT,
      category VARCHAR(100) NOT NULL DEFAULT 'general',
      description TEXT NOT NULL DEFAULT '',
      estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      owner_decision VARCHAR(40) NOT NULL DEFAULT 'pending',
      owner_decision_note TEXT NOT NULL DEFAULT '',
      tenant_acknowledged_at TIMESTAMPTZ,
      status VARCHAR(40) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_damage_owner_tenant
      ON peacely_damage_reports(owner_id,tenant_id);
  `);
}

async function getTenant(ownerId, tenantId) {
  const r = await query(
    `SELECT t.id,t.name,t.property_id,t.room_id,t.bed_id,
            p.name AS property_name,r.room_number,b.bed_number
     FROM tenants t JOIN properties p ON p.id=t.property_id
     LEFT JOIN rooms r ON r.id=t.room_id LEFT JOIN beds b ON b.id=t.bed_id
     WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [tenantId,ownerId],
  );
  return r.rows[0] || null;
}

router.get('/api/damage-evidence/:tenantId', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const tenantId=Number(req.params.tenantId);
    const t=await getTenant(owner.id,tenantId);
    if(!t) return res.status(404).json({success:false,error:'Tenant not found.'});

    const [moveIn,moveOut,reports]=await Promise.all([
      query(`SELECT id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at
              FROM peacely_evidence
              WHERE owner_id=$1 AND tenant_id=$2 AND stage='move_in'
              ORDER BY category,captured_at ASC`,[owner.id,tenantId]),
      query(`SELECT id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at
              FROM peacely_evidence
              WHERE owner_id=$1 AND tenant_id=$2 AND stage='move_out'
              ORDER BY category,captured_at ASC`,[owner.id,tenantId]),
      query(`SELECT id,move_in_report_id,move_out_report_id,category,description,
                    estimated_cost,owner_decision,owner_decision_note,
                    tenant_acknowledged_at,status,created_at,updated_at
             FROM peacely_damage_reports
             WHERE owner_id=$1 AND tenant_id=$2
             ORDER BY created_at DESC`,[owner.id,tenantId]),
    ]);

    const byCategory = (rows) => rows.reduce((m,e) => {
      const key=String(e.category||'general');
      (m[key] ||= []).push(e);
      return m;
    },{});
    const inBy=byCategory(moveIn.rows);
    const outBy=byCategory(moveOut.rows);
    const categories=[...new Set([...Object.keys(inBy),...Object.keys(outBy)])];
    const comparison=categories.map(category => ({
      category,
      move_in_evidence: inBy[category]||[],
      move_out_evidence: outBy[category]||[],
      has_move_in:Boolean(inBy[category]?.length),
      has_move_out:Boolean(outBy[category]?.length),
      requires_review:Boolean(inBy[category]?.length && outBy[category]?.length),
    }));

    await recordAudit(owner.id,'damage-evidence.viewed','tenant',String(tenantId),{tenantId,propertyId:t.property_id});
    return res.json({success:true,tenant:t,comparison,damage_reports:reports.rows,
      disclaimer:'Evidence comparison records observations and owner decisions. It does not determine legal liability or prove that damage was caused by a tenant.'});
  } catch(error) {
    console.error('Damage evidence read error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to load damage evidence.'});
  }
});

router.post('/api/damage-evidence', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const tenantId=Number(req.body?.tenant_id);
    const t=await getTenant(owner.id,tenantId);
    if(!t) return res.status(404).json({success:false,error:'Tenant not found.'});

    const category=String(req.body?.category||'general').trim().slice(0,100);
    const description=String(req.body?.description||'').trim();
    const estimatedCost=Math.max(Number(req.body?.estimated_cost||0),0);
    const moveInReportId=req.body?.move_in_report_id ? Number(req.body.move_in_report_id) : null;
    const moveOutReportId=req.body?.move_out_report_id ? Number(req.body.move_out_report_id) : null;

    if(!description) return res.status(400).json({success:false,error:'Description is required.'});

    const r=await query(
      `INSERT INTO peacely_damage_reports
       (owner_id,tenant_id,move_in_report_id,move_out_report_id,category,description,estimated_cost)
       VALUES($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [owner.id,tenantId,moveInReportId,moveOutReportId,category,description,estimatedCost],
    );
    await recordAudit(owner.id,'damage-report.created','damage_report',String(r.rows[0].id),{
      tenantId,propertyId:t.property_id,newValues:r.rows[0],
    });
    return res.status(201).json({success:true,report:r.rows[0]});
  } catch(error) {
    console.error('Damage report create error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to create damage report.'});
  }
});

router.patch('/api/damage-evidence/:reportId/decision', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const id=Number(req.params.reportId);
    const current=await query(`SELECT id,tenant_id,owner_decision,owner_decision_note,status
      FROM peacely_damage_reports WHERE id=$1 AND owner_id=$2 LIMIT 1`,[id,owner.id]);
    if(!current.rows[0]) return res.status(404).json({success:false,error:'Damage report not found.'});

    const allowed=new Set(['pending','charge_tenant','owner_absorbs','insurance','disputed','no_charge']);
    const decision=String(req.body?.owner_decision||'pending');
    if(!allowed.has(decision)) return res.status(400).json({success:false,error:'Unsupported owner decision.'});
    const note=String(req.body?.owner_decision_note||'').trim();

    const r=await query(`UPDATE peacely_damage_reports
      SET owner_decision=$1,owner_decision_note=$2,status=$3,updated_at=CURRENT_TIMESTAMP
      WHERE id=$4 AND owner_id=$5 RETURNING *`,
      [decision,note,decision==='disputed'?'disputed':'reviewed',id,owner.id]);
    await recordAudit(owner.id,'damage-report.decision.updated','damage_report',String(id),{
      tenantId:current.rows[0].tenant_id,
      oldValues:{owner_decision:current.rows[0].owner_decision,owner_decision_note:current.rows[0].owner_decision_note,status:current.rows[0].status},
      newValues:{owner_decision:decision,owner_decision_note:note,status:r.rows[0].status},
    });
    return res.json({success:true,report:r.rows[0]});
  } catch(error) {
    console.error('Damage decision error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to update damage decision.'});
  }
});

router.post('/api/damage-evidence/:reportId/acknowledge', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const id=Number(req.params.reportId);
    const r=await query(`UPDATE peacely_damage_reports
      SET tenant_acknowledged_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND owner_id=$2 RETURNING *`,[id,owner.id]);
    if(!r.rows[0]) return res.status(404).json({success:false,error:'Damage report not found.'});
    await recordAudit(owner.id,'damage-report.tenant-acknowledged','damage_report',String(id),{
      tenantId:r.rows[0].tenant_id,
      metadata:{acknowledgement:'recorded_by_owner_or_tenant_flow'},
    });
    return res.json({success:true,report:r.rows[0]});
  } catch(error) {
    console.error('Damage acknowledgement error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to record acknowledgement.'});
  }
});

export default router;
