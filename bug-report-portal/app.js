require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server: IOServer } = require('socket.io');
const cookieParser = require('cookie-parser');
const app = express();

let prisma = null;
function getPrisma() {
  if (!prisma) {
    process.env.PRISMA_CLIENT_ENGINE_TYPE = 'binary';
    const { PrismaClient } = require('@prisma/client');
    // Use the official PostgreSQL adapter so the client engine can be used safely
    const { PrismaPg } = require('@prisma/adapter-pg');
    const adapter = new PrismaPg(process.env.DATABASE_URL);
    prisma = new PrismaClient({ adapter, __internal: { engine: { type: 'binary' } } });
  }
  return prisma;
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
// Branding: App name for use in templates
app.locals.appName = 'OpsCenter';

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// middleware to extract current user from cookie
app.use((req, res, next) => {
  req.currentUser = req.cookies.currentUser || 'guest';
  res.locals.currentUser = req.currentUser;
  next();
});

// data fallback path
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bugReports.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'reportComments.json');

function readFallbackReports() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (e) {
    console.error('Failed reading fallback reports', e.message || e);
    return [];
  }
}

function saveFallbackReports(reports) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed saving fallback reports', e.message || e);
  }
}

function appendFallbackReport(report) {
  const reports = readFallbackReports();
  const maxId = reports.reduce((m, r) => Math.max(m, r.id || 0), 0);
  const newId = maxId + 1 || 1;
  const created = { id: newId, createdAt: new Date().toISOString(), ...report };
  reports.unshift(created);
  saveFallbackReports(reports);
  return created;
}

