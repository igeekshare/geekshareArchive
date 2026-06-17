-- AlterTable
ALTER TABLE "messages" ADD COLUMN "telegramMessageId" TEXT;
ALTER TABLE "messages" ADD COLUMN "sourceUrl" TEXT;
ALTER TABLE "messages" ADD COLUMN "datetime" TEXT;
ALTER TABLE "messages" ADD COLUMN "tags" TEXT;

-- AlterTable
ALTER TABLE "sync_logs" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "sync_logs" ADD COLUMN "updatedCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "sync_logs" ADD COLUMN "skippedCount" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "messages_channelId_telegramMessageId_key" ON "messages"("channelId", "telegramMessageId");
