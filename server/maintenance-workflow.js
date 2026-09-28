import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const clean = (v) => String(v ?? '').trim();
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

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
    CREATE TABLE IF NOT EXISTS peacely_vendors (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(80) DEFAULT '',
      service VARCHAR(120) DEFAULT '',
      notes TEXT DEFAULT '',
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_peacely_vendors_owner ON peacely_vendors(owner_id);

    CREATE TABLE IF NOT EXISTS peacely_maintenance_jobs (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      property_id INTEGER,
      room_id INTEGER,
      bed_id INTEGER,
      tenant_id INTEGER,
      vendor_id BIGINT,
      title VARCHAR(255) NOT NULL DEFAULT 'Maintenance request',
      description TEXT NOT NULL DEFAULT '',
      category VARCHAR(100) NOT NULL DEFAULT 'General',
      priority VARCHAR(30) NOT NULL DEFAULT 'medium',
      status VARCHAR(40) NOT NULL DEFAULT 'reported',
      estimated_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      actual_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
      payer VARCHAR(40) NOT NULL DEFAULT 'owner',
      due_date DATE,
      tenant_confirmed_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_peacely_maintenance_owner_status
      ON peacely_maintenance_jobs(owner_id,status);
    CREATE INDEX IF NOT EXISTS idx_peacely_maintenance_owner_property
      ON peacely_maintenance_jobs(owner_id,property_id);
  `);
}

async function ownedLocation(ownerId, body) {
  const propertyId = Number(body?.property_id) || 0;
  const roomId = Number(body?.room_id) || 0;
  const bedId = Number(body?.bed_id) || 0;
  if (!propertyId) return null;
  const r = await query(
    `SELECT p.id AS property_id,p.name AS property_name,
            r.id AS room_id,r.room_number,b.id AS bed_id,b.bed_number
     FROM properties p
     LEFT JOIN rooms r ON r.id=$2 AND r.property_id=p.id
     LEFT JOIN beds b ON b.id=$3 AND b.room_id=r.id
     WHERE p.id=$1 AND p.owner_id=$4 LIMIT 1`,
    [propertyId,roomId||null,bedId||null,ownerId],
  );
  return r.rows[0] || null;
}

async function ownedTenant(ownerId, tenantId) {
  if (!tenantId) return null;
  const r = await query(
    `SELECT t.id,t.property_id,t.room_id,t.bed_id,t.name
     FROM tenants t JOIN properties p ON p.id=t.property_id
     WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
    [tenantId,ownerId],
  );
  return r.rows[0] || null;
}

