import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
let tableReady = null;
const clean = (value) => String(value ?? '').trim();
const money = (value) => Number(value);
function hashValue(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }
function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i === -1) continue;
    const key = part.slice(0, i).trim(); const value = part.slice(i + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}
async function ensureTable() {
  if (!tableReady) {
    tableReady = query(`
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
      CREATE INDEX IF NOT EXISTS idx_expenses_owner_date ON expenses(owner_id, expense_date);
      CREATE INDEX IF NOT EXISTS idx_expenses_owner_property ON expenses(owner_id, property_id);
    `).catch((error) => { tableReady = null; throw error; });
  }
  return tableReady;
}
async function syncMaintenanceExpenses(ownerId) {
  try {
    await query(`
      INSERT INTO expenses (owner_id, property_id, expense_date, category, amount, note, created_at)
      SELECT m.owner_id, m.property_id, COALESCE(m.due_date, m.created_at::date), 'Maintenance', m.actual_cost,
             '[maintenance:' || m.id::text || '] ' || COALESCE(NULLIF(m.category,''),'General') || ': ' || COALESCE(m.description,''),
             COALESCE(m.created_at, CURRENT_TIMESTAMP)
      FROM maintenance_tickets m
      WHERE m.owner_id=$1
        AND COALESCE(m.actual_cost,0)>0
        AND NOT EXISTS (
          SELECT 1 FROM expenses e
          WHERE e.owner_id=m.owner_id
            AND e.category='Maintenance'
            AND (
              e.note LIKE '[maintenance:' || m.id::text || ']%'
              OR e.note = COALESCE(NULLIF(m.category,''),'General') || ': ' || COALESCE(m.description,'')
            )
        )
    `, [ownerId]);
  } catch (error) {
    if (!/maintenance_tickets.*does not exist/i.test(String(error?.message || ''))) throw error;
  }
}
async function requireOwner(req, res, next) {
  try {
    await ensureTable();
    const token = cookies(req).peacely_session;
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required.' });
    const result = await query(`SELECT o.id,o.name,o.email FROM sessions s INNER JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`, [hashValue(token)]);
    if (!result.rows.length) return res.status(401).json({ success: false, error: 'Authentication required.' });
    req.expenseOwner = result.rows[0];
    return next();
  } catch (error) {
    console.error('Expense auth failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to access expenses.' });
  }
}
function validDate(value) { return /^\d{4}-\d{2}-\d{2}$/.test(clean(value)); }
async function propertyForOwner(ownerId, propertyId) {
  if (propertyId === null || propertyId === undefined || propertyId === '') return null;
  const id = Number(propertyId);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid property.');
  const result = await query(`SELECT id,name FROM properties WHERE id=$1 AND owner_id=$2 LIMIT 1`, [id, ownerId]);
  if (!result.rows.length) throw new Error('Selected property was not found.');
  return result.rows[0];
}
router.get('/expenses', requireOwner, async (req,res) => {
  try {
    const ownerId=req.expenseOwner.id;
    await syncMaintenanceExpenses(ownerId);
    const month=clean(req.query.month), propertyId=clean(req.query.property_id);
    const params=[ownerId], where=['e.owner_id=$1'];
    if(month){ if(!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({success:false,error:'Month must be YYYY-MM.'}); params.push(`${month}-01`); where.push('e.expense_date >= $2::date'); where.push("e.expense_date < ($2::date + INTERVAL '1 month')"); }
    if(propertyId){ const id=Number(propertyId); if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,error:'Invalid property.'}); params.push(id); where.push(`e.property_id=$${params.length}`); }
    const result=await query(`SELECT e.id,e.property_id,p.name AS property_name,e.expense_date,e.category,e.amount,e.note,e.created_at,e.created_at AS updated_at FROM expenses e LEFT JOIN properties p ON p.id=e.property_id AND p.owner_id=e.owner_id WHERE ${where.join(' AND ')} ORDER BY e.expense_date DESC,e.id DESC`,params);
    return res.json(result.rows);
  }catch(error){ console.error('Expense list failed:',error); return res.status(500).json({success:false,error:error.message||'Unable to load expenses.'}); }
});
router.get('/expenses/summary', requireOwner, async (req,res) => {
  try{
    const ownerId=req.expenseOwner.id; await syncMaintenanceExpenses(ownerId);
    const month=clean(req.query.month),params=[ownerId],where=['e.owner_id=$1'];
    if(month){if(!/^\d{4}-\d{2}$/.test(month))return res.status(400).json({success:false,error:'Month must be YYYY-MM.'});params.push(`${month}-01`);where.push('e.expense_date >= $2::date');where.push("e.expense_date < ($2::date + INTERVAL '1 month')");}
    const totals=await query(`SELECT COALESCE(SUM(e.amount),0) AS total,COUNT(*)::INTEGER AS count FROM expenses e WHERE ${where.join(' AND ')}`,params);
    const categories=await query(`SELECT e.category,COALESCE(SUM(e.amount),0) AS amount,COUNT(*)::INTEGER AS count FROM expenses e WHERE ${where.join(' AND ')} GROUP BY e.category ORDER BY amount DESC`,params);
    const months=await query(`SELECT TO_CHAR(DATE_TRUNC('month',e.expense_date),'YYYY-MM') AS month,COALESCE(SUM(e.amount),0) AS amount,COUNT(*)::INTEGER AS count FROM expenses e WHERE e.owner_id=$1 AND e.expense_date>=DATE_TRUNC('month',CURRENT_DATE)-INTERVAL '11 months' GROUP BY DATE_TRUNC('month',e.expense_date) ORDER BY month DESC`,[ownerId]);
    return res.json({success:true,total:Number(totals.rows[0]?.total||0),count:Number(totals.rows[0]?.count||0),categories:categories.rows.map(r=>({...r,amount:Number(r.amount||0)})),months:months.rows.map(r=>({...r,amount:Number(r.amount||0)}))});
  }catch(error){console.error('Expense summary failed:',error);return res.status(500).json({success:false,error:'Unable to load expense summary.'});}
});
router.post('/expenses', requireOwner, async (req,res) => {
  try{
    const ownerId=req.expenseOwner.id,expenseDate=clean(req.body?.expense_date||req.body?.date),category=clean(req.body?.category)||'Other',amount=money(req.body?.amount),note=clean(req.body?.note||req.body?.notes),propertyId=req.body?.property_id===''||req.body?.property_id===undefined?null:req.body?.property_id;
    if(!validDate(expenseDate))return res.status(400).json({success:false,error:'Expense date must be YYYY-MM-DD.'});
    if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({success:false,error:'Expense amount must be greater than zero.'});
    if(category.length>100)return res.status(400).json({success:false,error:'Expense category is too long.'});
    const property=await propertyForOwner(ownerId,propertyId);
    const result=await query(`INSERT INTO expenses(owner_id,property_id,expense_date,category,amount,note) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,owner_id,property_id,expense_date,category,amount,note,created_at`,[ownerId,property?.id||null,expenseDate,category,amount,note]);
    return res.status(201).json({...result.rows[0],property_name:property?.name||null,updated_at:result.rows[0]?.created_at||null});
  }catch(error){console.error('Expense create failed:',error);return res.status(500).json({success:false,error:error.message||'Unable to create expense.'});}
});
router.put('/expenses/:id', requireOwner, async (req,res) => {
  try{
    const ownerId=req.expenseOwner.id,id=Number(req.params.id); if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,error:'Invalid expense id.'});
    const existing=await query(`SELECT id FROM expenses WHERE id=$1 AND owner_id=$2 LIMIT 1`,[id,ownerId]); if(!existing.rows.length)return res.status(404).json({success:false,error:'Expense not found.'});
    const expenseDate=clean(req.body?.expense_date||req.body?.date),category=clean(req.body?.category)||'Other',amount=money(req.body?.amount),note=clean(req.body?.note||req.body?.notes),propertyId=req.body?.property_id===''||req.body?.property_id===undefined?null:req.body?.property_id;
    if(!validDate(expenseDate))return res.status(400).json({success:false,error:'Expense date must be YYYY-MM-DD.'}); if(!Number.isFinite(amount)||amount<=0)return res.status(400).json({success:false,error:'Expense amount must be greater than zero.'});
    const property=await propertyForOwner(ownerId,propertyId); const result=await query(`UPDATE expenses SET property_id=$1,expense_date=$2,category=$3,amount=$4,note=$5 WHERE id=$6 AND owner_id=$7 RETURNING id,owner_id,property_id,expense_date,category,amount,note,created_at`,[property?.id||null,expenseDate,category,amount,note,id,ownerId]);
    return res.json({...result.rows[0],property_name:property?.name||null,updated_at:result.rows[0]?.created_at||null});
  }catch(error){console.error('Expense update failed:',error);return res.status(500).json({success:false,error:error.message||'Unable to update expense.'});}
});
router.delete('/expenses/:id', requireOwner, async (req,res) => {
  try{const ownerId=req.expenseOwner.id,id=Number(req.params.id);if(!Number.isInteger(id)||id<1)return res.status(400).json({success:false,error:'Invalid expense id.'});const result=await query(`DELETE FROM expenses WHERE id=$1 AND owner_id=$2 RETURNING id`,[id,ownerId]);if(!result.rows.length)return res.status(404).json({success:false,error:'Expense not found.');}return res.json({success:true,id});}catch(error){console.error('Expense delete failed:',error);return res.status(500).json({success:false,error:'Unable to delete expense.'});}
});
export default router;
