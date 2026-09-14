import pg from 'pg';
import express from 'express';
import expenseRouter from './expenses.js';

// PostgreSQL can infer the same placeholder as different types when a
// payment status value is used both as a column value and in a comparison.
// Normalize that one legacy query before it reaches PostgreSQL.
const { Client } = pg;
const originalQuery = Client.prototype.query;

Client.prototype.query = function patchedQuery(config, values, callback) {
  const text =
    typeof config === 'string'
      ? config
      : config && typeof config.text === 'string'
        ? config.text
        : '';

  if (
    text.includes('UPDATE invoices') &&
    text.includes('paid_amount = $1') &&
    text.includes("WHEN $2 = 'Paid'")
  ) {
    const patchedText = text
      .replace(
        'status = $2,',
        'status = $2::varchar,',
      )
      .replace(
        "WHEN $2 = 'Paid'",
        "WHEN $2::varchar = 'Paid'",
      );

    if (typeof config === 'string') {
      config = patchedText;
    } else if (config && typeof config === 'object') {
      config = {
        ...config,
        text: patchedText,
      };
    }
  }

  return originalQuery.call(
    this,
    config,
    values,
    callback,
  );
};

// Mount the Phase 4 expense router immediately after the JSON parser in
// server/index.js. This keeps it ahead of the frontend catch-all without
// modifying the large production route file.
const originalUse = express.application.use;
let expenseRouterMounted = false;

express.application.use = function patchedUse(...args) {
  const result = originalUse.apply(this, args);

  if (!expenseRouterMounted) {
    originalUse.call(this, '/api', expenseRouter);
    expenseRouterMounted = true;
  }

  return result;
};

await import('./index.js');
