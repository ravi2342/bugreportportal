# Jenkins Build Parameters - Complete Guide

## Overview
This guide explains all Jenkins pipeline parameters for the Bug Report Portal CI/CD pipeline. These parameters control which stages run and how they behave.

---

## Parameter Categories

| Category | Parameters | Purpose |
|----------|-----------|---------|
| **Scanning** | RUN_SONAR, RUN_CHECKMARX | Enable/disable code quality & security scans |
| **Deployment** | DO_PUSH, DO_DEPLOY | Control Docker push and Kubernetes deployment |
| **Testing** | RUN_POST_DEPLOY_TESTS, RUN_UI_E2E | Enable post-deployment testing |
| **Configuration** | SONAR_HOST_URL, SONAR_TOKEN_CREDENTIALS_ID, etc. | Provide credentials and URLs |

---

## SonarQube Scanning Setup

### Prerequisites
Before running SonarQube scan, you need:

1. **SonarQube Server Running**
   ```bash
   # SonarQube should be accessible at your SONAR_HOST_URL
   http://host.docker.internal:9000  (from Jenkins container)
   ```

2. **SonarQube User Token**
   ```
   Steps:
   1. Login to SonarQube at http://localhost:9000
   2. Click your profile icon (top-right) → Account
   3. Click "Security" tab
   4. Scroll to "Tokens" section
   5. Click "Generate Tokens"
   6. Enter name: "Jenkins Token"
   7. Click "Generate"
   8. Copy the token (long alphanumeric string)
   ```

3. **Jenkins Credential Created**
   ```
   Steps:
   1. Go to Jenkins → Manage Jenkins → Credentials
   2. Click "Global" under "Stores"
   3. Click "Add Credentials" (top-left)
   4. Kind: "Secret text"
   5. Secret: Paste the SonarQube token from step 2
   6. ID: sonar-token (MUST match SONAR_TOKEN_CREDENTIALS_ID param)
   7. Click "Create"
   ```

### Parameters for SonarQube

#### 1. `RUN_SONAR` (Boolean)
**Purpose**: Enable/disable SonarQube scan stage

**Values**:
- `true` - Run SonarQube scan and quality gate check
- `false` - Skip SonarQube stage (default)

**When to Use**:
- `true` - Every merge to main branch, before release
- `false` - Local testing, CI pipeline verification
- `true` - When code quality concerns exist

**Example**:
```
Set RUN_SONAR = true
```

#### 2. `SONAR_HOST_URL` (String)
**Purpose**: URL of your SonarQube server

**Value Format**:
```
http://host.docker.internal:9000
```

**Why `host.docker.internal`?**
- Jenkins runs in a Docker container
- Container cannot access `localhost:9000` directly
- `host.docker.internal` is Docker's way to reach host machine services from inside container

**Other Examples** (if SonarQube on different server):
```
http://sonarqube.company.com:9000          # On company server
http://192.168.1.100:9000                   # On specific IP
https://sonar.dev.mycompany.com            # HTTPS with domain
```

**When to Use**:
- Use `host.docker.internal:9000` for local Docker setup
- Use your company SonarQube URL for production

**Example**:
```
Set SONAR_HOST_URL = http://host.docker.internal:9000
```

#### 3. `SONAR_TOKEN_CREDENTIALS_ID` (String)
**Purpose**: Jenkins credential ID containing your SonarQube token

**Value Format**:
```
sonar-token
```

**This must match** the Jenkins credential ID created in prerequisites (step 3)

**Typical Values**:
```
sonar-token                    # Local setup
jenkins-sonar-prod-token       # Production
sonar-qa-environment-token     # QA environment
```

**When to Use**:
- Always required when `RUN_SONAR=true`
- Leave blank when `RUN_SONAR=false`

**Example**:
```
Set SONAR_TOKEN_CREDENTIALS_ID = sonar-token
```

---

## Checkmarx SAST Setup

### Prerequisites
Before running Checkmarx scan, you need:

1. **Checkmarx CLI Installed**
   ```bash
   # Checkmarx CxFlow CLI must be available
   # Usually pre-installed in Jenkins agent image or installed via package manager
   ```

2. **Checkmarx Server Access**
   ```
   Contact your Checkmarx administrator for:
   - Server URL
   - API credentials/token
   - Project setup
   ```

