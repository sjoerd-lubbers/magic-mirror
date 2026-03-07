CREATE TABLE "MirrorClaimSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "claimedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mirrorId" TEXT,
    CONSTRAINT "MirrorClaimSession_mirrorId_fkey" FOREIGN KEY ("mirrorId") REFERENCES "Mirror" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MirrorClaimSession_token_key" ON "MirrorClaimSession"("token");
CREATE INDEX "MirrorClaimSession_expiresAt_idx" ON "MirrorClaimSession"("expiresAt");
CREATE INDEX "MirrorClaimSession_mirrorId_idx" ON "MirrorClaimSession"("mirrorId");
