ALTER TABLE "WorkRequest" ADD COLUMN "maintenanceCycleKey" TEXT;
CREATE UNIQUE INDEX "WorkRequest_maintenanceScheduleId_maintenanceCycleKey_key"
ON "WorkRequest"("maintenanceScheduleId", "maintenanceCycleKey");
