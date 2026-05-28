require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { Server: IOServer } = require('socket.io');
const cookieParser = require('cookie-parser');
const app = express();

const PORTAL_LOGIN_USERNAME = (process.env.PORTAL_LOGIN_USERNAME || '').trim();
const PORTAL_LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || '';
const IS_DEMO_AUTH_CONFIGURED = Boolean(PORTAL_LOGIN_USERNAME && PORTAL_LOGIN_PASSWORD);
const AUTH_COOKIE_NAME = 'currentUser';
const AUTH_COOKIE_SECRET = (process.env.AUTH_COOKIE_SECRET || 'dev-auth-cookie-secret-change-me').trim();
const DONE_STATUSES = ['DONE', 'RESOLVED', 'CLOSED'];

function isAuthenticatedUser(user) {
  return Boolean(user && user !== 'guest');
}

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
app.use(cookieParser(AUTH_COOKIE_SECRET));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// middleware to extract current user from cookie
app.use((req, res, next) => {
  req.currentUser = req.signedCookies[AUTH_COOKIE_NAME] || 'guest';
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

function getActor(req) {
  return isAuthenticatedUser(req.currentUser) ? req.currentUser : 'anonymous';
}

function toStatusLabel(status) {
  if (!status || status === 'OPEN') return 'New';
  if (DONE_STATUSES.includes(status)) return 'Done';
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function validateDoneTransition({ existingStatus, existingAssignee, nextStatus }) {
  const current = String(existingStatus || 'OPEN').toUpperCase();
  const next = String(nextStatus || current).toUpperCase();
  const assignee = (existingAssignee || '').trim();

  if (!DONE_STATUSES.includes(next)) return null;
  if (!assignee) return 'Assign the incident before marking it Done.';
  if (!DONE_STATUSES.includes(current) && current !== 'IN_PROGRESS') {
    return 'Move the incident to In Progress before marking it Done.';
  }
  return null;
}

function getSlaTargetHours(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'critical': return 4;
    case 'high': return 24;
    case 'medium': return 72;
    default: return 120;
  }
}

function buildSlaSummary(report) {
  const createdAtMs = new Date(report.createdAt).getTime();
  if (Number.isNaN(createdAtMs)) {
    return { targetHours: null, state: 'Unknown', detail: 'Created date unavailable' };
  }

  const targetHours = getSlaTargetHours(report.priority);
  const deadlineMs = createdAtMs + (targetHours * 60 * 60 * 1000);
  const isClosed = DONE_STATUSES.includes((report.status || '').toUpperCase());
  const effectiveEndMs = isClosed && report.resolvedAt ? new Date(report.resolvedAt).getTime() : Date.now();
  const elapsedHours = (effectiveEndMs - createdAtMs) / (1000 * 60 * 60);
  const ratio = elapsedHours / targetHours;

  if (isClosed) {
    if (effectiveEndMs <= deadlineMs) {
      return { targetHours, state: 'Met', detail: 'Resolved within SLA' };
    }
    return { targetHours, state: 'Missed', detail: 'Resolved after SLA target' };
  }

  if (Date.now() > deadlineMs) {
    return { targetHours, state: 'Breached', detail: 'SLA target exceeded' };
  }

  if (ratio >= 0.8) {
    return { targetHours, state: 'At Risk', detail: 'Approaching SLA deadline' };
  }

  return { targetHours, state: 'On Track', detail: 'Within SLA target' };
}

function withToast(pathname, type, message) {
  const [basePath, existingQuery = ''] = pathname.split('?');
  const params = new URLSearchParams(existingQuery);
  params.set('toast', type);
  params.set('toastMessage', message);
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}

async function logActivity(prismaClient, { reportId, actor, action, details }) {
  try {
    await prismaClient.activityLog.create({
      data: {
        reportId,
        actor,
        action,
        details: details || null
      }
    });
  } catch (err) {
    console.error('Failed to log activity:', err.message || err);
  }
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

app.get('/login', (req, res) => {
  if (isAuthenticatedUser(req.currentUser)) return res.redirect('/dashboard');
  res.render('login', {
    appName: app.locals.appName,
    error: null,
    username: ''
  });
});

app.post('/login', (req, res) => {
  const username = (req.body.username || '').trim();
  const password = req.body.password || '';

  if (!IS_DEMO_AUTH_CONFIGURED) {
    return res.status(500).render('login', {
      appName: app.locals.appName,
      error: 'Login is not configured. Set PORTAL_LOGIN_USERNAME and PORTAL_LOGIN_PASSWORD in .env.',
      username
    });
  }

  if (!username || !password) {
    return res.status(400).render('login', {
      appName: app.locals.appName,
      error: 'Please enter both username and password.',
      username
    });
  }

  if (username !== PORTAL_LOGIN_USERNAME || password !== PORTAL_LOGIN_PASSWORD) {
    return res.status(401).render('login', {
      appName: app.locals.appName,
      error: 'Invalid username or password.',
      username
    });
  }

  res.cookie(AUTH_COOKIE_NAME, username, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
  return res.redirect('/dashboard');
});

app.post('/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME, { signed: true });
  res.clearCookie(AUTH_COOKIE_NAME);
  return res.redirect('/login');
});

app.use((req, res, next) => {
  const publicPaths = ['/login', '/logout'];
  if (publicPaths.includes(req.path)) return next();
  if (isAuthenticatedUser(req.currentUser)) return next();
  return res.redirect('/login');
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
  const kpiOpen = reports.filter(r => (r.status || 'OPEN') === 'OPEN').length;
  const kpiInProgress = reports.filter(r => r.status === 'IN_PROGRESS').length;
  const kpiDone = reports.filter(r => DONE_STATUSES.includes((r.status || '').toUpperCase())).length;
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
  if (filter === 'myIncidents') {
    filteredReports = reports.filter(r => r.reporter === currentUser);
  } else if (filter === 'assigned') {
    filteredReports = reports.filter(r => r.assignee && r.assignee.trim() !== '');
  } else if (filter === 'unassigned') {
    filteredReports = reports.filter(r => !r.assignee || r.assignee.trim() === '');
  }
  if (status) {
    if (status.toLowerCase() === 'open') {
      filteredReports = filteredReports.filter(r => (r.status || 'OPEN').toUpperCase() === 'OPEN');
    } else if (status.toLowerCase() === 'done') {
      filteredReports = filteredReports.filter(r => DONE_STATUSES.includes((r.status || '').toUpperCase()));
    } else {
      filteredReports = filteredReports.filter(r => (r.status || 'OPEN').toLowerCase() === status.toLowerCase());
    }
  }
  if (assignee) {
    if (assignee === 'unassigned') {
      filteredReports = filteredReports.filter(r => !r.assignee || r.assignee.trim() === '');
    } else {
      filteredReports = filteredReports.filter(r => (r.assignee || '').trim() === assignee);
    }
  }
  let currentViewLabel = 'All Incidents';
  if (assignee) {
    currentViewLabel = assignee === 'unassigned'
      ? 'Unassigned Incidents'
      : currentUser && assignee === currentUser
        ? 'Assigned to Me'
        : `Assigned to ${assignee}`;
  } else if (status) {
    if (status.toLowerCase() === 'open') currentViewLabel = 'New Incidents';
    else if (status.toLowerCase() === 'in_progress') currentViewLabel = 'In Progress';
    else if (status.toLowerCase() === 'done') currentViewLabel = 'Done Incidents';
    else currentViewLabel = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  } else if (filter === 'myIncidents') {
    currentViewLabel = 'Opened by Me';
  } else if (filter === 'assigned') {
    currentViewLabel = 'Assigned Incidents';
  } else if (filter === 'unassigned') {
    currentViewLabel = 'Unassigned Incidents';
  }
  res.render('incidents', {
    appName: app.locals.appName,
    currentUser,
    filter,
    status,
    assignee,
    currentViewLabel,
    reports: filteredReports
  });
});

// Search endpoint
app.get('/search', async (req, res) => {
  const query = (req.query.q || '').toString().trim();
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

  // Filter by search query
  let filteredReports = reports;
  if (query) {
    const queryLower = query.toLowerCase();
    const ticketQuery = query.replace(/^#/, '');
    const isTicketIdQuery = /^#?\d+$/.test(query);

    if (isTicketIdQuery) {
      const ticketId = Number(ticketQuery);
      filteredReports = reports.filter(r => Number(r.id) === ticketId);
    } else {
      const keywords = queryLower
        .replace(/[_-]+/g, ' ')
        .split(/\s+/)
        .filter(Boolean);

      filteredReports = reports.filter(r => {
        const searchableText = [
          r.id,
          `#${r.id}`,
          r.title || '',
          r.description || '',
          r.reporter || '',
          r.assignee || '',
          r.priority || '',
          (r.status || '').replace(/_/g, ' ')
        ]
          .join(' ')
          .toLowerCase();

        return keywords.every(keyword => searchableText.includes(keyword));
      });
    }
    console.log('🔍 [Search] Found', filteredReports.length, 'matching reports');
  }

  res.render('incidents', {
    appName: app.locals.appName,
    currentUser,
    filter: null,
    status: null,
    assignee: null,
    currentViewLabel: query ? `Search Results: ${query}` : 'All Incidents',
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
  const currentUser = req.currentUser;
  try {
    const prisma = getPrisma();
    const report = await prisma.bugReport.findUnique({ where: { id } });
    if (!report) return res.status(404).send('Report not found');

    const comments = await prisma.comment.findMany({
      where: { reportId: id },
      orderBy: { createdAt: 'asc' }
    });

    const activities = await prisma.activityLog.findMany({
      where: {
        reportId: id,
        action: { not: 'Comment added' }
      },
      orderBy: { createdAt: 'desc' },
      take: 25
    });

    const sla = buildSlaSummary(report);

    res.render('report', { report, comments, activities, currentUser, sla });
  } catch (err) {
    console.error('Prisma error on GET /report/:id', err.message || err);
    const reports = readFallbackReports();
    const report = reports.find(r => r.id === id);
    const commentsByReport = readFallbackComments();
    const comments = commentsByReport[String(id)] || [];
    if (report) return res.render('report', { report, comments, activities: [], currentUser, sla: buildSlaSummary(report) });
    res.status(500).send('Database unavailable');
  }
});

app.post('/report/:id/comments', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const text = (req.body.comment || '').trim();
  if (Number.isNaN(id) || !text) {
    return res.redirect(withToast(`/report/${req.params.id}`, 'warning', 'Please enter a comment before submitting.'));
  }
  const author = getActor(req);
  try {
    const prisma = getPrisma();
    await prisma.comment.create({
      data: {
        reportId: id,
        author,
        text
      }
    });
  } catch (err) {
    console.error('Error creating comment:', err.message || err);
    appendFallbackComment(id, {
      author,
      text,
      createdAt: new Date().toISOString()
    });
  }
  return res.redirect(withToast(`/report/${id}`, 'success', 'Comment added successfully.'));
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
  if (Object.keys(data).length === 0) {
    return res.redirect(withToast(`/report/${id}`, 'warning', 'No changes detected.'));
  }

  try {
    const prisma = getPrisma();
    const existing = await prisma.bugReport.findUnique({ where: { id } });
    if (!existing) return res.status(404).send('Incident not found');

    const nextStatus = data.status !== undefined ? String(data.status).toUpperCase() : String(existing.status || 'OPEN').toUpperCase();
    const existingStatus = String(existing.status || 'OPEN').toUpperCase();
    const effectiveAssignee = data.assignee !== undefined ? (data.assignee || null) : (existing.assignee || null);

    if (DONE_STATUSES.includes(existingStatus) && !DONE_STATUSES.includes(nextStatus)) {
      return res.redirect(withToast(`/report/${id}`, 'warning', 'Closed incidents cannot be reopened.'));
    }

    const doneValidationError = validateDoneTransition({
      existingStatus,
      existingAssignee: effectiveAssignee,
      nextStatus
    });
    if (doneValidationError) {
      return res.redirect(withToast(`/report/${id}`, 'warning', doneValidationError));
    }

    const updated = await prisma.bugReport.update({
      where: { id },
      data
    });
    const changes = [];
    if (existing) {
      if (data.title !== undefined && data.title !== existing.title) changes.push('Title updated');
      if (data.description !== undefined && data.description !== existing.description) changes.push('Description updated');
      if (data.priority !== undefined && data.priority !== existing.priority) changes.push(`Priority ${existing.priority} -> ${updated.priority}`);
      if (data.assignee !== undefined && (data.assignee || null) !== (existing.assignee || null)) {
        changes.push(`Assignee ${(existing.assignee || 'Unassigned')} -> ${(updated.assignee || 'Unassigned')}`);
      }
      if (data.status !== undefined && data.status !== existing.status) {
        changes.push(`Status ${toStatusLabel(existing.status)} -> ${toStatusLabel(updated.status)}`);
      }
    }
    await logActivity(prisma, {
      reportId: id,
      actor: getActor(req),
      action: 'Incident updated',
      details: changes.length ? changes.join(' | ') : 'Fields updated'
    });
    if (global.io) global.io.emit('report-updated', updated);
    return res.redirect(withToast(`/report/${id}`, 'success', 'Incident details updated.'));
  } catch (err) {
    console.error('Error updating incident details:', err.message || err);
    try {
      const reports = readFallbackReports();
      const idx = reports.findIndex(r => r.id === id);
      if (idx !== -1) {
        const existingStatus = String(reports[idx].status || 'OPEN').toUpperCase();
        const nextStatus = data.status !== undefined ? String(data.status).toUpperCase() : existingStatus;
        const effectiveAssignee = data.assignee !== undefined ? (data.assignee || null) : (reports[idx].assignee || null);

        if (DONE_STATUSES.includes(existingStatus) && !DONE_STATUSES.includes(nextStatus)) {
          return res.redirect(withToast(`/report/${id}`, 'warning', 'Closed incidents cannot be reopened.'));
        }

        const doneValidationError = validateDoneTransition({
          existingStatus,
          existingAssignee: effectiveAssignee,
          nextStatus
        });
        if (doneValidationError) {
          return res.redirect(withToast(`/report/${id}`, 'warning', doneValidationError));
        }

        if (data.title !== undefined) reports[idx].title = data.title;
        if (data.description !== undefined) reports[idx].description = data.description;
        if (data.priority !== undefined) reports[idx].priority = data.priority;
        if (data.assignee !== undefined) reports[idx].assignee = data.assignee;
        if (data.status !== undefined) {
          reports[idx].status = data.status;
          if (DONE_STATUSES.includes(String(data.status).toUpperCase())) {
            reports[idx].resolvedAt = new Date().toISOString();
          }
        }
        reports[idx].updatedAt = new Date().toISOString();
        saveFallbackReports(reports);
        if (global.io) global.io.emit('report-updated', reports[idx]);
      }
      return res.redirect(withToast(`/report/${id}`, 'success', 'Incident details updated.'));
    } catch (e2) {
      console.error('Fallback incident update failed:', e2.message || e2);
      return res.status(500).send('Database unavailable');
    }
  }
});

app.post('/report/:id/attachment', upload.single('screenshot'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id) || !req.file) {
    return res.redirect(withToast(`/report/${req.params.id}`, 'warning', 'Please select an image to upload.'));
  }
  const screenshot = `/uploads/${req.file.filename}`;
  try {
    const prisma = getPrisma();
    const updated = await prisma.bugReport.update({
      where: { id },
      data: { screenshot }
    });
    await logActivity(prisma, {
      reportId: id,
      actor: getActor(req),
      action: 'Attachment updated',
      details: path.basename(screenshot)
    });
    if (global.io) global.io.emit('report-updated', updated);
    return res.redirect(withToast(`/report/${id}`, 'success', 'Attachment updated successfully.'));
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
      return res.redirect(withToast(`/report/${id}`, 'success', 'Attachment updated successfully.'));
    } catch (e2) {
      console.error('Fallback attachment update failed:', e2.message || e2);
      return res.status(500).send('Database unavailable');
    }
  }
});

app.post('/report/:id/attachment/remove', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.redirect(withToast(`/report/${req.params.id}`, 'error', 'Invalid report id.'));
  }
  try {
    const prisma = getPrisma();
    const existing = await prisma.bugReport.findUnique({ where: { id }, select: { screenshot: true } });
    const updated = await prisma.bugReport.update({
      where: { id },
      data: { screenshot: null }
    });
    await logActivity(prisma, {
      reportId: id,
      actor: getActor(req),
      action: 'Attachment removed',
      details: existing?.screenshot ? path.basename(existing.screenshot) : 'No previous attachment'
    });
    if (global.io) global.io.emit('report-updated', updated);
    return res.redirect(withToast(`/report/${id}`, 'success', 'Attachment removed.'));
  } catch (err) {
    console.error('Error removing attachment:', err.message || err);
    try {
      const reports = readFallbackReports();
      const idx = reports.findIndex(r => r.id === id);
      if (idx !== -1) {
        reports[idx].screenshot = null;
        reports[idx].updatedAt = new Date().toISOString();
        saveFallbackReports(reports);
        if (global.io) global.io.emit('report-updated', reports[idx]);
      }
      return res.redirect(withToast(`/report/${id}`, 'success', 'Attachment removed.'));
    } catch (e2) {
      console.error('Fallback attachment remove failed:', e2.message || e2);
      return res.status(500).send('Database unavailable');
    }
  }
});

