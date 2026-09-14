import pg from 'pg';

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set.');
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
});

export const query = (text, params) => pool.query(text, params);

export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL
          REFERENCES properties(id) ON DELETE CASCADE,
        room_number VARCHAR(50) NOT NULL,
        sharing_type VARCHAR(50) DEFAULT 'Single',
        rent_amount NUMERIC(10, 2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(property_id, room_number)
      );

      CREATE TABLE IF NOT EXISTS beds (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL
          REFERENCES rooms(id) ON DELETE CASCADE,
        bed_number VARCHAR(50) NOT NULL,
        is_occupied BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(room_id, bed_number)
      );

      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        email VARCHAR(255) DEFAULT '',
        property_id INTEGER NOT NULL
          REFERENCES properties(id) ON DELETE CASCADE,
        room_id INTEGER
          REFERENCES rooms(id) ON DELETE SET NULL,
        bed_id INTEGER
          REFERENCES beds(id) ON DELETE SET NULL,
        monthly_rent NUMERIC(10, 2) DEFAULT 0,
        due_date INTEGER DEFAULT 5,
        deposit_amount NUMERIC(10, 2) DEFAULT 0,
        move_in_date DATE,
        move_out_date DATE,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL
          REFERENCES tenants(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50) DEFAULT 'UPI',
        payment_month VARCHAR(50) NOT NULL,
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        tenant_id INTEGER NOT NULL
          REFERENCES tenants(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        month VARCHAR(50),
        due_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_rooms_property_id
        ON rooms(property_id);

      CREATE INDEX IF NOT EXISTS idx_beds_room_id
        ON beds(room_id);

      CREATE INDEX IF NOT EXISTS idx_tenants_property_id
        ON tenants(property_id);

      CREATE INDEX IF NOT EXISTS idx_tenants_room_id
        ON tenants(room_id);

      CREATE INDEX IF NOT EXISTS idx_tenants_bed_id
        ON tenants(bed_id);

      CREATE INDEX IF NOT EXISTS idx_payments_tenant_id
        ON payments(tenant_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
        ON invoices(tenant_id);
    `);

    /*
      Safe upgrades for databases created by the earlier
      Peacely version.
    */

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS bed_id INTEGER
      REFERENCES beds(id) ON DELETE SET NULL;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS move_in_date DATE;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS move_out_date DATE;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS month VARCHAR(50);
    `);

    await client.query('COMMIT');

    console.log('PostgreSQL database initialized successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Database initialization failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
