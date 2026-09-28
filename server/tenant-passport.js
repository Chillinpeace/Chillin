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
     WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP
     LIMIT 1`,
    [hash(token)],
  );
  return r.rows[0] || null;
}

async function getTenant(ownerId, tenantId) {
  const r = await query(
    `SELECT t.id,t.name,t.phone,t.email,t.gender,t.id_proof_type,t.property_id,t.room_id,t.bed_id,
            t.monthly_rent,t.due_date,t.deposit_amount,t.move_in_date,t.move_out_date,t.status,
            p.name AS property_name,p.address AS property_address,
            r.room_number,b.bed_number
     FROM tenants t
     JOIN properties p ON p.id=t.property_id
     LEFT JOIN rooms r ON r.id=t.room_id
     LEFT JOIN beds b ON b.id=t.bed_id
     WHERE t.id=$1 AND p.owner_id=$2
     LIMIT 1`,
    [tenantId, ownerId],
  );
  return r.rows[0] || null;
}

async function optionalQuery(sql, params = []) {
  try {
    return await query(sql, params);
  } catch (error) {
    console.error('Tenant passport optional query failed:', error);
    return { rows: [] };
  }
}

router.get('/api/tenant-passport/:tenantId', async (req, res) => {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success:false, error:'Authentication required.' });

    const tenantId = Number(req.params.tenantId);
    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return res.status(400).json({ success:false, error:'Invalid tenant ID.' });
    }

    const tenant = await getTenant(owner.id, tenantId);
    if (!tenant) return res.status(404).json({ success:false, error:'Tenant not found.' });

    const [verification, invoices, payments, maintenance, documents, incidents, audit] = await Promise.all([
      optionalQuery(
        `SELECT id,source,status,consent_at,verified_at,reference_id,masked_document,created_at,updated_at
         FROM tenant_verifications WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,
        [owner.id, tenantId],
      ),
      optionalQuery(
        `SELECT id,invoice_number,amount,due_date,status,paid_amount,paid_at,created_at,updated_at
         FROM invoices WHERE tenant_id=$1 ORDER BY due_date DESC NULLS LAST, id DESC`,
        [tenantId],
      ),
      optionalQuery(
        `SELECT id,amount,payment_date,payment_method,payment_month,notes,invoice_id
         FROM payments WHERE tenant_id=$1 ORDER BY payment_date DESC NULLS LAST, id DESC`,
        [tenantId],
      ),
      optionalQuery(
        `SELECT id,property_id,room_id,bed_id,title,description,category,priority,status,
                assigned_to,estimated_cost,actual_cost,due_date,resolved_at,created_at,updated_at
         FROM maintenance_tickets WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,
        [owner.id, tenantId],
      ),
      optionalQuery(
        `SELECT id,document_type,title,document_url,notes,created_at
         FROM tenant_documents WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,
        [owner.id, tenantId],
      ),
      optionalQuery(
        `SELECT * FROM peacely_incidents
         WHERE owner_id=$1 AND tenant_id=$2 ORDER BY created_at DESC`,
        [owner.id, tenantId],
      ),
      optionalQuery(
        `SELECT id,action,entity_type,entity_id,old_values,new_values,metadata,environment,created_at
         FROM peacely_audit_log WHERE owner_id=$1 AND tenant_id=$2
         ORDER BY created_at DESC LIMIT 200`,
        [owner.id, tenantId],
      ),
    ]);

    const latestVerification = verification.rows[0] || null;
    const outstanding = invoices.rows.reduce((sum, invoice) => {
      const amount = Number(invoice.amount || 0);
      const paid = Number(invoice.paid_amount || 0);
      return sum + Math.max(amount - paid, 0);
    }, 0);

    const passport = {
      generated_at: new Date().toISOString(),
      version: 1,
      identity: {
        id: tenant.id,
        name: tenant.name,
        phone: tenant.phone,
        email: tenant.email || '',
        gender: tenant.gender || '',
        identity_proof_type: tenant.id_proof_type || '',
        verification: latestVerification ? {
          status: latestVerification.status,
          source: latestVerification.source,
          verified_at: latestVerification.verified_at,
          reference_id: latestVerification.reference_id || '',
          masked_document: latestVerification.masked_document || '',
        } : { status: 'not_started', source: '', verified_at: null, reference_id: '', masked_document: '' },
      },
      contract: {
        monthly_rent: Number(tenant.monthly_rent || 0),
        due_date: tenant.due_date,
        deposit_amount: Number(tenant.deposit_amount || 0),
        move_in_date: tenant.move_in_date,
        move_out_date: tenant.move_out_date,
        status: tenant.status,
      },
      property: {
        property_id: tenant.property_id,
        property_name: tenant.property_name,
        property_address: tenant.property_address,
        room_id: tenant.room_id,
        room_number: tenant.room_number,
        bed_id: tenant.bed_id,
        bed_number: tenant.bed_number,
      },
      financial: {
        outstanding_amount: outstanding,
        invoices: invoices.rows,
        payments: payments.rows,
      },
      operations: {
        maintenance: maintenance.rows,
        documents: documents.rows,
        incidents: incidents.rows,
      },
      timeline: [
        ...audit.rows.map((event) => ({
          type: 'audit',
          action: event.action,
          entity_type: event.entity_type,
          entity_id: event.entity_id,
          old_values: event.old_values,
          new_values: event.new_values,
          metadata: event.metadata,
          environment: event.environment,
          created_at: event.created_at,
        })),
        ...verification.rows.map((event) => ({
          type: 'verification',
          action: `verification_${event.status}`,
          entity_type: 'tenant_verification',
          entity_id: event.id,
          metadata: {
            source: event.source,
            reference_id: event.reference_id || '',
            masked_document: event.masked_document || '',
          },
          created_at: event.created_at,
        })),
      ].sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    };

    await recordAudit(owner.id, 'tenant-passport.viewed', 'tenant', String(tenantId), {
      tenantId,
      propertyId: tenant.property_id,
      metadata: { timeline_events: passport.timeline.length },
    });

    return res.json({ success:true, passport });
  } catch (error) {
    console.error('Tenant passport error:', error);
    return res.status(500).json({ success:false, error:error?.message || 'Unable to build tenant passport.' });
  }
});

export default router;
