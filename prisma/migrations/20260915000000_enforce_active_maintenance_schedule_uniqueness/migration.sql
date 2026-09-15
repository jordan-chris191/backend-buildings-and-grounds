-- One item may have one active CALENDAR schedule and one active RUNTIME schedule.
-- Inactive historical schedules remain available for audit/history purposes.
CREATE UNIQUE INDEX "MaintenanceSchedule_active_inventoryItemId_basis_key"
ON "MaintenanceSchedule"("inventoryItemId", "basis")
WHERE "isActive" = true;
