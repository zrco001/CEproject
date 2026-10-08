-- DropForeignKey
ALTER TABLE "PocAllocation" DROP CONSTRAINT "poc_allocation_payment_id_org_fkey";

-- DropForeignKey
ALTER TABLE "PocPayment" DROP CONSTRAINT "poc_payment_vendor_id_org_fkey";

-- DropIndex
DROP INDEX "poc_payment_org_id_key";

-- DropIndex
DROP INDEX "poc_vendor_org_id_key";

-- AlterTable
ALTER TABLE "PocPayment" ADD COLUMN     "note" TEXT;
