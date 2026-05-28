# OpsCenter Bug Report Portal

Incident management portal built with Node.js, Express, Prisma, PostgreSQL, EJS, and Socket.IO.

This document is designed for two audiences:
1. Developers who want to run or deploy the project.
2. Video viewers who need a clear, step-by-step walkthrough.

## Documentation Index

1. Full technical and operational guide: [README.md](README.md)
2. 2-minute setup path: [QUICKSTART.md](QUICKSTART.md)
3. Presenter narration flow: [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md)

## 1. Project Summary

This portal lets teams:
1. Create incidents with title, description, priority, assignee, and optional screenshot.
2. Track incident lifecycle from New to In Progress to Done.
3. Add comments and view incident activity timeline.
4. Search incidents by ID, keywords, reporter, assignee, and status.
5. Monitor KPIs on dashboard and SLA status on incident detail page.

Current workflow rules:
1. Closed incidents cannot be reopened.
2. Incident must be assigned before it can be moved to Done.
3. Incident must be In Progress before it can be moved to Done.

## 2. Tech Stack

1. Node.js (CommonJS)
2. Express 5
3. EJS templates
4. Prisma ORM with PostgreSQL adapter
5. PostgreSQL
6. Socket.IO
7. Multer for file uploads
8. Cookie-based demo login

## 3. How Data Flows

1. User calls an HTTP route in [app.js](app.js).
2. Route tries PostgreSQL using Prisma first.
3. If DB fails, route falls back to JSON files in [data/bugReports.json](data/bugReports.json) and [data/reportComments.json](data/reportComments.json).
4. EJS templates in [views](views) render the UI.
5. Socket.IO notifies clients for live incident updates.

## 3A. Screenshot Upload Flow (Where Images Are Stored)

When a user uploads an image:
1. Upload request is handled by route logic in [app.js](app.js) using Multer.
2. Binary file is saved to the uploads folder:
	1. Local/non-Docker runtime: [uploads](uploads)
	2. Docker runtime: `/app/uploads` inside container (mounted as volume `app_uploads`)
3. App stores only the file path string (not binary) in DB field `screenshot` of `BugReport`.
4. Example stored path value: `/uploads/1779968944443-screenshot.png`
5. Browser loads image through static route `/uploads/...`.

Persistence behavior:
1. Local runtime: files stay in [uploads](uploads) on your machine.
2. Docker runtime: files stay in Docker volume `app_uploads`.
3. If you run `docker compose down`, data remains.
4. If you run `docker compose down -v`, DB and uploaded image volume are removed.

Quick verification:

```bash
# list uploaded files on host (local runtime)
ls -lah uploads

# check screenshot paths saved in DB
psql -U postgres -d bugreportportal -c 'SELECT id, screenshot FROM "BugReport" ORDER BY id DESC LIMIT 10;'

# list uploaded files in Docker app container
docker compose exec app ls -lah /app/uploads

# check screenshot paths saved in Docker DB container
docker compose exec db psql -U postgres -d bugreportportal -c 'SELECT id, title, screenshot FROM "BugReport" WHERE screenshot IS NOT NULL ORDER BY id DESC LIMIT 10;'
```

## 4. File-by-File Guide

Core backend:
1. [app.js](app.js): Main server, routes, auth, workflow checks, SLA logic, socket events.
2. [package.json](package.json): Scripts and dependencies.
3. [printReports.js](printReports.js): Quick DB diagnostic script.

Views:
1. [views/login.ejs](views/login.ejs): Login page.
2. [views/dashboard.ejs](views/dashboard.ejs): KPI dashboard.
3. [views/incidents.ejs](views/incidents.ejs): Incident list and search view.
4. [views/report.ejs](views/report.ejs): Incident detail, comments, timeline, SLA, actions.
5. [views/create-incident.ejs](views/create-incident.ejs): New incident form.
6. [views/sidebar.ejs](views/sidebar.ejs): Shared sidebar navigation.

Database and Prisma:
1. [prisma/schema.prisma](prisma/schema.prisma): Models and enum.
2. [prisma/migrations](prisma/migrations): Migration history.
3. [prisma/seed-demo.js](prisma/seed-demo.js): Demo seed data.
4. [prisma.config.ts](prisma.config.ts): Prisma datasource config.

