-- CreateTable
CREATE TABLE "Dimension" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "attribute" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DimensionBucket" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "dimensionId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "values" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Dimension_name_key" ON "Dimension"("name");

-- CreateIndex
CREATE INDEX "DimensionBucket_dimensionId_idx" ON "DimensionBucket"("dimensionId");
