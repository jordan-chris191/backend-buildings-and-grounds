import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  // 1. Delete tables that reference User (must go before User deletion)
  await prisma.refreshToken.deleteMany({});
  await prisma.passwordResetToken.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});               // FK to User (Cascade) and WorkRequest (Cascade)

  // 2. Delete Work Request children (they reference WorkRequest and User)
  await prisma.workRequestAccomplishment.deleteMany({});   // FK to WorkRequest (Cascade) & User
  await prisma.workRequestAssignment.deleteMany({});       // FK to WorkRequest (Cascade) & User
  await prisma.workRequestItem.deleteMany({});             // FK to WorkRequest (Cascade) & InventoryItem

  // 3. Delete Stock & Transaction records (reference InventoryItem & User)
  await prisma.stockMovement.deleteMany({});               // FK InventoryItem (Restrict), User (Restrict)
  await prisma.itemTransaction.deleteMany({});             // replaces old itemIssuance/warehouseWithdrawal
  await prisma.maintenanceSchedule.deleteMany({});         // FK InventoryItem (Cascade), User (Restrict)
  await prisma.assetTransfer.deleteMany({});               // FK InventoryItem (Cascade), User (Restrict)

  // 4. Delete Work Requests & Inventory (after their children are gone)
  await prisma.workRequest.deleteMany({});                 // FK User (Restrict), etc.
  await prisma.inventoryItem.deleteMany({});               // FK Project, Category, etc.

  // 5. Delete Users (after all records referencing them are cleared)
  await prisma.user.deleteMany({});

  // 6. Delete remaining master / reference data
  await prisma.itemCategory.deleteMany({});
  await prisma.position.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.project.deleteMany({});
  await prisma.office.deleteMany({});
  await prisma.sequenceCounter.deleteMany({});
  await prisma.person.deleteMany({});                      // if you have Person data

  console.log('✅ All data cleared successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });