import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { pool, query, initializeDatabase } from './database.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, '..', 'dist');

const PORT = Number(process.env.PORT || 8080);

const SESSION_COOKIE = 'peacely_session';
const SESSION_DAYS = 30;
const QUERY_TIMEOUT_MS = 15000;

app.use(express.json({ limit: '3mb' }));
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
// FINANCE HELPERS
// =====================================================

async function refreshInvoiceStatus(invoiceId) {
  const normalizedInvoiceId = Number(invoiceId);

  const invoiceResult = await safeQuery(
    `
      SELECT
        id,
        amount,
        due_date,
        status,
        paid_at
      FROM invoices
      WHERE id = $1::integer
      LIMIT 1
    `,
    [normalizedInvoiceId],
  );

  if (invoiceResult.rows.length === 0) {
    return null;
  }

  const invoice = invoiceResult.rows[0];

  if (
    cleanString(invoice.status).toLowerCase() ===
    'cancelled'
  ) {
    return invoice;
  }

  const paymentResult = await safeQuery(
    `
      SELECT
        COALESCE(SUM(amount), 0) AS paid_amount
      FROM payments
      WHERE invoice_id = $1::integer
    `,
    [normalizedInvoiceId],
  );

  const paidAmount = Number(
    paymentResult.rows[0]?.paid_amount || 0,
  );

  const invoiceAmount = Number(
    invoice.amount || 0,
  );

  let status = 'Pending';
  let paidAt = null;

  if (
    paidAmount >= invoiceAmount &&
    invoiceAmount > 0
  ) {
    status = 'Paid';

    paidAt =
      invoice.paid_at ||
      new Date();
  } else if (
    invoice.due_date &&
    new Date(
      `${invoice.due_date}T23:59:59`,
    ) < new Date()
  ) {
    status = 'Overdue';
  } else if (paidAmount > 0) {
    status = 'Partially Paid';
  }

  await safeQuery(
    `
      UPDATE invoices
      SET
        paid_amount = $1::numeric,
        status = $2::varchar,
        paid_at = CASE
          WHEN $2::varchar = 'Paid'
            THEN COALESCE(
              paid_at,
              CURRENT_TIMESTAMP
            )
          ELSE NULL
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $3::integer
    `,
    [
      paidAmount,
      status,
      normalizedInvoiceId,
    ],
  );

  return {
    ...invoice,
    paid_amount: paidAmount,
    status,
    paid_at: paidAt,
  };
}

async function refreshAllInvoiceStatuses(ownerId) {
  const result = await safeQuery(
    `
      SELECT i.id
      FROM invoices i
      INNER JOIN tenants t
        ON t.id = i.tenant_id
      INNER JOIN properties p
        ON p.id = t.property_id
      WHERE p.owner_id = $1
        AND LOWER(
          COALESCE(i.status, '')
        ) <> 'cancelled'
    `,
    [ownerId],
  );

  for (const row of result.rows) {
    try {
      await refreshInvoiceStatus(row.id);
    } catch (error) {
      console.error(
        `Failed to refresh invoice ${row.id}:`,
        error,
      );
    }
  }
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
    console.error(
      'Session lookup failed:',
      error,
    );

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
    const email = normalizeEmail(
      req.body?.email,
    );
    const phone = cleanString(
      req.body?.phone,
    );
    const password = String(
      req.body?.password || '',
    );

    if (!name) {
      return sendError(
        res,
        400,
        'Name is required.',
      );
    }

    if (
      !email ||
      !email.includes('@')
    ) {
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

    const passwordHash =
      hashPassword(password);

    const result = await safeQuery(
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
      ],
    );

    const owner = result.rows[0];

    const token =
      await createSession(owner.id);

    setSessionCookie(res, token);

    return res.status(201).json({
      success: true,
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
    const email = normalizeEmail(
      req.body?.email,
    );
    const password = String(
      req.body?.password || '',
    );

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

    const passwordHash =
      hashPassword(password);

    if (
      passwordHash !==
      owner.password_hash
    ) {
      return sendError(
        res,
        401,
        'Invalid email or password.',
      );
    }

    const token =
      await createSession(owner.id);

    setSessionCookie(res, token);

    return res.json({
      success: true,
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
// AUTH - LOGOUT
// =====================================================

app.post(
  '/api/auth/logout',
  asyncHandler(async (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE];

    if (token) {
      const tokenHash =
        hashValue(token);

      await safeQuery(
        `
          DELETE FROM sessions
          WHERE token_hash = $1
        `,
        [tokenHash],
      );
    }

    clearSessionCookie(res);

    return res.json({
      success: true,
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

          COALESCE(
            rooms.room_count,
            0
          )::INTEGER AS room_count,

          COALESCE(
            rooms.bed_count,
            0
          )::INTEGER AS bed_count,

          COALESCE(
            rooms.occupied_bed_count,
            0
          )::INTEGER AS occupied_bed_count,

          COALESCE(
            tenants.active_tenant_count,
            0
          )::INTEGER AS active_tenant_count,

          COALESCE(
            tenants.monthly_revenue,
            0
          ) AS monthly_revenue

        FROM properties p

        LEFT JOIN (
          SELECT
            r.property_id,

            COUNT(
              DISTINCT r.id
            ) AS room_count,

            COUNT(
              b.id
            ) AS bed_count,

            COUNT(
              b.id
            ) FILTER (
              WHERE b.is_occupied = TRUE
            ) AS occupied_bed_count

          FROM rooms r

          LEFT JOIN beds b
            ON b.room_id = r.id

          GROUP BY
            r.property_id
        ) rooms
          ON rooms.property_id = p.id

        LEFT JOIN (
          SELECT
            t.property_id,

            COUNT(*) FILTER (
              WHERE LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) = 'active'
            ) AS active_tenant_count,

            COALESCE(
              SUM(t.monthly_rent) FILTER (
                WHERE LOWER(
                  COALESCE(
                    t.status,
                    ''
                  )
                ) = 'active'
              ),
              0
            ) AS monthly_revenue

          FROM tenants t

          GROUP BY
            t.property_id
        ) tenants
          ON tenants.property_id = p.id

        WHERE p.owner_id = $1

        ORDER BY
          p.created_at DESC,
          p.id DESC
      `,
      [req.owner.id],
    );

    return res.json({
      success: true,
      properties:
        result.rows.map((row) => ({
          ...row,
          monthly_revenue:
            Number(
              row.monthly_revenue || 0,
            ),
        })),
    });
  }),
);

// =====================================================
// CREATE PROPERTY
// =====================================================

app.post(
  '/api/properties',
  requireAuth,
  asyncHandler(async (req, res) => {
    const name = cleanString(
      req.body?.name,
    );

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
        VALUES (
          $1,
          $2,
          $3
        )
        RETURNING
          id,
          name,
          address,
          created_at
      `,
      [
        name,
        address,
        req.owner.id,
      ],
    );

    return res.status(201).json({
      success: true,
      property:
        result.rows[0],
    });
  }),
);

// =====================================================
// EDIT PROPERTY
// =====================================================

app.patch(
  '/api/properties/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const propertyId =
      Number(req.params.id);

    if (!Number.isInteger(propertyId)) {
      return sendError(
        res,
        400,
        'Invalid property ID.',
      );
    }

    const name = cleanString(
      req.body?.name,
    );

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
        UPDATE properties
        SET
          name = $1,
          address = $2
        WHERE id = $3
          AND owner_id = $4
        RETURNING
          id,
          name,
          address,
          created_at
      `,
      [
        name,
        address,
        propertyId,
        req.owner.id,
      ],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        404,
        'Property not found.',
      );
    }

    return res.json({
      success: true,
      property:
        result.rows[0],
    });
  }),
);

// =====================================================
// DELETE PROPERTY
// =====================================================

app.delete(
  '/api/properties/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const propertyId =
      Number(req.params.id);

    if (!Number.isInteger(propertyId)) {
      return sendError(
        res,
        400,
        'Invalid property ID.',
      );
    }

    const result = await safeQuery(
      `
        DELETE FROM properties
        WHERE id = $1
          AND owner_id = $2
        RETURNING id
      `,
      [
        propertyId,
        req.owner.id,
      ],
    );

    if (result.rows.length === 0) {
      return sendError(
        res,
        404,
        'Property not found.',
      );
    }

    return res.json({
      success: true,
    });
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

          COUNT(b.id) FILTER (
            WHERE b.is_occupied = TRUE
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

    return res.json({
      success: true,
      rooms:
        result.rows.map((row) => ({
          ...row,
          rent_amount:
            Number(
              row.rent_amount || 0,
            ),
        })),
    });
  }),
);

// =====================================================
// CREATE ROOM
// =====================================================

app.post(
  '/api/rooms',
  requireAuth,
  asyncHandler(async (req, res) => {
    const propertyId =
      Number(
        req.body?.property_id,
      );

    const roomNumber =
      cleanString(
        req.body?.room_number,
      );

    const sharingType =
      cleanString(
        req.body?.sharing_type ||
          'Single',
      );

    const rentAmount =
      toNumber(
        req.body?.rent_amount,
        0,
      );

    if (!Number.isInteger(propertyId)) {
      return sendError(
        res,
        400,
        'Property is required.',
      );
    }

    if (!roomNumber) {
      return sendError(
        res,
        400,
        'Room number is required.',
      );
    }

    if (rentAmount < 0) {
      return sendError(
        res,
        400,
        'Rent cannot be negative.',
      );
    }

    const property =
      await safeQuery(
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
        404,
        'Property not found.',
      );
    }

    const duplicate =
      await safeQuery(
        `
          SELECT id
          FROM rooms
          WHERE property_id = $1
            AND LOWER(room_number)
              = LOWER($2)
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
        'A room with this number already exists in this property.',
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
      ],
    );

    return res.status(201).json({
      success: true,
      room:
        result.rows[0],
    });
  }),
);

