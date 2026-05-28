# Video Walkthrough Script - OpsCenter Bug Report Portal

Use this script for a clean 8 to 12 minute demo.

## 1. Intro (30 seconds)

Talk track:

- This is OpsCenter Bug Report Portal.
- It is built with Node.js, Express, Prisma, PostgreSQL, and EJS.
- I will show setup, core workflow, validation rules, and production-ready Docker profile.

## 2. Show Project Structure (60 seconds)

Open these key files:

- app.js
- prisma/schema.prisma
- views/dashboard.ejs
- views/incidents.ejs
- views/report.ejs
- docker-compose.yml
- docker-compose.prod.yml

Talk track:

- app.js contains all routes and workflow logic.
- Prisma schema defines BugReport, Comment, and ActivityLog.
- EJS files render dashboard, list, and report detail pages.
- Docker compose files provide local and production profiles.

## 3. Run Locally with Docker (60 seconds)

Run:

```bash
docker compose up -d --build
```

Show:

- docker compose ps
- Open http://localhost:3000/login

Talk track:

- Base profile starts app and database quickly.
- Good for local demos and onboarding.

## 4. Authentication (45 seconds)

Login with demo creds.

Talk track:

- Login credentials are env-driven.
- Local and production profiles can use different env files.

## 5. Incident Creation Flow (90 seconds)

Actions:

1. Go to Create Incident.
2. Enter title, description, priority, assignee.
3. Submit.
4. Open incident details.

Talk track:

- Incident captures core fields and optional screenshot.
- New incident appears in list and dashboard metrics.

## 6. Comments, Assignment, Status Rules (2 minutes)

Actions:

1. Add comment.
2. Try moving directly to Done while unassigned.
3. Assign incident.
4. Try Done from New.
5. Move to In Progress.
6. Move to Done.

Talk track:

- Portal enforces realistic workflow validation.
- Done requires assignment and In Progress state.
- Closed incidents cannot be reopened.

## 7. SLA and Timeline (60 seconds)

Actions:

1. Show SLA box on report page.
2. Show activity timeline entries.

Talk track:

- SLA target is calculated from priority and created time.
- Timeline captures meaningful workflow changes.

## 8. Search and Filters (45 seconds)

Actions:

1. Search by ticket id.
2. Search by keyword.
3. Use sidebar filters.

Talk track:

- Search supports id and full-text style matching.
- Filters quickly narrow incidents by status and assignment.

## 9. Database Proof (45 seconds)

Run:

```bash
psql -U postgres -d bugreportportal -c 'SELECT id, title, status, assignee FROM "BugReport" ORDER BY id DESC LIMIT 5;'
```

Talk track:

- This confirms all UI actions persist in PostgreSQL.

## 10. Production Profile Demo (60 seconds)

Commands:

```bash
cp .env.docker.example .env.docker
# update credentials and database settings in .env.docker
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Talk track:

- Production profile hides DB host port.
- Uses .env.docker for app credentials and runtime config.

## 11. Closing (30 seconds)

Talk track:

- We covered end-to-end setup, workflow, validation, and deployment profile.
- Refer README.md for full documentation and QUICKSTART.md for fast setup.
