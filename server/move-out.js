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
    `SELECT o.id,o.name,o.email FROM sessions s JOIN owners o ON o.id=s.owner_id
     WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`,
    [hash(token)],
  );
  return r.rows[0] || null;
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_move_out_reports (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      notice_date DATE,
      expected_move_out DATE,
      status VARCHAR(40) NOT NULL DEFAULT 'notice',
      checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
      final_ledger JSONB NOT NULL DEFAULT '{}'::jsonb,
      deposit_settlement JSONB NOT NULL DEFAULT '{}'::jsonb,
      tenant_acknowledged_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_moveout_owner_tenant
      ON peacely_move_out_reports(owner_id,tenant_id);
  `);
}

async function getTenant(ownerId, tenantId) {
  const r = await query(
    `SELECT t.id,t.name,t.property_id,t.room_id,t.bed_id,t.monthly_rent,t.deposit_amount,
            t.due_date,t.move_in_date,t.move_out_date,t.status,
            p.name AS property_name,r.room_number,b.bed_number
     FROM tenants t JOIN properties p ON p.id=t.property_id
     LEFT JOIN rooms r ON r.id=t.room_id LEFT JOIN beds b ON b.id=t.bed_id
     WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [tenantId,ownerId],
  );
  return r.rows[0] || null;
}

async function optional(sql, params) {
  try { return await query(sql,params); } catch { return {rows:[]}; }
}

router.post('/api/move-out', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();

    const tenantId=Number(req.body?.tenant_id);
    const t=await getTenant(owner.id,tenantId);
    if(!t) return res.status(404).json({success:false,error:'Tenant not found.'});

    const noticeDate=String(req.body?.notice_date || new Date().toISOString().slice(0,10));
    const expected=String(req.body?.expected_move_out || t.move_out_date || '').trim();
    if(!expected) return res.status(400).json({success:false,error:'Expected move-out date is required.'});

    const r=await query(
      `INSERT INTO peacely_move_out_reports(owner_id,tenant_id,notice_date,expected_move_out,status,checklist)
       VALUES($1,$2,$3,$4,'notice',$5::jsonb)
       RETURNING id,status,notice_date,expected_move_out,checklist,final_ledger,deposit_settlement,created_at,updated_at`,
      [owner.id,tenantId,noticeDate,expected,JSON.stringify({
        rent_settled:false,maintenance_checked:false,damage_checked:false,
        documents_checked:false,inspection_completed:false,
      })],
    );

    await recordAudit(owner.id,'move-out.started','move_out_report',String(r.rows[0].id),{
      tenantId,propertyId:t.property_id,newValues:{expected_move_out:expected},
    });
    return res.status(201).json({success:true,report:r.rows[0]});
  } catch(error) {
    console.error('Move-out start error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to start move-out.'});
  }
});

