-- Active assignments are temporal: historical unassigned rows remain valid.
-- These partial indexes make duplicate assignees and competing leads impossible
-- even when two application transactions race.
CREATE UNIQUE INDEX "WorkRequestAssignment_active_user_key"
ON "WorkRequestAssignment" ("workRequestId", "userId")
WHERE "unassignedAt" IS NULL;

CREATE UNIQUE INDEX "WorkRequestAssignment_active_lead_key"
ON "WorkRequestAssignment" ("workRequestId")
WHERE "unassignedAt" IS NULL AND "role" = 'LEAD';

CREATE UNIQUE INDEX "WorkRequestItem_workRequestId_inventoryItemId_key"
ON "WorkRequestItem" ("workRequestId", "inventoryItemId");
