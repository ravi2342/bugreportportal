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

### Why many parameters default to false

`false` is the safe default so first runs do not accidentally:
1. Push images to a registry.
2. Deploy to a cluster.
3. Run Sonar or E2E stages without required setup.

You switch parameters to `true` only when that environment dependency is ready.

### Jenkins Parameters: When to use true or false

1. `DO_PUSH`
	1. `false`: local validation, no registry push.
	2. `true`: push image after build when registry login is configured.
2. `DO_DEPLOY`
	1. `false`: CI-only run (build/test only).
	2. `true`: deploy to Kubernetes when `kubectl` and kubeconfig are ready.
3. `RUN_SONAR`
	1. `false`: skip code analysis.
	2. `true`: run SonarQube when `SONAR_HOST_URL` and `SONAR_TOKEN_CREDENTIALS_ID` are set.
4. `RUN_POST_DEPLOY_TESTS`
	1. `false`: skip smoke tests after deploy.
	2. `true`: run smoke checks (`/login`, `/incidents`) after deployment.
5. `RUN_UI_E2E`
	1. `false`: skip UI automation.
	2. `true`: run UI E2E command after smoke tests.
6. `E2E_COMMAND`
	1. Keep empty when `RUN_UI_E2E=false`.
	2. Set command when `RUN_UI_E2E=true` (example: `npm run test:e2e`).

### Recommended parameter profiles

1. Jenkins shakeout (first run)
	1. `DO_PUSH=false`
	2. `DO_DEPLOY=false`
	3. `RUN_SONAR=false`
	4. `RUN_POST_DEPLOY_TESTS=false`
	5. `RUN_UI_E2E=false`
2. CI + Sonar quality run
	1. `DO_PUSH=false`
	2. `DO_DEPLOY=false`
	3. `RUN_SONAR=true`
	4. `SONAR_HOST_URL` and `SONAR_TOKEN_CREDENTIALS_ID` set
3. Staging validation run
	1. `DO_DEPLOY=true`
	2. `RUN_POST_DEPLOY_TESTS=true`
	3. `RUN_UI_E2E=false` (or true once E2E suite is stable)
4. Full realistic pipeline
	1. `DO_PUSH=true`
	2. `DO_DEPLOY=true`
	3. `RUN_SONAR=true`
	4. `RUN_POST_DEPLOY_TESTS=true`
	5. `RUN_UI_E2E=true` with `E2E_COMMAND` set

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

### 5) Git Checkout Setup (HTTPS + PAT)

Use this path to avoid SSH host key issues in local Jenkins.

1. Create GitHub token:
	1. GitHub -> Settings -> Developer settings -> Personal access tokens
	2. Create Fine-grained token
	3. Grant repository access to `bugreportportal`
	4. Permission needed for checkout: `Contents` read
2. Add token in Jenkins:
	1. Manage Jenkins -> Credentials -> Global -> Add Credentials
	2. Kind: Username with password
	3. Username: your GitHub username
	4. Password: paste PAT token
	5. ID: `github-pat`
3. Update Jenkins job SCM:
	1. Job -> Configure
	2. Pipeline script from SCM -> Git
	3. Repository URL: `https://github.com/ravi2342/bugreportportal.git`
	4. Credentials: select `github-pat`
	5. Save
4. Re-run pipeline using Build with Parameters.
5. Checkout stage should pass if PAT and repo access are correct.

### 6) Jenkins Troubleshooting (Local)

1. Error: `Host key verification failed`
	1. Use HTTPS repo URL + PAT credential (`github-pat`).
2. Error: `Invalid option type "ansiColor"`
	1. Install AnsiColor plugin or remove `ansiColor('xterm')` from Jenkinsfile.
3. Error: `node: not found` / `npm: not found` / `docker: not found`
	1. Recreate Jenkins using custom image from `Dockerfile.jenkins`.
4. Error: `trivy not found on agent`
	1. Rebuild and use Jenkins custom image from `Dockerfile.jenkins` (now includes Trivy).
	2. Verify inside Jenkins container: `trivy --version`.
	3. If `docker ps` still shows image `jenkins-local-tools` (without `:trivy`), recreate Jenkins container with `jenkins-local-tools:trivy`.
	4. Example:
		1. `docker stop jenkins && docker rm jenkins && docker run -d --name jenkins -u root --restart unless-stopped -p 8081:8080 -p 50000:50000 -v jenkins_home:/var/jenkins_home -v /var/run/docker.sock:/var/run/docker.sock -v $HOME/.kube:/var/jenkins_home/.kube:ro jenkins-local-tools:trivy`
5. Error: `permission denied while trying to connect to the docker API`
	1. Re-run Jenkins container with Docker socket mount and local root user (`-u root`).
6. Error: `npm ci can only install with an existing package-lock.json`
	1. Ensure latest code is pushed and Jenkins is building latest `master` commit.
	2. Wipe Jenkins workspace once and rebuild.
7. Error: `fatal: not in a git directory`
	1. In job Pipeline SCM config, uncheck Lightweight checkout.
	2. Keep Script Path as `Jenkinsfile`.
	3. Wipe workspace once and rebuild.
8. Error: Jenkins runs from repo root so `npm ci`/`npm test` cannot find app files (`npm ERR! enoent`, missing `package.json`)
	1. This repo has app files under `bug-report-portal/` after checkout.
	2. Use `dir("${APP_DIR}")` for app stages in `Jenkinsfile`.
	3. Keep `APP_DIR = "bug-report-portal"` in pipeline environment.
	4. Rebuild once after pulling latest Jenkinsfile.
9. Error: Trivy stage fails due to HIGH/CRITICAL vulnerabilities
	1. Trivy scan now fails the build for HIGH/CRITICAL findings.
	2. Fix vulnerable dependencies/base image and rerun pipeline.
