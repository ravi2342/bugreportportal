# Trivy CVE Fix — Alpine Base Image Patching

## Symptom

Jenkins pipeline fails at the **Trivy Security Scan** stage:

```
demu147/bugreportportal:1.0.0-XX (alpine 3.24.0)
================================================
Total: 2 (HIGH: 2, CRITICAL: 0)

┌────────────┬────────────────┬──────────┬────────┬───────────────────┬───────────────┐
│  Library   │ Vulnerability  │ Severity │ Status │ Installed Version │ Fixed Version │
├────────────┼────────────────┼──────────┼────────┼───────────────────┼───────────────┤
│ libcrypto3 │ CVE-2026-45447 │ HIGH     │ fixed  │ 3.5.6-r0          │ 3.5.7-r0      │
│ libssl3    │ CVE-2026-45447 │ HIGH     │ fixed  │ 3.5.6-r0          │ 3.5.7-r0      │
└────────────┴────────────────┴──────────┴────────┴───────────────────┴───────────────┘

❌ Pipeline failed: Trivy security scan failed: script returned exit code 1
```

The Jenkins stage runs:

```bash
trivy image --scanners vuln --severity HIGH,CRITICAL --no-progress --exit-code 1 <image>
```

`--exit-code 1` makes the build fail when any HIGH/CRITICAL CVE is found.

## Root cause

The `node:24-alpine` base image is pinned to **alpine 3.24.0**, which ships
`libcrypto3` / `libssl3` at `3.5.6-r0`. CVE‑2026‑45447 (heap use‑after‑free in
`PKCS7_verify()`) is fixed in `3.5.7-r0`, but the patched package is only
pulled if you run `apk upgrade` during the image build.

By default `node:24-alpine` is rebuilt only when the upstream image is
republished, so a freshly built image can still carry outdated apk packages.

## Fix

Add `apk update && apk upgrade` to **both** Dockerfile stages right after the
`FROM` line. This pulls the latest patched packages from the alpine 3.24 repo
without changing the Alpine version.

### `Dockerfile`

```dockerfile
FROM node:24-alpine AS deps

# Patch OS packages to address CVEs flagged by Trivy (libcrypto3/libssl3, etc.)
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

WORKDIR /app
# ...rest of deps stage...

FROM node:24-alpine AS runner

# Patch OS packages to address CVEs flagged by Trivy (libcrypto3/libssl3, etc.)
RUN apk update && apk upgrade --no-cache && rm -rf /var/cache/apk/*

WORKDIR /app
# ...rest of runner stage...
```

Why both stages:
- `deps` builds `node_modules` and runs `npx prisma generate` — needs current TLS libs.
- `runner` is the final image that Trivy actually scans.

`--no-cache` + `rm -rf /var/cache/apk/*` keeps the image small.

## When this is NOT enough

If Trivy reports `Status: affected` or `will_not_fix`, no patched apk package
exists yet. In that case bump the base image (e.g. `node:24-alpine3.25` once
released) or `node:24-slim` (Debian based).

## Verification

After pushing the Dockerfile change, re-run the Jenkins build. The Trivy stage
should report:

```
Total: 0 (HIGH: 0, CRITICAL: 0)
```

## References

- Commit: `c5fbe36` — `fix: patch alpine CVEs and clean up lint errors`
- CVE: https://avd.aquasec.com/nvd/cve-2026-45447
