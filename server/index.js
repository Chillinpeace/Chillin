import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { pool, initDatabase } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function isValidId(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requiredString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function jsonError(res, status, message, extra = {}) {
  return res.status(status).json({
    error: message,
    ...extra,
  });
}

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function validDate(value) {
  if (!value || typeof value !== "string") return false;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));

  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function generateSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}

// -----------------------------------------------------------------------------
// Authentication / session middleware
// -----------------------------------------------------------------------------

async function getOwnerFromRequest(req) {
  const token = req.headers["x-session-token"];

  if (!token) {
    return null;
  }

  const result = await pool.query(
    `
      SELECT
        s.id,
        s.owner_id,
        o.id,
        o.name,
        o.email,
        o.phone
      FROM sessions s
      JOIN owners o ON o.id = s.owner_id
      WHERE s.token = $1
        AND (s.expires_at IS NULL OR s.expires_at > NOW())
      LIMIT 1
    `,
    [token]
  );

  if (!result.rows.length) {
    return null;
  }

  return {
    id: result.rows[0].owner_id,
    name: result.rows[0].name,
    email: result.rows[0].email,
    phone: result.rows[0].phone,
  };
}

async function requireOwner(req, res, next) {
  try {
    const owner = await getOwnerFromRequest(req);

    if (!owner) {
      return jsonError(res, 401, "Authentication required");
    }

    req.owner = owner;
    next();
  } catch (error) {
    console.error("Authentication error:", error);
    return jsonError(res, 500, "Authentication failed");
  }
}

// -----------------------------------------------------------------------------
// Health
// -----------------------------------------------------------------------------

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      service: "peacely",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      ok: false,
      error: "Database unavailable",
    });
  }
});

// -----------------------------------------------------------------------------
// Authentication
// -----------------------------------------------------------------------------

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!requiredString(email) || !requiredString(password)) {
      return jsonError(res, 400, "Email and password are required");
    }

    const ownerResult = await pool.query(
      `
        SELECT id, name, email, phone, password
        FROM owners
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email.trim()]
    );

    if (!ownerResult.rows.length) {
      return jsonError(res, 401, "Invalid email or password");
    }

    const owner = ownerResult.rows[0];

    // Preserve compatibility with the existing application's password storage.
    // If the project uses a hashed password, compare against the stored hash.
    // If it stores plain text in the existing database, this also remains compatible.
    let passwordValid = false;

    if (
      typeof owner.password === "string" &&
      owner.password.startsWith("$")
    ) {
      // Existing deployments may use a password hash format.
      // No additional password library is introduced here.
      passwordValid = owner.password === password;
    } else {
      passwordValid = owner.password === password;
    }

    if (!passwordValid) {
      return jsonError(res, 401, "Invalid email or password");
    }

    const token = generateSessionToken();

    await pool.query(
      `
        INSERT INTO sessions (owner_id, token, expires_at)
        VALUES ($1, $2, NOW() + INTERVAL '30 days')
      `,
      [owner.id, token]
    );

    res.json({
      token,
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        phone: owner.phone,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return jsonError(res, 500, "Unable to log in");
  }
});

app.post("/api/auth/logout", async (req, res) => {
  try {
    const token = req.headers["x-session-token"];

    if (token) {
      await pool.query(
        `DELETE FROM sessions WHERE token = $1`,
        [token]
      );
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Logout error:", error);
    return jsonError(res, 500, "Unable to log out");
  }
});

app.get("/api/auth/me", requireOwner, async (req, res) => {
  res.json({
    owner: req.owner,
  });
});

// -----------------------------------------------------------------------------
// Properties
// -----------------------------------------------------------------------------

app.get("/api/properties", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          p.id,
          p.owner_id,
          p.name,
          p.address,

          COALESCE((
            SELECT COUNT(*)
            FROM rooms r
            WHERE r.property_id = p.id
          ), 0)::int AS room_count,

          COALESCE((
            SELECT COUNT(*)
            FROM beds b
            JOIN rooms r ON r.id = b.room_id
            WHERE r.property_id = p.id
          ), 0)::int AS bed_count,

          COALESCE((
            SELECT COUNT(*)
            FROM beds b
            JOIN rooms r ON r.id = b.room_id
            WHERE r.property_id = p.id
              AND b.status = 'Occupied'
          ), 0)::int AS occupied_bed_count,

          COALESCE((
            SELECT COUNT(*)
            FROM tenants t
            WHERE t.property_id = p.id
              AND LOWER(COALESCE(t.status, 'Active')) = 'active'
          ), 0)::int AS active_tenant_count,

          COALESCE((
            SELECT SUM(t.monthly_rent)
            FROM tenants t
            WHERE t.property_id = p.id
              AND LOWER(COALESCE(t.status, 'Active')) = 'active'
          ), 0)::numeric AS monthly_revenue

        FROM properties p
        WHERE p.owner_id = $1
        ORDER BY p.id DESC
      `,
      [req.owner.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Properties error:", error);
    return jsonError(res, 500, "Unable to load properties");
  }
});

app.post("/api/properties", requireOwner, async (req, res) => {
  try {
    const { name, address } = req.body || {};

    if (!requiredString(name)) {
      return jsonError(res, 400, "Property name is required");
    }

    const result = await pool.query(
      `
        INSERT INTO properties (owner_id, name, address)
        VALUES ($1, $2, $3)
        RETURNING *
      `,
      [
        req.owner.id,
        name.trim(),
        requiredString(address) ? address.trim() : null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create property error:", error);
    return jsonError(res, 500, "Unable to create property");
  }
});

app.patch("/api/properties/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, address } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid property ID");
    }

    if (!requiredString(name)) {
      return jsonError(res, 400, "Property name is required");
    }

    const result = await pool.query(
      `
        UPDATE properties
        SET
          name = $1,
          address = $2
        WHERE id = $3
          AND owner_id = $4
        RETURNING *
      `,
      [
        name.trim(),
        requiredString(address) ? address.trim() : null,
        Number(id),
        req.owner.id,
      ]
    );

    if (!result.rows.length) {
      return jsonError(res, 404, "Property not found");
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Edit property error:", error);
    return jsonError(res, 500, "Unable to update property");
  }
});

