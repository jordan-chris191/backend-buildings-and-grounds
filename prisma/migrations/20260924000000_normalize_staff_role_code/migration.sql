-- Phase 4 recognized the display name "Campus Staff" but pre-existing local
-- data used the synonymous canonical role name "Staff". Repair only that
-- known legacy row; do not infer codes for arbitrary legacy roles.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Role" WHERE "name" = 'Staff' AND "code" LIKE 'LEGACY_%')
     AND EXISTS (SELECT 1 FROM "Role" WHERE "code" = 'CAMPUS_STAFF') THEN
    RAISE EXCEPTION 'Cannot normalize Staff role: CAMPUS_STAFF is already assigned to another Role row.';
  END IF;
END $$;

-- This migration is the controlled exception to normal Role.code immutability.
DROP TRIGGER IF EXISTS "Role_code_immutable" ON "Role";

UPDATE "Role"
SET "code" = 'CAMPUS_STAFF'
WHERE "name" = 'Staff'
  AND "code" LIKE 'LEGACY_%';

-- Normalize databases previously seeded with the alternate display label.
UPDATE "Role"
SET "name" = 'Staff'
WHERE "code" = 'CAMPUS_STAFF'
  AND "name" = 'Campus Staff';

CREATE TRIGGER "Role_code_immutable"
BEFORE UPDATE ON "Role"
FOR EACH ROW EXECUTE FUNCTION prevent_role_code_update();
