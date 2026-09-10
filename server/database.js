import pg from "pg";

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === "production"
      ? { rejectUnauthorized: false }
      : false,
});

export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // USERS
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) UNIQUE,
        phone VARCHAR(20),
        password_hash TEXT,
        role VARCHAR(20) NOT NULL DEFAULT 'owner',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PROPERTIES
    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(150) NOT NULL,
        location VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // ROOMS
    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
        room_number VARCHAR(50) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(property_id, room_number)
      );
    `);

    // BEDS
    await client.query(`
      CREATE TABLE IF NOT EXISTS beds (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        bed_number VARCHAR(50) NOT NULL,
        occupied BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, bed_number)
      );
    `);

    // TENANTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
        room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
        bed_id INTEGER REFERENCES beds(id) ON DELETE SET NULL,
        name VARCHAR(150) NOT NULL,
        phone VARCHAR(20),
        email VARCHAR(150),
        rent NUMERIC(10,2) DEFAULT 0,
        deposit NUMERIC(10,2) DEFAULT 0,
        due_day INTEGER DEFAULT 5,
        move_in_date DATE,
        status VARCHAR(30) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // PAYMENTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        amount NUMERIC(10,2) NOT NULL,
        payment_date DATE NOT NULL,
        month VARCHAR(20),
        method VARCHAR(50),
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // INVOICES
    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        invoice_number VARCHAR(100) UNIQUE NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        month VARCHAR(20),
        due_date DATE,
        status VARCHAR(30) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // EXPENSES
    await client.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
        amount NUMERIC(10,2) NOT NULL,
        category VARCHAR(100),
        expense_date DATE NOT NULL,
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // INDEXES
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_owner
      ON properties(owner_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rooms_property
      ON rooms(property_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_beds_room
      ON beds(room_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_tenants_property
      ON tenants(property_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_tenant
      ON payments(tenant_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_invoices_tenant
      ON invoices(tenant_id);
    `);

    await client.query("COMMIT");

    console.log("✅ Peacely database tables initialized successfully");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("❌ Database initialization failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

export { pool };
