import express from 'express';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from './database.js';
import { recordAudit } from './sandbox.js';

const router = express.Router();
const SESSION_COOKIE = 'peacely_session';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.join(__dirname, '..', 'storage', 'evidence');
const MAX_BYTES = 2 * 1024 * 1024;
const RETENTION_DAYS = Math.max(Number(process.env.PEACELY_EVIDENCE_RETENTION_DAYS || 0), 0);

const allowedTypes = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['video/mp4', 'mp4'],
  ['video/webm', 'webm'],
  ['application/pdf', 'pdf'],
]);

const clean = (value) => String(value ?? '').trim();

function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  }
  return out;
}

const hash = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

async function ownerFromRequest(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const result = await query(
    'SELECT o.id,o.name,o.email FROM sessions s INNER JOIN owners o ON o.id=s.owner_id WHERE s.token_hash=$1 AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1',
    [hash(token)],
  );
  return result.rows[0] || null;
}

async function requireOwner(req, res, next) {
  try {
    const owner = await ownerFromRequest(req);
    if (!owner) return res.status(401).json({ success: false, error: 'Login required.' });
    req.owner = owner;
    next();
  } catch (error) {
    console.error('Evidence storage authentication error:', error);
    return res.status(500).json({ success: false, error: 'Unable to verify session.' });
  }
}

async function ensureStorageSchema() {
  await query(`ALTER TABLE peacely_evidence ADD COLUMN IF NOT EXISTS storage_path TEXT DEFAULT ''; CREATE INDEX IF NOT EXISTS idx_evidence_owner_id ON peacely_evidence(owner_id,id);`);
}

function storageMode() {
  const explicit = clean(process.env.PEACELY_EVIDENCE_STORAGE_MODE).toLowerCase();
  if (explicit) return explicit;
  const env = clean(process.env.PEACELY_ENV || (process.env.NODE_ENV === 'production' ? 'production' : 'development')).toLowerCase();
  return env === 'production' ? 'external' : 'local';
}

function hasValidSignature(mimeType, buffer) {
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'video/webm') return buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === '1A45';
  if (mimeType === 'video/mp4') return buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
  return false;
}

async function deleteStoredFile(storagePath) {
  if (!storagePath) return;
  const root = path.resolve(STORAGE_ROOT);
  const absolutePath = path.resolve(STORAGE_ROOT, storagePath);
  if (!absolutePath.startsWith(root + path.sep)) throw new Error('Invalid storage path.');
  await fs.rm(absolutePath, { force: true });
}

function decodeDataUrl(value) {
  const input = clean(value);
  const match = input.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const mimeType = match[1].toLowerCase();
  if (!allowedTypes.has(mimeType)) return null;
  const buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  if (!hasValidSignature(mimeType, buffer)) return null;
  return { mimeType, buffer };
}

async function resolveReport(ownerId, reportId, stage) {
  const table = stage === 'move_in' ? 'peacely_move_in_reports' : 'peacely_move_out_reports';
  const result = await query(
    `SELECT m.id,m.tenant_id,t.property_id,t.room_id,t.bed_id
     FROM ${table} m
     INNER JOIN tenants t ON t.id=m.tenant_id
     INNER JOIN properties p ON p.id=t.property_id
     WHERE m.id=$1 AND m.owner_id=$2 AND p.owner_id=$2
     LIMIT 1`,
    [reportId, ownerId],
  );
  return result.rows[0] || null;
}

router.get('/api/evidence-storage/health', requireOwner, async (req, res) => {
  try {
    await ensureStorageSchema();
    const mode = storageMode();
    if (mode !== 'local') {
      return res.json({
        success: true,
        storage_mode: mode,
        writable: false,
        configured: false,
        message: 'External durable storage adapter is not configured.',
      });
    }
    await fs.mkdir(path.join(STORAGE_ROOT, String(req.owner.id)), { recursive: true });
    return res.json({
      success: true,
      storage_mode: mode,
      writable: true,
      configured: true,
      retention_days: RETENTION_DAYS || null,
    });
  } catch (error) {
    return res.status(503).json({ success: false, error: 'Evidence storage is unavailable.' });
  }
});

router.delete('/api/evidence-storage/:evidenceId', requireOwner, async (req, res) => {
  try {
    await ensureStorageSchema();
    const evidenceId = Number(req.params.evidenceId);
    if (!Number.isInteger(evidenceId) || evidenceId <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid evidence id.' });
    }

    const current = await query(
      'SELECT id,tenant_id,property_id,storage_path FROM peacely_evidence WHERE id=$1 AND owner_id=$2 LIMIT 1',
      [evidenceId, req.owner.id],
    );
    if (!current.rows[0]) return res.status(404).json({ success: false, error: 'Evidence not found.' });

    if (storageMode() === 'local') await deleteStoredFile(current.rows[0].storage_path);

    await query('DELETE FROM peacely_evidence WHERE id=$1 AND owner_id=$2', [evidenceId, req.owner.id]);
    await recordAudit(req.owner.id, 'evidence.deleted', 'evidence', String(evidenceId), {
      tenantId: current.rows[0].tenant_id,
      propertyId: current.rows[0].property_id,
      metadata: { retention_delete: false },
    });

    return res.json({ success: true });
  } catch (error) {
    console.error('Evidence delete error:', error);
    return res.status(500).json({ success: false, error: 'Unable to delete evidence.' });
  }
});

