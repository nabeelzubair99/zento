-- CreateEnum
CREATE TYPE "TransactionFlag" AS ENUM ('WORTH_IT', 'UNEXPECTED', 'REVIEW_LATER');

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "flags" "TransactionFlag"[] DEFAULT ARRAY[]::"TransactionFlag"[];