Docker and deployment:
1. [Dockerfile](Dockerfile): Container image build.
2. [docker-compose.yml](docker-compose.yml): Base local container profile.
3. [docker-compose.prod.yml](docker-compose.prod.yml): Production override profile.
4. [.dockerignore](.dockerignore): Build context exclusions.
5. [.env.docker.example](.env.docker.example): Production env template.

Config and docs:
1. [.env](.env): Local app env values.
2. [SETUP_GUIDE.md](SETUP_GUIDE.md): Additional setup notes.
3. [README.md](README.md): This complete walkthrough.

## 5. Environment Variables

Required values:
1. DATABASE_URL
2. PORT (optional, default 3000)
3. PORTAL_LOGIN_USERNAME
4. PORTAL_LOGIN_PASSWORD

Local example (.env):

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bugreportportal"
PORT=3000
PORTAL_LOGIN_USERNAME="admin"
PORTAL_LOGIN_PASSWORD="admin123"
```

Production env setup:

```bash
cp .env.docker.example .env.docker
```

Then edit .env.docker with secure values.

## 5A. Prerequisites Checklist

Before running any command, confirm:
1. You are inside project directory:

```bash
cd bug-report-portal
```

2. Docker route:
	1. Docker Desktop is running.
	2. `docker compose version` works.
3. Non-Docker route:
	1. Node.js 20+ and npm are installed.
	2. Local PostgreSQL service is running.
4. Run only one app runtime at a time on port 3000 (either Docker app container or local `npm run dev`).

## 6. Local Run (Node + Local PostgreSQL)

Use this path when running directly with npm.

Prerequisites:
1. Node.js 20+
2. npm
3. PostgreSQL running on your machine

### Step 1: Create Database (Required)

```bash
psql -U postgres
```

Inside psql:

```sql
CREATE DATABASE bugreportportal;
\l
\q
```

### Step 2: Install and Configure

```bash
cd bug-report-portal
npm install
```

Create or update .env with DATABASE_URL and login credentials.

### Step 3: Apply Migrations

```bash
npx prisma migrate deploy
```

Optional for first-time development flow:

```bash
npx prisma migrate dev
```

### Step 4: Optional Demo Data

```bash
npm run seed:demo
```

### Step 5: Start Application

Development:

```bash
npm run dev
```

Production-like local start:

```bash
npm start
```

Access:
1. http://localhost:3000/login

Use credentials from .env.

## 7. Local Run (Docker Base Profile)

Use this when both app and DB should run in containers.

```bash
cd bug-report-portal
docker compose up -d --build
```

Access:
1. http://localhost:3000/login

Defaults in base profile:
1. Username: admin
2. Password: admin123

Optional demo data seed in Docker mode:

```bash
docker compose exec app npm run seed:demo
```

Useful commands:

```bash
docker compose ps
docker compose logs -f app
docker compose down
docker compose down -v
```

### Data Retention: `down` vs `down -v`

Use these based on your goal:
1. `docker compose down`
	1. Stops and removes containers only.
	2. Keeps volumes (`pgdata`, `app_uploads`).
	3. Incidents and uploaded screenshots remain.
2. `docker compose down -v`
	1. Stops/removes containers and removes volumes.
	2. Incidents and uploaded screenshots are wiped.

Recommended for demo videos:
1. For rehearsal: use `docker compose down` to keep your test incidents.
2. For final recording: use `docker compose down -v`, then `docker compose up -d --build` to start from a clean state.
3. Create fresh incidents live during recording for a clear end-to-end story.

### How Database Gets Created in Docker

1. The PostgreSQL container uses environment variables from [docker-compose.yml](docker-compose.yml):
	1. `POSTGRES_DB=bugreportportal`
	2. `POSTGRES_USER=postgres`
	3. `POSTGRES_PASSWORD=postgres`
2. On first startup (when the Postgres data volume is empty), the official Postgres image automatically creates the `bugreportportal` database.
3. App startup then runs Prisma migrations from [Dockerfile](Dockerfile):
	1. `npx prisma migrate deploy`
4. Result:
	1. Database is created by Postgres container initialization.
	2. Tables are created by Prisma migrations.

Important behavior:
1. DB creation runs only the first time for a fresh Postgres volume.
2. If you run `docker compose up` again, it reuses existing DB data.
3. To recreate database from scratch, remove volumes:

```bash
docker compose down -v
docker compose up -d --build
```

### If You Run `docker compose up -d --build` Again

1. It normally does not fail.
2. Docker Compose is idempotent for the same project and compose file.
3. It will reuse or recreate only what changed, and keep services on the same ports.

It can fail when ports are already used by something else, for example:
1. Another app using port 3000.
2. Another Postgres process using port 5432.

Quick recovery steps:

```bash
docker compose ps
docker compose down
docker compose up -d --build
```

If ports are still busy, check and stop host processes:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5432 -sTCP:LISTEN
```

