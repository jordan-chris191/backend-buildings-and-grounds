// scripts/clear-data.ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.notification.deleteMany({ where: { workRequestId: { not: null } } });
  await prisma.workRequestAccomplishment.deleteMany({});
  await prisma.workRequestAssignment.deleteMany({});
  await prisma.stockMovement.deleteMany({});
  await prisma.itemIssuance.deleteMany({});
  await prisma.warehouseWithdrawal.deleteMany({});
  await prisma.maintenanceSchedule.deleteMany({});
  await prisma.workRequest.deleteMany({});
  await prisma.inventoryItem.deleteMany({});
  console.log('Cleared.');
}

main().catch(console.error).finally(() => prisma.$disconnect());