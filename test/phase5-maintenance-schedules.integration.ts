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
  const facultyRole = await prisma.role.findUniqueOrThrow({ where: { code: 'FACULTY' } });
  const faculty = await prisma.user.create({ data: { email: `p5-faculty-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'P5', lastName: 'Faculty', roleId: facultyRole.id, positionId: position.id } });
  const inactiveUser = await prisma.user.create({ data: { email: `p5-inactive-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'P5', lastName: 'Inactive', roleId: role.id, positionId: position.id, isActive: false } });
  const inactivePosition = await prisma.position.create({ data: { name: `P5 Inactive ${suffix}`, isActive: false } });
  const inactivePositionUser = await prisma.user.create({ data: { email: `p5-inactive-position-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'P5', lastName: 'Inactive Position', roleId: role.id, positionId: inactivePosition.id } });
  await prisma.assetTypeConfig.upsert({ where: { assetType: 'OTHER' }, update: { positionId: position.id, isActive: true }, create: { assetType: 'OTHER', positionId: position.id } });
  async function item(label: string) {
    const inventoryItem = await prisma.inventoryItem.create({ data: { name: `p5-${label}-${suffix}`, type: ItemType.ASSET, campus: Campus.MC1, quantity: 0 } });
    await prisma.maintainableAssetProfile.create({ data: { inventoryItemId: inventoryItem.id, assetType: 'OTHER' } });
    return inventoryItem;
  }
  async function ready(wrId: string) { await work.approve(wrId, user.id, {}); }

  // Runtime update/history and inactive visibility/reactivation behavior.
  const runtimeItem = await item('runtime');
  const runtime = await maintenance.create(user.id, { title: 'runtime', basis: MaintenanceBasis.RUNTIME, inventoryItemId: runtimeItem.id, frequencyHours: 100 });
  await maintenance.update(runtime.id, user.id, { defaultAssigneeId: user.id });
  check((await maintenance.findOne(runtime.id)).defaultAssigneeId === user.id, 'schedule default assignee update failed');
  await maintenance.update(runtime.id, user.id, { defaultAssigneeId: null });
  check((await maintenance.findOne(runtime.id)).defaultAssigneeId === null, 'schedule default assignee clearing failed');
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
  const facultyDefaultItem = await item('faculty-default');
  const inactiveDefaultItem = await item('inactive-default');
  const inactivePositionDefaultItem = await item('inactive-position-default');
  await fails(() => maintenance.create(user.id, { title: 'faculty default', basis: MaintenanceBasis.CALENDAR, inventoryItemId: facultyDefaultItem.id, frequencyDays: 7, nextDueAt: new Date().toISOString(), defaultAssigneeId: faculty.id }));
  await fails(() => maintenance.create(user.id, { title: 'inactive default', basis: MaintenanceBasis.CALENDAR, inventoryItemId: inactiveDefaultItem.id, frequencyDays: 7, nextDueAt: new Date().toISOString(), defaultAssigneeId: inactiveUser.id }));
  await fails(() => maintenance.create(user.id, { title: 'inactive position default', basis: MaintenanceBasis.CALENDAR, inventoryItemId: inactivePositionDefaultItem.id, frequencyDays: 7, nextDueAt: new Date().toISOString(), defaultAssigneeId: inactivePositionUser.id }));
  const incompatiblePosition = await prisma.position.create({ data: { name: `P5 Other ${suffix}` } });
  await prisma.assetTypeConfig.upsert({ where: { assetType: 'OTHER' }, update: { positionId: incompatiblePosition.id, isActive: true }, create: { assetType: 'OTHER', positionId: incompatiblePosition.id } });
  await fails(() => maintenance.create(user.id, { title: 'incompatible default', basis: MaintenanceBasis.CALENDAR, inventoryItemId: calendarItem.id, frequencyDays: 7, nextDueAt: new Date().toISOString(), defaultAssigneeId: user.id }));
  await prisma.assetTypeConfig.update({ where: { assetType: 'OTHER' }, data: { positionId: position.id, isActive: true } });
  const initialDue = new Date(Date.now() + 86_400_000);
  const calendar = await maintenance.create(user.id, { title: 'calendar', basis: MaintenanceBasis.CALENDAR, inventoryItemId: calendarItem.id, frequencyDays: 7, nextDueAt: initialDue.toISOString(), defaultAssigneeId: user.id });
  const first = await prisma.workRequest.findFirstOrThrow({ where: { maintenanceScheduleId: calendar.id, maintenanceCycleKey: `calendar:${initialDue.toISOString()}` } });
  check(!!first, 'initial calendar cycle was not generated at creation');
  check(first.status === RequestStatus.PENDING && first.approvalStatus === ApprovalStatus.PENDING && (await prisma.workRequestAssignment.count({ where: { workRequestId: first.id, unassignedAt: null } })) === 0, 'generated maintenance request must await approval before assignment');
  check((await maintenance.findOne(calendar.id)).workRequests.find(request => request.id === first.id)?.assignments.length === 0, 'schedule detail did not expose an empty pre-approval assignment list');
  check(realtimeEvents.some(event => event.workRequestId === first.id && event.maintenanceScheduleId === calendar.id), 'initial calendar work request did not emit a maintenance-scoped realtime event');
  const beforeBlockedReject = await prisma.workRequest.findUniqueOrThrow({ where: { id: first.id } });
  await fails(() => work.reject(first.id, user.id, { reason: 'not applicable' }));
  const afterBlockedReject = await prisma.workRequest.findUniqueOrThrow({ where: { id: first.id } });
  check(afterBlockedReject.status === beforeBlockedReject.status && afterBlockedReject.approvalStatus === beforeBlockedReject.approvalStatus && (await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: calendar.id } })).nextDueAt!.getTime() === initialDue.getTime(), 'blocked maintenance rejection changed its work request or schedule');
  await ready(first.id);
  const autoAssignment = await prisma.workRequestAssignment.findFirstOrThrow({ where: { workRequestId: first.id, unassignedAt: null } });
  check(autoAssignment.userId === user.id && autoAssignment.role === AssignmentRole.LEAD && (await prisma.workRequestAssignment.count({ where: { workRequestId: first.id, unassignedAt: null } })) === 1, 'approval did not create exactly one preferred LEAD assignment');
  const projectedAssignment = (await maintenance.findOne(calendar.id)).workRequests.find(request => request.id === first.id)?.assignments[0];
  check(projectedAssignment?.role === AssignmentRole.LEAD && projectedAssignment.user.id === user.id && projectedAssignment.user.position?.id === position.id, 'schedule detail did not expose the safe preferred-assignee assignment projection');
  await work.unassign(first.id, autoAssignment.id, user.id);
  await work.assign(first.id, user.id, { userId: user.id, role: AssignmentRole.MEMBER });
  check((await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: calendar.id } })).defaultAssigneeId === user.id, 'manual request reassignment changed the schedule default');
  check((await maintenance.findOne(calendar.id)).workRequests.find(request => request.id === first.id)?.assignments.some(assignment => assignment.unassignedAt !== null) === true, 'schedule detail did not preserve unassigned assignment history');
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
  check((await prisma.workRequestAssignment.findFirstOrThrow({ where: { workRequestId: second.id, unassignedAt: null } })).userId === user.id, 'future cycle did not reuse the schedule default assignee');
  await work.complete(second.id, user.id, {}, 'CAMPUS_STAFF');
  const afterSecond = await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: calendar.id } });
  const laterDue = new Date(Date.now() - 1_000);
  await prisma.maintenanceSchedule.update({ where: { id: calendar.id }, data: { nextDueAt: laterDue } });
  await maintenance.processDueCalendarSchedules();
  check(afterSecond.nextDueAt && (await prisma.workRequest.count({ where: { maintenanceScheduleId: calendar.id, maintenanceCycleKey: `calendar:${laterDue.toISOString()}` } })) === 1, 'scheduler did not generate the later calendar cycle');

  // A stale preference never blocks generation: approval falls back to matching active staff.
  const fallbackUser = await prisma.user.create({ data: { email: `p5-fallback-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'P5', lastName: 'Fallback', roleId: role.id, positionId: position.id } });
  const fallbackItem = await item('inactive-preferred-fallback');
  const fallbackSchedule = await maintenance.create(user.id, { title: 'inactive preferred fallback', basis: MaintenanceBasis.RUNTIME, inventoryItemId: fallbackItem.id, frequencyHours: 10, defaultAssigneeId: user.id });
  await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });
  await maintenance.recordRunHours(fallbackSchedule.id, fallbackUser.id, { hours: 10 });
  const fallbackRequest = await prisma.workRequest.findFirstOrThrow({ where: { maintenanceScheduleId: fallbackSchedule.id } });
  await work.approve(fallbackRequest.id, fallbackUser.id, {});
  check((await prisma.workRequestAssignment.findFirstOrThrow({ where: { workRequestId: fallbackRequest.id, unassignedAt: null } })).userId === fallbackUser.id && (await prisma.maintenanceSchedule.findUniqueOrThrow({ where: { id: fallbackSchedule.id } })).defaultAssigneeId === user.id, 'inactive preferred worker did not safely fall back without rewriting the preference');
  check((await maintenance.findOne(fallbackSchedule.id)).workRequests.find(request => request.id === fallbackRequest.id)?.assignments.some(assignment => assignment.role === AssignmentRole.MEMBER && assignment.user.id === fallbackUser.id) === true, 'schedule detail did not expose fallback MEMBER assignments');
  await prisma.user.update({ where: { id: user.id }, data: { isActive: true } });
  console.log(`phase5 maintenance integration passed: ${checks}/31 assertions`);
  await prisma.$disconnect();
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
