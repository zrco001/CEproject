/**
 * Domain enums (ARCHITECTURE.md §6.1). Phase 1 defines them framework-free; Phase 2 Prisma enums
 * must match these values exactly.
 */
import { defineEnum, type EnumValue } from './define-enum.js';

export { defineEnum, enumValues, type EnumObject, type EnumValue } from './define-enum.js';

export const MembershipStatus = defineEnum(['INVITED', 'ACTIVE', 'SUSPENDED']);
export type MembershipStatus = EnumValue<typeof MembershipStatus>;

export const SystemRoleCode = defineEnum([
  'OWNER',
  'ADMIN',
  'ACCOUNTANT',
  'PROJECT_MANAGER',
  'SITE_MANAGER',
  'PURCHASER',
  'VIEWER',
]);
export type SystemRoleCode = EnumValue<typeof SystemRoleCode>;

export const ProjectStatus = defineEnum([
  'DRAFT',
  'QUOTATION',
  'ACTIVE',
  'PAUSED',
  'INSPECTION',
  'COMPLETED',
  'CLOSED',
]);
export type ProjectStatus = EnumValue<typeof ProjectStatus>;

export const ProjectMemberRole = defineEnum(['MANAGER', 'SITE_MANAGER', 'MEMBER']);
export type ProjectMemberRole = EnumValue<typeof ProjectMemberRole>;

export const VendorType = defineEnum(['SUPPLIER', 'SUBCONTRACTOR', 'WORKER', 'OTHER']);
export type VendorType = EnumValue<typeof VendorType>;

export const ContractType = defineEnum(['OWNER_CONTRACT', 'SUBCONTRACT']);
export type ContractType = EnumValue<typeof ContractType>;

export const ContractStatus = defineEnum(['DRAFT', 'SIGNED', 'TERMINATED', 'COMPLETED']);
export type ContractStatus = EnumValue<typeof ContractStatus>;

export const ChangeOrderType = defineEnum(['ADDITION', 'DEDUCTION']);
export type ChangeOrderType = EnumValue<typeof ChangeOrderType>;

export const ChangeOrderStatus = defineEnum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'CANCELLED',
]);
export type ChangeOrderStatus = EnumValue<typeof ChangeOrderStatus>;

export const ExpenseScope = defineEnum(['PROJECT', 'OVERHEAD']);
export type ExpenseScope = EnumValue<typeof ExpenseScope>;

export const ExpenseStatus = defineEnum(['DRAFT', 'SUBMITTED', 'POSTED', 'VOID']);
export type ExpenseStatus = EnumValue<typeof ExpenseStatus>;

export const CostCategoryScope = defineEnum(['PROJECT', 'OVERHEAD', 'BOTH']);
export type CostCategoryScope = EnumValue<typeof CostCategoryScope>;

/** Payment progress of an Expense (derived from its Payable) or as declared on site. */
export const PaymentStatus = defineEnum(['UNPAID', 'PARTIALLY_PAID', 'PAID']);
export type PaymentStatus = EnumValue<typeof PaymentStatus>;

export const PayableSource = defineEnum(['EXPENSE', 'MANUAL']);
export type PayableSource = EnumValue<typeof PayableSource>;

export const PayeeType = defineEnum(['VENDOR', 'EMPLOYEE']);
export type PayeeType = EnumValue<typeof PayeeType>;

export const FeeBearer = defineEnum(['COMPANY', 'COUNTERPARTY']);
export type FeeBearer = EnumValue<typeof FeeBearer>;

export const ClearingStatus = defineEnum(['NOT_APPLICABLE', 'PENDING', 'CLEARED', 'BOUNCED']);
export type ClearingStatus = EnumValue<typeof ClearingStatus>;

export const PayableStatus = defineEnum(['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID']);
export type PayableStatus = EnumValue<typeof PayableStatus>;

