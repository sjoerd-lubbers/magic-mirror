-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Mirror" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "highContrastMonochrome" BOOLEAN NOT NULL DEFAULT false,
    "locationName" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "timezone" TEXT DEFAULT 'Europe/Amsterdam',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Mirror_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Mirror" ("createdAt", "householdId", "id", "latitude", "locationName", "longitude", "name", "status", "timezone", "updatedAt") SELECT "createdAt", "householdId", "id", "latitude", "locationName", "longitude", "name", "status", "timezone", "updatedAt" FROM "Mirror";
DROP TABLE "Mirror";
ALTER TABLE "new_Mirror" RENAME TO "Mirror";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
