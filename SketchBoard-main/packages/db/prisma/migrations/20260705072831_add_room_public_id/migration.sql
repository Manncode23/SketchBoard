-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Add the column as nullable first (existing rows need a value before we can lock it down)
ALTER TABLE "Room" ADD COLUMN "publicId" TEXT;

-- Backfill existing rows with generated UUIDs
UPDATE "Room" SET "publicId" = gen_random_uuid()::text WHERE "publicId" IS NULL;

-- Now make it required and unique, matching the schema
ALTER TABLE "Room" ALTER COLUMN "publicId" SET NOT NULL;
CREATE UNIQUE INDEX "Room_publicId_key" ON "Room"("publicId");