// =====================================================
// EDIT ROOM
// =====================================================

app.patch(
  '/api/rooms/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId =
      Number(req.params.id);

    const roomNumber =
      cleanString(
        req.body?.room_number,
      );

    const sharingType =
      cleanString(
        req.body?.sharing_type ||
          'Single',
      );

    const rentAmount =
      toNumber(
        req.body?.rent_amount,
        0,
      );

    if (!Number.isInteger(roomId)) {
      return sendError(
        res,
        400,
        'Invalid room ID.',
      );
    }

    if (!roomNumber) {
      return sendError(
        res,
        400,
        'Room number is required.',
      );
    }

    if (rentAmount < 0) {
      return sendError(
        res,
        400,
        'Rent cannot be negative.',
      );
    }

    const room =
      await safeQuery(
        `
          SELECT
            r.id,
            r.property_id
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
        404,
        'Room not found.',
      );
    }

    const propertyId =
      room.rows[0].property_id;

    const duplicate =
      await safeQuery(
        `
          SELECT id
          FROM rooms
          WHERE property_id = $1
            AND LOWER(room_number)
              = LOWER($2)
            AND id <> $3
          LIMIT 1
        `,
        [
          propertyId,
          roomNumber,
          roomId,
        ],
      );

    if (duplicate.rows.length > 0) {
      return sendError(
        res,
        409,
        'A room with this number already exists in this property.',
      );
    }

    const result = await safeQuery(
      `
        UPDATE rooms
        SET
          room_number = $1,
          sharing_type = $2,
          rent_amount = $3
        WHERE id = $4
        RETURNING
          id,
          property_id,
          room_number,
          sharing_type,
          rent_amount,
          created_at
      `,
      [
        roomNumber,
        sharingType,
        rentAmount,
        roomId,
      ],
    );

    return res.json({
      success: true,
      room:
        result.rows[0],
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
          b.created_at,

          r.room_number,
          r.property_id,

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
           COALESCE(
             t.status,
             ''
           )
         ) = 'active'

        WHERE p.owner_id = $1

        ORDER BY
          p.name,
          r.room_number,
          b.bed_number
      `,
      [req.owner.id],
    );

    return res.json({
      success: true,
      beds:
        result.rows,
    });
  }),
);

// =====================================================
// CREATE BED
// =====================================================

