-- AlterTable
ALTER TABLE "SalesRep" ADD COLUMN "currentRoleId" INTEGER;

-- CreateIndex
CREATE INDEX "SalesRep_currentRoleId_idx" ON "SalesRep"("currentRoleId");
