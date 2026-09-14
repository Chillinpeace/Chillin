import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { query, initializeDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const COOKIE_NAME = 'peacely_session';
const SESSION_DAYS = 30;

// =====================================================
// SECURITY HELPERS
// =====================================================

const hashValue = (value) =>
  crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');

const hashPassword = (password) =>
  crypto
    .createHash('sha256')
    .update(password)
    .digest('hex');

const createToken = () =>
  crypto.randomBytes(48).toString('hex');

const parseCookies = (req) => {
  const header = req.headers.cookie || '';
  const cookies = {};

  header.split(';').forEach((item) => {
    const index = item.indexOf('=');

    if (index === -1) {
      return;
    }

    const key = item
      .slice(0, index)
      .trim();

    const value = item
      .slice(index + 1)
      .trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  });

  return cookies;
};

const getSessionOwner = async (req) => {
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];

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
      o.phone
    FROM sessions s
    JOIN owners o
      ON o.id = s.owner_id
    WHERE s.token_hash = $1
      AND s.expires_at > NOW()
    LIMIT 1
    `,
    [tokenHash],
  );

  return result.rows[0] || null;
};

const requireAuth = async (req, res, next) => {
  try {
    const owner = await getSessionOwner(req);

    if (!owner) {
      return res.status(401).json({
        error: 'Please login to continue.',
        authenticated: false,
      });
    }

    req.owner = owner;
    next();
  } catch (err) {
    console.error(
      'Authentication error:',
      err,
    );

    res.status(500).json({
      error: 'Authentication failed.',
    });
  }
};

const setSessionCookie = (res, token) => {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(
      token,
    )}; HttpOnly; Path=/; Max-Age=${
      SESSION_DAYS * 24 * 60 * 60
    }; SameSite=Lax${
      process.env.NODE_ENV === 'production'
        ? '; Secure'
        : ''
    }`,
  );
};

