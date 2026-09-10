import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { initializeDatabase, pool } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

/* =========================
   DATABASE
========================= */

let databaseReady = false;

try {
  await initializeDatabase();
  databaseReady = true;
  console.log("✅ Peacely PostgreSQL database is ready");
} catch (error) {
  console.error("❌ Database initialization failed:", error);
}

/* =========================
   HEALTH
========================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    application: "Peacely",
    database: databaseReady ? "connected" : "failed",
    message: databaseReady
      ? "Peacely API and database are working successfully"
      : "Peacely API is running but database initialization failed",
  });
});

/* =========================
   API ROOT
========================= */

app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to Peacely API",
  });
});

/* =========================
   PROPERTIES
========================= */

// Get all properties
app.get("/api/properties", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *
      FROM properties
      ORDER BY id DESC
    `);

    res.json({
      success: true,
      properties: result.rows,
    });
  } catch (error) {
    console.error("Get properties error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch properties",
    });
  }
});

// Get one property
app.get("/api/properties/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM properties
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    res.json({
      success: true,
      property: result.rows[0],
    });
  } catch (error) {
    console.error("Get property error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch property",
    });
  }
});

// Create property
app.post("/api/properties", async (req, res) => {
  try {
    const { name, location, owner_id = null } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Property name is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO properties (owner_id, name, location)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [owner_id, name, location || null]
    );

    res.status(201).json({
      success: true,
      property: result.rows[0],
    });
  } catch (error) {
    console.error("Create property error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create property",
    });
  }
});

// Update property
app.put("/api/properties/:id", async (req, res) => {
  try {
    const { name, location } = req.body;

    const result = await pool.query(
      `
      UPDATE properties
      SET name = COALESCE($1, name),
          location = COALESCE($2, location)
      WHERE id = $3
      RETURNING *
      `,
      [name, location, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    res.json({
      success: true,
      property: result.rows[0],
    });
  } catch (error) {
    console.error("Update property error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update property",
    });
  }
});

// Delete property
app.delete("/api/properties/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      DELETE FROM properties
      WHERE id = $1
      RETURNING *
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Property not found",
      });
    }

    res.json({
      success: true,
      message: "Property deleted successfully",
    });
  } catch (error) {
    console.error("Delete property error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete property",
    });
  }
});

/* =========================
   ROOMS
========================= */

// Get rooms
app.get("/api/properties/:propertyId/rooms", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM rooms
      WHERE property_id = $1
      ORDER BY id ASC
      `,
      [req.params.propertyId]
    );

    res.json({
      success: true,
      rooms: result.rows,
    });
  } catch (error) {
    console.error("Get rooms error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch rooms",
    });
  }
});

