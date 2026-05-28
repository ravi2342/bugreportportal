# Quick Start - OpsCenter Bug Report Portal

This is the shortest path to run the project.

## Option A: Fastest (Docker)

1. Go to project folder.

```bash
cd bug-report-portal
```

2. Start app + database.

```bash
docker compose up -d --build
```

3. Open the app.

- http://localhost:3000/login

4. Login (default base profile).

- Username: admin
- Password: admin123

5. Stop when done.

```bash
docker compose down
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

4. Verify.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

5. Stop.

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml down
```

Note: In production profile, login credentials are read from .env.docker.