app.post(
  '/api/beds',
  requireAuth,
  asyncHandler(async (req, res) => {
    const roomId =
      Number(
        req.body?.room_id,
      );

    const bedNumber =
      cleanString(
        req.body?.bed_number,
      );

    if (!Number.isInteger(roomId)) {
      return sendError(
        res,
        400,
        'Room is required.',
      );
    }

    if (!bedNumber) {
      return sendError(
        res,
        400,
        'Bed number is required.',
      );
    }

    const room =
      await safeQuery(
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
        404,
        'Room not found.',
      );
    }

    const duplicate =
      await safeQuery(
        `
          SELECT id
          FROM beds
          WHERE room_id = $1
            AND LOWER(bed_number)
              = LOWER($2)
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
        'A bed with this number already exists in this room.',
      );
    }

    const result = await safeQuery(
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
      ],
    );

    return res.status(201).json({
      success: true,
      bed:
        result.rows[0],
    });
  }),
);

// =====================================================
// EDIT BED
// =====================================================

app.patch(
  '/api/beds/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const bedId =
      Number(req.params.id);

    const bedNumber =
      cleanString(
        req.body?.bed_number,
      );

    if (!Number.isInteger(bedId)) {
      return sendError(
        res,
        400,
        'Invalid bed ID.',
      );
    }

    if (!bedNumber) {
      return sendError(
        res,
        400,
        'Bed number is required.',
      );
    }

    const bed =
      await safeQuery(
        `
          SELECT
            b.id,
            b.room_id
          FROM beds b
          INNER JOIN rooms r
            ON r.id = b.room_id
          INNER JOIN properties p
            ON p.id = r.property_id
          WHERE b.id = $1
            AND p.owner_id = $2
          LIMIT 1
        `,
        [
          bedId,
          req.owner.id,
        ],
      );

    if (bed.rows.length === 0) {
      return sendError(
        res,
        404,
        'Bed not found.',
      );
    }

    const roomId =
      bed.rows[0].room_id;

    const duplicate =
      await safeQuery(
        `
          SELECT id
          FROM beds
          WHERE room_id = $1
            AND LOWER(bed_number)
              = LOWER($2)
            AND id <> $3
          LIMIT 1
        `,
        [
          roomId,
          bedNumber,
          bedId,
        ],
      );

    if (duplicate.rows.length > 0) {
      return sendError(
        res,
        409,
        'A bed with this number already exists in this room.',
      );
    }

    const result = await safeQuery(
      `
        UPDATE beds
        SET
          bed_number = $1
        WHERE id = $2
        RETURNING
          id,
          room_id,
          bed_number,
          is_occupied,
          created_at
      `,
      [
        bedNumber,
        bedId,
      ],
    );

    return res.json({
      success: true,
      bed:
        result.rows[0],
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
    await refreshAllInvoiceStatuses(
      req.owner.id,
    );

    const result = await safeQuery(
      `
        SELECT
          t.id,
          t.name,
          t.phone,
          t.email,
          t.gender,
          t.id_proof_type,
          t.id_photo_front,
          t.id_photo_back,
          t.property_id,
          t.room_id,
          t.bed_id,
          t.monthly_rent,
          t.due_date,
          t.deposit_amount,
          t.move_in_date,
          t.move_out_date,
          t.status,
          t.created_at,

          p.name AS property_name,

          r.room_number,

          b.bed_number,

          COALESCE(
            finance.total_invoiced,
            0
          ) AS total_invoiced,

          COALESCE(
            finance.total_paid,
            0
          ) AS total_paid,

          COALESCE(
            finance.outstanding_balance,
            0
          ) AS outstanding_balance,

          COALESCE(
            finance.overdue_balance,
            0
          ) AS overdue_balance

        FROM tenants t

        INNER JOIN properties p
          ON p.id = t.property_id

        LEFT JOIN rooms r
          ON r.id = t.room_id

        LEFT JOIN beds b
          ON b.id = t.bed_id

        LEFT JOIN (
          SELECT
            i.tenant_id,

            COALESCE(
              SUM(i.amount),
              0
            ) AS total_invoiced,

            COALESCE(
              SUM(i.paid_amount),
              0
            ) AS total_paid,

            COALESCE(
              SUM(
                GREATEST(
                  i.amount -
                  COALESCE(
                    i.paid_amount,
                    0
                  ),
                  0
                )
              ),
              0
            ) AS outstanding_balance,

            COALESCE(
              SUM(
                GREATEST(
                  i.amount -
                  COALESCE(
                    i.paid_amount,
                    0
                  ),
                  0
                )
              ) FILTER (
                WHERE LOWER(
                  COALESCE(
                    i.status,
                    ''
                  )
                ) = 'overdue'
              ),
              0
            ) AS overdue_balance

          FROM invoices i

          WHERE LOWER(
            COALESCE(
              i.status,
              ''
            )
          ) <> 'cancelled'

          GROUP BY
            i.tenant_id
        ) finance
          ON finance.tenant_id = t.id

        WHERE p.owner_id = $1

        ORDER BY
          CASE
            WHEN LOWER(
              COALESCE(
                t.status,
                ''
              )
            ) = 'active'
            THEN 0
            ELSE 1
          END,
          t.name
      `,
      [req.owner.id],
    );

    return res.json({
      success: true,
      tenants:
        result.rows.map((row) => ({
          ...row,
          monthly_rent:
            Number(
              row.monthly_rent || 0,
            ),
          deposit_amount:
            Number(
              row.deposit_amount || 0,
            ),
          total_invoiced:
            Number(
              row.total_invoiced || 0,
            ),
          total_paid:
            Number(
              row.total_paid || 0,
            ),
          outstanding_balance:
            Number(
              row.outstanding_balance ||
                0,
            ),
          overdue_balance:
            Number(
              row.overdue_balance ||
                0,
            ),
        })),
    });
  }),
);

// =====================================================
// TENANT PROFILE
// =====================================================

app.get(
  '/api/tenants/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId =
      Number(req.params.id);

    if (!Number.isInteger(tenantId)) {
      return sendError(
        res,
        400,
        'Invalid tenant ID.',
      );
    }

    await refreshAllInvoiceStatuses(
      req.owner.id,
    );

    const tenantResult =
      await safeQuery(
        `
          SELECT
            t.*,
            p.name AS property_name,
            p.address AS property_address,
            r.room_number,
            b.bed_number

          FROM tenants t

          INNER JOIN properties p
            ON p.id = t.property_id

          LEFT JOIN rooms r
            ON r.id = t.room_id

          LEFT JOIN beds b
            ON b.id = t.bed_id

          WHERE t.id = $1
            AND p.owner_id = $2

          LIMIT 1
        `,
        [
          tenantId,
          req.owner.id,
        ],
      );

    if (tenantResult.rows.length === 0) {
      return sendError(
        res,
        404,
        'Tenant not found.',
      );
    }

    const invoiceResult =
      await safeQuery(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.amount,
            i.month,
            i.due_date,
            i.status,
            i.paid_amount,
            i.delivery_status,
            i.sent_at,
            i.paid_at,
            i.created_at,

            GREATEST(
              i.amount -
              COALESCE(
                i.paid_amount,
                0
              ),
              0
            ) AS balance_amount

          FROM invoices i

          WHERE i.tenant_id = $1

          ORDER BY
            i.due_date DESC,
            i.id DESC
        `,
        [tenantId],
      );

    const paymentResult =
      await safeQuery(
        `
          SELECT
            pay.id,
            pay.amount,
            pay.payment_date,
            pay.payment_method,
            pay.payment_month,
            pay.notes,
            pay.invoice_id,
            i.invoice_number

          FROM payments pay

          LEFT JOIN invoices i
            ON i.id = pay.invoice_id

          WHERE pay.tenant_id = $1

          ORDER BY
            pay.payment_date DESC,
            pay.id DESC
        `,
        [tenantId],
      );

    return res.json({
      success: true,
      tenant: {
        ...tenantResult.rows[0],
        monthly_rent:
          Number(
            tenantResult.rows[0]
              .monthly_rent || 0,
          ),
        deposit_amount:
          Number(
            tenantResult.rows[0]
              .deposit_amount || 0,
          ),
      },
      invoices:
        invoiceResult.rows.map(
          (row) => ({
            ...row,
            amount:
              Number(
                row.amount || 0,
              ),
            paid_amount:
              Number(
                row.paid_amount || 0,
              ),
            balance_amount:
              Number(
                row.balance_amount ||
                  0,
              ),
          }),
        ),
      payments:
        paymentResult.rows.map(
          (row) => ({
            ...row,
            amount:
              Number(
                row.amount || 0,
              ),
          }),
        ),
    });
  }),
);

// =====================================================
// CREATE TENANT
// =====================================================

