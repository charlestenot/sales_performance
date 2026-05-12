-- AlterTable
ALTER TABLE "RepMonthly" ADD COLUMN "teamId" INTEGER;
ALTER TABLE "RepMonthly" ADD COLUMN "teamName" TEXT;

-- CreateIndex
CREATE INDEX "RepMonthly_teamId_idx" ON "RepMonthly"("teamId");