router.get('/api/move-out/:tenantId', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const tenantId=Number(req.params.tenantId);
    const t=await getTenant(owner.id,tenantId);
    if(!t) return res.status(404).json({success:false,error:'Tenant not found.'});

    const [reports,evidence,payments,invoices]=await Promise.all([
      query(`SELECT id,status,notice_date,expected_move_out,checklist,final_ledger,deposit_settlement,
                    tenant_acknowledged_at,completed_at,created_at,updated_at
             FROM peacely_move_out_reports WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,[owner.id,tenantId]),
      optional(`SELECT id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at
                FROM peacely_evidence WHERE owner_id=$1 AND tenant_id=$2 AND stage='move_out'
                ORDER BY captured_at DESC`,[owner.id,tenantId]),
      optional(`SELECT id,amount,payment_date,payment_method,payment_month,notes,invoice_id
                FROM payments WHERE tenant_id=$1 ORDER BY payment_date DESC NULLS LAST,id DESC`,[tenantId]),
      optional(`SELECT id,invoice_number,amount,paid_amount,due_date,status,paid_at
                FROM invoices WHERE tenant_id=$1 ORDER BY due_date DESC NULLS LAST,id DESC`,[tenantId]),
    ]);
    return res.json({success:true,tenant:t,reports:reports.rows,evidence:evidence.rows,payments:payments.rows,invoices:invoices.rows});
  } catch(error) {
    console.error('Move-out read error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to load move-out.'});
  }
});

router.patch('/api/move-out/:reportId/checklist', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const id=Number(req.params.reportId);
    const r=await query(`SELECT id,tenant_id,checklist FROM peacely_move_out_reports WHERE id=$1 AND owner_id=$2 LIMIT 1`,[id,owner.id]);
    if(!r.rows[0]) return res.status(404).json({success:false,error:'Move-out report not found.'});

    const checklist={...(r.rows[0].checklist||{})};
    for(const key of ['rent_settled','maintenance_checked','damage_checked','documents_checked','inspection_completed']) {
      if(typeof req.body?.[key]==='boolean') checklist[key]=req.body[key];
    }
    const updated=await query(
      `UPDATE peacely_move_out_reports SET checklist=$1::jsonb,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND owner_id=$3 RETURNING id,status,checklist,updated_at`,
      [JSON.stringify(checklist),id,owner.id],
    );
    await recordAudit(owner.id,'move-out.checklist.updated','move_out_report',String(id),{
      tenantId:r.rows[0].tenant_id,newValues:checklist,
    });
    return res.json({success:true,report:updated.rows[0]});
  } catch(error) {
    console.error('Move-out checklist error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to update checklist.'});
  }
});

router.post('/api/move-out/:reportId/evidence', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();

    const id=Number(req.params.reportId);
    const r=await query(
      `SELECT m.id,m.tenant_id,t.property_id,t.room_id,t.bed_id
       FROM peacely_move_out_reports m JOIN tenants t ON t.id=m.tenant_id
       JOIN properties p ON p.id=t.property_id
       WHERE m.id=$1 AND m.owner_id=$2 AND p.owner_id=$2 LIMIT 1`,
      [id,owner.id],
    );
    if(!r.rows[0]) return res.status(404).json({success:false,error:'Move-out report not found.'});
    const fileUrl=String(req.body?.file_url||'').trim();
    if(!fileUrl) return res.status(400).json({success:false,error:'Evidence must reference an approved storage URL.'});

    const e=await query(
      `INSERT INTO peacely_evidence(owner_id,tenant_id,property_id,room_id,bed_id,stage,category,file_name,mime_type,file_url,note,captured_at)
       VALUES($1,$2,$3,$4,$5,'move_out',$6,$7,$8,$9,$10,COALESCE($11::timestamptz,CURRENT_TIMESTAMP))
       RETURNING id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at`,
      [owner.id,r.rows[0].tenant_id,r.rows[0].property_id,r.rows[0].room_id,r.rows[0].bed_id,
       String(req.body?.category||'general').slice(0,80),String(req.body?.file_name||'').slice(0,255),
       String(req.body?.mime_type||'').slice(0,120),fileUrl,String(req.body?.note||''),req.body?.captured_at||null],
    );
    await recordAudit(owner.id,'move-out.evidence.added','evidence',String(e.rows[0].id),{
      tenantId:r.rows[0].tenant_id,propertyId:r.rows[0].property_id,
      metadata:{category:e.rows[0].category,file_name:e.rows[0].file_name},
    });
    return res.status(201).json({success:true,evidence:e.rows[0]});
  } catch(error) {
    console.error('Move-out evidence error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to add evidence.'});
  }
});

router.post('/api/move-out/:reportId/settlement', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const id=Number(req.params.reportId);
    const r=await query(
      `SELECT m.*,t.deposit_amount,t.property_id
       FROM peacely_move_out_reports m JOIN tenants t ON t.id=m.tenant_id
       JOIN properties p ON p.id=t.property_id
       WHERE m.id=$1 AND m.owner_id=$2 AND p.owner_id=$2 LIMIT 1`,
      [id,owner.id],
    );
    if(!r.rows[0]) return res.status(404).json({success:false,error:'Move-out report not found.'});

    const rentOutstanding=Number(req.body?.rent_outstanding||0);
    const utilityCharges=Number(req.body?.utility_charges||0);
    const damageCharges=Number(req.body?.damage_charges||0);
    const otherCharges=Number(req.body?.other_charges||0);
    const deposit=Number(r.rows[0].deposit_amount||0);
    const totalDeductions=Math.max(0,rentOutstanding)+Math.max(0,utilityCharges)+Math.max(0,damageCharges)+Math.max(0,otherCharges);
    const refund=Math.max(0,deposit-totalDeductions);
    const settlement={
      deposit, rent_outstanding:Math.max(0,rentOutstanding), utility_charges:Math.max(0,utilityCharges),
      damage_charges:Math.max(0,damageCharges), other_charges:Math.max(0,otherCharges),
      total_deductions:totalDeductions, refund,
      calculated_at:new Date().toISOString(),
    };

    const updated=await query(
      `UPDATE peacely_move_out_reports SET final_ledger=$1::jsonb,deposit_settlement=$2::jsonb,
       status='settlement_pending',updated_at=CURRENT_TIMESTAMP
       WHERE id=$3 AND owner_id=$4
       RETURNING id,status,final_ledger,deposit_settlement,updated_at`,
      [JSON.stringify({rent_outstanding:Math.max(0,rentOutstanding),utility_charges:Math.max(0,utilityCharges),
        damage_charges:Math.max(0,damageCharges),other_charges:Math.max(0,otherCharges)}),JSON.stringify(settlement),id,owner.id],
    );
    await recordAudit(owner.id,'move-out.settlement.calculated','move_out_report',String(id),{
      tenantId:r.rows[0].tenant_id,propertyId:r.rows[0].property_id,newValues:settlement,
    });
    return res.json({success:true,report:updated.rows[0]});
  } catch(error) {
    console.error('Move-out settlement error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to calculate settlement.'});
  }
});

router.post('/api/move-out/:reportId/complete', async (req,res) => {
  try {
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    await ensureSchema();
    const id=Number(req.params.reportId);
    const r=await query(`SELECT * FROM peacely_move_out_reports WHERE id=$1 AND owner_id=$2 LIMIT 1`,[id,owner.id]);
    if(!r.rows[0]) return res.status(404).json({success:false,error:'Move-out report not found.'});
    const c=r.rows[0].checklist||{};
    const required=['rent_settled','maintenance_checked','damage_checked','documents_checked','inspection_completed'];
    const missing=required.filter(k=>c[k]!==true);
    if(missing.length) return res.status(409).json({success:false,error:'Move-out checklist is incomplete.',missing});
    if(!r.rows[0].deposit_settlement || r.rows[0].status==='notice') {
      return res.status(409).json({success:false,error:'Deposit settlement must be calculated before completing move-out.'});
    }

    const updated=await query(
      `UPDATE peacely_move_out_reports SET status='completed',completed_at=CURRENT_TIMESTAMP,
       tenant_acknowledged_at=COALESCE(tenant_acknowledged_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 AND owner_id=$2
       RETURNING id,status,checklist,final_ledger,deposit_settlement,completed_at,updated_at`,
      [id,owner.id],
    );
    await recordAudit(owner.id,'move-out.completed','move_out_report',String(id),{
      tenantId:r.rows[0].tenant_id,newValues:{status:'completed'},
    });
    return res.json({success:true,report:updated.rows[0]});
  } catch(error) {
    console.error('Move-out complete error:',error);
    return res.status(500).json({success:false,error:error?.message||'Unable to complete move-out.'});
  }
});

export default router;
