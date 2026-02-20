/*
  Warnings:

  - You are about to drop the column `scheduleId` on the `Employee` table. All the data in the column will be lost.
  - You are about to drop the column `scheduleStartAt` on the `Employee` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "Employee" DROP CONSTRAINT "Employee_scheduleId_fkey";

-- DropIndex
DROP INDEX "Employee_tenantId_scheduleId_idx";

-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "scheduleId",
DROP COLUMN "scheduleStartAt";
