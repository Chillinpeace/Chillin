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

async function columnExists(client, table, column) {
  const result = await client.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
    `,
    [table, column],
  );

  return result.rows.length > 0;
}

async function constraintExists(client, constraintName) {
  const result = await client.query(
    `
      SELECT 1
      FROM pg_constraint
      WHERE conname = $1
      LIMIT 1
    `,
    [constraintName],
  );

  return result.rows.length > 0;
}

async function dropForeignKeysForColumn(
  client,
  tableName,
  columnName,
) {
  const result = await client.query(
    `
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel
        ON rel.oid = con.conrelid
      JOIN pg_attribute att
        ON att.attrelid = rel.oid
       AND att.attnum = ANY(con.conkey)
      WHERE rel.relname = $1
        AND con.contype = 'f'
        AND att.attname = $2
    `,
    [tableName, columnName],
  );

  for (const row of result.rows) {
    await client.query(`
      ALTER TABLE "${tableName}"
      DROP CONSTRAINT IF EXISTS "${row.conname}"
    `);
  }
}

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

    await client.query(`
      ALTER TABLE owners
      ADD COLUMN IF NOT EXISTS phone VARCHAR(30) DEFAULT '';

      ALTER TABLE owners
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 2. PROPERTIES
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS properties (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT DEFAULT '',
        property_type VARCHAR(30) DEFAULT 'Gents',
        rent_cycle VARCHAR(40) DEFAULT '1st of every month',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS address TEXT DEFAULT '';

      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS property_type VARCHAR(30)
        DEFAULT 'Gents';

      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS rent_cycle VARCHAR(40)
        DEFAULT '1st of every month';

      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE properties
      ADD COLUMN IF NOT EXISTS owner_id INTEGER;
    `);

    await dropForeignKeysForColumn(
      client,
      'properties',
      'owner_id',
    );

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
    // 3. ROOMS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id SERIAL PRIMARY KEY,
        property_id INTEGER NOT NULL,
        room_number VARCHAR(50) NOT NULL,
        sharing_type VARCHAR(50) DEFAULT 'Single',
        room_type VARCHAR(20) DEFAULT 'Non AC',
        floor_name VARCHAR(150) DEFAULT 'Ground Floor',
        per_day_rent NUMERIC(10,2) DEFAULT 0,
        rent_amount NUMERIC(10,2) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS property_id INTEGER;

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS room_number VARCHAR(50);

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS sharing_type VARCHAR(50)
        DEFAULT 'Single';

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS room_type VARCHAR(20)
        DEFAULT 'Non AC';

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS floor_name VARCHAR(150)
        DEFAULT 'Ground Floor';

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS per_day_rent NUMERIC(10,2)
        DEFAULT 0;

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS rent_amount NUMERIC(10,2)
        DEFAULT 0;

      ALTER TABLE rooms
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    await client.query(`
      UPDATE rooms
      SET sharing_type = 'Single'
      WHERE sharing_type IS NULL;

      UPDATE rooms
      SET room_type = 'Non AC'
      WHERE room_type IS NULL OR room_type = '';

      UPDATE rooms
      SET floor_name = 'Ground Floor'
      WHERE floor_name IS NULL OR floor_name = '';

      UPDATE rooms
      SET per_day_rent = 0
      WHERE per_day_rent IS NULL;

      UPDATE rooms
      SET rent_amount = 0
      WHERE rent_amount IS NULL;

      UPDATE rooms
      SET created_at = CURRENT_TIMESTAMP
      WHERE created_at IS NULL;
    `);

    // =====================================================
    // 4. BEDS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS beds (
        id SERIAL PRIMARY KEY,
        room_id INTEGER NOT NULL,
        bed_number VARCHAR(50) NOT NULL,
        is_occupied BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE beds
      ADD COLUMN IF NOT EXISTS room_id INTEGER;

      ALTER TABLE beds
      ADD COLUMN IF NOT EXISTS bed_number VARCHAR(50);

      ALTER TABLE beds
      ADD COLUMN IF NOT EXISTS is_occupied BOOLEAN
        DEFAULT FALSE;

      ALTER TABLE beds
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    const hasOldOccupied = await columnExists(
      client,
      'beds',
      'occupied',
    );

    if (hasOldOccupied) {
      await client.query(`
        UPDATE beds
        SET is_occupied = COALESCE(occupied, FALSE)
        WHERE is_occupied IS NULL;
      `);
    }

    // =====================================================
    // 5. TENANTS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(30) NOT NULL,
        email VARCHAR(255) DEFAULT '',
        gender VARCHAR(30) DEFAULT '',
        id_proof_type VARCHAR(50) DEFAULT '',
        id_photo_front TEXT DEFAULT '',
        id_photo_back TEXT DEFAULT '',
        property_id INTEGER NOT NULL,
        room_id INTEGER,
        bed_id INTEGER,
        monthly_rent NUMERIC(10,2) DEFAULT 0,
        due_date INTEGER DEFAULT 5,
        deposit_amount NUMERIC(10,2) DEFAULT 0,
        move_in_date DATE,
        move_out_date DATE,
        status VARCHAR(20) DEFAULT 'Active',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS email VARCHAR(255)
        DEFAULT '';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS gender VARCHAR(30)
        DEFAULT '';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS id_proof_type VARCHAR(50)
        DEFAULT '';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS id_photo_front TEXT
        DEFAULT '';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS id_photo_back TEXT
        DEFAULT '';

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS property_id INTEGER;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS room_id INTEGER;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS bed_id INTEGER;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS monthly_rent NUMERIC(10,2)
        DEFAULT 0;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS due_date INTEGER
        DEFAULT 5;

      ALTER TABLE tenants
      ADD COLUMN IF NOT EXISTS deposit_amount NUMERIC(10,2)
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
    // 6. PAYMENTS
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        payment_date DATE DEFAULT CURRENT_DATE,
        payment_method VARCHAR(50) DEFAULT 'UPI',
        payment_month VARCHAR(50) DEFAULT '',
        notes TEXT DEFAULT '',
        invoice_id INTEGER,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS tenant_id INTEGER;

      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2)
        DEFAULT 0;

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
      ADD COLUMN IF NOT EXISTS invoice_id INTEGER;

      ALTER TABLE payments
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    // =====================================================
    // 7. INVOICES
    // =====================================================

    await client.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id SERIAL PRIMARY KEY,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        tenant_id INTEGER NOT NULL,
        amount NUMERIC(10,2) NOT NULL,
        month VARCHAR(50),
        due_date DATE NOT NULL,
        status VARCHAR(30) DEFAULT 'Pending',
        paid_amount NUMERIC(10,2) DEFAULT 0,
        delivery_status VARCHAR(20) DEFAULT 'Not Sent',
        sent_at TIMESTAMPTZ,
        paid_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50);

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS tenant_id INTEGER;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS amount NUMERIC(10,2)
        DEFAULT 0;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS month VARCHAR(50);

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS due_date DATE;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS status VARCHAR(30)
        DEFAULT 'Pending';

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(10,2)
        DEFAULT 0;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20)
        DEFAULT 'Not Sent';

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS created_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS updated_at
        TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    `);

    await client.query(`
      UPDATE invoices
      SET paid_amount = 0
      WHERE paid_amount IS NULL;

      UPDATE invoices
      SET delivery_status = 'Not Sent'
      WHERE delivery_status IS NULL
         OR delivery_status = '';

      UPDATE invoices
      SET status = 'Pending'
      WHERE status IS NULL
         OR status = '';

      UPDATE invoices
      SET updated_at = COALESCE(created_at, CURRENT_TIMESTAMP)
      WHERE updated_at IS NULL;

      UPDATE invoices
      SET sent_at = NULL
      WHERE delivery_status = 'Not Sent';

      UPDATE invoices
      SET paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP)
      WHERE status = 'Paid'
        AND paid_at IS NULL;
    `);

    // =====================================================
    // 8. SESSIONS
    // =====================================================

    /*
      Sessions are disposable login records.

      Older Peacely versions created this table with
      incompatible columns. Recreating ONLY this table
      is safe because it contains no PG/tenant/business data.
    */

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
    // 9. FOREIGN KEYS
    // =====================================================

    await dropForeignKeysForColumn(
      client,
      'properties',
      'owner_id',
    );

    await dropForeignKeysForColumn(
      client,
      'rooms',
      'property_id',
    );

    await dropForeignKeysForColumn(
      client,
      'beds',
      'room_id',
    );

    await dropForeignKeysForColumn(
      client,
      'tenants',
      'property_id',
    );

    await dropForeignKeysForColumn(
      client,
      'tenants',
      'room_id',
    );

    await dropForeignKeysForColumn(
      client,
      'tenants',
      'bed_id',
    );

    await dropForeignKeysForColumn(
      client,
      'payments',
      'tenant_id',
    );

    await dropForeignKeysForColumn(
      client,
      'payments',
      'invoice_id',
    );

    await dropForeignKeysForColumn(
      client,
      'invoices',
      'tenant_id',
    );

    // Remove orphan references before adding constraints.
    await client.query(`
      UPDATE properties p
      SET owner_id = NULL
      WHERE owner_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM owners o
          WHERE o.id = p.owner_id
        );

      UPDATE rooms r
      SET property_id = NULL
      WHERE property_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM properties p
          WHERE p.id = r.property_id
        );

      UPDATE beds b
      SET room_id = NULL
      WHERE room_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM rooms r
          WHERE r.id = b.room_id
        );

      UPDATE tenants t
      SET property_id = NULL
      WHERE property_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM properties p
          WHERE p.id = t.property_id
        );

      UPDATE tenants t
      SET room_id = NULL
      WHERE room_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM rooms r
          WHERE r.id = t.room_id
        );

      UPDATE tenants t
      SET bed_id = NULL
      WHERE bed_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM beds b
          WHERE b.id = t.bed_id
        );

      -- Preserve historical financial records. Never delete payments or invoices
      -- during startup migrations. Orphaned records are left intact and their
      -- foreign-key constraints are created only when the data is compatible.

      UPDATE payments pay
      SET invoice_id = NULL
      WHERE invoice_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM invoices i
          WHERE i.id = pay.invoice_id
        );
    `);

    // =====================================================
    // 10. FOREIGN KEY CREATION
    // =====================================================

    if (
      !(await constraintExists(
        client,
        'properties_owner_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE properties
        ADD CONSTRAINT properties_owner_id_fkey
        FOREIGN KEY (owner_id)
        REFERENCES owners(id)
        ON DELETE CASCADE;
      `);
    }

    if (
      !(await constraintExists(
        client,
        'rooms_property_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE rooms
        ADD CONSTRAINT rooms_property_id_fkey
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE;
      `);
    }

    if (
      !(await constraintExists(
        client,
        'beds_room_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE beds
        ADD CONSTRAINT beds_room_id_fkey
        FOREIGN KEY (room_id)
        REFERENCES rooms(id)
        ON DELETE CASCADE;
      `);
    }

    if (
      !(await constraintExists(
        client,
        'tenants_property_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_property_id_fkey
        FOREIGN KEY (property_id)
        REFERENCES properties(id)
        ON DELETE CASCADE;
      `);
    }

    if (
      !(await constraintExists(
        client,
        'tenants_room_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_room_id_fkey
        FOREIGN KEY (room_id)
        REFERENCES rooms(id)
        ON DELETE SET NULL;
      `);
    }

    if (
      !(await constraintExists(
        client,
        'tenants_bed_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE tenants
        ADD CONSTRAINT tenants_bed_id_fkey
        FOREIGN KEY (bed_id)
        REFERENCES beds(id)
        ON DELETE SET NULL;
      `);
    }

    const orphanPaymentTenants = await client.query(`
      SELECT 1
      FROM payments pay
      LEFT JOIN tenants t
        ON t.id = pay.tenant_id
      WHERE t.id IS NULL
      LIMIT 1
    `);

    if (
      orphanPaymentTenants.rows.length === 0 &&
      !(await constraintExists(
        client,
        'payments_tenant_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE payments
        ADD CONSTRAINT payments_tenant_id_fkey
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE;
      `);
    }

    if (
      !(await constraintExists(
        client,
        'payments_invoice_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE payments
        ADD CONSTRAINT payments_invoice_id_fkey
        FOREIGN KEY (invoice_id)
        REFERENCES invoices(id)
        ON DELETE SET NULL;
      `);
    }

    const orphanInvoiceTenants = await client.query(`
      SELECT 1
      FROM invoices i
      LEFT JOIN tenants t
        ON t.id = i.tenant_id
      WHERE t.id IS NULL
      LIMIT 1
    `);

    if (
      orphanInvoiceTenants.rows.length === 0 &&
      !(await constraintExists(
        client,
        'invoices_tenant_id_fkey',
      ))
    ) {
      await client.query(`
        ALTER TABLE invoices
        ADD CONSTRAINT invoices_tenant_id_fkey
        FOREIGN KEY (tenant_id)
        REFERENCES tenants(id)
        ON DELETE CASCADE;
      `);
    }

    await client.query(`
      ALTER TABLE sessions
      ADD CONSTRAINT sessions_owner_id_fkey
      FOREIGN KEY (owner_id)
      REFERENCES owners(id)
      ON DELETE CASCADE;
    `);

    // =====================================================
    // 11. INDEXES
    // =====================================================

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_properties_owner_id
        ON properties(owner_id);

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

      CREATE INDEX IF NOT EXISTS idx_payments_invoice_id
        ON payments(invoice_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_tenant_id
        ON invoices(tenant_id);

      CREATE INDEX IF NOT EXISTS idx_invoices_status
        ON invoices(status);

      CREATE INDEX IF NOT EXISTS idx_invoices_due_date
        ON invoices(due_date);

      CREATE INDEX IF NOT EXISTS idx_sessions_owner_id
        ON sessions(owner_id);

      CREATE INDEX IF NOT EXISTS idx_sessions_token_hash
        ON sessions(token_hash);
    `);

    // =====================================================
    // 12. FIRST OWNER DATA MIGRATION
    // =====================================================

    const ownerResult = await client.query(`
      SELECT id
      FROM owners
      ORDER BY id ASC;
    `);

    if (ownerResult.rows.length === 1) {
      const ownerId = ownerResult.rows[0].id;

      await client.query(
        `
          UPDATE properties
          SET owner_id = $1
          WHERE owner_id IS NULL;
        `,
        [ownerId],
      );

      console.log(
        `Existing unassigned properties linked to owner ${ownerId}.`,
      );
    }

    // =====================================================
    // 13. CLEAN EXPIRED SESSIONS
    // =====================================================

    await client.query(`
      DELETE FROM sessions
      WHERE expires_at < CURRENT_TIMESTAMP;
    `);

    await client.query('COMMIT');

    console.log(
      'Peacely PostgreSQL database initialized successfully.',
    );
  } catch (error) {
    await client.query('ROLLBACK');

    console.error(
      'Database initialization failed:',
      error,
    );

    throw error;
  } finally {
    client.release();
  }
}
