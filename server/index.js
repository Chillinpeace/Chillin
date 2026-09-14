import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query, initializeDatabase } from './database.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT || 8080);

const SESSION_COOKIE = 'peacely_session';
const SESSION_DAYS = 30;
const QUERY_TIMEOUT_MS = 15000;

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// =====================================================
// HELPERS
// =====================================================

function cleanString(value) {
  return String(value ?? '').trim();
}

function normalizeEmail(value) {
  return cleanString(value).toLowerCase();
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

  for (const part of header.split(';')) {
    const index = part.indexOf('=');

    if (index === -1) {
      continue;
    }

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }

  return cookies;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_DAYS * 24 * 60 * 60;

  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(
      token,
    )}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax`,
  );
}

function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`,
  );
}

function sendError(res, status, message) {
  console.error(`API ERROR ${status}: ${message}`);

  if (res.headersSent) {
    return;
  }

  return res.status(status).json({
    success: false,
    error: message,
  });
}

/*
 * Prevent the frontend from being stuck forever on
 * "Saving..." if PostgreSQL ever hangs on a query.
 */
async function safeQuery(sql, params = []) {
  return Promise.race([
    query(sql, params),
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            'Database request timed out. Please try again.',
          ),
        );
      }, QUERY_TIMEOUT_MS);
    }),
  ]);
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      console.error('Unhandled route error:', error);

      if (!res.headersSent) {
        return sendError(
          res,
          500,
          error?.message || 'Internal server error.',
        );
      }
    }
  };
}

// =====================================================
// AUTH
// =====================================================

async function getSessionOwner(req) {
  try {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];

    if (!token) {
      return null;
    }

    const tokenHash = hashValue(token);

    const result = await safeQuery(
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
      [tokenHash],
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    console.error('Session lookup failed:', error);
    return null;
  }
}

async function requireAuth(req, res, next) {
  const owner = await getSessionOwner(req);

  if (!owner) {
    return sendError(
      res,
      401,
      'Authentication required. Please log in again.',
    );
  }

  req.owner = owner;
  next();
}

async function createSession(ownerId) {
  const token = createToken();
  const tokenHash = hashValue(token);

  await safeQuery(
    `
      DELETE FROM sessions
      WHERE owner_id = $1
         OR expires_at < CURRENT_TIMESTAMP
    `,
    [ownerId],
  );

  await safeQuery(
    `
      INSERT INTO sessions (
        owner_id,
        token_hash,
        expires_at
      )
      VALUES (
        $1,
        $2,
        CURRENT_TIMESTAMP + INTERVAL '30 days'
      )
    `,
    [ownerId, tokenHash],
  );

  return token;
}

// =====================================================
// HEALTH
// =====================================================

app.get(
  '/api/health',
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
      'SELECT NOW() AS now',
    );

    res.json({
      success: true,
      status: 'ok',
      database: 'connected',
      time: result.rows[0].now,
    });
  }),
);

// =====================================================
// AUTH - ME
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
  }),
);

