import { createServer } from 'node:http';
import { stat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { URL } from 'node:url';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Busboy from 'busboy';
import { parse as csvParse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// ── Config ──────────────────────────────────────────────────────────────────
const PORT      = parseInt(process.env.PORT || '3000', 10);
const DATA_DIR  = process.env.DATA_DIR || join(__dirname, 'data');
const DB_FILE   = join(DATA_DIR, 'analyzer.db');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'ChangeMe2026!';
const SESSION_HOURS = parseInt(process.env.SESSION_HOURS || '12', 10);
const MAX_BODY  = 50 * 1024 * 1024; // 50 MB for CSV uploads
const BYPASS_AUTH = process.env.BYPASS_AUTH === 'true';

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ── Database ─────────────────────────────────────────────────────────────────
const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_headers TEXT NOT NULL,
    column_mapping TEXT NOT NULL,
    row_count INTEGER NOT NULL,
    week_label TEXT,
    notes TEXT,
    uploaded_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    raw_data TEXT NOT NULL,
    ticket_id TEXT,
    ticket_date TEXT,
    category TEXT,
    priority TEXT,
    status TEXT,
    assignee TEXT,
    description TEXT,
    resolution TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_tickets_upload ON tickets(upload_id);
  CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
  CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
  CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
  CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee);
  CREATE INDEX IF NOT EXISTS idx_tickets_date ON tickets(ticket_date);
`);

// Seed admin user if not exists
function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = stored.split(':');
    const attempt = scryptSync(pw, salt, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), attempt);
  } catch { return false; }
}

const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USER);
if (!adminExists) {
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(ADMIN_USER, hashPassword(ADMIN_PASS));
  console.log(`[init] Admin user '${ADMIN_USER}' created.`);
}

// ── Sessions ─────────────────────────────────────────────────────────────────
const sessions = new Map();

function createSession(username) {
  const sid = randomUUID();
  sessions.set(sid, { username, expiresAt: Date.now() + SESSION_HOURS * 3600 * 1000 });
  return sid;
}

function getSession(sid) {
  const s = sessions.get(sid);
  if (!s) return null;
  if (Date.now() > s.expiresAt) { sessions.delete(sid); return null; }
  return s;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function securityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store'
  };
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...securityHeaders() });
  res.end(body);
}

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...securityHeaders() });
  res.end(text);
}

async function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => { size += c.length; if (size > limit) reject(new HttpError(413, 'Body too large')); else chunks.push(c); });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
      catch { reject(new HttpError(400, 'Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const [k, ...v] = p.trim().split('=');
    if (k) out[k.trim()] = decodeURIComponent(v.join('='));
  });
  return out;
}

function authFromRequest(req) {
  if (BYPASS_AUTH) return { username: 'admin' };
  const cookies = parseCookies(req);
  const sid = cookies['ta_session'];
  if (!sid) return null;
  return getSession(sid);
}

function requireAuth(req, res) {
  const auth = authFromRequest(req);
  if (!auth) { sendJson(res, 401, { error: 'Not authenticated' }); return null; }
  return auth;
}

function sessionCookie(sid, maxAge = SESSION_HOURS * 3600) {
  return `ta_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// ── Static file serving ───────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.json': 'application/json',
};

async function serveStatic(reqPath, res) {
  const safePath = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = join(__dirname, safePath.replace(/\.\./g, ''));
  const ext = extname(filePath);
  try {
    await stat(filePath);
    const mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

// ── AI helpers ────────────────────────────────────────────────────────────────
const AI_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'minimax/minimax-m2.5:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
];

async function callOpenRouter(apiKey, model, messages, maxTokens) {
  const { request: httpsReq } = await import('node:https');
  const body = JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.7 });
  return new Promise((resolve, reject) => {
    const req = httpsReq({
      hostname: 'openrouter.ai', path: '/api/v1/chat/completions', method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'HTTP-Referer': 'https://ticket-analyzer.railway.app',
        'X-Title': 'Ticket Analyzer'
      }
    }, (r) => {
      const cs = []; r.on('data', c => cs.push(c));
      r.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(cs).toString());
          if (json.error) return reject(new Error(json.error.message || 'Provider error'));
          resolve((json.choices?.[0]?.message?.content || '').trim());
        } catch (e) { reject(new Error('Invalid AI response')); }
      });
    });
    req.on('error', e => reject(new Error('AI connection error: ' + e.message)));
    req.write(body); req.end();
  });
}

