# Quick Start - OpsCenter Bug Report Portal

This is the shortest path to run the project.

## Pre-Run Checklist

1. Open terminal in project folder:

```bash
cd bug-report-portal
```

2. For Docker paths: Docker Desktop must be running.
3. For non-Docker path: local PostgreSQL must be running.
4. Do not run local `npm run dev` and Docker app container at the same time on port 3000.

## Option A: Fastest (Docker)

1. Go to project folder.

```bash
cd bug-report-portal
```

2. Start app + database.

```bash
docker compose up -d --build
```

How DB is created in Docker:
1. Postgres container auto-creates `bugreportportal` from compose env (`POSTGRES_DB`) on first run with empty volume.
2. App container then runs Prisma migrations to create tables.

3. Open the app.

- http://localhost:3000/login

4. Login (default base profile).

- Username: admin
- Password: admin123

5. Stop when done.

```bash
docker compose down
```

Keep vs wipe data:
1. `docker compose down` keeps incidents/screenshots.
2. `docker compose down -v` wipes incidents/screenshots (removes volumes).

For final demo recording:

```bash
docker compose down -v
docker compose up -d --build
```

Image upload storage in Docker mode:
1. Files are stored in container path `/app/uploads`.
2. Docker maps this to named volume `app_uploads`.
3. DB stores only file path (column `screenshot`), for example `/uploads/<file-name>`.

Verify uploaded images in Docker mode:

```bash
docker compose exec app ls -lah /app/uploads
docker compose exec db psql -U postgres -d bugreportportal -c 'SELECT id, title, screenshot FROM "BugReport" WHERE screenshot IS NOT NULL ORDER BY id DESC LIMIT 10;'
```

If you run `docker compose up -d --build` again, it is usually safe and will update/reuse the same services.

To open PostgreSQL shell while using Docker base profile:

```bash
docker compose exec db psql -U postgres -d bugreportportal
```

Optional demo data seed in Docker base profile:

```bash
docker compose exec app npm run seed:demo
```

If it fails due to ports already in use:

```bash
docker compose down
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:5432 -sTCP:LISTEN
kill -15 <PID>
# if needed, force stop
kill -9 <PID>
docker compose up -d --build
```

## Option B: Local Node + Local PostgreSQL

1. Create DB once.

```bash
psql -U postgres -c "CREATE DATABASE bugreportportal;"
```

2. Install and configure.

```bash
cd bug-report-portal
npm install
```

Create .env with:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bugreportportal"
PORT=3000
PORTAL_LOGIN_USERNAME="admin"
PORTAL_LOGIN_PASSWORD="admin123"
```

3. Apply migrations.

```bash
npx prisma migrate deploy
```

4. Optional demo data.

```bash
npm run seed:demo
```

5. Start app.

```bash
npm run dev
```

6. Open and login.

- http://localhost:3000/login
- Username/password from .env

Image upload storage in local mode:
1. Files are stored in [uploads](uploads).
2. DB stores only file path in `BugReport.screenshot`.

Verify uploaded images in local mode:

```bash
ls -lah uploads
psql -U postgres -d bugreportportal -c 'SELECT id, title, screenshot FROM "BugReport" WHERE screenshot IS NOT NULL ORDER BY id DESC LIMIT 10;'
```

## Production-Like Docker Profile

1. Prepare env file.

```bash
cp .env.docker.example .env.docker
```

2. Update .env.docker values.

3. Start production profile.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

DB creation in production profile follows the same rule: first run with empty volume creates DB, then migrations create tables.

4. Verify.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

5. Stop.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

Note: In production profile, login credentials are read from .env.docker.
Running the same prod start command again is also safe for the same compose project.

To open PostgreSQL shell in production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec db psql -U postgres -d bugreportportal
```

Optional demo data seed in production profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec app npm run seed:demo
```
