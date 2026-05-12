-- AlterTable
ALTER TABLE "SalesRep" ADD COLUMN "managerId" INTEGER;

-- CreateIndex
CREATE INDEX "SalesRep_managerId_idx" ON "SalesRep"("managerId");