async function ownedVendor(ownerId, vendorId) {
  if (!vendorId) return null;
  const r = await query(
    `SELECT * FROM peacely_vendors WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [vendorId,ownerId],
  );
  return r.rows[0] || null;
}

router.use(async (req,res,next) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    req.owner = owner;
    await ensureSchema();
    next();
  } catch (error) {
    console.error('Maintenance workflow initialization error:',error);
    return res.status(500).json({success:false,error:error?.message||'Maintenance workflow unavailable.'});
  }
});

router.get('/api/maintenance-workflow/vendors', async (req,res) => {
  const r=await query(
    `SELECT id,name,phone,service,notes,active,created_at,updated_at
     FROM peacely_vendors WHERE owner_id=$1 ORDER BY active DESC,name ASC`,
    [req.owner.id],
  );
  return res.json({success:true,vendors:r.rows});
});

router.post('/api/maintenance-workflow/vendors', async (req,res) => {
  const name=clean(req.body?.name);
  if(!name) return res.status(400).json({success:false,error:'Vendor name is required.'});
  const r=await query(
    `INSERT INTO peacely_vendors(owner_id,name,phone,service,notes)
     VALUES($1,$2,$3,$4,$5) RETURNING *`,
    [req.owner.id,name,clean(req.body?.phone),clean(req.body?.service),clean(req.body?.notes)],
  );
  await recordAudit(req.owner.id,'maintenance.vendor.created','vendor',String(r.rows[0].id),{
    newValues:r.rows[0],
  });
  return res.status(201).json({success:true,vendor:r.rows[0]});
});

router.patch('/api/maintenance-workflow/vendors/:id', async (req,res) => {
  const id=Number(req.params.id);
  const current=await ownedVendor(req.owner.id,id);
  if(!current) return res.status(404).json({success:false,error:'Vendor not found.'});
  const r=await query(
    `UPDATE peacely_vendors
     SET name=$1,phone=$2,service=$3,notes=$4,active=$5,updated_at=CURRENT_TIMESTAMP
     WHERE id=$6 AND owner_id=$7 RETURNING *`,
    [
      clean(req.body?.name)||current.name,
      clean(req.body?.phone),
      clean(req.body?.service),
      clean(req.body?.notes),
      req.body?.active !== false,
      id,req.owner.id,
    ],
  );
  await recordAudit(req.owner.id,'maintenance.vendor.updated','vendor',String(id),{
    oldValues:current,newValues:r.rows[0],
  });
  return res.json({success:true,vendor:r.rows[0]});
});

router.get('/api/maintenance-workflow', async (req,res) => {
  const status=clean(req.query?.status);
  const params=[req.owner.id];
  let filter='m.owner_id=$1';
  if(status) { params.push(status); filter += ` AND m.status=$${params.length}`; }

  const r=await query(
    `SELECT m.*,p.name AS property_name,r.room_number,b.bed_number,
            t.name AS tenant_name,v.name AS vendor_name,v.phone AS vendor_phone,v.service AS vendor_service
     FROM peacely_maintenance_jobs m
     LEFT JOIN properties p ON p.id=m.property_id AND p.owner_id=m.owner_id
     LEFT JOIN rooms r ON r.id=m.room_id
     LEFT JOIN beds b ON b.id=m.bed_id
     LEFT JOIN tenants t ON t.id=m.tenant_id
     LEFT JOIN peacely_vendors v ON v.id=m.vendor_id AND v.owner_id=m.owner_id
     WHERE ${filter}
     ORDER BY m.created_at DESC,m.id DESC`,
    params,
  );
  return res.json({success:true,jobs:r.rows});
});

router.post('/api/maintenance-workflow', async (req,res) => {
  const b=req.body||{};
  const title=clean(b.title)||'Maintenance request';
  const description=clean(b.description);
  const propertyId=Number(b.property_id)||0;
  const tenantId=Number(b.tenant_id)||0;
  const location=await ownedLocation(req.owner.id,b);
  if(!propertyId || !location) return res.status(400).json({success:false,error:'A valid owner property is required.'});
  if(!description) return res.status(400).json({success:false,error:'Description is required.'});

  if(tenantId && !await ownedTenant(req.owner.id,tenantId)) {
    return res.status(404).json({success:false,error:'Tenant not found.'});
  }

  const vendorId=Number(b.vendor_id)||0;
  if(vendorId && !await ownedVendor(req.owner.id,vendorId)) {
    return res.status(404).json({success:false,error:'Vendor not found.'});
  }

  const priority=new Set(['low','medium','high','critical']).has(clean(b.priority).toLowerCase())
    ? clean(b.priority).toLowerCase() : 'medium';
  const payer=new Set(['owner','tenant','shared','vendor','insurance']).has(clean(b.payer).toLowerCase())
    ? clean(b.payer).toLowerCase() : 'owner';

  const r=await query(
    `INSERT INTO peacely_maintenance_jobs
     (owner_id,property_id,room_id,bed_id,tenant_id,vendor_id,title,description,category,priority,status,estimated_cost,actual_cost,payer,due_date)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reported',$11,$12,$13,$14)
     RETURNING *`,
    [
      req.owner.id,propertyId,location.room_id||null,location.bed_id||null,
      tenantId||null,vendorId||null,title,description,
      clean(b.category)||'General',priority,
      Math.max(num(b.estimated_cost),0),Math.max(num(b.actual_cost),0),payer,
      clean(b.due_date)||null,
    ],
  );

  await recordAudit(req.owner.id,'maintenance.reported','maintenance_job',String(r.rows[0].id),{
    tenantId:tenantId||null,propertyId,
    newValues:r.rows[0],
  });
  return res.status(201).json({success:true,job:r.rows[0]});
});

router.patch('/api/maintenance-workflow/:id/status', async (req,res) => {
  const id=Number(req.params.id);
  const current=await query(
    `SELECT * FROM peacely_maintenance_jobs WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [id,req.owner.id],
  );
  if(!current.rows[0]) return res.status(404).json({success:false,error:'Maintenance job not found.'});

  const allowed=new Set(['reported','assigned','work_started','completed']);
  const status=clean(req.body?.status).toLowerCase();
  if(!allowed.has(status)) return res.status(400).json({success:false,error:'Unsupported maintenance status.'});

  const completedAt=status==='completed' ? 'CURRENT_TIMESTAMP' : 'completed_at';
  const r=await query(
    `UPDATE peacely_maintenance_jobs
     SET status=$1,completed_at=${completedAt},updated_at=CURRENT_TIMESTAMP
     WHERE id=$2 AND owner_id=$3 RETURNING *`,
    [status,id,req.owner.id],
  );

  await recordAudit(req.owner.id,'maintenance.status.updated','maintenance_job',String(id),{
    tenantId:current.rows[0].tenant_id,
    propertyId:current.rows[0].property_id,
    oldValues:{status:current.rows[0].status},
    newValues:{status:r.rows[0].status},
  });
  return res.json({success:true,job:r.rows[0]});
});