function readFallbackComments() {
  try {
    if (!fs.existsSync(COMMENTS_FILE)) return {};
    const raw = fs.readFileSync(COMMENTS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error('Failed reading fallback comments', e.message || e);
    return {};
  }
}

function saveFallbackComments(commentsByReport) {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(commentsByReport, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed saving fallback comments', e.message || e);
  }
}

function appendFallbackComment(reportId, comment) {
  const commentsByReport = readFallbackComments();
  const key = String(reportId);
  if (!Array.isArray(commentsByReport[key])) commentsByReport[key] = [];
  commentsByReport[key].push(comment);
  saveFallbackComments(commentsByReport);
  return comment;
}

const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

app.post('/set-user', (req, res) => {
  const { name } = req.body;
  if (name) res.cookie('currentUser', name, { maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.redirect('/');
});


// Redirect root to dashboard
app.get('/', (req, res) => res.redirect('/dashboard'));

// Dashboard page
app.get('/dashboard', async (req, res) => {
  let reports = [];
  let currentUser = req.currentUser;
  try {
    const prisma = getPrisma();
    console.log('🔄 [Dashboard] Fetching from Prisma database...');
    reports = await prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } });
    console.log('✅ [Dashboard] Successfully fetched', reports.length, 'reports from database');
  } catch (e) {
    console.error('❌ [Dashboard] Prisma error:', e.message || e);
    console.log('⚠️ [Dashboard] Falling back to JSON file...');
    reports = readFallbackReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  // KPIs and chart data
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const doneStatuses = ['DONE', 'RESOLVED', 'CLOSED'];
  const kpiOpen = reports.filter(r => (r.status || 'OPEN') === 'OPEN').length;
  const kpiInProgress = reports.filter(r => r.status === 'IN_PROGRESS').length;
  const kpiDone = reports.filter(r => doneStatuses.includes((r.status || '').toUpperCase())).length;
  const kpiResolvedToday = reports.filter(r => doneStatuses.includes((r.status || '').toUpperCase()) && r.resolvedAt && new Date(r.resolvedAt) >= today).length;
  const kpiCritical = reports.filter(r => r.priority === 'Critical' && ['OPEN', 'IN_PROGRESS'].includes((r.status || 'OPEN').toUpperCase())).length;
  // Team-wise assignment breakdown for pie chart
  const teamCountMap = new Map();
  for (const r of reports) {
    const key = r.assignee && r.assignee.trim() !== '' ? r.assignee.trim() : 'unassigned';
    teamCountMap.set(key, (teamCountMap.get(key) || 0) + 1);
  }
  const teamKeys = Array.from(teamCountMap.keys());
  const teamLabels = teamKeys.map(k => {
    if (k === 'support-team') return 'Support Team';
    if (k === 'dev-team') return 'Development Team';
    if (k === 'qa-team') return 'QA Team';
    if (k === 'unassigned') return 'Unassigned';
    return k;
  });
  const teamCounts = teamKeys.map(k => teamCountMap.get(k));
  res.render('dashboard', {
    appName: app.locals.appName,
    currentUser,
    kpiOpen,
    kpiInProgress,
    kpiDone,
    kpiResolvedToday,
    kpiCritical,
    teamKeys,
    teamLabels,
    teamCounts
  });
});

// Incidents page with status filtering
app.get('/incidents', async (req, res) => {
  let reports = [];
  let filter = req.query.filter;
  let status = req.query.status;
  let assignee = req.query.assignee;
  let currentUser = req.currentUser;
  try {
    const prisma = getPrisma();
    console.log('🔄 [Incidents] Fetching from Prisma database...');
    reports = await prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } });
    console.log('✅ [Incidents] Successfully fetched', reports.length, 'reports from database');
  } catch (e) {
    console.error('❌ [Incidents] Prisma error:', e.message || e);
    console.log('⚠️ [Incidents] Falling back to JSON file...');
    reports = readFallbackReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  let filteredReports = reports;
  if (filter === 'myIncidents' && currentUser && currentUser !== 'guest') {
    filteredReports = reports.filter(r => r.reporter === currentUser);
  } else if (filter === 'assigned') {
    filteredReports = reports.filter(r => r.assignee && r.assignee.trim() !== '');
  } else if (filter === 'unassigned') {
    filteredReports = reports.filter(r => !r.assignee || r.assignee.trim() === '');
  }
  if (status) {
    if (status.toLowerCase() === 'open') {
      filteredReports = reports.filter(r => ['OPEN', 'IN_PROGRESS', 'ASSIGNED'].includes((r.status || 'OPEN').toUpperCase()));
    } else if (status.toLowerCase() === 'done') {
      filteredReports = reports.filter(r => ['DONE', 'RESOLVED', 'CLOSED'].includes((r.status || '').toUpperCase()));
    } else {
      filteredReports = filteredReports.filter(r => r.status && r.status.toLowerCase() === status.toLowerCase());
    }
  }
  if (assignee) {
    if (assignee === 'unassigned') {
      filteredReports = filteredReports.filter(r => !r.assignee || r.assignee.trim() === '');
    } else {
      filteredReports = filteredReports.filter(r => (r.assignee || '').trim() === assignee);
    }
  }
  res.render('incidents', {
    appName: app.locals.appName,
    currentUser,
    filter,
    status,
    assignee,
    reports: filteredReports
  });
});

// Search endpoint - NEW ROUTE
app.get('/search', async (req, res) => {
  const query = req.query.q || '';
  let reports = [];
  let currentUser = req.currentUser;
  
  try {
    const prisma = getPrisma();
    console.log('🔄 [Search] Searching for ticket:', query);
    reports = await prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } });
    console.log('✅ [Search] Successfully fetched reports from database');
  } catch (e) {
    console.error('❌ [Search] Prisma error:', e.message || e);
    console.log('⚠️ [Search] Falling back to JSON file...');
    reports = readFallbackReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // Filter by search query - search in ID, title, description, and reporter
  let filteredReports = reports;
  if (query && query.trim() !== '') {
    const queryLower = query.toLowerCase();
    filteredReports = reports.filter(r => 
      r.id.toString().includes(query) ||
      (r.title && r.title.toLowerCase().includes(queryLower)) ||
      (r.description && r.description.toLowerCase().includes(queryLower)) ||
      (r.reporter && r.reporter.toLowerCase().includes(queryLower))
    );
    console.log('🔍 [Search] Found', filteredReports.length, 'matching reports');
  }

  res.render('incidents', {
    appName: app.locals.appName,
    currentUser,
    filter: null,
    status: null,
    reports: filteredReports,
    searchQuery: query
  });
});

