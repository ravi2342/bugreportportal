# Setup Guide - Detailed

---

## Docker Setup

### Prerequisites
- Docker Desktop running

### Steps

```bash
cd bug-report-portal
docker compose up -d --build
docker compose logs -f app
```

**Database** is auto-created via Postgres container on first run.  
**Migrations** are auto-applied by app container at startup.

### Connect to Database

```bash
docker compose exec db psql -U postgres -d bugreportportal
```

### Seed Demo Data

```bash
docker compose exec app npm run seed:demo
```

### View Logs

```bash
docker compose logs -f app
```

### Stop

```bash
docker compose down         # Keep data
docker compose down -v      # Wipe data
```

---

## Local Node.js Setup

### Prerequisites
- PostgreSQL running: `brew services start postgresql`
- Node.js 18+

### Steps

```bash
cd bug-report-portal
npm install
npx prisma migrate deploy
npm run dev
```

### Create Database (First Time)

```bash
psql -U postgres -c "CREATE DATABASE bugreportportal;"
```

### Environment Variables (.env)

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bugreportportal"
PORT=3000
PORTAL_LOGIN_USERNAME=admin
PORTAL_LOGIN_PASSWORD=admin123
AUTH_COOKIE_SECRET=dev-secret
```

### Seed Demo Data

```bash
npm run seed:demo
```

### Stop

```bash
npm stop
brew services stop postgresql
```

---

## Screenshot Upload Storage

| Mode | Location | Persistence |
|------|----------|-------------|
| Local Node | `uploads/` folder | On disk |
| Docker | Docker volume `app_uploads` | In volume |

**Verify uploads:**
```bash
# Local
ls -lah uploads

# Docker
docker compose exec app ls -lah /app/uploads
```

---

## Troubleshooting

### Port 3000 Already in Use
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill -9 <PID>
```

### Database Connection Error
```bash
# Check PostgreSQL running
psql -U postgres
\l
\q

# Verify DATABASE_URL in .env
# Update DATABASE_URL if password changed
```

### Migrations Failed
```bash
# Reset and rerun
docker compose down -v
docker compose up -d --build
```

### No Data Shown
```bash
# Seed demo data
npm run seed:demo  # or
docker compose exec app npm run seed:demo

# Verify tables
psql -U postgres -d bugreportportal -c "\dt"
```

### Login Cookie Issues
- Use Incognito/private mode for fresh login test
- Or clear browser cookies for localhost

---

## Production Profile

```bash
cp .env.docker.example .env.docker
# Edit .env.docker with secure values

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

---

See [QUICKSTART.md](QUICKSTART.md) for fastest path.  
See [README.md](README.md) for project overview.
