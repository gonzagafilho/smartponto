-- CreateEnum
CREATE TYPE "ScheduleType" AS ENUM ('FIXED_HOURS', 'ROTATION');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "scheduleId" TEXT,
ADD COLUMN     "scheduleStartAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ScheduleType" NOT NULL DEFAULT 'FIXED_HOURS',
    "workStart" TEXT,
    "workEnd" TEXT,
    "lunchStart" TEXT,
    "lunchEnd" TEXT,
    "onHours" INTEGER,
    "offHours" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Schedule_tenantId_idx" ON "Schedule"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_tenantId_name_key" ON "Schedule"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Employee_tenantId_scheduleId_idx" ON "Employee"("tenantId", "scheduleId");

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
