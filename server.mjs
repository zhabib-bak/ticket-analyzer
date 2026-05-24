import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream, existsSync, mkdirSync } from 'node:fs';
import { extname, join } from 'node:path';
import { URL } from 'node:url';
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import Busboy from 'busboy';
import { parse as csvParse } from 'csv-parse/sync';
import pg from 'pg';

const { Pool } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────
const PORT         = parseInt(process.env.PORT || '3000', 10);
const ADMIN_USER   = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS   = process.env.ADMIN_PASSWORD || 'ChangeMe2026!';
const SESSION_HRS  = parseInt(process.env.SESSION_HOURS || '12', 10);
const MAX_BODY     = 50 * 1024 * 1024;

// ── Postgres pool ─────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway.internal') ? false : { rejectUnauthorized: false },
  max: 10,
});

async function q(sql, params = []) {
  const client = await pool.connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

// ── Init DB (tables prefixed ta_ to coexist with NewVersion) ──────────────────
async function initDb() {
  await q(`
    CREATE TABLE IF NOT EXISTS ta_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ta_uploads (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL,
      original_headers JSONB NOT NULL,
      column_mapping JSONB NOT NULL,
      row_count INTEGER NOT NULL,
      week_label TEXT,
      notes TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ta_tickets (
      id SERIAL PRIMARY KEY,
      upload_id INTEGER NOT NULL REFERENCES ta_uploads(id) ON DELETE CASCADE,
      raw_data JSONB NOT NULL,
      ticket_id TEXT,
      ticket_date TEXT,
      category TEXT,
      priority TEXT,
      status TEXT,
      assignee TEXT,
      description TEXT,
      resolution TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ta_tickets_upload   ON ta_tickets(upload_id);
    CREATE INDEX IF NOT EXISTS idx_ta_tickets_category ON ta_tickets(category);
    CREATE INDEX IF NOT EXISTS idx_ta_tickets_priority ON ta_tickets(priority);
    CREATE INDEX IF NOT EXISTS idx_ta_tickets_status   ON ta_tickets(status);
    CREATE INDEX IF NOT EXISTS idx_ta_tickets_assignee ON ta_tickets(assignee);
  `);

  // Seed admin user
  const existing = await q('SELECT id FROM ta_users WHERE username = $1', [ADMIN_USER]);
  if (!existing.rows.length) {
    await q('INSERT INTO ta_users (username, password_hash) VALUES ($1, $2)', [ADMIN_USER, hashPassword(ADMIN_PASS)]);
    console.log(`[init] Admin user '${ADMIN_USER}' created.`);
  }
  console.log('[db] Postgres connected and tables ready.');
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(pw, stored) {
  try {
    const [salt, hash] = stored.split(':');
    return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(pw, salt, 64));
  } catch { return false; }
}

// ── Sessions ──────────────────────────────────────────────────────────────────
const sessions = new Map();
function createSession(username) {
  const sid = randomUUID();
  sessions.set(sid, { username, expiresAt: Date.now() + SESSION_HRS * 3600000 });
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
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};
function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...SEC_HEADERS });
  res.end(body);
}
function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...SEC_HEADERS });
  res.end(text);
}
async function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', c => { size += c.length; if (size > MAX_BODY) reject(new HttpError(413, 'Body too large')); else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString())); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
    req.on('error', reject);
  });
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => { const [k,...v] = p.trim().split('='); if (k) out[k.trim()] = decodeURIComponent(v.join('=')); });
  return out;
}
function authFromRequest(req) {
  const sid = parseCookies(req)['ta_session'];
  return sid ? getSession(sid) : null;
}
function requireAuth(req, res) {
  const a = authFromRequest(req);
  if (!a) { sendJson(res, 401, { error: 'Not authenticated' }); return null; }
  return a;
}
function sessionCookie(sid, maxAge = SESSION_HRS * 3600) {
  return `ta_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}`;
}