router.post('/api/evidence-storage/upload', requireOwner, async (req, res) => {
  try {
    await ensureStorageSchema();

    if (storageMode() !== 'local') {
      return res.status(503).json({
        success: false,
        error: 'Durable evidence storage is not configured for production. Uploads are intentionally disabled until an external storage provider is configured.',
        storage_mode: storageMode(),
      });
    }

    const stage = clean(req.body?.stage).toLowerCase();
    if (!['move_in', 'move_out'].includes(stage)) {
      return res.status(400).json({ success: false, error: 'stage must be move_in or move_out.' });
    }

    const reportId = Number(req.body?.report_id);
    if (!Number.isInteger(reportId) || reportId <= 0) {
      return res.status(400).json({ success: false, error: 'report_id is required.' });
    }

    const report = await resolveReport(req.owner.id, reportId, stage);
    if (!report) return res.status(404).json({ success: false, error: 'Move-in/move-out report not found.' });

    const decoded = decodeDataUrl(req.body?.data_url);
    if (!decoded) {
      return res.status(400).json({ success: false, error: 'Unsupported, invalid or oversized file. Maximum file size is 2 MB.' });
    }

    const category = clean(req.body?.category).slice(0, 80) || 'general';
    const fileName = clean(req.body?.file_name).slice(0, 255) || `evidence.${allowedTypes.get(decoded.mimeType)}`;
    const note = clean(req.body?.note);
    const capturedAt = req.body?.captured_at || null;

    const ownerDir = path.join(STORAGE_ROOT, String(req.owner.id));
    await fs.mkdir(ownerDir, { recursive: true });

    const fileId = crypto.randomUUID();
    const extension = allowedTypes.get(decoded.mimeType);
    const relativePath = path.join(String(req.owner.id), fileId + '.' + extension);
    const absolutePath = path.join(STORAGE_ROOT, relativePath);
    await fs.writeFile(absolutePath, decoded.buffer, { flag: 'wx' });

    try {
      const result = await query(
        `INSERT INTO peacely_evidence
         (owner_id,tenant_id,property_id,room_id,bed_id,stage,category,file_name,mime_type,file_url,note,captured_at,storage_path)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,COALESCE($12::timestamptz,CURRENT_TIMESTAMP),$13)
         RETURNING id,stage,category,file_name,mime_type,file_url,note,captured_at,created_at`,
        [
          req.owner.id,
          report.tenant_id,
          report.property_id,
          report.room_id,
          report.bed_id,
          stage,
          category,
          fileName,
          decoded.mimeType,
          `/api/evidence-storage/files/${fileId}`,
          note,
          capturedAt,
          relativePath,
        ],
      );

      await recordAudit(req.owner.id, 'evidence.uploaded', 'evidence', String(result.rows[0].id), {
        tenantId: report.tenant_id,
        propertyId: report.property_id,
        metadata: { stage, category, file_name: fileName, mime_type: decoded.mimeType },
      });

      return res.status(201).json({ success: true, evidence: result.rows[0], storage_mode: storageMode() });
    } catch (error) {
      await fs.rm(absolutePath, { force: true }).catch(() => {});
      throw error;
    }
  } catch (error) {
    console.error('Evidence upload error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Unable to upload evidence.' });
  }
});

router.get('/api/evidence-storage/files/:fileId', requireOwner, async (req, res) => {
  try {
    await ensureStorageSchema();
    const fileId = clean(req.params.fileId);
    if (!/^[a-f0-9-]{20,60}$/i.test(fileId)) {
      return res.status(400).json({ success: false, error: 'Invalid evidence file.' });
    }

    const result = await query(
      'SELECT id,file_name,mime_type,storage_path FROM peacely_evidence WHERE id IS NOT NULL AND owner_id=$1 AND file_url=$2 LIMIT 1',
      [req.owner.id, `/api/evidence-storage/files/${fileId}`],
    );
    const evidence = result.rows[0];
    if (!evidence?.storage_path) return res.status(404).json({ success: false, error: 'Evidence file not found.' });

    const root = path.resolve(STORAGE_ROOT);
    const absolutePath = path.resolve(STORAGE_ROOT, evidence.storage_path);
    if (!absolutePath.startsWith(root + path.sep)) {
      return res.status(403).json({ success: false, error: 'Evidence access denied.' });
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', evidence.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${String(evidence.file_name || 'evidence').replace(/["\r\n]/g, '')}"`);
    return res.sendFile(absolutePath, (error) => {
      if (error && !res.headersSent) {
        res.status(error.statusCode || 404).json({ success: false, error: 'Evidence file not found.' });
      }
    });
  } catch (error) {
    console.error('Evidence file read error:', error);
    return res.status(500).json({ success: false, error: 'Unable to read evidence file.' });
  }
});

export default router;
