-- Existing channel identifiers stay stable; credentials remain encrypted and unchanged.
ALTER TABLE "Channel" ADD COLUMN "pluginVersion" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "Channel" ADD COLUMN "configVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Delivery" ADD COLUMN "pluginId" TEXT;
ALTER TABLE "Delivery" ADD COLUMN "pluginVersion" TEXT NOT NULL DEFAULT '1.0.0';
ALTER TABLE "Delivery" ADD COLUMN "configVersion" INTEGER NOT NULL DEFAULT 1;
UPDATE "Delivery" AS d SET "pluginId" = c."type" FROM "Channel" AS c WHERE c.id = d."channelId";
UPDATE "Delivery" SET "pluginId" = 'legacy.unresolved' WHERE "pluginId" IS NULL;
ALTER TABLE "Delivery" ALTER COLUMN "pluginId" SET NOT NULL;
