# Lint Failure — Template Literals & Unused Vars

## Symptom

Jenkins **Lint** stage prints:

```
/var/jenkins_home/workspace/bug-report-portal/app/utils/db-helpers.js
   6:73  warning  'saveFallbackComments' is assigned a value but never used  no-unused-vars
  23:17  error    Strings must use singlequote                               quotes
  51:3   warning  'existingData' is assigned a value but never used          no-unused-vars

/var/jenkins_home/workspace/bug-report-portal/app/tests/app.test.js
  771:13  warning  'report' is assigned a value but never used  no-unused-vars

✖ 4 problems (1 error, 3 warnings)
⚠ Lint failed but continuing: script returned exit code 1
```

The Jenkinsfile catches the failure (`⚠ Lint failed but continuing`), but the
error still makes the stage red and increases noise in SonarQube.

## Root cause

### 1. The blocking ERROR — `quotes`

The project's [`.eslintrc.json`](../.eslintrc.json) sets:

```json
"quotes": ["error", "single"]
```

…with **no** `{ "allowTemplateLiterals": true }` option. ESLint then rejects
template literals (`` `...` ``) that contain **no `${...}` interpolation**,
because they could just be single-quoted strings.

Offending line in `utils/db-helpers.js`:

```js
// ❌ Template literal with no interpolation
console.log(`⚠️ [DB] Falling back to JSON file storage...`);
```

### 2. The 3 warnings — `no-unused-vars`

Project rule:

```json
"no-unused-vars": ["warn"]
```

- `utils/db-helpers.js:6` — `saveFallbackComments` imported but never used.
- `utils/db-helpers.js:51` — `existingData` parameter accepted but never read.
- `tests/app.test.js:771` — `const report = appendFallbackReport(...)` return
  value never asserted on.

Warnings alone don't fail the build, but they pollute the console and the
SonarQube smell count.

## Fix

```diff
-const { readFallbackReports, saveFallbackReports, readFallbackComments, saveFallbackComments } = require('./file-helpers');
+const { readFallbackReports, saveFallbackReports, readFallbackComments } = require('./file-helpers');
```

```diff
-    console.log(`⚠️ [DB] Falling back to JSON file storage...`);
+    console.log('⚠️ [DB] Falling back to JSON file storage...');
```

```diff
 async function updateReportWithNotification(
   prisma,
   reportId,
   updateData,
   logActivityFn,
-  io,
-  existingData = {}
+  io
 ) {
```

```diff
 test('[PERSIST-5] Report with null and undefined values', () => {
-  const report = appendFallbackReport({
+  appendFallbackReport({
     title: 'Test',
     ...
   });
```

## How to catch this locally before pushing

```bash
npm run lint                 # exit code 1 on errors
npm run lint -- --fix        # auto-fix what it can (covers the quotes rule)
```

Confirmed clean output:

```
> bug-report-portal@1.0.0 lint
> eslint .

(no output, exit 0)
```

## General rules of thumb

- **Always use `'single quotes'`** for plain strings. Reserve backticks for
  strings that need `${interpolation}` or contain literal `'`.
- **Remove unused imports/params on the spot.** They become dead code fast and
  Sonar will flag them as `unused-import` smells later.
- Run `npm run lint` before every push. The Jenkinsfile soft-fails lint to
  avoid blocking demos, so a green local run is the real gate.

## References

- Commit: `c5fbe36` — `fix: patch alpine CVEs and clean up lint errors`
- ESLint rule: https://eslint.org/docs/latest/rules/quotes
- ESLint rule: https://eslint.org/docs/latest/rules/no-unused-vars