Stop the process by PID (replace `<PID>` with the value from lsof output):

```bash
# graceful stop (recommended first)
kill -15 <PID>

# force stop only if the process does not exit
kill -9 <PID>
```

Then start compose again:

```bash
docker compose up -d --build
```

## 8. Production Run (Docker Production Profile)

Use this for production-like deployment behavior.

### What changes in prod profile

1. Database port is not published to host.
2. App env values are loaded from .env.docker.
3. Restart policy is set to always.

### Commands

1. Prepare env file:

```bash
cp .env.docker.example .env.docker
```

2. Update .env.docker with secure values.

3. Start prod profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

4. Check status and logs:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f app
```

5. Stop prod profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

Access:
1. http://localhost:3000/login

Important:
1. Login credentials in this mode come from .env.docker, not .env.
2. Running the same prod command again is safe; Compose reconciles existing services.
3. Database creation behavior is the same as base profile: Postgres creates DB on first empty volume init, then Prisma migrations create tables.

Optional demo data seed in production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app npm run seed:demo
```

## 9. Useful PostgreSQL Queries for Demo and Validation

Connect:

```bash
psql -U postgres -d bugreportportal
```

When using Docker base profile, you can also connect from host because 5432 is published:

```bash
psql -h localhost -U postgres -d bugreportportal
```

When app is running with Docker Compose, connect to PostgreSQL inside the DB container:

Base profile:

```bash
docker compose exec db psql -U postgres -d bugreportportal
```

Production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db psql -U postgres -d bugreportportal
```

Run:

```sql
\dt

SELECT status, COUNT(*)
FROM "BugReport"
GROUP BY status
ORDER BY status;

SELECT id, title, priority, status, assignee, reporter, "createdAt"
FROM "BugReport"
ORDER BY id DESC
LIMIT 10;

SELECT "reportId", author, text, "createdAt"
FROM "Comment"
ORDER BY id DESC
LIMIT 10;

SELECT "reportId", actor, action, details, "createdAt"
FROM "ActivityLog"
ORDER BY id DESC
LIMIT 20;
```

## 10. Route Map (Quick Reference)

Auth routes:
1. GET /login
2. POST /login
3. POST /logout

Page routes:
1. GET /
2. GET /dashboard
3. GET /incidents
4. GET /search
5. GET /incidents/create
6. GET /report/:id

Mutation routes:
1. POST /report
2. POST /report/:id/update
3. POST /report/:id/status
4. POST /report/:id/assign
5. POST /report/:id/comments
6. POST /report/:id/attachment
7. POST /report/:id/attachment/remove

## 11. Video Demo Script (Recommended)

Use this exact flow for a smooth audience demo.

Before recording, reset to clean state:

```bash
docker compose down -v
docker compose up -d --build
```

1. Open login page and sign in.
2. Show dashboard KPIs.
3. Open incidents list and explain filters.
4. Create a new incident with priority High.
5. Open incident details and add a comment.
6. Assign incident to a team.
7. Try moving to Done without In Progress to show workflow validation.
8. Move to In Progress, then Done.
9. Show activity timeline and SLA section.
10. Run one SQL query to prove data persistence.

## 12. Troubleshooting

Login fails:
1. Check active runtime profile.
2. If local npm run, credentials are from .env.
3. If production compose profile, credentials are from .env.docker.

Port 3000 already in use:
1. Stop old process/container.
2. Or change PORT and restart.

Database connection errors:
1. Verify DATABASE_URL.
2. Confirm Postgres is running.
3. Re-run migrations.

No data shown:
1. Seed demo data with npm run seed:demo.
2. Verify tables with SQL queries above.

## 13. Production Improvement Checklist

1. Add reverse proxy with TLS.
2. Replace demo auth with SSO/IdP.
3. Use managed PostgreSQL and backups.
4. Add monitoring, logs, and alerts.
5. Add CI with automated tests.
