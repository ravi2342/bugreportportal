# Bug Report Portal - Setup Guide for macOS M1

## Prerequisites
- PostgreSQL installed via Homebrew
- Node.js and npm installed
- Docker Desktop installed (for Docker setup paths)
- This repository cloned

Use [README.md](README.md) as the primary source for complete setup + troubleshooting. This guide is a quick companion.

Runtime server note: app requests are served by Node.js + Express directly; nginx is optional and not required for local setup.

## Quick Start

### Docker Quick Start (Recommended)
```bash
cd bug-report-portal

# Optional: override demo login credentials for containers
export PORTAL_LOGIN_USERNAME=admin
export PORTAL_LOGIN_PASSWORD=admin123

# Build and start app + postgres
docker compose up -d --build

# View logs
docker compose logs -f app

# Stop everything
docker compose down
```

How DB gets created in Docker:
- Postgres container creates `bugreportportal` from `POSTGRES_DB` on first run with empty volume.
- App container runs `npx prisma migrate deploy` during startup to create/update tables.

Connect to DB in Docker mode:

```bash
docker compose exec db psql -U postgres -d bugreportportal
```

Image upload storage in Docker mode:
- Image files are written under `/app/uploads` in container and persisted in Docker volume `app_uploads`.
- Database stores image path in `BugReport.screenshot` (example: `/uploads/<file-name>`).

Verify uploaded files + DB metadata in Docker mode:

```bash
docker compose exec app ls -lah /app/uploads
docker compose exec db psql -U postgres -d bugreportportal -c 'SELECT id, title, screenshot FROM "BugReport" WHERE screenshot IS NOT NULL ORDER BY id DESC LIMIT 10;'
```

The app will start on **http://localhost:3000**

Use this command to remove containers and data volumes when needed:
```bash
docker compose down -v
```

Data retention note:
- `docker compose down` keeps DB and uploaded images.
- `docker compose down -v` wipes DB and uploaded images (fresh start).

For a clean demo recording, run:

```bash
docker compose down -v
docker compose up -d --build
```

### Production Compose Profile
```bash
cd bug-report-portal

# Create production env file once
cp .env.docker.example .env.docker

# Edit secrets before running in production
# PORTAL_LOGIN_PASSWORD should be changed

# Start with production overrides
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check running services
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps

# Stop production stack
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

Connect to DB in production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db psql -U postgres -d bugreportportal
```

Production override changes:
- Database port is not published to host
- App credentials are loaded from `.env.docker`
- Restart policy is set to `always`

### 1. Start PostgreSQL
```bash
# Check PostgreSQL status
brew services list

# Start PostgreSQL if not running
brew services start postgresql@15
```

### 2. Create Database
```bash
# Open PostgreSQL CLI
psql -U postgres

# Create the database
CREATE DATABASE bugreportportal;

# Verify
\l

# Exit
\q
```

### 3. Setup Node Project
```bash
cd bug-report-portal

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init
```

### 4. Start the Application
```bash
# Development mode with auto-reload
npm run dev

# Or production mode
npm start
```

The app will start on **http://localhost:3000**

## Testing the Application

### Create a New Incident
1. Navigate to http://localhost:3000
2. Go to **Incidents** → **Create Incident**
3. Fill in:
   - Title: "Test Bug"
   - Priority: "High"
   - Description: "Test description"
4. Click **Submit Incident**

### View in Database
```bash
psql -U postgres -d bugreportportal
SELECT * FROM "BugReport";
\q
```

To verify uploaded image paths only:

```bash
psql -U postgres -d bugreportportal -c 'SELECT id, screenshot FROM "BugReport" ORDER BY id DESC LIMIT 10;'
```

## Environment Variables

The `.env` file is already configured with:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bugreportportal"
PORT=3000
```

Authentication cookies:
- App uses a signed cookie (`currentUser`) for login sessions.
- You can set `AUTH_COOKIE_SECRET` in `.env` to customize cookie signing.
- If dashboard appears already logged in, clear localhost cookies or use Incognito for a first-login test.

**Update DATABASE_URL if you used a different PostgreSQL password.**

## Troubleshooting

### "password authentication failed"
Update `.env` with your PostgreSQL password:
```
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/bugreportportal"
```

### "database does not exist"
Create the database:
```bash
psql -U postgres -c "CREATE DATABASE bugreportportal;"
```

### "relation BugReport does not exist"
Run migrations:
```bash
npx prisma migrate dev --name init
```

### Check Logs
The app now includes detailed logging. Look for:
- ✅ = Success
- ❌ = Error
- 🔄 = In Progress
- ⚠️ = Fallback mode

## Features

- ✅ Create new bug incidents
- ✅ View all incidents with filtering
- ✅ Update incident status
- ✅ Assign incidents to team members
- ✅ Upload screenshots
- ✅ Real-time updates via WebSocket
- ✅ Automatic fallback to JSON file if database is unavailable

## Port Already in Use?

If port 3000 is in use, update `.env`:
```
PORT=3001
```

---

For more help, check the logs in the terminal when running `npm run dev`