// =====================================================
// AUTH - SIGNUP
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

    if (!email || !email.includes('@')) {
      return sendError(
        res,
        400,
        'Please enter a valid email address.',
      );
    }

    if (password.length < 6) {
      return sendError(
        res,
        400,
        'Password must be at least 6 characters.',
      );
    }

    const existing = await safeQuery(
      `
        SELECT id
        FROM owners
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
      `,
      [email],
    );

    if (existing.rows.length > 0) {
      return sendError(
        res,
        409,
        'An account with this email already exists.',
      );
    }

    const passwordHash = hashPassword(password);

    const result = await safeQuery(
      `
        INSERT INTO owners (
          name,
          email,
          phone,
          password_hash
        )
        VALUES ($1, $2, $3, $4)
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
      ],
    );

    const owner = result.rows[0];

    // First owner receives any old unassigned properties.
    const countResult = await safeQuery(
      `
        SELECT COUNT(*)::INTEGER AS count
        FROM owners
      `,
    );

    if (Number(countResult.rows[0].count) === 1) {
      await safeQuery(
        `
          UPDATE properties
          SET owner_id = $1
          WHERE owner_id IS NULL
        `,
        [owner.id],
      );
    }

    const token = await createSession(owner.id);

    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
      authenticated: true,
      owner,
    });
  }),
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
        'Email and password are required.',
      );
    }

    const result = await safeQuery(
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
      [email],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        401,
        'Invalid email or password.',
      );
    }

    const owner = result.rows[0];

    if (
      hashPassword(password) !==
      owner.password_hash
    ) {
      return sendError(
        res,
        401,
        'Invalid email or password.',
      );
    }

    const token = await createSession(owner.id);

    delete owner.password_hash;

    setSessionCookie(res, token);

    return res.json({
      success: true,
      authenticated: true,
      owner,
    });
  }),
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
      await safeQuery(
        `
          DELETE FROM sessions
          WHERE token_hash = $1
        `,
        [hashValue(token)],
      );
    }

    clearSessionCookie(res);

    res.json({
      success: true,
      authenticated: false,
    });
  }),
);

// =====================================================
// PROPERTIES
// =====================================================

app.get(
  '/api/properties',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
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
      [req.owner.id],
    );

    return res.json(
      result.rows.map((p) => {
        const beds = Number(p.bed_count || 0);
        const occupied = Number(
          p.occupied_bed_count || 0,
        );

        return {
          ...p,
          room_count: Number(p.room_count || 0),
          bed_count: beds,
          occupied_bed_count: occupied,
          tenant_count: Number(
            p.tenant_count || 0,
          ),
          monthly_revenue: Number(
            p.monthly_revenue || 0,
          ),
          occupancy_rate:
            beds > 0
              ? Math.round(
                  (occupied / beds) * 100,
                )
              : 0,
        };
      }),
    );
  }),
);

app.post(
  '/api/properties',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = cleanString(req.body?.name);
    const address = cleanString(
      req.body?.address,
    );

    if (!name) {
      return sendError(
        res,
        400,
        'Property name is required.',
      );
    }

    const result = await safeQuery(
      `
        INSERT INTO properties (
          name,
          address,
          owner_id
        )
        VALUES ($1, $2, $3)
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
      ],
    );

    return res.status(201).json(
      result.rows[0],
    );
  }),
);

// =====================================================
// ROOMS
// =====================================================

app.get(
  '/api/rooms',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
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
          r.property_id,
          r.room_number,
          r.sharing_type,
          r.rent_amount,
          r.created_at,
          p.name

        ORDER BY
          p.name,
          r.room_number
      `,
      [req.owner.id],
    );

    return res.json(
      result.rows.map((room) => ({
        ...room,
        rent_amount: Number(
          room.rent_amount || 0,
        ),
        bed_count: Number(
          room.bed_count || 0,
        ),
        occupied_bed_count: Number(
          room.occupied_bed_count || 0,
        ),
      })),
    );
  }),
);

app.post(
  '/api/rooms',
  requireAuth,
  asyncHandler(async (req, res) => {
    const propertyId = Number(
      req.body?.property_id,
    );

    const roomNumber = cleanString(
      req.body?.room_number,
    );

    const sharingType =
      cleanString(req.body?.sharing_type) ||
      'Single';

    const rentAmount = toNumber(
      req.body?.rent_amount,
      0,
    );

    console.log(
      'CREATE ROOM:',
      {
        owner: req.owner.id,
        propertyId,
        roomNumber,
        sharingType,
        rentAmount,
      },
    );

    if (
      !Number.isInteger(propertyId) ||
      propertyId <= 0
    ) {
      return sendError(
        res,
        400,
        'A valid property is required.',
      );
    }

    if (!roomNumber) {
      return sendError(
        res,
        400,
        'Room number is required.',
      );
    }

    const property = await safeQuery(
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
      ],
    );

    if (property.rows.length === 0) {
      return sendError(
        res,
        403,
        'Property does not belong to your account.',
      );
    }

    // Prevent duplicate room numbers gracefully.
    const duplicate = await safeQuery(
      `
        SELECT id
        FROM rooms
        WHERE property_id = $1
          AND LOWER(room_number) = LOWER($2)
        LIMIT 1
      `,
      [
        propertyId,
        roomNumber,
      ],
    );

    if (duplicate.rows.length > 0) {
      return sendError(
        res,
        409,
        `Room ${roomNumber} already exists in this property.`,
      );
    }

    const result = await safeQuery(
      `
        INSERT INTO rooms (
          property_id,
          room_number,
          sharing_type,
          rent_amount
        )
        VALUES ($1, $2, $3, $4)
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
      ],
    );

    console.log(
      `Room ${roomNumber} created successfully.`,
    );

    return res.status(201).json({
      success: true,
      ...result.rows[0],
    });
  }),
);

// =====================================================
// BEDS
// =====================================================

