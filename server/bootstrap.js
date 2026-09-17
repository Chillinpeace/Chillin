import pg from 'pg';
import express from 'express';
import expenseRouter from './expenses.js';
import phase59Router from './phase5-9.js';
import financialPdfRouter from './financial-pdf.js';
import { query } from './database.js';

// PostgreSQL can infer the same placeholder as different types when a
// payment status value is used both as a column value and in a comparison.
// Normalize that one legacy query before it reaches PostgreSQL.
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

// Keep the Phase 7 maintenance table compatible with installations where the
// table was created by an earlier version without updated_at.
try {
  await query(`ALTER TABLE maintenance_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`);
} catch (error) {
  console.error('Maintenance schema migration failed:', error);
}

// Mount additive routers before the frontend catch-all in server/index.js.
const originalUse = express.application.use;
let phaseRoutersMounted = false;

express.application.use = function patchedUse(...args) {
  const result = originalUse.apply(this, args);
  if (!phaseRoutersMounted) {
    originalUse.call(this, '/api', expenseRouter);
    originalUse.call(this, '/api', financialPdfRouter);
    originalUse.call(this, '/api', phase59Router);
    phaseRoutersMounted = true;
  }
  return result;
};

await import('./index.js');
