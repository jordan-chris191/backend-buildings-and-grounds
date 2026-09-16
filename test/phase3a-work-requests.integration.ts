import { AssignmentRole, Campus, ItemType, Prisma, RequestStatus, ApprovalStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();
let checks = 0;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks++; }

async function main() {
  await prisma.$connect();
  const role = await prisma.role.upsert({ where: { name: 'Campus Staff' }, update: {}, create: { name: 'Campus Staff' } });
  const position = await prisma.position.upsert({ where: { name: 'Phase 3A Technician' }, update: { isActive: true }, create: { name: 'Phase 3A Technician' } });
  const office = await prisma.office.upsert({ where: { name_campus: { name: 'Phase 3A Office', campus: Campus.MC1 } }, update: { isActive: true }, create: { name: 'Phase 3A Office', campus: Campus.MC1 } });
  const users = await Promise.all([0, 1, 2].map(index => prisma.user.upsert({ where: { email: `phase3a-${index}@example.invalid` }, update: { isActive: true, positionId: position.id, officeId: office.id }, create: { email: `phase3a-${index}@example.invalid`, passwordHash: 'x', firstName: 'Phase', lastName: `${index}`, roleId: role.id, positionId: position.id, officeId: office.id } })));
  const request = await prisma.workRequest.create({ data: { referenceNo: `P3A-${Date.now()}-${Math.random()}`, requestType: 'REPAIR', campus: Campus.MC1, requestedById: users[0].id, requestingOfficeId: office.id, status: RequestStatus.ASSIGNED, approvalStatus: ApprovalStatus.APPROVED } });
  const assignment = (userId: string, role: AssignmentRole) => prisma.workRequestAssignment.create({ data: { workRequestId: request.id, userId, role } });
  const duplicate = await Promise.allSettled([assignment(users[1].id, AssignmentRole.MEMBER), assignment(users[1].id, AssignmentRole.MEMBER)]);
  check(duplicate.filter(result => result.status === 'fulfilled').length === 1, 'concurrent duplicate active assignment was accepted');
  const leads = await Promise.allSettled([assignment(users[0].id, AssignmentRole.LEAD), assignment(users[2].id, AssignmentRole.LEAD)]);
  check(leads.filter(result => result.status === 'fulfilled').length === 1, 'concurrent active leads were accepted');
  const transitions = await Promise.allSettled([
    prisma.workRequest.updateMany({ where: { id: request.id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } }, data: { status: RequestStatus.COMPLETED } }),
    prisma.workRequest.updateMany({ where: { id: request.id, status: { in: [RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS] } }, data: { status: RequestStatus.CANCELLED } }),
  ]);
  const wins = transitions.filter((result): result is PromiseFulfilledResult<{ count: number }> => result.status === 'fulfilled' && result.value.count === 1);
  check(wins.length === 1, 'conditional terminal transition did not protect duplicate completion');
  const item = await prisma.inventoryItem.create({ data: { name: `p3a-item-${Date.now()}`, type: ItemType.CONSUMABLE, campus: Campus.MC1, quantity: new Prisma.Decimal(999) } });
  await prisma.inventoryStock.create({ data: { inventoryItemId: item.id, campus: Campus.MC1, quantity: 5 } });
  await prisma.workRequestItem.create({ data: { workRequestId: request.id, inventoryItemId: item.id, quantity: 1 } });
  let duplicateItemRejected = false;
  try { await prisma.workRequestItem.create({ data: { workRequestId: request.id, inventoryItemId: item.id, quantity: 1 } }); } catch { duplicateItemRejected = true; }
  check(duplicateItemRejected, 'duplicate material line was accepted');
  console.log(`phase3a postgres work-request integration passed: ${checks}/4 assertions`);
  await prisma.$disconnect();
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
