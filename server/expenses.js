import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();
let tableReady = null;

const clean = (value) => String(value ?? '').trim();
const money = (value) => Number(value);

function hashValue(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function cookies(req) {
  const header = req.headers.cookie || '';
  const result = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const key = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    try { result[key] = decodeURIComponent(value); } catch { result[key] = value; }
  }
  return result;
}

async function ensureTable() {
  if (!tableReady) {
    tableReady = query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        owner_id INTEGER NOT NULL,
        property_id INTEGER,
        expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
        category VARCHAR(100) NOT NULL DEFAULT 'Other',
        amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
        note TEXT DEFAULT '',
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_owner_date
        ON expenses(owner_id, expense_date);

      CREATE INDEX IF NOT EXISTS idx_expenses_owner_property
        ON expenses(owner_id, property_id);
    `).catch((error) => {
      tableReady = null;
      throw error;
    });
  }
  return tableReady;
}

async function requireOwner(req, res, next) {
  try {
    await ensureTable();
    const token = cookies(req).peacely_session;
    if (!token) return res.status(401).json({ success: false, error: 'Authentication required.' });

    const result = await query(`
      SELECT o.id, o.name, o.email
      FROM sessions s
      INNER JOIN owners o ON o.id = s.owner_id
      WHERE s.token_hash = $1
        AND s.expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    `, [hashValue(token)]);

    if (!result.rows.length) {
      return res.status(401).json({ success: false, error: 'Authentication required.' });
    }

    req.expenseOwner = result.rows[0];
    return next();
  } catch (error) {
    console.error('Expense auth failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to access expenses.' });
  }
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(clean(value));
}

async function propertyForOwner(ownerId, propertyId) {
  if (propertyId === null || propertyId === undefined || propertyId === '') return null;
  const id = Number(propertyId);
  if (!Number.isInteger(id) || id < 1) throw new Error('Invalid property.');
  const result = await query(`
    SELECT id, name
    FROM properties
    WHERE id = $1 AND owner_id = $2
    LIMIT 1
  `, [id, ownerId]);
  if (!result.rows.length) throw new Error('Selected property was not found.');
  return result.rows[0];
}

router.get('/expenses', requireOwner, async (req, res) => {
  try {
    const ownerId = req.expenseOwner.id;
    const month = clean(req.query.month);
    const propertyId = clean(req.query.property_id);
    const params = [ownerId];
    const where = ['e.owner_id = $1'];

    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ success: false, error: 'Month must be YYYY-MM.' });
      params.push(`${month}-01`, `${month}-01`);
      where.push(`e.expense_date >= $${params.length - 1}::date`);
      where.push(`e.expense_date < ($${params.length - 1}::date + INTERVAL '1 month')`);
    }

    if (propertyId) {
      params.push(Number(propertyId));
      where.push(`e.property_id = $${params.length}`);
    }

    const result = await query(`
      SELECT
        e.id,
        e.property_id,
        p.name AS property_name,
        e.expense_date,
        e.category,
        e.amount,
        e.note,
        e.created_at,
        e.updated_at
      FROM expenses e
      LEFT JOIN properties p ON p.id = e.property_id AND p.owner_id = e.owner_id
      WHERE ${where.join(' AND ')}
      ORDER BY e.expense_date DESC, e.id DESC
    `, params);

    return res.json(result.rows);
  } catch (error) {
    console.error('Expense list failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to load expenses.' });
  }
});

router.get('/expenses/summary', requireOwner, async (req, res) => {
  try {
    const ownerId = req.expenseOwner.id;
    const month = clean(req.query.month);
    const params = [ownerId];
    const where = ['e.owner_id = $1'];
    if (month) {
      if (!/^\d{4}-\d{2}$/.test(month)) return res.status(400).json({ success: false, error: 'Month must be YYYY-MM.' });
      params.push(`${month}-01`);
      where.push(`e.expense_date >= $2::date`);
      where.push(`e.expense_date < ($2::date + INTERVAL '1 month')`);
    }

    const totals = await query(`
      SELECT
        COALESCE(SUM(e.amount),0) AS total,
        COUNT(*)::INTEGER AS count
      FROM expenses e
      WHERE ${where.join(' AND ')}
    `, params);

    const categories = await query(`
      SELECT e.category, COALESCE(SUM(e.amount),0) AS amount, COUNT(*)::INTEGER AS count
      FROM expenses e
      WHERE ${where.join(' AND ')}
      GROUP BY e.category
      ORDER BY amount DESC
    `, params);

    const months = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', e.expense_date), 'YYYY-MM') AS month,
        COALESCE(SUM(e.amount),0) AS amount,
        COUNT(*)::INTEGER AS count
      FROM expenses e
      WHERE e.owner_id = $1
        AND e.expense_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '11 months'
      GROUP BY DATE_TRUNC('month', e.expense_date)
      ORDER BY month DESC
    `, [ownerId]);

    return res.json({
      success: true,
      total: Number(totals.rows[0]?.total || 0),
      count: Number(totals.rows[0]?.count || 0),
      categories: categories.rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })),
      months: months.rows.map((row) => ({ ...row, amount: Number(row.amount || 0) })),
    });
  } catch (error) {
    console.error('Expense summary failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to load expense summary.' });
  }
});

