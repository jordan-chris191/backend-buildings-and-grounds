-- A role's code is its immutable authorization identity. Existing IDs and
-- User.roleId values are deliberately left untouched.
ALTER TABLE "Role" ADD COLUMN "code" TEXT;

UPDATE "Role"
SET "code" = CASE "name"
  WHEN 'Administrator' THEN 'ADMINISTRATOR'
  WHEN 'Building & Grounds Officer' THEN 'BUILDING_GROUNDS_OFFICER'
  WHEN 'Campus Staff' THEN 'CAMPUS_STAFF'
  WHEN 'Property Custodian' THEN 'PROPERTY_CUSTODIAN'
  WHEN 'Faculty' THEN 'FACULTY'
END
WHERE "name" IN (
  'Administrator',
  'Building & Grounds Officer',
  'Campus Staff',
  'Property Custodian',
  'Faculty'
);

-- Preserve every pre-existing custom role without guessing its authorization
-- meaning. IDs are stable, so these generated legacy codes are stable too.
UPDATE "Role"
SET "code" = 'LEGACY_' || "id"
WHERE "code" IS NULL;

ALTER TABLE "Role" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

CREATE FUNCTION prevent_role_code_update() RETURNS trigger AS $$
BEGIN
  IF NEW."code" IS DISTINCT FROM OLD."code" THEN
    RAISE EXCEPTION 'Role.code is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Role_code_immutable"
BEFORE UPDATE ON "Role"
FOR EACH ROW EXECUTE FUNCTION prevent_role_code_update();