app.post(
  '/api/tenants',
  requireAuth,
  asyncHandler(async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const name = cleanString(
        req.body?.name,
      );

      const phone = cleanString(
        req.body?.phone,
      );

      const email = cleanString(
        req.body?.email,
      );

      const gender = cleanString(
        req.body?.gender,
      );

      const idProofType = cleanString(
        req.body?.id_proof_type,
      );

      const idPhotoFront = cleanString(
        req.body?.id_photo_front,
      );

      const idPhotoBack = cleanString(
        req.body?.id_photo_back,
      );

      const propertyId =
        Number(
          req.body?.property_id,
        );

      const roomId =
        req.body?.room_id
          ? Number(
              req.body.room_id,
            )
          : null;

      const bedId =
        req.body?.bed_id
          ? Number(
              req.body.bed_id,
            )
          : null;

      const monthlyRent =
        toNumber(
          req.body?.monthly_rent,
          0,
        );

      const dueDate =
        Number(
          req.body?.due_date || 5,
        );

      const depositAmount =
        toNumber(
          req.body?.deposit_amount,
          0,
        );

      const moveInDate =
        req.body?.move_in_date ||
        null;

      const moveOutDate =
        req.body?.move_out_date ||
        null;

      if (!name) {
        throw new Error(
          'Tenant name is required.',
        );
      }

      if (!phone) {
        throw new Error(
          'Tenant phone is required.',
        );
      }

      if (!gender) {
        throw new Error(
          'Tenant gender is required.',
        );
      }

      if (!idProofType) {
        throw new Error(
          'ID proof type is required.',
        );
      }

      if (!idPhotoFront || !idPhotoBack) {
        throw new Error(
          'Both front and back ID photos are required.',
        );
      }

      if (
        !Number.isInteger(
          propertyId,
        )
      ) {
        throw new Error(
          'Property is required.',
        );
      }

      if (
        monthlyRent < 0 ||
        depositAmount < 0
      ) {
        throw new Error(
          'Rent and deposit cannot be negative.',
        );
      }

      if (
        !Number.isInteger(
          dueDate,
        ) ||
        dueDate < 1 ||
        dueDate > 28
      ) {
        throw new Error(
          'Due date must be between 1 and 28.',
        );
      }

      const propertyResult =
        await client.query(
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

      if (
        propertyResult.rows
          .length === 0
      ) {
        throw new Error(
          'Property not found.',
        );
      }

      if (roomId !== null) {
        const roomResult =
          await client.query(
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

        if (
          roomResult.rows
            .length === 0
        ) {
          throw new Error(
            'Selected room does not belong to the selected property.',
          );
        }
      }

      if (bedId !== null) {
        const bedResult =
          await client.query(
            `
              SELECT
                b.id,
                b.room_id,
                b.is_occupied
              FROM beds b
              INNER JOIN rooms r
                ON r.id = b.room_id
              WHERE b.id = $1
                AND r.property_id = $2
              FOR UPDATE
            `,
            [
              bedId,
              propertyId,
            ],
          );

        if (
          bedResult.rows
            .length === 0
        ) {
          throw new Error(
            'Selected bed does not belong to the selected property.',
          );
        }

        if (
          bedResult.rows[0]
            .is_occupied
        ) {
          throw new Error(
            'Selected bed is already occupied.',
          );
        }

        if (
          roomId !== null &&
          Number(
            bedResult.rows[0]
              .room_id,
          ) !== roomId
        ) {
          throw new Error(
            'Selected bed does not belong to the selected room.',
          );
        }
      }

      const tenantResult =
        await client.query(
          `
            INSERT INTO tenants (
              name,
              phone,
              email,
              gender,
              id_proof_type,
              id_photo_front,
              id_photo_back,
              property_id,
              room_id,
              bed_id,
              monthly_rent,
              due_date,
              deposit_amount,
              move_in_date,
              move_out_date,
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
              $11,
              $12,
              $13,
              $14,
              $15,
              'Active'
            )
            RETURNING *
          `,
          [
            name,
            phone,
            email,
            gender,
            idProofType,
            idPhotoFront,
            idPhotoBack,
            propertyId,
            roomId,
            bedId,
            monthlyRent,
            dueDate,
            depositAmount,
            moveInDate,
            moveOutDate,
          ],
        );

      if (bedId !== null) {
        await client.query(
          `
            UPDATE beds
            SET is_occupied = TRUE
            WHERE id = $1
          `,
          [bedId],
        );
      }

      await client.query(
        'COMMIT',
      );

      return res.status(201).json({
        success: true,
        tenant:
          tenantResult.rows[0],
      });
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      return sendError(
        res,
        400,
        error?.message ||
          'Unable to create tenant.',
      );
    } finally {
      client.release();
    }
  }),
);

// =====================================================
// EDIT TENANT
// =====================================================

