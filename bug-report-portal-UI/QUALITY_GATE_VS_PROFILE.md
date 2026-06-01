# Quality Gate vs Quality Profile in SonarQube

## Overview
SonarQube uses two complementary concepts to ensure code quality: **Quality Profiles** (rules for analysis) and **Quality Gates** (pass/fail criteria).

---

## Quality Profile

### What is it?
A **Quality Profile** defines **WHAT to check** during code analysis.

It's a collection of coding rules and their configurations that determine which issues are detected and how they are categorized.

### Key Characteristics
- **Rules-based**: Contains a set of linting/quality rules
- **Analysis configuration**: Determines what gets flagged as an issue
- **Multiple per project**: A project can have different profiles
- **Scope**: Applied during the scan/analysis phase
- **Examples**: Bug detection, security hotspots, code smells, duplication

### Default Profile
- **Sonar way**: The built-in default profile for most projects
- Contains ~200+ coding rules across different categories

### Example Rules in Sonar way Profile
```
- No null pointer dereferences
- No SQL injection vulnerabilities
- No hardcoded passwords
- Maximum cyclomatic complexity
- Code duplication detection
- Test coverage expectations
```

### When Quality Profile is Used
```
SonarQube Scan → Applies Quality Profile Rules → Analyzes Code → Generates Report
```

---

## Quality Gate

### What is it?
A **Quality Gate** defines **WHEN to FAIL** based on metrics collected during analysis.

It's a set of conditions that must be met for code to pass (PASSED) or fail (FAILED).

### Key Characteristics
- **Metrics-based**: Uses quantified measurements
- **Pass/Fail decision**: Binary outcome (OK or FAIL)
- **Pipeline enforcement**: Determines if build should continue or stop
- **Scope**: Applied after analysis completes
- **Example metrics**: Coverage %, duplicated lines %, maintainability rating, vulnerabilities count

### Default Quality Gate
- **Sonar way**: The built-in default gate applied to all projects
- Contains 6 conditions on new code

### Sonar way Quality Gate Conditions
```
✓ Coverage is at least 80%
✓ Duplicated lines less than 3%
✓ Maintainability rating is A (technical debt < 5%)
✓ Reliability rating is A (no bugs)
✓ Security hotspots reviewed 100%
✓ Security rating is A (no vulnerabilities)
```

### When Quality Gate is Used
```
Analysis Complete → Apply Quality Gate Conditions → Check Metrics
  ↓
  If all conditions met → Status: OK (PASS)
  If any condition fails → Status: FAIL (STOP PIPELINE)
```

---

## Comparison Table

| Aspect | Quality Profile | Quality Gate |
|--------|-----------------|--------------|
| **Purpose** | Define what to check | Define when to fail |
| **Type** | Rules-based | Metrics-based |
| **Scope** | During analysis | After analysis |
| **Question Answered** | What issues should we look for? | Does code meet our standards? |
| **Output** | List of issues found | Pass/Fail status |
| **Example** | "Check for null pointers" | "Code coverage must be ≥80%" |
| **Pipeline Impact** | Generates report | Blocks/allows pipeline continuation |

---

## Real-World Example

### Scenario: Developer commits code

1. **Quality Profile (Sonar way) is Applied**
   ```
   SonarQube scans code using 200+ rules
   Finds:
   - 2 bugs (null pointer, logic error)
   - 1 security vulnerability (hardcoded password)
   - 15% code duplication
   - 65% test coverage
   - Creates detailed report
   ```

2. **Quality Gate (Sonar way) is Checked**
   ```
   Condition 1: Coverage ≥ 80%? → FAIL (only 65%)
   Condition 2: Duplicated lines < 3%? → FAIL (15%)
   Condition 3: No vulnerabilities? → FAIL (found 1)
   Condition 4: Maintainability = A? → FAIL (C rating)
   Condition 5: No bugs? → FAIL (found 2)
   Condition 6: Security hotspots reviewed? → FAIL (0%)
   
   Overall Quality Gate Status: FAILED ❌
   Pipeline Stops - Code not merged
   ```

3. **Developer Fixes Code**
   ```
   - Adds 25 unit tests (coverage now 85%)
   - Refactors duplicated code (duplication now 2%)
   - Removes hardcoded password (0 vulnerabilities)
   - Improves code structure (rating now B)
   - Reduces bugs (0 bugs remaining)
   - Reviews all security hotspots (100% reviewed)
   
   Quality Gate Status: PASSED ✓
   Pipeline Continues - Code merged to main
   ```

---

## In Your Jenkins Pipeline

### Current Implementation

```groovy
stage('SonarQube Scan (optional)') {
  // 1. Runs sonar-scanner (applies Quality Profile)
  sonar-scanner \
    -Dsonar.projectKey=bug-report-portal
  
  // 2. Waits for quality gate evaluation
  sleep 3
  
  // 3. Checks quality gate status (checks Quality Gate conditions)
  curl "${SONAR_HOST_URL}/api/qualitygates/project_status"
  
  // 4. Fails pipeline if quality gate status ≠ OK
  if [ "${QUALITY_GATE_STATUS}" != "OK" ]; then
    exit 1  // Pipeline stops here
  fi
}
```

### Pipeline Flow
```
Code pushed → Jenkins Build Triggered
    ↓
SonarQube Scan Stage
    ├─ Quality Profile applied (detects issues)
    ├─ Metrics collected (coverage, bugs, etc.)
    ├─ Quality Gate evaluated
    │
    └─ Quality Gate Result?
        ├─ FAILED → exit 1 → Pipeline STOPS ❌
        └─ PASSED → Continue → Next stages run ✓
```

---

## Summary

| Question | Answer |
|----------|--------|
| **What is Quality Profile?** | Rules that define WHAT issues to detect |
| **What is Quality Gate?** | Conditions that define WHEN code passes/fails |
| **Which runs first?** | Quality Profile (during scan), then Quality Gate (after scan) |
| **Which stops the pipeline?** | Quality Gate (if conditions not met) |
| **Can I have multiple?** | Profiles: Yes. Gates: Yes (but one default) |
| **What should I configure first?** | Quality Profile (determines what gets measured), then Quality Gate (defines pass criteria) |

