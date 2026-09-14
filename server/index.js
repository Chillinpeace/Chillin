import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool, query, initializeDatabase } from './database.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

const PORT = process.env.PORT || 8080;

const SESSION_COOKIE = 'peacely_session';
const SESSION_DAYS = 30;

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// BASIC HELPERS
// =====================================================

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function cleanString(value) {
  return String(value ?? '').trim();
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function hashValue(value) {
  return crypto
    .createHash('sha256')
    .update(String(value))
    .digest('hex');
}

function hashPassword(password) {
  return hashValue(password);
}

function createToken() {
  return crypto.randomBytes(48).toString('hex');
}

function parseCookies(req) {
  const header = req.headers.cookie;

  if (!header) {
    return {};
  }

  const cookies = {};

  header.split(';').forEach((part) => {
    const index = part.indexOf('=');

    if (index === -1) {
      return;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  });

  return cookies;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`
  );
}

function sendError(res, status, message, details = null) {
  console.error(`API ERROR ${status}:`, message, details || '');

  return res.status(status).json({
    success: false,
    error: message,
  });
}

// =====================================================
// AUTH HELPERS
// =====================================================

async function getSessionOwner(req) {
  try {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];

    if (!token) {
      return null;
    }

    const tokenHash = hashValue(token);

    const result = await query(
      `
        SELECT
          o.id,
          o.name,
          o.email,
          o.phone,
          o.created_at,
          s.id AS session_id
        FROM sessions s
        INNER JOIN owners o
          ON o.id = s.owner_id
        WHERE s.token_hash = $1
          AND s.expires_at > CURRENT_TIMESTAMP
        LIMIT 1
      `,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('getSessionOwner error:', error);
    return null;
  }
}

async function requireAuth(req, res, next) {
  try {
    const owner = await getSessionOwner(req);

    if (!owner) {
      return sendError(res, 401, 'Authentication required.');
    }

    req.owner = owner;

    next();
  } catch (error) {
    console.error('Authentication middleware error:', error);

    return sendError(
      res,
      500,
      'Authentication check failed.'
    );
  }
}

async function createSession(ownerId) {
  const token = createToken();
  const tokenHash = hashValue(token);

  await query(
    `
      DELETE FROM sessions
      WHERE owner_id = $1
         OR expires_at < CURRENT_TIMESTAMP
    `,
    [ownerId]
  );

  await query(
    `
      INSERT INTO sessions (
        owner_id,
        token_hash,
        expires_at
      )
      VALUES (
        $1,
        $2,
        CURRENT_TIMESTAMP + INTERVAL '${SESSION_DAYS} days'
      )
    `,
    [ownerId, tokenHash]
  );

  return token;
}

// =====================================================
// ERROR HANDLER FOR ASYNC ROUTES
// =====================================================

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('Unhandled route error:', error);

      if (!res.headersSent) {
        sendError(
          res,
          500,
          error?.message || 'Internal server error.'
        );
      }
    }
  };
}

// =====================================================
// HEALTH
// =====================================================

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    const result = await query('SELECT NOW() AS now');

    res.json({
      success: true,
      status: 'ok',
      database: 'connected',
      time: result.rows[0].now,
    });
  })
);

// =====================================================
// AUTH - CURRENT USER
// =====================================================

app.get(
  '/api/auth/me',
  asyncHandler(async (req, res) => {
    const owner = await getSessionOwner(req);

    if (!owner) {
      return res.status(401).json({
        authenticated: false,
        owner: null,
      });
    }

    return res.json({
      authenticated: true,
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        phone: owner.phone || '',
        created_at: owner.created_at,
      },
    });
  })
);

// =====================================================
// AUTH - SIGN UP
// =====================================================

app.post(
  '/api/auth/signup',
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body?.name);
    const email = normalizeEmail(req.body?.email);
    const phone = cleanString(req.body?.phone);
    const password = String(req.body?.password || '');

    if (!name) {
      return sendError(res, 400, 'Name is required.');
    }

    if (!email) {
      return sendError(res, 400, 'Email is required.');
    }

    if (!email.includes('@')) {
      return sendError(res, 400, 'Please enter a valid email address.');
    }

    if (password.length < 6) {
      return sendError(
        res,
        400,
        'Password must be at least 6 characters.'
      );
    }

    const existing = await query(
      `
        SELECT id
        FROM owners
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    if (existing.rows.length > 0) {
      return sendError(
        res,
        409,
        'An account with this email already exists.'
      );
    }

    const passwordHash = hashPassword(password);

    const ownerResult = await query(
      `
        INSERT INTO owners (
          name,
          email,
          phone,
          password_hash
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        RETURNING
          id,
          name,
          email,
          phone,
          created_at
      `,
      [
        name,
        email,
        phone,
        passwordHash,
      ]
    );

    const owner = ownerResult.rows[0];

    // -------------------------------------------------
    // IMPORTANT:
    // If this is the first owner, attach all existing
    // unassigned properties to this owner.
    // -------------------------------------------------

    const ownerCountResult = await query(
      `
        SELECT COUNT(*)::INTEGER AS count
        FROM owners
      `
    );

    const ownerCount =
      ownerCountResult.rows[0]?.count || 0;

    if (ownerCount === 1) {
      await query(
        `
          UPDATE properties
          SET owner_id = $1
          WHERE owner_id IS NULL
        `,
        [owner.id]
      );

      console.log(
        `Existing properties assigned to first owner ${owner.id}.`
      );
    }

    const token = await createSession(owner.id);

    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      authenticated: true,
      owner,
    });
  })
);

