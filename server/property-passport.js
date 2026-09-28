import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router=express.Router();
const SESSION_COOKIE='peacely_session';
const hash=(v)=>crypto.createHash('sha256').update(String(v)).digest('hex');
function cookies(req){const o={};for(const p of String(req.headers.cookie||'').split(';')){const i=p.indexOf('=');if(i<0)continue;const k=p.slice(0,i).trim(),v=p.slice(i+1).trim();try{o[k]=decodeURIComponent(v)}catch{o[k]=v}}return o}
async function owner(req){const t=cookies(req)[SESSION_COOKIE];if(!t)return null;const r=await query(`SELECT o.id,o.name,o.email FROM sessions s JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`,[hash(t)]);return r.rows[0]||null}
async function schema(){await query(`
CREATE TABLE IF NOT EXISTS peacely_compliance_items(
 id BIGSERIAL PRIMARY KEY,owner_id INTEGER NOT NULL,property_id INTEGER NOT NULL,
 category VARCHAR(60) NOT NULL DEFAULT 'property',title VARCHAR(200) NOT NULL,
 status VARCHAR(30) NOT NULL DEFAULT 'attention',expiry_date DATE,document_url TEXT DEFAULT '',
 notes TEXT DEFAULT '',created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_compliance_owner_property ON peacely_compliance_items(owner_id,property_id);
`)}
router.get('/api/property-passport/:propertyId',async(req,res)=>{
 try{const o=await owner(req);if(!o)return res.status(401).json({success:false,error:'Authentication required.'});await schema();
 const id=Number(req.params.propertyId);
 const p=await query(`SELECT * FROM properties WHERE id=$1 AND owner_id=$2 LIMIT 1`,[id,o.id]);if(!p.rows[0])return res.status(404).json({success:false,error:'Property not found.'});
 const [rooms,beds,tenants,expenses,maintenance,incidents,compliance]=await Promise.all([
  query(`SELECT id,room_number,capacity,rent FROM rooms WHERE property_id=$1 ORDER BY room_number`,[id]).catch(()=>({rows:[]})),
  query(`SELECT b.id,b.bed_number,b.room_id,b.status,t.id AS tenant_id,t.name AS tenant_name FROM beds b LEFT JOIN tenants t ON t.bed_id=b.id WHERE b.property_id=$1 ORDER BY b.room_id,b.bed_number`,[id]).catch(()=>({rows:[]})),
  query(`SELECT id,name,phone,room_id,bed_id,status,monthly_rent,deposit_amount,move_in_date,move_out_date FROM tenants WHERE property_id=$1 ORDER BY name`,[id]).catch(()=>({rows:[]})),
  query(`SELECT id,expense_date,category,amount,note FROM expenses WHERE owner_id=$1 AND property_id=$2 ORDER BY expense_date DESC LIMIT 500`,[o.id,id]).catch(()=>({rows:[]})),
  query(`SELECT id,title,category,priority,status,assigned_to,estimated_cost,actual_cost,due_date,resolved_at,created_at FROM maintenance_tickets WHERE owner_id=$1 AND property_id=$2 ORDER BY created_at DESC LIMIT 300`,[o.id,id]).catch(()=>({rows:[]})),
  query(`SELECT id,tenant_id,incident_type,severity,title,status,created_at,resolved_at FROM peacely_incidents WHERE owner_id=$1 AND property_id=$2 ORDER BY created_at DESC LIMIT 300`,[o.id,id]).catch(()=>({rows:[]})),
  query(`SELECT * FROM peacely_compliance_items WHERE owner_id=$1 AND property_id=$2 ORDER BY expiry_date NULLS LAST,title`,[o.id,id]).catch(()=>({rows:[]})),
 ]);
 const occupied=beds.rows.filter(b=>String(b.status||'').toLowerCase()==='occupied'||b.tenant_id).length;
 const vacancies=Math.max(0,beds.rows.length-occupied);
 const radar=compliance.rows.map(x=>{let s=String(x.status||'attention');if(x.expiry_date&&new Date(x.expiry_date).getTime()<Date.now())s='critical';else if(x.expiry_date&&new Date(x.expiry_date).getTime()<Date.now()+30*86400000)s='attention';return {...x,effective_status:s}});
 const passport={generated_at:new Date().toISOString(),version:1,identity:p.rows[0],structure:{rooms:rooms.rows,beds:beds.rows},occupancy:{total_beds:beds.rows.length,occupied,vacant:vacancies},tenants:tenants.rows,financials:{expenses:expenses.rows,total_expenses:expenses.rows.reduce((s,x)=>s+Number(x.amount||0),0)},operations:{maintenance:maintenance.rows,incidents:incidents.rows},compliance:{items:radar,critical:radar.filter(x=>x.effective_status==='critical').length,attention:radar.filter(x=>x.effective_status==='attention').length,up_to_date:radar.filter(x=>x.effective_status==='up_to_date').length}};
 await recordAudit(o.id,'property-passport.viewed','property',String(id),{propertyId:id,metadata:{rooms:rooms.rows.length,beds:beds.rows.length}});
 return res.json({success:true,passport});
 }catch(e){console.error('Property passport error:',e);return res.status(500).json({success:false,error:e?.message||'Unable to build property passport.'})}
});
router.post('/api/property-compliance',async(req,res)=>{
 try{const o=await owner(req);if(!o)return res.status(401).json({success:false,error:'Authentication required.'});await schema();
 const propertyId=Number(req.body?.property_id);const title=String(req.body?.title||'').trim();if(!propertyId||!title)return res.status(400).json({success:false,error:'Property and compliance title are required.'});
 const p=await query(`SELECT id FROM properties WHERE id=$1 AND owner_id=$2 LIMIT 1`,[propertyId,o.id]);if(!p.rows[0])return res.status(404).json({success:false,error:'Property not found.'});
 const allowed=new Set(['property','safety','licence','document','other']);const category=allowed.has(String(req.body?.category))?String(req.body.category):'other';
 const status=new Set(['critical','attention','up_to_date']).has(String(req.body?.status))?String(req.body.status):'attention';
 const r=await query(`INSERT INTO peacely_compliance_items(owner_id,property_id,category,title,status,expiry_date,document_url,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,[o.id,propertyId,category,title,status,req.body?.expiry_date||null,String(req.body?.document_url||''),String(req.body?.notes||'')]);
 await recordAudit(o.id,'compliance.created','compliance_item',String(r.rows[0].id),{propertyId,newValues:r.rows[0]});return res.status(201).json({success:true,item:r.rows[0]});
 }catch(e){return res.status(500).json({success:false,error:e?.message||'Unable to create compliance item.'})}
});
export default router;
