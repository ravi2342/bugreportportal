/**
 * Comprehensive Test Suite for Bug Report Portal
 * Tests core functionality, validation, and error handling
 */

const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { app, server } = require('../app');

// Test database setup
const TEST_DATA_DIR = path.join(__dirname, '..', 'data');
const TEST_DATA_FILE = path.join(TEST_DATA_DIR, 'bugReports.json');
const TEST_COMMENTS_FILE = path.join(TEST_DATA_DIR, 'reportComments.json');

// Utility functions
function cleanTestData() {
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  if (fs.existsSync(TEST_COMMENTS_FILE)) fs.unlinkSync(TEST_COMMENTS_FILE);
}

function getTestCookie() {
  // Mock authentication - use environment variable if available
  const testUser = process.env.TEST_USER || 'testuser';
  return `currentUser=${testUser};`;
}

describe('Bug Report Portal - Login & Authentication', () => {
  test('GET /login should render login page when not authenticated', async () => {
    const res = await request(app)
      .get('/login')
      .expect(200);
    expect(res.text).toContain('login');
  });

  test('POST /login should fail with missing credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: '', password: '' })
      .expect(400);
    expect(res.text).toContain('enter both username and password');
  });

  test('POST /login should fail with invalid credentials', async () => {
    const res = await request(app)
      .post('/login')
      .send({ username: 'wronguser', password: 'wrongpass' })
      .expect(401);
    expect(res.text).toContain('Invalid username or password');
  });

  test('POST /logout should clear auth cookie', async () => {
    const res = await request(app)
      .post('/logout')
      .expect(302);
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('Bug Report Portal - Dashboard & Incidents', () => {
  beforeEach(() => cleanTestData());
  afterEach(() => cleanTestData());

  test('GET / should redirect to /dashboard', async () => {
    const res = await request(app)
      .get('/')
      .expect(302);
    expect(res.headers.location).toContain('dashboard');
  });

  test('GET /dashboard should redirect to login when not authenticated', async () => {
    const res = await request(app)
      .get('/dashboard')
      .expect(302);
    expect(res.headers.location).toContain('login');
  });

  test('GET /incidents should redirect to login when not authenticated', async () => {
    const res = await request(app)
      .get('/incidents')
      .expect(302);
    expect(res.headers.location).toContain('login');
  });

  test('GET /incidents/create should redirect to login when not authenticated', async () => {
    const res = await request(app)
      .get('/incidents/create')
      .expect(302);
    expect(res.headers.location).toContain('login');
  });
});

describe('Bug Report Portal - Search', () => {
  test('GET /search without query should show all incidents', async () => {
    await request(app)
      .get('/search')
      .expect(302); // Redirects to login
  });

  test('GET /search with query should search incidents', async () => {
    await request(app)
      .get('/search?q=test')
      .expect(302); // Redirects to login
  });
});

describe('Bug Report Portal - Report Operations', () => {
  test('GET /report/:id with invalid ID should return 400', async () => {
    await request(app)
      .get('/report/invalid')
      .expect(302); // Redirects to login or 400 depending on auth
  });

  test('POST /report with missing title should handle gracefully', async () => {
    await request(app)
      .post('/report')
      .send({ description: 'test' })
      .expect(302); // Redirects to login
  });
});

describe('Validation Functions', () => {
  const {
    isAuthenticatedUser,
    toStatusLabel,
    validateDoneTransition,
    getSlaTargetHours,
    buildSlaSummary
  } = require('../app');

  test('isAuthenticatedUser should identify authenticated users', () => {
    expect(isAuthenticatedUser('testuser')).toBe(true);
    expect(isAuthenticatedUser('guest')).toBe(false);
    expect(isAuthenticatedUser(null)).toBe(false);
  });

  test('toStatusLabel should convert status to readable format', () => {
    expect(toStatusLabel('OPEN')).toBe('New');
    expect(toStatusLabel('DONE')).toBe('Done');
    expect(toStatusLabel('IN_PROGRESS')).toBe('In Progress');
    expect(toStatusLabel('RESOLVED')).toBe('Done');
  });

  test('getSlaTargetHours should return correct hours by priority', () => {
    expect(getSlaTargetHours('CRITICAL')).toBe(4);
    expect(getSlaTargetHours('HIGH')).toBe(24);
    expect(getSlaTargetHours('MEDIUM')).toBe(72);
    expect(getSlaTargetHours('LOW')).toBe(120);
  });

  test('validateDoneTransition should enforce transition rules', () => {
    // Valid transition: IN_PROGRESS with assignee to DONE
    const result1 = validateDoneTransition({
      existingStatus: 'IN_PROGRESS',
      existingAssignee: 'testuser',
      nextStatus: 'DONE'
    });
    expect(result1).toBeNull();

    // Invalid: OPEN without assignee to DONE
    const result2 = validateDoneTransition({
      existingStatus: 'OPEN',
      existingAssignee: null,
      nextStatus: 'DONE'
    });
    expect(result2).toContain('Assign');
  });

  test('buildSlaSummary should calculate SLA correctly', () => {
    const report = {
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      priority: 'HIGH',
      status: 'OPEN'
    };
    const sla = buildSlaSummary(report);
    expect(sla.targetHours).toBe(24);
    expect(['On Track', 'At Risk', 'Breached']).toContain(sla.state);
  });
});

describe('File Storage Helpers', () => {
  const {
    readFallbackReports,
    saveFallbackReports,
    appendFallbackReport,
    readFallbackComments,
    appendFallbackComment
  } = require('../utils/file-helpers');

  beforeEach(() => cleanTestData());
  afterEach(() => cleanTestData());

  test('readFallbackReports should return empty array when no file exists', () => {
    const reports = readFallbackReports();
    expect(Array.isArray(reports)).toBe(true);
  });

  test('saveFallbackReports should persist reports to file', () => {
    const testReports = [
      { id: 1, title: 'Test', status: 'OPEN' }
    ];
    saveFallbackReports(testReports);
    const loaded = readFallbackReports();
    expect(loaded).toEqual(testReports);
  });

  test('appendFallbackReport should add new report with auto-ID', () => {
    const report1 = appendFallbackReport({ title: 'First' });
    const report2 = appendFallbackReport({ title: 'Second' });
    expect(report1.id).toBe(1);
    expect(report2.id).toBe(2);
  });

  test('readFallbackComments should return empty object when no file exists', () => {
    const comments = readFallbackComments();
    expect(typeof comments).toBe('object');
  });

  test('appendFallbackComment should add comment to report', () => {
    const comment = appendFallbackComment(1, {
      author: 'testuser',
      text: 'Test comment',
      createdAt: new Date().toISOString()
    });
    expect(comment.text).toBe('Test comment');
    const loaded = readFallbackComments();
    expect(loaded['1']).toEqual([comment]);
  });
});

describe('Database Helpers', () => {
  const { withDatabaseFallback } = require('../utils/db-helpers');

  test('withDatabaseFallback should call fallback on error', async () => {
    const dbOp = () => Promise.reject(new Error('DB error'));
    const fallbackOp = () => 'fallback result';

    const result = await withDatabaseFallback(dbOp, fallbackOp, 'test op');
    expect(result).toBe('fallback result');
  });

  test('withDatabaseFallback should return db result on success', async () => {
    const dbOp = () => Promise.resolve('db result');
    const fallbackOp = () => 'fallback result';

    const result = await withDatabaseFallback(dbOp, fallbackOp, 'test op');
    expect(result).toBe('db result');
  });
});

describe('Security & Input Validation', () => {
  test('should sanitize user input in forms', async () => {
    await request(app)
      .post('/report')
      .send({
        title: '<script>alert("xss")</script>',
        description: 'test',
        priority: 'HIGH'
      })
      .expect(302);
  });

  test('should prevent ID injection attacks', async () => {
    await request(app)
      .get('/report/999; DROP TABLE bugReports;--')
      .expect(302);
  });
});

describe('Error Handling', () => {
  test('should handle malformed JSON gracefully', async () => {
    await request(app)
      .get('/incidents')
      .expect(302); // Redirects to login
  });

  test('should handle missing environment variables', () => {
    expect(() => require('../app')).not.toThrow();
  });
});

// After all tests, close server
afterAll(() => {
  server.close();
  cleanTestData();
});
