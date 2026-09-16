-- Bind refresh sessions to the authorization generation active at issuance.
-- Existing sessions receive generation 0; users whose generation has already
-- changed must authenticate again, which is the safe failure mode.
ALTER TABLE "RefreshToken" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