async function callAI(messages, { maxTokens = 1000 } = {}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new HttpError(503, 'OPENROUTER_API_KEY not configured');
  let lastErr;
  for (const model of AI_MODELS) {
    try { return await callOpenRouter(apiKey, model, messages, maxTokens); }
    catch (e) { console.log(`[AI] ${model} failed: ${e.message}`); lastErr = e; }
  }
  throw new HttpError(502, 'All AI models unavailable: ' + lastErr?.message);
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function parseCsvBuffer(buffer) {
  return csvParse(buffer, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_quotes: true, relax_column_count: true });
}

function buildTicketFromRow(row, mapping) {
  const get = field => {
    const col = mapping[field];
    return col ? (row[col] || '').toString().trim() : '';
  };
  return {
    ticket_id: get('ticket_id'),
    ticket_date: get('ticket_date'),
    category: get('category'),
    priority: get('priority'),
    status: get('status'),
    assignee: get('assignee'),
    description: get('description'),
    resolution: get('resolution'),
    raw_data: JSON.stringify(row),
  };
}

function buildAiContext(uploadId) {
  const where = uploadId ? 'WHERE t.upload_id = ?' : '';
  const params = uploadId ? [uploadId] : [];

  const total = db.prepare(`SELECT COUNT(*) as n FROM tickets t ${where}`).get(...params).n;

  const byCategory = db.prepare(`SELECT category, COUNT(*) as n FROM tickets t ${where} GROUP BY category ORDER BY n DESC LIMIT 15`).all(...params);
  const byPriority = db.prepare(`SELECT priority, COUNT(*) as n FROM tickets t ${where} GROUP BY priority ORDER BY n DESC`).all(...params);
  const byStatus   = db.prepare(`SELECT status, COUNT(*) as n FROM tickets t ${where} GROUP BY status ORDER BY n DESC`).all(...params);
  const byAssignee = db.prepare(`SELECT assignee, COUNT(*) as n FROM tickets t ${where} GROUP BY assignee ORDER BY n DESC LIMIT 10`).all(...params);
  const sample     = db.prepare(`SELECT description, category, priority, status, assignee, resolution FROM tickets t ${where} ORDER BY RANDOM() LIMIT 30`).all(...params);

  return `
RESUMEN DE TICKETS (Total: ${total})

Por categoría: ${byCategory.map(r => `${r.category||'N/A'}(${r.n})`).join(', ')}
Por prioridad: ${byPriority.map(r => `${r.priority||'N/A'}(${r.n})`).join(', ')}
Por estado: ${byStatus.map(r => `${r.status||'N/A'}(${r.n})`).join(', ')}
Por asignado: ${byAssignee.map(r => `${r.assignee||'N/A'}(${r.n})`).join(', ')}

MUESTRA DE TICKETS (${sample.length}):
${sample.map((t,i) => `[${i+1}] ${t.description||'-'} | cat:${t.category||'-'} | pri:${t.priority||'-'} | est:${t.status||'-'} | asig:${t.assignee||'-'} | res:${t.resolution||'-'}`).join('\n')}
`.trim();
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = v => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\r\n');
}

