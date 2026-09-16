import { AssignmentRole, RequestType } from '@prisma/client';
import { formatAssignmentRole, formatWorkRequestType } from './work-request-display';

describe('Work Request display formatters', () => {
  it.each([
    [RequestType.REGULAR_MAINTENANCE, 'Regular Maintenance'],
    [RequestType.REPAIR, 'Repair'],
    [RequestType.FABRICATION, 'Fabrication'],
    [RequestType.INSTALLATION, 'Installation'],
    [RequestType.REPLACEMENT, 'Replacement'],
    [RequestType.PLAN_DESIGN, 'Plan / Design'],
    [RequestType.BAYANIHAN, 'Bayanihan'],
    [RequestType.OTHERS, 'Others'],
  ])('formats request type %s', (value, expected) => {
    expect(formatWorkRequestType(value as RequestType)).toBe(expected);
  });

  it.each([
    [AssignmentRole.LEAD, 'Lead'],
    [AssignmentRole.MEMBER, 'Member'],
  ])('formats assignment role %s', (value, expected) => {
    expect(formatAssignmentRole(value as AssignmentRole)).toBe(expected);
  });
});