app.patch(
  '/api/tenants/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId =
      Number(req.params.id);

    if (!Number.isInteger(tenantId)) {
      return sendError(
        res,
        400,
        'Invalid tenant ID.',
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const existingResult =
        await client.query(
          `
            SELECT
              t.*,
              p.owner_id
            FROM tenants t
            INNER JOIN properties p
              ON p.id = t.property_id
            WHERE t.id = $1
              AND p.owner_id = $2
            FOR UPDATE
          `,
          [
            tenantId,
            req.owner.id,
          ],
        );

      if (
        existingResult.rows
          .length === 0
      ) {
        await client.query(
          'ROLLBACK',
        );

        return sendError(
          res,
          404,
          'Tenant not found.',
        );
      }

      const existing =
        existingResult.rows[0];

      const name = cleanString(
        req.body?.name,
      );

      const phone = cleanString(
        req.body?.phone,
      );

      const email = cleanString(
        req.body?.email,
      );

      const propertyId =
        Number(
          req.body?.property_id ??
            existing.property_id,
        );

      const roomId =
        req.body?.room_id ===
        null
          ? null
          : Number(
              req.body?.room_id ??
                existing.room_id,
            );

      const bedId =
        req.body?.bed_id ===
        null
          ? null
          : Number(
              req.body?.bed_id ??
                existing.bed_id,
            );

      const monthlyRent =
        toNumber(
          req.body?.monthly_rent ??
            existing.monthly_rent,
          0,
        );

      const dueDate =
        Number(
          req.body?.due_date ??
            existing.due_date ??
            5,
        );

      const depositAmount =
        toNumber(
          req.body?.deposit_amount ??
            existing.deposit_amount,
          0,
        );

      const moveInDate =
        req.body?.move_in_date ??
        existing.move_in_date ??
        null;

      const moveOutDate =
        req.body?.move_out_date ??
        existing.move_out_date ??
        null;

      const status =
        cleanString(
          req.body?.status ??
            existing.status ??
            'Active',
        ) || 'Active';

      if (!name) {
        throw new Error(
          'Tenant name is required.',
        );
      }

      if (!phone) {
        throw new Error(
          'Tenant phone is required.',
        );
      }

      if (
        !Number.isInteger(
          propertyId,
        )
      ) {
        throw new Error(
          'Property is required.',
        );
      }

      if (
        monthlyRent < 0 ||
        depositAmount < 0
      ) {
        throw new Error(
          'Rent and deposit cannot be negative.',
        );
      }

      if (
        !Number.isInteger(
          dueDate,
        ) ||
        dueDate < 1 ||
        dueDate > 28
      ) {
        throw new Error(
          'Due date must be between 1 and 28.',
        );
      }

      const propertyResult =
        await client.query(
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

      if (
        propertyResult.rows
          .length === 0
      ) {
        throw new Error(
          'Property not found.',
        );
      }

      if (
        roomId !== null &&
        !Number.isInteger(roomId)
      ) {
        throw new Error(
          'Invalid room.',
        );
      }

      if (
        bedId !== null &&
        !Number.isInteger(bedId)
      ) {
        throw new Error(
          'Invalid bed.',
        );
      }

      if (roomId !== null) {
        const roomResult =
          await client.query(
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

        if (
          roomResult.rows
            .length === 0
        ) {
          throw new Error(
            'Selected room does not belong to the selected property.',
          );
        }
      }

      if (bedId !== null) {
        const bedResult =
          await client.query(
            `
              SELECT
                b.id,
                b.room_id,
                b.is_occupied,
                b.id = $2 AS is_current_bed
              FROM beds b
              INNER JOIN rooms r
                ON r.id = b.room_id
              WHERE b.id = $1
                AND r.property_id = $3
              FOR UPDATE
            `,
            [
              bedId,
              existing.bed_id,
              propertyId,
            ],
          );

        if (
          bedResult.rows
            .length === 0
        ) {
          throw new Error(
            'Selected bed does not belong to the selected property.',
          );
        }

        const selectedBed =
          bedResult.rows[0];

        if (
          selectedBed.is_occupied &&
          !selectedBed.is_current_bed
        ) {
          throw new Error(
            'Selected bed is already occupied.',
          );
        }

        if (
          roomId !== null &&
          Number(
            selectedBed.room_id,
          ) !== roomId
        ) {
          throw new Error(
            'Selected bed does not belong to the selected room.',
          );
        }
      }

      const oldBedId =
        existing.bed_id
          ? Number(
              existing.bed_id,
            )
          : null;

      const newBedId =
        bedId !== null
          ? Number(bedId)
          : null;

      if (
        oldBedId !== null &&
        oldBedId !== newBedId
      ) {
        await client.query(
          `
            UPDATE beds
            SET is_occupied = FALSE
            WHERE id = $1
          `,
          [oldBedId],
        );
      }

      if (newBedId !== null) {
        await client.query(
          `
            UPDATE beds
            SET is_occupied = TRUE
            WHERE id = $1
          `,
          [newBedId],
        );
      }

      const tenantResult =
        await client.query(
          `
            UPDATE tenants
            SET
              name = $1,
              phone = $2,
              email = $3,
              property_id = $4,
              room_id = $5,
              bed_id = $6,
              monthly_rent = $7,
              due_date = $8,
              deposit_amount = $9,
              move_in_date = $10,
              move_out_date = $11,
              status = $12
            WHERE id = $13
            RETURNING *
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
            moveOutDate,
            status,
            tenantId,
          ],
        );

      await client.query(
        'COMMIT',
      );

      return res.json({
        success: true,
        tenant:
          tenantResult.rows[0],
      });
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      return sendError(
        res,
        400,
        error?.message ||
          'Unable to update tenant.',
      );
    } finally {
      client.release();
    }
  }),
);

// =====================================================
// TENANT REASSIGN
// =====================================================

app.patch(
  '/api/tenants/:id/reassign',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId =
      Number(req.params.id);

    const propertyId =
      Number(
        req.body?.property_id,
      );

    const roomId =
      req.body?.room_id
        ? Number(
            req.body.room_id,
          )
        : null;

    const bedId =
      req.body?.bed_id
        ? Number(
            req.body.bed_id,
          )
        : null;

    if (!Number.isInteger(tenantId)) {
      return sendError(
        res,
        400,
        'Invalid tenant ID.',
      );
    }

    if (!Number.isInteger(propertyId)) {
      return sendError(
        res,
        400,
        'Property is required.',
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const tenantResult =
        await client.query(
          `
            SELECT
              t.id,
              t.bed_id
            FROM tenants t
            INNER JOIN properties p
              ON p.id = t.property_id
            WHERE t.id = $1
              AND p.owner_id = $2
            FOR UPDATE
          `,
          [
            tenantId,
            req.owner.id,
          ],
        );

      if (
        tenantResult.rows
          .length === 0
      ) {
        throw new Error(
          'Tenant not found.',
        );
      }

      const tenant =
        tenantResult.rows[0];

      const propertyResult =
        await client.query(
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

      if (
        propertyResult.rows
          .length === 0
      ) {
        throw new Error(
          'Property not found.',
        );
      }

      if (roomId !== null) {
        const roomResult =
          await client.query(
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

        if (
          roomResult.rows
            .length === 0
        ) {
          throw new Error(
            'Selected room does not belong to the selected property.',
          );
        }
      }

      if (bedId !== null) {
        const bedResult =
          await client.query(
            `
              SELECT
                b.id,
                b.room_id,
                b.is_occupied
              FROM beds b
              INNER JOIN rooms r
                ON r.id = b.room_id
              WHERE b.id = $1
                AND r.property_id = $2
              FOR UPDATE
            `,
            [
              bedId,
              propertyId,
            ],
          );

        if (
          bedResult.rows
            .length === 0
        ) {
          throw new Error(
            'Selected bed does not belong to the selected property.',
          );
        }

        if (
          bedResult.rows[0]
            .is_occupied &&
          Number(
            tenant.bed_id,
          ) !== bedId
        ) {
          throw new Error(
            'Selected bed is already occupied.',
          );
        }

        if (
          roomId !== null &&
          Number(
            bedResult.rows[0]
              .room_id,
          ) !== roomId
        ) {
          throw new Error(
            'Selected bed does not belong to the selected room.',
          );
        }
      }

      if (
        tenant.bed_id &&
        Number(
          tenant.bed_id,
        ) !== bedId
      ) {
        await client.query(
          `
            UPDATE beds
            SET is_occupied = FALSE
            WHERE id = $1
          `,
          [
            tenant.bed_id,
          ],
        );
      }

      if (bedId !== null) {
        await client.query(
          `
            UPDATE beds
            SET is_occupied = TRUE
            WHERE id = $1
          `,
          [bedId],
        );
      }

      const result =
        await client.query(
          `
            UPDATE tenants
            SET
              property_id = $1,
              room_id = $2,
              bed_id = $3
            WHERE id = $4
            RETURNING *
          `,
          [
            propertyId,
            roomId,
            bedId,
            tenantId,
          ],
        );

      await client.query(
        'COMMIT',
      );

      return res.json({
        success: true,
        tenant:
          result.rows[0],
      });
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      return sendError(
        res,
        400,
        error?.message ||
          'Unable to reassign tenant.',
      );
    } finally {
      client.release();
    }
  }),
);

// =====================================================
// TENANT MOVE OUT
// =====================================================

app.patch(
  '/api/tenants/:id/move-out',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId =
      Number(req.params.id);

    const moveOutDate =
      cleanString(
        req.body?.move_out_date,
      );

    if (!Number.isInteger(tenantId)) {
      return sendError(
        res,
        400,
        'Invalid tenant ID.',
      );
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(moveOutDate)) {
      return sendError(
        res,
        400,
        'Move-out date must be in YYYY-MM-DD format.',
      );
    }

    const parsedMoveOut =
      new Date(
        `${moveOutDate}T00:00:00Z`,
      );

    if (
      Number.isNaN(
        parsedMoveOut.getTime(),
      ) ||
      parsedMoveOut
        .toISOString()
        .slice(0, 10) !==
        moveOutDate
    ) {
      return sendError(
        res,
        400,
        'Please enter a valid calendar date.',
      );
    }

    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const tenantResult =
        await client.query(
          `
            SELECT
              t.id,
              t.bed_id
            FROM tenants t
            INNER JOIN properties p
              ON p.id = t.property_id
            WHERE t.id = $1
              AND p.owner_id = $2
            FOR UPDATE
          `,
          [
            tenantId,
            req.owner.id,
          ],
        );

      if (
        tenantResult.rows
          .length === 0
      ) {
        throw new Error(
          'Tenant not found.',
        );
      }

      const tenant =
        tenantResult.rows[0];

      await client.query(
        `
          UPDATE tenants
          SET
            move_out_date = $1::date,
            status = 'Inactive'
          WHERE id = $2
        `,
        [
          moveOutDate,
          tenantId,
        ],
      );

      if (tenant.bed_id) {
        await client.query(
          `
            UPDATE beds
            SET is_occupied = FALSE
            WHERE id = $1
          `,
          [
            tenant.bed_id,
          ],
        );
      }

      await client.query(
        'COMMIT',
      );

      return res.json({
        success: true,
      });
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      return sendError(
        res,
        400,
        error?.message ||
          'Unable to move out tenant.',
      );
    } finally {
      client.release();
    }
  }),
);

// =====================================================
// INVOICES
// =====================================================

app.get(
  '/api/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    await refreshAllInvoiceStatuses(
      req.owner.id,
    );

    const result = await safeQuery(
      `
        SELECT
          i.id,
          i.invoice_number,
          i.tenant_id,
          i.amount,
          i.month,
          i.due_date,
          i.status,
          i.paid_amount,
          i.delivery_status,
          i.sent_at,
          i.paid_at,
          i.created_at,
          i.updated_at,

          t.name AS tenant_name,

          p.id AS property_id,
          p.name AS property_name,

          GREATEST(
            i.amount -
            COALESCE(
              i.paid_amount,
              0
            ),
            0
          ) AS balance_amount

        FROM invoices i

        INNER JOIN tenants t
          ON t.id = i.tenant_id

        INNER JOIN properties p
          ON p.id = t.property_id

        WHERE p.owner_id = $1

        ORDER BY
          i.due_date DESC,
          i.id DESC
      `,
      [req.owner.id],
    );

    return res.json({
      success: true,
      invoices:
        result.rows.map(
          (row) => ({
            ...row,
            amount:
              Number(
                row.amount || 0,
              ),
            paid_amount:
              Number(
                row.paid_amount || 0,
              ),
            balance_amount:
              Number(
                row.balance_amount ||
                  0,
              ),
          }),
        ),
    });
  }),
);

// =====================================================
// CREATE INVOICE
// =====================================================

app.post(
  '/api/invoices',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenantId =
      Number(
        req.body?.tenant_id,
      );

    const amount =
      toNumber(
        req.body?.amount,
        0,
      );

    const month =
      cleanString(
        req.body?.month,
      );

    const dueDate =
      cleanString(
        req.body?.due_date,
      );

    if (!Number.isInteger(tenantId)) {
      return sendError(
        res,
        400,
        'Tenant is required.',
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

    const tenantResult =
      await safeQuery(
        `
          SELECT
            t.id
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

    if (
      tenantResult.rows.length === 0
    ) {
      return sendError(
        res,
        404,
        'Tenant not found.',
      );
    }

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
          status,
          paid_amount,
          delivery_status
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5::date,
          'Pending',
          0,
          'Not Sent'
        )
        RETURNING *
      `,
      [
        invoiceNumber,
        tenantId,
        amount,
        month,
        dueDate,
      ],
    );

    return res.status(201).json({
      success: true,
      invoice:
        result.rows[0],
    });
  }),
);

// =====================================================
// PAYMENT HISTORY
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
          pay.invoice_id,
          pay.amount,
          pay.payment_date,
          pay.payment_method,
          pay.payment_month,
          pay.notes,

          t.name AS tenant_name,

          i.invoice_number,

          p.id AS property_id,
          p.name AS property_name

        FROM payments pay

        INNER JOIN tenants t
          ON t.id = pay.tenant_id

        INNER JOIN properties p
          ON p.id = t.property_id

        LEFT JOIN invoices i
          ON i.id = pay.invoice_id

        WHERE p.owner_id = $1

        ORDER BY
          pay.payment_date DESC,
          pay.id DESC
      `,
      [req.owner.id],
    );

    return res.json({
      success: true,
      payments:
        result.rows.map(
          (row) => ({
            ...row,
            amount:
              Number(
                row.amount || 0,
              ),
          }),
        ),
    });
  }),
);

// =====================================================
// CREATE PAYMENT
// =====================================================

app.post(
  '/api/payments',
  requireAuth,
  asyncHandler(async (req, res) => {
    const client =
      await pool.connect();

    try {
      await client.query(
        'BEGIN',
      );

      const tenantId =
        Number(
          req.body?.tenant_id,
        );

      const invoiceId =
        Number(
          req.body?.invoice_id,
        );

      const amount =
        toNumber(
          req.body?.amount,
          0,
        );

      const paymentDate =
        cleanString(
          req.body?.payment_date,
        ) ||
        new Date()
          .toISOString()
          .slice(0, 10);

      const paymentMethod =
        cleanString(
          req.body?.payment_method ||
            'UPI',
        );

      const paymentMonth =
        cleanString(
          req.body?.payment_month,
        );

      const notes =
        cleanString(
          req.body?.notes,
        );

      if (!Number.isInteger(tenantId)) {
        throw new Error(
          'Tenant is required.',
        );
      }

      if (!Number.isInteger(invoiceId)) {
        throw new Error(
          'Invoice is required.',
        );
      }

      if (amount <= 0) {
        throw new Error(
          'Payment amount must be greater than zero.',
        );
      }

      const invoiceResult =
        await client.query(
          `
            SELECT
              i.id,
              i.tenant_id,
              i.amount,
              i.status,
              i.paid_amount,

              GREATEST(
                i.amount -
                COALESCE(
                  i.paid_amount,
                  0
                ),
                0
              ) AS balance_amount

            FROM invoices i

            INNER JOIN tenants t
              ON t.id = i.tenant_id

            INNER JOIN properties p
              ON p.id = t.property_id

            WHERE i.id = $1
              AND i.tenant_id = $2
              AND p.owner_id = $3

            FOR UPDATE
          `,
          [
            invoiceId,
            tenantId,
            req.owner.id,
          ],
        );

      if (
        invoiceResult.rows
          .length === 0
      ) {
        throw new Error(
          'Invoice not found or does not belong to this tenant.',
        );
      }

      const invoice =
        invoiceResult.rows[0];

      if (
        cleanString(
          invoice.status,
        ).toLowerCase() ===
        'cancelled'
      ) {
        throw new Error(
          'Cancelled invoices cannot receive payments.',
        );
      }

      const balance =
        Number(
          invoice.amount || 0,
        ) -
        Number(
          invoice.paid_amount ||
            0,
        );

      if (amount > balance + 0.00001) {
        throw new Error(
          `Payment exceeds the remaining invoice balance of ${balance.toFixed(
            2,
          )}.`,
        );
      }

      const paymentResult =
        await client.query(
          `
            INSERT INTO payments (
              tenant_id,
              invoice_id,
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
              $4::date,
              $5,
              $6,
              $7
            )
            RETURNING *
          `,
          [
            tenantId,
            invoiceId,
            amount,
            paymentDate,
            paymentMethod,
            paymentMonth,
            notes,
          ],
        );

      const paidAmountResult =
        await client.query(
          `
            SELECT
              COALESCE(
                SUM(amount),
                0
              ) AS paid_amount
            FROM payments
            WHERE invoice_id = $1
          `,
          [invoiceId],
        );

      const paidAmount =
        Number(
          paidAmountResult
            .rows[0]
            ?.paid_amount || 0,
        );

      const invoiceAmount =
        Number(
          invoice.amount || 0,
        );

      let status = 'Pending';

      if (
        paidAmount >=
          invoiceAmount &&
        invoiceAmount > 0
      ) {
        status = 'Paid';
      } else if (
        paidAmount > 0
      ) {
        status = 'Partially Paid';
      } else if (
        invoice.status ===
        'Overdue'
      ) {
        status = 'Overdue';
      }

      if (
        status !== 'Paid' &&
        invoice.status !==
          'Cancelled' &&
        invoice.status ===
          'Overdue' &&
        paidAmount === 0
      ) {
        status = 'Overdue';
      }

      await client.query(
        `
          UPDATE invoices
          SET
            paid_amount = $1,
            status = $2,
            paid_at = CASE
              WHEN $2 = 'Paid'
                THEN COALESCE(
                  paid_at,
                  CURRENT_TIMESTAMP
                )
              ELSE NULL
            END,
            updated_at =
              CURRENT_TIMESTAMP
          WHERE id = $3
        `,
        [
          paidAmount,
          status,
          invoiceId,
        ],
      );

      await client.query(
        'COMMIT',
      );

      return res.status(201).json({
        success: true,
        payment:
          paymentResult.rows[0],
        invoice: {
          id: invoiceId,
          amount:
            invoiceAmount,
          paid_amount:
            paidAmount,
          balance_amount:
            Math.max(
              invoiceAmount -
                paidAmount,
              0,
            ),
          status,
        },
      });
    } catch (error) {
      await client.query(
        'ROLLBACK',
      );

      return sendError(
        res,
        400,
        error?.message ||
          'Unable to save payment.',
      );
    } finally {
      client.release();
    }
  }),
);

// =====================================================
// FINANCE SUMMARY
// =====================================================

app.get(
  '/api/finance/summary',
  requireAuth,
  asyncHandler(async (req, res) => {
    await refreshAllInvoiceStatuses(
      req.owner.id,
    );

    const result = await safeQuery(
      `
        SELECT
          COALESCE(
            SUM(i.amount),
            0
          ) AS expected,

          COALESCE(
            SUM(i.paid_amount),
            0
          ) AS collected,

          COALESCE(
            SUM(
              GREATEST(
                i.amount -
                COALESCE(
                  i.paid_amount,
                  0
                ),
                0
              )
            ),
            0
          ) AS pending,

          COALESCE(
            SUM(
              GREATEST(
                i.amount -
                COALESCE(
                  i.paid_amount,
                  0
                ),
                0
              )
            ) FILTER (
              WHERE LOWER(
                COALESCE(
                  i.status,
                  ''
                )
              ) = 'overdue'
            ),
            0
          ) AS overdue,

          COUNT(*)::INTEGER
            AS invoice_count,

          COUNT(*) FILTER (
            WHERE LOWER(
              COALESCE(
                i.status,
                ''
              )
            ) = 'paid'
          )::INTEGER
            AS paid_invoice_count,

          COUNT(*) FILTER (
            WHERE LOWER(
              COALESCE(
                i.status,
                ''
              )
            ) = 'overdue'
          )::INTEGER
            AS overdue_invoice_count,

          COUNT(*) FILTER (
            WHERE LOWER(
              COALESCE(
                i.delivery_status,
                ''
              )
            ) = 'sent'
          )::INTEGER
            AS sent_invoice_count

        FROM invoices i

        INNER JOIN tenants t
          ON t.id = i.tenant_id

        INNER JOIN properties p
          ON p.id = t.property_id

        WHERE p.owner_id = $1

          AND LOWER(
            COALESCE(
              i.status,
              ''
            )
          ) <> 'cancelled'
      `,
      [req.owner.id],
    );

    const row =
      result.rows[0];

    const expected =
      Number(row.expected || 0);

    const collected =
      Number(row.collected || 0);

    return res.json({
      success: true,

      expected,

      collected,

      pending: Number(
        row.pending || 0,
      ),

      overdue: Number(
        row.overdue || 0,
      ),

      invoice_count: Number(
        row.invoice_count || 0,
      ),

      paid_invoice_count:
        Number(
          row.paid_invoice_count ||
            0,
        ),

      overdue_invoice_count:
        Number(
          row.overdue_invoice_count ||
            0,
        ),

      sent_invoice_count:
        Number(
          row.sent_invoice_count ||
            0,
        ),

      collection_rate:
        expected > 0
          ? Math.round(
              (collected / expected) *
                100,
            )
          : 0,
    });
  }),
);

// =====================================================
// DASHBOARD / ANALYTICS
// =====================================================

app.get(
  '/api/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    await refreshAllInvoiceStatuses(
      req.owner.id,
    );

    const [
      portfolio,
      finance,
      recentPayments,
      recentInvoices,
      moveOuts,
    ] = await Promise.all([
      safeQuery(
        `
          SELECT
            COUNT(
              DISTINCT p.id
            )::INTEGER AS properties,

            COUNT(
              DISTINCT r.id
            )::INTEGER AS rooms,

            COUNT(
              DISTINCT b.id
            )::INTEGER AS beds,

            COUNT(
              DISTINCT b.id
            ) FILTER (
              WHERE b.is_occupied = TRUE
            )::INTEGER AS occupied_beds,

            COUNT(
              DISTINCT t.id
            ) FILTER (
              WHERE LOWER(
                COALESCE(
                  t.status,
                  ''
                )
              ) = 'active'
            )::INTEGER AS active_tenants

          FROM properties p

          LEFT JOIN rooms r
            ON r.property_id = p.id

          LEFT JOIN beds b
            ON b.room_id = r.id

          LEFT JOIN tenants t
            ON t.property_id = p.id

          WHERE p.owner_id = $1
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            COALESCE(
              SUM(i.amount),
              0
            ) AS expected,

            COALESCE(
              SUM(i.paid_amount),
              0
            ) AS collected,

            COALESCE(
              SUM(
                GREATEST(
                  i.amount -
                  COALESCE(
                    i.paid_amount,
                    0
                  ),
                  0
                )
              ),
              0
            ) AS outstanding,

            COALESCE(
              SUM(
                GREATEST(
                  i.amount -
                  COALESCE(
                    i.paid_amount,
                    0
                  ),
                  0
                )
              ) FILTER (
                WHERE LOWER(
                  i.status
                ) = 'overdue'
              ),
              0
            ) AS overdue

          FROM invoices i

          INNER JOIN tenants t
            ON t.id = i.tenant_id

          INNER JOIN properties p
            ON p.id = t.property_id

          WHERE p.owner_id = $1

            AND LOWER(
              COALESCE(
                i.status,
                ''
              )
            ) <> 'cancelled'
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            pay.id,
            pay.tenant_id,
            pay.invoice_id,
            t.name AS tenant_name,
            p.name AS property_name,
            pay.amount,
            pay.payment_date,
            pay.payment_method

          FROM payments pay

          INNER JOIN tenants t
            ON t.id = pay.tenant_id

          INNER JOIN properties p
            ON p.id = t.property_id

          WHERE p.owner_id = $1

          ORDER BY
            pay.payment_date DESC,
            pay.id DESC

          LIMIT 8
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            i.id,
            i.invoice_number,
            i.tenant_id,
            t.name AS tenant_name,
            i.amount,
            i.month,
            i.due_date,
            i.status,
            i.paid_amount,

            GREATEST(
              i.amount -
              COALESCE(
                i.paid_amount,
                0
              ),
              0
            ) AS balance_amount

          FROM invoices i

          INNER JOIN tenants t
            ON t.id = i.tenant_id

          INNER JOIN properties p
            ON p.id = t.property_id

          WHERE p.owner_id = $1

          ORDER BY
            i.created_at DESC,
            i.id DESC

          LIMIT 8
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            t.id,
            t.name,
            t.move_out_date,
            t.property_id,
            p.name AS property_name,
            r.room_number

          FROM tenants t

          INNER JOIN properties p
            ON p.id = t.property_id

          LEFT JOIN rooms r
            ON r.id = t.room_id

          WHERE p.owner_id = $1

            AND LOWER(
              COALESCE(
                t.status,
                ''
              )
            ) = 'active'

            AND t.move_out_date IS NOT NULL

          ORDER BY
            t.move_out_date ASC

          LIMIT 8
        `,
        [req.owner.id],
      ),
    ]);

    const p =
      portfolio.rows[0] || {};

    const f =
      finance.rows[0] || {};

    const beds =
      Number(
        p.beds || 0,
      );

    const occupied =
      Number(
        p.occupied_beds || 0,
      );

    const expected =
      Number(
        f.expected || 0,
      );

    const collected =
      Number(
        f.collected || 0,
      );

    return res.json({
      success: true,

      portfolio: {
        properties:
          Number(
            p.properties || 0,
          ),

        rooms:
          Number(
            p.rooms || 0,
          ),

        beds,

        occupied_beds:
          occupied,

        available_beds:
          Math.max(
            beds - occupied,
            0,
          ),

        active_tenants:
          Number(
            p.active_tenants || 0,
          ),

        occupancy_rate:
          beds
            ? Math.round(
                (occupied / beds) *
                  100,
              )
            : 0,
      },

      finance: {
        expected,

        collected,

        outstanding:
          Number(
            f.outstanding || 0,
          ),

        overdue:
          Number(
            f.overdue || 0,
          ),

        collection_rate:
          expected
            ? Math.min(
                Math.round(
                  (collected /
                    expected) *
                    100,
                ),
                100,
              )
            : 0,
      },

      recent_payments:
        recentPayments.rows.map(
          (x) => ({
            ...x,
            amount:
              Number(
                x.amount || 0,
              ),
          }),
        ),

      recent_invoices:
        recentInvoices.rows.map(
          (x) => ({
            ...x,
            amount:
              Number(
                x.amount || 0,
              ),
            paid_amount:
              Number(
                x.paid_amount || 0,
              ),
            balance_amount:
              Number(
                x.balance_amount ||
                  0,
              ),
          }),
        ),

      upcoming_move_outs:
        moveOuts.rows,
    });
  }),
);