app.delete("/api/properties/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid property ID");
    }

    const usage = await pool.query(
      `
        SELECT
          EXISTS(
            SELECT 1 FROM rooms
            WHERE property_id = $1
          ) AS has_rooms,
          EXISTS(
            SELECT 1 FROM tenants
            WHERE property_id = $1
          ) AS has_tenants
      `,
      [Number(id)]
    );

    if (!usage.rows.length) {
      return jsonError(res, 404, "Property not found");
    }

    if (usage.rows[0].has_rooms || usage.rows[0].has_tenants) {
      return jsonError(
        res,
        409,
        "Property cannot be deleted while it contains rooms or tenant history"
      );
    }

    const result = await pool.query(
      `
        DELETE FROM properties
        WHERE id = $1
          AND owner_id = $2
        RETURNING id
      `,
      [Number(id), req.owner.id]
    );

    if (!result.rows.length) {
      return jsonError(res, 404, "Property not found");
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Delete property error:", error);
    return jsonError(res, 500, "Unable to delete property");
  }
});

// -----------------------------------------------------------------------------
// Rooms
// -----------------------------------------------------------------------------

app.get("/api/rooms", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.property_id,
          r.room_number,
          r.sharing_type,
          r.rent,
          p.name AS property_name,

          COUNT(b.id)::int AS bed_count,

          COUNT(b.id) FILTER (
            WHERE b.status = 'Occupied'
          )::int AS occupied_bed_count,

          COUNT(b.id) FILTER (
            WHERE COALESCE(b.status, 'Available') <> 'Occupied'
          )::int AS available_bed_count

        FROM rooms r
        JOIN properties p
          ON p.id = r.property_id
        LEFT JOIN beds b
          ON b.room_id = r.id
        WHERE p.owner_id = $1
        GROUP BY
          r.id,
          r.property_id,
          r.room_number,
          r.sharing_type,
          r.rent,
          p.name
        ORDER BY p.name, r.room_number
      `,
      [req.owner.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Rooms error:", error);
    return jsonError(res, 500, "Unable to load rooms");
  }
});

app.post("/api/rooms", requireOwner, async (req, res) => {
  try {
    const {
      property_id,
      room_number,
      sharing_type,
      rent,
    } = req.body || {};

    if (!isValidId(property_id)) {
      return jsonError(res, 400, "Valid property is required");
    }

    if (!requiredString(room_number)) {
      return jsonError(res, 400, "Room number is required");
    }

    const rentValue = numeric(rent);

    if (rentValue === null || rentValue < 0) {
      return jsonError(res, 400, "Rent must be a valid non-negative number");
    }

    const propertyCheck = await pool.query(
      `
        SELECT id
        FROM properties
        WHERE id = $1
          AND owner_id = $2
      `,
      [Number(property_id), req.owner.id]
    );

    if (!propertyCheck.rows.length) {
      return jsonError(res, 404, "Property not found");
    }

    const duplicate = await pool.query(
      `
        SELECT id
        FROM rooms
        WHERE property_id = $1
          AND LOWER(room_number) = LOWER($2)
      `,
      [Number(property_id), room_number.trim()]
    );

    if (duplicate.rows.length) {
      return jsonError(res, 409, "Room number already exists in this property");
    }

    const result = await pool.query(
      `
        INSERT INTO rooms (
          property_id,
          room_number,
          sharing_type,
          rent
        )
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `,
      [
        Number(property_id),
        room_number.trim(),
        requiredString(sharing_type) ? sharing_type.trim() : null,
        rentValue,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create room error:", error);
    return jsonError(res, 500, "Unable to create room");
  }
});

app.patch("/api/rooms/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      room_number,
      sharing_type,
      rent,
    } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid room ID");
    }

    if (!requiredString(room_number)) {
      return jsonError(res, 400, "Room number is required");
    }

    const rentValue = numeric(rent);

    if (rentValue === null || rentValue < 0) {
      return jsonError(res, 400, "Rent must be a valid non-negative number");
    }

    const existing = await pool.query(
      `
        SELECT
          r.id,
          r.property_id
        FROM rooms r
        JOIN properties p
          ON p.id = r.property_id
        WHERE r.id = $1
          AND p.owner_id = $2
      `,
      [Number(id), req.owner.id]
    );

    if (!existing.rows.length) {
      return jsonError(res, 404, "Room not found");
    }

    const propertyId = existing.rows[0].property_id;

    const duplicate = await pool.query(
      `
        SELECT id
        FROM rooms
        WHERE property_id = $1
          AND LOWER(room_number) = LOWER($2)
          AND id <> $3
      `,
      [propertyId, room_number.trim(), Number(id)]
    );

    if (duplicate.rows.length) {
      return jsonError(res, 409, "Room number already exists in this property");
    }

    const result = await pool.query(
      `
        UPDATE rooms
        SET
          room_number = $1,
          sharing_type = $2,
          rent = $3
        WHERE id = $4
        RETURNING *
      `,
      [
        room_number.trim(),
        requiredString(sharing_type) ? sharing_type.trim() : null,
        rentValue,
        Number(id),
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Edit room error:", error);
    return jsonError(res, 500, "Unable to update room");
  }
});

// -----------------------------------------------------------------------------
// Beds
// -----------------------------------------------------------------------------

app.get("/api/beds", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          b.id,
          b.room_id,
          b.bed_number,
          b.status,
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
         AND LOWER(COALESCE(t.status, 'Active')) = 'active'
        WHERE p.owner_id = $1
        ORDER BY p.name, r.room_number, b.bed_number
      `,
      [req.owner.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Beds error:", error);
    return jsonError(res, 500, "Unable to load beds");
  }
});

