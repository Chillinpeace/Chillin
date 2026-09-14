import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  pool,
  query,
  initializeDatabase,
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/* -----------------------------
   HEALTH
----------------------------- */

app.get('/api/health', async (req, res) => {
  try {
    const result = await query('SELECT NOW() AS time');

    res.json({
      success: true,
      database: 'connected',
      time: result.rows[0].time,
    });
  } catch (error) {
    console.error('Health check failed:', error);

    res.status(500).json({
      success: false,
      database: 'disconnected',
      error: error.message,
    });
  }
});

/* -----------------------------
   PROPERTIES
----------------------------- */

app.get('/api/properties', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.id,
        p.name,
        p.address,
        p.created_at,

        COUNT(DISTINCT r.id)::INTEGER AS room_count,

        COUNT(DISTINCT b.id)::INTEGER AS bed_count,

        COUNT(
          DISTINCT CASE
            WHEN b.is_occupied = TRUE THEN b.id
          END
        )::INTEGER AS occupied_bed_count,

        COUNT(
          DISTINCT CASE
            WHEN t.status = 'Active' THEN t.id
          END
        )::INTEGER AS tenant_count,

        COALESCE(
          SUM(
            CASE
              WHEN t.status = 'Active'
              THEN t.monthly_rent
              ELSE 0
            END
          ),
          0
        )::NUMERIC AS monthly_revenue

      FROM properties p

      LEFT JOIN rooms r
        ON r.property_id = p.id

      LEFT JOIN beds b
        ON b.room_id = r.id

      LEFT JOIN tenants t
        ON t.property_id = p.id

      GROUP BY p.id

      ORDER BY p.id DESC
    `);

    const properties = result.rows.map((property) => {
      const beds = Number(property.bed_count || 0);
      const occupied = Number(property.occupied_bed_count || 0);

      return {
        ...property,
        room_count: Number(property.room_count || 0),
        bed_count: beds,
        occupied_bed_count: occupied,
        tenant_count: Number(property.tenant_count || 0),
        monthly_revenue: Number(property.monthly_revenue || 0),
        occupancy_rate:
          beds > 0 ? Math.round((occupied / beds) * 100) : 0,
      };
    });

    res.json(properties);
  } catch (error) {
    console.error('GET /api/properties:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/api/properties', async (req, res) => {
  const { name, address } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      error: 'Property name is required.',
    });
  }

  try {
    const result = await query(
      `
        INSERT INTO properties (name, address)
        VALUES ($1, $2)
        RETURNING *
      `,
      [
        name.trim(),
        address?.trim() || '',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/properties:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* -----------------------------
   ROOMS
----------------------------- */

app.get('/api/rooms', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        r.*,
        p.name AS property_name,

        COUNT(DISTINCT b.id)::INTEGER AS bed_count,

        COUNT(
          DISTINCT CASE
            WHEN b.is_occupied = TRUE THEN b.id
          END
        )::INTEGER AS occupied_bed_count

      FROM rooms r

      LEFT JOIN properties p
        ON p.id = r.property_id

      LEFT JOIN beds b
        ON b.room_id = r.id

      GROUP BY r.id, p.name

      ORDER BY r.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/rooms:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/api/rooms', async (req, res) => {
  const {
    property_id,
    room_number,
    sharing_type,
    rent_amount,
  } = req.body;

  if (!property_id) {
    return res.status(400).json({
      error: 'Property is required.',
    });
  }

  if (!room_number || !String(room_number).trim()) {
    return res.status(400).json({
      error: 'Room number is required.',
    });
  }

  try {
    const propertyCheck = await query(
      `
        SELECT id
        FROM properties
        WHERE id = $1
      `,
      [property_id]
    );

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Property not found.',
      });
    }

    const result = await query(
      `
        INSERT INTO rooms (
          property_id,
          room_number,
          sharing_type,
          rent_amount
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [
        property_id,
        String(room_number).trim(),
        sharing_type || 'Single',
        Number(rent_amount) || 0,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/rooms:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'This room number already exists in this property.',
      });
    }

    res.status(500).json({
      error: error.message,
    });
  }
});

/* -----------------------------
   BEDS
----------------------------- */

