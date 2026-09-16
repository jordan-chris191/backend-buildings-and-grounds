/** Stable authorization identities. Display names remain editable metadata. */
export const ROLE_CODES = {
  ADMINISTRATOR: 'ADMINISTRATOR',
  BUILDING_GROUNDS_OFFICER: 'BUILDING_GROUNDS_OFFICER',
  CAMPUS_STAFF: 'CAMPUS_STAFF',
  PROPERTY_CUSTODIAN: 'PROPERTY_CUSTODIAN',
  FACULTY: 'FACULTY',
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];
