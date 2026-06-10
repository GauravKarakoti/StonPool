-- AlterTable
ALTER TABLE "Group" ADD COLUMN     "adminNotified" BOOLEAN,
ADD COLUMN     "inviteLink" TEXT,
ADD COLUMN     "telegramUsername" TEXT;

-- AlterTable
ALTER TABLE "GroupMember" ADD COLUMN     "tonWallet" TEXT;

-- AlterTable
ALTER TABLE "Proposal" ADD COLUMN     "destination" TEXT,
ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "telegramMessageId" INTEGER,
ADD COLUMN     "txHash" TEXT;
