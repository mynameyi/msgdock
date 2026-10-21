BEGIN;
-- Replace application credentials with standalone instance API keys. Keep key hashes and history.
ALTER TABLE "ApiKey" ADD COLUMN "name" TEXT, ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
UPDATE "ApiKey" k SET "name" = a."name", "enabled" = a."enabled" FROM "Application" a WHERE a."id" = k."applicationId";
ALTER TABLE "ApiKey" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "Notification" ADD COLUMN "apiKeyId" UUID, ADD COLUMN "idempotencyScope" TEXT;
UPDATE "Notification" n SET "apiKeyId" = (SELECT k."id" FROM "ApiKey" k WHERE k."applicationId" = n."applicationId" ORDER BY (k."revokedAt" IS NULL AND k."enabled") DESC, k."createdAt", k."id" LIMIT 1);
UPDATE "Notification" SET "idempotencyScope" = COALESCE("apiKeyId"::text, 'legacy:' || "applicationId"::text);
ALTER TABLE "Notification" ALTER COLUMN "idempotencyScope" SET NOT NULL;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "Notification_applicationId_idempotencyKey_key";
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_applicationId_fkey", DROP COLUMN "applicationId";
CREATE UNIQUE INDEX "Notification_idempotencyScope_idempotencyKey_key" ON "Notification"("idempotencyScope", "idempotencyKey");
ALTER TABLE "ApiKey" DROP CONSTRAINT "ApiKey_applicationId_fkey", DROP COLUMN "applicationId";
DROP TABLE "Application";
CREATE TABLE "ApiSettings" ("id" TEXT NOT NULL DEFAULT 'default', "authEnabled" BOOLEAN NOT NULL DEFAULT true, "perMinuteLimit" INTEGER NOT NULL DEFAULT 60, CONSTRAINT "ApiSettings_pkey" PRIMARY KEY ("id"));
INSERT INTO "ApiSettings" ("id") VALUES ('default');
COMMIT;