3. **Checkmarx Command Format**
   ```bash
   # Basic syntax:
   cx scan create \
     --project-name <project-name> \
     --scan-types sast \
     --branch <branch-name> \
     --file <path-to-scan>
   ```

### Parameters for Checkmarx

#### 1. `RUN_CHECKMARX` (Boolean)
**Purpose**: Enable/disable Checkmarx SAST scan stage

**Values**:
- `true` - Run Checkmarx security scan
- `false` - Skip Checkmarx stage (default)

**When to Use**:
- `true` - Security-critical releases
- `true` - After code with external dependencies
- `false` - Regular development builds
- `false` - Until Checkmarx is fully configured

**Example**:
```
Set RUN_CHECKMARX = true
```

**Note**: For local development, keep `RUN_CHECKMARX = false` unless Checkmarx is available

#### 2. `CHECKMARX_COMMAND` (String)
**Purpose**: The actual Checkmarx CLI command to execute

**Value Format**:
```
cx scan create --project-name bug-report-portal --scan-types sast --branch ${BRANCH_NAME}
```

**Components Explained**:
```
cx scan create                          # Checkmarx command to create scan
  --project-name bug-report-portal      # Project name (must exist in Checkmarx)
  --scan-types sast                     # Type: static application security testing
  --branch ${BRANCH_NAME}               # Git branch name (Jenkins variable)
  --threshold high:5 medium:10           # Optional: fail if > 5 high vulns
```

**Common Variations**:

```bash
# Basic scan
cx scan create --project-name bug-report-portal --scan-types sast --branch ${BRANCH_NAME}

# With vulnerability threshold (fail if > 5 high severity)
cx scan create --project-name bug-report-portal --scan-types sast --branch ${BRANCH_NAME} --threshold high:5

# With specific file/folder
cx scan create --project-name bug-report-portal --scan-types sast --branch ${BRANCH_NAME} --file ./app.js

# Multiple scan types (SAST + SCA)
cx scan create --project-name bug-report-portal --scan-types sast,sca --branch ${BRANCH_NAME}

# With checkmarx server URL
cx scan create --project-name bug-report-portal --scan-types sast --branch ${BRANCH_NAME} --cx-server https://checkmarx.company.com
```

**When to Use**:
- Required only when `RUN_CHECKMARX=true`
- Leave blank when `RUN_CHECKMARX=false`

**Step-by-Step Setup**:
1. Contact Checkmarx administrator to create project `bug-report-portal`
2. Get your Checkmarx server URL
3. Configure Checkmarx CLI with credentials
4. Test command locally:
   ```bash
   cx scan create --project-name bug-report-portal --scan-types sast --branch master
   ```
5. Paste working command into `CHECKMARX_COMMAND` parameter

**Example**:
```
Set CHECKMARX_COMMAND = cx scan create --project-name bug-report-portal --scan-types sast --branch ${BRANCH_NAME}
```

---

## Other Important Parameters

### Docker & Deployment Parameters

#### `IMAGE_NAME` (String)
**Purpose**: Docker image name (without tag)

**Default Value**: `bug-report-portal`

**Example Values**:
```
bug-report-portal
bug-report-portal-app
brp-api
```

**When to Change**: Only if you rename your application

#### `IMAGE_TAG` (String)
**Purpose**: Docker image tag

**Default Value**: Empty (uses BUILD_NUMBER)

**Example Values**:
```
latest               # Replace latest tag
v1.0.0              # Version tag
feature-new-ui      # Feature branch tag
qa-build-123        # QA environment tag
```

**Auto-Generated If Empty**:
- Uses Jenkins BUILD_NUMBER
- Results in: `bug-report-portal:19` (where 19 is build number)

#### `DO_PUSH` (Boolean)
**Purpose**: Push Docker image to registry

**Values**:
- `true` - Push to Docker registry
- `false` - Skip push (default)

**When to Use**:
- `true` - Before deploying to production/staging
- `false` - Local testing, development builds

**Requires**:
- Docker registry credentials configured
- REGISTRY_URL and REGISTRY_CREDENTIALS_ID set

#### `REGISTRY_URL` (String)
**Purpose**: Docker registry URL for pushing images

**Example Values**:
```
docker.io                    # Docker Hub
ghcr.io                      # GitHub Container Registry
quay.io                      # Quay.io
registry.company.com         # Private registry
index.docker.io/v1/          # Docker Hub (alternative)
```

