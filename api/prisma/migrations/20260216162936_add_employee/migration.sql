/*
  Warnings:

  - You are about to drop the column `active` on the `Employee` table. All the data in the column will be lost.
  - Added the required column `workEnd` to the `Employee` table without a default value. This is not possible if the table is not empty.
  - Added the required column `workStart` to the `Employee` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Employee" DROP COLUMN "active",
ADD COLUMN     "email" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lunchEnd" TEXT,
ADD COLUMN     "lunchStart" TEXT,
ADD COLUMN     "workEnd" TEXT NOT NULL,
ADD COLUMN     "workStart" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "Employee_tenantId_idx" ON "Employee"("tenantId");
