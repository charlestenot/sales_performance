-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SalesRep" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "managerId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SalesRep" ("createdAt", "endDate", "id", "managerId", "name", "ownerId", "startDate", "updatedAt") SELECT "createdAt", "endDate", "id", "managerId", "name", "ownerId", "startDate", "updatedAt" FROM "SalesRep";
DROP TABLE "SalesRep";
ALTER TABLE "new_SalesRep" RENAME TO "SalesRep";
CREATE UNIQUE INDEX "SalesRep_ownerId_key" ON "SalesRep"("ownerId");
CREATE INDEX "SalesRep_ownerId_idx" ON "SalesRep"("ownerId");
CREATE INDEX "SalesRep_managerId_idx" ON "SalesRep"("managerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
