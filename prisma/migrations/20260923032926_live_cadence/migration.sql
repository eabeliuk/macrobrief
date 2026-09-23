-- AlterEnum
ALTER TYPE "Cadence" ADD VALUE 'LIVE';

-- AlterTable
ALTER TABLE "Schedule" ALTER COLUMN "cadence" SET DEFAULT 'DAILY';

