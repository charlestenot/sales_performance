-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "fullName" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Deal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "ownerId" TEXT,
    "pipeline" TEXT,
    "dealStage" TEXT,
    "closeDate" DATETIME,
    "createDate" DATETIME,
    "hsLastModified" DATETIME,
    "amount" REAL,
    "properties" TEXT NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SyncRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dealsFetched" INTEGER NOT NULL DEFAULT 0,
    "ownersFetched" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL
);

-- CreateIndex
CREATE INDEX "Deal_ownerId_idx" ON "Deal"("ownerId");

-- CreateIndex
CREATE INDEX "Deal_closeDate_idx" ON "Deal"("closeDate");

-- CreateIndex
CREATE INDEX "Deal_dealStage_idx" ON "Deal"("dealStage");

-- CreateIndex
CREATE INDEX "Deal_pipeline_idx" ON "Deal"("pipeline");

-- CreateIndex
CREATE INDEX "Deal_hsLastModified_idx" ON "Deal"("hsLastModified");

-- CreateIndex
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");
