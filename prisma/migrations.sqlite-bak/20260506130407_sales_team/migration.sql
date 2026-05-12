-- CreateTable
CREATE TABLE "SalesRep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RepMonthly" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "salesRepId" INTEGER NOT NULL,
    "month" DATETIME NOT NULL,
    "role" TEXT,
    "manager" TEXT,
    "quota" REAL,
    "frupPct" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesRep_ownerId_key" ON "SalesRep"("ownerId");

-- CreateIndex
CREATE INDEX "SalesRep_ownerId_idx" ON "SalesRep"("ownerId");

-- CreateIndex
CREATE INDEX "RepMonthly_salesRepId_idx" ON "RepMonthly"("salesRepId");

-- CreateIndex
CREATE INDEX "RepMonthly_month_idx" ON "RepMonthly"("month");
