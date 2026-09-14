const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// Initialize Database Tables
const initDb = async () => {
  const queryText = `
    CREATE TABLE IF NOT EXISTS properties (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      address TEXT DEFAULT 'No address added',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id SERIAL PRIMARY KEY,
      property_id INT REFERENCES properties(id) ON DELETE CASCADE,
      room_number VARCHAR(50) NOT NULL,
      sharing_type VARCHAR(50) DEFAULT 'Single',
      rent_amount NUMERIC(10, 2) DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS beds (
      id SERIAL PRIMARY KEY,
      room_id INT REFERENCES rooms(id) ON DELETE CASCADE,
      bed_number VARCHAR(50) NOT NULL,
      is_occupied BOOLEAN DEFAULT FALSE
    );

    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      email VARCHAR(255),
      property_id INT REFERENCES properties(id) ON DELETE CASCADE,
      room_id INT REFERENCES rooms(id) ON DELETE SET NULL,
      monthly_rent NUMERIC(10, 2) NOT NULL,
      due_date INT DEFAULT 5,
      deposit_amount NUMERIC(10, 2) DEFAULT 0,
      status VARCHAR(20) DEFAULT 'Active',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      payment_date DATE NOT NULL,
      payment_method VARCHAR(50) DEFAULT 'UPI',
      payment_month VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      id SERIAL PRIMARY KEY,
      invoice_number VARCHAR(50) UNIQUE NOT NULL,
      tenant_id INT REFERENCES tenants(id) ON DELETE CASCADE,
      amount NUMERIC(10, 2) NOT NULL,
      due_date DATE NOT NULL,
      status VARCHAR(20) DEFAULT 'Pending',
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `;

  try {
    await pool.query(queryText);
    console.log('PostgreSQL schema initialized successfully.');
  } catch (err) {
    console.error('Error initializing PostgreSQL schema:', err);
  }
};

initDb();

module.exports = {
  query: (text, params) => pool.query(text, params),
};
