# Prisma Migrations Excluded by .dockerignore

## Symptom

Container starts, but the app pod prints (and the DB never gets the schema):

```
Loaded Prisma config from prisma.config.ts.

Prisma schema loaded from prisma/schema.prisma.
Datasource "db": PostgreSQL database "bugreportportal", schema "public"
    at "postgres:5432"

No migration found in prisma/migrations

No pending migrations to apply.
```

Then in Postgres, only the bookkeeping table exists:

```
                List of relations
 Schema |        Name        | Type  |  Owner
--------+--------------------+-------+----------
 public | _prisma_migrations | table | postgres
(1 row)
```

The app boots successfully, the dashboard renders, but every Prisma query
crashes with:

```
❌ [Dashboard] Prisma error:
   The table `public.BugReport` does not exist in the current database.
```

The app then falls back to the JSON file storage path in
[utils/db-helpers.js](../utils/db-helpers.js) — so the UI half-works (you can
create incidents that persist to the pod's local JSON), but nothing ever
reaches Postgres, and a pod restart wipes everything.

## Root cause

[.dockerignore](../.dockerignore) contained:

```
prisma/migrations
```

This excluded the entire migrations folder from the Docker build context, so
`prisma/migrations/*` never reached the runtime image:

```bash
$ kubectl exec deploy/bug-report-portal-app -c app -- ls -la /app/prisma
total 20
-rw-r--r--  1 nodejs nodejs 1170 schema.prisma
-rw-r--r--  1 nodejs nodejs 3902 seed-demo.js
# 👆 no migrations/ subdirectory
```

The `CMD` in [Dockerfile](../Dockerfile#L37):

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node app.js"]
```

runs `prisma migrate deploy` on every container startup, which walks
`prisma/migrations/` to discover applied vs. pending migrations. With the
folder missing it sees zero migration files, has nothing to apply, and reports
the (technically correct but very misleading) message:

```
No migration found in prisma/migrations
No pending migrations to apply.
```

`prisma migrate deploy` exits with status 0 even when no migrations exist, so
the app container continues normally — and the dev sees no error in the logs
until the first query hits a missing table.

## Fix

Remove the `prisma/migrations` line from `.dockerignore`.

```diff
 data/*
 .eslintrc.json
 .eslintignore
 docs
-prisma/migrations
```

After rebuilding the image:

```bash
$ kubectl exec deploy/bug-report-portal-app -c app -- ls /app/prisma/migrations
20260522100653_init
20260522122447_add_status_assignee
20260525083000_simplify_bug_status
20260525150027_add_comments_table
20260525150532_add_activity_logs
migration_lock.toml
```

And the startup log now shows real work:

```
5 migrations found in prisma/migrations
Applying migration `20260522100653_init`
Applying migration `20260522122447_add_status_assignee`
...
All migrations have been successfully applied.
```

## Why was it ever in .dockerignore?

A reasonable but wrong instinct: "the database is created in dev, the image
just runs the app — no need to ship dev artifacts". This is the model used by
**dev-only** Prisma commands like `prisma migrate dev` and `prisma db push`.

For production, the model is the opposite:

- `prisma/migrations/*` is the **source of truth** for schema evolution
- The image **must** ship the migration scripts so any environment can apply
  them deterministically
- `prisma migrate deploy` is the production command — it requires the files

Treat `prisma/migrations/` the same as your application source code: it goes
into version control, into the build context, into the image. Never ignore it.

## Related fix in the DevOps repo

This bug was also masked by a parallel issue in the deployment manifest — the
`init-database` initContainer tried to run `prisma db push --skip-generate`
(an invalid flag) and silently failed, creating only the `_prisma_migrations`
bookkeeping table. Both fixes shipped together. See
[bug-report-portal-devops/ERROR_FIXES.md](https://github.com/ravi2342/bug-report-portal-devops/blob/master/ERROR_FIXES.md)
Issue #6 for the manifest change.

## Verification

After deploying the fix, expect:

```bash
kubectl -n bug-report-portal-dev exec deploy/postgres -- \
  psql -U postgres -d bugreportportal -c "\dt"

               List of relations
 Schema |        Name        | Type  |  Owner
--------+--------------------+-------+----------
 public | ActivityLog        | table | postgres
 public | BugReport          | table | postgres
 public | Comment            | table | postgres
 public | _prisma_migrations | table | postgres
(4 rows)
```

Create an incident in the UI, then re-query — the row count should grow.

## How to catch this earlier

Add a quick sanity check to the Dockerfile or a CI step:

```dockerfile
# After COPY . . in the runner stage
RUN test -d prisma/migrations && \
    test "$(ls prisma/migrations | grep -v migration_lock | wc -l)" -gt 0 || \
    (echo "❌ prisma/migrations is empty or missing — check .dockerignore"; exit 1)
```

This fails the image build immediately if the migrations folder is empty,
instead of letting a broken image deploy and only discovering it at query
time.

## References

- Commit: `cb13509` — `fix: include prisma/migrations in docker image`
- Companion devops commit: `9d5eb9d` — `fix(k8s): replace broken init-database`
- Prisma docs on `migrate deploy`:
  https://www.prisma.io/docs/orm/prisma-migrate/workflows/production-and-testing
