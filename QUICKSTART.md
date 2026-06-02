# Quick Start - 2 Minutes

---

## 🐳 Path A: Docker (Recommended)

```bash
cd bug-report-portal
docker compose up -d --build
# http://localhost:3000 → admin / admin123
```

**Stop:** `docker compose down`

---

## 💻 Path B: Local Node.js

```bash
cd bug-report-portal
npm install
npm run migrate
npm run dev
# http://localhost:3000 → admin / admin123
```

---

## Data Management

```bash
# Keep data
docker compose down

# Wipe data
docker compose down -v
```

---

## Next Steps

- [SETUP_GUIDE.md](SETUP_GUIDE.md) - Detailed setup
- [LOCAL_K8S_STEPS](https://github.com/ravi2342/bug-report-portal-devops/blob/master/LOCAL_K8S_STEPS.md) - Kubernetes
- [VIDEO_SCRIPT.md](VIDEO_SCRIPT.md) - Demo walkthrough

---

**Issues?** See [SETUP_GUIDE.md](SETUP_GUIDE.md) troubleshooting section.
