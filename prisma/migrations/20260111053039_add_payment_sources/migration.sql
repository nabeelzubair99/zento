-- CreateEnum
CREATE TYPE "PaymentSourceType" AS ENUM ('BANK', 'CARD', 'CASH');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "paymentSourceId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultTransactionsPaymentSourceId" TEXT;

-- CreateTable
CREATE TABLE "PaymentSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentSourceType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentSource_userId_idx" ON "PaymentSource"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentSource_userId_name_key" ON "PaymentSource"("userId", "name");

-- CreateIndex
CREATE INDEX "Category_userId_sortOrder_idx" ON "Category"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "Transaction_userId_paymentSourceId_idx" ON "Transaction"("userId", "paymentSourceId");

-- CreateIndex
CREATE INDEX "User_defaultTransactionsPaymentSourceId_idx" ON "User"("defaultTransactionsPaymentSourceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_defaultTransactionsPaymentSourceId_fkey" FOREIGN KEY ("defaultTransactionsPaymentSourceId") REFERENCES "PaymentSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentSource" ADD CONSTRAINT "PaymentSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_paymentSourceId_fkey" FOREIGN KEY ("paymentSourceId") REFERENCES "PaymentSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;