app.get('/api/beds', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        b.*,
        r.room_number,
        r.property_id,
        p.name AS property_name,
        t.id AS tenant_id,
        t.name AS tenant_name

      FROM beds b

      JOIN rooms r
        ON r.id = b.room_id

      JOIN properties p
        ON p.id = r.property_id

      LEFT JOIN tenants t
        ON t.bed_id = b.id
        AND t.status = 'Active'

      ORDER BY b.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/beds:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/api/beds', async (req, res) => {
  const { room_id, bed_number } = req.body;

  if (!room_id) {
    return res.status(400).json({
      error: 'Room is required.',
    });
  }

  if (!bed_number || !String(bed_number).trim()) {
    return res.status(400).json({
      error: 'Bed number is required.',
    });
  }

  try {
    const roomCheck = await query(
      `
        SELECT id
        FROM rooms
        WHERE id = $1
      `,
      [room_id]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Room not found.',
      });
    }

    const result = await query(
      `
        INSERT INTO beds (
          room_id,
          bed_number
        )
        VALUES ($1, $2)
        RETURNING *
      `,
      [
        room_id,
        String(bed_number).trim(),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/beds:', error);

    if (error.code === '23505') {
      return res.status(409).json({
        error: 'This bed number already exists in this room.',
      });
    }

    res.status(500).json({
      error: error.message,
    });
  }
});

/* -----------------------------
   TENANTS
----------------------------- */

app.get('/api/tenants', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        t.*,
        p.name AS property_name,
        r.room_number,
        b.bed_number

      FROM tenants t

      LEFT JOIN properties p
        ON p.id = t.property_id

      LEFT JOIN rooms r
        ON r.id = t.room_id

      LEFT JOIN beds b
        ON b.id = t.bed_id

      ORDER BY t.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/tenants:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/api/tenants', async (req, res) => {
  const {
    name,
    phone,
    email,
    property_id,
    room_id,
    bed_id,
    monthly_rent,
    due_date,
    deposit_amount,
    move_in_date,
  } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({
      error: 'Tenant name is required.',
    });
  }

  if (!phone || !String(phone).trim()) {
    return res.status(400).json({
      error: 'Tenant phone number is required.',
    });
  }

  if (!property_id) {
    return res.status(400).json({
      error: 'Property is required.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const propertyCheck = await client.query(
      `
        SELECT id
        FROM properties
        WHERE id = $1
      `,
      [property_id]
    );

    if (propertyCheck.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Property not found.',
      });
    }

    if (room_id) {
      const roomCheck = await client.query(
        `
          SELECT id, property_id
          FROM rooms
          WHERE id = $1
        `,
        [room_id]
      );

      if (roomCheck.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          error: 'Room not found.',
        });
      }

      if (Number(roomCheck.rows[0].property_id) !== Number(property_id)) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error: 'Room does not belong to the selected property.',
        });
      }
    }

    if (bed_id) {
      const bedCheck = await client.query(
        `
          SELECT
            b.id,
            b.room_id,
            b.is_occupied,
            r.property_id

          FROM beds b

          JOIN rooms r
            ON r.id = b.room_id

          WHERE b.id = $1
        `,
        [bed_id]
      );

      if (bedCheck.rows.length === 0) {
        await client.query('ROLLBACK');

        return res.status(404).json({
          error: 'Bed not found.',
        });
      }

      const bed = bedCheck.rows[0];

      if (Number(bed.property_id) !== Number(property_id)) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error: 'Bed does not belong to the selected property.',
        });
      }

      if (room_id && Number(bed.room_id) !== Number(room_id)) {
        await client.query('ROLLBACK');

        return res.status(400).json({
          error: 'Bed does not belong to the selected room.',
        });
      }

      if (bed.is_occupied) {
        await client.query('ROLLBACK');

        return res.status(409).json({
          error: 'Selected bed is already occupied.',
        });
      }
    }

    const tenantResult = await client.query(
      `
        INSERT INTO tenants (
          name,
          phone,
          email,
          property_id,
          room_id,
          bed_id,
          monthly_rent,
          due_date,
          deposit_amount,
          move_in_date,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'Active'
        )
        RETURNING *
      `,
      [
        name.trim(),
        String(phone).trim(),
        email?.trim() || '',
        property_id,
        room_id || null,
        bed_id || null,
        Number(monthly_rent) || 0,
        Number(due_date) || 5,
        Number(deposit_amount) || 0,
        move_in_date || null,
      ]
    );

    if (bed_id) {
      await client.query(
        `
          UPDATE beds
          SET is_occupied = TRUE
          WHERE id = $1
        `,
        [bed_id]
      );
    }

    await client.query('COMMIT');

    res.status(201).json(tenantResult.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('POST /api/tenants:', error);

    res.status(500).json({
      error: error.message,
    });
  } finally {
    client.release();
  }
});

