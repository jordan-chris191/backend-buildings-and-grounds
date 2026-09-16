import { AssignmentRole, RequestType } from '@prisma/client';

const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  REGULAR_MAINTENANCE: 'Regular Maintenance',
  REPAIR: 'Repair',
  FABRICATION: 'Fabrication',
  INSTALLATION: 'Installation',
  REPLACEMENT: 'Replacement',
  PLAN_DESIGN: 'Plan / Design',
  BAYANIHAN: 'Bayanihan',
  OTHERS: 'Others',
};

const ASSIGNMENT_ROLE_LABELS: Record<AssignmentRole, string> = {
  LEAD: 'Lead',
  MEMBER: 'Member',
};

/** Display-only labels for persisted Work Request enum values. */
export function formatWorkRequestType(requestType: RequestType): string {
  return REQUEST_TYPE_LABELS[requestType];
}

export function formatAssignmentRole(role: AssignmentRole): string {
  return ASSIGNMENT_ROLE_LABELS[role];
}