/** OVERDUE is a display status only and is never persisted (TD-12, I-26). */
export const ReceivableStatus = defineEnum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID']);
export type ReceivableStatus = EnumValue<typeof ReceivableStatus>;
export type PersistedReceivableStatus = Exclude<ReceivableStatus, 'OVERDUE'>;

export const ReceivableSource = defineEnum(['PROGRESS_BILLING', 'RETENTION_RELEASE', 'OTHER']);
export type ReceivableSource = EnumValue<typeof ReceivableSource>;

/** Document status of Payment / Receipt. */
export const SettlementStatus = defineEnum(['POSTED', 'VOID']);
export type SettlementStatus = EnumValue<typeof SettlementStatus>;

/** Derived from PayablePayment / ReceiptAllocation.voidedAt (ACTIVE ⇔ voidedAt IS NULL). */
export const AllocationState = defineEnum(['ACTIVE', 'VOIDED']);
export type AllocationState = EnumValue<typeof AllocationState>;

export const PaymentMethod = defineEnum([
  'CASH',
  'BANK_TRANSFER',
  'CHECK',
  'CREDIT_CARD',
  'PETTY_CASH',
  'OTHER',
]);
export type PaymentMethod = EnumValue<typeof PaymentMethod>;

export const ExpenseDocType = defineEnum(['UNIFORM_INVOICE', 'RECEIPT', 'NONE']);
export type ExpenseDocType = EnumValue<typeof ExpenseDocType>;

export const ProgressBillingStatus = defineEnum([
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'INVOICED',
  'VOID',
]);
export type ProgressBillingStatus = EnumValue<typeof ProgressBillingStatus>;

export const RetentionReleaseStatus = defineEnum(['DRAFT', 'INVOICED', 'VOID']);
export type RetentionReleaseStatus = EnumValue<typeof RetentionReleaseStatus>;

export const RevenueSource = defineEnum(['PROGRESS_BILLING', 'OTHER_INCOME', 'MANUAL_ADJUSTMENT']);
export type RevenueSource = EnumValue<typeof RevenueSource>;

export const RevenueStatus = defineEnum(['POSTED', 'VOID']);
export type RevenueStatus = EnumValue<typeof RevenueStatus>;

export const BankAccountType = defineEnum(['BANK', 'CASH', 'PETTY_CASH']);
export type BankAccountType = EnumValue<typeof BankAccountType>;

export const TxnDirection = defineEnum(['INFLOW', 'OUTFLOW']);
export type TxnDirection = EnumValue<typeof TxnDirection>;

export const BankTxnSource = defineEnum([
  'PAYMENT',
  'PAYMENT_FEE',
  'RECEIPT',
  'PETTY_CASH',
  'TRANSFER',
  'MANUAL',
]);
export type BankTxnSource = EnumValue<typeof BankTxnSource>;

export const BankTxnStatus = defineEnum(['POSTED', 'VOID']);
export type BankTxnStatus = EnumValue<typeof BankTxnStatus>;

export const PettyCashTxnType = defineEnum(['REPLENISH', 'SPEND', 'RETURN', 'ADJUST']);
export type PettyCashTxnType = EnumValue<typeof PettyCashTxnType>;

export const AttachmentStatus = defineEnum(['PENDING', 'UPLOADED', 'REJECTED']);
export type AttachmentStatus = EnumValue<typeof AttachmentStatus>;

export const AuditAction = defineEnum([
  'CREATE',
  'UPDATE',
  'DELETE_DRAFT',
  'SUBMIT',
  'RETURN',
  'POST',
  'APPROVE',
  'REJECT',
  'INVOICE',
  'VOID',
  'CANCEL',
  'ALLOCATE',
  'VOID_ALLOCATION',
  'CLEAR',
  'BOUNCE',
  'STATUS_CHANGE',
  'REVEAL_SENSITIVE',
  'LOGIN',
  'PERMISSION_CHANGE',
]);
export type AuditAction = EnumValue<typeof AuditAction>;