app.post("/api/beds", requireOwner, async (req, res) => {
  try {
    const {
      room_id,
      bed_number,
    } = req.body || {};

    if (!isValidId(room_id)) {
      return jsonError(res, 400, "Valid room is required");
    }

    if (!requiredString(bed_number)) {
      return jsonError(res, 400, "Bed number is required");
    }

    const roomCheck = await pool.query(
      `
        SELECT
          r.id,
          r.property_id
        FROM rooms r
        JOIN properties p
          ON p.id = r.property_id
        WHERE r.id = $1
          AND p.owner_id = $2
      `,
      [Number(room_id), req.owner.id]
    );

    if (!roomCheck.rows.length) {
      return jsonError(res, 404, "Room not found");
    }

    const duplicate = await pool.query(
      `
        SELECT id
        FROM beds
        WHERE room_id = $1
          AND LOWER(bed_number) = LOWER($2)
      `,
      [Number(room_id), bed_number.trim()]
    );

    if (duplicate.rows.length) {
      return jsonError(res, 409, "Bed number already exists in this room");
    }

    const result = await pool.query(
      `
        INSERT INTO beds (
          room_id,
          bed_number,
          status
        )
        VALUES ($1, $2, 'Available')
        RETURNING *
      `,
      [
        Number(room_id),
        bed_number.trim(),
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create bed error:", error);
    return jsonError(res, 500, "Unable to create bed");
  }
});

app.patch("/api/beds/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { bed_number } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid bed ID");
    }

    if (!requiredString(bed_number)) {
      return jsonError(res, 400, "Bed number is required");
    }

    const existing = await pool.query(
      `
        SELECT
          b.id,
          b.room_id
        FROM beds b
        JOIN rooms r
          ON r.id = b.room_id
        JOIN properties p
          ON p.id = r.property_id
        WHERE b.id = $1
          AND p.owner_id = $2
      `,
      [Number(id), req.owner.id]
    );

    if (!existing.rows.length) {
      return jsonError(res, 404, "Bed not found");
    }

    const roomId = existing.rows[0].room_id;

    const duplicate = await pool.query(
      `
        SELECT id
        FROM beds
        WHERE room_id = $1
          AND LOWER(bed_number) = LOWER($2)
          AND id <> $3
      `,
      [
        roomId,
        bed_number.trim(),
        Number(id),
      ]
    );

    if (duplicate.rows.length) {
      return jsonError(res, 409, "Bed number already exists in this room");
    }

    const result = await pool.query(
      `
        UPDATE beds
        SET bed_number = $1
        WHERE id = $2
        RETURNING *
      `,
      [
        bed_number.trim(),
        Number(id),
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Edit bed error:", error);
    return jsonError(res, 500, "Unable to update bed");
  }
});

// -----------------------------------------------------------------------------
// Tenants
// -----------------------------------------------------------------------------

