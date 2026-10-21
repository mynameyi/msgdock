-- Existing one-way hashes cannot recover original keys; keep their values null.
ALTER TABLE "ApiKey" ADD COLUMN "secret" TEXT;