**When to Use**:
- Required only when `DO_PUSH=true`
- Leave blank for local testing

#### `REGISTRY_CREDENTIALS_ID` (String)
**Purpose**: Jenkins credential ID for registry authentication

**Setup Steps**:
1. Go to Jenkins → Manage Jenkins → Credentials
2. Click "Add Credentials"
3. Kind: "Username with password"
4. Username: Your registry username
5. Password: Your registry password/token
6. ID: `docker-registry-creds`
7. Click "Create"

**Example Values**:
```
docker-registry-creds
docker-hub-token
ghcr-credentials
```

**When to Use**:
- Required only when `DO_PUSH=true`
- Leave blank otherwise

### Testing & Deployment Parameters

#### `RUN_POST_DEPLOY_TESTS` (Boolean)
**Purpose**: Run smoke tests after deployment

**Values**:
- `true` - Run POST /login and GET /incidents tests
- `false` - Skip tests (default)

**When to Use**:
- `true` - After deploying to staging/production
- `false` - When not deploying

**Requires**: `DO_DEPLOY=true`

#### `RUN_UI_E2E` (Boolean)
**Purpose**: Run UI end-to-end tests

**Values**:
- `true` - Run UI E2E test command
- `false` - Skip E2E tests (default)

**When to Use**:
- `true` - Final validation before production release
- `false` - Regular builds

**Requires**:
- `E2E_COMMAND` parameter configured
- Selenium/Playwright setup

#### `E2E_COMMAND` (String)
**Purpose**: Command to run UI E2E tests

**Example Values**:
```
npm run test:e2e
npx playwright test
npm run cypress:run
```

**When to Use**:
- Required only when `RUN_UI_E2E=true`
- Leave blank otherwise

#### `DO_DEPLOY` (Boolean)
**Purpose**: Deploy to Kubernetes

**Values**:
- `true` - Apply k8s manifests with kubectl
- `false` - Skip deployment (default)

**When to Use**:
- `true` - Release to staging/production
- `false` - Just build, don't deploy

**Requires**: Kubernetes cluster accessible via kubeconfig

---

## Common Scenarios

### Scenario 1: Development Build (Local Testing)
```
RUN_SONAR = false
RUN_CHECKMARX = false
RUN_POST_DEPLOY_TESTS = false
RUN_UI_E2E = false
DO_PUSH = false
DO_DEPLOY = false
IMAGE_TAG = (leave blank - uses BUILD_NUMBER)
```

**Result**: Build, lint, test, create Docker image (no push/deploy)

---

### Scenario 2: Quality Scan (Before Merge)
```
RUN_SONAR = true
SONAR_HOST_URL = http://host.docker.internal:9000
SONAR_TOKEN_CREDENTIALS_ID = sonar-token
RUN_CHECKMARX = false
DO_PUSH = false
DO_DEPLOY = false
```

**Result**: Build, lint, test, quality scan with gate enforcement

---

### Scenario 3: Staging Deployment
```
RUN_SONAR = true
SONAR_HOST_URL = http://host.docker.internal:9000
SONAR_TOKEN_CREDENTIALS_ID = sonar-token
RUN_CHECKMARX = false
DO_PUSH = true
REGISTRY_URL = docker.io
REGISTRY_CREDENTIALS_ID = docker-registry-creds
IMAGE_TAG = staging-build-${BUILD_NUMBER}
DO_DEPLOY = true
RUN_POST_DEPLOY_TESTS = true
```

**Result**: Build, scan, push to registry, deploy to Kubernetes, run smoke tests

---

### Scenario 4: Production Release
```
RUN_SONAR = true
SONAR_HOST_URL = http://host.docker.internal:9000
SONAR_TOKEN_CREDENTIALS_ID = sonar-token
RUN_CHECKMARX = true
CHECKMARX_COMMAND = cx scan create --project-name bug-report-portal --scan-types sast --branch master
DO_PUSH = true
REGISTRY_URL = docker.io
REGISTRY_CREDENTIALS_ID = docker-registry-creds
IMAGE_TAG = v1.0.0
DO_DEPLOY = true
RUN_POST_DEPLOY_TESTS = true
RUN_UI_E2E = true
E2E_COMMAND = npm run test:e2e
```

