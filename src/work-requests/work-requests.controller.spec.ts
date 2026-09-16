import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { WorkRequestsController } from './work-requests.controller';

describe('WorkRequestsController walk-in authorization', () => {
  it('limits walk-in creation to canonical privileged operational roles', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, WorkRequestsController.prototype.createWalkIn);
    expect(roles).toEqual(['ADMINISTRATOR', 'BUILDING_GROUNDS_OFFICER']);
    expect(roles).not.toContain('FACULTY');
    expect(roles).not.toContain('CAMPUS_STAFF');
  });
});
