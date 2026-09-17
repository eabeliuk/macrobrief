-- AlterTable
ALTER TABLE "DeliveryChannel" ADD COLUMN     "verifyCode" TEXT,
ADD COLUMN     "verifyExpires" TIMESTAMP(3);
