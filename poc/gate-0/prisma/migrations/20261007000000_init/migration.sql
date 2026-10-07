-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PocFeeBearer" AS ENUM ('COMPANY', 'COUNTERPARTY');

-- CreateTable
CREATE TABLE "PocOrg" (
    "id" TEXT NOT NULL,

    CONSTRAINT "PocOrg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocVendor" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "PocVendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocPayment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "vendorId" TEXT,
    "feeBearer" "PocFeeBearer" NOT NULL,
    "paymentAmount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL,
    "bankOutflowAmount" DECIMAL(18,2) NOT NULL,
    "payeeReceivedAmount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "PocPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PocAllocation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "PocAllocation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PocVendor" ADD CONSTRAINT "PocVendor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PocOrg"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PocPayment" ADD CONSTRAINT "PocPayment_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PocOrg"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PocPayment" ADD CONSTRAINT "PocPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "PocVendor"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PocAllocation" ADD CONSTRAINT "PocAllocation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "PocOrg"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PocAllocation" ADD CONSTRAINT "PocAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "PocPayment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ============================================================================================
-- Gate 0 manual constraints (ADR-34; ARCHITECTURE.md §6.4 I-01 / I-11 / I-22, §6.5).
-- Not representable in schema.prisma; appended to the same migration per §6.5 step 1.
-- Every name here is listed in scripts/registry.mjs.
-- ============================================================================================

-- Composite key targets (§6.5 rule 1)
ALTER TABLE "PocVendor" ADD CONSTRAINT "poc_vendor_org_id_key" UNIQUE ("organizationId", "id");
ALTER TABLE "PocPayment" ADD CONSTRAINT "poc_payment_org_id_key" UNIQUE ("organizationId", "id");

-- Composite FKs: required and nullable (§6.5 rules 2, 4, 5, 6)
ALTER TABLE "PocAllocation" ADD CONSTRAINT "poc_allocation_payment_id_org_fkey"
  FOREIGN KEY ("organizationId", "paymentId") REFERENCES "PocPayment" ("organizationId", "id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "PocPayment" ADD CONSTRAINT "poc_payment_vendor_id_org_fkey"
  FOREIGN KEY ("organizationId", "vendorId") REFERENCES "PocVendor" ("organizationId", "id")
  MATCH SIMPLE ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Enum-branch amount CHECK (mirrors I-11)
ALTER TABLE "PocPayment" ADD CONSTRAINT "poc_payment_fee_bearer_amounts_check" CHECK (
  ("feeBearer" = 'COMPANY'
    AND "bankOutflowAmount" = "paymentAmount" + "feeAmount"
    AND "payeeReceivedAmount" = "paymentAmount")
  OR ("feeBearer" = 'COUNTERPARTY'
    AND "feeAmount" < "paymentAmount"
    AND "bankOutflowAmount" = "paymentAmount"
    AND "payeeReceivedAmount" = "paymentAmount" - "feeAmount")
);

ALTER TABLE "PocAllocation" ADD CONSTRAINT "poc_allocation_amount_positive_check" CHECK ("amount" > 0);

-- Void fields all set or all NULL (mirrors I-22)
ALTER TABLE "PocAllocation" ADD CONSTRAINT "poc_allocation_void_fields_check" CHECK (
  (("voidedAt" IS NULL) = ("voidedById" IS NULL))
  AND (("voidedAt" IS NULL) = ("voidReason" IS NULL))
);

-- One active allocation per (payment, target) (mirrors I-01)
CREATE UNIQUE INDEX "poc_allocation_pair_active_key"
  ON "PocAllocation" ("paymentId", "targetKey") WHERE "voidedAt" IS NULL;
