import { ApprovalStatus, AssignmentRole, Campus, ItemType, MaintenanceBasis, Prisma, RequestStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { MaintenanceSchedulesService } from '../src/maintenance-schedules/maintenance-schedules.service';
import { WorkRequestsService } from '../src/work-requests/work-requests.service';

const prisma = new PrismaService();
const audit: any = { log: () => Promise.resolve() };
const notifications: any = { create: () => Promise.resolve(), createInTransaction: (tx: any, data: any) => tx.notification.create({ data }), emit() {} };
const maintenance = new MaintenanceSchedulesService(prisma, audit);
const work = new WorkRequestsService(prisma, audit, notifications);
let passed = 0; let failed = 0;
function check(value: unknown, message: string) { if (!value) throw new Error(message); passed++; }
async function expectFailure(fn: () => Promise<unknown>) { try { await fn(); } catch { passed++; return; } throw new Error('expected failure'); }

async function main() {
  await prisma.$connect();
  const role = await prisma.role.upsert({ where: { name: 'Campus Staff' }, update: { isActive: true }, create: { name: 'Campus Staff' } });
  const position = await prisma.position.upsert({ where: { name: 'P3C Tech' }, update: { isActive: true }, create: { name: 'P3C Tech' } });
  const user = await prisma.user.upsert({ where: { email: 'p3c@example.invalid' }, update: { isActive: true, positionId: position.id }, create: { email: 'p3c@example.invalid', passwordHash: 'x', firstName: 'P3', lastName: 'C', roleId: role.id, positionId: position.id } });
  async function item(label: string) { const i = await prisma.inventoryItem.create({ data: { name: `${label}-${Date.now()}-${Math.random()}`, type: ItemType.ASSET, campus: Campus.MC1, quantity: 0 } }); await prisma.maintainableAssetProfile.create({ data: { inventoryItemId: i.id, assetType: 'OTHER' } }); return i; }
  async function ready(wrId: string) { await prisma.workRequest.update({ where: { id: wrId }, data: { status: RequestStatus.ASSIGNED, approvalStatus: ApprovalStatus.APPROVED } }); await prisma.workRequestAssignment.create({ data: { workRequestId: wrId, userId: user.id, role: AssignmentRole.MEMBER } }); }

  // Calendar creation, linkage, cycle uniqueness, completion, guard/deactivation.
  const ci = await item('calendar'); const due = new Date(Date.now() + 86_400_000);
  const cal = await maintenance.create(user.id, { title: 'calendar', basis: MaintenanceBasis.CALENDAR, inventoryItemId: ci.id, frequencyDays: 7, nextDueAt: due.toISOString() });
  const cwr = await prisma.workRequest.findFirstOrThrow({ where: { maintenanceScheduleId: cal.id } });
  check(cwr.maintenanceCycleKey === `calendar:${due.toISOString()}`, 'calendar atomic creation/linkage failed');
  await expectFailure(() => maintenance.deactivate(cal.id, user.id));
  await expectFailure(() => maintenance.complete(cal.id, user.id));
  await expectFailure(() => Promise.all([1, 2].map(() => prisma.workRequest.create({ data: { referenceNo: `p3c-dup-${Date.now()}-${Math.random()}`, requestType: 'REPAIR', campus: Campus.MC1, requestedById: user.id, maintenanceScheduleId: cal.id, maintenanceCycleKey: cwr.maintenanceCycleKey } }))));
  await ready(cwr.id); const before = new Date(Date.now() + 1_000); const completions = await Promise.allSettled([work.complete(cwr.id, user.id, { dateTimeCompleted: before.toISOString() }, 'Campus Staff'), work.complete(cwr.id, user.id, { dateTimeCompleted: before.toISOString() }, 'Campus Staff')]);
  const completionWins = completions.filter(x => x.status === 'fulfilled').length;
  if (completionWins !== 1) console.error(completions);
  check(completionWins === 1, 'calendar concurrent completion failed');
  const calAfter = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: cal.id } });
  check(!!calAfter.lastPerformedAt && calAfter.nextDueAt!.getTime() === before.getTime() + 7 * 86_400_000, 'calendar advancement wrong');

  // Runtime below/cross/decrease and multiple-threshold conservative cycle.
  const ri = await item('runtime'); const runtime = await maintenance.create(user.id, { title: 'runtime', basis: MaintenanceBasis.RUNTIME, inventoryItemId: ri.id, frequencyHours: 100 });
  await prisma.maintenanceSchedule.update({ where: { id: runtime.id }, data: { currentRunHours: new Prisma.Decimal(490), nextDueAtHours: new Prisma.Decimal(500) } });
  await maintenance.recordRunHours(runtime.id, user.id, { hours: 495 }); check((await prisma.workRequest.count({ where: { maintenanceScheduleId: runtime.id } })) === 0, 'runtime below threshold generated request');
  await maintenance.recordRunHours(runtime.id, user.id, { hours: 505 }); let rwr = await prisma.workRequest.findFirstOrThrow({ where: { maintenanceScheduleId: runtime.id } }); check(rwr.maintenanceCycleKey === 'runtime:500', 'runtime threshold cycle incorrect');
  await expectFailure(() => maintenance.recordRunHours(runtime.id, user.id, { hours: 500 }));
  await ready(rwr.id); await work.complete(rwr.id, user.id, {}, 'Campus Staff'); check((await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: runtime.id } })).nextDueAtHours!.eq(600), 'runtime completion did not advance from cycle threshold');
  const qi = await item('runtime-concurrent'); const concurrent = await maintenance.create(user.id, { title: 'runtime-concurrent', basis: MaintenanceBasis.RUNTIME, inventoryItemId: qi.id, frequencyHours: 100 }); await prisma.maintenanceSchedule.update({ where: { id: concurrent.id }, data: { currentRunHours: new Prisma.Decimal(490), nextDueAtHours: new Prisma.Decimal(500) } }); await Promise.allSettled([maintenance.recordRunHours(concurrent.id, user.id, { hours: 505 }), maintenance.recordRunHours(concurrent.id, user.id, { hours: 510 })]); const concurrentSchedule = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: concurrent.id } }); check(concurrentSchedule.currentRunHours.eq(510) && (await prisma.workRequest.count({ where: { maintenanceScheduleId: concurrent.id, maintenanceCycleKey: 'runtime:500' } })) === 1, 'concurrent runtime readings failed');
  const mi = await item('multi'); const multi = await maintenance.create(user.id, { title: 'multi', basis: MaintenanceBasis.RUNTIME, inventoryItemId: mi.id, frequencyHours: 100 }); await prisma.maintenanceSchedule.update({ where: { id: multi.id }, data: { currentRunHours: new Prisma.Decimal(450), nextDueAtHours: new Prisma.Decimal(500) } }); await maintenance.recordRunHours(multi.id, user.id, { hours: 750 }); const keys = await prisma.workRequest.findMany({ where: { maintenanceScheduleId: multi.id }, select: { maintenanceCycleKey: true } }); check(keys.length === 1 && keys[0].maintenanceCycleKey === 'runtime:500', 'multiple threshold created wrong cycles');
  console.log(`phase3c postgres integration passed: ${passed}/12 scenarios; failed=${failed}`);
  await prisma.$disconnect();
}
main().catch(async error => { failed++; console.error(error); await prisma.$disconnect(); console.log(`phase3c postgres integration passed: ${passed}/12 scenarios; failed=${failed}`); process.exit(1); });
