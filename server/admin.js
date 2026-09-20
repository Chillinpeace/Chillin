import express from 'express';
import crypto from 'crypto';
import { query } from './database.js';

const router = express.Router();

const ADMIN_COOKIE = 'peacely_admin_session';
const ADMIN_EMAIL = String(process.env.PEACELY_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.PEACELY_ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || '');

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function adminToken() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return '';
  return hash(`peacely-admin:${ADMIN_EMAIL}:${ADMIN_PASSWORD}`);
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function setAdminCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_COOKIE}=${encodeURIComponent(adminToken())}; Max-Age=604800; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
}

function clearAdminCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${ADMIN_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
}

function isAdmin(req) {
  const token = parseCookies(req)[ADMIN_COOKIE];
  return Boolean(token && adminToken() && token === adminToken());
}

async function ownerFromRequest(req) {
  const cookies = parseCookies(req);
  const token = cookies.peacely_session;
  if (!token) return null;

  const result = await query(
    `SELECT o.id,o.name,o.email,o.phone,o.created_at
     FROM sessions s
     INNER JOIN owners o ON o.id=s.owner_id
     WHERE s.token_hash=$1
       AND s.expires_at>CURRENT_TIMESTAMP
     LIMIT 1`,
    [hash(token)],
  );

  return result.rows[0] || null;
}

export async function initializeAdminTracking() {
  await query(`
    ALTER TABLE owners
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

    CREATE TABLE IF NOT EXISTS public_visits (
      id BIGSERIAL PRIMARY KEY,
      visitor_id VARCHAR(120) NOT NULL,
      referrer VARCHAR(255) DEFAULT '',
      path VARCHAR(255) DEFAULT '/',
      user_agent TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_public_visits_created_at
      ON public_visits(created_at);

    CREATE INDEX IF NOT EXISTS idx_public_visits_visitor_created
      ON public_visits(visitor_id,created_at);
  `);
}

let trackingReady;

async function ensureAdminTracking() {
  if (!trackingReady) {
    trackingReady = initializeAdminTracking().catch((error) => {
      trackingReady = null;
      throw error;
    });
  }
  return trackingReady;
}

router.post('/visit', async (req, res) => {
  try {
    await ensureAdminTracking();
    const visitorId = String(req.body?.visitor_id || '').trim().slice(0, 120);
    if (!visitorId) return res.json({ success: true });

    await query(
      `INSERT INTO public_visits(visitor_id,referrer,path,user_agent)
       VALUES($1,$2,$3,$4)`,
      [
        visitorId,
        String(req.body?.referrer || '').slice(0, 255),
        String(req.body?.path || '/').slice(0, 255),
        String(req.headers['user-agent'] || '').slice(0, 1000),
      ],
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Public visit tracking failed:', error);
    return res.json({ success: false });
  }
});

router.post('/owner-activity', async (req, res) => {
  try {
    await ensureAdminTracking();
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success: false });

    await query(
      `UPDATE owners SET last_active_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [owner.id],
    );

    return res.json({ success: true });
  } catch (error) {
    console.error('Owner activity tracking failed:', error);
    return res.status(500).json({ success: false });
  }
});

router.post('/admin/login', async (req, res) => {
  await ensureAdminTracking();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    return res.status(503).json({
      success: false,
      error: 'Admin access is not configured. Set PEACELY_ADMIN_EMAIL and PEACELY_ADMIN_PASSWORD.',
    });
  }

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      success: false,
      error: 'Invalid admin credentials.',
    });
  }

  setAdminCookie(res);
  return res.json({ success: true });
});

router.post('/admin/logout', async (req, res) => {
  await ensureAdminTracking();
  clearAdminCookie(res);
  return res.json({ success: true });
});

router.get('/admin/me', async (req, res) => {
  await ensureAdminTracking();
  return res.json({ authenticated: isAdmin(req) });
});

router.get('/admin/dashboard', async (req, res) => {
  await ensureAdminTracking();
  if (!isAdmin(req)) {
    return res.status(401).json({ success: false, error: 'Admin authentication required.' });
  }

  try {
    const [
      visits,
      owners,
      usage,
      ownerRows,
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::INTEGER AS total_visits,
          COUNT(DISTINCT visitor_id)::INTEGER AS unique_visitors,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::INTEGER AS visits_today,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= CURRENT_DATE)::INTEGER AS unique_today,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::INTEGER AS visits_7d,
          COUNT(DISTINCT visitor_id) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::INTEGER AS unique_7d
        FROM public_visits
      `),
      query(`
        SELECT
          COUNT(*)::INTEGER AS total_owners,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE)::INTEGER AS signups_today,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::INTEGER AS signups_7d,
          COUNT(*) FILTER (WHERE last_active_at >= CURRENT_DATE)::INTEGER AS active_today,
          COUNT(*) FILTER (WHERE last_active_at >= CURRENT_TIMESTAMP - INTERVAL '7 days')::INTEGER AS active_7d
        FROM owners
      `),
      query(`
        SELECT
          (SELECT COUNT(*) FROM properties) AS properties,
          (SELECT COUNT(*) FROM rooms) AS rooms,
          (SELECT COUNT(*) FROM beds) AS beds,
          (SELECT COUNT(*) FROM tenants WHERE LOWER(COALESCE(status,'')) IN ('active','move out notice')) AS active_tenants,
          (SELECT COALESCE(SUM(amount),0) FROM payments) AS payments_amount,
          (SELECT COUNT(*) FROM payments) AS payment_count,
          (SELECT COALESCE(SUM(amount),0) FROM expenses) AS expenses_amount,
          (SELECT COUNT(*) FROM expenses) AS expense_count
      `),
      query(`
        SELECT
          o.id,
          o.name,
          o.email,
          o.phone,
          o.created_at,
          o.last_active_at,
          COUNT(DISTINCT p.id)::INTEGER AS properties,
          COUNT(DISTINCT r.id)::INTEGER AS rooms,
          COUNT(DISTINCT b.id)::INTEGER AS beds,
          COUNT(DISTINCT t.id) FILTER (
            WHERE LOWER(COALESCE(t.status,'')) IN ('active','move out notice')
          )::INTEGER AS active_tenants,
          COUNT(DISTINCT pay.id)::INTEGER AS payments,
          COALESCE(SUM(pay.amount),0) AS payments_amount,
          COUNT(DISTINCT e.id)::INTEGER AS expenses,
          COALESCE(SUM(e.amount),0) AS expenses_amount
        FROM owners o
        LEFT JOIN properties p ON p.owner_id=o.id
        LEFT JOIN rooms r ON r.property_id=p.id
        LEFT JOIN beds b ON b.room_id=r.id
        LEFT JOIN tenants t ON t.property_id=p.id
        LEFT JOIN payments pay ON pay.tenant_id=t.id
        LEFT JOIN expenses e ON e.owner_id=o.id
        GROUP BY o.id
        ORDER BY COALESCE(o.last_active_at,o.created_at) DESC
      `),
    ]);

    return res.json({
      success: true,
      visits: visits.rows[0],
      owners: owners.rows[0],
      usage: usage.rows[0],
      ownerRows: ownerRows.rows,
    });
  } catch (error) {
    console.error('Admin dashboard failed:', error);
    return res.status(500).json({
      success: false,
      error: 'Unable to load admin dashboard.',
    });
  }
});

export default router;
