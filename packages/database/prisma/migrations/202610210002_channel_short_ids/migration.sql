BEGIN;

ALTER TABLE "Channel" ADD COLUMN "shortId" TEXT;
CREATE UNIQUE INDEX "Channel_shortId_key" ON "Channel"("shortId");

-- Allocate stored identifiers for existing channels without changing UUIDs or references.
DO $$
DECLARE
  channel_id UUID;
BEGIN
  FOR channel_id IN SELECT "id" FROM "Channel" LOOP
    LOOP
      BEGIN
        UPDATE "Channel"
        SET "shortId" = 'ch_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
        WHERE "id" = channel_id;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- A collision rolls back this row only; allocate another identifier.
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE "Channel"
  ALTER COLUMN "shortId" SET NOT NULL,
  ALTER COLUMN "shortId" SET DEFAULT ('ch_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)),
  ADD CONSTRAINT "Channel_shortId_format" CHECK ("shortId" ~ '^ch_[0-9a-f]{12}$');

COMMIT;
