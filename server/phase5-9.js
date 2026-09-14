import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
const STAFF_COOKIE = 'peacely_staff_session';
const tableReady = new Map();
const rateBuckets = new Map();

const clean = (v) => String(v ?? '').trim();
const num = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const hash = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const validDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(clean(v));
const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), decodeURIComponent(p.slice(i + 1).trim())]; }));

async function ensureTable(name, sql) {
  if (!tableReady.has(name)) {
    const promise = query(sql).catch((e) => { tableReady.delete(name); throw e; });
    tableReady.set(name, promise);
  }
  return tableReady.get(name);
}

async function ensureTables() {
  await Promise.all([
    ensureTable('notifications', `CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, tenant_id INTEGER, invoice_id INTEGER,
      channel VARCHAR(30) NOT NULL DEFAULT 'whatsapp', type VARCHAR(50) NOT NULL DEFAULT 'manual',
      recipient VARCHAR(255) DEFAULT '', message TEXT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'queued',
      provider_message_id VARCHAR(255), sent_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    ); CREATE INDEX IF NOT EXISTS idx_notifications_owner_created ON notifications(owner_id, created_at DESC);`),
    ensureTable('automation_settings', `CREATE TABLE IF NOT EXISTS automation_settings (
      owner_id INTEGER PRIMARY KEY, reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      reminder_days_before INTEGER NOT NULL DEFAULT 3, overdue_reminders_enabled BOOLEAN NOT NULL DEFAULT TRUE,
      recurring_invoices_enabled BOOLEAN NOT NULL DEFAULT FALSE, last_run_at TIMESTAMPTZ,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );`),
    ensureTable('maintenance_tickets', `CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, property_id INTEGER, room_id INTEGER, bed_id INTEGER,
      tenant_id INTEGER, title VARCHAR(255) NOT NULL, description TEXT DEFAULT '', category VARCHAR(80) DEFAULT 'General',
      priority VARCHAR(20) DEFAULT 'Medium', status VARCHAR(30) DEFAULT 'Open', assigned_to VARCHAR(255) DEFAULT '',
      estimated_cost NUMERIC(12,2) DEFAULT 0, actual_cost NUMERIC(12,2) DEFAULT 0, due_date DATE,
      resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    ); CREATE INDEX IF NOT EXISTS idx_maintenance_owner_status ON maintenance_tickets(owner_id,status); CREATE INDEX IF NOT EXISTS idx_maintenance_owner_property ON maintenance_tickets(owner_id,property_id);`),
    ensureTable('team_users', `CREATE TABLE IF NOT EXISTS team_users (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, name VARCHAR(255) NOT NULL, email VARCHAR(255) NOT NULL,
      password_hash TEXT NOT NULL, role VARCHAR(30) NOT NULL DEFAULT 'manager', permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
      property_ids JSONB NOT NULL DEFAULT '[]'::jsonb, active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(owner_id,email)
    ); CREATE INDEX IF NOT EXISTS idx_team_users_owner ON team_users(owner_id);`),
    ensureTable('team_sessions', `CREATE TABLE IF NOT EXISTS team_sessions (
      id SERIAL PRIMARY KEY, team_user_id INTEGER NOT NULL, token_hash VARCHAR(128) UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    ); CREATE INDEX IF NOT EXISTS idx_team_sessions_token ON team_sessions(token_hash);`),
    ensureTable('audit_logs', `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, actor_type VARCHAR(30) DEFAULT 'owner', actor_id INTEGER,
      action VARCHAR(100) NOT NULL, entity_type VARCHAR(80), entity_id INTEGER, details JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address VARCHAR(100) DEFAULT '', user_agent TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    ); CREATE INDEX IF NOT EXISTS idx_audit_owner_created ON audit_logs(owner_id,created_at DESC); CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(owner_id,entity_type,entity_id);`)
  ]);
}

async function ownerFromRequest(req) {
  const token = cookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const r = await query(`SELECT o.id,o.name,o.email,o.phone,s.id AS session_id FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`, [hash(token)]);
  return r.rows[0] || null;
}

async function auth(req, res, next) {
  try {
    await ensureTables();
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success:false, error:'Authentication required.' });
    req.phaseOwner = owner;
    next();
  } catch (e) { console.error('Phase 5-9 auth error:', e); res.status(500).json({ success:false,error:'Service initialization failed.' }); }
}

