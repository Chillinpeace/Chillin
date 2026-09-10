import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { pool, initializeDatabase } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");

    res.json({
      success: true,
      message: "Peacely database connected successfully",
      database: "connected",
      databaseTime: result.rows[0].now,
    });
  } catch (error) {
    console.error("Health check error:", error);

    res.status(500).json({
      success: false,
      message: "Database connection failed",
      database: "disconnected",
    });
  }
});

/* =========================================================
   PROPERTIES
========================================================= */

// Get all properties
app.get("/api/properties", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM properties
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get properties error:", error);
    res.status(500).json({ error: "Failed to fetch properties" });
  }
});

// Get one property with rooms and beds
app.get("/api/properties/:id", async (req, res) => {
  try {
    const propertyId = req.params.id;

    const propertyResult = await pool.query(
      `SELECT * FROM properties WHERE id = $1`,
      [propertyId]
    );

    if (propertyResult.rows.length === 0) {
      return res.status(404).json({ error: "Property not found" });
    }

    const roomsResult = await pool.query(
      `
      SELECT *
      FROM rooms
      WHERE property_id = $1
      ORDER BY id ASC
      `,
      [propertyId]
    );

    const rooms = [];

    for (const room of roomsResult.rows) {
      const bedsResult = await pool.query(
        `
        SELECT *
        FROM beds
        WHERE room_id = $1
        ORDER BY id ASC
        `,
        [room.id]
      );

      rooms.push({
        ...room,
        beds: bedsResult.rows,
      });
    }

    res.json({
      ...propertyResult.rows[0],
      rooms,
    });
  } catch (error) {
    console.error("Get property error:", error);
    res.status(500).json({ error: "Failed to fetch property" });
  }
});

