// ── State ────────────────────────────────────────────────────────────────────
let uploads = [];
let currentFile = null;
let detectedHeaders = [];
let rowCount = 0;
let uploadStep = 'file'; // 'file' | 'map' | 'done'
let charts = {};

const STANDARD_FIELDS = [
  { key: 'ticket_id',   label: 'ID del Ticket' },
  { key: 'ticket_date', label: 'Fecha' },
  { key: 'category',    label: 'Categoría' },
  { key: 'priority',    label: 'Prioridad' },
  { key: 'status',      label: 'Estado' },
  { key: 'assignee',    label: 'Asignado a' },
  { key: 'description', label: 'Descripción' },
  { key: 'resolution',  label: 'Resolución' },
];

// ── API ──────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, credentials: 'include', headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(path, opts);
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json.error || `HTTP ${r.status}`);
  return json;
}

// ── Init ─────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const me = await api('GET', '/api/me');
    showApp(me.username);
  } catch {
    showLogin();
  }
})();

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp(username) {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('nav-user').textContent = username;
  loadUploads();
}

// ── Login ────────────────────────────────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  try {
    const r = await api('POST', '/api/login', { username, password });
    showApp(r.username);
  } catch (err) {
    errEl.textContent = 'Usuario o contraseña incorrectos';
    errEl.classList.remove('hidden');
  }
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  showLogin();
});

// ── Nav tabs ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    const tab = document.getElementById('tab-' + btn.dataset.tab);
    tab.classList.add('active');
    if (btn.dataset.tab === 'dashboard') loadDashboard();
  });
});

// ── Uploads ──────────────────────────────────────────────────────────────────
async function loadUploads() {
  const r = await api('GET', '/api/uploads');
  uploads = r.uploads;
  renderUploads();
  populateUploadFilters();
}

function renderUploads() {
  const el = document.getElementById('uploads-list');
  if (!uploads.length) {
    el.innerHTML = '<div class="uploads-empty"><p style="font-size:2rem">📂</p><p>Aún no has subido ningún CSV</p><p style="font-size:0.85rem;margin-top:0.3rem">Haz clic en "+ Subir CSV" para empezar</p></div>';
    return;
  }
  el.innerHTML = uploads.map(u => `
    <div class="upload-card">
      <div class="upload-card-header">
        <div>
          <div class="upload-card-title">${esc(u.filename)}</div>
          ${u.week_label ? `<span class="upload-card-week">📅 ${esc(u.week_label)}</span>` : ''}
        </div>
      </div>
      <div class="upload-card-meta">🗂 ${u.row_count.toLocaleString()} tickets</div>
      <div class="upload-card-meta">🕐 ${new Date(u.uploaded_at).toLocaleString('es')}</div>
      ${u.notes ? `<div class="upload-card-notes">${esc(u.notes)}</div>` : ''}
      <div class="upload-card-actions">
        <button class="btn-secondary" onclick="dashboardForUpload(${u.id})">📊 Dashboard</button>
        <button class="btn-secondary" onclick="aiForUpload(${u.id})">🤖 Chat IA</button>
        <button class="btn-danger" onclick="deleteUpload(${u.id})">🗑</button>
      </div>
    </div>
  `).join('');
}

function populateUploadFilters() {
  const options = uploads.map(u => `<option value="${u.id}">${esc(u.filename)} ${u.week_label ? '('+u.week_label+')' : ''}</option>`).join('');
  document.getElementById('dash-upload-filter').innerHTML = '<option value="">Todos los uploads</option>' + options;
  document.getElementById('ai-upload-filter').innerHTML = '<option value="">Todos los uploads</option>' + options;
}

async function deleteUpload(id) {
  if (!confirm('¿Eliminar este upload y todos sus tickets?')) return;
  await api('DELETE', `/api/uploads/${id}`);
  await loadUploads();
  if (document.getElementById('tab-dashboard').classList.contains('active')) loadDashboard();
}

function dashboardForUpload(id) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="dashboard"]').classList.add('active');
  document.getElementById('tab-dashboard').classList.add('active');
  document.getElementById('dash-upload-filter').value = id;
  loadDashboard();
}

function aiForUpload(id) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="ai"]').classList.add('active');
  document.getElementById('tab-ai').classList.add('active');
  document.getElementById('ai-upload-filter').value = id;
}

