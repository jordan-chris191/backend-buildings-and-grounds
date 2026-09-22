import { Campus, ItemType, RequestType, WorkRequestSource } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
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
const work = new WorkRequestsService(prisma, audit, notifications, gateway);
let checks = 0;
function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); checks++; }
async function fails(fn: () => Promise<unknown>) { try { await fn(); } catch { checks++; return; } throw new Error('Expected failure'); }

async function main() {
  await prisma.$connect();
  const suffix = `${Date.now()}-${Math.random()}`;
  const [adminRole, bgRole, facultyRole, staffRole] = await Promise.all([
    prisma.role.upsert({ where: { code: 'ADMINISTRATOR' }, update: { isActive: true }, create: { code: 'ADMINISTRATOR', name: 'Administrator' } }),
    prisma.role.upsert({ where: { code: 'BUILDING_GROUNDS_OFFICER' }, update: { isActive: true }, create: { code: 'BUILDING_GROUNDS_OFFICER', name: 'Building & Grounds Officer' } }),
    prisma.role.upsert({ where: { code: 'FACULTY' }, update: { isActive: true }, create: { code: 'FACULTY', name: 'Faculty' } }),
    prisma.role.upsert({ where: { code: 'CAMPUS_STAFF' }, update: { isActive: true }, create: { code: 'CAMPUS_STAFF', name: 'Staff' } }),
  ]);
  const office = await prisma.office.create({ data: { name: `walk-in office ${suffix}`, campus: Campus.MC1 } });
  const inactiveOffice = await prisma.office.create({ data: { name: `walk-in inactive ${suffix}`, campus: Campus.MC1, isActive: false } });
  const position = await prisma.position.create({ data: { name: `walk-in tech ${suffix}` } });
  const [admin, bg, faculty, staff] = await Promise.all([
    prisma.user.create({ data: { email: `walk-admin-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'Walk', lastName: 'Admin', roleId: adminRole.id } }),
    prisma.user.create({ data: { email: `walk-bg-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'Walk', lastName: 'BG', roleId: bgRole.id } }),
    prisma.user.create({ data: { email: `walk-faculty-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'Walk', lastName: 'Faculty', roleId: facultyRole.id, officeId: office.id } }),
    prisma.user.create({ data: { email: `walk-staff-${suffix}@example.invalid`, passwordHash: 'x', firstName: 'Walk', lastName: 'Staff', roleId: staffRole.id, positionId: position.id } }),
  ]);
  const item = await prisma.inventoryItem.create({ data: { name: `walk-item-${suffix}`, type: ItemType.CONSUMABLE, campus: Campus.MC1, quantity: 10 } });
  await prisma.inventoryStock.create({ data: { inventoryItemId: item.id, campus: Campus.MC1, quantity: 10 } });
  const dto = { walkInRequesterName: 'In Person', walkInRequesterContact: '0917', requestingOfficeId: office.id, requestType: RequestType.REPAIR, items: [{ inventoryItemId: item.id, quantity: 1 }] };

  const walkIn = await work.createWalkIn(bg.id, dto);
  check(walkIn.source === WorkRequestSource.WALK_IN && walkIn.requestedById === null && walkIn.createdById === bg.id && walkIn.campus === office.campus, 'B&G walk-in creation did not preserve source/requester/creator/campus');
  check(realtimeEvents.some(event => event.workRequestId === walkIn.id && event.maintenanceScheduleId === null), 'walk-in creation did not emit a realtime update');
  const adminWalkIn = await work.createWalkIn(admin.id, { ...dto, walkInRequesterName: 'Admin encoded' });
  check(adminWalkIn.createdById === admin.id, 'Administrator walk-in creation did not retain creator');
  const eventsBeforeRejectedCreates = realtimeEvents.length;
  await fails(() => work.createWalkIn(bg.id, { ...dto, requestingOfficeId: inactiveOffice.id }));
  await fails(() => work.createWalkIn(bg.id, { ...dto, walkInRequesterName: '' }));
  check(realtimeEvents.length === eventsBeforeRejectedCreates, 'failed walk-in creation emitted a realtime update');

  const online = await work.create(faculty.id, { requestType: RequestType.REPAIR, campus: Campus.MC1, requestingOfficeId: office.id });
  check(online.source === WorkRequestSource.ONLINE && online.requestedById === faculty.id && online.createdById === faculty.id, 'online creation regressed provenance');
  check(realtimeEvents.some(event => event.workRequestId === online.id && event.maintenanceScheduleId === null), 'online creation did not emit a realtime update');
  const edited = await work.update(walkIn.id, bg.id, { particulars: 'edited', walkInRequesterContact: '0999', requestType: RequestType.INSTALLATION });
  check(edited.particulars === 'edited' && edited.walkInRequesterContact === '0999' && edited.requestType === RequestType.INSTALLATION, 'pending walk-in update failed');
  check(realtimeEvents.filter(event => event.workRequestId === walkIn.id).length >= 2, 'walk-in update did not emit a realtime update');
  await work.remove(adminWalkIn.id, admin.id);
  check(!(await prisma.workRequest.findUniqueOrThrow({ where: { id: adminWalkIn.id } })).isActive, 'pending walk-in archive was not soft deletion');
  check(realtimeEvents.filter(event => event.workRequestId === adminWalkIn.id).length === 2, 'walk-in archive did not emit exactly one additional realtime update');

  await work.approve(walkIn.id, bg.id, {});
  await work.assign(walkIn.id, bg.id, { userId: staff.id, role: 'MEMBER' });
  await work.updateProgress(walkIn.id, 50, staff.id, undefined, 'CAMPUS_STAFF');
  check(realtimeEvents.filter(event => event.workRequestId === walkIn.id).length >= 4, 'progress update did not emit a realtime update');
  await work.complete(walkIn.id, staff.id, {}, 'CAMPUS_STAFF');
  check((await prisma.workRequest.findUniqueOrThrow({ where: { id: walkIn.id } })).status === 'COMPLETED', 'walk-in approval/assignment/completion workflow regressed');
  check(realtimeEvents.filter(event => event.workRequestId === walkIn.id).length >= 6, 'approval, assignment, progress, and completion did not all emit realtime updates');
  const cancellable = await work.create(faculty.id, { requestType: RequestType.REPAIR, campus: Campus.MC1, requestingOfficeId: office.id });
  await work.cancel(cancellable.id, bg.id);
  check(realtimeEvents.filter(event => event.workRequestId === cancellable.id).length === 2, 'cancellation did not emit exactly one additional realtime update');
  await fails(() => work.remove(walkIn.id, bg.id));
  check((await prisma.workRequest.count({ where: { source: WorkRequestSource.ONLINE } })) > 0, 'migration backfill left no valid online provenance');
  console.log(`phase6 walk-in work-request integration passed: ${checks}/10 assertions`);
  await prisma.$disconnect();
}

main().catch(async error => { console.error(error); await prisma.$disconnect(); process.exit(1); });
