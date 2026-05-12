/*
  Warnings:

  - You are about to drop the column `role` on the `RepMonthly` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Role" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "baseQuota" REAL NOT NULL DEFAULT 0,
    "rampPct" TEXT NOT NULL DEFAULT '[]',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_RepMonthly" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "salesRepId" INTEGER NOT NULL,
    "month" DATETIME NOT NULL,
    "roleId" INTEGER,
    "roleName" TEXT,
    "baseQuota" REAL,
    "manager" TEXT,
    "quota" REAL,
    "frupPct" REAL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_RepMonthly" ("createdAt", "frupPct", "id", "manager", "month", "note", "quota", "salesRepId", "updatedAt") SELECT "createdAt", "frupPct", "id", "manager", "month", "note", "quota", "salesRepId", "updatedAt" FROM "RepMonthly";
DROP TABLE "RepMonthly";
ALTER TABLE "new_RepMonthly" RENAME TO "RepMonthly";
CREATE INDEX "RepMonthly_salesRepId_idx" ON "RepMonthly"("salesRepId");
CREATE INDEX "RepMonthly_month_idx" ON "RepMonthly"("month");
CREATE INDEX "RepMonthly_roleId_idx" ON "RepMonthly"("roleId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");