app.get("/api/tenants", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          t.*,
          p.name AS property_name,
          r.room_number,
          b.bed_number,

          COALESCE((
            SELECT SUM(i.amount - COALESCE(i.paid_amount, 0))
            FROM invoices i
            WHERE i.tenant_id = t.id
              AND LOWER(COALESCE(i.status, 'Pending')) <> 'Cancelled'
          ), 0)::numeric AS outstanding_amount

        FROM tenants t
        LEFT JOIN properties p
          ON p.id = t.property_id
        LEFT JOIN rooms r
          ON r.id = t.room_id
        LEFT JOIN beds b
          ON b.id = t.bed_id
        WHERE t.owner_id = $1
        ORDER BY
          CASE
            WHEN LOWER(COALESCE(t.status, 'Active')) = 'active' THEN 0
            ELSE 1
          END,
          t.name
      `,
      [req.owner.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Tenants error:", error);
    return jsonError(res, 500, "Unable to load tenants");
  }
});

// Create tenant / move-in.
// Uses a transaction and locks the selected bed.
app.post("/api/tenants", requireOwner, async (req, res) => {
  const client = await pool.connect();

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
    } = req.body || {};

    if (!requiredString(name)) {
      return jsonError(res, 400, "Tenant name is required");
    }

    if (!isValidId(property_id)) {
      return jsonError(res, 400, "Valid property is required");
    }

    if (!isValidId(room_id)) {
      return jsonError(res, 400, "Valid room is required");
    }

    if (!isValidId(bed_id)) {
      return jsonError(res, 400, "Valid bed is required");
    }

    const rent = numeric(monthly_rent);
    const deposit = numeric(deposit_amount ?? 0);

    if (rent === null || rent < 0) {
      return jsonError(res, 400, "Monthly rent must be a valid non-negative number");
    }

    if (deposit === null || deposit < 0) {
      return jsonError(res, 400, "Deposit must be a valid non-negative number");
    }

    if (!validDate(move_in_date)) {
      return jsonError(res, 400, "Move-in date must be a valid date");
    }

    await client.query("BEGIN");

    const relationship = await client.query(
      `
        SELECT
          p.id AS property_id,
          r.id AS room_id,
          b.id AS bed_id,
          b.status AS bed_status
        FROM properties p
        JOIN rooms r
          ON r.property_id = p.id
        JOIN beds b
          ON b.room_id = r.id
        WHERE p.id = $1
          AND r.id = $2
          AND b.id = $3
          AND p.owner_id = $4
        FOR UPDATE OF b
      `,
      [
        Number(property_id),
        Number(room_id),
        Number(bed_id),
        req.owner.id,
      ]
    );

    if (!relationship.rows.length) {
      throw Object.assign(
        new Error("Invalid property, room, or bed selection"),
        { statusCode: 400 }
      );
    }

    if (
      String(relationship.rows[0].bed_status || "").toLowerCase() ===
      "occupied"
    ) {
      throw Object.assign(
        new Error("Selected bed is already occupied"),
        { statusCode: 409 }
      );
    }

    const tenantResult = await client.query(
      `
        INSERT INTO tenants (
          owner_id,
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
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11, 'Active'
        )
        RETURNING *
      `,
      [
        req.owner.id,
        name.trim(),
        requiredString(phone) ? phone.trim() : null,
        requiredString(email) ? email.trim() : null,
        Number(property_id),
        Number(room_id),
        Number(bed_id),
        rent,
        due_date || null,
        deposit,
        move_in_date,
      ]
    );

    await client.query(
      `
        UPDATE beds
        SET status = 'Occupied'
        WHERE id = $1
      `,
      [Number(bed_id)]
    );

    await client.query("COMMIT");

    res.status(201).json(tenantResult.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Create tenant error:", error);

    if (error.statusCode) {
      return jsonError(res, error.statusCode, error.message);
    }

    return jsonError(res, 500, "Unable to create tenant");
  } finally {
    client.release();
  }
});

// Tenant profile + history
app.get("/api/tenants/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid tenant ID");
    }

    const tenantResult = await pool.query(
      `
        SELECT
          t.*,
          p.name AS property_name,
          p.address AS property_address,
          r.room_number,
          r.sharing_type,
          b.bed_number
        FROM tenants t
        LEFT JOIN properties p
          ON p.id = t.property_id
        LEFT JOIN rooms r
          ON r.id = t.room_id
        LEFT JOIN beds b
          ON b.id = t.bed_id
        WHERE t.id = $1
          AND t.owner_id = $2
        LIMIT 1
      `,
      [Number(id), req.owner.id]
    );

    if (!tenantResult.rows.length) {
      return jsonError(res, 404, "Tenant not found");
    }

    const tenant = tenantResult.rows[0];

    const payments = await pool.query(
      `
        SELECT
          p.*,
          i.invoice_number,
          i.month AS invoice_month
        FROM payments p
        LEFT JOIN invoices i
          ON i.id = p.invoice_id
        WHERE p.tenant_id = $1
          AND p.owner_id = $2
        ORDER BY p.payment_date DESC, p.id DESC
      `,
      [Number(id), req.owner.id]
    );

    const invoices = await pool.query(
      `
        SELECT
          i.*,
          GREATEST(
            COALESCE(i.amount, 0) - COALESCE(i.paid_amount, 0),
            0
          ) AS remaining_amount
        FROM invoices i
        WHERE i.tenant_id = $1
          AND i.owner_id = $2
        ORDER BY i.due_date DESC NULLS LAST, i.id DESC
      `,
      [Number(id), req.owner.id]
    );

    res.json({
      tenant,
      payments: payments.rows,
      invoices: invoices.rows,
    });
  } catch (error) {
    console.error("Tenant detail error:", error);
    return jsonError(res, 500, "Unable to load tenant details");
  }
});

// Edit tenant
app.patch("/api/tenants/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      phone,
      email,
      monthly_rent,
      due_date,
      deposit_amount,
      move_in_date,
      status,
    } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid tenant ID");
    }

    if (!requiredString(name)) {
      return jsonError(res, 400, "Tenant name is required");
    }

    const rent = numeric(monthly_rent);
    const deposit = numeric(deposit_amount ?? 0);

    if (rent === null || rent < 0) {
      return jsonError(res, 400, "Monthly rent must be a valid non-negative number");
    }

    if (deposit === null || deposit < 0) {
      return jsonError(res, 400, "Deposit must be a valid non-negative number");
    }

    if (move_in_date && !validDate(move_in_date)) {
      return jsonError(res, 400, "Move-in date must be a valid date");
    }

    const allowedStatuses = ["Active", "Inactive"];

    const normalizedStatus = allowedStatuses.includes(status)
      ? status
      : undefined;

    const result = await pool.query(
      `
        UPDATE tenants
        SET
          name = $1,
          phone = $2,
          email = $3,
          monthly_rent = $4,
          due_date = $5,
          deposit_amount = $6,
          move_in_date = $7,
          status = COALESCE($8, status)
        WHERE id = $9
          AND owner_id = $10
        RETURNING *
      `,
      [
        name.trim(),
        requiredString(phone) ? phone.trim() : null,
        requiredString(email) ? email.trim() : null,
        rent,
        due_date || null,
        deposit,
        move_in_date || null,
        normalizedStatus || null,
        Number(id),
        req.owner.id,
      ]
    );

    if (!result.rows.length) {
      return jsonError(res, 404, "Tenant not found");
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Edit tenant error:", error);
    return jsonError(res, 500, "Unable to update tenant");
  }
});

// Reassign tenant to a different property/room/bed.
// Everything is performed in one transaction.
app.patch("/api/tenants/:id/reassign", requireOwner, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;

    const {
      property_id,
      room_id,
      bed_id,
    } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid tenant ID");
    }

    if (!isValidId(property_id)) {
      return jsonError(res, 400, "Valid property is required");
    }

    if (!isValidId(room_id)) {
      return jsonError(res, 400, "Valid room is required");
    }

    if (!isValidId(bed_id)) {
      return jsonError(res, 400, "Valid bed is required");
    }

    await client.query("BEGIN");

    const tenantResult = await client.query(
      `
        SELECT *
        FROM tenants
        WHERE id = $1
          AND owner_id = $2
        FOR UPDATE
      `,
      [
        Number(id),
        req.owner.id,
      ]
    );

    if (!tenantResult.rows.length) {
      throw Object.assign(
        new Error("Tenant not found"),
        { statusCode: 404 }
      );
    }

    const tenant = tenantResult.rows[0];

    if (
      String(tenant.status || "Active").toLowerCase() !==
      "active"
    ) {
      throw Object.assign(
        new Error("Only active tenants can be reassigned"),
        { statusCode: 409 }
      );
    }

    const target = await client.query(
      `
        SELECT
          p.id AS property_id,
          r.id AS room_id,
          b.id AS bed_id,
          b.status AS bed_status
        FROM properties p
        JOIN rooms r
          ON r.property_id = p.id
        JOIN beds b
          ON b.room_id = r.id
        WHERE p.id = $1
          AND r.id = $2
          AND b.id = $3
          AND p.owner_id = $4
        FOR UPDATE OF b
      `,
      [
        Number(property_id),
        Number(room_id),
        Number(bed_id),
        req.owner.id,
      ]
    );

    if (!target.rows.length) {
      throw Object.assign(
        new Error("Invalid property, room, or bed selection"),
        { statusCode: 400 }
      );
    }

    const targetBed = target.rows[0];

    if (Number(tenant.bed_id) === Number(bed_id)) {
      await client.query("COMMIT");

      return res.json({
        ok: true,
        tenant,
        message: "Tenant is already assigned to this bed",
      });
    }

    if (
      String(targetBed.bed_status || "").toLowerCase() ===
      "occupied"
    ) {
      throw Object.assign(
        new Error("Selected bed is already occupied"),
        { statusCode: 409 }
      );
    }

    if (tenant.bed_id) {
      await client.query(
        `
          UPDATE beds
          SET status = 'Available'
          WHERE id = $1
        `,
        [tenant.bed_id]
      );
    }

    await client.query(
      `
        UPDATE beds
        SET status = 'Occupied'
        WHERE id = $1
      `,
      [Number(bed_id)]
    );

    const updated = await client.query(
      `
        UPDATE tenants
        SET
          property_id = $1,
          room_id = $2,
          bed_id = $3
        WHERE id = $4
          AND owner_id = $5
        RETURNING *
      `,
      [
        Number(property_id),
        Number(room_id),
        Number(bed_id),
        Number(id),
        req.owner.id,
      ]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      tenant: updated.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Tenant reassignment error:", error);

    if (error.statusCode) {
      return jsonError(res, error.statusCode, error.message);
    }

    return jsonError(res, 500, "Unable to reassign tenant");
  } finally {
    client.release();
  }
});

// Move-out / vacate tenant.
// Financial history remains untouched.
app.patch("/api/tenants/:id/move-out", requireOwner, async (req, res) => {
  const client = await pool.connect();

  try {
    const { id } = req.params;
    const { move_out_date } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid tenant ID");
    }

    if (!validDate(move_out_date)) {
      return jsonError(res, 400, "Move-out date must be a valid date");
    }

    await client.query("BEGIN");

    const tenantResult = await client.query(
      `
        SELECT *
        FROM tenants
        WHERE id = $1
          AND owner_id = $2
        FOR UPDATE
      `,
      [
        Number(id),
        req.owner.id,
      ]
    );

    if (!tenantResult.rows.length) {
      throw Object.assign(
        new Error("Tenant not found"),
        { statusCode: 404 }
      );
    }

    const tenant = tenantResult.rows[0];

    if (
      String(tenant.status || "Active").toLowerCase() !==
      "active"
    ) {
      throw Object.assign(
        new Error("Tenant is already inactive"),
        { statusCode: 409 }
      );
    }

    if (tenant.bed_id) {
      await client.query(
        `
          UPDATE beds
          SET status = 'Available'
          WHERE id = $1
        `,
        [tenant.bed_id]
      );
    }

    const updated = await client.query(
      `
        UPDATE tenants
        SET
          status = 'Inactive',
          move_out_date = $1,
          room_id = NULL,
          bed_id = NULL
        WHERE id = $2
          AND owner_id = $3
        RETURNING *
      `,
      [
        move_out_date,
        Number(id),
        req.owner.id,
      ]
    );

    await client.query("COMMIT");

    res.json({
      ok: true,
      tenant: updated.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Move-out error:", error);

    if (error.statusCode) {
      return jsonError(res, error.statusCode, error.message);
    }

    return jsonError(res, 500, "Unable to move out tenant");
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// Payments
// -----------------------------------------------------------------------------

app.get("/api/payments", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          p.*,
          t.name AS tenant_name,
          i.invoice_number,
          i.month AS invoice_month
        FROM payments p
        LEFT JOIN tenants t
          ON t.id = p.tenant_id
        LEFT JOIN invoices i
          ON i.id = p.invoice_id
        WHERE p.owner_id = $1
        ORDER BY p.payment_date DESC, p.id DESC
      `,
      [req.owner.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Payments error:", error);
    return jsonError(res, 500, "Unable to load payments");
  }
});

