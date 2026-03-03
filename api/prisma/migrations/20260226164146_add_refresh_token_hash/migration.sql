-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "refreshTokenExp" TIMESTAMP(3),
ADD COLUMN     "refreshTokenHash" TEXT;
