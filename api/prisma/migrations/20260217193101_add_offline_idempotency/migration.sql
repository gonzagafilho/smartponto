/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,employeeId,deviceId,deviceTs,type]` on the table `TimeEntry` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_tenantId_employeeId_deviceId_deviceTs_type_key" ON "TimeEntry"("tenantId", "employeeId", "deviceId", "deviceTs", "type");