// Create room
app.post("/api/properties/:propertyId/rooms", async (req, res) => {
  try {
    const { room_number } = req.body;

    if (!room_number) {
      return res.status(400).json({
        success: false,
        message: "Room number is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO rooms (property_id, room_number)
      VALUES ($1, $2)
      RETURNING *
      `,
      [req.params.propertyId, room_number]
    );

    res.status(201).json({
      success: true,
      room: result.rows[0],
    });
  } catch (error) {
    console.error("Create room error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This room already exists in the property",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create room",
    });
  }
});

/* =========================
   BEDS
========================= */

// Get beds
app.get("/api/rooms/:roomId/beds", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT *
      FROM beds
      WHERE room_id = $1
      ORDER BY id ASC
      `,
      [req.params.roomId]
    );

    res.json({
      success: true,
      beds: result.rows,
    });
  } catch (error) {
    console.error("Get beds error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch beds",
    });
  }
});

// Create bed
app.post("/api/rooms/:roomId/beds", async (req, res) => {
  try {
    const { bed_number, occupied = false } = req.body;

    if (!bed_number) {
      return res.status(400).json({
        success: false,
        message: "Bed number is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO beds (room_id, bed_number, occupied)
      VALUES ($1, $2, $3)
      RETURNING *
      `,
      [req.params.roomId, bed_number, occupied]
    );

    res.status(201).json({
      success: true,
      bed: result.rows[0],
    });
  } catch (error) {
    console.error("Create bed error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "This bed already exists in the room",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create bed",
    });
  }
});

// Update bed occupancy
app.put("/api/beds/:id", async (req, res) => {
  try {
    const { occupied } = req.body;

    const result = await pool.query(
      `
      UPDATE beds
      SET occupied = $1
      WHERE id = $2
      RETURNING *
      `,
      [occupied, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bed not found",
      });
    }

    res.json({
      success: true,
      bed: result.rows[0],
    });
  } catch (error) {
    console.error("Update bed error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update bed",
    });
  }
});

/* =========================
   TENANTS
========================= */

// Get tenants
app.get("/api/tenants", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        t.*,
        p.name AS property_name,
        r.room_number,
        b.bed_number
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN rooms r ON r.id = t.room_id
      LEFT JOIN beds b ON b.id = t.bed_id
      ORDER BY t.id DESC
    `);

    res.json({
      success: true,
      tenants: result.rows,
    });
  } catch (error) {
    console.error("Get tenants error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tenants",
    });
  }
});

// Get tenant
app.get("/api/tenants/:id", async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        t.*,
        p.name AS property_name,
        r.room_number,
        b.bed_number
      FROM tenants t
      LEFT JOIN properties p ON p.id = t.property_id
      LEFT JOIN rooms r ON r.id = t.room_id
      LEFT JOIN beds b ON b.id = t.bed_id
      WHERE t.id = $1
      `,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    res.json({
      success: true,
      tenant: result.rows[0],
    });
  } catch (error) {
    console.error("Get tenant error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tenant",
    });
  }
});

// Create tenant
app.post("/api/tenants", async (req, res) => {
  try {
    const {
      owner_id = null,
      property_id = null,
      room_id = null,
      bed_id = null,
      name,
      phone = null,
      email = null,
      rent = 0,
      deposit = 0,
      due_day = 5,
      move_in_date = null,
      status = "active",
    } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Tenant name is required",
      });
    }

    const result = await pool.query(
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
        status,
      ]
    );

    // Mark bed occupied when a tenant is assigned
    if (bed_id) {
      await pool.query(
        `
        UPDATE beds
        SET occupied = TRUE
        WHERE id = $1
        `,
        [bed_id]
      );
    }

    res.status(201).json({
      success: true,
      tenant: result.rows[0],
    });
  } catch (error) {
    console.error("Create tenant error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create tenant",
    });
  }
});

// Update tenant
app.put("/api/tenants/:id", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      rent,
      deposit,
      due_day,
      status,
      property_id,
      room_id,
      bed_id,
    } = req.body;

    const result = await pool.query(
      `
      UPDATE tenants
      SET
        name = COALESCE($1, name),
        phone = COALESCE($2, phone),
        email = COALESCE($3, email),
        rent = COALESCE($4, rent),
        deposit = COALESCE($5, deposit),
        due_day = COALESCE($6, due_day),
        status = COALESCE($7, status),
        property_id = COALESCE($8, property_id),
        room_id = COALESCE($9, room_id),
        bed_id = COALESCE($10, bed_id)
      WHERE id = $11
      RETURNING *
      `,
      [
        name,
        phone,
        email,
        rent,
        deposit,
        due_day,
        status,
        property_id,
        room_id,
        bed_id,
        req.params.id,
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    res.json({
      success: true,
      tenant: result.rows[0],
    });
  } catch (error) {
    console.error("Update tenant error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update tenant",
    });
  }
});

// Delete tenant
app.delete("/api/tenants/:id", async (req, res) => {
  try {
    const tenantResult = await pool.query(
      `
      SELECT bed_id
      FROM tenants
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Tenant not found",
      });
    }

    const bedId = tenantResult.rows[0].bed_id;

    await pool.query(
      `
      DELETE FROM tenants
      WHERE id = $1
      `,
      [req.params.id]
    );

    if (bedId) {
      await pool.query(
        `
        UPDATE beds
        SET occupied = FALSE
        WHERE id = $1
        `,
        [bedId]
      );
    }

    res.json({
      success: true,
      message: "Tenant deleted successfully",
    });
  } catch (error) {
    console.error("Delete tenant error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete tenant",
    });
  }
});

/* =========================
   PAYMENTS
========================= */

// Get payments
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

    res.json({
      success: true,
      payments: result.rows,
    });
  } catch (error) {
    console.error("Get payments error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch payments",
    });
  }
});

