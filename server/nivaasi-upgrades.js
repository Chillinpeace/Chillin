import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
const clean = (value) => String(value ?? '').trim();
const num = (value, fallback = 0) => { const n = Number(value); return Number.isFinite(n) ? n : fallback; };
const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const key = part.slice(0,i).trim(); const value = part.slice(i+1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

async function auth(req,res,next) {
  try {
    const token=cookies(req)[SESSION_COOKIE];
    if(!token) return res.status(401).json({error:'Authentication required.'});
    const result=await query(`SELECT o.id,o.name,o.email FROM sessions s INNER JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`,[hash(token)]);
    if(!result.rows.length) return res.status(401).json({error:'Authentication required.'});
    req.owner=result.rows[0]; next();
  } catch(error) { console.error('Nivaasi upgrades auth error:',error); return res.status(500).json({error:'Authentication check failed.'}); }
}

async function ownedTenant(ownerId,tenantId) {
  const result=await query(`SELECT t.id,t.name,t.phone,t.email,t.property_id,t.monthly_rent,t.due_date,t.deposit_amount,t.move_in_date,t.status,p.name AS property_name,r.room_number,b.bed_number FROM tenants t INNER JOIN properties p ON p.id=t.property_id LEFT JOIN rooms r ON r.id=t.room_id LEFT JOIN beds b ON b.id=t.bed_id WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,[tenantId,ownerId]);
  return result.rows[0]||null;
}

router.get('/nivaasi-upgrades/structure',auth,async(req,res)=>{const result=await query(`SELECT id,property_id,building_name,floor_name,created_at FROM property_levels WHERE owner_id=$1 ORDER BY property_id,building_name,floor_name`,[req.owner.id]);res.json(result.rows);});

router.post('/nivaasi-upgrades/structure',auth,async(req,res)=>{
  const propertyId=num(req.body.property_id),building=clean(req.body.building_name)||'Main Building',floor=clean(req.body.floor_name)||'Ground Floor';
  if(!propertyId)return res.status(400).json({error:'Property is required.'});
  const property=await query('SELECT id FROM properties WHERE id=$1 AND owner_id=$2 LIMIT 1',[propertyId,req.owner.id]);
  if(!property.rows.length)return res.status(404).json({error:'Property not found.'});
  const result=await query(`INSERT INTO property_levels(owner_id,property_id,building_name,floor_name) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id,property_id,building_name,floor_name) DO UPDATE SET floor_name=EXCLUDED.floor_name RETURNING id,property_id,building_name,floor_name,created_at`,[req.owner.id,propertyId,building,floor]);
  res.status(201).json(result.rows[0]);
});

router.get('/nivaasi-upgrades/documents',auth,async(req,res)=>{
  const tenantId=num(req.query.tenant_id); if(!tenantId)return res.status(400).json({error:'Tenant is required.'});
  if(!await ownedTenant(req.owner.id,tenantId))return res.status(404).json({error:'Tenant not found.'});
  const result=await query(`SELECT id,tenant_id,document_type,title,document_url,notes,created_at FROM tenant_documents WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC,id DESC`,[req.owner.id,tenantId]);res.json(result.rows);
});

router.post('/nivaasi-upgrades/documents',auth,async(req,res)=>{
  const tenantId=num(req.body.tenant_id),title=clean(req.body.title),type=clean(req.body.document_type)||'Other';
  if(!tenantId||!title)return res.status(400).json({error:'Tenant and document title are required.'});
  if(!await ownedTenant(req.owner.id,tenantId))return res.status(404).json({error:'Tenant not found.'});
  const result=await query(`INSERT INTO tenant_documents(owner_id,tenant_id,document_type,title,document_url,notes) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,tenant_id,document_type,title,document_url,notes,created_at`,[req.owner.id,tenantId,type,title,clean(req.body.document_url),clean(req.body.notes)]);res.status(201).json(result.rows[0]);
});

router.get('/nivaasi-upgrades/rent-settings',auth,async(req,res)=>{
  const result=await query(`INSERT INTO rent_settings(owner_id) VALUES($1) ON CONFLICT(owner_id) DO NOTHING RETURNING *`,[req.owner.id]);
  if(result.rows.length)return res.json(result.rows[0]);
  const existing=await query('SELECT * FROM rent_settings WHERE owner_id=$1 LIMIT 1',[req.owner.id]);res.json(existing.rows[0]);
});

router.put('/nivaasi-upgrades/rent-settings',auth,async(req,res)=>{
  const type=clean(req.body.late_fee_type).toLowerCase()==='percentage'?'percentage':'flat',lateFee=Math.max(num(req.body.late_fee_amount),0),grace=Math.max(Math.floor(num(req.body.grace_days)),0),before=Math.max(Math.floor(num(req.body.reminder_days_before,3)),0);
  const result=await query(`INSERT INTO rent_settings(owner_id,recurring_invoices_enabled,late_fee_enabled,late_fee_type,late_fee_amount,grace_days,whatsapp_enabled,sms_enabled,email_enabled,reminder_days_before,overdue_reminders_enabled,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_TIMESTAMP) ON CONFLICT(owner_id) DO UPDATE SET recurring_invoices_enabled=EXCLUDED.recurring_invoices_enabled,late_fee_enabled=EXCLUDED.late_fee_enabled,late_fee_type=EXCLUDED.late_fee_type,late_fee_amount=EXCLUDED.late_fee_amount,grace_days=EXCLUDED.grace_days,whatsapp_enabled=EXCLUDED.whatsapp_enabled,sms_enabled=EXCLUDED.sms_enabled,email_enabled=EXCLUDED.email_enabled,reminder_days_before=EXCLUDED.reminder_days_before,overdue_reminders_enabled=EXCLUDED.overdue_reminders_enabled,updated_at=CURRENT_TIMESTAMP RETURNING *`,[req.owner.id,Boolean(req.body.recurring_invoices_enabled),Boolean(req.body.late_fee_enabled),type,lateFee,grace,Boolean(req.body.whatsapp_enabled),Boolean(req.body.sms_enabled),Boolean(req.body.email_enabled),before,Boolean(req.body.overdue_reminders_enabled)]);res.json(result.rows[0]);
});

router.post('/nivaasi-upgrades/apply-late-fees',auth,async(req,res)=>{
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_applied BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS late_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0`);
  const settingsResult=await query('SELECT * FROM rent_settings WHERE owner_id=$1 LIMIT 1',[req.owner.id]),settings=settingsResult.rows[0];
  if(!settings?.late_fee_enabled||num(settings.late_fee_amount)<=0)return res.json({applied:0,message:'Late fees are disabled or amount is zero.'});
  const result=await query(`SELECT i.id,i.amount FROM invoices i INNER JOIN tenants t ON t.id=i.tenant_id INNER JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND LOWER(COALESCE(i.status,'')) NOT IN ('paid','cancelled') AND COALESCE(i.late_fee_applied,FALSE)=FALSE AND i.due_date < CURRENT_DATE - ($2::integer)`,[req.owner.id,Math.max(Math.floor(num(settings.grace_days)),0)]);
  let applied=0;
  for(const invoice of result.rows){const base=Number(invoice.amount||0),fee=clean(settings.late_fee_type)==='percentage'?base*Number(settings.late_fee_amount||0)/100:Number(settings.late_fee_amount||0);if(fee<=0)continue;await query(`UPDATE invoices SET amount=$1,late_fee_applied=TRUE,late_fee_amount=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$3`,[base+fee,fee,invoice.id]);applied++;}
  res.json({applied});
});

