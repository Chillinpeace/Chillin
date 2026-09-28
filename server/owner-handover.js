import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';

const clean = (value) => String(value ?? '').trim();

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

const hash = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

async function ownerFromRequest(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;

  const result = await query(
    `SELECT o.id,o.name,o.email
     FROM sessions s
     INNER JOIN owners o ON o.id=s.owner_id
     WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP
     LIMIT 1`,
    [hash(token)],
  );

  return result.rows[0] || null;
}

async function requireOwner(req, res, next) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success: false, error: 'Login required.' });
    req.owner = owner;
    next();
  } catch (error) {
    console.error('Owner handover authentication error:', error);
    return res.status(500).json({ success: false, error: 'Unable to verify session.' });
  }
}

async function ensureHandoverSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS peacely_owner_handovers (
      id BIGSERIAL PRIMARY KEY,
      owner_id INTEGER NOT NULL,
      property_id INTEGER NOT NULL,
      current_owner_name VARCHAR(200) NOT NULL DEFAULT '',
      current_owner_contact VARCHAR(120) NOT NULL DEFAULT '',
      new_owner_name VARCHAR(200) NOT NULL DEFAULT '',
      new_owner_contact VARCHAR(120) NOT NULL DEFAULT '',
      handover_date DATE NOT NULL DEFAULT CURRENT_DATE,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      notes TEXT NOT NULL DEFAULT '',
      property_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      financial_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      tenant_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      maintenance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      compliance_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_owner_handovers_owner_property
      ON peacely_owner_handovers(owner_id, property_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS peacely_owner_handover_acknowledgements (
      id BIGSERIAL PRIMARY KEY,
      handover_id BIGINT NOT NULL REFERENCES peacely_owner_handovers(id) ON DELETE CASCADE,
      party VARCHAR(30) NOT NULL,
      acknowledged_by VARCHAR(200) NOT NULL DEFAULT '',
      acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE(handover_id, party)
    );
  `);
}

ensureHandoverSchema().catch((error) => {
  console.error('Owner handover schema warning:', error);
});

async function propertyExistsForOwner(ownerId, propertyId) {
  const result = await query(
    'SELECT id,name,address,property_type,rent_cycle,created_at FROM properties WHERE id=$1 AND owner_id=$2 LIMIT 1',
    [propertyId, ownerId],
  );
  return result.rows[0] || null;
}

async function buildSnapshot(ownerId, propertyId) {
  const property = await propertyExistsForOwner(ownerId, propertyId);
  if (!property) return null;

  const [
    roomsResult,
    bedsResult,
    tenantsResult,
    invoicesResult,
    paymentsResult,
    expensesResult,
    maintenanceResult,
    incidentsResult,
    complianceResult,
  ] = await Promise.all([
    query(
      'SELECT * FROM rooms WHERE owner_id=$1 AND property_id=$2 ORDER BY id',
      [ownerId, propertyId],
    ),
    query(
      `SELECT b.*
       FROM beds b
       INNER JOIN rooms r ON r.id=b.room_id
       WHERE r.owner_id=$1 AND r.property_id=$2
       ORDER BY b.id`,
      [ownerId, propertyId],
    ),
    query(
      'SELECT * FROM tenants WHERE owner_id=$1 AND property_id=$2 ORDER BY id',
      [ownerId, propertyId],
    ),
    query(
      'SELECT * FROM invoices WHERE owner_id=$1 AND property_id=$2 ORDER BY id DESC',
      [ownerId, propertyId],
    ),
    query(
      `SELECT p.*
       FROM payments p
       INNER JOIN tenants t ON t.id=p.tenant_id
       WHERE t.owner_id=$1 AND t.property_id=$2
       ORDER BY p.id DESC`,
      [ownerId, propertyId],
    ),
    query(
      'SELECT * FROM expenses WHERE owner_id=$1 AND property_id=$2 ORDER BY id DESC',
      [ownerId, propertyId],
    ),
    query(
      `SELECT * FROM peacely_maintenance_jobs
       WHERE owner_id=$1 AND property_id=$2
       ORDER BY id DESC`,
      [ownerId, propertyId],
    ).catch(() => ({ rows: [] })),
    query(
      'SELECT * FROM peacely_incidents WHERE owner_id=$1 AND property_id=$2 ORDER BY id DESC',
      [ownerId, propertyId],
    ).catch(() => ({ rows: [] })),
    query(
      'SELECT * FROM peacely_compliance_items WHERE owner_id=$1 AND property_id=$2 ORDER BY id',
      [ownerId, propertyId],
    ).catch(() => ({ rows: [] })),
  ]);

  const activeTenants = tenantsResult.rows.filter(
    (tenant) => !['moved_out', 'inactive'].includes(String(tenant.status || '').toLowerCase()),
  );

  const occupiedBeds = bedsResult.rows.filter(
    (bed) => String(bed.status || '').toLowerCase() === 'occupied',
  );

  const outstanding = invoicesResult.rows.reduce(
    (sum, invoice) => sum + Math.max(
      Number(invoice.amount || 0) - Number(invoice.paid_amount || 0),
      0,
    ),
    0,
  );

  const collected = paymentsResult.rows.reduce(
    (sum, payment) => sum + Number(payment.amount || 0),
    0,
  );

  const expenses = expensesResult.rows.reduce(
    (sum, expense) => sum + Number(expense.amount || 0),
    0,
  );

  const financial = {
    invoice_count: invoicesResult.rows.length,
    payment_count: paymentsResult.rows.length,
    collected_total: collected,
    outstanding_total: outstanding,
    expense_total: expenses,
    deposit_total: activeTenants.reduce(
      (sum, tenant) => sum + Number(tenant.deposit_amount || 0),
      0,
    ),
  };

  return {
    captured_at: new Date().toISOString(),
    property: {
      ...property,
      owner_id: undefined,
    },
    structure: {
      rooms: roomsResult.rows,
      beds: bedsResult.rows,
      room_count: roomsResult.rows.length,
      bed_count: bedsResult.rows.length,
      occupied_beds: occupiedBeds.length,
      vacant_beds: Math.max(bedsResult.rows.length - occupiedBeds.length, 0),
    },
    tenants: {
      count: tenantsResult.rows.length,
      active_count: activeTenants.length,
      records: tenantsResult.rows,
    },
    financial,
    operations: {
      maintenance_count: maintenanceResult.rows.length,
      open_maintenance_count: maintenanceResult.rows.filter(
        (item) => !['completed', 'cancelled', 'closed'].includes(String(item.status || '').toLowerCase()),
      ).length,
      incident_count: incidentsResult.rows.length,
      open_incident_count: incidentsResult.rows.filter(
        (item) => !['resolved', 'closed'].includes(String(item.status || '').toLowerCase()),
      ).length,
      maintenance: maintenanceResult.rows,
      incidents: incidentsResult.rows,
    },
    compliance: {
      count: complianceResult.rows.length,
      records: complianceResult.rows,
      critical_count: complianceResult.rows.filter(
        (item) => ['critical', 'expired', 'failed'].includes(String(item.status || '').toLowerCase()),
      ).length,
      attention_count: complianceResult.rows.filter(
        (item) => ['attention', 'pending', 'expiring', 'manual_review'].includes(String(item.status || '').toLowerCase()),
      ).length,
    },
  };
}

function statusValue(value) {
  const status = clean(value).toLowerCase();
  return ['draft', 'ready', 'acknowledged', 'completed', 'cancelled'].includes(status)
    ? status
    : null;
}

router.get('/api/owner-handover', requireOwner, async (req, res) => {
  try {
    const propertyId = Number(req.query.property_id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ success: false, error: 'property_id is required.' });
    }

    const property = await propertyExistsForOwner(req.owner.id, propertyId);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found.' });

    const result = await query(
      `SELECT id,property_id,current_owner_name,current_owner_contact,
              new_owner_name,new_owner_contact,handover_date,status,notes,
              property_snapshot,financial_snapshot,tenant_snapshot,
              maintenance_snapshot,compliance_snapshot,created_at,updated_at
       FROM peacely_owner_handovers
       WHERE owner_id=$1 AND property_id=$2
       ORDER BY id DESC`,
      [req.owner.id, propertyId],
    );

    return res.json({ success: true, handovers: result.rows });
  } catch (error) {
    console.error('Owner handover list error:', error);
    return res.status(500).json({ success: false, error: 'Unable to load handovers.' });
  }
});

router.post('/api/owner-handover', requireOwner, async (req, res) => {
  try {
    const propertyId = Number(req.body?.property_id);
    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return res.status(400).json({ success: false, error: 'property_id is required.' });
    }

    const property = await propertyExistsForOwner(req.owner.id, propertyId);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found.' });

    const snapshot = await buildSnapshot(req.owner.id, propertyId);
    if (!snapshot) return res.status(404).json({ success: false, error: 'Unable to build property snapshot.' });

    const currentOwnerName = clean(req.body?.current_owner_name) || clean(req.owner.name);
    const currentOwnerContact = clean(req.body?.current_owner_contact) || clean(req.owner.email);
    const newOwnerName = clean(req.body?.new_owner_name);
    const newOwnerContact = clean(req.body?.new_owner_contact);
    const handoverDate = clean(req.body?.handover_date) || new Date().toISOString().slice(0, 10);
    const notes = clean(req.body?.notes);

    if (!newOwnerName) {
      return res.status(400).json({ success: false, error: 'new_owner_name is required.' });
    }

    const result = await query(
      `INSERT INTO peacely_owner_handovers
       (owner_id,property_id,current_owner_name,current_owner_contact,
        new_owner_name,new_owner_contact,handover_date,status,notes,
        property_snapshot,financial_snapshot,tenant_snapshot,
        maintenance_snapshot,compliance_snapshot)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'ready',$8,$9,$10,$11,$12,$13)
       RETURNING id,property_id,current_owner_name,current_owner_contact,
                 new_owner_name,new_owner_contact,handover_date,status,notes,
                 created_at,updated_at`,
      [
        req.owner.id,
        propertyId,
        currentOwnerName,
        currentOwnerContact,
        newOwnerName,
        newOwnerContact,
        handoverDate,
        notes,
        JSON.stringify({
          property: snapshot.property,
          structure: snapshot.structure,
        }),
        JSON.stringify(snapshot.financial),
        JSON.stringify(snapshot.tenants),
        JSON.stringify(snapshot.operations),
        JSON.stringify(snapshot.compliance),
      ],
    );

    const handover = result.rows[0];

    await recordAudit(req.owner.id, 'owner_handover.created', 'owner_handover', handover.id, {
      propertyId,
      metadata: {
        new_owner_name: newOwnerName,
        handover_date: handoverDate,
      },
    });

    return res.status(201).json({
      success: true,
      handover,
      snapshot: {
        property: snapshot.property,
        structure: snapshot.structure,
        financial: snapshot.financial,
        tenants: snapshot.tenants,
        operations: snapshot.operations,
        compliance: snapshot.compliance,
      },
    });
  } catch (error) {
    console.error('Owner handover create error:', error);
    return res.status(500).json({ success: false, error: 'Unable to create owner handover.' });
  }
});

router.get('/api/owner-handover/:id', requireOwner, async (req, res) => {
  try {
    const handoverId = Number(req.params.id);
    if (!Number.isInteger(handoverId) || handoverId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid handover id.' });
    }

    const result = await query(
      `SELECT *
       FROM peacely_owner_handovers
       WHERE id=$1 AND owner_id=$2
       LIMIT 1`,
      [handoverId, req.owner.id],
    );

    const handover = result.rows[0];
    if (!handover) return res.status(404).json({ success: false, error: 'Handover not found.' });

    const acknowledgements = await query(
      `SELECT id,party,acknowledged_by,acknowledged_at,metadata
       FROM peacely_owner_handover_acknowledgements
       WHERE handover_id=$1
       ORDER BY id`,
      [handoverId],
    );

    return res.json({
      success: true,
      handover,
      acknowledgements: acknowledgements.rows,
    });
  } catch (error) {
    console.error('Owner handover detail error:', error);
    return res.status(500).json({ success: false, error: 'Unable to load handover.' });
  }
});

router.patch('/api/owner-handover/:id/status', requireOwner, async (req, res) => {
  try {
    const handoverId = Number(req.params.id);
    const status = statusValue(req.body?.status);
    if (!status) return res.status(400).json({ success: false, error: 'Invalid handover status.' });

    const existing = await query(
      'SELECT * FROM peacely_owner_handovers WHERE id=$1 AND owner_id=$2 LIMIT 1',
      [handoverId, req.owner.id],
    );
    if (!existing.rows[0]) return res.status(404).json({ success: false, error: 'Handover not found.' });

    if (status === 'completed') {
      const ack = await query(
        `SELECT party FROM peacely_owner_handover_acknowledgements
         WHERE handover_id=$1 AND party IN ('current_owner','new_owner')`,
        [handoverId],
      );
      const parties = new Set(ack.rows.map((row) => row.party));
      if (!parties.has('current_owner') || !parties.has('new_owner')) {
        return res.status(409).json({
          success: false,
          error: 'Both current owner and new owner/manager must acknowledge before completion.',
        });
      }
    }

    const result = await query(
      `UPDATE peacely_owner_handovers
       SET status=$1,updated_at=CURRENT_TIMESTAMP
       WHERE id=$2 AND owner_id=$3
       RETURNING *`,
      [status, handoverId, req.owner.id],
    );

    await recordAudit(req.owner.id, 'owner_handover.status_changed', 'owner_handover', handoverId, {
      propertyId: existing.rows[0].property_id,
      oldValues: { status: existing.rows[0].status },
      newValues: { status },
    });

    return res.json({ success: true, handover: result.rows[0] });
  } catch (error) {
    console.error('Owner handover status error:', error);
    return res.status(500).json({ success: false, error: 'Unable to update handover status.' });
  }
});

router.post('/api/owner-handover/:id/acknowledge', requireOwner, async (req, res) => {
  try {
    const handoverId = Number(req.params.id);
    const party = clean(req.body?.party).toLowerCase();

    if (!['current_owner', 'new_owner'].includes(party)) {
      return res.status(400).json({ success: false, error: 'party must be current_owner or new_owner.' });
    }

    const result = await query(
      'SELECT * FROM peacely_owner_handovers WHERE id=$1 AND owner_id=$2 LIMIT 1',
      [handoverId, req.owner.id],
    );
    const handover = result.rows[0];
    if (!handover) return res.status(404).json({ success: false, error: 'Handover not found.' });

    const acknowledgedBy = clean(req.body?.acknowledged_by)
      || (party === 'current_owner' ? clean(handover.current_owner_name) : clean(handover.new_owner_name));

    if (!acknowledgedBy) {
      return res.status(400).json({ success: false, error: 'acknowledged_by is required.' });
    }

    const ack = await query(
      `INSERT INTO peacely_owner_handover_acknowledgements
       (handover_id,party,acknowledged_by,metadata)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (handover_id,party)
       DO UPDATE SET acknowledged_by=EXCLUDED.acknowledged_by,
                     acknowledged_at=CURRENT_TIMESTAMP,
                     metadata=EXCLUDED.metadata
       RETURNING id,party,acknowledged_by,acknowledged_at,metadata`,
      [
        handoverId,
        party,
        acknowledgedBy,
        JSON.stringify({
          method: 'peacely',
          note: clean(req.body?.note),
        }),
      ],
    );

    await recordAudit(req.owner.id, 'owner_handover.acknowledged', 'owner_handover', handoverId, {
      propertyId: handover.property_id,
      actorId: acknowledgedBy,
      metadata: { party },
    });

    return res.json({ success: true, acknowledgement: ack.rows[0] });
  } catch (error) {
    console.error('Owner handover acknowledgement error:', error);
    return res.status(500).json({ success: false, error: 'Unable to record acknowledgement.' });
  }
});

export default router;
