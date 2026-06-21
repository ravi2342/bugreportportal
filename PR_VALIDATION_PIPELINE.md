# Pull Request Validation Pipeline

End-to-end guide to the PR validation flow for `bugreportportal`. Every PR
to `master` is automatically scanned by Jenkins (lint + tests + SonarQube +
Trivy) and the result is reported back to GitHub as a required status check
that blocks the merge button until everything is green.

---

## Architecture at a glance

```
GitHub PR opened/updated
        |
        v
Jenkins multibranch job  (bugreportportal-pr)
   |  periodic scan: every 1 min
   |
   |--> stages:
   |     1. Clean Workspace
   |     2. Checkout (into ./app/)
   |     3. Install Dependencies   (npm ci)
   |     4. Quality Gates          (lint + jest with coverage)
   |     5. SonarQube PR Scan      (sonar-scanner + Quality Gate)
   |     6. Trivy Security Scan    (HIGH,CRITICAL libs)
   |
   v
Posts status to GitHub: continuous-integration/jenkins/pr-head
        |
        v
GitHub branch protection (ruleset: protect-master)
        |
        v
Merge button enabled only when check is GREEN
```

The PR pipeline runs **before** merge. The master build/push/deploy
pipeline (in the devops repo) runs **after** merge.

---

## Components

### Jenkins Multibranch Pipeline — `bugreportportal-pr`
- URL: `http://localhost:8080/jenkins/job/bugreportportal-pr/`
- Branch source: GitHub, repo `ravi2342/bugreportportal`, credential `github-pat`
- Discovers: Pull Requests from origin (strategy: "Merging the PR with the current target branch revision")
- Scan triggers: **Periodically if not otherwise run** = 1 minute
- Script: `Jenkinsfile` (this repo)
- Shared library: `bug-report-portal-lib@v1.1`

### SonarQube — `bug-report-portal`
- URL: `http://sonarqube:9000` (Jenkins) / `http://localhost:9000` (host)
- Edition: **Community 9.9.x** — does NOT support `sonar.branch.name` or
  `sonar.pullrequest.*`. The Jenkinsfile only adds those args when
  `SONAR_EDITION` parameter is set to `developer` (default `community`).
- Quality Gate: `bug-portal` (Clean-as-You-Code with custom Coverage 60% on
  new code)
- **New Code** baseline: Specific analysis (project → Project Settings →
  New Code). Bump this baseline after major merges so "new code"
  metrics stay meaningful.

### Trivy
- Docker image `aquasec/trivy:0.71.0`
- Scans `./app` for HIGH and CRITICAL library vulnerabilities
- Skipped if SonarQube fails (fail-fast)

### GitHub Branch Protection — ruleset `protect-master`
- Target: default branch (`master`)
- Rules enabled:
  - Restrict deletions
  - Require a pull request before merging (approvals as configured)
  - Require status checks to pass — **`continuous-integration/jenkins/pr-head`**
  - Require branches to be up to date before merging
  - Block force pushes

---

## Author workflow — raising a PR

1. **Branch off `master`**
   ```bash
   git checkout master
   git pull
   git checkout -b feature/<short-name>
   ```

2. **Make your changes**, commit, push:
   ```bash
   git add .
   git commit -m "feat: <what changed>"
   git push -u origin feature/<short-name>
   ```

3. **Open the PR** on GitHub
   - Base: `master`
   - Compare: your branch
   - Click **Create pull request**

4. **Wait for Jenkins (~1–2 min)**
   - GitHub immediately shows
     `continuous-integration/jenkins/pr-head — Expected — Waiting for status to be reported`
   - Jenkins's periodic scan picks up the PR within 1 minute, creates a
     `PR-N` build, and runs the full pipeline.
   - To speed it up, click **Scan Repository Now** in Jenkins:
     `http://localhost:8080/jenkins/job/bugreportportal-pr/build?delay=0`

5. **Check results in the PR**
   - GREEN ✅: Merge button enables (subject to review rules)
   - RED ❌: Click the check → "Details" → opens the Jenkins build → read
     the failing stage log

6. **Push fixes**
   - New commits to the same PR branch retrigger Jenkins automatically.

7. **Merge**
   - Once GREEN and approved, click **Squash and merge** (or **Merge**)
   - Master pipeline (devops repo) then builds, pushes the image, and
     deploys.

---

## Common failure modes & fixes

### "Quality gate FAILED — Coverage on New Code below threshold"
- The Sonar gate `bug-portal` requires ≥ 60% coverage on new code.
- Add tests for new code, or update the **New Code** baseline in Sonar:
  Project Settings → New Code → Specific analysis → pick latest passing
  analysis → Save.

### Sonar error: "To use the property 'sonar.branch.name' … Developer Edition required"
- Means the Jenkins parameter `SONAR_EDITION` got flipped to `developer`
  but the server is Community. Set it back to `community` in the build
  parameters or in the Jenkinsfile default.

### "Lint failed" / "Tests failed"
- Reproduce locally:
  ```bash
  npm ci
  npm run lint
  npm test
  ```

### Trivy reports HIGH/CRITICAL vulns
- Run `npm audit` locally; update the offending dependency or pin a
  patched version, commit, push.

### GitHub check stays "Expected — Waiting for status to be reported"
- Periodic scan hasn't fired or didn't discover the PR.
  1. Open the Jenkins job page → click **Scan Repository Now**
  2. Watch **Scan Repository Log** for `Job created: PR-N`
  3. If not picked up, confirm in **Configure** → **Scan Repository
     Triggers** that "Periodically if not otherwise run" is checked with
     interval `1 minute`.

### Jenkins suddenly slow or returning "Not Found"
- Container may have restarted:
  ```bash
  docker ps --filter name=jenkins
  docker stats jenkins --no-stream
  ```
- Log back in if the session expired; verify your last Configure change
  was actually saved.

---

## Jenkinsfile parameters

The pipeline accepts these build parameters (Build with Parameters):

| Parameter | Default | Description |
|---|---|---|
| `RUN_SONAR` | `true` | Run SonarQube PR analysis |
| `SONAR_HOST_URL` | `http://sonarqube:9000` | SonarQube server URL |
| `SONAR_PROJECT_KEY` | `bug-report-portal` | Sonar project key |
| `SONAR_TOKEN_CREDENTIALS_ID` | `sonar-token` | Jenkins credentials ID |
| `SONAR_EDITION` | `community` | `community` skips branch/PR args; set to `developer` after upgrade |
| `TRIVY_VERSION` | `0.71.0` | Trivy image tag |

---

## Quick links

- Jenkins job: `http://localhost:8080/jenkins/job/bugreportportal-pr/`
- Sonar project: `http://localhost:9000/dashboard?id=bug-report-portal`
- GitHub repo: `https://github.com/ravi2342/bugreportportal`
- Branch ruleset: `https://github.com/ravi2342/bugreportportal/settings/rules`
- Shared library: `https://github.com/ravi2342/bugreportportal-sharedlib` (tag `v1.1`)
