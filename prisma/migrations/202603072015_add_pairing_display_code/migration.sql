ALTER TABLE "MirrorPairingCode" ADD COLUMN "displayCode" TEXT;
CREATE UNIQUE INDEX "MirrorPairingCode_displayCode_key" ON "MirrorPairingCode"("displayCode");