// =====================================================
// AUTH - LOGIN
// =====================================================

app.post(
  '/api/auth/login',
  asyncHandler(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return sendError(
        res,
        400,
        'Email and password are required.'
      );
    }

    const result = await query(
      `
        SELECT
          id,
          name,
          email,
          phone,
          password_hash,
          created_at
        FROM owners
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        401,
        'Invalid email or password.'
      );
    }

    const owner = result.rows[0];

    const passwordHash = hashPassword(password);

    const passwordMatches =
      passwordHash === owner.password_hash;

    if (!passwordMatches) {
      return sendError(
        res,
        401,
        'Invalid email or password.'
      );
    }

    const token = await createSession(owner.id);

    setSessionCookie(res, token);

    delete owner.password_hash;

    return res.json({
      success: true,
      authenticated: true,
      owner,
    });
  })
);

// =====================================================
// AUTH - LOGOUT
// =====================================================

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];

    if (token) {
      const tokenHash = hashValue(token);

      await query(
        `
          DELETE FROM sessions
          WHERE token_hash = $1
        `,
        [tokenHash]
      );
    }

    clearSessionCookie(res);

    return res.json({
      success: true,
      authenticated: false,
    });
  })
);

// =====================================================
// PROPERTIES - GET
// =====================================================

app.get(
  '/api/properties',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          p.id,
          p.name,
          p.address,
          p.created_at,

          COUNT(DISTINCT r.id)::INTEGER AS room_count,

          COUNT(DISTINCT b.id)::INTEGER AS bed_count,

          COUNT(
            DISTINCT CASE
              WHEN b.is_occupied = TRUE
              THEN b.id
            END
          )::INTEGER AS occupied_bed_count,

          COUNT(
            DISTINCT CASE
              WHEN LOWER(COALESCE(t.status, '')) = 'active'
              THEN t.id
            END
          )::INTEGER AS tenant_count,

          COALESCE(
            SUM(
              CASE
                WHEN LOWER(COALESCE(t.status, '')) = 'active'
                THEN t.monthly_rent
                ELSE 0
              END
            ),
            0
          )::NUMERIC(10,2) AS monthly_revenue

        FROM properties p

        LEFT JOIN rooms r
          ON r.property_id = p.id

        LEFT JOIN beds b
          ON b.room_id = r.id

        LEFT JOIN tenants t
          ON t.property_id = p.id

        WHERE p.owner_id = $1

        GROUP BY
          p.id,
          p.name,
          p.address,
          p.created_at

        ORDER BY p.id DESC
      `,
      [req.owner.id]
    );

    const properties = result.rows.map((property) => {
      const bedCount = Number(property.bed_count || 0);
      const occupiedBedCount =
        Number(property.occupied_bed_count || 0);

      return {
        ...property,
        room_count: Number(property.room_count || 0),
        bed_count: bedCount,
        occupied_bed_count: occupiedBedCount,
        tenant_count: Number(property.tenant_count || 0),
        monthly_revenue: Number(
          property.monthly_revenue || 0
        ),
        occupancy_rate:
          bedCount > 0
            ? Math.round(
                (occupiedBedCount / bedCount) * 100
              )
            : 0,
      };
    });

    return res.json(properties);
  })
);

