# SonarQube Quality Gate Fix

## Problem Statement

The Jenkins pipeline was failing at the SonarQube quality gate stage despite SonarQube server running correctly and the token being valid.

### Symptoms
- Pipeline exited with code 1 at SonarQube stage
- All subsequent stages (Lint, Tests, Docker Build, etc.) were skipped
- QUALITY_GATE_STATUS variable remained empty
- Error message: "Quality Gate evaluation failed or timed out"

### Root Cause

The original implementation used a **manual curl polling approach** to retrieve quality gate status:

```bash
# OLD APPROACH (BROKEN)
while [ "${QUALITY_GATE_STATUS}" = "UNKNOWN" ]; do
  RESPONSE=$(curl -s -H "Authorization: Bearer ${SONAR_TOKEN}" \
    "${SONAR_HOST_URL}/api/qualitygates/project_status?projectKey=${PROJECT_KEY}" 2>&1)
  # Parse response with grep
  QUALITY_GATE_STATUS=$(echo "${RESPONSE}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
done
```

**Issues:**
1. **Curl header quoting problem**: In Groovy triple-quoted strings (`sh '''...'''`), the quotes around the Authorization header were being stripped before reaching the shell
2. **Complex parsing logic**: Attempting to parse JSON with grep/cut was error-prone
3. **Unnecessary complexity**: Reinventing functionality that SonarQube Scanner already provides

## Solution

Replace manual polling with **SonarQube's native quality gate wait feature**:

```bash
# NEW APPROACH (WORKING)
sonar-scanner \
  -Dsonar.host.url="${SONAR_HOST_URL}" \
  -Dsonar.token="${SONAR_TOKEN}" \
  -Dsonar.projectKey=bug-report-portal \
  -Dsonar.qualitygate.wait=true \
  -Dsonar.qualitygate.timeout=300

SONAR_EXIT=$?
if [ ${SONAR_EXIT} -eq 0 ]; then
  echo "✓ Quality Gate PASSED"
else
  echo "❌ Quality Gate FAILED"
  exit 1
fi
```

### Key Changes

| Aspect | Before | After |
|--------|--------|-------|
| **Approach** | Manual curl polling | Native sonar-scanner feature |
| **Header handling** | Groovy quote escaping issues | None (uses scanner parameters) |
| **JSON parsing** | grep/cut fragile parsing | Built-in scanner logic |
| **Lines of code** | ~60 lines | ~15 lines |
| **Reliability** | ❌ Inconsistent | ✅ Stable |

### Parameters Used

- `-Dsonar.qualitygate.wait=true` - Tell scanner to wait for quality gate evaluation
- `-Dsonar.qualitygate.timeout=300` - Maximum wait time in seconds (5 minutes)

The exit code directly indicates pass/fail:
- `0` = Quality Gate PASSED → Pipeline continues
- `1` = Quality Gate FAILED → Pipeline exits

## Benefits

1. **Eliminates curl auth issues** - No more header quoting problems
2. **Uses official API** - SonarQube scanner's built-in mechanism
3. **Simpler code** - Easier to maintain and understand
4. **Better reliability** - Tested and proven by SonarQube team
5. **Cleaner logic** - Direct exit code check instead of string parsing

## Build Results

**Before fix:**
```
Pipeline exited with code 1
Quality gate check failed
All subsequent stages skipped
```

**After fix:**
```
✓ Quality Gate PASSED
✓ Lint stage executed
✓ Tests stage executed
✓ Docker build stage executed
Pipeline finished: SUCCESS
```

## Git Commits

- **915a313**: Attempted backslash escaping fix (didn't work)
- **24e573a**: Refactored to use native SonarQube quality gate wait (WORKING)

## Testing

To verify the fix works:

1. Run Jenkins build with parameters:
   - `RUN_SONAR=true`
   - `SONAR_HOST_URL=http://host.docker.internal:9000`
   - `SONAR_TOKEN_CREDENTIALS_ID=sonar-token`

2. Expected output:
   ```
   INFO: QUALITY GATE STATUS: PASSED - View details on http://host.docker.internal:9000/dashboard?id=bug-report-portal
   ✓ Quality Gate PASSED
   SonarQube analysis completed successfully with all quality gate conditions met.
   ```

3. Subsequent stages should execute:
   - Lint (if configured)
   - Run Tests (if configured)
   - Build Docker Image
   - Trivy Image Scan

## Summary

The quality gate fix transforms the SonarQube integration from an unreliable manual polling approach to a robust native implementation. This ensures consistent pipeline execution and eliminates authentication-related issues.