function limited(req, res, next) {
  const key = `${req.phaseOwner?.id || 'anon'}:${req.ip || 'unknown'}`;
  const now = Date.now(); const bucket = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - bucket.start > 60000) { bucket.start = now; bucket.count = 0; }
  bucket.count += 1; rateBuckets.set(key, bucket);
  if (bucket.count > 120) return res.status(429).json({ success:false,error:'Too many requests. Please retry shortly.' });
  next();
}

async function audit(req, action, entityType = null, entityId = null, details = {}) {
  try { await query(`INSERT INTO audit_logs(owner_id,actor_type,actor_id,action,entity_type,entity_id,details,ip_address,user_agent) VALUES($1,'owner',$1,$2,$3,$4,$5::jsonb,$6,$7)`, [req.phaseOwner.id, action, entityType, entityId, JSON.stringify(details), req.ip || '', clean(req.headers['user-agent']).slice(0,1000)]); } catch (e) { console.error('Audit log failed:', e.message); }
}

router.use(auth, limited);

// ---------------- PHASE 5: AUTOMATION & COMMUNICATION ----------------
router.get('/automation/settings', async (req,res) => {
  const r = await query(`SELECT * FROM automation_settings WHERE owner_id=$1`, [req.phaseOwner.id]);
  if (!r.rows.length) await query(`INSERT INTO automation_settings(owner_id) VALUES($1) ON CONFLICT DO NOTHING`, [req.phaseOwner.id]);
  const x = await query(`SELECT * FROM automation_settings WHERE owner_id=$1`, [req.phaseOwner.id]);
  res.json(x.rows[0]);
});
router.put('/automation/settings', async (req,res) => {
  const b=req.body||{};
  const r=await query(`INSERT INTO automation_settings(owner_id,reminders_enabled,reminder_days_before,overdue_reminders_enabled,recurring_invoices_enabled,updated_at) VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP) ON CONFLICT(owner_id) DO UPDATE SET reminders_enabled=EXCLUDED.reminders_enabled,reminder_days_before=EXCLUDED.reminder_days_before,overdue_reminders_enabled=EXCLUDED.overdue_reminders_enabled,recurring_invoices_enabled=EXCLUDED.recurring_invoices_enabled,updated_at=CURRENT_TIMESTAMP RETURNING *`,[req.phaseOwner.id,b.reminders_enabled!==false,Math.max(0,Math.min(30,Math.floor(num(b.reminder_days_before,3)))),b.overdue_reminders_enabled!==false,b.recurring_invoices_enabled===true]);
  await audit(req,'update_automation_settings','automation',null,b); res.json(r.rows[0]);
});
router.get('/automation/due', async (req,res) => {
  const settings=(await query(`SELECT * FROM automation_settings WHERE owner_id=$1`,[req.phaseOwner.id])).rows[0] || {reminders_enabled:true,reminder_days_before:3,overdue_reminders_enabled:true};
  const r=await query(`SELECT i.id AS invoice_id,i.invoice_number,i.amount,i.due_date,i.status,t.id AS tenant_id,t.name,t.phone,t.email,p.name AS property_name FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND LOWER(COALESCE(i.status,'')) NOT IN('paid','cancelled') AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + ($2::integer * INTERVAL '1 day') ORDER BY i.due_date,i.id`,[req.phaseOwner.id,settings.reminder_days_before||3]);
  const overdue= settings.overdue_reminders_enabled ? (await query(`SELECT i.id AS invoice_id,i.invoice_number,i.amount,i.due_date,i.status,t.id AS tenant_id,t.name,t.phone,t.email,p.name AS property_name FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND LOWER(COALESCE(i.status,''))='overdue' ORDER BY i.due_date`,[req.phaseOwner.id])).rows : [];
  res.json({success:true,settings,due:settings.reminders_enabled?r.rows:[],overdue});
});
router.post('/notifications/queue', async (req,res) => {
  const b=req.body||{}; const tenantId=Number(b.tenant_id)||null; const invoiceId=Number(b.invoice_id)||null;
  if (!clean(b.message)) return res.status(400).json({success:false,error:'Message is required.'});
  if (tenantId) { const ok=await query(`SELECT t.id FROM tenants t JOIN properties p ON p.id=t.property_id WHERE t.id=$1 AND p.owner_id=$2`,[tenantId,req.phaseOwner.id]); if(!ok.rows.length)return res.status(404).json({success:false,error:'Tenant not found.'}); }
  if (invoiceId) { const ok=await query(`SELECT i.id FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE i.id=$1 AND p.owner_id=$2`,[invoiceId,req.phaseOwner.id]); if(!ok.rows.length)return res.status(404).json({success:false,error:'Invoice not found.'}); }
  const r=await query(`INSERT INTO notifications(owner_id,tenant_id,invoice_id,channel,type,recipient,message,status) VALUES($1,$2,$3,$4,$5,$6,$7,'queued') RETURNING *`,[req.phaseOwner.id,tenantId,invoiceId,clean(b.channel)||'whatsapp',clean(b.type)||'manual',clean(b.recipient),clean(b.message)]);
  await audit(req,'queue_notification','notification',r.rows[0].id,{channel:b.channel,type:b.type}); res.status(201).json(r.rows[0]);
});
router.get('/notifications', async (req,res) => {
  const r=await query(`SELECT n.*,t.name AS tenant_name,i.invoice_number FROM notifications n LEFT JOIN tenants t ON t.id=n.tenant_id LEFT JOIN invoices i ON i.id=n.invoice_id WHERE n.owner_id=$1 ORDER BY n.created_at DESC LIMIT 200`,[req.phaseOwner.id]); res.json(r.rows);
});
router.post('/notifications/:id/mark-sent', async (req,res) => { const id=Number(req.params.id); const r=await query(`UPDATE notifications SET status='sent',sent_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2 RETURNING *`,[id,req.phaseOwner.id]); if(!r.rows.length)return res.status(404).json({success:false,error:'Notification not found.'}); await audit(req,'mark_notification_sent','notification',id); res.json(r.rows[0]); });

