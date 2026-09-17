import pg from 'pg';
import express from 'express';
import expenseRouter from './expenses.js';
import phase59Router from './phase5-9.js';
import phase7OperationsRouter from './phase7-operations.js';
import financialPdfRouter from './financial-pdf.js';
import { query } from './database.js';

const { Client } = pg;
const originalQuery = Client.prototype.query;

Client.prototype.query = function patchedQuery(config, values, callback) {
  const text = typeof config === 'string' ? config : config && typeof config.text === 'string' ? config.text : '';
  if (text.includes('UPDATE invoices') && text.includes('paid_amount = $1') && text.includes("WHEN $2 = 'Paid'")) {
    const patchedText = text.replace('status = $2,', 'status = $2::varchar,').replace("WHEN $2 = 'Paid'", "WHEN $2::varchar = 'Paid'");
    if (typeof config === 'string') config = patchedText;
    else if (config && typeof config === 'object') config = { ...config, text: patchedText };
  }
  return originalQuery.call(this, config, values, callback);
};

try {
  await query(`
    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, property_id INTEGER,
      expense_date DATE NOT NULL DEFAULT CURRENT_DATE, category VARCHAR(100) NOT NULL DEFAULT 'Other',
      amount NUMERIC(12,2) NOT NULL CHECK (amount > 0), note TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS property_id INTEGER;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date DATE NOT NULL DEFAULT CURRENT_DATE;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category VARCHAR(100) NOT NULL DEFAULT 'Other';
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) NOT NULL DEFAULT 0;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE expenses ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_expenses_owner_date ON expenses(owner_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_owner_property ON expenses(owner_id, property_id);

    CREATE TABLE IF NOT EXISTS maintenance_tickets (
      id SERIAL PRIMARY KEY, owner_id INTEGER NOT NULL, property_id INTEGER, room_id INTEGER, bed_id INTEGER,
      tenant_id INTEGER, title VARCHAR(255) NOT NULL DEFAULT 'Maintenance work', description TEXT DEFAULT '',
      category VARCHAR(80) DEFAULT 'General', priority VARCHAR(20) DEFAULT 'Medium', status VARCHAR(30) DEFAULT 'Resolved',
      assigned_to VARCHAR(255) DEFAULT '', estimated_cost NUMERIC(12,2) DEFAULT 0, actual_cost NUMERIC(12,2) DEFAULT 0,
      due_date DATE, resolved_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS property_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS room_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS bed_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS tenant_id INTEGER;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS title VARCHAR(255) NOT NULL DEFAULT 'Maintenance work';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS category VARCHAR(80) DEFAULT 'General';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'Medium';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'Resolved';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(255) DEFAULT '';
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(12,2) DEFAULT 0;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS due_date DATE;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
    CREATE INDEX IF NOT EXISTS idx_maintenance_owner_status ON maintenance_tickets(owner_id,status);
    CREATE INDEX IF NOT EXISTS idx_maintenance_owner_property ON maintenance_tickets(owner_id,property_id);
  `);
} catch (error) {
  console.error('Peacely compatibility migration warning:', error);
}

const originalUse = express.application.use;
let phaseRoutersMounted = false;

express.application.use = function patchedUse(...args) {
  const result = originalUse.apply(this, args);
  if (!phaseRoutersMounted) {
    originalUse.call(this, '/api', expenseRouter);
    originalUse.call(this, '/api', financialPdfRouter);
    originalUse.call(this, '/api', phase7OperationsRouter);
    originalUse.call(this, '/api', phase59Router);
    phaseRoutersMounted = true;
  }
  return result;
};

await import('./index.js');
