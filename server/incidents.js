import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router=express.Router();
const SESSION_COOKIE='peacely_session';
const hash=(v)=>crypto.createHash('sha256').update(String(v)).digest('hex');

function cookies(req){
  const out={};
  for(const part of String(req.headers.cookie||'').split(';')){
    const i=part.indexOf('=');
    if(i<0) continue;
    const k=part.slice(0,i).trim(),v=part.slice(i+1).trim();
    try{out[k]=decodeURIComponent(v);}catch{out[k]=v;}
  }
  return out;
}
async function owner(req){
  const token=cookies(req)[SESSION_COOKIE];
  if(!token)return null;
  const r=await query(`SELECT o.id,o.name,o.email FROM sessions s JOIN owners o ON o.id=s.owner_id
    WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1`,[hash(token)]);
  return r.rows[0]||null;
}
async function schema(){
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_incidents(
      id BIGSERIAL PRIMARY KEY,owner_id INTEGER NOT NULL,tenant_id INTEGER,property_id INTEGER,room_id INTEGER,bed_id INTEGER,
      incident_type VARCHAR(60) NOT NULL DEFAULT 'other',severity VARCHAR(20) NOT NULL DEFAULT 'medium',
      title VARCHAR(200) NOT NULL,description TEXT DEFAULT '',status VARCHAR(30) NOT NULL DEFAULT 'reported',
      action_taken TEXT DEFAULT '',escalated_to VARCHAR(200) DEFAULT '',resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_incidents_owner_status ON peacely_incidents(owner_id,status);
    CREATE INDEX IF NOT EXISTS idx_incidents_owner_tenant ON peacely_incidents(owner_id,tenant_id);
  `);
}
router.get('/api/incidents',async(req,res)=>{
  try{
    const o=await owner(req);if(!o)return res.status(401).json({success:false,error:'Authentication required.'});
    await schema();
    const r=await query(`SELECT * FROM peacely_incidents WHERE owner_id=$1 ORDER BY created_at DESC LIMIT 300`,[o.id]);
    return res.json({success:true,incidents:r.rows});
  }catch(e){return res.status(500).json({success:false,error:e?.message||'Unable to load incidents.'});}
});
router.post('/api/incidents',async(req,res)=>{
  try{
    const o=await owner(req);if(!o)return res.status(401).json({success:false,error:'Authentication required.'});
    await schema();
    const title=String(req.body?.title||'').trim();
    if(!title)return res.status(400).json({success:false,error:'Incident title is required.'});
    const types=new Set(['theft','damage','fight','safety','medical_emergency','fire','security','other']);
    const severities=new Set(['low','medium','high','critical']);
    const type=types.has(String(req.body?.incident_type))?String(req.body.incident_type):'other';
    const severity=severities.has(String(req.body?.severity))?String(req.body.severity):'medium';

    const tenantId = req.body?.tenant_id ? Number(req.body.tenant_id) : null;
    const propertyId = req.body?.property_id ? Number(req.body.property_id) : null;
    const roomId = req.body?.room_id ? Number(req.body.room_id) : null;
    const bedId = req.body?.bed_id ? Number(req.body.bed_id) : null;

    if ([tenantId, propertyId, roomId, bedId].some(v => v !== null && (!Number.isInteger(v) || v <= 0))) {
      return res.status(400).json({success:false,error:'Invalid incident resource ID.'});
    }

    // Every linked resource must belong to the authenticated owner.
    if (tenantId !== null) {
      const t = await query(
        `SELECT t.id,t.property_id,t.room_id,t.bed_id
         FROM tenants t
         INNER JOIN properties p ON p.id=t.property_id
         WHERE t.id=$1 AND p.owner_id=$2 LIMIT 1`,
        [tenantId,o.id],
      );
      if (!t.rows[0]) return res.status(404).json({success:false,error:'Tenant not found.'});
      if (propertyId !== null && propertyId !== Number(t.rows[0].property_id)) {
        return res.status(400).json({success:false,error:'Tenant does not belong to the selected property.'});
      }
      if (roomId !== null && roomId !== Number(t.rows[0].room_id)) {
        return res.status(400).json({success:false,error:'Tenant does not belong to the selected room.'});
      }
      if (bedId !== null && bedId !== Number(t.rows[0].bed_id)) {
        return res.status(400).json({success:false,error:'Tenant does not belong to the selected bed.'});
      }
    }

    if (propertyId !== null) {
      const p = await query(
        'SELECT id FROM properties WHERE id=$1 AND owner_id=$2 LIMIT 1',
        [propertyId,o.id],
      );
      if (!p.rows[0]) return res.status(404).json({success:false,error:'Property not found.'});
    }
    if (roomId !== null) {
      const room = await query(
        `SELECT r.id FROM rooms r INNER JOIN properties p ON p.id=r.property_id
         WHERE r.id=$1 AND p.owner_id=$2 AND ($3::integer IS NULL OR r.property_id=$3) LIMIT 1`,
        [roomId,o.id,propertyId],
      );
      if (!room.rows[0]) return res.status(404).json({success:false,error:'Room not found.'});
    }
    if (bedId !== null) {
      const bed = await query(
        `SELECT b.id FROM beds b
         INNER JOIN rooms r ON r.id=b.room_id
         INNER JOIN properties p ON p.id=r.property_id
         WHERE b.id=$1 AND p.owner_id=$2
           AND ($3::integer IS NULL OR r.property_id=$3)
           AND ($4::integer IS NULL OR b.room_id=$4)
         LIMIT 1`,
        [bedId,o.id,propertyId,roomId],
      );
      if (!bed.rows[0]) return res.status(404).json({success:false,error:'Bed not found.'});
    }

    const r=await query(`INSERT INTO peacely_incidents
      (owner_id,tenant_id,property_id,room_id,bed_id,incident_type,severity,title,description,status)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reported')
      RETURNING *`,[
        o.id,tenantId,propertyId,roomId,bedId,
        type,severity,title,String(req.body?.description||'')]);
    await recordAudit(o.id,'incident.created','incident',String(r.rows[0].id),{
      tenantId:r.rows[0].tenant_id,propertyId:r.rows[0].property_id,
      metadata:{incident_type:type,severity},
    });
    return res.status(201).json({success:true,incident:r.rows[0]});
  }catch(e){return res.status(500).json({success:false,error:e?.message||'Unable to create incident.'});}
});
router.patch('/api/incidents/:id',async(req,res)=>{
  try{
    const o=await owner(req);if(!o)return res.status(401).json({success:false,error:'Authentication required.'});
    await schema();
    const id=Number(req.params.id);
    const existing=await query(`SELECT * FROM peacely_incidents WHERE id=$1 AND owner_id=$2 LIMIT 1`,[id,o.id]);
    if(!existing.rows[0])return res.status(404).json({success:false,error:'Incident not found.'});
    const allowedStatus=new Set(['reported','acknowledged','action_taken','resolved','closed']);
    const status=allowedStatus.has(String(req.body?.status))?String(req.body.status):existing.rows[0].status;
    const r=await query(`UPDATE peacely_incidents SET status=$1,
      action_taken=COALESCE($2,action_taken),escalated_to=COALESCE($3,escalated_to),
      resolved_at=CASE WHEN $1 IN ('resolved','closed') THEN COALESCE(resolved_at,CURRENT_TIMESTAMP) ELSE resolved_at END,
      updated_at=CURRENT_TIMESTAMP WHERE id=$4 AND owner_id=$5 RETURNING *`,
      [status,req.body?.action_taken??null,req.body?.escalated_to??null,id,o.id]);
    await recordAudit(o.id,'incident.updated','incident',String(id),{
      tenantId:existing.rows[0].tenant_id,propertyId:existing.rows[0].property_id,
      oldValues:{status:existing.rows[0].status,action_taken:existing.rows[0].action_taken},
      newValues:{status,action_taken:r.rows[0].action_taken,escalated_to:r.rows[0].escalated_to},
    });
    return res.json({success:true,incident:r.rows[0]});
  }catch(e){return res.status(500).json({success:false,error:e?.message||'Unable to update incident.'});}
});
export default router;
