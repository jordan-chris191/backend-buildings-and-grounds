-- CreateEnum
CREATE TYPE "MaintainableAssetType" AS ENUM ('AIRCON', 'GENERATOR', 'PUMP', 'OTHER');

-- CreateEnum
CREATE TYPE "MaintenanceBasis" AS ENUM ('CALENDAR', 'RUNTIME');

-- CreateEnum
CREATE TYPE "MaintenancePriority" AS ENUM ('ROUTINE', 'IMPORTANT', 'CRITICAL');

-- AlterTable
ALTER TABLE "MaintenanceSchedule" ADD COLUMN     "basis" "MaintenanceBasis" NOT NULL DEFAULT 'CALENDAR',
ADD COLUMN     "currentRunHours" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "frequencyHours" DECIMAL(10,2),
ADD COLUMN     "nextDueAtHours" DECIMAL(10,2),
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "frequencyDays" DROP NOT NULL,
ALTER COLUMN "nextDueAt" DROP NOT NULL;

-- CreateTable
CREATE TABLE "MaintainableAssetProfile" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "assetType" "MaintainableAssetType" NOT NULL,
    "priority" "MaintenancePriority" NOT NULL DEFAULT 'ROUTINE',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "unitTypeConfigId" TEXT,

    CONSTRAINT "MaintainableAssetProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceUnitTypeConfig" (
    "id" TEXT NOT NULL,
    "unitType" TEXT NOT NULL,
    "defaultCooldownDays" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenanceUnitTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RunHourReading" (
    "id" TEXT NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maintenanceScheduleId" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,

    CONSTRAINT "RunHourReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaintainableAssetProfile_inventoryItemId_key" ON "MaintainableAssetProfile"("inventoryItemId");

-- CreateIndex
CREATE INDEX "MaintainableAssetProfile_assetType_idx" ON "MaintainableAssetProfile"("assetType");

-- CreateIndex
CREATE INDEX "MaintainableAssetProfile_unitTypeConfigId_idx" ON "MaintainableAssetProfile"("unitTypeConfigId");

-- CreateIndex
CREATE INDEX "MaintainableAssetProfile_priority_idx" ON "MaintainableAssetProfile"("priority");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceUnitTypeConfig_unitType_key" ON "MaintenanceUnitTypeConfig"("unitType");

-- CreateIndex
CREATE INDEX "RunHourReading_maintenanceScheduleId_idx" ON "RunHourReading"("maintenanceScheduleId");

-- CreateIndex
CREATE INDEX "RunHourReading_recordedById_idx" ON "RunHourReading"("recordedById");

-- CreateIndex
CREATE INDEX "MaintenanceSchedule_basis_idx" ON "MaintenanceSchedule"("basis");

-- AddForeignKey
ALTER TABLE "MaintainableAssetProfile" ADD CONSTRAINT "MaintainableAssetProfile_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintainableAssetProfile" ADD CONSTRAINT "MaintainableAssetProfile_unitTypeConfigId_fkey" FOREIGN KEY ("unitTypeConfigId") REFERENCES "MaintenanceUnitTypeConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunHourReading" ADD CONSTRAINT "RunHourReading_maintenanceScheduleId_fkey" FOREIGN KEY ("maintenanceScheduleId") REFERENCES "MaintenanceSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunHourReading" ADD CONSTRAINT "RunHourReading_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
