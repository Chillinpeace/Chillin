import express from 'express';
import crypto from 'crypto';
import { pool, query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
const clean = (v) => String(v ?? '').trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(clean(v));
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

async function ownerFromRequest(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const r = await query(`SELECT o.id,o.name,o.email FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`, [hash(token)]);
  return r.rows[0] || null;
}

async function ensureSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, property_id INTEGER, room_id INTEGER, bed_id INTEGER,
      tenant_id INTEGER, title VARCHAR(255) NOT NULL DEFAULT 'Maintenance work', description TEXT DEFAULT '',
      category VARCHAR(80) DEFAULT 'General', priority VARCHAR(20) DEFAULT 'Medium', status VARCHAR(30) DEFAULT 'Resolved',
      assigned_to VARCHAR(255) DEFAULT '', estimated_cost NUMERIC(12,2) DEFAULT 0, actual_cost NUMERIC(12,2) DEFAULT 0,
      due_date DATE, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS property_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS room_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS bed_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT 'Maintenance work';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'General';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Medium';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'Resolved';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255) DEFAULT '';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, property_id INTEGER,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE, category VARCHAR(100) NOT NULL DEFAULT 'Other',
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS property_id INTEGER;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE NOT NULL DEFAULT CURRENT_DATE;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'Other';
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_expenses_owner_date ON expenses(owner_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_owner_property ON expenses(owner_id, property_id);
  `);
}

async function auth(req,res,next) {
  // The bootstrap mounts Phase 7 before the legacy /api/auth routes.
  // Never let this router intercept authentication endpoints.
  if (req.path === '/auth' || req.path.startsWith('/auth/')) return next();
  try {
    await ensureSchema();
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({success:false,error:'Authentication required.'});
    req.p7Owner = owner;
    next();
  } catch (e) {
    console.error('Phase 7 auth/schema error:', e);
    res.status(500).json({success:false,error:'Property Operations is temporarily unavailable.'});
  }
}

router.use(auth);

router.get('/maintenance', async (req,res) => {
  try {
    const r = await query(`
      SELECT m.id,m.owner_id,m.property_id,m.room_id,m.bed_id,m.tenant_id,m.title,m.description,m.category,
             m.status,m.actual_cost,m.due_date,m.created_at,
             p.name AS property_name,r.room_number,b.bed_number,t.name AS tenant_name
      FROM maintenance_tickets m
      LEFT JOIN properties p ON p.id=m.property_id AND p.owner_id=m.owner_id
      LEFT JOIN rooms r ON r.id=m.room_id
      LEFT JOIN beds b ON b.id=m.bed_id
      LEFT JOIN tenants t ON t.id=m.tenant_id
      WHERE m.owner_id=$1 ORDER BY m.created_at DESC,m.id DESC
    `,[req.p7Owner.id]);
    res.json(r.rows);
  } catch (e) {
    console.error('Maintenance list failed:',e);
    res.status(500).json({success:false,error:e?.message||'Unable to load maintenance records.'});
  }
});

router.post('/maintenance', async (req,res) => {
  const b=req.body||{};
  const ownerId=req.p7Owner.id;
  const propertyId=Number(b.property_id)||0;
  const roomId=Number(b.room_id)||0;
  const bedId=Number(b.bed_id)||0;
  const category=clean(b.category)||'General';
  const description=clean(b.description);
  const cost=num(b.actual_cost ?? b.cost);
  const due=clean(b.due_date);
  if(!propertyId||!roomId||!bedId) return res.status(400).json({success:false,error:'Property, room and bed are required.'});
  if(!category) return res.status(400).json({success:false,error:'Category is required.'});
  if(!description) return res.status(400).json({success:false,error:'Description is required.'});
  if(!(cost>0)) return res.status(400).json({success:false,error:'Maintenance cost must be greater than zero.'});
  if(!validDate(due)) return res.status(400).json({success:false,error:'A valid maintenance date is required.'});

  const location=await query(`
    SELECT p.id AS property_id,p.name AS property_name,r.id AS room_id,r.room_number,b.id AS bed_id,b.bed_number
    FROM properties p JOIN rooms r ON r.property_id=p.id JOIN beds b ON b.room_id=r.id
    WHERE p.id=$1 AND r.id=$2 AND b.id=$3 AND p.owner_id=$4 LIMIT 1
  `,[propertyId,roomId,bedId,ownerId]);
  if(!location.rows.length) return res.status(400).json({success:false,error:'Selected property, room and bed do not match.'});

  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const maintenance=await client.query(`
      INSERT INTO maintenance_tickets(owner_id,property_id,room_id,bed_id,title,description,category,priority,status,actual_cost,due_date,resolved_at,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,'Medium','Resolved',$8,$9,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      RETURNING id,owner_id,property_id,room_id,bed_id,title,description,category,status,actual_cost,due_date,created_at
    `,[ownerId,propertyId,roomId,bedId,category,description,category,cost,due]);

    const expense=await client.query(`
      INSERT INTO expenses(owner_id,property_id,expense_date,category,amount,note,created_at)
      VALUES($1,$2,$3,'Maintenance',$4,$5,CURRENT_TIMESTAMP)
      RETURNING id,property_id,expense_date,category,amount,note,created_at
    `,[ownerId,propertyId,due,cost,`${category}: ${description}`]);

    await client.query('COMMIT');
    return res.status(201).json({success:true,maintenance:{...maintenance.rows[0],property_name:location.rows[0].property_name,room_number:location.rows[0].room_number,bed_number:location.rows[0].bed_number},expense:expense.rows[0]});
  } catch(e) {
    await client.query('ROLLBACK').catch(()=>{});
    console.error('Maintenance + expense transaction failed:',e);
    return res.status(500).json({success:false,error:e?.message||'Unable to save maintenance and expense.'});
  } finally { client.release(); }
});

export default router;
