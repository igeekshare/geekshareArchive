-- AlterTable
ALTER TABLE "messages" ADD COLUMN "status" TEXT;

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");
