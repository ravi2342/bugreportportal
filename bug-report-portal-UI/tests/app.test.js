process.env.PORTAL_LOGIN_USERNAME = process.env.PORTAL_LOGIN_USERNAME || 'admin';
process.env.PORTAL_LOGIN_PASSWORD = process.env.PORTAL_LOGIN_PASSWORD || 'admin123';
process.env.AUTH_COOKIE_SECRET = process.env.AUTH_COOKIE_SECRET || 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/bugreportportal';

const request = require('supertest');
const { app, server } = require('../app');

afterAll((done) => {
  server.close(() => done());
});

describe('Portal basic routes', () => {
  test('GET /login returns page', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Login');
  });

  test('GET /dashboard redirects to login for anonymous user', async () => {
    const res = await request(app).get('/dashboard');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  test('POST /login with valid credentials redirects to dashboard', async () => {
    const res = await request(app)
      .post('/login')
      .type('form')
      .send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/dashboard');
    expect(res.headers['set-cookie']).toBeDefined();
  });
});