app.get(
  '/api/beds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
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
          AND LOWER(
            COALESCE(t.status, '')
          ) = 'active'

        WHERE p.owner_id = $1

        ORDER BY
          p.id,
          r.room_number,
          b.bed_number
      `,
      [req.owner.id],
    );

    return res.json(result.rows);
  }),
);

app.post(
  '/api/beds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId = Number(
      req.body?.room_id,
    );

    const bedNumber = cleanString(
      req.body?.bed_number,
    );

    if (
      !Number.isInteger(roomId) ||
      roomId <= 0
    ) {
      return sendError(
        res,
        400,
        'A valid room is required.',
      );
    }

    if (!bedNumber) {
      return sendError(
        res,
        400,
        'Bed number is required.',
      );
    }

    const room = await safeQuery(
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
      ],
    );

    if (room.rows.length === 0) {
      return sendError(
        res,
        403,
        'Room does not belong to your account.',
      );
    }

    const duplicate = await safeQuery(
      `
        SELECT id
        FROM beds
        WHERE room_id = $1
          AND LOWER(bed_number) = LOWER($2)
        LIMIT 1
      `,
      [
        roomId,
        bedNumber,
      ],
    );

    if (duplicate.rows.length > 0) {
      return sendError(
        res,
        409,
        `Bed ${bedNumber} already exists in this room.`,
      );
    }

    const result = await safeQuery(
      `
        INSERT INTO beds (
          room_id,
          bed_number,
          is_occupied
        )
        VALUES ($1, $2, FALSE)
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
      ],
    );

    return res.status(201).json({
      success: true,
      ...result.rows[0],
    });
  }),
);

// =====================================================
// TENANTS
// =====================================================

app.get(
  '/api/tenants',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
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
      [req.owner.id],
    );

    return res.json(
      result.rows.map((tenant) => ({
        ...tenant,
        monthly_rent: Number(
          tenant.monthly_rent || 0,
        ),
        due_date: Number(
          tenant.due_date || 5,
        ),
        deposit_amount: Number(
          tenant.deposit_amount || 0,
        ),
      })),
    );
  }),
);

app.post(
  '/api/tenants',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = cleanString(
      req.body?.name,
    );

    const phone = cleanString(
      req.body?.phone,
    );

    const email = cleanString(
      req.body?.email,
    );

    const propertyId = Number(
      req.body?.property_id,
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
      0,
    );

    const dueDate = toNumber(
      req.body?.due_date,
      5,
    );

    const depositAmount = toNumber(
      req.body?.deposit_amount,
      0,
    );

    const moveInDate =
      cleanString(
        req.body?.move_in_date,
      ) || null;

    const status =
      cleanString(req.body?.status) ||
      'Active';

    if (!name) {
      return sendError(
        res,
        400,
        'Tenant name is required.',
      );
    }

    if (!phone) {
      return sendError(
        res,
        400,
        'Tenant phone is required.',
      );
    }

    if (
      !Number.isInteger(propertyId) ||
      propertyId <= 0
    ) {
      return sendError(
        res,
        400,
        'A valid property is required.',
      );
    }

    const property = await safeQuery(
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
      ],
    );

    if (property.rows.length === 0) {
      return sendError(
        res,
        403,
        'Property does not belong to your account.',
      );
    }

    if (roomId !== null) {
      const room = await safeQuery(
        `
          SELECT id
          FROM rooms
          WHERE id = $1
            AND property_id = $2
          LIMIT 1
        `,
        [
          roomId,
          propertyId,
        ],
      );

      if (room.rows.length === 0) {
        return sendError(
          res,
          400,
          'Selected room does not belong to the property.',
        );
      }
    }

    if (bedId !== null) {
      const bed = await safeQuery(
        `
          SELECT b.id
          FROM beds b
          INNER JOIN rooms r
            ON r.id = b.room_id
          WHERE b.id = $1
            AND r.property_id = $2
          LIMIT 1
        `,
        [
          bedId,
          propertyId,
        ],
      );

      if (bed.rows.length === 0) {
        return sendError(
          res,
          400,
          'Selected bed does not belong to the property.',
        );
      }

      const occupied = await safeQuery(
        `
          SELECT id
          FROM tenants
          WHERE bed_id = $1
            AND LOWER(
              COALESCE(status, '')
            ) = 'active'
          LIMIT 1
        `,
        [bedId],
      );

      if (occupied.rows.length > 0) {
        return sendError(
          res,
          409,
          'This bed is already occupied.',
        );
      }
    }

    const result = await safeQuery(
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
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11
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
      ],
    );

    if (
      bedId !== null &&
      status.toLowerCase() === 'active'
    ) {
      await safeQuery(
        `
          UPDATE beds
          SET is_occupied = TRUE
          WHERE id = $1
        `,
        [bedId],
      );
    }

    return res.status(201).json({
      success: true,
      ...result.rows[0],
    });
  }),
);

// =====================================================
// PAYMENTS
// =====================================================

