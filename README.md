# OpsCenter Bug Report Portal

Incident management system: create, track, and comment on incidents with real-time updates.

**Stack:** Node.js · Express · Prisma · PostgreSQL · EJS · Socket.IO

---

## 🚀 Quick Start

**Fastest:**
```bash
docker compose up -d --build
# http://localhost:3000 → admin / admin123
```

**See [QUICKSTART.md](QUICKSTART.md) for all options.**

---

## 📋 Features

- Create incidents with priority, assignee, screenshot
- Track status: New → In Progress → Done  
- Comment and view activity timeline
- Search by ID, keyword, reporter, assignee, status
- Dashboard with KPIs and SLA tracking
- Real-time updates via Socket.IO

---

## 📚 Documentation

| File | Purpose |
|------|---------|
| [QUICKSTART.md](QUICKSTART.md) | 2-minute setup |
| [SETUP_GUIDE.md](SETUP_GUIDE.md) | Detailed setup + troubleshooting |
| [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md) | Demo walkthrough |
| [ESLINT_AND_LINTING.md](ESLINT_AND_LINTING.md) | Code quality |
| [FIXES_AND_IMPROVEMENTS.md](FIXES_AND_IMPROVEMENTS.md) | Known issues |

**DevOps & Deployment (External Repo):**
- [LOCAL_K8S_STEPS](https://github.com/ravi2342/bug-report-portal-devops/blob/master/LOCAL_K8S_STEPS.md) - Local Kubernetes
- [PROD_K8S_STEPS](https://github.com/ravi2342/bug-report-portal-devops/blob/master/PROD_K8S_STEPS.md) - Production Kubernetes
- [JENKINS_BUILD_PARAMETERS](https://github.com/ravi2342/bug-report-portal-devops/blob/master/JENKINS_BUILD_PARAMETERS.md) - CI/CD pipeline

---

## 📁 Project Structure

```
app.js                    # Main server, routes, auth, SLA logic
package.json              # Dependencies & scripts
views/                    # EJS templates (login, dashboard, incidents)
prisma/schema.prisma     # Database schema
uploads/                  # Screenshot storage (local) / Docker volume
```

---

## 💾 Database & Screenshots

**Login:** admin / admin123

**Screenshot Storage:**
- Local: `uploads/` folder
- Docker: Docker volume `app_uploads`
- DB: Only file path stored in `BugReport.screenshot`

---

## ⚙️ Scripts

```bash
npm run dev              # Dev server with nodemon
npm run migrate          # Run migrations
npm run seed:demo        # Seed demo data
npm test                 # Run tests
npm run eslint           # Lint code
```

---

**For setup:** See [QUICKSTART.md](QUICKSTART.md)  
**For details:** See [SETUP_GUIDE.md](SETUP_GUIDE.md)

<!-- PR pipeline smoke test3-->