app.post("/api/payments", requireOwner, async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      tenant_id,
      invoice_id,
      amount,
      payment_date,
      payment_method,
      notes,
    } = req.body || {};

    if (!isValidId(tenant_id)) {
      return jsonError(res, 400, "Valid tenant is required");
    }

    const amountValue = numeric(amount);

    if (amountValue === null || amountValue <= 0) {
      return jsonError(res, 400, "Payment amount must be greater than zero");
    }

    await client.query("BEGIN");

    const tenantCheck = await client.query(
      `
        SELECT id
        FROM tenants
        WHERE id = $1
          AND owner_id = $2
      `,
      [
        Number(tenant_id),
        req.owner.id,
      ]
    );

    if (!tenantCheck.rows.length) {
      throw Object.assign(
        new Error("Tenant not found"),
        { statusCode: 404 }
      );
    }

    let invoice = null;

    if (invoice_id) {
      if (!isValidId(invoice_id)) {
        throw Object.assign(
          new Error("Invalid invoice ID"),
          { statusCode: 400 }
        );
      }

      const invoiceResult = await client.query(
        `
          SELECT *
          FROM invoices
          WHERE id = $1
            AND tenant_id = $2
            AND owner_id = $3
          FOR UPDATE
        `,
        [
          Number(invoice_id),
          Number(tenant_id),
          req.owner.id,
        ]
      );

      if (!invoiceResult.rows.length) {
        throw Object.assign(
          new Error("Invoice not found"),
          { statusCode: 404 }
        );
      }

      invoice = invoiceResult.rows[0];

      const invoiceAmount = roundMoney(invoice.amount);
      const paidAmount = roundMoney(invoice.paid_amount || 0);
      const remaining = roundMoney(invoiceAmount - paidAmount);

      if (remaining <= 0) {
        throw Object.assign(
          new Error("Invoice is already fully paid"),
          { statusCode: 409 }
        );
      }

      if (amountValue > remaining + 0.0001) {
        throw Object.assign(
          new Error(
            `Payment exceeds the remaining invoice balance of ${remaining.toFixed(2)}`
          ),
          { statusCode: 409 }
        );
      }
    }

    const paymentResult = await client.query(
      `
        INSERT INTO payments (
          owner_id,
          tenant_id,
          invoice_id,
          amount,
          payment_date,
          payment_method,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `,
      [
        req.owner.id,
        Number(tenant_id),
        invoice_id ? Number(invoice_id) : null,
        amountValue,
        payment_date || todayISO(),
        payment_method || null,
        notes || null,
      ]
    );

    if (invoice) {
      const newPaidAmount = roundMoney(
        Number(invoice.paid_amount || 0) + amountValue
      );

      const invoiceTotal = roundMoney(invoice.amount);

      let newStatus = "Partially Paid";

      if (newPaidAmount >= invoiceTotal - 0.0001) {
        newStatus = "Paid";
      }

      await client.query(
        `
          UPDATE invoices
          SET
            paid_amount = $1,
            status = $2
          WHERE id = $3
            AND owner_id = $4
        `,
        [
          Math.min(newPaidAmount, invoiceTotal),
          newStatus,
          Number(invoice_id),
          req.owner.id,
        ]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      payment: paymentResult.rows[0],
      ok: true,
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Payment error:", error);

    if (error.statusCode) {
      return jsonError(res, error.statusCode, error.message);
    }

    return jsonError(res, 500, "Unable to record payment");
  } finally {
    client.release();
  }
});

