/*
  Warnings:

  - Added the required column `action` to the `Proposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `amount` to the `Proposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tokenIn` to the `Proposal` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Proposal` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "action" TEXT NOT NULL,
ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "platform" TEXT,
ADD COLUMN     "tokenIn" TEXT NOT NULL,
ADD COLUMN     "tokenOut" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
