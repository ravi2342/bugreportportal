/**
 * File Storage Helper Functions
 * Fallback JSON file operations for when Prisma is unavailable
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'bugReports.json');
const COMMENTS_FILE = path.join(DATA_DIR, 'reportComments.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

/**
 * Read bug reports from JSON file
 * @returns {Array} Array of bug reports
 */
function readFallbackReports() {
  try {
    if (!fs.existsSync(DATA_FILE)) return [];
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw || '[]');
  } catch (error) {
    console.error('Failed reading fallback reports:', error.message || error);
    return [];
  }
}

/**
 * Write bug reports to JSON file
 * @param {Array} reports - Reports to save
 */
function saveFallbackReports(reports) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(reports, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed saving fallback reports:', error.message || error);
  }
}

/**
 * Read comments from JSON file
 * @returns {Object} Comments keyed by report ID
 */
function readFallbackComments() {
  try {
    if (!fs.existsSync(COMMENTS_FILE)) return {};
    const raw = fs.readFileSync(COMMENTS_FILE, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    console.error('Failed reading fallback comments:', error.message || error);
    return {};
  }
}

/**
 * Write comments to JSON file
 * @param {Object} commentsByReport - Comments keyed by report ID
 */
function saveFallbackComments(commentsByReport) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(COMMENTS_FILE, JSON.stringify(commentsByReport, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed saving fallback comments:', error.message || error);
  }
}

/**
 * Append a new bug report
 * @param {Object} report - Report data
 * @returns {Object} Created report with ID
 */
function appendFallbackReport(report) {
  const reports = readFallbackReports();
  const maxId = reports.reduce((max, r) => Math.max(max, r.id || 0), 0);
  const newId = maxId + 1 || 1;
  const created = {
    id: newId,
    createdAt: new Date().toISOString(),
    ...report
  };
  reports.unshift(created);
  saveFallbackReports(reports);
  return created;
}

/**
 * Append a comment to a report
 * @param {number} reportId - Report ID
 * @param {Object} comment - Comment data
 * @returns {Object} Created comment
 */
function appendFallbackComment(reportId, comment) {
  const commentsByReport = readFallbackComments();
  const key = String(reportId);

  if (!Array.isArray(commentsByReport[key])) {
    commentsByReport[key] = [];
  }

  commentsByReport[key].push(comment);
  saveFallbackComments(commentsByReport);
  return comment;
}

module.exports = {
  readFallbackReports,
  saveFallbackReports,
  readFallbackComments,
  saveFallbackComments,
  appendFallbackReport,
  appendFallbackComment,
  DATA_DIR,
  DATA_FILE,
  COMMENTS_FILE
};