**Result**: Full pipeline - all scans, security checks, tests, push, deploy

---

## Step-by-Step: First Run with SonarQube

### Part 1: Create Jenkins Credentials

1. **Create SonarQube Token in SonarQube**
   ```
   1. Open http://localhost:9000
   2. Login with admin/admin123
   3. Click profile (top-right) → My Account
   4. Click "Security" tab
   5. Under "Tokens", click "Generate Tokens"
   6. Name: "Jenkins Token"
   7. Click "Generate"
   8. Copy the token (save it temporarily)
   ```

2. **Add Credential to Jenkins**
   ```
   1. Go to http://localhost:8081 (Jenkins)
   2. Click "Manage Jenkins" (left sidebar)
   3. Click "Credentials"
   4. Click "System" → "Global credentials (unrestricted)"
   5. Click "Add Credentials" (top-left)
   6. Fill in:
      - Kind: "Secret text"
      - Secret: (paste your SonarQube token)
      - ID: sonar-token
      - Description: "SonarQube Token for Jenkins"
   7. Click "Create"
   ```

### Part 2: Run Jenkins Build with SonarQube

1. **Open Jenkins**
   ```
   http://localhost:8081
   ```

2. **Click on Pipeline Job** (bug-report-portal)

3. **Click "Build with Parameters"** (on left sidebar)

4. **Set Parameters**:
   ```
   RUN_SONAR = true
   SONAR_HOST_URL = http://host.docker.internal:9000
   SONAR_TOKEN_CREDENTIALS_ID = sonar-token
   RUN_CHECKMARX = false
   DO_PUSH = false
   DO_DEPLOY = false
   IMAGE_TAG = (leave blank)
   ```

5. **Click "Build"**

6. **Monitor Progress**:
   - Click build number (e.g., #20) to view console
   - Wait for "SonarQube Scan" stage
   - Wait for "Quality Gate" evaluation
   - If gate passes → Continue to next stages
   - If gate fails → Pipeline stops (code has violations)

### Part 3: Verify Results

1. **In Jenkins Console**:
   ```
   ✓ Quality Gate PASSED
   ```

2. **In SonarQube**:
   ```
   1. Go to http://localhost:9000
   2. Click "Projects"
   3. Click "bug-report-portal"
   4. View issues, coverage, metrics
   ```

---

## Troubleshooting

### Problem: "sonar-token credential not found"
**Solution**: Create the Jenkins credential first (see "Create Jenkins Credentials" section)

### Problem: "SONAR_HOST_URL is empty"
**Solution**: Fill in `SONAR_HOST_URL = http://host.docker.internal:9000`

### Problem: "Quality gate FAILED"
**Solution**: 
- Code has quality violations
- Review SonarQube dashboard for issues
- Fix issues locally
- Commit and re-run pipeline

### Problem: "Cannot connect to SonarQube"
**Solution**: 
- Verify SonarQube is running: `docker ps | grep sonarqube`
- Try accessing http://localhost:9000 from browser
- If running in Docker, use `host.docker.internal` (not `localhost`)

### Problem: "Checkmarx command failed"
**Solution**:
- Verify Checkmarx CLI is installed on Jenkins agent
- Verify Checkmarx server URL is correct
- Verify project name exists in Checkmarx
- Test command locally before using in Jenkins

---

## Summary Table

| Parameter | Type | When Required | Example Value |
|-----------|------|---------------|----------------|
| `RUN_SONAR` | Boolean | Always optional | `true` |
| `SONAR_HOST_URL` | String | When RUN_SONAR=true | `http://host.docker.internal:9000` |
| `SONAR_TOKEN_CREDENTIALS_ID` | String | When RUN_SONAR=true | `sonar-token` |
| `RUN_CHECKMARX` | Boolean | Always optional | `false` (default) |
| `CHECKMARX_COMMAND` | String | When RUN_CHECKMARX=true | `cx scan create...` |
| `DO_PUSH` | Boolean | Always optional | `false` |
| `DO_DEPLOY` | Boolean | Always optional | `false` |
| `RUN_POST_DEPLOY_TESTS` | Boolean | Always optional | `false` |
| `RUN_UI_E2E` | Boolean | Always optional | `false` |
| `IMAGE_NAME` | String | Default OK | `bug-report-portal` |
| `IMAGE_TAG` | String | Default OK | (leave blank) |