router.get('/nivaasi-upgrades/finance',auth,async(req,res)=>{
  const month=/^\d{4}-\d{2}$/.test(clean(req.query.month))?clean(req.query.month):new Date().toISOString().slice(0,7);
  const invoices=await query(`SELECT COALESCE(SUM(i.amount),0) AS expected,COALESCE(SUM(i.paid_amount),0) AS collected,COALESCE(SUM(GREATEST(i.amount-COALESCE(i.paid_amount,0),0)),0) AS pending,COUNT(*)::int AS invoice_count FROM invoices i INNER JOIN tenants t ON t.id=i.tenant_id INNER JOIN properties p ON p.id=t.property_id WHERE p.owner_id=$1 AND to_char(i.due_date,'YYYY-MM')=$2 AND LOWER(COALESCE(i.status,''))<>'cancelled'`,[req.owner.id,month]);
  const expenses=await query(`SELECT COALESCE(SUM(amount),0) AS expenses FROM expenses WHERE owner_id=$1 AND to_char(expense_date,'YYYY-MM')=$2`,[req.owner.id,month]);
  const expected=Number(invoices.rows[0]?.expected||0),collected=Number(invoices.rows[0]?.collected||0),pending=Number(invoices.rows[0]?.pending||0),expenseTotal=Number(expenses.rows[0]?.expenses||0);res.json({month,expected,collected,pending,expenses:expenseTotal,net:collected-expenseTotal,invoice_count:Number(invoices.rows[0]?.invoice_count||0)});
});

export default router;
