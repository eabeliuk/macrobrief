-- AlterTable
ALTER TABLE "Brief" ADD COLUMN     "shareToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Brief_shareToken_key" ON "Brief"("shareToken");