app.post('/report/:id/status', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  if (Number.isNaN(id) || !status) return res.status(400).json({ error: 'Invalid request' });
  try {
    const prisma = getPrisma();
    const existing = await prisma.bugReport.findUnique({ where: { id }, select: { status: true, assignee: true } });
    const existingStatus = (existing?.status || 'OPEN').toUpperCase();
    const nextStatus = String(status).toUpperCase();
    if (DONE_STATUSES.includes(existingStatus) && !DONE_STATUSES.includes(nextStatus)) {
      return res.status(400).json({ error: 'Closed incidents cannot be reopened.' });
    }
    const doneValidationError = validateDoneTransition({
      existingStatus,
      existingAssignee: existing?.assignee || null,
      nextStatus
    });
    if (doneValidationError) {
      return res.status(400).json({ error: doneValidationError });
    }
    const updated = await prisma.bugReport.update({
      where: { id },
      data: { status }
    });
    await logActivity(prisma, {
      reportId: id,
      actor: getActor(req),
      action: 'Status changed',
      details: `${toStatusLabel(existing?.status || 'OPEN')} -> ${toStatusLabel(updated.status)}`
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
        const existingStatus = String(reports[idx].status || 'OPEN').toUpperCase();
        const nextStatus = String(status).toUpperCase();
        if (DONE_STATUSES.includes(existingStatus) && !DONE_STATUSES.includes(nextStatus)) {
          return res.status(400).json({ error: 'Closed incidents cannot be reopened.' });
        }
        const doneValidationError = validateDoneTransition({
          existingStatus,
          existingAssignee: reports[idx].assignee || null,
          nextStatus
        });
        if (doneValidationError) {
          return res.status(400).json({ error: doneValidationError });
        }
        reports[idx].status = status;
        if (DONE_STATUSES.includes(nextStatus)) reports[idx].resolvedAt = new Date().toISOString();
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
    const prisma = getPrisma();
    const existing = await prisma.bugReport.findUnique({ where: { id }, select: { assignee: true } });
    const updated = await prisma.bugReport.update({
      where: { id },
      data: { assignee: assignee || null }
    });
    await logActivity(prisma, {
      reportId: id,
      actor: getActor(req),
      action: 'Assignee changed',
      details: `${existing?.assignee || 'Unassigned'} -> ${updated.assignee || 'Unassigned'}`
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
  const { title, description, priority, assignee } = req.body;
  const screenshot = req.file ? `/uploads/${req.file.filename}` : null;
  const reporterName = req.currentUser || 'anonymous';
  const payload = { title, description, priority, reporter: reporterName, screenshot };

  // If assignee provided in form, set it (allow empty = unassigned)
  if (assignee && assignee.trim() !== '') payload.assignee = assignee;

  try {
    console.log('🔄 [POST /report] Creating new report in Prisma database...');
    const prisma = getPrisma();
    const created = await prisma.bugReport.create({ data: payload });
    await logActivity(prisma, {
      reportId: created.id,
      actor: reporterName,
      action: 'Incident created',
      details: `Priority ${created.priority}${created.assignee ? ` | Assigned to ${created.assignee}` : ''}`
    });
    console.log('✅ [POST /report] Report created successfully with ID:', created.id);
    if (global.io) global.io.emit('new-report', created);
    return res.redirect(withToast('/incidents', 'success', 'Incident created successfully.'));
  } catch (err) {
    console.error('❌ [POST /report] Prisma error:', err.message || err);
    console.log('⚠️ [POST /report] Using fallback JSON storage...');
    const created = appendFallbackReport(payload);
    if (global.io) global.io.emit('new-report', created);
    return res.redirect(withToast('/incidents', 'success', 'Incident created successfully.'));
  }
});

const PORT = process.env.PORT || 3000;

if (!IS_DEMO_AUTH_CONFIGURED) {
  console.warn('⚠️ Demo auth is not configured. Set PORTAL_LOGIN_USERNAME and PORTAL_LOGIN_PASSWORD in .env');
}

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
