import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router = express.Router();
const SESSION_COOKIE='peacely_session';
const hash=v=>crypto.createHash('sha256').update(String(v)).digest('hex');

function cookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const i=part.indexOf('=');
    if(i<0) continue;
    const key=part.slice(0,i).trim(), value=part.slice(i+1).trim();
    try{out[key]=decodeURIComponent(value)}catch{out[key]=value}
  }
  return out;
}

async function ownerFromRequest(req){
  const token=cookies(req)[SESSION_COOKIE];
  if(!token) return null;
  const r=await query(
    `SELECT o.id,o.name,o.email FROM sessions s JOIN owners o ON o.id=s.owner_id
     WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`,
    [hash(token)]
  );
  return r.rows[0]||null;
}

async function ensureSchema(){
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_tenant_compliance (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      tenant_id INTEGER NOT NULL,
      requirement VARCHAR(120) NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'pending',
      reference_id VARCHAR(160) DEFAULT '',
      document_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      expires_at DATE,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_tenant_compliance_owner_tenant
      ON peacely_tenant_compliance(owner_id,tenant_id);
  `);
}

async function ownedTenant(ownerId,tenantId){
  const r=await query(
    `SELECT t.id,t.name,t.property_id,p.name AS property_name
     FROM tenants t JOIN properties p ON p.id=t.property_id
     WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [tenantId,ownerId]
  );
  return r.rows[0]||null;
}

function effectiveStatus(row){
  const status=String(row.status||'pending').toLowerCase();
  if(row.expires_at){
    const expiry=new Date(row.expires_at);
    const now=new Date();
    const days=(expiry.getTime()-new Date(now.toISOString().slice(0,10)).getTime())/86400000;
    if(days<0) return 'expired';
    if(days<=30 && status==='verified') return 'expiring';
  }
  return status;
}

router.use(async(req,res,next)=>{
  try{
    const owner=await ownerFromRequest(req);
    if(!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    req.owner=owner;
    await ensureSchema();
    next();
  }catch(error){
    console.error('Tenant compliance initialization error:',error);
    return res.status(500).json({success:false,error:error?.message||'Tenant compliance unavailable.'});
  }
});

router.get('/api/tenant-compliance/:tenantId',async(req,res)=>{
  const tenantId=Number(req.params.tenantId);
  const tenant=await ownedTenant(req.owner.id,tenantId);
  if(!tenant) return res.status(404).json({success:false,error:'Tenant not found.'});
  const r=await query(
    `SELECT id,tenant_id,requirement,status,reference_id,document_url,notes,
            expires_at,completed_at,created_at,updated_at
     FROM peacely_tenant_compliance
     WHERE owner_id=$1 AND tenant_id=$2
     ORDER BY requirement ASC,id DESC`,
    [req.owner.id,tenantId]
  );
  const items=r.rows.map(x=>({...x,effective_status:effectiveStatus(x)}));
  const radar={
    critical:items.filter(x=>['expired','failed'].includes(x.effective_status)).length,
    attention:items.filter(x=>['pending','expiring','manual_review'].includes(x.effective_status)).length,
    up_to_date:items.filter(x=>['verified','completed'].includes(x.effective_status)).length,
  };
  await recordAudit(req.owner.id,'tenant-compliance.viewed','tenant',String(tenantId),{
    tenantId,propertyId:tenant.property_id
  });
  return res.json({
    success:true,tenant,items,radar,
    disclaimer:'Peacely tracks records and evidence supplied to it. This does not by itself establish legal compliance or official clearance.'
  });
});

router.post('/api/tenant-compliance',async(req,res)=>{
  const tenantId=Number(req.body?.tenant_id);
  const tenant=await ownedTenant(req.owner.id,tenantId);
  if(!tenant) return res.status(404).json({success:false,error:'Tenant not found.'});
  const requirement=String(req.body?.requirement||'').trim();
  if(!requirement) return res.status(400).json({success:false,error:'Requirement is required.'});
  const allowed=new Set(['pending','verified','failed','manual_review','completed']);
  const status=allowed.has(String(req.body?.status||'pending').toLowerCase())
    ? String(req.body.status).toLowerCase() : 'pending';

  const r=await query(
    `INSERT INTO peacely_tenant_compliance
     (owner_id,tenant_id,requirement,status,reference_id,document_url,notes,expires_at,completed_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      req.owner.id,tenantId,requirement,status,
      String(req.body?.reference_id||'').trim(),
      String(req.body?.document_url||'').trim(),
      String(req.body?.notes||'').trim(),
      req.body?.expires_at||null,
      ['verified','completed'].includes(status)?new Date():null
    ]
  );
  await recordAudit(req.owner.id,'tenant-compliance.created','tenant_compliance',String(r.rows[0].id),{
    tenantId,propertyId:tenant.property_id,newValues:r.rows[0]
  });
  return res.status(201).json({success:true,item:{...r.rows[0],effective_status:effectiveStatus(r.rows[0])}});
});

router.patch('/api/tenant-compliance/:id',async(req,res)=>{
  const id=Number(req.params.id);
  const current=await query(
    `SELECT * FROM peacely_tenant_compliance WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [id,req.owner.id]
  );
  if(!current.rows[0]) return res.status(404).json({success:false,error:'Compliance record not found.'});
  const old=current.rows[0];
  const allowed=new Set(['pending','verified','failed','manual_review','completed']);
  const status=allowed.has(String(req.body?.status||old.status).toLowerCase())
    ? String(req.body?.status||old.status).toLowerCase() : old.status;

  const r=await query(
    `UPDATE peacely_tenant_compliance
     SET requirement=$1,status=$2,reference_id=$3,document_url=$4,notes=$5,
         expires_at=$6,completed_at=$7,updated_at=CURRENT_TIMESTAMP
     WHERE id=$8 AND owner_id=$9 RETURNING *`,
    [
      String(req.body?.requirement||old.requirement).trim(),
      status,
      String(req.body?.reference_id ?? old.reference_id ?? '').trim(),
      String(req.body?.document_url ?? old.document_url ?? '').trim(),
      String(req.body?.notes ?? old.notes ?? '').trim(),
      req.body?.expires_at ?? old.expires_at ?? null,
      ['verified','completed'].includes(status) ? (old.completed_at||new Date()) : null,
      id,req.owner.id
    ]
  );
  await recordAudit(req.owner.id,'tenant-compliance.updated','tenant_compliance',String(id),{
    tenantId:old.tenant_id,oldValues:old,newValues:r.rows[0]
  });
  return res.json({success:true,item:{...r.rows[0],effective_status:effectiveStatus(r.rows[0])}});
});

export default router;