const clearSessionCookie = (res) => {
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax${
      process.env.NODE_ENV === 'production'
        ? '; Secure'
        : ''
    }`,
  );
};

// =====================================================
// LOGIN PAGE
// =====================================================

const loginPage = () => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />
  <title>Peacely — Login</title>

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
          #ecfdf5 0%,
          #ffffff 45%,
          #f0fdf4 100%
        );
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #111827;
    }

    .container {
      width: 100%;
      max-width: 430px;
    }

    .brand {
      text-align: center;
      margin-bottom: 24px;
    }

    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 14px;
      border-radius: 20px;
      background: #10b981;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      font-weight: 800;
      box-shadow:
        0 12px 30px rgba(16,185,129,.25);
    }

    .brand h1 {
      margin: 0;
      font-size: 30px;
      font-weight: 800;
    }

    .brand p {
      margin: 6px 0 0;
      color: #6b7280;
      font-size: 14px;
    }

    .card {
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 24px;
      padding: 28px;
      box-shadow:
        0 20px 60px rgba(15,23,42,.08);
    }

    .tabs {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: #f3f4f6;
      padding: 5px;
      border-radius: 14px;
      margin-bottom: 24px;
    }

    .tab {
      border: 0;
      padding: 11px;
      border-radius: 10px;
      background: transparent;
      font-size: 14px;
      font-weight: 700;
      cursor: pointer;
      color: #6b7280;
    }

    .tab.active {
      background: white;
      color: #047857;
      box-shadow:
        0 2px 8px rgba(0,0,0,.06);
    }

    label {
      display: block;
      margin: 15px 0 7px;
      font-size: 13px;
      font-weight: 700;
      color: #374151;
    }

    input {
      width: 100%;
      padding: 13px 14px;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      outline: none;
      font-size: 15px;
    }

    input:focus {
      border-color: #10b981;
      box-shadow:
        0 0 0 3px rgba(16,185,129,.12);
    }

    .button {
      width: 100%;
      border: 0;
      border-radius: 13px;
      padding: 14px;
      margin-top: 22px;
      background: #10b981;
      color: white;
      font-size: 15px;
      font-weight: 800;
      cursor: pointer;
    }

    .button:hover {
      background: #059669;
    }

    .error {
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      padding: 11px 13px;
      border-radius: 11px;
      font-size: 13px;
      margin-bottom: 15px;
      display: none;
    }

    .small {
      margin-top: 18px;
      text-align: center;
      color: #9ca3af;
      font-size: 12px;
    }

    .hidden {
      display: none;
    }
  </style>
</head>

<body>
  <div class="container">

    <div class="brand">
      <div class="logo">P</div>
      <h1>Peacely</h1>
      <p>Simple PG & rental management</p>
    </div>

    <div class="card">

      <div class="tabs">
        <button
          class="tab active"
          id="loginTab"
          onclick="showLogin()"
        >
          Login
        </button>

        <button
          class="tab"
          id="signupTab"
          onclick="showSignup()"
        >
          Create Account
        </button>
      </div>

      <div id="error" class="error"></div>

      <form id="loginForm">
        <label>Email</label>
        <input
          id="loginEmail"
          type="email"
          placeholder="you@example.com"
          required
        />

        <label>Password</label>
        <input
          id="loginPassword"
          type="password"
          placeholder="Enter password"
          required
        />

        <button class="button" type="submit">
          Login to Peacely
        </button>
      </form>

      <form id="signupForm" class="hidden">
        <label>Owner Name</label>
        <input
          id="signupName"
          type="text"
          placeholder="Your name"
          required
        />

        <label>Email</label>
        <input
          id="signupEmail"
          type="email"
          placeholder="you@example.com"
          required
        />

        <label>Phone</label>
        <input
          id="signupPhone"
          type="tel"
          placeholder="Phone number"
        />

        <label>Password</label>
        <input
          id="signupPassword"
          type="password"
          placeholder="Minimum 6 characters"
          minlength="6"
          required
        />

        <label>Confirm Password</label>
        <input
          id="signupConfirm"
          type="password"
          placeholder="Repeat password"
          minlength="6"
          required
        />

        <button class="button" type="submit">
          Create Peacely Account
        </button>
      </form>

      <div class="small">
        Your PG data is private to your account.
      </div>

    </div>
  </div>

<script>
  const errorBox =
    document.getElementById('error');

  function showError(message) {
    errorBox.textContent = message;
    errorBox.style.display = 'block';
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.style.display = 'none';
  }

  function showLogin() {
    clearError();

    document
      .getElementById('loginForm')
      .classList.remove('hidden');

    document
      .getElementById('signupForm')
      .classList.add('hidden');

    document
      .getElementById('loginTab')
      .classList.add('active');

    document
      .getElementById('signupTab')
      .classList.remove('active');
  }

  function showSignup() {
    clearError();

    document
      .getElementById('loginForm')
      .classList.add('hidden');

    document
      .getElementById('signupForm')
      .classList.remove('hidden');

    document
      .getElementById('loginTab')
      .classList.remove('active');

    document
      .getElementById('signupTab')
      .classList.add('active');
  }

  document
    .getElementById('loginForm')
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError();

      const email =
        document
          .getElementById('loginEmail')
          .value
          .trim();

      const password =
        document
          .getElementById('loginPassword')
          .value;

      try {
        const response = await fetch(
          '/api/auth/login',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
              email,
              password
            })
          }
        );

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Login failed.'
          );
        }

        window.location.href = '/';
      } catch (error) {
        showError(
          error.message ||
          'Unable to login.'
        );
      }
    });

  document
    .getElementById('signupForm')
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      clearError();

      const name =
        document
          .getElementById('signupName')
          .value
          .trim();

      const email =
        document
          .getElementById('signupEmail')
          .value
          .trim();

      const phone =
        document
          .getElementById('signupPhone')
          .value
          .trim();

      const password =
        document
          .getElementById('signupPassword')
          .value;

      const confirm =
        document
          .getElementById('signupConfirm')
          .value;

      if (password !== confirm) {
        showError(
          'Passwords do not match.'
        );
        return;
      }

      try {
        const response = await fetch(
          '/api/auth/signup',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
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

        const data =
          await response.json();

        if (!response.ok) {
          throw new Error(
            data.error ||
            'Account creation failed.'
          );
        }

        window.location.href = '/';
      } catch (error) {
        showError(
          error.message ||
          'Unable to create account.'
        );
      }
    });
</script>

</body>
</html>
`;

// =====================================================
// AUTH ROUTES
// =====================================================

app.get('/api/auth/me', async (req, res) => {
  try {
    const owner =
      await getSessionOwner(req);

    if (!owner) {
      return res.status(401).json({
        authenticated: false,
      });
    }

    res.json({
      authenticated: true,
      owner,
    });
  } catch (err) {
    console.error(
      'Auth me error:',
      err,
    );

    res.status(500).json({
      error: err.message,
    });
  }
});

app.post(
  '/api/auth/signup',
  async (req, res) => {
    try {
      const name = String(
        req.body?.name || '',
      ).trim();

      const email = String(
        req.body?.email || '',
      )
        .trim()
        .toLowerCase();

      const phone = String(
        req.body?.phone || '',
      ).trim();

      const password = String(
        req.body?.password || '',
      );

      if (!name) {
        return res.status(400).json({
          error: 'Name is required.',
        });
      }

      if (!email) {
        return res.status(400).json({
          error: 'Email is required.',
        });
      }

      if (!email.includes('@')) {
        return res.status(400).json({
          error: 'Enter a valid email.',
        });
      }

      if (password.length < 6) {
        return res.status(400).json({
          error:
            'Password must contain at least 6 characters.',
        });
      }

      const existing =
        await query(
          `
          SELECT id
          FROM owners
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [email],
        );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          error:
            'An account with this email already exists.',
        });
      }

      const passwordHash =
        hashPassword(password);

      const result =
        await query(
          `
          INSERT INTO owners
            (
              name,
              email,
              phone,
              password_hash
            )
          VALUES
            ($1,$2,$3,$4)
          RETURNING
            id,
            name,
            email,
            phone
          `,
          [
            name,
            email,
            phone,
            passwordHash,
          ],
        );

      const owner =
        result.rows[0];

      // -------------------------------------------------
      // Assign old properties to the first owner.
      // This preserves existing Peacely data.
      // -------------------------------------------------

      const ownerCount =
        await query(
          `
          SELECT COUNT(*)::int AS count
          FROM owners
          `,
        );

      if (
        Number(
          ownerCount.rows[0].count,
        ) === 1
      ) {
        await query(
          `
          UPDATE properties
          SET owner_id = $1
          WHERE owner_id IS NULL
          `,
          [owner.id],
        );
      }

      const token =
        createToken();

      const tokenHash =
        hashValue(token);

      await query(
        `
        INSERT INTO sessions
          (
            owner_id,
            token_hash,
            expires_at
          )
        VALUES
          (
            $1,
            $2,
            NOW() +
            INTERVAL '30 days'
          )
        `,
        [
          owner.id,
          tokenHash,
        ],
      );

      setSessionCookie(
        res,
        token,
      );

      res.status(201).json({
        success: true,
        owner,
      });
    } catch (err) {
      console.error(
        'Signup error:',
        err,
      );

      res.status(500).json({
        error:
          'Unable to create account.',
      });
    }
  },
);

app.post(
  '/api/auth/login',
  async (req, res) => {
    try {
      const email = String(
        req.body?.email || '',
      )
        .trim()
        .toLowerCase();

      const password = String(
        req.body?.password || '',
      );

      if (!email || !password) {
        return res.status(400).json({
          error:
            'Email and password are required.',
        });
      }

      const result =
        await query(
          `
          SELECT
            id,
            name,
            email,
            phone,
            password_hash
          FROM owners
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1
          `,
          [email],
        );

      const owner =
        result.rows[0];

      if (!owner) {
        return res.status(401).json({
          error:
            'Invalid email or password.',
        });
      }

      const passwordHash =
        hashPassword(password);

      if (
        passwordHash !==
        owner.password_hash
      ) {
        return res.status(401).json({
          error:
            'Invalid email or password.',
        });
      }

      const token =
        createToken();

      const tokenHash =
        hashValue(token);

      await query(
        `
        DELETE FROM sessions
        WHERE owner_id = $1
        `,
        [owner.id],
      );

      await query(
        `
        INSERT INTO sessions
          (
            owner_id,
            token_hash,
            expires_at
          )
        VALUES
          (
            $1,
            $2,
            NOW() +
            INTERVAL '30 days'
          )
        `,
        [
          owner.id,
          tokenHash,
        ],
      );

      setSessionCookie(
        res,
        token,
      );

      res.json({
        success: true,
        owner: {
          id: owner.id,
          name: owner.name,
          email: owner.email,
          phone: owner.phone,
        },
      });
    } catch (err) {
      console.error(
        'Login error:',
        err,
      );

      res.status(500).json({
        error:
          'Unable to login.',
      });
    }
  },
);

app.post(
  '/api/auth/logout',
  async (req, res) => {
    try {
      const cookies =
        parseCookies(req);

      const token =
        cookies[COOKIE_NAME];

      if (token) {
        await query(
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
      });
    } catch (err) {
      console.error(
        'Logout error:',
        err,
      );

      clearSessionCookie(res);

      res.status(500).json({
        error:
          'Unable to logout.',
      });
    }
  },
);

// =====================================================
// HEALTH
// =====================================================

app.get(
  '/api/health',
  async (req, res) => {
    try {
      const result =
        await query(
          'SELECT NOW() AS time',
        );

      res.json({
        success: true,
        database: 'connected',
        time: result.rows[0].time,
      });
    } catch (err) {
      console.error(
        'Health error:',
        err,
      );

      res.status(500).json({
        success: false,
        error: err.message,
      });
    }
  },
);

// =====================================================
// PROPERTIES
// =====================================================

app.get(
  '/api/properties',
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            p.id,
            p.name,
            p.address,
            p.created_at,

            COALESCE(r.room_count, 0)::int
              AS room_count,

            COALESCE(b.bed_count, 0)::int
              AS bed_count,

            COALESCE(
              b.occupied_bed_count,
              0
            )::int AS occupied_bed_count,

            COALESCE(
              t.tenant_count,
              0
            )::int AS tenant_count,

            COALESCE(
              t.monthly_revenue,
              0
            )::numeric AS monthly_revenue

          FROM properties p

          LEFT JOIN (
            SELECT
              property_id,
              COUNT(*) AS room_count
            FROM rooms
            GROUP BY property_id
          ) r
            ON r.property_id = p.id

          LEFT JOIN (
            SELECT
              rooms.property_id,
              COUNT(beds.id)
                AS bed_count,
              COUNT(*) FILTER (
                WHERE beds.is_occupied = true
              )
                AS occupied_bed_count
            FROM rooms
            LEFT JOIN beds
              ON beds.room_id = rooms.id
            GROUP BY rooms.property_id
          ) b
            ON b.property_id = p.id

          LEFT JOIN (
            SELECT
              property_id,

              COUNT(*) FILTER (
                WHERE status = 'Active'
              ) AS tenant_count,

              COALESCE(
                SUM(monthly_rent)
                FILTER (
                  WHERE status = 'Active'
                ),
                0
              ) AS monthly_revenue

            FROM tenants
            GROUP BY property_id
          ) t
            ON t.property_id = p.id

          WHERE p.owner_id = $1

          ORDER BY p.id DESC
          `,
          [req.owner.id],
        );

      const properties =
        result.rows.map(
          (property) => {
            const beds =
              Number(
                property.bed_count ||
                  0,
              );

            const occupied =
              Number(
                property.occupied_bed_count ||
                  0,
              );

            return {
              ...property,
              room_count:
                Number(
                  property.room_count ||
                    0,
                ),
              bed_count: beds,
              occupied_bed_count:
                occupied,
              tenant_count:
                Number(
                  property.tenant_count ||
                    0,
                ),
              monthly_revenue:
                Number(
                  property.monthly_revenue ||
                    0,
                ),
              occupancy_rate:
                beds > 0
                  ? Math.round(
                      (occupied /
                        beds) *
                        100,
                    )
                  : 0,
            };
          },
        );

      res.json(properties);
    } catch (err) {
      console.error(
        'GET properties error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

app.post(
  '/api/properties',
  requireAuth,
  async (req, res) => {
    try {
      const name =
        String(
          req.body?.name || '',
        ).trim();

      const address =
        String(
          req.body?.address || '',
        ).trim();

      if (!name) {
        return res.status(400).json({
          error:
            'Property name is required.',
        });
      }

      const result =
        await query(
          `
          INSERT INTO properties
            (
              name,
              address,
              owner_id
            )
          VALUES
            ($1,$2,$3)
          RETURNING
            id,
            name,
            address,
            owner_id,
            created_at
          `,
          [
            name,
            address ||
              'No address added',
            req.owner.id,
          ],
        );

      res.status(201).json({
        success: true,
        property:
          result.rows[0],
      });
    } catch (err) {
      console.error(
        'POST property error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

// =====================================================
// ROOMS
// =====================================================

app.get(
  '/api/rooms',
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            r.*,
            p.name AS property_name,
            COUNT(b.id)::int
              AS bed_count,
            COUNT(*) FILTER (
              WHERE b.is_occupied = true
            )::int
              AS occupied_bed_count

          FROM rooms r

          JOIN properties p
            ON p.id = r.property_id

          LEFT JOIN beds b
            ON b.room_id = r.id

          WHERE p.owner_id = $1

          GROUP BY
            r.id,
            p.name

          ORDER BY r.id DESC
          `,
          [req.owner.id],
        );

      res.json(result.rows);
    } catch (err) {
      console.error(
        'GET rooms error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

app.post(
  '/api/rooms',
  requireAuth,
  async (req, res) => {
    try {
      const propertyId =
        Number(
          req.body?.property_id,
        );

      const roomNumber =
        String(
          req.body?.room_number ||
            '',
        ).trim();

      const sharingType =
        String(
          req.body?.sharing_type ||
            'Single',
        ).trim();

      const rentAmount =
        Number(
          req.body?.rent_amount ||
            0,
        );

      if (!propertyId) {
        return res.status(400).json({
          error:
            'Property is required.',
        });
      }

      if (!roomNumber) {
        return res.status(400).json({
          error:
            'Room number is required.',
        });
      }

      const property =
        await query(
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
        property.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'You do not have access to this property.',
        });
      }

      const result =
        await query(
          `
          INSERT INTO rooms
            (
              property_id,
              room_number,
              sharing_type,
              rent_amount
            )
          VALUES
            ($1,$2,$3,$4)
          RETURNING *
          `,
          [
            propertyId,
            roomNumber,
            sharingType,
            rentAmount,
          ],
        );

      res.status(201).json(
        result.rows[0],
      );
    } catch (err) {
      console.error(
        'POST room error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

// =====================================================
// BEDS
// =====================================================

app.get(
  '/api/beds',
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            b.*,
            r.room_number,
            r.property_id,
            p.name AS property_name,
            t.id AS tenant_id,
            t.name AS tenant_name

          FROM beds b

          JOIN rooms r
            ON r.id = b.room_id

          JOIN properties p
            ON p.id = r.property_id

          LEFT JOIN tenants t
            ON t.bed_id = b.id

          WHERE p.owner_id = $1

          ORDER BY b.id DESC
          `,
          [req.owner.id],
        );

      res.json(result.rows);
    } catch (err) {
      console.error(
        'GET beds error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

app.post(
  '/api/beds',
  requireAuth,
  async (req, res) => {
    try {
      const roomId =
        Number(
          req.body?.room_id,
        );

      const bedNumber =
        String(
          req.body?.bed_number ||
            '',
        ).trim();

      if (!roomId) {
        return res.status(400).json({
          error:
            'Room is required.',
        });
      }

      if (!bedNumber) {
        return res.status(400).json({
          error:
            'Bed number is required.',
        });
      }

      const room =
        await query(
          `
          SELECT r.id
          FROM rooms r
          JOIN properties p
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

      if (
        room.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'You do not have access to this room.',
        });
      }

      const result =
        await query(
          `
          INSERT INTO beds
            (
              room_id,
              bed_number
            )
          VALUES
            ($1,$2)
          RETURNING *
          `,
          [
            roomId,
            bedNumber,
          ],
        );

      res.status(201).json(
        result.rows[0],
      );
    } catch (err) {
      console.error(
        'POST bed error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

// =====================================================
// TENANTS
// =====================================================

app.get(
  '/api/tenants',
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            t.*,
            p.name AS property_name,
            r.room_number,
            b.bed_number

          FROM tenants t

          JOIN properties p
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

      res.json(result.rows);
    } catch (err) {
      console.error(
        'GET tenants error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

app.post(
  '/api/tenants',
  requireAuth,
  async (req, res) => {
    try {
      const {
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
      } = req.body;

      if (!name?.trim()) {
        return res.status(400).json({
          error:
            'Tenant name is required.',
        });
      }

      if (!phone?.trim()) {
        return res.status(400).json({
          error:
            'Phone number is required.',
        });
      }

      if (!property_id) {
        return res.status(400).json({
          error:
            'Property is required.',
        });
      }

      const property =
        await query(
          `
          SELECT id
          FROM properties
          WHERE id = $1
            AND owner_id = $2
          LIMIT 1
          `,
          [
            Number(property_id),
            req.owner.id,
          ],
        );

      if (
        property.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'You do not have access to this property.',
        });
      }

      const result =
        await query(
          `
          INSERT INTO tenants
            (
              name,
              phone,
              email,
              property_id,
              room_id,
              bed_id,
              monthly_rent,
              due_date,
              deposit_amount,
              move_in_date
            )
          VALUES
            (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10
            )
          RETURNING *
          `,
          [
            name.trim(),
            phone.trim(),
            email || '',
            Number(property_id),
            room_id
              ? Number(room_id)
              : null,
            bed_id
              ? Number(bed_id)
              : null,
            Number(
              monthly_rent || 0,
            ),
            Number(
              due_date || 5,
            ),
            Number(
              deposit_amount || 0,
            ),
            move_in_date ||
              null,
          ],
        );

      if (bed_id) {
        await query(
          `
          UPDATE beds
          SET is_occupied = true
          WHERE id = $1
            AND room_id IN (
              SELECT r.id
              FROM rooms r
              JOIN properties p
                ON p.id = r.property_id
              WHERE p.owner_id = $2
            )
          `,
          [
            Number(bed_id),
            req.owner.id,
          ],
        );
      }

      res.status(201).json(
        result.rows[0],
      );
    } catch (err) {
      console.error(
        'POST tenant error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

// =====================================================
// PAYMENTS
// =====================================================

app.get(
  '/api/payments',
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            pay.*,
            t.name AS tenant_name,
            p.name AS property_name,
            r.room_number

          FROM payments pay

          JOIN tenants t
            ON t.id = pay.tenant_id

          JOIN properties p
            ON p.id = t.property_id

          LEFT JOIN rooms r
            ON r.id = t.room_id

          WHERE p.owner_id = $1

          ORDER BY pay.id DESC
          `,
          [req.owner.id],
        );

      res.json(result.rows);
    } catch (err) {
      console.error(
        'GET payments error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

app.post(
  '/api/payments',
  requireAuth,
  async (req, res) => {
    try {
      const {
        tenant_id,
        amount,
        payment_date,
        payment_method,
        payment_month,
        notes,
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({
          error:
            'Tenant is required.',
        });
      }

      if (
        !amount ||
        Number(amount) <= 0
      ) {
        return res.status(400).json({
          error:
            'Valid payment amount is required.',
        });
      }

      const tenant =
        await query(
          `
          SELECT t.id
          FROM tenants t
          JOIN properties p
            ON p.id = t.property_id
          WHERE t.id = $1
            AND p.owner_id = $2
          LIMIT 1
          `,
          [
            Number(tenant_id),
            req.owner.id,
          ],
        );

      if (
        tenant.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'You do not have access to this tenant.',
        });
      }

      const result =
        await query(
          `
          INSERT INTO payments
            (
              tenant_id,
              amount,
              payment_date,
              payment_method,
              payment_month,
              notes
            )
          VALUES
            ($1,$2,$3,$4,$5,$6)
          RETURNING *
          `,
          [
            Number(tenant_id),
            Number(amount),
            payment_date ||
              new Date(),
            payment_method ||
              'UPI',
            payment_month ||
              '',
            notes || '',
          ],
        );

      res.status(201).json(
        result.rows[0],
      );
    } catch (err) {
      console.error(
        'POST payment error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

// =====================================================
// INVOICES
// =====================================================

app.get(
  '/api/invoices',
  requireAuth,
  async (req, res) => {
    try {
      const result =
        await query(
          `
          SELECT
            inv.*,
            t.name AS tenant_name

          FROM invoices inv

          JOIN tenants t
            ON t.id = inv.tenant_id

          JOIN properties p
            ON p.id = t.property_id

          WHERE p.owner_id = $1

          ORDER BY inv.id DESC
          `,
          [req.owner.id],
        );

      res.json(result.rows);
    } catch (err) {
      console.error(
        'GET invoices error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

app.post(
  '/api/invoices',
  requireAuth,
  async (req, res) => {
    try {
      const {
        tenant_id,
        amount,
        month,
        due_date,
        status,
      } = req.body;

      if (!tenant_id) {
        return res.status(400).json({
          error:
            'Tenant is required.',
        });
      }

      if (
        !amount ||
        Number(amount) <= 0
      ) {
        return res.status(400).json({
          error:
            'Valid invoice amount is required.',
        });
      }

      const tenant =
        await query(
          `
          SELECT t.id
          FROM tenants t
          JOIN properties p
            ON p.id = t.property_id
          WHERE t.id = $1
            AND p.owner_id = $2
          LIMIT 1
          `,
          [
            Number(tenant_id),
            req.owner.id,
          ],
        );

      if (
        tenant.rows.length === 0
      ) {
        return res.status(403).json({
          error:
            'You do not have access to this tenant.',
        });
      }

      const invoiceNumber =
        `INV-${Date.now()
          .toString()
          .slice(-6)}`;

      const result =
        await query(
          `
          INSERT INTO invoices
            (
              invoice_number,
              tenant_id,
              amount,
              month,
              due_date,
              status
            )
          VALUES
            ($1,$2,$3,$4,$5,$6)
          RETURNING *
          `,
          [
            invoiceNumber,
            Number(tenant_id),
            Number(amount),
            month || '',
            due_date,
            status ||
              'Pending',
          ],
        );

      res.status(201).json(
        result.rows[0],
      );
    } catch (err) {
      console.error(
        'POST invoice error:',
        err,
      );

      res.status(500).json({
        error: err.message,
      });
    }
  },
);

// =====================================================
// FRONTEND
// =====================================================

const distPath =
  path.join(
    __dirname,
    '../dist',
  );

// Login page must be checked before
// the normal frontend is served.
app.get(
  '/',
  async (req, res, next) => {
    try {
      const owner =
        await getSessionOwner(req);

      if (!owner) {
        return res
          .status(200)
          .send(loginPage());
      }

      next();
    } catch (err) {
      console.error(
        'Frontend auth check error:',
        err,
      );

      res
        .status(500)
        .send(
          'Peacely authentication error.',
        );
    }
  },
);

app.use(
  express.static(distPath),
);

app.get(
  '*',
  async (req, res) => {
    try {
      if (
        req.path.startsWith('/api/')
      ) {
        return res
          .status(404)
          .json({
            error:
              'API route not found.',
          });
      }

      const owner =
        await getSessionOwner(req);

      if (!owner) {
        return res
          .status(200)
          .send(loginPage());
      }

      return res.sendFile(
        path.join(
          distPath,
          'index.html',
        ),
      );
    } catch (err) {
      console.error(
        'Frontend route error:',
        err,
      );

      res
        .status(500)
        .send(
          'Unable to load Peacely.',
        );
    }
  },
);

// =====================================================
// START SERVER
// =====================================================

const startServer =
  async () => {
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
    } catch (err) {
      console.error(
        'Failed to start Peacely:',
        err,
      );

      process.exit(1);
    }
  };

startServer();
