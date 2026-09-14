import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, query, initializeDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Run DB Table Migrations
initializeDatabase();

// PROPERTIES ENDPOINTS
app.get('/api/properties', async (req, res) => {
  try {
    const result = await query(`
      SELECT p.*, 
        COUNT(DISTINCT r.id)::int as room_count,
        COUNT(DISTINCT t.id)::int as tenant_count
      FROM properties p
      LEFT JOIN rooms r ON p.id = r.property_id
      LEFT JOIN tenants t ON p.id = t.property_id
      GROUP BY p.id
      ORDER BY p.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/properties', async (req, res) => {
  const { name, address } = req.body;
  try {
    const result = await query(
      'INSERT INTO properties (name, address) VALUES ($1, $2) RETURNING *',
      [name, address || 'No address added']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ROOMS ENDPOINTS
app.get('/api/rooms', async (req, res) => {
  try {
    const result = await query('SELECT * FROM rooms ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rooms', async (req, res) => {
  const { property_id, room_number, sharing_type, rent_amount } = req.body;
  try {
    const result = await query(
      'INSERT INTO rooms (property_id, room_number, sharing_type, rent_amount) VALUES ($1, $2, $3, $4) RETURNING *',
      [property_id, room_number, sharing_type || 'Single', rent_amount || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TENANTS ENDPOINTS
app.get('/api/tenants', async (req, res) => {
  try {
    const result = await query(`
      SELECT t.*, p.name as property_name, r.room_number 
      FROM tenants t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN rooms r ON t.room_id = r.id
      ORDER BY t.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tenants', async (req, res) => {
  const { name, phone, email, property_id, room_id, monthly_rent, due_date, deposit_amount } = req.body;
  try {
    const result = await query(
      `INSERT INTO tenants (name, phone, email, property_id, room_id, monthly_rent, due_date, deposit_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, phone, email || '', property_id, room_id || null, monthly_rent || 0, due_date || 5, deposit_amount || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PAYMENTS ENDPOINTS
app.get('/api/payments', async (req, res) => {
  try {
    const result = await query(`
      SELECT pay.*, t.name as tenant_name 
      FROM payments pay
      JOIN tenants t ON pay.tenant_id = t.id
      ORDER BY pay.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/payments', async (req, res) => {
  const { tenant_id, amount, payment_date, payment_method, payment_month, notes } = req.body;
  try {
    const result = await query(
      `INSERT INTO payments (tenant_id, amount, payment_date, payment_method, payment_month, notes)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [tenant_id, amount, payment_date || new Date(), payment_method || 'UPI', payment_month || 'September 2026', notes || '']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// INVOICES ENDPOINTS
app.get('/api/invoices', async (req, res) => {
  try {
    const result = await query(`
      SELECT inv.*, t.name as tenant_name 
      FROM invoices inv
      JOIN tenants t ON inv.tenant_id = t.id
      ORDER BY inv.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/invoices', async (req, res) => {
  const { tenant_id, amount, due_date, status } = req.body;
  const invoice_number = `INV-${Date.now().toString().slice(-6)}`;
  try {
    const result = await query(
      `INSERT INTO invoices (invoice_number, tenant_id, amount, due_date, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [invoice_number, tenant_id, amount, due_date, status || 'Pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve Frontend Build
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
