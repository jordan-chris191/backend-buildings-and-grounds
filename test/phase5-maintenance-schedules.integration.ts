import { ApprovalStatus, AssignmentRole, Campus, ItemType, MaintenanceBasis, RequestStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { MaintenanceSchedulesService } from '../src/maintenance-schedules/maintenance-schedules.service';
import { WorkRequestsService } from '../src/work-requests/work-requests.service';

const prisma = new PrismaService();
const audit: any = { log: () => Promise.resolve() };
const notifications: any = { create: () => Promise.resolve(), createInTransaction: (tx: any, data: any) => tx.notification.create({ data }), emit() {} };
const realtimeEvents: Array<{ workRequestId: string; maintenanceScheduleId: string | null }> = [];
const gateway = {
  emitWorkRequestUpdated: (workRequestId: string, maintenanceScheduleId: string | null) => {
    realtimeEvents.push({ workRequestId, maintenanceScheduleId });
  },
} as any;
const maintenance = new MaintenanceSchedulesService(prisma, audit, gateway);
const work = new WorkRequestsService(prisma, audit, notifications, gateway);
let checks = 0;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks++; }
async function fails(fn: () => Promise<unknown>) { try { await fn(); } catch { checks++; return; } throw new Error('Expected failure'); }

async function main() {
  await prisma.$connect();
  const suffix = `${Date.now()}-${Math.random()}`;
  const role = await prisma.role.findUniqueOrThrow({ where: { code: 'CAMPUS_STAFF' } });
  const position = await prisma.position.upsert({ where: { name: `P5 Tech ${suffix}` }, update: { isActive: true }, create: { name: `P5 Tech ${suffix}` } });
  const user = await prisma.user.create({ data: { email: `p5-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'P5', lastName: 'Tech', roleId: role.id, positionId: position.id } });
  async function item(label: string) {
    const inventoryItem = await prisma.inventoryItem.create({ data: { name: `p5-${label}-${suffix}`, type: ItemType.ASSET, campus: Campus.MC1, quantity: 0 } });
    await prisma.maintainableAssetProfile.create({ data: { inventoryItemId: inventoryItem.id, assetType: 'OTHER' } });
    return inventoryItem;
  }
  async function ready(wrId: string) {
    await prisma.workRequest.update({ where: { id: wrId }, data: { status: RequestStatus.ASSIGNED, approvalStatus: ApprovalStatus.APPROVED } });
    await prisma.workRequestAssignment.create({ data: { workRequestId: wrId, userId: user.id, role: AssignmentRole.MEMBER } });
  }

  // Runtime update/history and inactive visibility/reactivation behavior.
  const runtimeItem = await item('runtime');
  const runtime = await maintenance.create(user.id, { title: 'runtime', basis: MaintenanceBasis.RUNTIME, inventoryItemId: runtimeItem.id, frequencyHours: 100 });
  await maintenance.update(runtime.id, user.id, { title: 'runtime updated', notes: 'history retained', frequencyHours: 120 });
  const updated = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: runtime.id } });
  check(updated.title === 'runtime updated' && updated.frequencyHours!.eq(120) && updated.nextDueAtHours!.eq(100), 'runtime update changed current threshold or did not persist safe fields');
  await fails(() => maintenance.update(runtime.id, user.id, { frequencyDays: 7 }));
  await maintenance.recordRunHours(runtime.id, user.id, { hours: 10 });
  const runtimeDetail: any = await maintenance.findOne(runtime.id);
  check(runtimeDetail.runHourReadings.length === 1 && runtimeDetail.runHourReadings[0].recordedBy.id === user.id && runtimeDetail.runHourReadings[0].recordedAt, 'runtime reading history is missing recorder identity');
  await maintenance.deactivate(runtime.id, user.id);
  check((await maintenance.findAll()).every(schedule => schedule.id !== runtime.id) && (await maintenance.findAll(true)).some(schedule => schedule.id === runtime.id), 'includeInactive listing is incorrect');
  await maintenance.reactivate(runtime.id, user.id);
  check((await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: runtime.id } })).isActive, 'reactivation did not restore active schedule');

  // The partial unique index is also enforced on reactivation.
  const conflictItem = await item('reactivate-conflict');
  const inactive = await maintenance.create(user.id, { title: 'first', basis: MaintenanceBasis.RUNTIME, inventoryItemId: conflictItem.id, frequencyHours: 100 });
  await maintenance.deactivate(inactive.id, user.id);
  await maintenance.create(user.id, { title: 'second', basis: MaintenanceBasis.RUNTIME, inventoryItemId: conflictItem.id, frequencyHours: 200 });
  await fails(() => maintenance.reactivate(inactive.id, user.id));

  // Policy: creation creates the first calendar cycle immediately, even if future-due.
  const calendarItem = await item('calendar');
  const initialDue = new Date(Date.now() + 86_400_000);
  const calendar = await maintenance.create(user.id, { title: 'calendar', basis: MaintenanceBasis.CALENDAR, inventoryItemId: calendarItem.id, frequencyDays: 7, nextDueAt: initialDue.toISOString() });
  const first = await prisma.workRequest.findFirstOrThrow({ where: { maintenanceScheduleId: calendar.id, maintenanceCycleKey: `calendar:${initialDue.toISOString()}` } });
  check(!!first, 'initial calendar cycle was not generated at creation');
  check(realtimeEvents.some(event => event.workRequestId === first.id && event.maintenanceScheduleId === calendar.id), 'initial calendar work request did not emit a maintenance-scoped realtime event');
  await ready(first.id);
  const completedAt = new Date(Date.now() + 1_000);
  await work.complete(first.id, user.id, { dateTimeCompleted: completedAt.toISOString() }, 'CAMPUS_STAFF');
  const afterFirst = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: calendar.id } });
  check(afterFirst.nextDueAt!.getTime() === completedAt.getTime() + 7 * 86_400_000, 'completed generated calendar work request did not advance nextDueAt');

  // Future cycles are generated only when due; parallel scheduler bodies share one cycle.
  const due = new Date(Date.now() - 1_000);
  await prisma.maintenanceSchedule.update({ where: { id: calendar.id }, data: { nextDueAt: due } });
  const generated = await Promise.all([maintenance.processDueCalendarSchedules(), maintenance.processDueCalendarSchedules()]);
  const secondKey = `calendar:${due.toISOString()}`;
  check(generated.reduce((a, b) => a + b, 0) === 1 && (await prisma.workRequest.count({ where: { maintenanceScheduleId: calendar.id, maintenanceCycleKey: secondKey } })) === 1, 'concurrent scheduler execution created duplicate calendar cycles');
  const second = await prisma.workRequest.findFirstOrThrow({ where: { maintenanceScheduleId: calendar.id, maintenanceCycleKey: secondKey } });
  check(realtimeEvents.filter(event => event.workRequestId === second.id && event.maintenanceScheduleId === calendar.id).length === 1, 'scheduler did not emit exactly once for its newly generated cycle');
  check((await maintenance.processDueCalendarSchedules()) === 0, 'scheduler was not idempotent for an open cycle');
  check(realtimeEvents.filter(event => event.workRequestId === second.id).length === 1, 'idempotent scheduler emitted a fake realtime creation event');
  await ready(second.id);
  await work.complete(second.id, user.id, {}, 'CAMPUS_STAFF');
  const afterSecond = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: calendar.id } });
  const laterDue = new Date(Date.now() - 1_000);
  await prisma.maintenanceSchedule.update({ where: { id: calendar.id }, data: { nextDueAt: laterDue } });
  await maintenance.processDueCalendarSchedules();
  check(afterSecond.nextDueAt && (await prisma.workRequest.count({ where: { maintenanceScheduleId: calendar.id, maintenanceCycleKey: `calendar:${laterDue.toISOString()}` } })) === 1, 'scheduler did not generate the later calendar cycle');
  console.log(`phase5 maintenance integration passed: ${checks}/11 assertions`);
  await prisma.$disconnect();
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