// ── Route handlers ────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost`);
  const path = url.pathname;
  const method = req.method;

  try {
    // ── Auth endpoints ────────────────────────────────────────────────────────
    if (path === '/api/login' && method === 'POST') {
      const { username, password } = await readBody(req);
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !verifyPassword(password, user.password_hash)) {
        return sendJson(res, 401, { error: 'Invalid credentials' });
      }
      const sid = createSession(username);
      res.writeHead(200, { 'Set-Cookie': sessionCookie(sid), 'Content-Type': 'application/json', ...securityHeaders() });
      res.end(JSON.stringify({ ok: true, username }));
      return;
    }

    if (path === '/api/logout' && method === 'POST') {
      const cookies = parseCookies(req);
      if (cookies['ta_session']) sessions.delete(cookies['ta_session']);
      res.writeHead(200, { 'Set-Cookie': sessionCookie('', 0), 'Content-Type': 'application/json', ...securityHeaders() });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (path === '/api/me' && method === 'GET') {
      const auth = authFromRequest(req);
      if (!auth) return sendJson(res, 401, { error: 'Not authenticated' });
      return sendJson(res, 200, { username: auth.username });
    }

    // ── All other API endpoints require auth ──────────────────────────────────
    if (path.startsWith('/api/')) {
      const auth = requireAuth(req, res);
      if (!auth) return;

      // POST /api/upload — upload a CSV file
      if (path === '/api/upload' && method === 'POST') {
        const ct = req.headers['content-type'] || '';
        if (!ct.includes('multipart/form-data')) return sendJson(res, 400, { error: 'Expected multipart/form-data' });

        const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_BODY } });
        let csvBuffer = null, fileName = 'upload.csv';
        let weekLabel = '', notes = '', mappingJson = '';

        bb.on('file', (name, stream, info) => {
          fileName = info.filename || 'upload.csv';
          const chunks = [];
          stream.on('data', c => chunks.push(c));
          stream.on('end', () => { csvBuffer = Buffer.concat(chunks); });
        });
        bb.on('field', (name, val) => {
          if (name === 'week_label') weekLabel = val;
          if (name === 'notes') notes = val;
          if (name === 'mapping') mappingJson = val;
        });

        await new Promise((resolve, reject) => { bb.on('finish', resolve); bb.on('error', reject); req.pipe(bb); });

        if (!csvBuffer || !csvBuffer.length) return sendJson(res, 400, { error: 'No file received' });

        let rows;
        try { rows = parseCsvBuffer(csvBuffer); }
        catch (e) { return sendJson(res, 422, { error: 'Cannot parse CSV: ' + e.message }); }

        if (!rows.length) return sendJson(res, 422, { error: 'CSV has no rows' });

        const headers = Object.keys(rows[0]);

        // If no mapping provided, return headers for the user to map
        if (!mappingJson) {
          return sendJson(res, 200, { step: 'map_headers', headers, row_count: rows.length, sample: rows.slice(0, 3) });
        }

        let mapping;
        try { mapping = JSON.parse(mappingJson); }
        catch { return sendJson(res, 400, { error: 'Invalid mapping JSON' }); }

        // Insert upload + tickets in a transaction
        const insertUpload = db.prepare(
          'INSERT INTO uploads (filename, original_headers, column_mapping, row_count, week_label, notes) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const insertTicket = db.prepare(
          'INSERT INTO tickets (upload_id, raw_data, ticket_id, ticket_date, category, priority, status, assignee, description, resolution) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );

        const doInsert = db.transaction(() => {
          const uploadResult = insertUpload.run(fileName, JSON.stringify(headers), JSON.stringify(mapping), rows.length, weekLabel, notes);
          const uploadId = uploadResult.lastInsertRowid;
          for (const row of rows) {
            const t = buildTicketFromRow(row, mapping);
            insertTicket.run(uploadId, t.raw_data, t.ticket_id, t.ticket_date, t.category, t.priority, t.status, t.assignee, t.description, t.resolution);
          }
          return uploadId;
        });

        const uploadId = doInsert();
        return sendJson(res, 201, { ok: true, upload_id: uploadId, row_count: rows.length });
      }

      // GET /api/uploads — list all uploads
      if (path === '/api/uploads' && method === 'GET') {
        const uploads = db.prepare('SELECT id, filename, row_count, week_label, notes, uploaded_at FROM uploads ORDER BY uploaded_at DESC').all();
        return sendJson(res, 200, { uploads });
      }

      // DELETE /api/uploads/:id
      const uploadMatch = path.match(/^\/api\/uploads\/(\d+)$/);
      if (uploadMatch && method === 'DELETE') {
        const id = parseInt(uploadMatch[1]);
        db.prepare('DELETE FROM uploads WHERE id = ?').run(id);
        return sendJson(res, 200, { ok: true });
      }

      // GET /api/dashboard — aggregated metrics (optional ?upload_id=)
      if (path === '/api/dashboard' && method === 'GET') {
        const uploadId = url.searchParams.get('upload_id') ? parseInt(url.searchParams.get('upload_id')) : null;
        const w = uploadId ? 'WHERE upload_id = ?' : '';
        const p = uploadId ? [uploadId] : [];

        const total        = db.prepare(`SELECT COUNT(*) as n FROM tickets ${w}`).get(...p).n;
        const byCategory   = db.prepare(`SELECT category as label, COUNT(*) as value FROM tickets ${w} GROUP BY category ORDER BY value DESC LIMIT 12`).all(...p);
        const byPriority   = db.prepare(`SELECT priority as label, COUNT(*) as value FROM tickets ${w} GROUP BY priority ORDER BY value DESC`).all(...p);
        const byStatus     = db.prepare(`SELECT status as label, COUNT(*) as value FROM tickets ${w} GROUP BY status ORDER BY value DESC`).all(...p);
        const byAssignee   = db.prepare(`SELECT assignee as label, COUNT(*) as value FROM tickets ${w} GROUP BY assignee ORDER BY value DESC LIMIT 10`).all(...p);
        const byWeek       = db.prepare(`SELECT u.week_label as label, COUNT(t.id) as value FROM tickets t JOIN uploads u ON t.upload_id = u.id ${uploadId ? 'WHERE t.upload_id = ?' : ''} GROUP BY u.week_label ORDER BY u.uploaded_at`).all(...p);

        return sendJson(res, 200, { total, byCategory, byPriority, byStatus, byAssignee, byWeek });
      }

      // POST /api/ai/chat
      if (path === '/api/ai/chat' && method === 'POST') {
        const { question, upload_id } = await readBody(req);
        if (!question?.trim()) return sendJson(res, 400, { error: 'question is required' });

        const context = buildAiContext(upload_id || null);
        const answer = await callAI([
          { role: 'system', content: `Eres un analista de tickets. Responde SIEMPRE en español. Sé conciso y claro. Usa los datos reales provistos. No inventes datos.\n\n${context}` },
          { role: 'user', content: question }
        ]);

        return sendJson(res, 200, { answer });
      }

      // GET /api/export/csv — export tickets as CSV (optional ?upload_id=)
      if (path === '/api/export/csv' && method === 'GET') {
        const uploadId = url.searchParams.get('upload_id') ? parseInt(url.searchParams.get('upload_id')) : null;
        const w = uploadId ? 'WHERE upload_id = ?' : '';
        const p = uploadId ? [uploadId] : [];
        const rows = db.prepare(`SELECT ticket_id, ticket_date, category, priority, status, assignee, description, resolution FROM tickets ${w}`).all(...p);
        const csv = toCsv(rows);
        const filename = uploadId ? `tickets_upload_${uploadId}.csv` : 'tickets_all.csv';
        res.writeHead(200, {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${filename}"`,
          ...securityHeaders()
        });
        return res.end(csv);
      }

      return sendJson(res, 404, { error: 'API endpoint not found' });
    }

    // ── Static files ──────────────────────────────────────────────────────────
    await serveStatic(path, res);

  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error('[error]', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

// ── Start server ──────────────────────────────────────────────────────────────
const server = createServer(handleRequest);
server.listen(PORT, () => console.log(`[server] Ticket Analyzer running on port ${PORT}`));
