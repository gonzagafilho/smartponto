-- CreateEnum
CREATE TYPE "TargetMode" AS ENUM ('DAILY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LunchDeductMode" AS ENUM ('BY_PUNCH', 'FIXED');

-- CreateTable
CREATE TABLE "TenantSettings" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "targetMode" "TargetMode" NOT NULL DEFAULT 'MONTHLY',
    "targetDailyMinutes" INTEGER NOT NULL DEFAULT 480,
    "targetMonthlyMinutes" INTEGER NOT NULL DEFAULT 13200,
    "bankEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lunchDeductMode" "LunchDeductMode" NOT NULL DEFAULT 'BY_PUNCH',
    "fixedLunchMinutes" INTEGER NOT NULL DEFAULT 60,
    "roundingMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlySummary" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "yearMonth" TEXT NOT NULL,
    "targetMinutes" INTEGER NOT NULL,
    "workedMinutes" INTEGER NOT NULL,
    "extraMinutes" INTEGER NOT NULL,
    "debitMinutes" INTEGER NOT NULL,
    "daysWorked" INTEGER NOT NULL,
    "inconsistenciesCount" INTEGER NOT NULL,
    "detailsJson" JSONB,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSettings_tenantId_key" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "TenantSettings_tenantId_idx" ON "TenantSettings"("tenantId");

-- CreateIndex
CREATE INDEX "MonthlySummary_tenantId_yearMonth_idx" ON "MonthlySummary"("tenantId", "yearMonth");

-- CreateIndex
CREATE INDEX "MonthlySummary_tenantId_employeeId_yearMonth_idx" ON "MonthlySummary"("tenantId", "employeeId", "yearMonth");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySummary_tenantId_employeeId_yearMonth_key" ON "MonthlySummary"("tenantId", "employeeId", "yearMonth");

-- AddForeignKey
ALTER TABLE "TenantSettings" ADD CONSTRAINT "TenantSettings_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySummary" ADD CONSTRAINT "MonthlySummary_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonthlySummary" ADD CONSTRAINT "MonthlySummary_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