/* -----------------------------
   PAYMENTS
----------------------------- */

app.get('/api/payments', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        pay.*,
        t.name AS tenant_name,
        p.name AS property_name,
        r.room_number

      FROM payments pay

      JOIN tenants t
        ON t.id = pay.tenant_id

      LEFT JOIN properties p
        ON p.id = t.property_id

      LEFT JOIN rooms r
        ON r.id = t.room_id

      ORDER BY pay.payment_date DESC, pay.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/payments:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/api/payments', async (req, res) => {
  const {
    tenant_id,
    amount,
    payment_date,
    payment_method,
    payment_month,
    notes,
  } = req.body;

  if (!tenant_id) {
    return res.status(400).json({
      error: 'Tenant is required.',
    });
  }

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      error: 'Valid payment amount is required.',
    });
  }

  if (!payment_month || !String(payment_month).trim()) {
    return res.status(400).json({
      error: 'Payment month is required.',
    });
  }

  try {
    const tenantCheck = await query(
      `
        SELECT id
        FROM tenants
        WHERE id = $1
      `,
      [tenant_id]
    );

    if (tenantCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Tenant not found.',
      });
    }

    const result = await query(
      `
        INSERT INTO payments (
          tenant_id,
          amount,
          payment_date,
          payment_method,
          payment_month,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        tenant_id,
        Number(amount),
        payment_date || new Date().toISOString().slice(0, 10),
        payment_method || 'UPI',
        payment_month.trim(),
        notes?.trim() || '',
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('POST /api/payments:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

/* -----------------------------
   INVOICES
----------------------------- */

app.get('/api/invoices', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        inv.*,
        t.name AS tenant_name,
        p.name AS property_name,
        r.room_number

      FROM invoices inv

      JOIN tenants t
        ON t.id = inv.tenant_id

      LEFT JOIN properties p
        ON p.id = t.property_id

      LEFT JOIN rooms r
        ON r.id = t.room_id

      ORDER BY inv.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error('GET /api/invoices:', error);

    res.status(500).json({
      error: error.message,
    });
  }
});

app.post('/api/invoices', async (req, res) => {
  const {
    tenant_id,
    amount,
    month,
    due_date,
    status,
  } = req.body;

  if (!tenant_id) {
    return res.status(400).json({
      error: 'Tenant is required.',
    });
  }

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      error: 'Valid invoice amount is required.',
    });
  }

  if (!due_date) {
    return res.status(400).json({
      error: 'Due date is required.',
    });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const tenantCheck = await client.query(
      `
        SELECT id
        FROM tenants
        WHERE id = $1
      `,
      [tenant_id]
    );

    if (tenantCheck.rows.length === 0) {
      await client.query('ROLLBACK');

      return res.status(404).json({
        error: 'Tenant not found.',
      });
    }

    const invoiceNumber = `INV-${Date.now()}`;

    const result = await client.query(
      `
        INSERT INTO invoices (
          invoice_number,
          tenant_id,
          amount,
          month,
          due_date,
          status
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `,
      [
        invoiceNumber,
        tenant_id,
        Number(amount),
        month?.trim() || null,
        due_date,
        status || 'Pending',
      ]
    );

    await client.query('COMMIT');

    res.status(201).json(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');

    console.error('POST /api/invoices:', error);

    res.status(500).json({
      error: error.message,
    });
  } finally {
    client.release();
  }
});

/* -----------------------------
   FRONTEND
----------------------------- */

const distPath = path.join(__dirname, '../dist');

app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

/* -----------------------------
   START SERVER
----------------------------- */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Peacely server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Unable to start Peacely server:', error);
    process.exit(1);
  }
}

startServer();
