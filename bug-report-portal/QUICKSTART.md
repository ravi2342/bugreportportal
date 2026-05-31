# Quick Start - OpsCenter Bug Report Portal

This is the shortest path to run the project.

Auth cookie note:
1. App uses signed login cookie (`currentUser`) for protected pages.
2. Set `AUTH_COOKIE_SECRET` in env for a custom signing secret.
3. For first-time auth tests, use Incognito/private window or clear localhost cookies.

Runtime server note: this project serves HTTP directly from Node.js + Express; nginx is optional and not required for local run.

## Pre-Run Checklist

1. Open terminal in project folder:

```bash
cd bug-report-portal
```

2. For Docker paths: Docker Desktop must be running.
3. For non-Docker path: local PostgreSQL must be running.
4. Do not run local `npm run dev` and Docker app container at the same time on port 3000.

## Choose Your Path (Compose vs Kubernetes)

| Need | Recommended Path |
| --- | --- |
| Fast local app test | Docker Compose |
| Local deployment behavior test | Kubernetes (Minikube) |
| Ingress/service style routing test | Kubernetes |
| Quick DB + app bootstrap | Docker Compose |

Guidance:
1. Compose is for speed and convenience.
2. Kubernetes is for deployment-style validation.

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

Verify Docker is using the expected image/build:

```bash
# Shows app service image and build context from compose
docker compose config | sed -n '/app:/,/^[^[:space:]]/p'

# Shows running app container image
docker compose ps app

# Shows image IDs for built image and running container
docker image inspect bug-report-portal-app --format '{{.Id}}' 2>/dev/null || true
docker inspect "$(docker compose ps -q app)" --format '{{.Image}}'
```

Notes:
1. If your compose `app` service has a `build` section and you run `docker compose up -d --build`, Docker builds from the project `Dockerfile` unless a different file is specified in compose.
2. If compose has both `build` and `image`, compose builds then tags that image name.
3. If you change source code and do not use `--build`, old image layers can be reused.

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

## Jenkins Quick Notes

1. Pipeline definition is in [Jenkinsfile](Jenkinsfile).
2. Auto-trigger is SCM polling every 2 minutes.
3. For Sonar scan, set `SONAR_HOST_URL` and `SONAR_TOKEN_CREDENTIALS_ID` (Jenkins Secret Text credential ID).
4. Keep `DO_DEPLOY=false` until Jenkins agent has `kubectl` and valid kubeconfig context.

## Local Jenkins Setup (Manual)

### 1) Pre-checks

Run:

```bash
cd /Users/demu/projects
docker info >/dev/null && echo Docker OK
lsof -nP -iTCP:8081 -sTCP:LISTEN || true
lsof -nP -iTCP:9000 -sTCP:LISTEN || true
lsof -nP -iTCP:50000 -sTCP:LISTEN || true
curl -I https://updates.jenkins.io/current/update-center.json
curl -I https://get.jenkins.io/plugins/
```

If ports are free and curl checks work, continue.

### 2) Install Jenkins (Jenkins first)

Run:

```bash
docker volume create jenkins_home
docker run -d --name jenkins --restart unless-stopped -p 8081:8080 -p 50000:50000 -v jenkins_home:/var/jenkins_home -v /var/run/docker.sock:/var/run/docker.sock -v $HOME/.kube:/var/jenkins_home/.kube:ro jenkins/jenkins:lts-jdk17
```

Verify:

```bash
docker ps | grep jenkins
curl -I http://localhost:8081/login
```

Get unlock password:

```bash
docker exec jenkins cat /var/jenkins_home/secrets/initialAdminPassword
```

### 3) Unlock Jenkins in browser

1. Open `http://localhost:8081`.
2. Paste initial password.
3. Click Continue.
4. Choose Install Suggested Plugins.
5. Wait for completion.
6. Create admin user.

### 4) Fallback if Suggested Plugins fails

1. Click Select plugins to install.
2. Install only these first:
	1. Pipeline
	2. Git
	3. Credentials Binding
	4. Timestamper
	5. ANSI Color
3. Complete setup and login.
4. Go to Manage Jenkins -> Plugins -> Available and install:
	1. Docker Pipeline
	2. SonarQube Scanner for Jenkins
	3. NodeJS
	4. GitHub Integration (optional)