// =====================================================
// PROPERTIES - CREATE
// =====================================================

app.post(
  '/api/properties',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body?.name);
    const address = cleanString(req.body?.address);

    if (!name) {
      return sendError(
        res,
        400,
        'Property name is required.'
      );
    }

    const result = await query(
      `
        INSERT INTO properties (
          name,
          address,
          owner_id
        )
        VALUES (
          $1,
          $2,
          $3
        )
        RETURNING
          id,
          name,
          address,
          owner_id,
          created_at
      `,
      [
        name,
        address,
        req.owner.id,
      ]
    );

    console.log(
      `Property ${result.rows[0].id} created by owner ${req.owner.id}.`
    );

    return res.status(201).json(result.rows[0]);
  })
);

// =====================================================
// ROOMS - GET
// =====================================================

app.get(
  '/api/rooms',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          r.id,
          r.property_id,
          r.room_number,
          r.sharing_type,
          r.rent_amount,
          r.created_at,
          p.name AS property_name,

          COUNT(b.id)::INTEGER AS bed_count,

          COUNT(
            CASE
              WHEN b.is_occupied = TRUE
              THEN 1
            END
          )::INTEGER AS occupied_bed_count

        FROM rooms r

        INNER JOIN properties p
          ON p.id = r.property_id

        LEFT JOIN beds b
          ON b.room_id = r.id

        WHERE p.owner_id = $1

        GROUP BY
          r.id,
          p.name

        ORDER BY
          p.id,
          r.room_number
      `,
      [req.owner.id]
    );

    return res.json(
      result.rows.map((room) => ({
        ...room,
        rent_amount: Number(room.rent_amount || 0),
        bed_count: Number(room.bed_count || 0),
        occupied_bed_count: Number(
          room.occupied_bed_count || 0
        ),
      }))
    );
  })
);

// =====================================================
// ROOMS - CREATE
// =====================================================

app.post(
  '/api/rooms',
  requireAuth,
  asyncHandler(async (req, res) => {
    const propertyId = Number(req.body?.property_id);
    const roomNumber = cleanString(req.body?.room_number);
    const sharingType =
      cleanString(req.body?.sharing_type) || 'Single';

    const rentAmount = toNumber(
      req.body?.rent_amount,
      0
    );

    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return sendError(
        res,
        400,
        'A valid property is required.'
      );
    }

    if (!roomNumber) {
      return sendError(
        res,
        400,
        'Room number is required.'
      );
    }

    const propertyResult = await query(
      `
        SELECT id
        FROM properties
        WHERE id = $1
          AND owner_id = $2
        LIMIT 1
      `,
      [
        propertyId,
        req.owner.id,
      ]
    );

    if (propertyResult.rows.length === 0) {
      return sendError(
        res,
        403,
        'Property does not belong to your account.'
      );
    }

    const result = await query(
      `
        INSERT INTO rooms (
          property_id,
          room_number,
          sharing_type,
          rent_amount
        )
        VALUES (
          $1,
          $2,
          $3,
          $4
        )
        RETURNING
          id,
          property_id,
          room_number,
          sharing_type,
          rent_amount,
          created_at
      `,
      [
        propertyId,
        roomNumber,
        sharingType,
        rentAmount,
      ]
    );

    return res.status(201).json(result.rows[0]);
  })
);

// =====================================================
// BEDS - GET
// =====================================================

app.get(
  '/api/beds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          b.id,
          b.room_id,
          b.bed_number,
          b.is_occupied,

          r.room_number,

          p.id AS property_id,
          p.name AS property_name,

          t.id AS tenant_id,
          t.name AS tenant_name

        FROM beds b

        INNER JOIN rooms r
          ON r.id = b.room_id

        INNER JOIN properties p
          ON p.id = r.property_id

        LEFT JOIN tenants t
          ON t.bed_id = b.id
          AND LOWER(COALESCE(t.status, '')) = 'active'

        WHERE p.owner_id = $1

        ORDER BY
          p.id,
          r.room_number,
          b.bed_number
      `,
      [req.owner.id]
    );

    return res.json(result.rows);
  })
);

