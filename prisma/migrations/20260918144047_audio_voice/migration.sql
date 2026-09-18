-- CreateEnum
CREATE TYPE "AudioVoice" AS ENUM ('MALE', 'FEMALE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "audioVoice" "AudioVoice" NOT NULL DEFAULT 'MALE';