// ---------------- PHASE 6: FINANCIAL INTELLIGENCE ----------------
function dateRange(req) { const from=clean(req.query.from)||`${new Date().getFullYear()}-01-01`; const to=clean(req.query.to)||new Date().toISOString().slice(0,10); return [validDate(from)?from:'1900-01-01',validDate(to)?to:'2999-12-31']; }
router.get('/reports/financial', async (req,res) => {
  const [from,to]=dateRange(req); const id=req.phaseOwner.id;
  const income=await query(`SELECT COALESCE(SUM(pay.amount),0) AS collected,COUNT(pay.id)::integer AS payment_count FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND pay.payment_date BETWEEN $2::date AND $3::date`,[id,from,to]);
  const invoiced=await query(`SELECT COALESCE(SUM(i.amount),0) AS invoiced,COALESCE(SUM(i.paid_amount),0) AS allocated FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND i.due_date BETWEEN $2::date AND $3::date`,[id,from,to]);
  const expenses=await query(`SELECT COALESCE(SUM(amount),0) AS expenses,COUNT(*)::integer AS expense_count FROM expenses WHERE owner_id=$1 AND expense_date BETWEEN $2::date AND $3::date`,[id,from,to]);
  const categories=await query(`SELECT category,COALESCE(SUM(amount),0) AS amount,COUNT(*)::integer AS count FROM expenses WHERE owner_id=$1 AND expense_date BETWEEN $2::date AND $3::date GROUP BY category ORDER BY amount DESC`,[id,from,to]);
  const monthly=await query(`SELECT TO_CHAR(m,'YYYY-MM') AS month,COALESCE((SELECT SUM(pay.amount) FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND pay.payment_date>=m AND pay.payment_date<m+INTERVAL '1 month'),0) AS collected,COALESCE((SELECT SUM(i.amount) FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND i.due_date>=m AND i.due_date<m+INTERVAL '1 month'),0) AS invoiced,COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.owner_id=$1 AND e.expense_date>=m AND e.expense_date<m+INTERVAL '1 month'),0) AS expenses FROM generate_series(DATE_TRUNC('month',$2::date),DATE_TRUNC('month',$3::date),INTERVAL '1 month') m ORDER BY m`,[id,from,to]);
  const x={from,to,invoiced:Number(invoiced.rows[0].invoiced),collected:Number(income.rows[0].collected),expenses:Number(expenses.rows[0].expenses),net_cash:Number(income.rows[0].collected)-Number(expenses.rows[0].expenses),outstanding:Math.max(0,Number(invoiced.rows[0].invoiced)-Number(invoiced.rows[0].allocated)),payment_count:income.rows[0].payment_count,expense_count:expenses.rows[0].expense_count,categories:categories.rows,monthly:monthly.rows}; res.json(x);
});
router.get('/reports/aging', async (req,res) => {
  const r=await query(`SELECT i.id,i.invoice_number,i.amount,i.paid_amount,i.due_date,GREATEST(0,CURRENT_DATE-i.due_date)::integer AS days_overdue, GREATEST(0,COALESCE(i.amount,0)-COALESCE(i.paid_amount,0)) AS balance,t.id AS tenant_id,t.name AS tenant_name,t.phone,p.id AS property_id,p.name AS property_name FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND LOWER(COALESCE(i.status,'')) NOT IN('paid','cancelled') AND GREATEST(0,COALESCE(i.amount,0)-COALESCE(i.paid_amount,0))>0 ORDER BY days_overdue DESC,due_date`,[req.phaseOwner.id]); const buckets={current:0,'1_30':0,'31_60':0,'61_90':0,'90_plus':0}; for(const x of r.rows){const d=Number(x.days_overdue); const b=d<=0?'current':d<=30?'1_30':d<=60?'31_60':d<=90?'61_90':'90_plus'; buckets[b]+=Number(x.balance||0);} res.json({success:true,buckets,items:r.rows});
});
router.get('/reports/property-profitability', async (req,res) => {
  const r=await query(`SELECT p.id,p.name,COALESCE(t.income,0) AS income,COALESCE(e.expenses,0) AS expenses,COALESCE(t.income,0)-COALESCE(e.expenses,0) AS profit,COALESCE(t.active,0)::integer AS active_tenants,COALESCE(b.beds,0)::integer AS beds,COALESCE(b.occupied,0)::integer AS occupied FROM properties p LEFT JOIN (SELECT property_id,SUM(monthly_rent) FILTER(WHERE LOWER(COALESCE(status,''))='active') income,COUNT(*) FILTER(WHERE LOWER(COALESCE(status,''))='active') active FROM tenants GROUP BY property_id) t ON t.property_id=p.id LEFT JOIN (SELECT property_id,SUM(amount) expenses FROM expenses GROUP BY property_id) e ON e.property_id=p.id LEFT JOIN (SELECT r.property_id,COUNT(b.id) beds,COUNT(b.id) FILTER(WHERE b.is_occupied) occupied FROM rooms r LEFT JOIN beds b ON b.room_id=r.id GROUP BY r.property_id) b ON b.property_id=p.id WHERE p.owner_id=$1 ORDER BY profit DESC,p.name`,[req.phaseOwner.id]); res.json(r.rows);
});
router.get('/reports/tenant/:id/history', async (req,res) => { const tid=Number(req.params.id); const owner=req.phaseOwner.id; const t=await query(`SELECT t.*,p.name AS property_name,r.room_number,b.bed_number FROM tenants t JOIN properties p ON p.id=t.property_id LEFT JOIN rooms r ON r.id=t.room_id LEFT JOIN beds b ON b.id=t.bed_id WHERE t.id=$1 AND p.owner_id=$2`,[tid,owner]); if(!t.rows.length)return res.status(404).json({success:false,error:'Tenant not found.'}); const [inv,pay]=await Promise.all([query(`SELECT i.* FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE i.tenant_id=$1 AND p.owner_id=$2 ORDER BY i.due_date DESC`,[tid,owner]),query(`SELECT pay.* FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE pay.tenant_id=$1 AND p.owner_id=$2 ORDER BY pay.payment_date DESC`,[tid,owner])]); res.json({tenant:t.rows[0],invoices:inv.rows,payments:pay.rows}); });