app.get(
  '/api/analytics',
  requireAuth,
  asyncHandler(async (req, res) => {
    await refreshAllInvoiceStatuses(
      req.owner.id,
    );

    const [
      monthly,
      property,
      methods,
      occupancy,
    ] = await Promise.all([
      safeQuery(
        `
          SELECT
            COALESCE(
              i.month,
              TO_CHAR(
                i.due_date,
                'Mon YYYY'
              )
            ) AS month,

            COALESCE(
              SUM(i.amount),
              0
            ) AS expected,

            COALESCE(
              SUM(i.paid_amount),
              0
            ) AS collected,

            COALESCE(
              SUM(
                GREATEST(
                  i.amount -
                  COALESCE(
                    i.paid_amount,
                    0
                  ),
                  0
                )
              ),
              0
            ) AS outstanding

          FROM invoices i

          INNER JOIN tenants t
            ON t.id = i.tenant_id

          INNER JOIN properties p
            ON p.id = t.property_id

          WHERE p.owner_id = $1

            AND LOWER(
              COALESCE(
                i.status,
                ''
              )
            ) <> 'cancelled'

          GROUP BY
            COALESCE(
              i.month,
              TO_CHAR(
                i.due_date,
                'Mon YYYY'
              )
            )

          ORDER BY
            MIN(i.due_date) DESC

          LIMIT 12
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            p.id,
            p.name,

            COALESCE(
              rm.rooms,
              0
            )::INTEGER AS rooms,

            COALESCE(
              rm.beds,
              0
            )::INTEGER AS beds,

            COALESCE(
              rm.occupied_beds,
              0
            )::INTEGER AS occupied_beds,

            COALESCE(
              ta.active_tenants,
              0
            )::INTEGER AS active_tenants,

            COALESCE(
              ta.monthly_revenue,
              0
            ) AS monthly_revenue

          FROM properties p

          LEFT JOIN (
            SELECT
              r.property_id,

              COUNT(
                DISTINCT r.id
              ) AS rooms,

              COUNT(
                b.id
              ) AS beds,

              COUNT(
                b.id
              ) FILTER (
                WHERE b.is_occupied =
                  TRUE
              ) AS occupied_beds

            FROM rooms r

            LEFT JOIN beds b
              ON b.room_id = r.id

            GROUP BY
              r.property_id
          ) rm
            ON rm.property_id =
              p.id

          LEFT JOIN (
            SELECT
              t.property_id,

              COUNT(*) FILTER (
                WHERE LOWER(
                  COALESCE(
                    t.status,
                    ''
                  )
                ) = 'active'
              ) AS active_tenants,

              COALESCE(
                SUM(
                  t.monthly_rent
                ) FILTER (
                  WHERE LOWER(
                    COALESCE(
                      t.status,
                      ''
                    )
                  ) = 'active'
                ),
                0
              ) AS monthly_revenue

            FROM tenants t

            GROUP BY
              t.property_id
          ) ta
            ON ta.property_id =
              p.id

          WHERE p.owner_id = $1

          ORDER BY
            monthly_revenue DESC,
            p.name
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            COALESCE(
              NULLIF(
                TRIM(
                  pay.payment_method
                ),
                ''
              ),
              'Other'
            ) AS method,

            COUNT(*)::INTEGER
              AS count,

            COALESCE(
              SUM(pay.amount),
              0
            ) AS amount

          FROM payments pay

          INNER JOIN tenants t
            ON t.id = pay.tenant_id

          INNER JOIN properties p
            ON p.id = t.property_id

          WHERE p.owner_id = $1

          GROUP BY
            COALESCE(
              NULLIF(
                TRIM(
                  pay.payment_method
                ),
                ''
              ),
              'Other'
            )

          ORDER BY
            amount DESC
        `,
        [req.owner.id],
      ),

      safeQuery(
        `
          SELECT
            TO_CHAR(
              d.day,
              'YYYY-MM-DD'
            ) AS date,

            (
              SELECT
                COUNT(*)
              FROM beds b

              INNER JOIN rooms r
                ON r.id = b.room_id

              INNER JOIN properties p
                ON p.id = r.property_id

              WHERE p.owner_id = $1
            ) AS total_beds,

            (
              SELECT
                COUNT(*)
              FROM tenants t

              INNER JOIN properties p
                ON p.id = t.property_id

              WHERE p.owner_id = $1

                AND LOWER(
                  COALESCE(
                    t.status,
                    ''
                  )
                ) = 'active'

                AND t.move_in_date <=
                  d.day

                AND (
                  t.move_out_date IS NULL
                  OR t.move_out_date >
                    d.day
                )
            ) AS active_tenants

          FROM generate_series(
            CURRENT_DATE -
              INTERVAL '29 days',
            CURRENT_DATE,
            INTERVAL '1 day'
          ) d(day)

          ORDER BY
            d.day
        `,
        [req.owner.id],
      ),
    ]);

    return res.json({
      success: true,

      monthly:
        monthly.rows.map(
          (x) => ({
            month: x.month,
            expected:
              Number(
                x.expected || 0,
              ),
            collected:
              Number(
                x.collected || 0,
              ),
            outstanding:
              Number(
                x.outstanding || 0,
              ),
          }),
        ),

      properties:
        property.rows.map(
          (x) => ({
            id: x.id,
            name: x.name,
            rooms:
              Number(
                x.rooms || 0,
              ),
            beds:
              Number(
                x.beds || 0,
              ),
            occupied_beds:
              Number(
                x.occupied_beds ||
                  0,
              ),
            active_tenants:
              Number(
                x.active_tenants ||
                  0,
              ),
            monthly_revenue:
              Number(
                x.monthly_revenue ||
                  0,
              ),
            occupancy_rate:
              Number(
                x.beds || 0,
              )
                ? Math.round(
                    (Number(
                      x.occupied_beds ||
                        0,
                    ) /
                      Number(
                        x.beds ||
                          0,
                      )) *
                      100,
                  )
                : 0,
          }),
        ),

      payment_methods:
        methods.rows.map(
          (x) => ({
            method: x.method,
            count:
              Number(
                x.count || 0,
              ),
            amount:
              Number(
                x.amount || 0,
              ),
          }),
        ),

      occupancy_trend:
        occupancy.rows.map(
          (x) => ({
            date: x.date,
            total_beds:
              Number(
                x.total_beds ||
                  0,
              ),
            active_tenants:
              Number(
                x.active_tenants ||
                  0,
              ),
          }),
        ),
    });
  }),
);

// =====================================================
// FRONTEND
// =====================================================

app.use(
  express.static(DIST_DIR),
);

app.get('*', (req, res) => {
  if (
    req.path.startsWith('/api/')
  ) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found.',
    });
  }

  return res.sendFile(
    path.join(
      DIST_DIR,
      'index.html',
    ),
  );
});

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
          `Peacely server running on port ${PORT}`,
        );
      },
    );
  } catch (error) {
    console.error(
      'Failed to start Peacely server:',
      error,
    );

    process.exit(1);
  }
}

startServer();
