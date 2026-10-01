import { ForbiddenException } from '@nestjs/common';
import { ROLE_CODES } from '../auth/role-codes';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { EventsController } from './events.controller';

describe('EventsController authorization', () => {
  const events = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    archive: jest.fn(),
    reactivate: jest.fn(),
  };
  const controller = new EventsController(events as any);

  it('limits mutation endpoints to administrators and B&G officers', () => {
    for (const handler of [
      controller.create,
      controller.update,
      controller.archive,
      controller.reactivate,
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
        ROLE_CODES.ADMINISTRATOR,
        ROLE_CODES.BUILDING_GROUNDS_OFFICER,
      ]);
    }
  });

  it.each([
    ROLE_CODES.ADMINISTRATOR,
    ROLE_CODES.BUILDING_GROUNDS_OFFICER,
    ROLE_CODES.CAMPUS_STAFF,
    ROLE_CODES.PROPERTY_CUSTODIAN,
    ROLE_CODES.FACULTY,
  ])('allows %s to read events', (role) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller.findAll)).toContain(role);
    expect(Reflect.getMetadata(ROLES_KEY, controller.findOne)).toContain(role);
  });

  it.each([
    ROLE_CODES.FACULTY,
    ROLE_CODES.PROPERTY_CUSTODIAN,
    ROLE_CODES.CAMPUS_STAFF,
  ])('does not grant %s a mutation role', (role) => {
    expect(Reflect.getMetadata(ROLES_KEY, controller.create)).not.toContain(
      role,
    );
  });

  it('restricts inactive event history to operational roles', () => {
    expect(() =>
      controller.findAll(
        { user: { role: ROLE_CODES.FACULTY } },
        { includeInactive: true },
      ),
    ).toThrow(ForbiddenException);
    controller.findAll(
      { user: { role: ROLE_CODES.ADMINISTRATOR } },
      { includeInactive: true },
    );
    expect(events.findAll).toHaveBeenCalledWith({ includeInactive: true });
  });
});