// -----------------------------------------------------------------------------
// Invoices
// -----------------------------------------------------------------------------

app.get("/api/invoices", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          i.*,
          t.name AS tenant_name,
          p.name AS property_name,

          GREATEST(
            COALESCE(i.amount, 0) - COALESCE(i.paid_amount, 0),
            0
          ) AS remaining_amount

        FROM invoices i
        LEFT JOIN tenants t
          ON t.id = i.tenant_id
        LEFT JOIN properties p
          ON p.id = t.property_id
        WHERE i.owner_id = $1
        ORDER BY i.due_date DESC NULLS LAST, i.id DESC
      `,
      [req.owner.id]
    );

    res.json(result.rows);
  } catch (error) {
    console.error("Invoices error:", error);
    return jsonError(res, 500, "Unable to load invoices");
  }
});

app.post("/api/invoices", requireOwner, async (req, res) => {
  try {
    const {
      tenant_id,
      invoice_number,
      month,
      amount,
      due_date,
      notes,
    } = req.body || {};

    if (!isValidId(tenant_id)) {
      return jsonError(res, 400, "Valid tenant is required");
    }

    const amountValue = numeric(amount);

    if (amountValue === null || amountValue <= 0) {
      return jsonError(res, 400, "Invoice amount must be greater than zero");
    }

    if (due_date && !validDate(due_date)) {
      return jsonError(res, 400, "Due date must be a valid date");
    }

    const tenantCheck = await pool.query(
      `
        SELECT id
        FROM tenants
        WHERE id = $1
          AND owner_id = $2
      `,
      [
        Number(tenant_id),
        req.owner.id,
      ]
    );

    if (!tenantCheck.rows.length) {
      return jsonError(res, 404, "Tenant not found");
    }

    const result = await pool.query(
      `
        INSERT INTO invoices (
          owner_id,
          tenant_id,
          invoice_number,
          month,
          amount,
          paid_amount,
          status,
          due_date,
          notes
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          0,
          'Pending',
          $6,
          $7
        )
        RETURNING *
      `,
      [
        req.owner.id,
        Number(tenant_id),
        invoice_number || null,
        month || null,
        amountValue,
        due_date || null,
        notes || null,
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error("Create invoice error:", error);
    return jsonError(res, 500, "Unable to create invoice");
  }
});

app.patch("/api/invoices/:id", requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      status,
      sent,
      delivery_status,
    } = req.body || {};

    if (!isValidId(id)) {
      return jsonError(res, 400, "Invalid invoice ID");
    }

    const allowedStatuses = [
      "Pending",
      "Partially Paid",
      "Paid",
      "Overdue",
      "Cancelled",
    ];

    if (status && !allowedStatuses.includes(status)) {
      return jsonError(res, 400, "Invalid invoice status");
    }

    const result = await pool.query(
      `
        UPDATE invoices
        SET
          status = COALESCE($1, status),
          sent = COALESCE($2, sent),
          delivery_status = COALESCE($3, delivery_status)
        WHERE id = $4
          AND owner_id = $5
        RETURNING *
      `,
      [
        status || null,
        typeof sent === "boolean" ? sent : null,
        delivery_status || null,
        Number(id),
        req.owner.id,
      ]
    );

    if (!result.rows.length) {
      return jsonError(res, 404, "Invoice not found");
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error("Invoice update error:", error);
    return jsonError(res, 500, "Unable to update invoice");
  }
});

// -----------------------------------------------------------------------------
// Finance summary
// -----------------------------------------------------------------------------

app.get("/api/finance/summary", requireOwner, async (req, res) => {
  try {
    const result = await pool.query(
      `
        SELECT
          COALESCE((
            SELECT SUM(i.amount)
            FROM invoices i
            WHERE i.owner_id = $1
              AND LOWER(COALESCE(i.status, 'Pending')) <> 'Cancelled'
          ), 0)::numeric AS expected_rent,

          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.owner_id = $1
          ), 0)::numeric AS collected_rent,

          COALESCE((
            SELECT SUM(
              GREATEST(
                COALESCE(i.amount, 0) - COALESCE(i.paid_amount, 0),
                0
              )
            )
            FROM invoices i
            WHERE i.owner_id = $1
              AND LOWER(COALESCE(i.status, 'Pending')) <> 'cancelled'
          ), 0)::numeric AS pending_rent,

          COALESCE((
            SELECT SUM(
              GREATEST(
                COALESCE(i.amount, 0) - COALESCE(i.paid_amount, 0),
                0
              )
            )
            FROM invoices i
            WHERE i.owner_id = $1
              AND i.due_date < CURRENT_DATE
              AND LOWER(COALESCE(i.status, 'Pending')) NOT IN (
                'paid',
                'cancelled'
              )
          ), 0)::numeric AS overdue_rent
      `,
      [req.owner.id]
    );

    const row = result.rows[0];

    const expected = roundMoney(row.expected_rent);
    const collected = roundMoney(row.collected_rent);
    const pending = roundMoney(row.pending_rent);
    const overdue = roundMoney(row.overdue_rent);

    res.json({
      expected_rent: expected,
      collected_rent: collected,
      pending_rent: pending,
      overdue_rent: overdue,
      collection_rate:
        expected > 0
          ? roundMoney((collected / expected) * 100)
          : 0,
    });
  } catch (error) {
    console.error("Finance summary error:", error);
    return jsonError(res, 500, "Unable to load finance summary");
  }
});

// -----------------------------------------------------------------------------
// Dashboard — Phase 3C
// -----------------------------------------------------------------------------

app.get("/api/dashboard", requireOwner, async (req, res) => {
  try {
    const portfolio = await pool.query(
      `
        SELECT
          (SELECT COUNT(*)
             FROM properties
             WHERE owner_id = $1)::int AS total_properties,

          (SELECT COUNT(*)
             FROM rooms r
             JOIN properties p ON p.id = r.property_id
             WHERE p.owner_id = $1)::int AS total_rooms,

          (SELECT COUNT(*)
             FROM beds b
             JOIN rooms r ON r.id = b.room_id
             JOIN properties p ON p.id = r.property_id
             WHERE p.owner_id = $1)::int AS total_beds,

          (SELECT COUNT(*)
             FROM beds b
             JOIN rooms r ON r.id = b.room_id
             JOIN properties p ON p.id = r.property_id
             WHERE p.owner_id = $1
               AND b.status = 'Occupied')::int AS occupied_beds,

          (SELECT COUNT(*)
             FROM tenants t
             WHERE t.owner_id = $1
               AND LOWER(COALESCE(t.status, 'Active')) = 'active')::int
             AS active_tenants
      `,
      [req.owner.id]
    );

    const finance = await pool.query(
      `
        SELECT
          COALESCE((
            SELECT SUM(i.amount)
            FROM invoices i
            WHERE i.owner_id = $1
              AND LOWER(COALESCE(i.status, 'Pending')) <> 'cancelled'
          ), 0)::numeric AS expected_rent,

          COALESCE((
            SELECT SUM(p.amount)
            FROM payments p
            WHERE p.owner_id = $1
          ), 0)::numeric AS collected_rent,

          COALESCE((
            SELECT SUM(
              GREATEST(
                COALESCE(i.amount, 0) -
                COALESCE(i.paid_amount, 0),
                0
              )
            )
            FROM invoices i
            WHERE i.owner_id = $1
              AND LOWER(COALESCE(i.status, 'Pending')) <> 'cancelled'
          ), 0)::numeric AS pending_rent,

          COALESCE((
            SELECT COUNT(*)
            FROM invoices i
            WHERE i.owner_id = $1
              AND LOWER(COALESCE(i.status, 'Pending'))
                  = 'overdue'
          ), 0)::int AS overdue_invoice_count,

          COALESCE((
            SELECT COUNT(*)
            FROM invoices i
            WHERE i.owner_id = $1
              AND LOWER(COALESCE(i.status, 'Pending'))
                  = 'partially paid'
          ), 0)::int AS partial_invoice_count
      `,
      [req.owner.id]
    );

    const recentPayments = await pool.query(
      `
        SELECT
          p.*,
          t.name AS tenant_name,
          i.invoice_number
        FROM payments p
        LEFT JOIN tenants t ON t.id = p.tenant_id
        LEFT JOIN invoices i ON i.id = p.invoice_id
        WHERE p.owner_id = $1
        ORDER BY p.payment_date DESC, p.id DESC
        LIMIT 8
      `,
      [req.owner.id]
    );

    const recentInvoices = await pool.query(
      `
        SELECT
          i.*,
          t.name AS tenant_name,
          GREATEST(
            COALESCE(i.amount, 0) -
            COALESCE(i.paid_amount, 0),
            0
          ) AS remaining_amount
        FROM invoices i
        LEFT JOIN tenants t ON t.id = i.tenant_id
        WHERE i.owner_id = $1
        ORDER BY i.id DESC
        LIMIT 8
      `,
      [req.owner.id]
    );

    const upcomingMoveOuts = await pool.query(
      `
        SELECT
          t.id,
          t.name,
          t.phone,
          t.move_out_date,
          p.name AS property_name,
          r.room_number,
          b.bed_number
        FROM tenants t
        LEFT JOIN properties p ON p.id = t.property_id
        LEFT JOIN rooms r ON r.id = t.room_id
        LEFT JOIN beds b ON b.id = t.bed_id
        WHERE t.owner_id = $1
          AND LOWER(COALESCE(t.status, 'Active')) = 'active'
          AND t.move_out_date IS NOT NULL
          AND t.move_out_date >= CURRENT_DATE
        ORDER BY t.move_out_date
        LIMIT 8
      `,
      [req.owner.id]
    );

    const p = portfolio.rows[0];
    const f = finance.rows[0];

    const totalBeds = Number(p.total_beds || 0);
    const occupiedBeds = Number(p.occupied_beds || 0);
    const expected = roundMoney(f.expected_rent);
    const collected = roundMoney(f.collected_rent);

    res.json({
      portfolio: {
        total_properties: Number(p.total_properties || 0),
        total_rooms: Number(p.total_rooms || 0),
        total_beds: totalBeds,
        occupied_beds: occupiedBeds,
        available_beds: Math.max(totalBeds - occupiedBeds, 0),
        occupancy_percent:
          totalBeds > 0
            ? roundMoney((occupiedBeds / totalBeds) * 100)
            : 0,
        active_tenants: Number(p.active_tenants || 0),
      },

      finance: {
        expected_rent: expected,
        collected_rent: collected,
        pending_rent: roundMoney(f.pending_rent),
        overdue_invoice_count: Number(f.overdue_invoice_count || 0),
        partial_invoice_count: Number(f.partial_invoice_count || 0),
        collection_rate:
          expected > 0
            ? roundMoney((collected / expected) * 100)
            : 0,
      },

      recent_payments: recentPayments.rows,
      recent_invoices: recentInvoices.rows,
      upcoming_move_outs: upcomingMoveOuts.rows,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    return jsonError(res, 500, "Unable to load dashboard");
  }
});

// -----------------------------------------------------------------------------
// Analytics — Phase 3D
// -----------------------------------------------------------------------------

app.get("/api/analytics", requireOwner, async (req, res) => {
  try {
    const monthlyFinance = await pool.query(
      `
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
            date_trunc('month', CURRENT_DATE),
            INTERVAL '1 month'
          ) AS month_start
        ),

        expected AS (
          SELECT
            date_trunc('month', i.due_date)::date AS month_start,
            SUM(i.amount) AS expected
          FROM invoices i
          WHERE i.owner_id = $1
            AND i.due_date >=
                date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
            AND LOWER(COALESCE(i.status, 'Pending')) <> 'cancelled'
          GROUP BY date_trunc('month', i.due_date)
        ),

        collected AS (
          SELECT
            date_trunc('month', p.payment_date)::date AS month_start,
            SUM(p.amount) AS collected
          FROM payments p
          WHERE p.owner_id = $1
            AND p.payment_date >=
                date_trunc('month', CURRENT_DATE) - INTERVAL '5 months'
          GROUP BY date_trunc('month', p.payment_date)
        )

        SELECT
          m.month_start,
          COALESCE(e.expected, 0)::numeric AS expected,
          COALESCE(c.collected, 0)::numeric AS collected,
          GREATEST(
            COALESCE(e.expected, 0) -
            COALESCE(c.collected, 0),
            0
          )::numeric AS outstanding
        FROM months m
        LEFT JOIN expected e
          ON e.month_start = m.month_start::date
        LEFT JOIN collected c
          ON c.month_start = m.month_start::date
        ORDER BY m.month_start
      `,
      [req.owner.id]
    );

    const propertyPerformance = await pool.query(
      `
        SELECT
          p.id,
          p.name,

          COUNT(DISTINCT r.id)::int AS room_count,

          COUNT(DISTINCT b.id)::int AS bed_count,

          COUNT(DISTINCT b.id) FILTER (
            WHERE b.status = 'Occupied'
          )::int AS occupied_bed_count,

          COALESCE((
            SELECT SUM(t.monthly_rent)
            FROM tenants t
            WHERE t.property_id = p.id
              AND LOWER(COALESCE(t.status, 'Active')) = 'active'
          ), 0)::numeric AS monthly_revenue

        FROM properties p
        LEFT JOIN rooms r
          ON r.property_id = p.id
        LEFT JOIN beds b
          ON b.room_id = r.id
        WHERE p.owner_id = $1
        GROUP BY p.id, p.name
        ORDER BY monthly_revenue DESC, p.name
      `,
      [req.owner.id]
    );

    const paymentMethods = await pool.query(
      `
        SELECT
          COALESCE(NULLIF(TRIM(payment_method), ''), 'Unknown')
            AS payment_method,
          COUNT(*)::int AS payment_count,
          COALESCE(SUM(amount), 0)::numeric AS amount
        FROM payments
        WHERE owner_id = $1
        GROUP BY
          COALESCE(NULLIF(TRIM(payment_method), ''), 'Unknown')
        ORDER BY amount DESC
      `,
      [req.owner.id]
    );

    const occupancyTrend = await pool.query(
      `
        WITH days AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '29 days',
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date AS day
        ),

        totals AS (
          SELECT COUNT(*)::int AS total_beds
          FROM beds b
          JOIN rooms r ON r.id = b.room_id
          JOIN properties p ON p.id = r.property_id
          WHERE p.owner_id = $1
        ),

        active_at_day AS (
          SELECT
            d.day,
            COUNT(t.id)::int AS occupied_beds
          FROM days d
          LEFT JOIN tenants t
            ON LOWER(COALESCE(t.status, 'Active')) = 'active'
           AND t.owner_id = $1
           AND t.move_in_date <= d.day
           AND (
             t.move_out_date IS NULL
             OR t.move_out_date > d.day
           )
          GROUP BY d.day
        )

        SELECT
          a.day,
          a.occupied_beds,
          totals.total_beds,
          CASE
            WHEN totals.total_beds > 0
            THEN ROUND(
              (a.occupied_beds::numeric /
               totals.total_beds::numeric) * 100,
              2
            )
            ELSE 0
          END AS occupancy_percent
        FROM active_at_day a
        CROSS JOIN totals
        ORDER BY a.day
      `,
      [req.owner.id]
    );

    res.json({
      monthly_finance: monthlyFinance.rows.map((row) => ({
        month_start: row.month_start,
        expected: roundMoney(row.expected),
        collected: roundMoney(row.collected),
        outstanding: roundMoney(row.outstanding),
      })),

      property_performance: propertyPerformance.rows.map((row) => {
        const beds = Number(row.bed_count || 0);
        const occupied = Number(row.occupied_bed_count || 0);

        return {
          ...row,
          bed_count: beds,
          occupied_bed_count: occupied,
          available_bed_count: Math.max(beds - occupied, 0),
          occupancy_percent:
            beds > 0
              ? roundMoney((occupied / beds) * 100)
              : 0,
          monthly_revenue: roundMoney(row.monthly_revenue),
        };
      }),

      payment_methods: paymentMethods.rows.map((row) => ({
        payment_method: row.payment_method,
        payment_count: Number(row.payment_count || 0),
        amount: roundMoney(row.amount),
      })),

      occupancy_trend: occupancyTrend.rows.map((row) => ({
        day: row.day,
        occupied_beds: Number(row.occupied_beds || 0),
        total_beds: Number(row.total_beds || 0),
        occupancy_percent: roundMoney(row.occupancy_percent),
      })),
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return jsonError(res, 500, "Unable to load analytics");
  }
});

// -----------------------------------------------------------------------------
// Static frontend
// -----------------------------------------------------------------------------

const distPath = path.join(__dirname, "dist");

app.use(express.static(distPath));

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return next();
  }

  res.sendFile(path.join(distPath, "index.html"));
});

// -----------------------------------------------------------------------------
// API 404
// -----------------------------------------------------------------------------

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return jsonError(res, 404, "API endpoint not found");
  }

  res.status(404).send("Not found");
});

// -----------------------------------------------------------------------------
// Global error handler
// -----------------------------------------------------------------------------

app.use((error, req, res, next) => {
  console.error("Unhandled server error:", error);

  if (res.headersSent) {
    return next(error);
  }

  return jsonError(
    res,
    Number(error.status) || 500,
    error.message || "Internal server error"
  );
});

// -----------------------------------------------------------------------------
// Startup
// -----------------------------------------------------------------------------

async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`Peacely server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Unable to start Peacely:", error);
    process.exit(1);
  }
}

startServer();
