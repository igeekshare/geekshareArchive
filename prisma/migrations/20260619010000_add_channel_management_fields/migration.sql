-- AlterTable
ALTER TABLE "channels" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "channels" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "channels" ADD COLUMN "lastSyncedAt" DATETIME;
ALTER TABLE "channels" ADD COLUMN "lastSyncedMessageId" TEXT;

-- AlterTable
ALTER TABLE "sync_logs" ADD COLUMN "parsedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sync_logs" ADD COLUMN "failedCount" INTEGER NOT NULL DEFAULT 0;