// ---------------- PHASE 7: PROPERTY OPERATIONS ----------------
router.get('/maintenance', async (req,res)=>{const status=clean(req.query.status); const params=[req.phaseOwner.id]; let where='m.owner_id=$1'; if(status){params.push(status);where+=' AND LOWER(m.status)=LOWER($2)';} const r=await query(`SELECT m.*,p.name AS property_name,r.room_number,b.bed_number,t.name AS tenant_name FROM maintenance_tickets m LEFT JOIN properties p ON p.id=m.property_id LEFT JOIN rooms r ON r.id=m.room_id LEFT JOIN beds b ON b.id=m.bed_id LEFT JOIN tenants t ON t.id=m.tenant_id WHERE ${where} ORDER BY CASE LOWER(m.priority) WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,m.created_at DESC`,params);res.json(r.rows);});
router.post('/maintenance', async(req,res)=>{const b=req.body||{}; const title=clean(b.title);if(!title)return res.status(400).json({success:false,error:'Title is required.'}); const propertyId=Number(b.property_id)||null; if(propertyId){const ok=await query(`SELECT id FROM properties WHERE id=$1 AND owner_id=$2`,[propertyId,req.phaseOwner.id]);if(!ok.rows.length)return res.status(404).json({success:false,error:'Property not found.'});} const due=clean(b.due_date);if(due&&!validDate(due))return res.status(400).json({success:false,error:'Due date must be YYYY-MM-DD.'}); const r=await query(`INSERT INTO maintenance_tickets(owner_id,property_id,room_id,bed_id,tenant_id,title,description,category,priority,status,assigned_to,estimated_cost,actual_cost,due_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,[req.phaseOwner.id,propertyId,Number(b.room_id)||null,Number(b.bed_id)||null,Number(b.tenant_id)||null,title,clean(b.description),clean(b.category)||'General',clean(b.priority)||'Medium',clean(b.status)||'Open',clean(b.assigned_to),Math.max(0,num(b.estimated_cost)),Math.max(0,num(b.actual_cost)),due||null]); await audit(req,'create_maintenance','maintenance',r.rows[0].id);res.status(201).json(r.rows[0]);});
router.put('/maintenance/:id', async(req,res)=>{const id=Number(req.params.id),b=req.body||{};if(!Number.isInteger(id))return res.status(400).json({success:false,error:'Invalid ticket id.'}); const r=await query(`UPDATE maintenance_tickets SET title=COALESCE(NULLIF($1,''),title),description=$2,category=$3,priority=$4,status=$5,assigned_to=$6,estimated_cost=$7,actual_cost=$8,due_date=$9,updated_at=CURRENT_TIMESTAMP,resolved_at=CASE WHEN LOWER($5)='resolved' THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE NULL END WHERE id=$10 AND owner_id=$11 RETURNING *`,[clean(b.title),clean(b.description),clean(b.category)||'General',clean(b.priority)||'Medium',clean(b.status)||'Open',clean(b.assigned_to),Math.max(0,num(b.estimated_cost)),Math.max(0,num(b.actual_cost)),validDate(b.due_date)?b.due_date:null,id,req.phaseOwner.id]);if(!r.rows.length)return res.status(404).json({success:false,error:'Ticket not found.'});await audit(req,'update_maintenance','maintenance',id,{status:b.status});res.json(r.rows[0]);});
router.delete('/maintenance/:id',async(req,res)=>{const id=Number(req.params.id);const r=await query(`DELETE FROM maintenance_tickets WHERE id=$1 AND owner_id=$2 RETURNING id`,[id,req.phaseOwner.id]);if(!r.rows.length)return res.status(404).json({success:false,error:'Ticket not found.'});await audit(req,'delete_maintenance','maintenance',id);res.json({success:true,id});});
router.get('/operations/summary',async(req,res)=>{const id=req.phaseOwner.id;const [tickets,beds,tenants,activity]=await Promise.all([query(`SELECT COUNT(*)::integer total,COUNT(*) FILTER(WHERE LOWER(status) IN('open','in progress'))::integer open,COUNT(*) FILTER(WHERE LOWER(priority) IN('urgent','high') AND LOWER(status) NOT IN('resolved','closed'))::integer critical,COALESCE(SUM(actual_cost),0) cost FROM maintenance_tickets WHERE owner_id=$1`,[id]),query(`SELECT COUNT(*)::integer total,COUNT(*) FILTER(WHERE is_occupied)::integer occupied FROM beds b JOIN rooms r ON r.id=b.room_id JOIN properties p ON p.id=r.property_id WHERE p.owner_id=$1`,[id]),query(`SELECT COUNT(*) FILTER(WHERE LOWER(status)='active')::integer active,COUNT(*) FILTER(WHERE LOWER(status)<>'active')::integer inactive FROM tenants t JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1`,[id]),query(`SELECT action,entity_type,entity_id,created_at,details FROM audit_logs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 10`,[id])]);res.json({tickets:tickets.rows[0],beds:beds.rows[0],tenants:tenants.rows[0],activity:activity.rows});});

// ---------------- PHASE 8: SECURITY, ROLES & MULTI-USER ----------------
const defaultPermissions={dashboard:true,properties:true,rooms:true,tenants:true,payments:true,invoices:true,finance:true,operations:true,automation:true,team:false,security:false};
router.get('/team',async(req,res)=>{const r=await query(`SELECT id,name,email,role,permissions,property_ids,active,created_at,updated_at FROM team_users WHERE owner_id=$1 ORDER BY created_at DESC`,[req.phaseOwner.id]);res.json(r.rows);});
router.post('/team',async(req,res)=>{const b=req.body||{},name=clean(b.name),email=clean(b.email).toLowerCase(),password=String(b.password||'');if(!name||!email||password.length<6)return res.status(400).json({success:false,error:'Name, email and a password of at least 6 characters are required.'});const role=['manager','staff','viewer'].includes(clean(b.role))?clean(b.role):'staff';const perms={...defaultPermissions,...(b.permissions||{})};if(role==='viewer'){for(const k of Object.keys(perms))perms[k]=['dashboard','properties','rooms','tenants','finance','operations'].includes(k);}if(role==='manager')perms.team=false;try{const r=await query(`INSERT INTO team_users(owner_id,name,email,password_hash,role,permissions,property_ids) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) RETURNING id,name,email,role,permissions,property_ids,active,created_at`,[req.phaseOwner.id,name,email,hash(password),role,JSON.stringify(perms),JSON.stringify(Array.isArray(b.property_ids)?b.property_ids:[])]);await audit(req,'create_team_user','team_user',r.rows[0].id,{role,email});res.status(201).json(r.rows[0]);}catch(e){if(e.code==='23505')return res.status(409).json({success:false,error:'A team user with this email already exists.'});throw e;}});
router.put('/team/:id',async(req,res)=>{const id=Number(req.params.id),b=req.body||{};const fields=[];const params=[];let n=1;for(const [col,val] of [['name',clean(b.name)],['email',clean(b.email).toLowerCase()],['role',clean(b.role)],['active',b.active!==false]]){if(val!==''||col==='active'){fields.push(`${col}=$${n++}`);params.push(val);}}if(b.password){fields.push(`password_hash=$${n++}`);params.push(hash(String(b.password)));}if(b.permissions){fields.push(`permissions=$${n++}::jsonb`);params.push(JSON.stringify(b.permissions));}if(Array.isArray(b.property_ids)){fields.push(`property_ids=$${n++}::jsonb`);params.push(JSON.stringify(b.property_ids));}fields.push('updated_at=CURRENT_TIMESTAMP');params.push(id,req.phaseOwner.id);const r=await query(`UPDATE team_users SET ${fields.join(',')} WHERE id=$${n++} AND owner_id=$${n} RETURNING id,name,email,role,permissions,property_ids,active,created_at,updated_at`,params);if(!r.rows.length)return res.status(404).json({success:false,error:'Team user not found.'});await audit(req,'update_team_user','team_user',id);res.json(r.rows[0]);});
router.post('/team/login',async(req,res)=>{const b=req.body||{},email=clean(b.email).toLowerCase(),password=String(b.password||'');const r=await query(`SELECT id,owner_id,name,email,password_hash,role,permissions,property_ids FROM team_users WHERE LOWER(email)=LOWER($1) AND active=TRUE LIMIT 1`,[email]);if(!r.rows.length||hash(password)!==r.rows[0].password_hash)return res.status(401).json({success:false,error:'Invalid team credentials.'});const u=r.rows[0],token=crypto.randomBytes(48).toString('hex');await query(`DELETE FROM team_sessions WHERE team_user_id=$1 OR expires_at<CURRENT_TIMESTAMP`,[u.id]);await query(`INSERT INTO team_sessions(team_user_id,token_hash,expires_at) VALUES($1,$2,CURRENT_TIMESTAMP+INTERVAL '12 hours')`,[u.id,hash(token)]);res.setHeader('Set-Cookie',`${STAFF_COOKIE}=${encodeURIComponent(token)}; Max-Age=43200; Path=/; HttpOnly; SameSite=Lax`);res.json({success:true,user:{id:u.id,owner_id:u.owner_id,name:u.name,email:u.email,role:u.role,permissions:u.permissions,property_ids:u.property_ids}});});
router.post('/team/:id/reset-session',async(req,res)=>{const id=Number(req.params.id);const r=await query(`UPDATE team_users SET updated_at=CURRENT_TIMESTAMP WHERE id=$1 AND owner_id=$2 RETURNING id`,[id,req.phaseOwner.id]);if(!r.rows.length)return res.status(404).json({success:false,error:'Team user not found.'});await query(`DELETE FROM team_sessions WHERE team_user_id=$1`,[id]);await audit(req,'revoke_team_sessions','team_user',id);res.json({success:true});});
router.get('/audit',async(req,res)=>{const limit=Math.min(500,Math.max(1,Number(req.query.limit)||100));const r=await query(`SELECT * FROM audit_logs WHERE owner_id=$1 ORDER BY created_at DESC LIMIT $2`,[req.phaseOwner.id,limit]);res.json(r.rows);});

// ---------------- PHASE 9: PRODUCTION / SCALE ----------------
router.get('/system/health',async(req,res)=>{const started=Date.now();let db='ok';try{await query('SELECT 1');}catch(e){db='error';}res.status(db==='ok'?200:503).json({success:db==='ok',status:db==='ok'?'ok':'degraded',database:db,latency_ms:Date.now()-started,node:process.version,uptime_seconds:Math.floor(process.uptime()),timestamp:new Date().toISOString()});});
router.get('/system/metrics',async(req,res)=>{const id=req.phaseOwner.id;const r=await query(`SELECT (SELECT COUNT(*) FROM properties WHERE owner_id=$1) properties,(SELECT COUNT(*) FROM rooms r JOIN properties p ON p.id=r.property_id WHERE p.owner_id=$1) rooms,(SELECT COUNT(*) FROM beds b JOIN rooms r ON r.id=b.room_id JOIN properties p ON p.id=r.property_id WHERE p.owner_id=$1) beds,(SELECT COUNT(*) FROM tenants t JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1) tenants,(SELECT COUNT(*) FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1) invoices,(SELECT COUNT(*) FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1) payments,(SELECT COUNT(*) FROM expenses WHERE owner_id=$1) expenses,(SELECT COUNT(*) FROM maintenance_tickets WHERE owner_id=$1) maintenance`,[id]);res.json({success:true,metrics:r.rows[0],process:{uptime_seconds:Math.floor(process.uptime()),memory:process.memoryUsage()}});});
router.get('/system/backup',async(req,res)=>{const id=req.phaseOwner.id;const tables={};const specs={properties:`SELECT * FROM properties WHERE owner_id=$1`,rooms:`SELECT r.* FROM rooms r JOIN properties p ON p.id=r.property_id WHERE p.owner_id=$1`,beds:`SELECT b.* FROM beds b JOIN rooms r ON r.id=b.room_id JOIN properties p ON p.id=r.property_id WHERE p.owner_id=$1`,tenants:`SELECT t.* FROM tenants t JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1`,invoices:`SELECT i.* FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1`,payments:`SELECT pay.* FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1`,expenses:`SELECT * FROM expenses WHERE owner_id=$1`,maintenance:`SELECT * FROM maintenance_tickets WHERE owner_id=$1`,notifications:`SELECT * FROM notifications WHERE owner_id=$1`,audit_logs:`SELECT * FROM audit_logs WHERE owner_id=$1`};for(const [k,sql] of Object.entries(specs)){try{tables[k]=(await query(sql,[id])).rows;}catch(e){tables[k]=[];}}res.json({success:true,generated_at:new Date().toISOString(),owner:{id:req.phaseOwner.id,name:req.phaseOwner.name,email:req.phaseOwner.email},tables});});
router.get('/system/checks',async(req,res)=>{const checks=[];for(const [name,sql] of [['database','SELECT 1'],['invoices','SELECT COUNT(*) FROM invoices i JOIN tenants t ON t.id=i.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1'],['payments','SELECT COUNT(*) FROM payments pay JOIN tenants t ON t.id=pay.tenant_id JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1'],['expenses','SELECT COUNT(*) FROM expenses WHERE owner_id=$1'],['maintenance','SELECT COUNT(*) FROM maintenance_tickets WHERE owner_id=$1']]){const started=Date.now();try{const r=await query(sql,[req.phaseOwner.id]);checks.push({name,status:'ok',latency_ms:Date.now()-started,count:Number(r.rows[0]?.count||0)});}catch(e){checks.push({name,status:'error',latency_ms:Date.now()-started,error:e.message});}}res.json({success:checks.every(x=>x.status==='ok'),checks});});

export default router;
