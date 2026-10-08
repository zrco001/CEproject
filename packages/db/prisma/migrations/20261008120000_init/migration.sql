-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'QUOTATION', 'ACTIVE', 'PAUSED', 'INSPECTION', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('MANAGER', 'SITE_MANAGER', 'MEMBER');

-- CreateEnum
CREATE TYPE "VendorType" AS ENUM ('SUPPLIER', 'SUBCONTRACTOR', 'WORKER', 'OTHER');

-- CreateEnum
CREATE TYPE "ContractType" AS ENUM ('OWNER_CONTRACT', 'SUBCONTRACT');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SIGNED', 'TERMINATED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChangeOrderType" AS ENUM ('ADDITION', 'DEDUCTION');

-- CreateEnum
CREATE TYPE "ChangeOrderStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ExpenseScope" AS ENUM ('PROJECT', 'OVERHEAD');

-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "CostCategoryScope" AS ENUM ('PROJECT', 'OVERHEAD', 'BOTH');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "PayableSource" AS ENUM ('EXPENSE', 'MANUAL');

-- CreateEnum
CREATE TYPE "PayeeType" AS ENUM ('VENDOR', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "FeeBearer" AS ENUM ('COMPANY', 'COUNTERPARTY');

-- CreateEnum
CREATE TYPE "ClearingStatus" AS ENUM ('NOT_APPLICABLE', 'PENDING', 'CLEARED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID');

-- CreateEnum
CREATE TYPE "ReceivableSource" AS ENUM ('PROGRESS_BILLING', 'RETENTION_RELEASE', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'CREDIT_CARD', 'PETTY_CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseDocType" AS ENUM ('UNIFORM_INVOICE', 'RECEIPT', 'NONE');

-- CreateEnum
CREATE TYPE "ProgressBillingStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'INVOICED', 'VOID');

-- CreateEnum
CREATE TYPE "RetentionReleaseStatus" AS ENUM ('DRAFT', 'INVOICED', 'VOID');

-- CreateEnum
CREATE TYPE "RevenueSource" AS ENUM ('PROGRESS_BILLING', 'OTHER_INCOME', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RevenueStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('BANK', 'CASH', 'PETTY_CASH');

-- CreateEnum
CREATE TYPE "TxnDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "BankTxnSource" AS ENUM ('PAYMENT', 'PAYMENT_FEE', 'RECEIPT', 'PETTY_CASH', 'TRANSFER', 'MANUAL');

-- CreateEnum
CREATE TYPE "BankTxnStatus" AS ENUM ('POSTED', 'VOID');

-- CreateEnum
CREATE TYPE "PettyCashTxnType" AS ENUM ('REPLENISH', 'SPEND', 'RETURN', 'ADJUST');

-- CreateEnum
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'UPLOADED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttachableType" AS ENUM ('EXPENSE', 'PAYMENT', 'RECEIPT', 'PROGRESS_BILLING', 'CHANGE_ORDER', 'CONTRACT', 'PROJECT', 'DAILY_LOG', 'VENDOR', 'CUSTOMER', 'REVENUE_ENTRY');

-- CreateEnum
CREATE TYPE "AttachmentPurpose" AS ENUM ('INVOICE', 'RECEIPT_PHOTO', 'CONTRACT_DOC', 'SITE_PHOTO', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE_DRAFT', 'SUBMIT', 'RETURN', 'POST', 'APPROVE', 'REJECT', 'INVOICE', 'VOID', 'CANCEL', 'ALLOCATE', 'VOID_ALLOCATION', 'CLEAR', 'BOUNCE', 'STATUS_CHANGE', 'REVEAL_SENSITIVE', 'LOGIN', 'PERMISSION_CHANGE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Taipei',
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "defaultTaxRate" DECIMAL(7,4) NOT NULL DEFAULT 0.0500,
    "allowDecimalAmounts" BOOLEAN NOT NULL DEFAULT false,
    "lockedUntilDate" DATE,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "timezone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "organizationId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,

    CONSTRAINT "role_permission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedById" UUID,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "diff" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "requestId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "organizationId" UUID NOT NULL,
    "docType" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "lastNumber" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "document_sequence_pkey" PRIMARY KEY ("organizationId","docType","year")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT,
    "checksum" TEXT NOT NULL,
    "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttachmentLink" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "attachmentId" UUID NOT NULL,
    "entityType" "AttachableType" NOT NULL,
    "entityId" UUID NOT NULL,
    "purpose" "AttachmentPurpose" NOT NULL,

    CONSTRAINT "attachment_link_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "vendorType" "VendorType" NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "paymentTerms" TEXT,
    "paymentTermDays" INTEGER,
    "bankCode" TEXT,
    "bankBranch" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNoCiphertext" TEXT,
    "bankAccountNoKeyVersion" INTEGER,
    "bankAccountNoLast4" TEXT,
    "bankAccountNoHmac" TEXT,
    "note" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID,
    "employeeNo" TEXT,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "bankCode" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNoCiphertext" TEXT,
    "bankAccountNoKeyVersion" INTEGER,
    "bankAccountNoLast4" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,

    CONSTRAINT "employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostCategory" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "parentId" UUID,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "applicableScope" "CostCategoryScope" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "cost_category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "type" "BankAccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "branch" TEXT,
    "accountNoCiphertext" TEXT,
    "accountNoKeyVersion" INTEGER,
    "accountNoLast4" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'TWD',
    "openingBalance" DECIMAL(18,2) NOT NULL,
    "openingDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" UUID NOT NULL,
    "address" TEXT,
    "projectManagerId" UUID,
    "startDate" DATE,
    "expectedEndDate" DATE,
    "actualEndDate" DATE,
    "originalContractAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currentContractAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retentionRate" DECIMAL(7,4) NOT NULL,
    "retentionExpectedReleaseDate" DATE,
    "physicalProgressPercent" DECIMAL(5,2),
    "physicalProgressUpdatedAt" TIMESTAMPTZ(3),
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectRole" "ProjectMemberRole" NOT NULL,

    CONSTRAINT "project_member_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractNo" TEXT NOT NULL,
    "type" "ContractType" NOT NULL,
    "title" TEXT NOT NULL,
    "signedDate" DATE,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "retentionRate" DECIMAL(7,4),
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "changeOrderNo" TEXT NOT NULL,
    "type" "ChangeOrderType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "billedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "requestDate" DATE NOT NULL,
    "approvalDate" DATE,
    "approvedById" UUID,
    "status" "ChangeOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "change_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectBudget" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "costCategoryId" UUID NOT NULL,
    "budgetAmount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "project_budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDailyLog" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "logDate" DATE NOT NULL,
    "weather" TEXT,
    "workerCount" INTEGER,
    "content" TEXT NOT NULL,
    "clientRequestId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "project_daily_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "scope" "ExpenseScope" NOT NULL,
    "projectId" UUID,
    "vendorId" UUID,
    "advancedByEmployeeId" UUID,
    "expenseNo" TEXT,
    "expenseDate" DATE NOT NULL,
    "costCategoryId" UUID NOT NULL,
    "subtotalAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "documentType" "ExpenseDocType" NOT NULL,
    "inputTaxDeductible" BOOLEAN NOT NULL DEFAULT false,
    "documentNumber" TEXT,
    "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMPTZ(3),
    "submittedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" UUID,
    "reviewNote" TEXT,
    "rejectionReason" TEXT,
    "postedAt" TIMESTAMPTZ(3),
    "postedById" UUID,
    "paymentStatus" "PaymentStatus",
    "declaredPaymentStatus" "PaymentStatus",
    "declaredPaidAmount" DECIMAL(18,2),
    "declaredPaymentMethod" "PaymentMethod",
    "dueDate" DATE,
    "note" TEXT,
    "clientRequestId" UUID,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseItem" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "expenseId" UUID NOT NULL,
    "costCategoryId" UUID NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,4),
    "unit" TEXT,
    "unitPrice" DECIMAL(18,2),
    "amount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "costAmount" DECIMAL(18,2),
    "costRuleVersion" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "expense_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "sourceType" "PayableSource" NOT NULL,
    "payeeType" "PayeeType" NOT NULL,
    "vendorId" UUID,
    "employeeId" UUID,
    "expenseId" UUID,
    "scope" "ExpenseScope" NOT NULL,
    "projectId" UUID,
    "payableNo" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(18,2) NOT NULL,
    "dueDate" DATE,
    "status" "PayableStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "payable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "payeeType" "PayeeType" NOT NULL,
    "vendorId" UUID,
    "employeeId" UUID,
    "projectId" UUID,
    "bankAccountId" UUID NOT NULL,
    "paymentNo" TEXT NOT NULL,
    "paymentDate" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paymentAmount" DECIMAL(18,2) NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unallocatedAmount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feeBearer" "FeeBearer" NOT NULL DEFAULT 'COMPANY',
    "bankOutflowAmount" DECIMAL(18,2) NOT NULL,
    "payeeReceivedAmount" DECIMAL(18,2) NOT NULL,
    "clearingStatus" "ClearingStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "clearedAt" TIMESTAMPTZ(3),
    "clearedById" UUID,
    "clearedDate" DATE,
    "bouncedAt" TIMESTAMPTZ(3),
    "bouncedById" UUID,
    "bounceReason" TEXT,
    "checkNo" TEXT,
    "checkDueDate" DATE,
    "withholdingAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "clientRequestId" UUID,
    "status" "SettlementStatus" NOT NULL DEFAULT 'POSTED',
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayablePayment" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "payableId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,

    CONSTRAINT "payable_payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PettyCashTransaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "custodianId" UUID NOT NULL,
    "type" "PettyCashTxnType" NOT NULL,
    "txnDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "expenseId" UUID,
    "description" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "petty_cash_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressBilling" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "contractId" UUID NOT NULL,
    "periodNo" INTEGER NOT NULL,
    "billingNo" TEXT NOT NULL,
    "grossAmount" DECIMAL(18,2) NOT NULL,
    "changeOrderAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL(18,2) NOT NULL,
    "deductionAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "deductionNote" TEXT,
    "billingAmount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "cumulativeGrossAmount" DECIMAL(18,2),
    "billingDate" DATE NOT NULL,
    "invoiceDate" DATE,
    "invoiceNumber" TEXT,
    "dueDate" DATE,
    "expectedPaymentDate" DATE,
    "approvedAmount" DECIMAL(18,2),
    "submittedAt" TIMESTAMPTZ(3),
    "approvedAt" TIMESTAMPTZ(3),
    "invoicedAt" TIMESTAMPTZ(3),
    "status" "ProgressBillingStatus" NOT NULL DEFAULT 'DRAFT',
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "progress_billing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgressBillingChangeOrder" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "progressBillingId" UUID NOT NULL,
    "changeOrderId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,

    CONSTRAINT "progress_billing_change_order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetentionRelease" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "requestDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "expectedReleaseDate" DATE,
    "invoiceDate" DATE,
    "invoiceNumber" TEXT,
    "status" "RetentionReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "note" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "retention_release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receivable" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "projectId" UUID,
    "sourceType" "ReceivableSource" NOT NULL,
    "progressBillingId" UUID,
    "retentionReleaseId" UUID,
    "receivableNo" TEXT NOT NULL,
    "originalAmount" DECIMAL(18,2) NOT NULL,
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "outstandingAmount" DECIMAL(18,2) NOT NULL,
    "dueDate" DATE,
    "status" "ReceivableStatus" NOT NULL DEFAULT 'UNPAID',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "receivable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "projectId" UUID,
    "bankAccountId" UUID NOT NULL,
    "receiptNo" TEXT NOT NULL,
    "receiptDate" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "receivedAmount" DECIMAL(18,2) NOT NULL,
    "allocatedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unallocatedAmount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "feeBearer" "FeeBearer" NOT NULL DEFAULT 'COMPANY',
    "bankInflowAmount" DECIMAL(18,2) NOT NULL,
    "clearingStatus" "ClearingStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
    "clearedAt" TIMESTAMPTZ(3),
    "clearedById" UUID,
    "clearedDate" DATE,
    "bouncedAt" TIMESTAMPTZ(3),
    "bouncedById" UUID,
    "bounceReason" TEXT,
    "checkNo" TEXT,
    "checkBank" TEXT,
    "checkDueDate" DATE,
    "note" TEXT,
    "clientRequestId" UUID,
    "status" "SettlementStatus" NOT NULL DEFAULT 'POSTED',
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptAllocation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "receiptId" UUID NOT NULL,
    "receivableId" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" UUID NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,

    CONSTRAINT "receipt_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RevenueEntry" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "projectId" UUID,
    "progressBillingId" UUID,
    "sourceKey" TEXT,
    "sourceType" "RevenueSource" NOT NULL,
    "recognitionDate" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "taxAmount" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "clientRequestId" UUID,
    "status" "RevenueStatus" NOT NULL DEFAULT 'POSTED',
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "revenue_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "bankAccountId" UUID NOT NULL,
    "txnDate" DATE NOT NULL,
    "direction" "TxnDirection" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "sourceType" "BankTxnSource" NOT NULL,
    "sourceId" UUID,
    "counterparty" TEXT,
    "description" TEXT,
    "externalRef" TEXT,
    "status" "BankTxnStatus" NOT NULL DEFAULT 'POSTED',
    "voidedAt" TIMESTAMPTZ(3),
    "voidedById" UUID,
    "voidReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "updatedById" UUID,

    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "membership_organization_id_user_id_key" ON "Membership"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE UNIQUE INDEX "attachment_storage_key_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "attachment_link_entity_idx" ON "AttachmentLink"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_org_id_key" ON "Customer"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "vendor_org_id_key" ON "Vendor"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_org_id_key" ON "Employee"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_category_organization_id_code_key" ON "CostCategory"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "cost_category_org_id_key" ON "CostCategory"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bank_account_org_id_key" ON "BankAccount"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_organization_id_project_code_key" ON "Project"("organizationId", "projectCode");

-- CreateIndex
CREATE UNIQUE INDEX "project_org_id_key" ON "Project"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "contract_org_id_key" ON "Contract"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "change_order_organization_id_project_id_change_order_no_key" ON "ChangeOrder"("organizationId", "projectId", "changeOrderNo");

-- CreateIndex
CREATE UNIQUE INDEX "change_order_org_id_key" ON "ChangeOrder"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "project_budget_project_id_cost_category_id_key" ON "ProjectBudget"("projectId", "costCategoryId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_org_id_key" ON "Expense"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_item_org_id_key" ON "ExpenseItem"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payable_expense_id_key" ON "Payable"("expenseId");

-- CreateIndex
CREATE UNIQUE INDEX "payable_org_id_key" ON "Payable"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_org_id_key" ON "Payment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "payable_payment_org_id_key" ON "PayablePayment"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_billing_project_id_period_no_key" ON "ProgressBilling"("projectId", "periodNo");

-- CreateIndex
CREATE UNIQUE INDEX "progress_billing_org_id_key" ON "ProgressBilling"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "progress_billing_change_order_pair_key" ON "ProgressBillingChangeOrder"("progressBillingId", "changeOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "progress_billing_change_order_org_id_key" ON "ProgressBillingChangeOrder"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "retention_release_org_id_key" ON "RetentionRelease"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_progress_billing_id_key" ON "Receivable"("progressBillingId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_retention_release_id_key" ON "Receivable"("retentionReleaseId");

-- CreateIndex
CREATE UNIQUE INDEX "receivable_org_id_key" ON "Receivable"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_org_id_key" ON "Receipt"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_allocation_org_id_key" ON "ReceiptAllocation"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_entry_org_id_key" ON "RevenueEntry"("organizationId", "id");

-- CreateIndex
CREATE INDEX "bank_transaction_account_date_idx" ON "BankTransaction"("bankAccountId", "txnDate");

-- CreateIndex
CREATE INDEX "bank_transaction_source_idx" ON "BankTransaction"("organizationId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_org_id_key" ON "BankTransaction"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "membership_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "membership_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "membership_role_id_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "membership_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "membership_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "role_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "role_permission_role_id_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "role_permission_permission_id_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "refresh_token_replaced_by_id_fkey" FOREIGN KEY ("replacedById") REFERENCES "RefreshToken"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "audit_log_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "DocumentSequence" ADD CONSTRAINT "document_sequence_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "attachment_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "attachment_uploaded_by_id_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "attachment_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "attachment_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "attachment_link_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AttachmentLink" ADD CONSTRAINT "attachment_link_attachment_id_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "customer_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "customer_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "customer_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "vendor_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "vendor_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "vendor_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "employee_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "employee_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "employee_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CostCategory" ADD CONSTRAINT "cost_category_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CostCategory" ADD CONSTRAINT "cost_category_parent_id_fkey" FOREIGN KEY ("parentId") REFERENCES "CostCategory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CostCategory" ADD CONSTRAINT "cost_category_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "CostCategory" ADD CONSTRAINT "cost_category_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "bank_account_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "bank_account_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "bank_account_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "project_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "project_customer_id_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "project_project_manager_id_fkey" FOREIGN KEY ("projectManagerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "project_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "project_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "project_member_project_id_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "project_member_user_id_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "project_member_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "contract_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "contract_project_id_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "contract_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "contract_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_contract_id_org_fkey" FOREIGN KEY ("organizationId", "contractId") REFERENCES "Contract"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_approved_by_id_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "project_budget_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "project_budget_project_id_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "project_budget_cost_category_id_fkey" FOREIGN KEY ("costCategoryId") REFERENCES "CostCategory"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "project_budget_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectBudget" ADD CONSTRAINT "project_budget_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectDailyLog" ADD CONSTRAINT "project_daily_log_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectDailyLog" ADD CONSTRAINT "project_daily_log_project_id_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectDailyLog" ADD CONSTRAINT "project_daily_log_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProjectDailyLog" ADD CONSTRAINT "project_daily_log_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_vendor_id_org_fkey" FOREIGN KEY ("organizationId", "vendorId") REFERENCES "Vendor"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_advanced_by_employee_id_org_fkey" FOREIGN KEY ("organizationId", "advancedByEmployeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_cost_category_id_org_fkey" FOREIGN KEY ("organizationId", "costCategoryId") REFERENCES "CostCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_submitted_by_id_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_reviewed_by_id_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_posted_by_id_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "expense_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "expense_item_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "expense_item_expense_id_org_fkey" FOREIGN KEY ("organizationId", "expenseId") REFERENCES "Expense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ExpenseItem" ADD CONSTRAINT "expense_item_cost_category_id_org_fkey" FOREIGN KEY ("organizationId", "costCategoryId") REFERENCES "CostCategory"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_vendor_id_org_fkey" FOREIGN KEY ("organizationId", "vendorId") REFERENCES "Vendor"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_employee_id_org_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_expense_id_org_fkey" FOREIGN KEY ("organizationId", "expenseId") REFERENCES "Expense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payable" ADD CONSTRAINT "payable_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_vendor_id_org_fkey" FOREIGN KEY ("organizationId", "vendorId") REFERENCES "Vendor"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_employee_id_org_fkey" FOREIGN KEY ("organizationId", "employeeId") REFERENCES "Employee"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_bank_account_id_org_fkey" FOREIGN KEY ("organizationId", "bankAccountId") REFERENCES "BankAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_cleared_by_id_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_bounced_by_id_fkey" FOREIGN KEY ("bouncedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "payment_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_payment_id_org_fkey" FOREIGN KEY ("organizationId", "paymentId") REFERENCES "Payment"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_payable_id_org_fkey" FOREIGN KEY ("organizationId", "payableId") REFERENCES "Payable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_bank_account_id_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_custodian_id_fkey" FOREIGN KEY ("custodianId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_expense_id_org_fkey" FOREIGN KEY ("organizationId", "expenseId") REFERENCES "Expense"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "PettyCashTransaction" ADD CONSTRAINT "petty_cash_transaction_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_contract_id_org_fkey" FOREIGN KEY ("organizationId", "contractId") REFERENCES "Contract"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBillingChangeOrder" ADD CONSTRAINT "progress_billing_change_order_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBillingChangeOrder" ADD CONSTRAINT "progress_billing_change_order_progress_billing_id_org_fkey" FOREIGN KEY ("organizationId", "progressBillingId") REFERENCES "ProgressBilling"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBillingChangeOrder" ADD CONSTRAINT "progress_billing_change_order_change_order_id_org_fkey" FOREIGN KEY ("organizationId", "changeOrderId") REFERENCES "ChangeOrder"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ProgressBillingChangeOrder" ADD CONSTRAINT "progress_billing_change_order_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "retention_release_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "retention_release_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "retention_release_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "retention_release_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RetentionRelease" ADD CONSTRAINT "retention_release_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_customer_id_org_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_progress_billing_id_org_fkey" FOREIGN KEY ("organizationId", "progressBillingId") REFERENCES "ProgressBilling"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_retention_release_id_org_fkey" FOREIGN KEY ("organizationId", "retentionReleaseId") REFERENCES "RetentionRelease"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_customer_id_org_fkey" FOREIGN KEY ("organizationId", "customerId") REFERENCES "Customer"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_bank_account_id_org_fkey" FOREIGN KEY ("organizationId", "bankAccountId") REFERENCES "BankAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_cleared_by_id_fkey" FOREIGN KEY ("clearedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_bounced_by_id_fkey" FOREIGN KEY ("bouncedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_receipt_id_org_fkey" FOREIGN KEY ("organizationId", "receiptId") REFERENCES "Receipt"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_receivable_id_org_fkey" FOREIGN KEY ("organizationId", "receivableId") REFERENCES "Receivable"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_project_id_org_fkey" FOREIGN KEY ("organizationId", "projectId") REFERENCES "Project"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_progress_billing_id_org_fkey" FOREIGN KEY ("organizationId", "progressBillingId") REFERENCES "ProgressBilling"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "bank_transaction_organization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "bank_transaction_bank_account_id_org_fkey" FOREIGN KEY ("organizationId", "bankAccountId") REFERENCES "BankAccount"("organizationId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "bank_transaction_voided_by_id_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "bank_transaction_created_by_id_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "bank_transaction_updated_by_id_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- ============================================================================================
-- Manual constraints (ARCHITECTURE.md §6.4 I-01..I-26 and §6.2; ADR-034 accepted strategy).
-- Prisma cannot express CHECK constraints, partial unique indexes or privileges, so they are
-- appended to this Prisma-generated migration (§6.5 step 1). The (organizationId, id) targets
-- and composite foreign keys of I-21 are declared natively in schema.prisma above.
-- Every object below is listed in prisma/constraints.registry.ts and prisma/constraints.md.
-- ============================================================================================

-- I-01: one active PayablePayment per (payment, payable)
CREATE UNIQUE INDEX "payable_payment_pair_active_key"
  ON "PayablePayment" ("paymentId", "payableId") WHERE "voidedAt" IS NULL;

-- I-02: one active ReceiptAllocation per (receipt, receivable)
CREATE UNIQUE INDEX "receipt_allocation_pair_active_key"
  ON "ReceiptAllocation" ("receiptId", "receivableId") WHERE "voidedAt" IS NULL;

-- I-03: system role codes are unique
CREATE UNIQUE INDEX "role_system_code_uq"
  ON "Role" ("code") WHERE "organizationId" IS NULL;

-- I-04: organization role codes are unique per organization
CREATE UNIQUE INDEX "role_org_code_uq"
  ON "Role" ("organizationId", "code") WHERE "organizationId" IS NOT NULL;

-- I-05: PROJECT scope has a project, OVERHEAD scope has none
ALTER TABLE "Expense" ADD CONSTRAINT "expense_scope_project_check" CHECK (
  ("scope" = 'PROJECT' AND "projectId" IS NOT NULL)
  OR ("scope" = 'OVERHEAD' AND "projectId" IS NULL)
);

ALTER TABLE "Payable" ADD CONSTRAINT "payable_scope_project_check" CHECK (
  ("scope" = 'PROJECT' AND "projectId" IS NOT NULL)
  OR ("scope" = 'OVERHEAD' AND "projectId" IS NULL)
);

-- I-06: a POSTED (or later VOID) Expense has a vendor
ALTER TABLE "Expense" ADD CONSTRAINT "expense_posted_vendor_check" CHECK (
  "status" NOT IN ('POSTED', 'VOID') OR "vendorId" IS NOT NULL
);

-- I-07: payee type matches exactly one payee column
ALTER TABLE "Payable" ADD CONSTRAINT "payable_payee_check" CHECK (
  ("payeeType" = 'VENDOR' AND "vendorId" IS NOT NULL AND "employeeId" IS NULL)
  OR ("payeeType" = 'EMPLOYEE' AND "employeeId" IS NOT NULL AND "vendorId" IS NULL)
);

ALTER TABLE "Payment" ADD CONSTRAINT "payment_payee_check" CHECK (
  ("payeeType" = 'VENDOR' AND "vendorId" IS NOT NULL AND "employeeId" IS NULL)
  OR ("payeeType" = 'EMPLOYEE' AND "employeeId" IS NOT NULL AND "vendorId" IS NULL)
);

-- I-08: Expense status fields are consistent
ALTER TABLE "Expense" ADD CONSTRAINT "expense_submitted_fields_check" CHECK (
  "status" <> 'SUBMITTED' OR ("submittedAt" IS NOT NULL AND "submittedById" IS NOT NULL)
);

ALTER TABLE "Expense" ADD CONSTRAINT "expense_posted_fields_check" CHECK (
  "status" NOT IN ('POSTED', 'VOID') OR ("postedAt" IS NOT NULL AND "expenseNo" IS NOT NULL)
);

ALTER TABLE "Expense" ADD CONSTRAINT "expense_void_fields_check" CHECK (
  "status" <> 'VOID' OR "voidedAt" IS NOT NULL
);

-- I-09: Expense amounts
ALTER TABLE "Expense" ADD CONSTRAINT "expense_amounts_check" CHECK (
  "totalAmount" = "subtotalAmount" + "taxAmount"
  AND "subtotalAmount" >= 0
  AND "taxAmount" >= 0
  AND "totalAmount" >= 0
);

-- I-10: Payable / Receivable amounts
ALTER TABLE "Payable" ADD CONSTRAINT "payable_amounts_check" CHECK (
  "paidAmount" + "outstandingAmount" = "originalAmount"
  AND "paidAmount" >= 0
  AND "outstandingAmount" >= 0
);

ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_amounts_check" CHECK (
  "paidAmount" + "outstandingAmount" = "originalAmount"
  AND "paidAmount" >= 0
  AND "outstandingAmount" >= 0
);

-- I-11: Payment amounts, by feeBearer
ALTER TABLE "Payment" ADD CONSTRAINT "payment_amounts_check" CHECK (
  "paymentAmount" > 0
  AND "allocatedAmount" >= 0
  AND "unallocatedAmount" >= 0
  AND "allocatedAmount" + "unallocatedAmount" = "paymentAmount"
  AND "feeAmount" >= 0
);

ALTER TABLE "Payment" ADD CONSTRAINT "payment_fee_bearer_amounts_check" CHECK (
  ("feeBearer" = 'COMPANY'
    AND "bankOutflowAmount" = "paymentAmount" + "feeAmount"
    AND "payeeReceivedAmount" = "paymentAmount")
  OR ("feeBearer" = 'COUNTERPARTY'
    AND "feeAmount" < "paymentAmount"
    AND "bankOutflowAmount" = "paymentAmount"
    AND "payeeReceivedAmount" = "paymentAmount" - "feeAmount")
);

-- I-12: Receipt amounts, by feeBearer
ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_amounts_check" CHECK (
  "receivedAmount" > 0
  AND "allocatedAmount" >= 0
  AND "unallocatedAmount" >= 0
  AND "allocatedAmount" + "unallocatedAmount" = "receivedAmount"
  AND "feeAmount" >= 0
);

ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_fee_bearer_amounts_check" CHECK (
  ("feeBearer" = 'COMPANY'
    AND "feeAmount" < "receivedAmount"
    AND "bankInflowAmount" = "receivedAmount" - "feeAmount")
  OR ("feeBearer" = 'COUNTERPARTY'
    AND "feeAmount" = 0
    AND "bankInflowAmount" = "receivedAmount")
);

-- I-13: ChangeOrder billing headroom
ALTER TABLE "ChangeOrder" ADD CONSTRAINT "change_order_billed_amount_check" CHECK (
  "amount" > 0 AND "billedAmount" >= 0 AND "billedAmount" <= "amount"
);

-- I-14: ProgressBilling formulas
ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_billing_amount_check" CHECK (
  "billingAmount" = "grossAmount" + "changeOrderAmount" - "retentionAmount" - "deductionAmount"
);

ALTER TABLE "ProgressBilling" ADD CONSTRAINT "progress_billing_total_amount_check" CHECK (
  "totalAmount" = "billingAmount" + "taxAmount"
);

-- I-15: ProgressBillingChangeOrder amount (the pair unique key is declared in schema.prisma)
ALTER TABLE "ProgressBillingChangeOrder" ADD CONSTRAINT "progress_billing_change_order_amount_check" CHECK (
  "amount" > 0
);

-- I-16: one active OWNER_CONTRACT per project (MVP)
CREATE UNIQUE INDEX "contract_owner_contract_active_key"
  ON "Contract" ("projectId") WHERE "type" = 'OWNER_CONTRACT' AND "status" <> 'TERMINATED';

-- I-17: encrypted bank account fields are all set or all NULL
ALTER TABLE "Vendor" ADD CONSTRAINT "vendor_bank_account_no_fields_check" CHECK (
  ("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoKeyVersion" IS NULL)
  AND ("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoLast4" IS NULL)
);

ALTER TABLE "Employee" ADD CONSTRAINT "employee_bank_account_no_fields_check" CHECK (
  ("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoKeyVersion" IS NULL)
  AND ("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoLast4" IS NULL)
);

ALTER TABLE "BankAccount" ADD CONSTRAINT "bank_account_account_no_fields_check" CHECK (
  ("accountNoCiphertext" IS NULL) = ("accountNoKeyVersion" IS NULL)
  AND ("accountNoCiphertext" IS NULL) = ("accountNoLast4" IS NULL)
);

-- I-18: RevenueEntry source and idempotency (progressBillingId is deliberately not unique)
ALTER TABLE "RevenueEntry" ADD CONSTRAINT "revenue_entry_source_check" CHECK (
  ("sourceType" = 'PROGRESS_BILLING') = ("progressBillingId" IS NOT NULL)
);

CREATE UNIQUE INDEX "revenue_entry_source_key_active_key"
  ON "RevenueEntry" ("organizationId", "sourceKey")
  WHERE "sourceKey" IS NOT NULL AND "voidedAt" IS NULL;

-- I-19: idempotency keys (§5.1; RevenueEntry per §3.7)
CREATE UNIQUE INDEX "expense_client_request_id_partial_key"
  ON "Expense" ("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;

CREATE UNIQUE INDEX "payment_client_request_id_partial_key"
  ON "Payment" ("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;

CREATE UNIQUE INDEX "receipt_client_request_id_partial_key"
  ON "Receipt" ("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;

CREATE UNIQUE INDEX "project_daily_log_client_request_id_partial_key"
  ON "ProjectDailyLog" ("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;

CREATE UNIQUE INDEX "revenue_entry_client_request_id_partial_key"
  ON "RevenueEntry" ("organizationId", "clientRequestId") WHERE "clientRequestId" IS NOT NULL;

-- I-20: AuditLog is append-only for the application role. The role is provisioned outside
-- migrations; deploying without it fails here instead of silently skipping the REVOKE.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE EXCEPTION 'I-20: database role "app_user" must exist before this migration runs';
  END IF;
END
$$;

REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM app_user;

-- I-22: allocation void fields are all set or all NULL; allocation amounts are positive (§6.2)
ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_void_fields_check" CHECK (
  ("voidedAt" IS NULL) = ("voidedById" IS NULL)
  AND ("voidedAt" IS NULL) = ("voidReason" IS NULL)
);

ALTER TABLE "PayablePayment" ADD CONSTRAINT "payable_payment_amount_check" CHECK (
  "amount" > 0
);

ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_void_fields_check" CHECK (
  ("voidedAt" IS NULL) = ("voidedById" IS NULL)
  AND ("voidedAt" IS NULL) = ("voidReason" IS NULL)
);

ALTER TABLE "ReceiptAllocation" ADD CONSTRAINT "receipt_allocation_amount_check" CHECK (
  "amount" > 0
);

-- I-23: cheque clearing fields
ALTER TABLE "Payment" ADD CONSTRAINT "payment_clearing_method_check" CHECK (
  ("method" = 'CHECK') = ("clearingStatus" <> 'NOT_APPLICABLE')
);

ALTER TABLE "Payment" ADD CONSTRAINT "payment_cleared_fields_check" CHECK (
  ("clearingStatus" = 'CLEARED')
    = ("clearedAt" IS NOT NULL AND "clearedById" IS NOT NULL AND "clearedDate" IS NOT NULL)
);

ALTER TABLE "Payment" ADD CONSTRAINT "payment_bounced_fields_check" CHECK (
  ("clearingStatus" = 'BOUNCED') = ("bouncedAt" IS NOT NULL AND "bouncedById" IS NOT NULL)
);

ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_clearing_method_check" CHECK (
  ("method" = 'CHECK') = ("clearingStatus" <> 'NOT_APPLICABLE')
);

ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_cleared_fields_check" CHECK (
  ("clearingStatus" = 'CLEARED')
    = ("clearedAt" IS NOT NULL AND "clearedById" IS NOT NULL AND "clearedDate" IS NOT NULL)
);

ALTER TABLE "Receipt" ADD CONSTRAINT "receipt_bounced_fields_check" CHECK (
  ("clearingStatus" = 'BOUNCED') = ("bouncedAt" IS NOT NULL AND "bouncedById" IS NOT NULL)
);

-- I-24: Employee number and login user are unique per organization when present
CREATE UNIQUE INDEX "employee_employee_no_partial_key"
  ON "Employee" ("organizationId", "employeeNo") WHERE "employeeNo" IS NOT NULL;

CREATE UNIQUE INDEX "employee_user_id_partial_key"
  ON "Employee" ("organizationId", "userId") WHERE "userId" IS NOT NULL;

-- I-25: AuditLog schemaVersion (NOT NULL DEFAULT 1 is declared in schema.prisma)
ALTER TABLE "AuditLog" ADD CONSTRAINT "audit_log_schema_version_check" CHECK (
  "schemaVersion" >= 1
);

-- I-26: OVERDUE is never persisted
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_status_not_overdue_check" CHECK (
  "status" <> 'OVERDUE'
);

-- §6.2 Project: physical progress is a percentage
ALTER TABLE "Project" ADD CONSTRAINT "project_physical_progress_percent_check" CHECK (
  "physicalProgressPercent" BETWEEN 0 AND 100
);

-- §6.2 Receivable: sourceType matches the source foreign keys
ALTER TABLE "Receivable" ADD CONSTRAINT "receivable_source_check" CHECK (
  ("sourceType" = 'PROGRESS_BILLING') = ("progressBillingId" IS NOT NULL)
  AND ("sourceType" = 'RETENTION_RELEASE') = ("retentionReleaseId" IS NOT NULL)
);

-- §6.2 BankTransaction: amount is positive; direction carries the sign
ALTER TABLE "BankTransaction" ADD CONSTRAINT "bank_transaction_amount_check" CHECK (
  "amount" > 0
);
