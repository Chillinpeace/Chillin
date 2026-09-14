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

export const query = (text, params) =>
  pool.query(text, params);

export async function initializeDatabase() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // =====================================================
    // 1. OWNERS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS owners (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(30) DEFAULT '',
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // =====================================================
    // 2. SESSIONS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL
          REFERENCES owners(id)
          ON DELETE CASCADE,
        token_hash VARCHAR(128) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // =====================================================
    // 3. EXISTING PEACELY TABLES
    // =====================================================

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
          REFERENCES properties(id)
          ON DELETE CASCADE,
        room_number VARCHAR(50) NOT NULL,
        sharing_type VARCHAR(50) DEFAULT 'Single',
        rent_amount NUMERIC(10, 2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(property_id, room_number)
      );

      CREATE TABLE IF NOT EXISTS beds (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL
          REFERENCES rooms(id)
          ON DELETE CASCADE,
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
          REFERENCES properties(id)
          ON DELETE CASCADE,
        room_id INTEGER
          REFERENCES rooms(id)
          ON DELETE SET NULL,
        bed_id INTEGER
          REFERENCES beds(id)
          ON DELETE SET NULL,
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
          REFERENCES tenants(id)
          ON DELETE CASCADE,
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
          REFERENCES tenants(id)
          ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL,
        month VARCHAR(50),
        due_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // =====================================================
    // 4. PROPERTIES OWNER MIGRATION
    // =====================================================

    await client.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS owner_id INTEGER;
    `);

    // =====================================================
    // 5. EXISTING TABLE MIGRATIONS
    // =====================================================

    await client.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';
    `);

    await client.query(`
      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS sharing_type VARCHAR(50)
        DEFAULT 'Single';

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS rent_amount NUMERIC(10, 2)
        DEFAULT 0;

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    await client.query(`
      ALTER TABLE beds
      ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN
        DEFAULT FALSE;
    `);

    // =====================================================
    // 6. OLD BED "occupied" COLUMN SUPPORT
    // =====================================================

    const occupiedColumn = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'beds'
        AND column_name = 'occupied';
    `);

    if (occupiedColumn.rows.length > 0) {
      await client.query(`
        UPDATE beds
        SET is_occupied = COALESCE(occupied, FALSE)
        WHERE is_occupied IS NULL
           OR is_occupied = FALSE;
      `);
    }

    // =====================================================
    // 7. TENANT MIGRATIONS
    // =====================================================

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS email VARCHAR(255)
        DEFAULT '';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS room_id INTEGER;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS bed_id INTEGER;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC(10, 2)
        DEFAULT 0;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS due_date INTEGER
        DEFAULT 5;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10, 2)
        DEFAULT 0;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS move_in_date DATE;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS move_out_date DATE;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS status VARCHAR(20)
        DEFAULT 'Active';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 8. PAYMENT MIGRATIONS
    // =====================================================

    await client.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payment_date DATE
        DEFAULT CURRENT_DATE;

      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50)
        DEFAULT 'UPI';

      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS payment_month VARCHAR(50)
        DEFAULT '';

      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS notes TEXT
        DEFAULT '';

      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 9. INVOICE MIGRATIONS
    // =====================================================

    await client.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS month VARCHAR(50);

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS status VARCHAR(20)
        DEFAULT 'Pending';

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 10. FOREIGN KEYS
    // =====================================================

    await client.query(`
      DO $$
      BEGIN

        -- Properties -> Owners
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'properties_owner_id_fkey'
        ) THEN
          ALTER TABLE properties
          ADD CONSTRAINT properties_owner_id_fkey
          FOREIGN KEY (owner_id)
          REFERENCES owners(id)
          ON DELETE CASCADE;
        END IF;

        -- Rooms -> Properties
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'rooms_property_id_fkey'
        ) THEN
          ALTER TABLE rooms
          ADD CONSTRAINT rooms_property_id_fkey
          FOREIGN KEY (property_id)
          REFERENCES properties(id)
          ON DELETE CASCADE;
        END IF;

        -- Beds -> Rooms
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'beds_room_id_fkey'
        ) THEN
          ALTER TABLE beds
          ADD CONSTRAINT beds_room_id_fkey
          FOREIGN KEY (room_id)
          REFERENCES rooms(id)
          ON DELETE CASCADE;
        END IF;

        -- Tenants -> Properties
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'tenants_property_id_fkey'
        ) THEN
          ALTER TABLE tenants
          ADD CONSTRAINT tenants_property_id_fkey
          FOREIGN KEY (property_id)
          REFERENCES properties(id)
          ON DELETE CASCADE;
        END IF;

        -- Tenants -> Rooms
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'tenants_room_id_fkey'
        ) THEN
          ALTER TABLE tenants
          ADD CONSTRAINT tenants_room_id_fkey
          FOREIGN KEY (room_id)
          REFERENCES rooms(id)
          ON DELETE SET NULL;
        END IF;

        -- Tenants -> Beds
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'tenants_bed_id_fkey'
        ) THEN
          ALTER TABLE tenants
          ADD CONSTRAINT tenants_bed_id_fkey
          FOREIGN KEY (bed_id)
          REFERENCES beds(id)
          ON DELETE SET NULL;
        END IF;

        -- Payments -> Tenants
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'payments_tenant_id_fkey'
        ) THEN
          ALTER TABLE payments
          ADD CONSTRAINT payments_tenant_id_fkey
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE CASCADE;
        END IF;

        -- Invoices -> Tenants
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'invoices_tenant_id_fkey'
        ) THEN
          ALTER TABLE invoices
          ADD CONSTRAINT invoices_tenant_id_fkey
          FOREIGN KEY (tenant_id)
          REFERENCES tenants(id)
          ON DELETE CASCADE;
        END IF;

      END $$;
    `);

    // =====================================================
    // 11. INDEXES
    // =====================================================

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_owner_id
        ON properties(owner_id);

      CREATE INDEX IF NOT EXISTS idx_sessions_owner_id
        ON sessions(owner_id);

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
        ON sessions(token_hash);

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

    // =====================================================
    // 12. CLEAN EXPIRED SESSIONS
    // =====================================================

    await client.query(`
      DELETE FROM sessions
      WHERE expires_at < CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 13. ASSIGN EXISTING PROPERTIES TO FIRST OWNER
    // =====================================================
    //
    // IMPORTANT:
    // Existing Peacely data is NOT deleted.
    //
    // If exactly one owner exists, any old properties
    // without an owner are assigned to that owner.
    //
    // This is what allows your old PG/property data
    // to continue working after authentication is added.
    //

    const ownerCountResult = await client.query(`
      SELECT COUNT(*)::INTEGER AS count
      FROM owners;
    `);

    const ownerCount = ownerCountResult.rows[0]?.count || 0;

    if (ownerCount === 1) {
      const firstOwnerResult = await client.query(`
        SELECT id
        FROM owners
        ORDER BY id ASC
        LIMIT 1;
      `);

      if (firstOwnerResult.rows.length > 0) {
        const firstOwnerId = firstOwnerResult.rows[0].id;

        await client.query(
          `
            UPDATE properties
            SET owner_id = $1
            WHERE owner_id IS NULL;
          `,
          [firstOwnerId]
        );

        console.log(
          `Existing unassigned properties linked to owner ${firstOwnerId}.`
        );
      }
    }

    // =====================================================
    // 14. COMMIT
    // =====================================================

    await client.query('COMMIT');

    console.log(
      'PostgreSQL database initialized and migrated successfully.'
    );
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      'Database initialization failed:',
      error
    );

    throw error;
  } finally {
    client.release();
  }
}