// =====================================================
// BEDS - CREATE
// =====================================================

app.post(
  '/api/beds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = Number(req.body?.room_id);
    const bedNumber = cleanString(req.body?.bed_number);

    if (!Number.isInteger(roomId) || roomId <= 0) {
      return sendError(
        res,
        400,
        'A valid room is required.'
      );
    }

    if (!bedNumber) {
      return sendError(
        res,
        400,
        'Bed number is required.'
      );
    }

    const roomResult = await query(
      `
        SELECT r.id
        FROM rooms r
        INNER JOIN properties p
          ON p.id = r.property_id
        WHERE r.id = $1
          AND p.owner_id = $2
        LIMIT 1
      `,
      [
        roomId,
        req.owner.id,
      ]
    );

    if (roomResult.rows.length === 0) {
      return sendError(
        res,
        403,
        'Room does not belong to your account.'
      );
    }

    const result = await query(
      `
        INSERT INTO beds (
          room_id,
          bed_number,
          is_occupied
        )
        VALUES (
          $1,
          $2,
          FALSE
        )
        RETURNING
          id,
          room_id,
          bed_number,
          is_occupied,
          created_at
      `,
      [
        roomId,
        bedNumber,
      ]
    );

    return res.status(201).json(result.rows[0]);
  })
);

// =====================================================
// TENANTS - GET
// =====================================================