// Create Incident page
app.get('/incidents/create', (req, res) => {
  res.render('create-incident', {
    appName: app.locals.appName,
    currentUser: req.currentUser
  });
});


app.get('/report/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).send('Invalid id');
  const commentsByReport = readFallbackComments();
  const comments = commentsByReport[String(id)] || [];
  const currentUser = req.currentUser;
  try {
    const report = await getPrisma().bugReport.findUnique({ where: { id } });
    if (!report) return res.status(404).send('Report not found');
    res.render('report', { report, comments, currentUser });
  } catch (err) {
    console.error('Prisma error on GET /report/:id', err.message || err);
    const reports = readFallbackReports();
    const report = reports.find(r => r.id === id);
    if (report) return res.render('report', { report, comments, currentUser });
    res.status(500).send('Database unavailable');
  }
});

app.post('/report/:id/comments', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const text = (req.body.comment || '').trim();
  if (Number.isNaN(id) || !text) {
    return res.redirect(`/report/${req.params.id}`);
  }
  const author = req.currentUser && req.currentUser !== 'guest' ? req.currentUser : 'anonymous';
  appendFallbackComment(id, {
    author,
    text,
    createdAt: new Date().toISOString()
  });
  return res.redirect(`/report/${id}`);
});

app.post('/report/:id/update', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { title, description, priority, assignee, status } = req.body;
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid request' });

  const data = {};
  if (typeof title === 'string' && title.trim() !== '') data.title = title.trim();
  if (typeof description === 'string' && description.trim() !== '') data.description = description.trim();
  if (typeof priority === 'string' && priority.trim() !== '') data.priority = priority.trim();
  if (assignee !== undefined) data.assignee = assignee && assignee.trim() !== '' ? assignee.trim() : null;
  if (status && status.trim() !== '') data.status = status.trim();
  if (Object.keys(data).length === 0) return res.redirect(`/report/${id}`);

  try {
    const updated = await getPrisma().bugReport.update({
      where: { id },
      data
    });
    if (global.io) global.io.emit('report-updated', updated);
    return res.redirect(`/report/${id}`);
  } catch (err) {
    console.error('Error updating incident details:', err.message || err);
    try {
      const reports = readFallbackReports();
      const idx = reports.findIndex(r => r.id === id);
      if (idx !== -1) {
        if (data.title !== undefined) reports[idx].title = data.title;
        if (data.description !== undefined) reports[idx].description = data.description;
        if (data.priority !== undefined) reports[idx].priority = data.priority;
        if (data.assignee !== undefined) reports[idx].assignee = data.assignee;
        if (data.status !== undefined) {
          reports[idx].status = data.status;
          if (['DONE', 'RESOLVED', 'CLOSED'].includes(data.status)) {
            reports[idx].resolvedAt = new Date().toISOString();
          }
        }
        reports[idx].updatedAt = new Date().toISOString();
        saveFallbackReports(reports);
        if (global.io) global.io.emit('report-updated', reports[idx]);
      }
      return res.redirect(`/report/${id}`);
    } catch (e2) {
      console.error('Fallback incident update failed:', e2.message || e2);
      return res.status(500).send('Database unavailable');
    }
  }
});

app.post('/report/:id/attachment', upload.single('screenshot'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || !req.file) return res.redirect(`/report/${req.params.id}`);
  const screenshot = `/uploads/${req.file.filename}`;
  try {
    const updated = await getPrisma().bugReport.update({
      where: { id },
      data: { screenshot }
    });
    if (global.io) global.io.emit('report-updated', updated);
    return res.redirect(`/report/${id}`);
  } catch (err) {
    console.error('Error updating attachment:', err.message || err);
    try {
      const reports = readFallbackReports();
      const idx = reports.findIndex(r => r.id === id);
      if (idx !== -1) {
        reports[idx].screenshot = screenshot;
        reports[idx].updatedAt = new Date().toISOString();
        saveFallbackReports(reports);
        if (global.io) global.io.emit('report-updated', reports[idx]);
      }
      return res.redirect(`/report/${id}`);
    } catch (e2) {
      console.error('Fallback attachment update failed:', e2.message || e2);
      return res.status(500).send('Database unavailable');
    }
  }
});