// ── Upload Modal ──────────────────────────────────────────────────────────────
document.getElementById('btn-open-upload').addEventListener('click', openUploadModal);
document.getElementById('btn-close-modal').addEventListener('click', closeUploadModal);
document.getElementById('upload-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeUploadModal(); });

function openUploadModal() {
  uploadStep = 'file';
  currentFile = null;
  detectedHeaders = [];
  document.getElementById('upload-step-file').classList.remove('hidden');
  document.getElementById('upload-step-map').classList.add('hidden');
  document.getElementById('upload-step-done').classList.add('hidden');
  document.getElementById('upload-error').classList.add('hidden');
  document.getElementById('btn-upload-next').textContent = 'Siguiente';
  document.getElementById('upload-modal').classList.remove('hidden');
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.add('hidden');
}

// Drag & drop
const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('click', () => document.getElementById('file-input').click());
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); const f = e.dataTransfer.files[0]; if (f) selectFile(f); });
document.getElementById('file-input').addEventListener('change', e => { if (e.target.files[0]) selectFile(e.target.files[0]); });

function selectFile(file) {
  currentFile = file;
  dropZone.querySelector('p').textContent = `📄 ${file.name}`;
}

document.getElementById('btn-upload-next').addEventListener('click', handleUploadNext);

async function handleUploadNext() {
  if (uploadStep === 'file') {
    if (!currentFile) { showUploadError('Selecciona un archivo CSV primero.'); return; }
    const fd = new FormData();
    fd.append('file', currentFile);
    fd.append('week_label', document.getElementById('upload-week').value.trim());
    fd.append('notes', document.getElementById('upload-notes').value.trim());
    const btn = document.getElementById('btn-upload-next');
    btn.disabled = true; btn.textContent = 'Leyendo...';
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      if (json.step === 'map_headers') {
        detectedHeaders = json.headers;
        rowCount = json.row_count;
        showMappingStep(json.headers, json.row_count, json.sample);
      }
    } catch (err) {
      showUploadError(err.message);
    } finally { btn.disabled = false; btn.textContent = 'Siguiente'; }

  } else if (uploadStep === 'map') {
    const mapping = {};
    document.querySelectorAll('.map-row select').forEach(sel => {
      if (sel.value) mapping[sel.value] = sel.dataset.col;
    });
    if (!Object.keys(mapping).length) { showMapError('Mapea al menos una columna.'); return; }
    const fd = new FormData();
    fd.append('file', currentFile);
    fd.append('week_label', document.getElementById('upload-week').value.trim());
    fd.append('notes', document.getElementById('upload-notes').value.trim());
    fd.append('mapping', JSON.stringify(mapping));
    const btn = document.getElementById('btn-upload-next');
    btn.disabled = true; btn.textContent = 'Importando...';
    try {
      const r = await fetch('/api/upload', { method: 'POST', credentials: 'include', body: fd });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      showDoneStep(json.row_count);
      await loadUploads();
    } catch (err) {
      showMapError(err.message);
    } finally { btn.disabled = false; btn.textContent = 'Finalizar'; }

  } else if (uploadStep === 'done') {
    closeUploadModal();
  }
}

function showMappingStep(headers, count, sample) {
  uploadStep = 'map';
  document.getElementById('upload-step-file').classList.add('hidden');
  document.getElementById('upload-step-map').classList.remove('hidden');
  document.getElementById('map-row-count').textContent = count.toLocaleString();
  document.getElementById('btn-upload-next').textContent = 'Importar';

  // Auto-guess mapping
  const autoMap = autoGuessMapping(headers);

  const grid = document.getElementById('mapping-grid');
  grid.innerHTML = headers.map(h => {
    const guessed = autoMap[h] || '';
    const opts = STANDARD_FIELDS.map(f => `<option value="${f.key}" ${guessed === f.key ? 'selected' : ''}>${f.label}</option>`).join('');
    return `<div class="map-row">
      <span class="col-name" title="${esc(h)}">${esc(h)}</span>
      <span class="map-arrow">→</span>
      <select data-col="${esc(h)}"><option value="">-- ignorar --</option>${opts}</select>
    </div>`;
  }).join('');
}

function autoGuessMapping(headers) {
  const map = {};
  const rules = [
    { field: 'ticket_id',   patterns: [/^id$/i, /ticket.?id/i, /numero/i, /number/i, /num/i, /jd/i] },
    { field: 'ticket_date', patterns: [/date/i, /fecha/i, /created/i, /opened/i, /open/i] },
    { field: 'category',    patterns: [/categ/i, /type/i, /tipo/i, /group/i] },
    { field: 'priority',    patterns: [/prior/i, /urgenc/i, /sever/i] },
    { field: 'status',      patterns: [/status/i, /estado/i, /state/i] },
    { field: 'assignee',    patterns: [/assign/i, /owner/i, /responsible/i, /agent/i, /tecnico/i, /técnico/i] },
    { field: 'description', patterns: [/desc/i, /title/i, /subject/i, /summary/i, /problem/i, /issue/i, /titulo/i] },
    { field: 'resolution',  patterns: [/resol/i, /solution/i, /fix/i, /comment/i, /close/i] },
  ];
  const used = new Set();
  for (const { field, patterns } of rules) {
    for (const h of headers) {
      if (used.has(field)) break;
      if (patterns.some(p => p.test(h))) { map[h] = field; used.add(field); break; }
    }
  }
  return map;
}