app.get(
  '/api/tenants',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          t.id,
          t.name,
          t.phone,
          t.email,

          t.property_id,
          p.name AS property_name,

          t.room_id,
          r.room_number,

          t.bed_id,
          b.bed_number,

          t.monthly_rent,
          t.due_date,
          t.deposit_amount,
          t.move_in_date,
          t.move_out_date,
          t.status,
          t.created_at

        FROM tenants t

        INNER JOIN properties p
          ON p.id = t.property_id

        LEFT JOIN rooms r
          ON r.id = t.room_id

        LEFT JOIN beds b
          ON b.id = t.bed_id

        WHERE p.owner_id = $1

        ORDER BY t.id DESC
      `,
      [req.owner.id]
    );

    return res.json(
      result.rows.map((tenant) => ({
        ...tenant,
        monthly_rent: Number(
          tenant.monthly_rent || 0
        ),
        deposit_amount: Number(
          tenant.deposit_amount || 0
        ),
        due_date: Number(
          tenant.due_date || 5
        ),
      }))
    );
  })
);

// =====================================================
// TENANTS - CREATE
// =====================================================

app.post(
  '/api/tenants',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body?.name);
    const phone = cleanString(req.body?.phone);
    const email = cleanString(req.body?.email);

    const propertyId = Number(
      req.body?.property_id
    );

    const roomId =
      req.body?.room_id === null ||
      req.body?.room_id === undefined ||
      req.body?.room_id === ''
        ? null
        : Number(req.body.room_id);

    const bedId =
      req.body?.bed_id === null ||
      req.body?.bed_id === undefined ||
      req.body?.bed_id === ''
        ? null
        : Number(req.body.bed_id);

    const monthlyRent = toNumber(
      req.body?.monthly_rent,
      0
    );

    const dueDate = toNumber(
      req.body?.due_date,
      5
    );

    const depositAmount = toNumber(
      req.body?.deposit_amount,
      0
    );

    const moveInDate =
      cleanString(req.body?.move_in_date) || null;

    const status =
      cleanString(req.body?.status) || 'Active';

    if (!name) {
      return sendError(
        res,
        400,
        'Tenant name is required.'
      );
    }

    if (!phone) {
      return sendError(
        res,
        400,
        'Tenant phone is required.'
      );
    }

    if (!Number.isInteger(propertyId) || propertyId <= 0) {
      return sendError(
        res,
        400,
        'A valid property is required.'
      );
    }

    // -------------------------------------------------
    // Verify property ownership
    // -------------------------------------------------

    const propertyResult = await query(
      `
        SELECT id
        FROM properties
        WHERE id = $1
          AND owner_id = $2
        LIMIT 1
      `,
      [
        propertyId,
        req.owner.id,
      ]
    );

    if (propertyResult.rows.length === 0) {
      return sendError(
        res,
        403,
        'Property does not belong to your account.'
      );
    }

    // -------------------------------------------------
    // Verify room if supplied
    // -------------------------------------------------

    if (roomId !== null) {
      if (!Number.isInteger(roomId) || roomId <= 0) {
        return sendError(
          res,
          400,
          'Invalid room.'
        );
      }

      const roomResult = await query(
        `
          SELECT id
          FROM rooms
          WHERE id = $1
            AND property_id = $2
        `,
        [
          roomId,
          propertyId,
        ]
      );

      if (roomResult.rows.length === 0) {
        return sendError(
          res,
          400,
          'Selected room does not belong to the property.'
        );
      }
    }

    // -------------------------------------------------
    // Verify bed if supplied
    // -------------------------------------------------

    if (bedId !== null) {
      if (!Number.isInteger(bedId) || bedId <= 0) {
        return sendError(
          res,
          400,
          'Invalid bed.'
        );
      }

      const bedResult = await query(
        `
          SELECT b.id
          FROM beds b
          INNER JOIN rooms r
            ON r.id = b.room_id
          WHERE b.id = $1
            AND r.property_id = $2
        `,
        [
          bedId,
          propertyId,
        ]
      );

      if (bedResult.rows.length === 0) {
        return sendError(
          res,
          400,
          'Selected bed does not belong to the property.'
        );
      }

      const occupiedResult = await query(
        `
          SELECT id
          FROM tenants
          WHERE bed_id = $1
            AND LOWER(COALESCE(status, '')) = 'active'
          LIMIT 1
        `,
        [bedId]
      );

      if (occupiedResult.rows.length > 0) {
        return sendError(
          res,
          409,
          'This bed is already occupied.'
        );
      }
    }

    // -------------------------------------------------
    // Create tenant
    // -------------------------------------------------

    const result = await query(
      `
        INSERT INTO tenants (
          name,
          phone,
          email,
          property_id,
          room_id,
          bed_id,
          monthly_rent,
          due_date,
          deposit_amount,
          move_in_date,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11
        )
        RETURNING
          id,
          name,
          phone,
          email,
          property_id,
          room_id,
          bed_id,
          monthly_rent,
          due_date,
          deposit_amount,
          move_in_date,
          move_out_date,
          status,
          created_at
      `,
      [
        name,
        phone,
        email,
        propertyId,
        roomId,
        bedId,
        monthlyRent,
        dueDate,
        depositAmount,
        moveInDate,
        status,
      ]
    );

    // -------------------------------------------------
    // Mark selected bed occupied
    // -------------------------------------------------

    if (
      bedId !== null &&
      status.toLowerCase() === 'active'
    ) {
      await query(
        `
          UPDATE beds
          SET is_occupied = TRUE
          WHERE id = $1
        `,
        [bedId]
      );
    }

    return res.status(201).json(
      result.rows[0]
    );
  })
);

// =====================================================
// PAYMENTS - GET
// =====================================================

app.get(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          pay.id,
          pay.tenant_id,
          t.name AS tenant_name,

          pay.amount,
          pay.payment_date,
          pay.payment_method,
          pay.payment_month,
          pay.notes,

          p.name AS property_name,
          r.room_number

        FROM payments pay

        INNER JOIN tenants t
          ON t.id = pay.tenant_id

        INNER JOIN properties p
          ON p.id = t.property_id

        LEFT JOIN rooms r
          ON r.id = t.room_id

        WHERE p.owner_id = $1

        ORDER BY
          pay.payment_date DESC,
          pay.id DESC
      `,
      [req.owner.id]
    );

    return res.json(
      result.rows.map((payment) => ({
        ...payment,
        amount: Number(payment.amount || 0),
      }))
    );
  })
);

// =====================================================
// PAYMENTS - CREATE
// =====================================================