app.post('/report/:id/status', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (Number.isNaN(id) || !status) return res.status(400).json({ error: 'Invalid request' });
  try {
    const updated = await getPrisma().bugReport.update({
      where: { id },
      data: { status }
    });
    if (global.io) global.io.emit('report-updated', updated);
    res.json({ success: true, report: updated });
  } catch (err) {
    console.error('Error updating status:', err.message || err);
    // Fallback to file-backed storage when Prisma update not available
    try {
      const reports = readFallbackReports();
      const idx = reports.findIndex(r => r.id === id);
      if (idx !== -1) {
        reports[idx].status = status;
        if (['DONE', 'RESOLVED', 'CLOSED'].includes(status)) reports[idx].resolvedAt = new Date().toISOString();
        reports[idx].updatedAt = new Date().toISOString();
        saveFallbackReports(reports);
        if (global.io) global.io.emit('report-updated', reports[idx]);
        return res.json({ success: true, report: reports[idx] });
      }
    } catch (e2) {
      console.error('Fallback update failed:', e2.message || e2);
    }
    res.status(500).json({ error: 'Database unavailable' });
  }
});

app.post('/report/:id/assign', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { assignee } = req.body;
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid request' });
  try {
    const updated = await getPrisma().bugReport.update({
      where: { id },
      data: { assignee: assignee || null }
    });
    if (global.io) global.io.emit('report-updated', updated);
    res.json({ success: true, report: updated });
  } catch (err) {
    console.error('Error updating assignee:', err.message || err);
    // Fallback to file-backed storage when Prisma update not available
    try {
      const reports = readFallbackReports();
      const idx = reports.findIndex(r => r.id === id);
      if (idx !== -1) {
        reports[idx].assignee = assignee || null;
        reports[idx].updatedAt = new Date().toISOString();
        saveFallbackReports(reports);
        if (global.io) global.io.emit('report-updated', reports[idx]);
        return res.json({ success: true, report: reports[idx] });
      }
    } catch (e2) {
      console.error('Fallback assign failed:', e2.message || e2);
    }
    res.status(500).json({ error: 'Database unavailable' });
  }
});

app.post('/report', upload.single('screenshot'), async (req, res) => {
  const { title, description, priority, reporter, assignee } = req.body;
  const screenshot = req.file ? `/uploads/${req.file.filename}` : null;
  const reporterName = reporter || req.currentUser || 'anonymous';
  const payload = { title, description, priority, reporter: reporterName, screenshot };

  // If assignee provided in form, set it (allow empty = unassigned)
  if (assignee && assignee.trim() !== '') payload.assignee = assignee;

  try {
    console.log('🔄 [POST /report] Creating new report in Prisma database...');
    const created = await getPrisma().bugReport.create({ data: payload });
    console.log('✅ [POST /report] Report created successfully with ID:', created.id);
    if (global.io) global.io.emit('new-report', created);
    return res.redirect('/incidents');
  } catch (err) {
    console.error('❌ [POST /report] Prisma error:', err.message || err);
    console.log('⚠️ [POST /report] Using fallback JSON storage...');
    const created = appendFallbackReport(payload);
    if (global.io) global.io.emit('new-report', created);
    return res.redirect('/incidents');
  }
});

const PORT = process.env.PORT || 3000;

// create http server + socket.io
const server = http.createServer(app);
const io = new IOServer(server);
global.io = io;

io.on('connection', (socket) => {
  console.log('client connected', socket.id);
});

server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  🚀 OpsCenter Bug Report Portal        ║
║  Server running on http://localhost:${PORT}  ║
╚════════════════════════════════════════╝
  `);
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configured' : '❌ Not configured');
});

process.on('SIGINT', async () => {
  if (prisma && typeof prisma.$disconnect === 'function') await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  if (prisma && typeof prisma.$disconnect === 'function') await prisma.$disconnect();
  server.close(() => process.exit(0));
});
