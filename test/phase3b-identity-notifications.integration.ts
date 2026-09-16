import { Campus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();
let checks = 0;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks++; }

async function main() {
  await prisma.$connect();
  const role = await prisma.role.upsert({ where: { name: 'phase3b-role' }, update: { isActive: true }, create: { name: 'phase3b-role' } });
  const person = await prisma.person.create({ data: { firstName: 'Phase3B', lastName: `${Date.now()}` } });
  const [first, second] = await Promise.all([0, 1].map(index => prisma.user.create({ data: { email: `phase3b-${Date.now()}-${index}@example.invalid`, passwordHash: 'x', firstName: 'P', lastName: `${index}`, roleId: role.id } })));
  await prisma.user.update({ where: { id: first.id }, data: { personId: person.id } });
  let duplicateLinkRejected = false;
  try { await prisma.user.update({ where: { id: second.id }, data: { personId: person.id } }); } catch { duplicateLinkRejected = true; }
  check(duplicateLinkRejected, 'one Person was linked to multiple users');
  const office = await prisma.office.upsert({ where: { name_campus: { name: 'phase3b-office', campus: Campus.MC1 } }, update: {}, create: { name: 'phase3b-office', campus: Campus.MC1 } });
  const request = await prisma.workRequest.create({ data: { referenceNo: `P3B-${Date.now()}`, requestType: 'REPAIR', campus: Campus.MC1, requestedById: first.id, requestingOfficeId: office.id } });
  const notification = await prisma.$transaction(tx => tx.notification.create({ data: { type: 'WORK_REQUEST_ASSIGNED', title: 'New Work Assignment', message: 'assignment', userId: second.id, workRequestId: request.id, referenceNo: request.referenceNo } }));
  check(notification.type === 'WORK_REQUEST_ASSIGNED' && notification.referenceNo === request.referenceNo, 'typed durable assignment notification was not persisted');
  const before = await prisma.notification.count({ where: { userId: second.id, workRequestId: request.id } });
  try { await prisma.$transaction(async tx => { await tx.notification.create({ data: { title: 'rollback', message: 'rollback', userId: second.id, workRequestId: request.id } }); throw new Error('rollback'); }); } catch { /* expected */ }
  check((await prisma.notification.count({ where: { userId: second.id, workRequestId: request.id } })) === before, 'failed transaction left a durable notification');
  console.log(`phase3b postgres identity/notification integration passed: ${checks}/3 assertions`);
  await prisma.$disconnect();
}
main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
