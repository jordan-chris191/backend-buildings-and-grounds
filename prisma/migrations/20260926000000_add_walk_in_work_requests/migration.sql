CREATE TYPE "WorkRequestSource" AS ENUM ('ONLINE', 'WALK_IN');

ALTER TABLE "WorkRequest"
  ADD COLUMN "source" "WorkRequestSource" NOT NULL DEFAULT 'ONLINE',
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "walkInRequesterName" TEXT,
  ADD COLUMN "walkInRequesterContact" TEXT;

-- Every existing request was an online request; its requester was also the
-- system identity that originally created it.
UPDATE "WorkRequest"
SET "createdById" = "requestedById";

ALTER TABLE "WorkRequest"
  ALTER COLUMN "requestedById" DROP NOT NULL,
  ALTER COLUMN "createdById" SET NOT NULL;

ALTER TABLE "WorkRequest"
  ADD CONSTRAINT "WorkRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "WorkRequest_createdById_idx" ON "WorkRequest"("createdById");