app.post(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = Number(
      req.body?.tenant_id
    );

    const amount = toNumber(
      req.body?.amount,
      0
    );

    const paymentDate =
      cleanString(req.body?.payment_date) ||
      null;

    const paymentMethod =
      cleanString(req.body?.payment_method) ||
      'UPI';

    const paymentMonth =
      cleanString(req.body?.payment_month);

    const notes =
      cleanString(req.body?.notes);

    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return sendError(
        res,
        400,
        'A valid tenant is required.'
      );
    }

    if (amount <= 0) {
      return sendError(
        res,
        400,
        'Payment amount must be greater than zero.'
      );
    }

    if (!paymentMonth) {
      return sendError(
        res,
        400,
        'Payment month is required.'
      );
    }

    const tenantResult = await query(
      `
        SELECT t.id
        FROM tenants t
        INNER JOIN properties p
          ON p.id = t.property_id
        WHERE t.id = $1
          AND p.owner_id = $2
        LIMIT 1
      `,
      [
        tenantId,
        req.owner.id,
      ]
    );

    if (tenantResult.rows.length === 0) {
      return sendError(
        res,
        403,
        'Tenant does not belong to your account.'
      );
    }

    let result;

    if (paymentDate) {
      result = await query(
        `
          INSERT INTO payments (
            tenant_id,
            amount,
            payment_date,
            payment_method,
            payment_month,
            notes
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5,
            $6
          )
          RETURNING *
        `,
        [
          tenantId,
          amount,
          paymentDate,
          paymentMethod,
          paymentMonth,
          notes,
        ]
      );
    } else {
      result = await query(
        `
          INSERT INTO payments (
            tenant_id,
            amount,
            payment_method,
            payment_month,
            notes
          )
          VALUES (
            $1,
            $2,
            $3,
            $4,
            $5
          )
          RETURNING *
        `,
        [
          tenantId,
          amount,
          paymentMethod,
          paymentMonth,
          notes,
        ]
      );
    }

    return res.status(201).json(
      result.rows[0]
    );
  })
);

// =====================================================
// INVOICES - GET
// =====================================================

