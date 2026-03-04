-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "refreshTokenHash" TEXT;

-- AlterTable
ALTER TABLE "Schedule" ADD COLUMN     "refreshTokenHash" TEXT;
