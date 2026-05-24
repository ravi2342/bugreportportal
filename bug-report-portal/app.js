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

// ADD THESE LINES HERE
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
    reports = await prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } });
  } catch (e) {
    reports = readFallbackReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  // KPIs and chart data
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const kpiOpen = reports.filter(r => r.status === 'OPEN').length;
  const kpiInProgress = reports.filter(r => r.status === 'IN_PROGRESS').length;
  const kpiResolved = reports.filter(r => r.status === 'RESOLVED').length;
  const kpiClosed = reports.filter(r => r.status === 'CLOSED').length;
  const kpiResolvedToday = reports.filter(r => r.status === 'RESOLVED' && r.resolvedAt && new Date(r.resolvedAt) >= today).length;
  const kpiCritical = reports.filter(r => r.priority === 'Critical' && (r.status === 'OPEN' || r.status === 'ASSIGNED' || r.status === 'IN_PROGRESS')).length;
  res.render('dashboard', {
    appName: app.locals.appName,
    currentUser,
    kpiOpen,
    kpiInProgress,
    kpiResolved,
    kpiClosed,
    kpiResolvedToday,
    kpiCritical
  });
});

// Incidents page with status filtering
app.get('/incidents', async (req, res) => {
  let reports = [];
  let filter = req.query.filter;
  let status = req.query.status;
  let currentUser = req.currentUser;
  try {
    const prisma = getPrisma();
    reports = await prisma.bugReport.findMany({ orderBy: { createdAt: 'desc' } });
  } catch (e) {
    reports = readFallbackReports().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  let filteredReports = reports;
  if (filter === 'myIncidents' && currentUser && currentUser !== 'guest') {
    filteredReports = reports.filter(r => r.assignee === currentUser);
  }
  if (status) {
    if (status.toLowerCase() === 'open') {
      filteredReports = reports.filter(r => ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes((r.status || 'OPEN').toUpperCase()));
    } else {
      filteredReports = filteredReports.filter(r => r.status && r.status.toLowerCase() === status.toLowerCase());
    }
  }
  res.render('incidents', {
    appName: app.locals.appName,
    currentUser,
    filter,
    status,
    reports: filteredReports
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
  try {
    const report = await getPrisma().bugReport.findUnique({ where: { id } });
    if (!report) return res.status(404).send('Report not found');
    res.render('report', { report });
  } catch (err) {
    console.error('Prisma error on GET /report/:id', err.message || err);
    const reports = readFallbackReports();
    const report = reports.find(r => r.id === id);
    if (report) return res.render('report', { report });
    res.status(500).send('Database unavailable');
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
        if (status === 'RESOLVED') reports[idx].resolvedAt = new Date().toISOString();
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
    const created = await getPrisma().bugReport.create({ data: payload });
    if (global.io) global.io.emit('new-report', created);
    return res.redirect('/incidents');
  } catch (err) {
    console.error('Prisma error on POST /report, using fallback:', err.message || err);
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
  console.log(`Server running on http://localhost:${PORT}`);
});

process.on('SIGINT', async () => {
  if (prisma && typeof prisma.$disconnect === 'function') await prisma.$disconnect();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', async () => {
  if (prisma && typeof prisma.$disconnect === 'function') await prisma.$disconnect();
  server.close(() => process.exit(0));
});