app.get(
  '/api/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await query(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.tenant_id,
          t.name AS tenant_name,
          i.amount,
          i.month,
          i.due_date,
          i.status

        FROM invoices i

        INNER JOIN tenants t
          ON t.id = i.tenant_id

        INNER JOIN properties p
          ON p.id = t.property_id

        WHERE p.owner_id = $1

        ORDER BY
          i.id DESC
      `,
      [req.owner.id]
    );

    return res.json(
      result.rows.map((invoice) => ({
        ...invoice,
        amount: Number(invoice.amount || 0),
      }))
    );
  })
);

// =====================================================
// INVOICES - CREATE
// =====================================================

app.post(
  '/api/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const invoiceNumber =
      cleanString(req.body?.invoice_number);

    const tenantId = Number(
      req.body?.tenant_id
    );

    const amount = toNumber(
      req.body?.amount,
      0
    );

    const month =
      cleanString(req.body?.month) || null;

    const dueDate =
      cleanString(req.body?.due_date);

    const status =
      cleanString(req.body?.status) ||
      'Pending';

    if (!invoiceNumber) {
      return sendError(
        res,
        400,
        'Invoice number is required.'
      );
    }

    if (!Number.isInteger(tenantId) || tenantId <= 0) {
      return sendError(
        res,
        400,
        'A valid tenant is required.'
      );
    }

    if (amount <= 0) {
      return sendError(
        res,
        400,
        'Invoice amount must be greater than zero.'
      );
    }

    if (!dueDate) {
      return sendError(
        res,
        400,
        'Due date is required.'
      );
    }

    const tenantResult = await query(
      `
        SELECT t.id
        FROM tenants t
        INNER JOIN properties p
          ON p.id = t.property_id
        WHERE t.id = $1
          AND p.owner_id = $2
        LIMIT 1
      `,
      [
        tenantId,
        req.owner.id,
      ]
    );

    if (tenantResult.rows.length === 0) {
      return sendError(
        res,
        403,
        'Tenant does not belong to your account.'
      );
    }

    const result = await query(
      `
        INSERT INTO invoices (
          invoice_number,
          tenant_id,
          amount,
          month,
          due_date,
          status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6
        )
        RETURNING *
      `,
      [
        invoiceNumber,
        tenantId,
        amount,
        month,
        dueDate,
        status,
      ]
    );

    return res.status(201).json(
      result.rows[0]
    );
  })
);

// =====================================================
// FRONTEND
// =====================================================

function loginPage() {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <title>Peacely</title>

  <style>
    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      min-height: 100vh;
      font-family:
        Inter,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;

      background:
        linear-gradient(
          135deg,
          #f5f7ff 0%,
          #eef2ff 45%,
          #f8fafc 100%
        );

      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #172033;
    }

    .card {
      width: 100%;
      max-width: 430px;
      background: white;
      border-radius: 24px;
      padding: 32px;
      box-shadow:
        0 20px 60px rgba(15, 23, 42, 0.12);
    }

    .logo {
      width: 58px;
      height: 58px;
      border-radius: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 18px;
      background: #111827;
      color: white;
      font-size: 25px;
      font-weight: 800;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 30px;
    }

    p {
      color: #64748b;
      margin: 0 0 24px;
      line-height: 1.5;
    }

    label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 7px;
    }

    input {
      width: 100%;
      border: 1px solid #dbe1ea;
      border-radius: 12px;
      padding: 13px 14px;
      font-size: 15px;
      outline: none;
      margin-bottom: 16px;
    }

    input:focus {
      border-color: #6366f1;
      box-shadow:
        0 0 0 3px rgba(99, 102, 241, 0.12);
    }

    button {
      width: 100%;
      border: 0;
      border-radius: 12px;
      padding: 14px;
      background: #111827;
      color: white;
      font-size: 15px;
      font-weight: 700;
      cursor: pointer;
    }

    button:hover {
      opacity: 0.92;
    }

    .secondary {
      margin-top: 12px;
      background: #eef2ff;
      color: #3730a3;
    }

    .message {
      display: none;
      padding: 12px;
      border-radius: 10px;
      margin-bottom: 16px;
      font-size: 14px;
    }

    .error {
      display: block;
      background: #fef2f2;
      color: #b91c1c;
    }

    .success {
      display: block;
      background: #f0fdf4;
      color: #15803d;
    }

    .hidden {
      display: none;
    }

    .mode {
      margin-top: 18px;
      text-align: center;
      color: #64748b;
      font-size: 14px;
    }

    .mode button {
      width: auto;
      padding: 0;
      margin-left: 5px;
      background: transparent;
      color: #4f46e5;
      font-size: 14px;
    }
  </style>
</head>

<body>

  <div class="card">

    <div class="logo">P</div>

    <h1 id="title">Welcome to Peacely</h1>

    <p id="subtitle">
      Manage your PG properties, rooms, tenants and payments in one place.
    </p>

    <div id="message" class="message"></div>

    <div id="loginForm">

      <label>Email</label>

      <input
        id="loginEmail"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
      />

      <label>Password</label>

      <input
        id="loginPassword"
        type="password"
        placeholder="Enter your password"
        autocomplete="current-password"
      />

      <button onclick="login()">
        Login
      </button>

      <div class="mode">
        Don't have an account?
        <button onclick="showSignup()">
          Create account
        </button>
      </div>

    </div>

    <div id="signupForm" class="hidden">

      <label>Your name</label>

      <input
        id="signupName"
        type="text"
        placeholder="Your name"
        autocomplete="name"
      />

      <label>Email</label>

      <input
        id="signupEmail"
        type="email"
        placeholder="you@example.com"
        autocomplete="email"
      />

      <label>Phone</label>

      <input
        id="signupPhone"
        type="tel"
        placeholder="Phone number"
        autocomplete="tel"
      />

      <label>Password</label>

      <input
        id="signupPassword"
        type="password"
        placeholder="Minimum 6 characters"
        autocomplete="new-password"
      />

      <button onclick="signup()">
        Create account
      </button>

      <div class="mode">
        Already have an account?
        <button onclick="showLogin()">
          Login
        </button>
      </div>

    </div>

  </div>

<script>

function showMessage(message, type) {
  const box = document.getElementById('message');

  box.textContent = message;

  box.className =
    'message ' +
    (type === 'success'
      ? 'success'
      : 'error');
}

function showLogin() {
  document
    .getElementById('loginForm')
    .classList.remove('hidden');

  document
    .getElementById('signupForm')
    .classList.add('hidden');

  document.getElementById('title').textContent =
    'Welcome to Peacely';

  document.getElementById('subtitle').textContent =
    'Manage your PG properties, rooms, tenants and payments in one place.';

  document.getElementById('message').className =
    'message';
}

function showSignup() {
  document
    .getElementById('loginForm')
    .classList.add('hidden');

  document
    .getElementById('signupForm')
    .classList.remove('hidden');

  document.getElementById('title').textContent =
    'Create your Peacely account';

  document.getElementById('subtitle').textContent =
    'Start managing your properties in one simple place.';

  document.getElementById('message').className =
    'message';
}

async function login() {
  const email =
    document.getElementById('loginEmail').value.trim();

  const password =
    document.getElementById('loginPassword').value;

  if (!email || !password) {
    showMessage(
      'Please enter your email and password.',
      'error'
    );

    return;
  }

  try {
    const response = await fetch(
      '/api/auth/login',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        credentials: 'same-origin',

        body: JSON.stringify({
          email,
          password
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Login failed.'
      );
    }

    showMessage(
      'Login successful. Opening Peacely...',
      'success'
    );

    setTimeout(() => {
      window.location.href = '/';
    }, 400);

  } catch (error) {
    showMessage(
      error.message ||
      'Unable to login.',
      'error'
    );
  }
}

async function signup() {
  const name =
    document.getElementById('signupName').value.trim();

  const email =
    document.getElementById('signupEmail').value.trim();

  const phone =
    document.getElementById('signupPhone').value.trim();

  const password =
    document.getElementById('signupPassword').value;

  if (!name || !email || !password) {
    showMessage(
      'Please fill in your name, email and password.',
      'error'
    );

    return;
  }

  if (password.length < 6) {
    showMessage(
      'Password must be at least 6 characters.',
      'error'
    );

    return;
  }

  try {
    const response = await fetch(
      '/api/auth/signup',
      {
        method: 'POST',

        headers: {
          'Content-Type': 'application/json'
        },

        credentials: 'same-origin',

        body: JSON.stringify({
          name,
          email,
          phone,
          password
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error ||
        'Unable to create account.'
      );
    }

    showMessage(
      'Account created. Opening Peacely...',
      'success'
    );

    setTimeout(() => {
      window.location.href = '/';
    }, 400);

  } catch (error) {
    showMessage(
      error.message ||
      'Unable to create account.',
      'error'
    );
  }
}

</script>

</body>
</html>
  `;
}