router.patch('/api/maintenance-workflow/:id/assignment', async (req,res) => {
  const id=Number(req.params.id);
  const current=await query(
    `SELECT * FROM peacely_maintenance_jobs WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [id,req.owner.id],
  );
  if(!current.rows[0]) return res.status(404).json({success:false,error:'Maintenance job not found.'});

  const vendorId=Number(req.body?.vendor_id)||0;
  if(vendorId && !await ownedVendor(req.owner.id,vendorId)) {
    return res.status(404).json({success:false,error:'Vendor not found.'});
  }

  const r=await query(
    `UPDATE peacely_maintenance_jobs
     SET vendor_id=$1,updated_at=CURRENT_TIMESTAMP
     WHERE id=$2 AND owner_id=$3 RETURNING *`,
    [vendorId||null,id,req.owner.id],
  );
  await recordAudit(req.owner.id,'maintenance.assignment.updated','maintenance_job',String(id),{
    tenantId:current.rows[0].tenant_id,
    oldValues:{vendor_id:current.rows[0].vendor_id},
    newValues:{vendor_id:r.rows[0].vendor_id},
  });
  return res.json({success:true,job:r.rows[0]});
});

router.patch('/api/maintenance-workflow/:id/cost', async (req,res) => {
  const id=Number(req.params.id);
  const current=await query(
    `SELECT * FROM peacely_maintenance_jobs WHERE id=$1 AND owner_id=$2 LIMIT 1`,
    [id,req.owner.id],
  );
  if(!current.rows[0]) return res.status(404).json({success:false,error:'Maintenance job not found.'});

  const estimated=Math.max(num(req.body?.estimated_cost),0);
  const actual=Math.max(num(req.body?.actual_cost),0);
  const payer=new Set(['owner','tenant','shared','vendor','insurance']).has(clean(req.body?.payer).toLowerCase())
    ? clean(req.body.payer).toLowerCase() : current.rows[0].payer;

  const r=await query(
    `UPDATE peacely_maintenance_jobs
     SET estimated_cost=$1,actual_cost=$2,payer=$3,updated_at=CURRENT_TIMESTAMP
     WHERE id=$4 AND owner_id=$5 RETURNING *`,
    [estimated,actual,payer,id,req.owner.id],
  );
  await recordAudit(req.owner.id,'maintenance.cost.updated','maintenance_job',String(id),{
    tenantId:current.rows[0].tenant_id,
    propertyId:current.rows[0].property_id,
    oldValues:{estimated_cost:current.rows[0].estimated_cost,actual_cost:current.rows[0].actual_cost,payer:current.rows[0].payer},
    newValues:{estimated_cost:estimated,actual_cost:actual,payer},
  });
  return res.json({success:true,job:r.rows[0]});
});

router.post('/api/maintenance-workflow/:id/tenant-confirm', async (req,res) => {
  const id=Number(req.params.id);
  const r=await query(
    `UPDATE peacely_maintenance_jobs
     SET tenant_confirmed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
     WHERE id=$1 AND owner_id=$2 RETURNING *`,
    [id,req.owner.id],
  );
  if(!r.rows[0]) return res.status(404).json({success:false,error:'Maintenance job not found.'});
  await recordAudit(req.owner.id,'maintenance.tenant-confirmed','maintenance_job',String(id),{
    tenantId:r.rows[0].tenant_id,
  });
  return res.json({success:true,job:r.rows[0]});
});

export default router;
