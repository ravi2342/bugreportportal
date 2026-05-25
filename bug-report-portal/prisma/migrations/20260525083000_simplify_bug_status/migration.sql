ALTER TYPE "BugStatus" RENAME TO "BugStatus_old";

CREATE TYPE "BugStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE');

ALTER TABLE "BugReport"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "BugStatus"
  USING (
    CASE
      WHEN "status"::text IN ('OPEN', 'UNASSIGNED', 'ASSIGNED', 'REOPENED') THEN 'OPEN'::"BugStatus"
      WHEN "status"::text IN ('IN_PROGRESS', 'ON_HOLD') THEN 'IN_PROGRESS'::"BugStatus"
      WHEN "status"::text IN ('DONE', 'RESOLVED', 'CLOSED') THEN 'DONE'::"BugStatus"
      ELSE 'OPEN'::"BugStatus"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'OPEN';

DROP TYPE "BugStatus_old";