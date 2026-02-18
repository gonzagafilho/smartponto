/*
  Warnings:

  - The values [FIXED_HOURS,ROTATION] on the enum `ScheduleType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `offHours` on the `Schedule` table. All the data in the column will be lost.
  - You are about to drop the column `onHours` on the `Schedule` table. All the data in the column will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "ScheduleType_new" AS ENUM ('FIXED_DAILY', 'SHIFT_CYCLE', 'WEEKLY_SHIFT');
ALTER TABLE "public"."Schedule" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "Schedule" ALTER COLUMN "type" TYPE "ScheduleType_new" USING ("type"::text::"ScheduleType_new");
ALTER TYPE "ScheduleType" RENAME TO "ScheduleType_old";
ALTER TYPE "ScheduleType_new" RENAME TO "ScheduleType";
DROP TYPE "public"."ScheduleType_old";
ALTER TABLE "Schedule" ALTER COLUMN "type" SET DEFAULT 'FIXED_DAILY';
COMMIT;

-- AlterTable
ALTER TABLE "Schedule" DROP COLUMN "offHours",
DROP COLUMN "onHours",
ADD COLUMN     "anchorWeekday" INTEGER,
ADD COLUMN     "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "flexTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxSpanHours" INTEGER,
ADD COLUMN     "offDays" INTEGER,
ADD COLUMN     "onDays" INTEGER,
ALTER COLUMN "type" SET DEFAULT 'FIXED_DAILY';

-- CreateTable
CREATE TABLE "EmployeeSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeSchedule_tenantId_employeeId_idx" ON "EmployeeSchedule"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeSchedule_tenantId_scheduleId_idx" ON "EmployeeSchedule"("tenantId", "scheduleId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeSchedule_tenantId_employeeId_scheduleId_startAt_key" ON "EmployeeSchedule"("tenantId", "employeeId", "scheduleId", "startAt");

-- CreateIndex
CREATE INDEX "Location_tenantId_idx" ON "Location"("tenantId");

-- CreateIndex
CREATE INDEX "Schedule_tenantId_type_idx" ON "Schedule"("tenantId", "type");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- AddForeignKey
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSchedule" ADD CONSTRAINT "EmployeeSchedule_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
