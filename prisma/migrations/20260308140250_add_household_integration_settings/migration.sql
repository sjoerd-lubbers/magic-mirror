-- CreateTable
CREATE TABLE "HouseholdIntegrationSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "householdId" TEXT NOT NULL,
    "iCloudCalDavUrl" TEXT,
    "iCloudUsernameEnc" TEXT,
    "iCloudPasswordEnc" TEXT,
    "calendarCacheSeconds" INTEGER,
    "todoistApiTokenEnc" TEXT,
    "todoistProjectId" TEXT,
    "todoistCacheSeconds" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "HouseholdIntegrationSettings_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "HouseholdIntegrationSettings_householdId_key" ON "HouseholdIntegrationSettings"("householdId");