// Record payment
app.post("/api/payments", async (req, res) => {
  try {
    const {
      tenant_id,
      amount,
      payment_date,
      month = null,
      method = null,
      note = null,
    } = req.body;

    if (!tenant_id || !amount || !payment_date) {
      return res.status(400).json({
        success: false,
        message: "Tenant, amount and payment date are required",
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
      [tenant_id, amount, payment_date, month, method, note]
    );

    res.status(201).json({
      success: true,
      payment: result.rows[0],
    });
  } catch (error) {
    console.error("Create payment error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to record payment",
    });
  }
});

/* =========================
   INVOICES
========================= */

// Get invoices
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

    res.json({
      success: true,
      invoices: result.rows,
    });
  } catch (error) {
    console.error("Get invoices error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch invoices",
    });
  }
});

// Create invoice
app.post("/api/invoices", async (req, res) => {
  try {
    const {
      tenant_id,
      invoice_number,
      amount,
      month = null,
      due_date = null,
      status = "pending",
    } = req.body;

    if (!tenant_id || !invoice_number || !amount) {
      return res.status(400).json({
        success: false,
        message: "Tenant, invoice number and amount are required",
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
        tenant_id,
        invoice_number,
        amount,
        month,
        due_date,
        status,
      ]
    );

    res.status(201).json({
      success: true,
      invoice: result.rows[0],
    });
  } catch (error) {
    console.error("Create invoice error:", error);

    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Invoice number already exists",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to create invoice",
    });
  }
});

// Update invoice status
app.put("/api/invoices/:id", async (req, res) => {
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
        success: false,
        message: "Invoice not found",
      });
    }

    res.json({
      success: true,
      invoice: result.rows[0],
    });
  } catch (error) {
    console.error("Update invoice error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update invoice",
    });
  }
});

/* =========================
   EXPENSES
========================= */

// Get expenses
app.get("/api/expenses", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        e.*,
        p.name AS property_name
      FROM expenses e
      LEFT JOIN properties p ON p.id = e.property_id
      ORDER BY e.expense_date DESC, e.id DESC
    `);

    res.json({
      success: true,
      expenses: result.rows,
    });
  } catch (error) {
    console.error("Get expenses error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch expenses",
    });
  }
});

// Create expense
app.post("/api/expenses", async (req, res) => {
  try {
    const {
      owner_id = null,
      property_id = null,
      amount,
      category = null,
      expense_date,
      note = null,
    } = req.body;

    if (!amount || !expense_date) {
      return res.status(400).json({
        success: false,
        message: "Amount and expense date are required",
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
        owner_id,
        property_id,
        amount,
        category,
        expense_date,
        note,
      ]
    );

    res.status(201).json({
      success: true,
      expense: result.rows[0],
    });
  } catch (error) {
    console.error("Create expense error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create expense",
    });
  }
});

/* =========================
   DASHBOARD SUMMARY
========================= */

app.get("/api/dashboard", async (req, res) => {
  try {
    const properties = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM properties
    `);

    const rooms = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM rooms
    `);

    const beds = await pool.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE occupied = TRUE)::int AS occupied
      FROM beds
    `);

    const tenants = await pool.query(`
      SELECT COUNT(*)::int AS count
      FROM tenants
      WHERE status = 'active'
    `);

    const payments = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE payment_date >= date_trunc('month', CURRENT_DATE)
        AND payment_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    `);

    const expenses = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE expense_date >= date_trunc('month', CURRENT_DATE)
        AND expense_date < date_trunc('month', CURRENT_DATE) + INTERVAL '1 month'
    `);

    const pendingInvoices = await pool.query(`
      SELECT
        COUNT(*)::int AS count,
        COALESCE(SUM(amount), 0) AS total
      FROM invoices
      WHERE status = 'pending'
    `);

    res.json({
      success: true,
      dashboard: {
        properties: properties.rows[0].count,
        rooms: rooms.rows[0].count,
        beds: {
          total: beds.rows[0].total,
          occupied: beds.rows[0].occupied,
          available:
            beds.rows[0].total - beds.rows[0].occupied,
        },
        activeTenants: tenants.rows[0].count,
        currentMonthPayments: Number(payments.rows[0].total),
        currentMonthExpenses: Number(expenses.rows[0].total),
        pendingInvoices: {
          count: pendingInvoices.rows[0].count,
          total: Number(pendingInvoices.rows[0].total),
        },
      },
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
    });
  }
});

/* =========================
   REACT FRONTEND
========================= */

const distPath = path.join(__dirname, "../dist");

app.use(express.static(distPath));

app.get("*", (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

/* =========================
   START SERVER
========================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Peacely server running on port ${PORT}`);
  console.log(`🌐 Port: ${PORT}`);
});