function showDoneStep(count) {
  uploadStep = 'done';
  document.getElementById('upload-step-map').classList.add('hidden');
  document.getElementById('upload-step-done').classList.remove('hidden');
  document.getElementById('done-msg').textContent = `${count.toLocaleString()} tickets importados correctamente`;
  document.getElementById('btn-upload-next').textContent = 'Cerrar';
}

function showUploadError(msg) { const e = document.getElementById('upload-error'); e.textContent = msg; e.classList.remove('hidden'); }
function showMapError(msg) { const e = document.getElementById('map-error'); e.textContent = msg; e.classList.remove('hidden'); }

// ── Dashboard ─────────────────────────────────────────────────────────────────
const CHART_COLORS = ['#6c63ff','#4ade80','#f59e0b','#ef4444','#22d3ee','#f472b6','#a78bfa','#34d399','#fb923c','#60a5fa','#e879f9','#facc15'];

document.getElementById('dash-upload-filter').addEventListener('change', loadDashboard);
document.getElementById('btn-export-csv').addEventListener('click', exportCsv);

async function loadDashboard() {
  const uploadId = document.getElementById('dash-upload-filter').value;
  const qs = uploadId ? `?upload_id=${uploadId}` : '';
  try {
    const d = await api('GET', `/api/dashboard${qs}`);
    document.getElementById('dash-total').innerHTML = `${d.total.toLocaleString()} tickets <span>en total</span>`;
    renderChart('chart-category', 'bar',   d.byCategory);
    renderChart('chart-priority', 'doughnut', d.byPriority);
    renderChart('chart-status',   'doughnut', d.byStatus);
    renderChart('chart-assignee', 'bar',   d.byAssignee);
    renderChart('chart-week',     'line',  d.byWeek);
  } catch (err) {
    console.error('Dashboard error:', err);
  }
}

function renderChart(id, type, data) {
  if (charts[id]) { charts[id].destroy(); }
  const ctx = document.getElementById(id).getContext('2d');
  const labels = data.map(d => d.label || 'N/A');
  const values = data.map(d => d.value);
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: type === 'line' ? 'rgba(108,99,255,0.15)' : colors,
        borderColor: type === 'line' ? '#6c63ff' : colors,
        borderWidth: type === 'line' ? 2 : 1,
        fill: type === 'line',
        tension: 0.4,
        pointBackgroundColor: '#6c63ff',
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: type !== 'bar', labels: { color: '#8892a4', boxWidth: 12, font: { size: 11 } } },
      },
      scales: (type === 'bar' || type === 'line') ? {
        x: { ticks: { color: '#8892a4', font: { size: 10 } }, grid: { color: '#2e3350' } },
        y: { ticks: { color: '#8892a4' }, grid: { color: '#2e3350' }, beginAtZero: true }
      } : {}
    }
  });
}

function exportCsv() {
  const uploadId = document.getElementById('dash-upload-filter').value;
  const qs = uploadId ? `?upload_id=${uploadId}` : '';
  window.location.href = `/api/export/csv${qs}`;
}

// ── AI Chat ───────────────────────────────────────────────────────────────────
document.getElementById('ai-send').addEventListener('click', aiSend);
document.getElementById('ai-input').addEventListener('keydown', e => { if (e.key === 'Enter') aiSend(); });
document.querySelectorAll('.suggestion-chip').forEach(btn => {
  btn.addEventListener('click', () => { document.getElementById('ai-input').value = btn.dataset.q; aiSend(); });
});

async function aiSend() {
  const input = document.getElementById('ai-input');
  const question = input.value.trim();
  if (!question) return;
  input.value = '';

  appendMsg('user', question);
  const loading = appendMsg('ai', '⏳ Analizando...', 'ai-loading');

  const uploadId = document.getElementById('ai-upload-filter').value;

  try {
    const r = await api('POST', '/api/ai/chat', { question, upload_id: uploadId ? parseInt(uploadId) : undefined });
    loading.remove();
    appendMsg('ai', r.answer);
  } catch (err) {
    loading.remove();
    appendMsg('ai', '⚠️ ' + (err.message || 'Error al conectar con la IA'));
  }
}

function appendMsg(role, text, extraClass = '') {
  const msgs = document.getElementById('ai-messages');
  const div = document.createElement('div');
  div.className = `ai-msg ${role}${extraClass ? ' ' + extraClass : ''}`;
  div.innerHTML = `
    <div class="ai-avatar">${role === 'user' ? '👤' : '🤖'}</div>
    <div class="ai-bubble">${text.replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
  `;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
