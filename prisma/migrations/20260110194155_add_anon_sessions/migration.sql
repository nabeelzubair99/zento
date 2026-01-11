-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AnonSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "AnonSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnonSession_tokenHash_key" ON "AnonSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AnonSession_userId_idx" ON "AnonSession"("userId");

-- CreateIndex
CREATE INDEX "AnonSession_expiresAt_idx" ON "AnonSession"("expiresAt");

-- AddForeignKey
ALTER TABLE "AnonSession" ADD CONSTRAINT "AnonSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