router.post('/expenses', requireOwner, async (req, res) => {
  try {
    const ownerId = req.expenseOwner.id;
    const expenseDate = clean(req.body?.expense_date || req.body?.date);
    const category = clean(req.body?.category) || 'Other';
    const amount = money(req.body?.amount);
    const note = clean(req.body?.note || req.body?.notes);
    const propertyId = req.body?.property_id === '' || req.body?.property_id === undefined ? null : req.body?.property_id;

    if (!validDate(expenseDate)) return res.status(400).json({ success: false, error: 'Expense date must be YYYY-MM-DD.' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Expense amount must be greater than zero.' });
    if (category.length > 100) return res.status(400).json({ success: false, error: 'Expense category is too long.' });

    const property = await propertyForOwner(ownerId, propertyId);
    const result = await query(`
      INSERT INTO expenses (owner_id, property_id, expense_date, category, amount, note)
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING id, owner_id, property_id, expense_date, category, amount, note, created_at, updated_at
    `, [ownerId, property?.id || null, expenseDate, category, amount, note]);

    return res.status(201).json({ ...result.rows[0], property_name: property?.name || null });
  } catch (error) {
    console.error('Expense create failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Unable to create expense.' });
  }
});

router.put('/expenses/:id', requireOwner, async (req, res) => {
  try {
    const ownerId = req.expenseOwner.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid expense id.' });

    const existing = await query(`SELECT id FROM expenses WHERE id = $1 AND owner_id = $2 LIMIT 1`, [id, ownerId]);
    if (!existing.rows.length) return res.status(404).json({ success: false, error: 'Expense not found.' });

    const expenseDate = clean(req.body?.expense_date || req.body?.date);
    const category = clean(req.body?.category) || 'Other';
    const amount = money(req.body?.amount);
    const note = clean(req.body?.note || req.body?.notes);
    const propertyId = req.body?.property_id === '' || req.body?.property_id === undefined ? null : req.body?.property_id;

    if (!validDate(expenseDate)) return res.status(400).json({ success: false, error: 'Expense date must be YYYY-MM-DD.' });
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Expense amount must be greater than zero.' });
    const property = await propertyForOwner(ownerId, propertyId);

    const result = await query(`
      UPDATE expenses
      SET property_id=$1, expense_date=$2, category=$3, amount=$4, note=$5, updated_at=CURRENT_TIMESTAMP
      WHERE id=$6 AND owner_id=$7
      RETURNING id, owner_id, property_id, expense_date, category, amount, note, created_at, updated_at
    `, [property?.id || null, expenseDate, category, amount, note, id, ownerId]);

    return res.json({ ...result.rows[0], property_name: property?.name || null });
  } catch (error) {
    console.error('Expense update failed:', error);
    return res.status(500).json({ success: false, error: error.message || 'Unable to update expense.' });
  }
});

router.delete('/expenses/:id', requireOwner, async (req, res) => {
  try {
    const ownerId = req.expenseOwner.id;
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ success: false, error: 'Invalid expense id.' });
    const result = await query(`DELETE FROM expenses WHERE id=$1 AND owner_id=$2 RETURNING id`, [id, ownerId]);
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Expense not found.' });
    return res.json({ success: true, id });
  } catch (error) {
    console.error('Expense delete failed:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete expense.' });
  }
});

export default router;
