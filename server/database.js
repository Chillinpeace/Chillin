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

export const query = (text, params) => {
  return pool.query(text, params);
};

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
    // 2. CORE PEACELY TABLES
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
        property_id INTEGER NOT NULL,
        room_number VARCHAR(50) NOT NULL,
        sharing_type VARCHAR(50) DEFAULT 'Single',
        rent_amount NUMERIC(10, 2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(property_id, room_number)
      );

      CREATE TABLE IF NOT EXISTS beds (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL,
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
        property_id INTEGER NOT NULL,
        room_id INTEGER,
        bed_id INTEGER,
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
        tenant_id INTEGER NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50) DEFAULT 'UPI',
        payment_month VARCHAR(50) DEFAULT '',
        notes TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        tenant_id INTEGER NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        month VARCHAR(50),
        due_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // =====================================================
    // 3. EXISTING TABLE MIGRATIONS
    // =====================================================

    await client.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS sharing_type VARCHAR(50)
        DEFAULT 'Single';

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS rent_amount NUMERIC(10, 2)
        DEFAULT 0;

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE beds
      ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN
        DEFAULT FALSE;

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
    // 4. OLD BED COLUMN SUPPORT
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
        WHERE is_occupied IS NULL;
      `);
    }

    // =====================================================
    // 5. PROPERTIES -> OWNERS
    // =====================================================

    await client.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS owner_id INTEGER;
    `);

    // Remove ALL old foreign keys attached to properties.owner_id.
    // This handles the previous users.id relationship safely.

    await client.query(`
      DO $$
      DECLARE
        fk RECORD;
      BEGIN
        FOR fk IN
          SELECT con.conname
          FROM pg_constraint con
          JOIN pg_class rel
            ON rel.oid = con.conrelid
          JOIN pg_attribute att
            ON att.attrelid = rel.oid
           AND att.attnum = ANY(con.conkey)
          WHERE rel.relname = 'properties'
            AND con.contype = 'f'
            AND att.attname = 'owner_id'
        LOOP
          EXECUTE format(
            'ALTER TABLE properties DROP CONSTRAINT IF EXISTS %I',
            fk.conname
          );
        END LOOP;
      END
      $$;
    `);

    // Any owner_id left from an old/failed migration that
    // doesn't exist in owners becomes NULL.
    // The property itself is NOT deleted.

    await client.query(`
      UPDATE properties
      SET owner_id = NULL
      WHERE owner_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM owners
          WHERE owners.id = properties.owner_id
        );
    `);

    // =====================================================
    // 6. RECREATE SESSIONS TABLE SAFELY
    // =====================================================
    //
    // IMPORTANT:
    //
    // The existing sessions table came from an older
    // version of Peacely and has incompatible columns/indexes.
    //
    // Sessions contain ONLY login sessions.
    // Recreating this table does NOT affect:
    // properties
    // rooms
    // beds
    // tenants
    // payments
    // invoices
    //
    // =====================================================

    await client.query(`
      DROP TABLE IF EXISTS sessions CASCADE;
    `);

    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        token_hash VARCHAR(128) UNIQUE NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // =====================================================
    // 7. CORRECT AUTH FOREIGN KEYS
    // =====================================================

    await client.query(`
      ALTER TABLE properties
      ADD CONSTRAINT properties_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES owners(id)
      ON DELETE CASCADE;
    `);

    await client.query(`
      ALTER TABLE sessions
      ADD CONSTRAINT sessions_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES owners(id)
      ON DELETE CASCADE;
    `);

    // =====================================================
    // 8. CORE FOREIGN KEYS
    // =====================================================

    // Remove old versions first where necessary.

    await client.query(`
      DO $$
      DECLARE
        fk RECORD;
      BEGIN

        -- rooms -> properties
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

        -- beds -> rooms
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

        -- tenants -> properties
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

        -- tenants -> rooms
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

        -- tenants -> beds
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

        -- payments -> tenants
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

        -- invoices -> tenants
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

      END
      $$;
    `);

    // =====================================================
    // 9. INDEXES
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
    // 10. ASSIGN EXISTING PROPERTIES
    // =====================================================
    //
    // If exactly one owner exists, all currently unassigned
    // properties belong to that first owner.
    //
    // Existing property records are preserved.
    //

    const ownerCountResult = await client.query(`
      SELECT COUNT(*)::INTEGER AS count
      FROM owners;
    `);

    const ownerCount =
      ownerCountResult.rows[0]?.count || 0;

    if (ownerCount === 1) {
      const firstOwnerResult = await client.query(`
        SELECT id
        FROM owners
        ORDER BY id ASC
        LIMIT 1;
      `);

      if (firstOwnerResult.rows.length > 0) {
        const firstOwnerId =
          firstOwnerResult.rows[0].id;

        await client.query(
          `
            UPDATE properties
            SET owner_id = $1
            WHERE owner_id IS NULL;
          `,
          [firstOwnerId]
        );

        console.log(
          `Existing properties assigned to owner ${firstOwnerId}.`
        );
      }
    }

    // =====================================================
    // 11. CLEAN EXPIRED SESSIONS
    // =====================================================
    //
    // This is safe because sessions only contain login
    // information.

    await client.query(`
      DELETE FROM sessions
      WHERE expires_at < CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 12. COMMIT
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