app.get(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
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
      [req.owner.id],
    );

    return res.json(
      result.rows.map((payment) => ({
        ...payment,
        amount: Number(
          payment.amount || 0,
        ),
      })),
    );
  }),
);

app.post(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = Number(
      req.body?.tenant_id,
    );

    const amount = toNumber(
      req.body?.amount,
      0,
    );

    const paymentDate =
      cleanString(
        req.body?.payment_date,
      ) || null;

    const paymentMethod =
      cleanString(
        req.body?.payment_method,
      ) || 'UPI';

    const paymentMonth = cleanString(
      req.body?.payment_month,
    );

    const notes = cleanString(
      req.body?.notes,
    );

    if (
      !Number.isInteger(tenantId) ||
      tenantId <= 0
    ) {
      return sendError(
        res,
        400,
        'A valid tenant is required.',
      );
    }

    if (amount <= 0) {
      return sendError(
        res,
        400,
        'Payment amount must be greater than zero.',
      );
    }

    if (!paymentMonth) {
      return sendError(
        res,
        400,
        'Payment month is required.',
      );
    }

    const tenant = await safeQuery(
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
      ],
    );

    if (tenant.rows.length === 0) {
      return sendError(
        res,
        403,
        'Tenant does not belong to your account.',
      );
    }

    let result;

    if (paymentDate) {
      result = await safeQuery(
        `
          INSERT INTO payments (
            tenant_id,
            amount,
            payment_date,
            payment_method,
            payment_month,
            notes
          )
          VALUES ($1,$2,$3,$4,$5,$6)
          RETURNING *
        `,
        [
          tenantId,
          amount,
          paymentDate,
          paymentMethod,
          paymentMonth,
          notes,
        ],
      );
    } else {
      result = await safeQuery(
        `
          INSERT INTO payments (
            tenant_id,
            amount,
            payment_method,
            payment_month,
            notes
          )
          VALUES ($1,$2,$3,$4,$5)
          RETURNING *
        `,
        [
          tenantId,
          amount,
          paymentMethod,
          paymentMonth,
          notes,
        ],
      );
    }

    return res.status(201).json({
      success: true,
      ...result.rows[0],
    });
  }),
);

// =====================================================
// INVOICES
// =====================================================

app.get(
  '/api/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const result = await safeQuery(
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

        ORDER BY i.id DESC
      `,
      [req.owner.id],
    );

    return res.json(
      result.rows.map((invoice) => ({
        ...invoice,
        amount: Number(
          invoice.amount || 0,
        ),
      })),
    );
  }),
);

app.post(
  '/api/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId = Number(
      req.body?.tenant_id,
    );

    const amount = toNumber(
      req.body?.amount,
      0,
    );

    const month =
      cleanString(req.body?.month) ||
      null;

    const dueDate = cleanString(
      req.body?.due_date,
    );

    const status =
      cleanString(req.body?.status) ||
      'Pending';

    if (
      !Number.isInteger(tenantId) ||
      tenantId <= 0
    ) {
      return sendError(
        res,
        400,
        'A valid tenant is required.',
      );
    }

    if (amount <= 0) {
      return sendError(
        res,
        400,
        'Invoice amount must be greater than zero.',
      );
    }

    if (!dueDate) {
      return sendError(
        res,
        400,
        'Due date is required.',
      );
    }

    const tenant = await safeQuery(
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
      ],
    );

    if (tenant.rows.length === 0) {
      return sendError(
        res,
        403,
        'Tenant does not belong to your account.',
      );
    }

    // Automatically generate invoice number.
    const invoiceNumber =
      `INV-${Date.now()}-${crypto
        .randomBytes(3)
        .toString('hex')
        .toUpperCase()}`;

    const result = await safeQuery(
      `
        INSERT INTO invoices (
          invoice_number,
          tenant_id,
          amount,
          month,
          due_date,
          status
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        RETURNING *
      `,
      [
        invoiceNumber,
        tenantId,
        amount,
        month,
        dueDate,
        status,
      ],
    );

    return res.status(201).json({
      success: true,
      ...result.rows[0],
    });
  }),
);

// =====================================================
// FRONTEND
// =====================================================

app.use(express.static(DIST_DIR));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found.',
    });
  }

  return res.sendFile(
    path.join(DIST_DIR, 'index.html'),
  );
});

// =====================================================
// SERVER START
// =====================================================

async function startServer() {
  try {
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `Peacely server running on port ${PORT}`,
      );
    });
  } catch (error) {
    console.error(
      'Failed to start Peacely server:',
      error,
    );

    process.exit(1);
  }
}

startServer();