// Add property
app.post("/api/properties", async (req, res) => {
  try {
    const { name, location, ownerId } = req.body;

    if (!name) {
      return res.status(400).json({
        error: "Property name is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO properties (name, location, owner_id)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [name, location || null, ownerId || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Add property error:", error);
    res.status(500).json({ error: "Failed to add property" });
  }
});

/* =========================================================
   ROOMS
========================================================= */

// Get rooms for property
app.get("/api/properties/:propertyId/rooms", async (req, res) => {
  try {
    const { propertyId } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM rooms
      WHERE property_id = $1
      ORDER BY id ASC
      `,
      [propertyId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get rooms error:", error);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// Add room
app.post("/api/properties/:propertyId/rooms", async (req, res) => {
  const client = await pool.connect();

  try {
    const { propertyId } = req.params;
    const { roomNumber, bedCount = 2 } = req.body;

    if (!roomNumber) {
      return res.status(400).json({
        error: "Room number is required",
      });
    }

    await client.query("BEGIN");

    const roomResult = await client.query(
      `
      INSERT INTO rooms (property_id, room_number)
      VALUES ($1, $2)
      RETURNING *
      `,
      [propertyId, roomNumber]
    );

    const room = roomResult.rows[0];

    const beds = [];

    for (let i = 1; i <= Number(bedCount); i++) {
      const bedResult = await client.query(
        `
        INSERT INTO beds (room_id, bed_number, occupied)
        VALUES ($1, $2, FALSE)
        RETURNING *
        `,
        [room.id, String.fromCharCode(64 + i)]
      );

      beds.push(bedResult.rows[0]);
    }

    await client.query("COMMIT");

    res.status(201).json({
      ...room,
      beds,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Add room error:", error);

    res.status(500).json({
      error: "Failed to add room",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

/* =========================================================
   BEDS
========================================================= */

// Get beds for room
app.get("/api/rooms/:roomId/beds", async (req, res) => {
  try {
    const { roomId } = req.params;

    const result = await pool.query(
      `
      SELECT *
      FROM beds
      WHERE room_id = $1
      ORDER BY id ASC
      `,
      [roomId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get beds error:", error);
    res.status(500).json({ error: "Failed to fetch beds" });
  }
});

// Change bed occupancy
app.patch("/api/beds/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { occupied } = req.body;

    const result = await pool.query(
      `
      UPDATE beds
      SET occupied = $1
      WHERE id = $2
      RETURNING *
      `,
      [Boolean(occupied), id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Bed not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update bed error:", error);
    res.status(500).json({ error: "Failed to update bed" });
  }
});

/* =========================================================
   TENANTS
========================================================= */

// Get all tenants
app.get("/api/tenants", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM tenants
      ORDER BY id ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get tenants error:", error);
    res.status(500).json({ error: "Failed to fetch tenants" });
  }
});

// Get tenant
app.get("/api/tenants/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM tenants
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Get tenant error:", error);
    res.status(500).json({ error: "Failed to fetch tenant" });
  }
});

// Add tenant
app.post("/api/tenants", async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      name,
      phone,
      email,
      ownerId,
      propertyId,
      roomId,
      bedId,
      rent,
      deposit,
      dueDay,
      moveInDate,
      status = "active",
    } = req.body;

    if (!name || !propertyId || !roomId || !bedId) {
      return res.status(400).json({
        error: "Name, property, room and bed are required",
      });
    }

    await client.query("BEGIN");

    const tenantResult = await client.query(
      `
      INSERT INTO tenants (
        owner_id,
        property_id,
        room_id,
        bed_id,
        name,
        phone,
        email,
        rent,
        deposit,
        due_day,
        move_in_date,
        status
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12
      )
      RETURNING *
      `,
      [
        ownerId || null,
        propertyId,
        roomId,
        bedId,
        name,
        phone || null,
        email || null,
        rent || 0,
        deposit || 0,
        dueDay || 5,
        moveInDate || null,
        status,
      ]
    );

    await client.query(
      `
      UPDATE beds
      SET occupied = TRUE
      WHERE id = $1
      `,
      [bedId]
    );

    await client.query("COMMIT");

    res.status(201).json(tenantResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Add tenant error:", error);

    res.status(500).json({
      error: "Failed to add tenant",
      details: error.message,
    });
  } finally {
    client.release();
  }
});

// Update tenant
app.put("/api/tenants/:id", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      propertyId,
      roomId,
      bedId,
      rent,
      deposit,
      dueDay,
      moveInDate,
      status,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE tenants
      SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        property_id = COALESCE($4, property_id),
        room_id = COALESCE($5, room_id),
        bed_id = COALESCE($6, bed_id),
        rent = COALESCE($7, rent),
        deposit = COALESCE($8, deposit),
        due_day = COALESCE($9, due_day),
        move_in_date = COALESCE($10, move_in_date),
        status = COALESCE($11, status)
      WHERE id = $12
      RETURNING *
      `,
      [
        name,
        phone,
        email,
        propertyId,
        roomId,
        bedId,
        rent,
        deposit,
        dueDay,
        moveInDate,
        status,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Tenant not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update tenant error:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
});

/* =========================================================
   PAYMENTS
========================================================= */

// Get all payments
app.get("/api/payments", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        p.*,
        t.name AS tenant_name
      FROM payments p
      JOIN tenants t ON t.id = p.tenant_id
      ORDER BY p.payment_date DESC, p.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get payments error:", error);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// Get payments for tenant
app.get("/api/tenants/:tenantId/payments", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM payments
      WHERE tenant_id = $1
      ORDER BY payment_date DESC
      `,
      [req.params.tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Get tenant payments error:", error);
    res.status(500).json({ error: "Failed to fetch tenant payments" });
  }
});

// Record payment
app.post("/api/payments", async (req, res) => {
  try {
    const {
      tenantId,
      amount,
      paymentDate,
      month,
      method,
      note,
    } = req.body;

    if (!tenantId || !amount || !paymentDate) {
      return res.status(400).json({
        error: "Tenant, amount and payment date are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO payments (
        tenant_id,
        amount,
        payment_date,
        month,
        method,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        tenantId,
        amount,
        paymentDate,
        month || null,
        method || null,
        note || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Record payment error:", error);
    res.status(500).json({ error: "Failed to record payment" });
  }
});

/* =========================================================
   INVOICES
========================================================= */

// Get all invoices
app.get("/api/invoices", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        i.*,
        t.name AS tenant_name
      FROM invoices i
      JOIN tenants t ON t.id = i.tenant_id
      ORDER BY i.id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get invoices error:", error);
    res.status(500).json({ error: "Failed to fetch invoices" });
  }
});

// Create invoice
app.post("/api/invoices", async (req, res) => {
  try {
    const {
      tenantId,
      invoiceNumber,
      amount,
      month,
      dueDate,
      status = "pending",
    } = req.body;

    if (!tenantId || !invoiceNumber || !amount) {
      return res.status(400).json({
        error: "Tenant, invoice number and amount are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO invoices (
        tenant_id,
        invoice_number,
        amount,
        month,
        due_date,
        status
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        tenantId,
        invoiceNumber,
        amount,
        month || null,
        dueDate || null,
        status,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create invoice error:", error);
    res.status(500).json({
      error: "Failed to create invoice",
      details: error.message,
    });
  }
});

// Update invoice status
app.patch("/api/invoices/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const result = await pool.query(
      `
      UPDATE invoices
      SET status = $1
      WHERE id = $2
      RETURNING *
      `,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Invoice not found",
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Update invoice error:", error);
    res.status(500).json({
      error: "Failed to update invoice",
    });
  }
});

/* =========================================================
   EXPENSES
========================================================= */

// Get expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM expenses
      ORDER BY expense_date DESC, id DESC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// Add expense
app.post("/api/expenses", async (req, res) => {
  try {
    const {
      ownerId,
      propertyId,
      amount,
      category,
      expenseDate,
      note,
    } = req.body;

    if (!amount || !expenseDate) {
      return res.status(400).json({
        error: "Amount and expense date are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO expenses (
        owner_id,
        property_id,
        amount,
        category,
        expense_date,
        note
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        ownerId || null,
        propertyId || null,
        amount,
        category || null,
        expenseDate,
        note || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Add expense error:", error);
    res.status(500).json({
      error: "Failed to add expense",
    });
  }
});

/* =========================================================
   DASHBOARD SUMMARY
========================================================= */

app.get("/api/dashboard", async (req, res) => {
  try {
    const properties = await pool.query(
      `SELECT COUNT(*)::int AS count FROM properties`
    );

    const rooms = await pool.query(
      `SELECT COUNT(*)::int AS count FROM rooms`
    );

    const beds = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE occupied = TRUE)::int AS occupied
      FROM beds
      `
    );

    const tenants = await pool.query(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active
      FROM tenants
      `
    );

    const rent = await pool.query(
      `
      SELECT COALESCE(SUM(rent), 0) AS total_rent
      FROM tenants
      WHERE status = 'active'
      `
    );

    const payments = await pool.query(
      `
      SELECT COALESCE(SUM(amount), 0) AS total_paid
      FROM payments
      WHERE DATE_TRUNC('month', payment_date)
          = DATE_TRUNC('month', CURRENT_DATE)
      `
    );

    const pendingInvoices = await pool.query(
      `
      SELECT COUNT(*)::int AS count
      FROM invoices
      WHERE status = 'pending'
      `
    );

    res.json({
      properties: properties.rows[0].count,
      rooms: rooms.rows[0].count,
      beds: {
        total: beds.rows[0].total,
        occupied: beds.rows[0].occupied,
        vacant: beds.rows[0].total - beds.rows[0].occupied,
      },
      tenants: {
        total: tenants.rows[0].total,
        active: tenants.rows[0].active,
      },
      monthlyRent: Number(rent.rows[0].total_rent),
      monthlyPaid: Number(payments.rows[0].total_paid),
      pendingInvoices: pendingInvoices.rows[0].count,
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      error: "Failed to load dashboard",
    });
  }
});

/* =========================================================
   SERVE REACT FRONTEND
========================================================= */

const distPath = path.join(__dirname, "../dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/* =========================================================
   START SERVER
========================================================= */

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Peacely server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Failed to start Peacely:", error);
    process.exit(1);
  }
}

startServer();
