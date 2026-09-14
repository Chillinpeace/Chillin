import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, initializeDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// -----------------------------
// HEALTH
// -----------------------------
app.get('/api/health', async (req, res) => {
  try {
    const result = await query('SELECT NOW() AS time');

    res.json({
      success: true,
      database: 'connected',
      time: result.rows[0].time,
    });
  } catch (err) {
    console.error('Health error:', err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// -----------------------------
// PROPERTIES
// -----------------------------
app.get('/api/properties', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        p.id,
        p.name,
        p.address,
        p.created_at,

        COALESCE(r.room_count, 0)::int AS room_count,

        COALESCE(b.bed_count, 0)::int AS bed_count,

        COALESCE(b.occupied_bed_count, 0)::int
          AS occupied_bed_count,

        COALESCE(t.tenant_count, 0)::int
          AS tenant_count,

        COALESCE(t.monthly_revenue, 0)::numeric
          AS monthly_revenue

      FROM properties p

      LEFT JOIN (
        SELECT
          property_id,
          COUNT(*) AS room_count
        FROM rooms
        GROUP BY property_id
      ) r
        ON r.property_id = p.id

      LEFT JOIN (
        SELECT
          rooms.property_id,
          COUNT(beds.id) AS bed_count,
          COUNT(*) FILTER (
            WHERE beds.is_occupied = true
          ) AS occupied_bed_count
        FROM rooms
        LEFT JOIN beds
          ON beds.room_id = rooms.id
        GROUP BY rooms.property_id
      ) b
        ON b.property_id = p.id

      LEFT JOIN (
        SELECT
          property_id,

          COUNT(*) FILTER (
            WHERE status = 'Active'
          ) AS tenant_count,

          COALESCE(
            SUM(monthly_rent) FILTER (
              WHERE status = 'Active'
            ),
            0
          ) AS monthly_revenue

        FROM tenants
        GROUP BY property_id
      ) t
        ON t.property_id = p.id

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
          beds > 0
            ? Math.round((occupied / beds) * 100)
            : 0,
      };
    });

    res.json(properties);
  } catch (err) {
    console.error('GET properties error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/properties', async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const address = String(req.body?.address || '').trim();

    if (!name) {
      return res.status(400).json({
        error: 'Property name is required.',
      });
    }

    const result = await query(
      `
      INSERT INTO properties
        (name, address)
      VALUES
        ($1, $2)
      RETURNING
        id,
        name,
        address,
        created_at
      `,
      [
        name,
        address || 'No address added',
      ],
    );

    res.status(201).json({
      success: true,
      property: result.rows[0],
    });
  } catch (err) {
    console.error('POST property error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// -----------------------------
// ROOMS
// -----------------------------
app.get('/api/rooms', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        r.*,
        p.name AS property_name,
        COUNT(b.id)::int AS bed_count,
        COUNT(*) FILTER (
          WHERE b.is_occupied = true
        )::int AS occupied_bed_count
      FROM rooms r
      LEFT JOIN properties p
        ON p.id = r.property_id
      LEFT JOIN beds b
        ON b.room_id = r.id
      GROUP BY r.id, p.name
      ORDER BY r.id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('GET rooms error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const propertyId = Number(req.body?.property_id);
    const roomNumber = String(
      req.body?.room_number || '',
    ).trim();
    const sharingType = String(
      req.body?.sharing_type || 'Single',
    ).trim();
    const rentAmount = Number(
      req.body?.rent_amount || 0,
    );

    if (!propertyId) {
      return res.status(400).json({
        error: 'Property is required.',
      });
    }

    if (!roomNumber) {
      return res.status(400).json({
        error: 'Room number is required.',
      });
    }

    const result = await query(
      `
      INSERT INTO rooms
        (
          property_id,
          room_number,
          sharing_type,
          rent_amount
        )
      VALUES
        ($1, $2, $3, $4)
      RETURNING *
      `,
      [
        propertyId,
        roomNumber,
        sharingType,
        rentAmount,
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST room error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// -----------------------------
// BEDS
// -----------------------------
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
      ORDER BY b.id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('GET beds error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/beds', async (req, res) => {
  try {
    const roomId = Number(req.body?.room_id);
    const bedNumber = String(
      req.body?.bed_number || '',
    ).trim();

    if (!roomId) {
      return res.status(400).json({
        error: 'Room is required.',
      });
    }

    if (!bedNumber) {
      return res.status(400).json({
        error: 'Bed number is required.',
      });
    }

    const result = await query(
      `
      INSERT INTO beds
        (room_id, bed_number)
      VALUES
        ($1, $2)
      RETURNING *
      `,
      [roomId, bedNumber],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST bed error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// -----------------------------
// TENANTS
// -----------------------------
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
  } catch (err) {
    console.error('GET tenants error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/tenants', async (req, res) => {
  try {
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

    if (!name?.trim()) {
      return res.status(400).json({
        error: 'Tenant name is required.',
      });
    }

    if (!phone?.trim()) {
      return res.status(400).json({
        error: 'Phone number is required.',
      });
    }

    if (!property_id) {
      return res.status(400).json({
        error: 'Property is required.',
      });
    }

    const result = await query(
      `
      INSERT INTO tenants
        (
          name,
          phone,
          email,
          property_id,
          room_id,
          bed_id,
          monthly_rent,
          due_date,
          deposit_amount,
          move_in_date
        )
      VALUES
        (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
        )
      RETURNING *
      `,
      [
        name.trim(),
        phone.trim(),
        email || '',
        Number(property_id),
        room_id ? Number(room_id) : null,
        bed_id ? Number(bed_id) : null,
        Number(monthly_rent || 0),
        Number(due_date || 5),
        Number(deposit_amount || 0),
        move_in_date || null,
      ],
    );

    if (bed_id) {
      await query(
        `
        UPDATE beds
        SET is_occupied = true
        WHERE id = $1
        `,
        [Number(bed_id)],
      );
    }

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST tenant error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// -----------------------------
// PAYMENTS
// -----------------------------
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
      ORDER BY pay.id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('GET payments error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/payments', async (req, res) => {
  try {
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

    const result = await query(
      `
      INSERT INTO payments
        (
          tenant_id,
          amount,
          payment_date,
          payment_method,
          payment_month,
          notes
        )
      VALUES
        ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        Number(tenant_id),
        Number(amount),
        payment_date || new Date(),
        payment_method || 'UPI',
        payment_month || '',
        notes || '',
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST payment error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// -----------------------------
// INVOICES
// -----------------------------
app.get('/api/invoices', async (req, res) => {
  try {
    const result = await query(`
      SELECT
        inv.*,
        t.name AS tenant_name
      FROM invoices inv
      JOIN tenants t
        ON t.id = inv.tenant_id
      ORDER BY inv.id DESC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('GET invoices error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post('/api/invoices', async (req, res) => {
  try {
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

    const invoiceNumber =
      `INV-${Date.now().toString().slice(-6)}`;

    const result = await query(
      `
      INSERT INTO invoices
        (
          invoice_number,
          tenant_id,
          amount,
          month,
          due_date,
          status
        )
      VALUES
        ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        invoiceNumber,
        Number(tenant_id),
        Number(amount),
        month || '',
        due_date,
        status || 'Pending',
      ],
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('POST invoice error:', err);

    res.status(500).json({
      error: err.message,
    });
  }
});

// -----------------------------
// FRONTEND
// -----------------------------
const distPath = path.join(
  __dirname,
  '../dist',
);

app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(
    path.join(distPath, 'index.html'),
  );
});

// -----------------------------
// START SERVER
// -----------------------------
const startServer = async () => {
  try {
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `Peacely server running on port ${PORT}`,
      );
    });
  } catch (err) {
    console.error(
      'Failed to start Peacely:',
      err,
    );

    process.exit(1);
  }
};

startServer();
