/*
  Warnings:

  - You are about to drop the `WorkSite` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "TimeEntry" DROP CONSTRAINT "TimeEntry_siteId_fkey";

-- DropForeignKey
ALTER TABLE "WorkSite" DROP CONSTRAINT "WorkSite_tenantId_fkey";

-- DropTable
DROP TABLE "WorkSite";

-- CreateTable
CREATE TABLE "Worksite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "radiusMeters" INTEGER NOT NULL DEFAULT 200,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Worksite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Worksite_tenantId_idx" ON "Worksite"("tenantId");

-- AddForeignKey
ALTER TABLE "Worksite" ADD CONSTRAINT "Worksite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Worksite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