// =====================================================
// STATIC FRONTEND
// =====================================================

app.use(
  express.static(DIST_DIR, {
    index: false,
  })
);

// =====================================================
// ROOT
// =====================================================

app.get(
  '/',
  asyncHandler(async (req, res) => {
    const owner = await getSessionOwner(req);

    if (!owner) {
      return res
        .status(200)
        .type('html')
        .send(loginPage());
    }

    return res.sendFile(
      path.join(DIST_DIR, 'index.html')
    );
  })
);

// =====================================================
// SPA FALLBACK
// =====================================================

app.get(
  '*',
  asyncHandler(async (req, res) => {
    // Never intercept API routes.
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({
        success: false,
        error: 'API route not found.',
      });
    }

    const owner = await getSessionOwner(req);

    if (!owner) {
      return res
        .status(200)
        .type('html')
        .send(loginPage());
    }

    return res.sendFile(
      path.join(DIST_DIR, 'index.html')
    );
  })
);

// =====================================================
// SERVER START
// =====================================================

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(
      PORT,
      '0.0.0.0',
      () => {
        console.log(
          `Peacely server running on port ${PORT}`
        );
      }
    );
  } catch (error) {
    console.error(
      'Failed to start Peacely server:',
      error
    );

    process.exit(1);
  }
}

startServer();

// =====================================================
// GRACEFUL SHUTDOWN
// =====================================================

async function shutdown(signal) {
  console.log(
    `${signal} received. Shutting down...`
  );

  try {
    await pool.end();

    process.exit(0);
  } catch (error) {
    console.error(
      'Shutdown error:',
      error
    );

    process.exit(1);
  }
}

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);
