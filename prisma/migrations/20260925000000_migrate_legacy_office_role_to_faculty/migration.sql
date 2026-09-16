-- "Office" was a pre-canonical requester-role label. The current authorization
-- model uses FACULTY for office-based requesters; keep Office records separate.
DO $$
DECLARE
  canonical_role_id TEXT;
  legacy_role_id TEXT;
  migrated_user_ids TEXT[];
BEGIN
  SELECT "id" INTO canonical_role_id FROM "Role" WHERE "code" = 'FACULTY';
  SELECT "id" INTO legacy_role_id
  FROM "Role"
  WHERE "name" = 'Office'
    AND "code" = 'LEGACY_a71bd495-c8fb-4935-808e-7d704d2b43e6';

  -- Fresh databases have no legacy Office row, so there is nothing to repair.
  IF legacy_role_id IS NULL THEN
    RETURN;
  END IF;
  IF canonical_role_id IS NULL THEN
    RAISE EXCEPTION 'Cannot migrate legacy Office role: canonical FACULTY role is missing.';
  END IF;

  SELECT ARRAY(SELECT "id" FROM "User" WHERE "roleId" = legacy_role_id)
  INTO migrated_user_ids;

  -- Change only authorization/session state; officeId, positionId, personId,
  -- active state, and all other User columns are retained.
  UPDATE "User"
  SET "roleId" = canonical_role_id,
      "authVersion" = "authVersion" + 1
  WHERE "roleId" = legacy_role_id;

  -- Role reassignment invalidates active refresh sessions just as the runtime
  -- role-change path does. Access tokens fail via the incremented authVersion.
  UPDATE "RefreshToken"
  SET "revokedAt" = NOW()
  WHERE "revokedAt" IS NULL
    AND "userId" = ANY(migrated_user_ids);

  IF EXISTS (SELECT 1 FROM "User" WHERE "roleId" = legacy_role_id) THEN
    RAISE EXCEPTION 'Cannot remove legacy Office role: User references remain.';
  END IF;

  DELETE FROM "Role" WHERE "id" = legacy_role_id;
END $$;