// ── Static serving ────────────────────────────────────────────────────────────
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.ico':'image/x-icon', '.png':'image/png', '.svg':'image/svg+xml' };
async function serveStatic(reqPath, res) {
  const safe = reqPath === '/' ? '/index.html' : reqPath;
  const fp = join(__dirname, safe.replace(/\.\./g, ''));
  try {
    await stat(fp);
    res.writeHead(200, { 'Content-Type': MIME[extname(fp)] || 'application/octet-stream' });
    createReadStream(fp).pipe(res);
  } catch { sendText(res, 404, 'Not found'); }
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
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'HTTP-Referer': 'https://ticket-analyzer.railway.app', 'X-Title': 'Ticket Analyzer' }
    }, (r) => {
      const cs = []; r.on('data', c => cs.push(c));
      r.on('end', () => {
        try { const json = JSON.parse(Buffer.concat(cs).toString()); if (json.error) return reject(new Error(json.error.message || 'Provider error')); resolve((json.choices?.[0]?.message?.content || '').trim()); }
        catch { reject(new Error('Invalid AI response')); }
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
function parseCsvBuffer(buf) {
  return csvParse(buf, { columns: true, skip_empty_lines: true, trim: true, bom: true, relax_quotes: true, relax_column_count: true });
}
function buildTicket(row, mapping) {
  const get = f => { const col = mapping[f]; return col ? (row[col] || '').toString().trim() : ''; };
  return { ticket_id: get('ticket_id'), ticket_date: get('ticket_date'), category: get('category'), priority: get('priority'), status: get('status'), assignee: get('assignee'), description: get('description'), resolution: get('resolution'), raw_data: row };
}

async function buildAiContext(uploadId) {
  const where = uploadId ? 'WHERE upload_id = $1' : '';
  const p = uploadId ? [uploadId] : [];
  const pidx = uploadId ? 2 : 1;

  const total      = (await q(`SELECT COUNT(*) as n FROM ta_tickets ${where}`, p)).rows[0].n;
  const byCategory = (await q(`SELECT category as label, COUNT(*) as n FROM ta_tickets ${where} GROUP BY category ORDER BY n DESC LIMIT 15`, p)).rows;
  const byPriority = (await q(`SELECT priority as label, COUNT(*) as n FROM ta_tickets ${where} GROUP BY priority ORDER BY n DESC`, p)).rows;
  const byStatus   = (await q(`SELECT status as label, COUNT(*) as n FROM ta_tickets ${where} GROUP BY status ORDER BY n DESC`, p)).rows;
  const byAssignee = (await q(`SELECT assignee as label, COUNT(*) as n FROM ta_tickets ${where} GROUP BY assignee ORDER BY n DESC LIMIT 10`, p)).rows;
  const sample     = (await q(`SELECT description, category, priority, status, assignee, resolution FROM ta_tickets ${where} ORDER BY RANDOM() LIMIT 30`, p)).rows;

  return `RESUMEN DE TICKETS (Total: ${total})
Por categoría: ${byCategory.map(r=>`${r.label||'N/A'}(${r.n})`).join(', ')}
Por prioridad: ${byPriority.map(r=>`${r.label||'N/A'}(${r.n})`).join(', ')}
Por estado: ${byStatus.map(r=>`${r.label||'N/A'}(${r.n})`).join(', ')}
Por asignado: ${byAssignee.map(r=>`${r.label||'N/A'}(${r.n})`).join(', ')}
MUESTRA (${sample.length} tickets):
${sample.map((t,i)=>`[${i+1}] ${t.description||'-'} | cat:${t.category||'-'} | pri:${t.priority||'-'} | est:${t.status||'-'} | asig:${t.assignee||'-'}`).join('\n')}`.trim();
}

function toCsv(rows) {
  if (!rows.length) return '';
  const h = Object.keys(rows[0]);
  const esc = v => { const s = String(v??''); return s.match(/[,"\n]/) ? `"${s.replace(/"/g,'""')}"` : s; };
  return [h.join(','), ...rows.map(r => h.map(k => esc(r[k])).join(','))].join('\r\n');
}

// ── Router ────────────────────────────────────────────────────────────────────
async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;
  const method = req.method;

  try {
    // Public auth routes
    if (path === '/api/login' && method === 'POST') {
      const { username, password } = await readBody(req);
      const r = await q('SELECT * FROM ta_users WHERE username = $1', [username]);
      if (!r.rows.length || !verifyPassword(password, r.rows[0].password_hash))
        return sendJson(res, 401, { error: 'Invalid credentials' });
      const sid = createSession(username);
      res.writeHead(200, { 'Set-Cookie': sessionCookie(sid), 'Content-Type': 'application/json', ...SEC_HEADERS });
      return res.end(JSON.stringify({ ok: true, username }));
    }

    if (path === '/api/logout' && method === 'POST') {
      const sid = parseCookies(req)['ta_session'];
      if (sid) sessions.delete(sid);
      res.writeHead(200, { 'Set-Cookie': sessionCookie('', 0), 'Content-Type': 'application/json', ...SEC_HEADERS });
      return res.end(JSON.stringify({ ok: true }));
    }

    if (path === '/api/me' && method === 'GET') {
      const auth = authFromRequest(req);
      return auth ? sendJson(res, 200, { username: auth.username }) : sendJson(res, 401, { error: 'Not authenticated' });
    }

    // Protected routes
    if (path.startsWith('/api/')) {
      if (!requireAuth(req, res)) return;

      // POST /api/upload
      if (path === '/api/upload' && method === 'POST') {
        const ct = req.headers['content-type'] || '';
        if (!ct.includes('multipart/form-data')) return sendJson(res, 400, { error: 'Expected multipart/form-data' });
        const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_BODY } });
        let csvBuffer = null, fileName = 'upload.csv', weekLabel = '', notes = '', mappingJson = '';
        bb.on('file', (name, stream, info) => { fileName = info.filename || 'upload.csv'; const cs = []; stream.on('data', c => cs.push(c)); stream.on('end', () => { csvBuffer = Buffer.concat(cs); }); });
        bb.on('field', (name, val) => { if (name==='week_label') weekLabel=val; if (name==='notes') notes=val; if (name==='mapping') mappingJson=val; });
        await new Promise((resolve, reject) => { bb.on('finish', resolve); bb.on('error', reject); req.pipe(bb); });

        if (!csvBuffer?.length) return sendJson(res, 400, { error: 'No file received' });
        let rows;
        try { rows = parseCsvBuffer(csvBuffer); } catch (e) { return sendJson(res, 422, { error: 'Cannot parse CSV: ' + e.message }); }
        if (!rows.length) return sendJson(res, 422, { error: 'CSV has no rows' });

        const headers = Object.keys(rows[0]);
        if (!mappingJson) return sendJson(res, 200, { step: 'map_headers', headers, row_count: rows.length, sample: rows.slice(0, 3) });

        let mapping;
        try { mapping = JSON.parse(mappingJson); } catch { return sendJson(res, 400, { error: 'Invalid mapping JSON' }); }

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const upRes = await client.query(
            'INSERT INTO ta_uploads (filename, original_headers, column_mapping, row_count, week_label, notes) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [fileName, JSON.stringify(headers), JSON.stringify(mapping), rows.length, weekLabel||null, notes||null]
          );
          const uploadId = upRes.rows[0].id;
          for (const row of rows) {
            const t = buildTicket(row, mapping);
            await client.query(
              'INSERT INTO ta_tickets (upload_id, raw_data, ticket_id, ticket_date, category, priority, status, assignee, description, resolution) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [uploadId, JSON.stringify(t.raw_data), t.ticket_id||null, t.ticket_date||null, t.category||null, t.priority||null, t.status||null, t.assignee||null, t.description||null, t.resolution||null]
            );
          }
          await client.query('COMMIT');
          return sendJson(res, 201, { ok: true, upload_id: uploadId, row_count: rows.length });
        } catch (e) { await client.query('ROLLBACK'); throw e; }
        finally { client.release(); }
      }

      // GET /api/uploads
      if (path === '/api/uploads' && method === 'GET') {
        const r = await q('SELECT id, filename, row_count, week_label, notes, uploaded_at FROM ta_uploads ORDER BY uploaded_at DESC');
        return sendJson(res, 200, { uploads: r.rows });
      }

      // DELETE /api/uploads/:id
      const delMatch = path.match(/^\/api\/uploads\/(\d+)$/);
      if (delMatch && method === 'DELETE') {
        await q('DELETE FROM ta_uploads WHERE id = $1', [parseInt(delMatch[1])]);
        return sendJson(res, 200, { ok: true });
      }

      // GET /api/dashboard
      if (path === '/api/dashboard' && method === 'GET') {
        const uid = url.searchParams.get('upload_id') ? parseInt(url.searchParams.get('upload_id')) : null;
        const w = uid ? 'WHERE upload_id = $1' : '';
        const p = uid ? [uid] : [];
        const [total, byCategory, byPriority, byStatus, byAssignee, byWeek] = await Promise.all([
          q(`SELECT COUNT(*) as n FROM ta_tickets ${w}`, p),
          q(`SELECT category as label, COUNT(*) as value FROM ta_tickets ${w} GROUP BY category ORDER BY value DESC LIMIT 12`, p),
          q(`SELECT priority as label, COUNT(*) as value FROM ta_tickets ${w} GROUP BY priority ORDER BY value DESC`, p),
          q(`SELECT status as label, COUNT(*) as value FROM ta_tickets ${w} GROUP BY status ORDER BY value DESC`, p),
          q(`SELECT assignee as label, COUNT(*) as value FROM ta_tickets ${w} GROUP BY assignee ORDER BY value DESC LIMIT 10`, p),
          q(`SELECT u.week_label as label, COUNT(t.id) as value FROM ta_tickets t JOIN ta_uploads u ON t.upload_id = u.id ${uid ? 'WHERE t.upload_id = $1' : ''} GROUP BY u.week_label, u.uploaded_at ORDER BY u.uploaded_at`, p),
        ]);
        return sendJson(res, 200, {
          total: parseInt(total.rows[0].n),
          byCategory: byCategory.rows, byPriority: byPriority.rows,
          byStatus: byStatus.rows, byAssignee: byAssignee.rows, byWeek: byWeek.rows,
        });
      }

      // POST /api/ai/chat
      if (path === '/api/ai/chat' && method === 'POST') {
        const { question, upload_id } = await readBody(req);
        if (!question?.trim()) return sendJson(res, 400, { error: 'question is required' });
        const context = await buildAiContext(upload_id || null);
        const answer = await callAI([
          { role: 'system', content: `Eres un analista experto de tickets de soporte. Responde SIEMPRE en español. Sé conciso y usa los datos reales. No inventes números.\n\n${context}` },
          { role: 'user', content: question }
        ]);
        return sendJson(res, 200, { answer });
      }

      // GET /api/export/csv
      if (path === '/api/export/csv' && method === 'GET') {
        const uid = url.searchParams.get('upload_id') ? parseInt(url.searchParams.get('upload_id')) : null;
        const w = uid ? 'WHERE upload_id = $1' : '';
        const p = uid ? [uid] : [];
        const r = await q(`SELECT ticket_id, ticket_date, category, priority, status, assignee, description, resolution FROM ta_tickets ${w}`, p);
        const csv = toCsv(r.rows);
        const fname = uid ? `tickets_upload_${uid}.csv` : 'tickets_all.csv';
        res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="${fname}"`, ...SEC_HEADERS });
        return res.end(csv);
      }

      return sendJson(res, 404, { error: 'API endpoint not found' });
    }

    await serveStatic(path, res);
  } catch (err) {
    if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
    console.error('[error]', err);
    sendJson(res, 500, { error: 'Internal server error' });
  }
}

// ── Start ─────────────────────────────────────────────────────────────────────
await initDb();
const server = createServer(handleRequest);
server.listen(PORT, () => console.log(`[server] Ticket Analyzer on port ${PORT}`));
