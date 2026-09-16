ALTER TABLE "User" ADD COLUMN "personId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "type" TEXT,
ADD COLUMN "referenceNo" TEXT;
CREATE UNIQUE INDEX "User_personId_key" ON "User"("personId");
CREATE INDEX "Notification_type_idx" ON "Notification"("type");
ALTER TABLE "User" ADD CONSTRAINT "User_personId_fkey"
FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Existing rows deliberately remain unlinked: names/emails are not identity proof.
