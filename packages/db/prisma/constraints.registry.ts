// Constraint registry (ARCHITECTURE.md §6.5 step 2, ADR-034).
//
// Lists every database object that protects an integrity rule of §6.4 (I-01..I-26) or §6.2:
// - objects appended as manual SQL to the init migration (CHECK, partial unique, REVOKE);
// - the natively declared (organizationId, id) targets and composite foreign keys of I-21,
//   because Gate 0 showed that Prisma drafts drop such objects when the schema stops
//   declaring them, and Prisma diff does not detect a missing CHECK (ADR-034, run 37741573406).
//
// `src/registry/compare.ts` checks a live catalog against this list after `migrate deploy`;
// test/migration.test.ts checks it against the committed migration SQL offline.

export type IntegrityRuleId =
  | 'I-01'
  | 'I-02'
  | 'I-03'
  | 'I-04'
  | 'I-05'
  | 'I-06'
  | 'I-07'
  | 'I-08'
  | 'I-09'
  | 'I-10'
  | 'I-11'
  | 'I-12'
  | 'I-13'
  | 'I-14'
  | 'I-15'
  | 'I-16'
  | 'I-17'
  | 'I-18'
  | 'I-19'
  | 'I-20'
  | 'I-21'
  | 'I-22'
  | 'I-23'
  | 'I-24'
  | 'I-25'
  | 'I-26';

/** Source of a registry entry: an §6.4 rule, or a §6.2 model constraint outside I-01..I-26. */
export type ConstraintSource = IntegrityRuleId | '§6.2';

interface EntryBase {
  readonly name: string;
  readonly table: string;
  readonly source: ConstraintSource;
}

/** UNIQUE (organizationId, id) target of a composite FK; Prisma creates a unique index. */
export interface UniqueTargetEntry extends EntryBase {
  readonly kind: 'unique_target';
  readonly columns: readonly ['organizationId', 'id'];
}

/** Composite (organizationId, xId) foreign key; MATCH SIMPLE when xId is nullable. */
export interface CompositeForeignKeyEntry extends EntryBase {
  readonly kind: 'composite_fk';
  readonly columns: readonly ['organizationId', string];
  readonly references: {
    readonly table: string;
    readonly columns: readonly ['organizationId', 'id'];
  };
  readonly nullable: boolean;
}

/** Plain unique index declared natively in schema.prisma that an §6.4 rule depends on. */
export interface UniqueIndexEntry extends EntryBase {
  readonly kind: 'unique_index';
  readonly columns: readonly string[];
}

export interface CheckEntry extends EntryBase {
  readonly kind: 'check';
  /** Must equal (after normalizeCheck) the CHECK body in the init migration. */
  readonly condition: string;
}

export interface PartialUniqueIndexEntry extends EntryBase {
  readonly kind: 'partial_unique_index';
  readonly columns: readonly string[];
  /** Must equal (after normalization) the WHERE clause in the init migration. */
  readonly predicate: string;
}

/** Privileges that must NOT be held by `role` on `table` (I-20). Not a catalog object name. */
export interface RevokedPrivilegeEntry extends EntryBase {
  readonly kind: 'revoked_privileges';
  readonly role: string;
  readonly privileges: readonly ('UPDATE' | 'DELETE' | 'TRUNCATE')[];
}

export type RegistryEntry =
  | UniqueTargetEntry
  | CompositeForeignKeyEntry
  | UniqueIndexEntry
  | CheckEntry
  | PartialUniqueIndexEntry
  | RevokedPrivilegeEntry;

/** Financial core tables of §6.5 (ADR-24). */
export const CORE_TABLES = [
  'Expense',
  'ExpenseItem',
  'Payable',
  'Payment',
  'PayablePayment',
  'ProgressBilling',
  'ProgressBillingChangeOrder',
  'Receivable',
  'Receipt',
  'ReceiptAllocation',
  'ChangeOrder',
  'RevenueEntry',
  'RetentionRelease',
  'BankTransaction',
] as const;

/** Org-scoped master data referenced by core tables (§6.5 rule 2). */
export const MASTER_TABLES = [
  'Project',
  'Contract',
  'Customer',
  'Vendor',
  'Employee',
  'CostCategory',
  'BankAccount',
] as const;

/** `PayablePayment` → `payable_payment` (constraint names are snake_case, §6.5). */
export function snakeCase(identifier: string): string {
  return identifier.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

function uniqueTarget(table: string): UniqueTargetEntry {
  return {
    name: `${snakeCase(table)}_org_id_key`,
    table,
    kind: 'unique_target',
    source: 'I-21',
    columns: ['organizationId', 'id'],
  };
}

function compositeFk(
  table: string,
  column: string,
  referencedTable: string,
  nullable: boolean,
): CompositeForeignKeyEntry {
  return {
    name: `${snakeCase(table)}_${snakeCase(column)}_org_fkey`,
    table,
    kind: 'composite_fk',
    source: 'I-21',
    columns: ['organizationId', column],
    references: { table: referencedTable, columns: ['organizationId', 'id'] },
    nullable,
  };
}

function check(
  source: ConstraintSource,
  table: string,
  name: string,
  condition: string,
): CheckEntry {
  return { name, table, kind: 'check', source, condition };
}

function partialUnique(
  source: ConstraintSource,
  table: string,
  name: string,
  columns: readonly string[],
  predicate: string,
): PartialUniqueIndexEntry {
  return { name, table, kind: 'partial_unique_index', source, columns, predicate };
}

const PAYEE_CONDITION = `("payeeType" = 'VENDOR' AND "vendorId" IS NOT NULL AND "employeeId" IS NULL)
  OR ("payeeType" = 'EMPLOYEE' AND "employeeId" IS NOT NULL AND "vendorId" IS NULL)`;
const SCOPE_CONDITION = `("scope" = 'PROJECT' AND "projectId" IS NOT NULL)
  OR ("scope" = 'OVERHEAD' AND "projectId" IS NULL)`;
const SETTLED_AMOUNTS_CONDITION = `"paidAmount" + "outstandingAmount" = "originalAmount"
  AND "paidAmount" >= 0
  AND "outstandingAmount" >= 0`;
const VOID_FIELDS_CONDITION = `("voidedAt" IS NULL) = ("voidedById" IS NULL)
  AND ("voidedAt" IS NULL) = ("voidReason" IS NULL)`;
const CLEARING_METHOD_CONDITION = `("method" = 'CHECK') = ("clearingStatus" <> 'NOT_APPLICABLE')`;
const CLEARED_FIELDS_CONDITION = `("clearingStatus" = 'CLEARED')
    = ("clearedAt" IS NOT NULL AND "clearedById" IS NOT NULL AND "clearedDate" IS NOT NULL)`;
const BOUNCED_FIELDS_CONDITION = `("clearingStatus" = 'BOUNCED') = ("bouncedAt" IS NOT NULL AND "bouncedById" IS NOT NULL)`;
const CLIENT_REQUEST_ID_PREDICATE = `"clientRequestId" IS NOT NULL`;

export const REGISTRY: readonly RegistryEntry[] = Object.freeze([
  // I-01 / I-02: one active allocation per pair (ADR-25)
  partialUnique(
    'I-01',
    'PayablePayment',
    'payable_payment_pair_active_key',
    ['paymentId', 'payableId'],
    `"voidedAt" IS NULL`,
  ),
  partialUnique(
    'I-02',
    'ReceiptAllocation',
    'receipt_allocation_pair_active_key',
    ['receiptId', 'receivableId'],
    `"voidedAt" IS NULL`,
  ),

  // I-03 / I-04: role codes
  partialUnique('I-03', 'Role', 'role_system_code_uq', ['code'], `"organizationId" IS NULL`),
  partialUnique(
    'I-04',
    'Role',
    'role_org_code_uq',
    ['organizationId', 'code'],
    `"organizationId" IS NOT NULL`,
  ),

  // I-05: ExpenseScope
  check('I-05', 'Expense', 'expense_scope_project_check', SCOPE_CONDITION),
  check('I-05', 'Payable', 'payable_scope_project_check', SCOPE_CONDITION),

  // I-06
  check(
    'I-06',
    'Expense',
    'expense_posted_vendor_check',
    `"status" NOT IN ('POSTED', 'VOID') OR "vendorId" IS NOT NULL`,
  ),

  // I-07: payee
  check('I-07', 'Payable', 'payable_payee_check', PAYEE_CONDITION),
  check('I-07', 'Payment', 'payment_payee_check', PAYEE_CONDITION),

  // I-08: Expense status fields
  check(
    'I-08',
    'Expense',
    'expense_submitted_fields_check',
    `"status" <> 'SUBMITTED' OR ("submittedAt" IS NOT NULL AND "submittedById" IS NOT NULL)`,
  ),
  check(
    'I-08',
    'Expense',
    'expense_posted_fields_check',
    `"status" NOT IN ('POSTED', 'VOID') OR ("postedAt" IS NOT NULL AND "expenseNo" IS NOT NULL)`,
  ),
  check(
    'I-08',
    'Expense',
    'expense_void_fields_check',
    `"status" <> 'VOID' OR "voidedAt" IS NOT NULL`,
  ),

  // I-09
  check(
    'I-09',
    'Expense',
    'expense_amounts_check',
    `"totalAmount" = "subtotalAmount" + "taxAmount"
  AND "subtotalAmount" >= 0
  AND "taxAmount" >= 0
  AND "totalAmount" >= 0`,
  ),

  // I-10
  check('I-10', 'Payable', 'payable_amounts_check', SETTLED_AMOUNTS_CONDITION),
  check('I-10', 'Receivable', 'receivable_amounts_check', SETTLED_AMOUNTS_CONDITION),

  // I-11: Payment amounts by feeBearer (ADR-27)
  check(
    'I-11',
    'Payment',
    'payment_amounts_check',
    `"paymentAmount" > 0
  AND "allocatedAmount" >= 0
  AND "unallocatedAmount" >= 0
  AND "allocatedAmount" + "unallocatedAmount" = "paymentAmount"
  AND "feeAmount" >= 0`,
  ),
  check(
    'I-11',
    'Payment',
    'payment_fee_bearer_amounts_check',
    `("feeBearer" = 'COMPANY'
    AND "bankOutflowAmount" = "paymentAmount" + "feeAmount"
    AND "payeeReceivedAmount" = "paymentAmount")
  OR ("feeBearer" = 'COUNTERPARTY'
    AND "feeAmount" < "paymentAmount"
    AND "bankOutflowAmount" = "paymentAmount"
    AND "payeeReceivedAmount" = "paymentAmount" - "feeAmount")`,
  ),

  // I-12: Receipt amounts by feeBearer
  check(
    'I-12',
    'Receipt',
    'receipt_amounts_check',
    `"receivedAmount" > 0
  AND "allocatedAmount" >= 0
  AND "unallocatedAmount" >= 0
  AND "allocatedAmount" + "unallocatedAmount" = "receivedAmount"
  AND "feeAmount" >= 0`,
  ),
  check(
    'I-12',
    'Receipt',
    'receipt_fee_bearer_amounts_check',
    `("feeBearer" = 'COMPANY'
    AND "feeAmount" < "receivedAmount"
    AND "bankInflowAmount" = "receivedAmount" - "feeAmount")
  OR ("feeBearer" = 'COUNTERPARTY'
    AND "feeAmount" = 0
    AND "bankInflowAmount" = "receivedAmount")`,
  ),

  // I-13
  check(
    'I-13',
    'ChangeOrder',
    'change_order_billed_amount_check',
    `"amount" > 0 AND "billedAmount" >= 0 AND "billedAmount" <= "amount"`,
  ),

  // I-14
  check(
    'I-14',
    'ProgressBilling',
    'progress_billing_billing_amount_check',
    `"billingAmount" = "grossAmount" + "changeOrderAmount" - "retentionAmount" - "deductionAmount"`,
  ),
  check(
    'I-14',
    'ProgressBilling',
    'progress_billing_total_amount_check',
    `"totalAmount" = "billingAmount" + "taxAmount"`,
  ),

  // I-15
  {
    name: 'progress_billing_change_order_pair_key',
    table: 'ProgressBillingChangeOrder',
    kind: 'unique_index',
    source: 'I-15',
    columns: ['progressBillingId', 'changeOrderId'],
  },
  check(
    'I-15',
    'ProgressBillingChangeOrder',
    'progress_billing_change_order_amount_check',
    `"amount" > 0`,
  ),

  // I-16
  partialUnique(
    'I-16',
    'Contract',
    'contract_owner_contract_active_key',
    ['projectId'],
    `"type" = 'OWNER_CONTRACT' AND "status" <> 'TERMINATED'`,
  ),

  // I-17: encrypted field completeness (ADR-20)
  check(
    'I-17',
    'Vendor',
    'vendor_bank_account_no_fields_check',
    `("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoKeyVersion" IS NULL)
  AND ("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoLast4" IS NULL)`,
  ),
  check(
    'I-17',
    'Employee',
    'employee_bank_account_no_fields_check',
    `("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoKeyVersion" IS NULL)
  AND ("bankAccountNoCiphertext" IS NULL) = ("bankAccountNoLast4" IS NULL)`,
  ),
  check(
    'I-17',
    'BankAccount',
    'bank_account_account_no_fields_check',
    `("accountNoCiphertext" IS NULL) = ("accountNoKeyVersion" IS NULL)
  AND ("accountNoCiphertext" IS NULL) = ("accountNoLast4" IS NULL)`,
  ),

  // I-18: RevenueEntry source and idempotency (ADR-29)
  check(
    'I-18',
    'RevenueEntry',
    'revenue_entry_source_check',
    `("sourceType" = 'PROGRESS_BILLING') = ("progressBillingId" IS NOT NULL)`,
  ),
  partialUnique(
    'I-18',
    'RevenueEntry',
    'revenue_entry_source_key_active_key',
    ['organizationId', 'sourceKey'],
    `"sourceKey" IS NOT NULL AND "voidedAt" IS NULL`,
  ),

  // I-19: idempotency keys (ADR-12)
  partialUnique(
    'I-19',
    'Expense',
    'expense_client_request_id_partial_key',
    ['organizationId', 'clientRequestId'],
    CLIENT_REQUEST_ID_PREDICATE,
  ),
  partialUnique(
    'I-19',
    'Payment',
    'payment_client_request_id_partial_key',
    ['organizationId', 'clientRequestId'],
    CLIENT_REQUEST_ID_PREDICATE,
  ),
  partialUnique(
    'I-19',
    'Receipt',
    'receipt_client_request_id_partial_key',
    ['organizationId', 'clientRequestId'],
    CLIENT_REQUEST_ID_PREDICATE,
  ),
  partialUnique(
    'I-19',
    'ProjectDailyLog',
    'project_daily_log_client_request_id_partial_key',
    ['organizationId', 'clientRequestId'],
    CLIENT_REQUEST_ID_PREDICATE,
  ),
  partialUnique(
    'I-19',
    'RevenueEntry',
    'revenue_entry_client_request_id_partial_key',
    ['organizationId', 'clientRequestId'],
    CLIENT_REQUEST_ID_PREDICATE,
  ),

  // I-20: AuditLog append-only for the application role
  {
    name: 'audit_log_app_user_revoked_privileges',
    table: 'AuditLog',
    kind: 'revoked_privileges',
    source: 'I-20',
    role: 'app_user',
    privileges: ['UPDATE', 'DELETE', 'TRUNCATE'],
  },

  // I-21: composite key targets (§6.5 rule 1 and rule 2)
  ...CORE_TABLES.map(uniqueTarget),
  ...MASTER_TABLES.map(uniqueTarget),

  // I-21: composite foreign keys between core tables and from core tables to master data
  compositeFk('Expense', 'projectId', 'Project', true),
  compositeFk('Expense', 'vendorId', 'Vendor', true),
  compositeFk('Expense', 'advancedByEmployeeId', 'Employee', true),
  compositeFk('Expense', 'costCategoryId', 'CostCategory', false),
  compositeFk('ExpenseItem', 'expenseId', 'Expense', false),
  compositeFk('ExpenseItem', 'costCategoryId', 'CostCategory', false),
  compositeFk('Payable', 'vendorId', 'Vendor', true),
  compositeFk('Payable', 'employeeId', 'Employee', true),
  compositeFk('Payable', 'expenseId', 'Expense', true),
  compositeFk('Payable', 'projectId', 'Project', true),
  compositeFk('Payment', 'vendorId', 'Vendor', true),
  compositeFk('Payment', 'employeeId', 'Employee', true),
  compositeFk('Payment', 'projectId', 'Project', true),
  compositeFk('Payment', 'bankAccountId', 'BankAccount', false),
  compositeFk('PayablePayment', 'paymentId', 'Payment', false),
  compositeFk('PayablePayment', 'payableId', 'Payable', false),
  compositeFk('ProgressBilling', 'projectId', 'Project', false),
  compositeFk('ProgressBilling', 'contractId', 'Contract', false),
  compositeFk('ProgressBillingChangeOrder', 'progressBillingId', 'ProgressBilling', false),
  compositeFk('ProgressBillingChangeOrder', 'changeOrderId', 'ChangeOrder', false),
  compositeFk('Receivable', 'customerId', 'Customer', false),
  compositeFk('Receivable', 'projectId', 'Project', true),
  compositeFk('Receivable', 'progressBillingId', 'ProgressBilling', true),
  compositeFk('Receivable', 'retentionReleaseId', 'RetentionRelease', true),
  compositeFk('Receipt', 'customerId', 'Customer', false),
  compositeFk('Receipt', 'projectId', 'Project', true),
  compositeFk('Receipt', 'bankAccountId', 'BankAccount', false),
  compositeFk('ReceiptAllocation', 'receiptId', 'Receipt', false),
  compositeFk('ReceiptAllocation', 'receivableId', 'Receivable', false),
  compositeFk('ChangeOrder', 'projectId', 'Project', false),
  compositeFk('ChangeOrder', 'contractId', 'Contract', false),
  compositeFk('RevenueEntry', 'projectId', 'Project', true),
  compositeFk('RevenueEntry', 'progressBillingId', 'ProgressBilling', true),
  compositeFk('RetentionRelease', 'projectId', 'Project', false),
  compositeFk('BankTransaction', 'bankAccountId', 'BankAccount', false),
  // Not required by §6.5 rule 2 (PettyCashTransaction is not a core table), but it points at
  // a core table whose composite target already exists, so it gets the same protection.
  compositeFk('PettyCashTransaction', 'expenseId', 'Expense', true),

  // I-22: allocation void fields
  check('I-22', 'PayablePayment', 'payable_payment_void_fields_check', VOID_FIELDS_CONDITION),
  check('I-22', 'ReceiptAllocation', 'receipt_allocation_void_fields_check', VOID_FIELDS_CONDITION),

  // I-23: cheque clearing (ADR-28)
  check('I-23', 'Payment', 'payment_clearing_method_check', CLEARING_METHOD_CONDITION),
  check('I-23', 'Payment', 'payment_cleared_fields_check', CLEARED_FIELDS_CONDITION),
  check('I-23', 'Payment', 'payment_bounced_fields_check', BOUNCED_FIELDS_CONDITION),
  check('I-23', 'Receipt', 'receipt_clearing_method_check', CLEARING_METHOD_CONDITION),
  check('I-23', 'Receipt', 'receipt_cleared_fields_check', CLEARED_FIELDS_CONDITION),
  check('I-23', 'Receipt', 'receipt_bounced_fields_check', BOUNCED_FIELDS_CONDITION),

  // I-24: Employee uniqueness
  partialUnique(
    'I-24',
    'Employee',
    'employee_employee_no_partial_key',
    ['organizationId', 'employeeNo'],
    `"employeeNo" IS NOT NULL`,
  ),
  partialUnique(
    'I-24',
    'Employee',
    'employee_user_id_partial_key',
    ['organizationId', 'userId'],
    `"userId" IS NOT NULL`,
  ),

  // I-25 / I-26
  check('I-25', 'AuditLog', 'audit_log_schema_version_check', `"schemaVersion" >= 1`),
  check('I-26', 'Receivable', 'receivable_status_not_overdue_check', `"status" <> 'OVERDUE'`),

  // §6.2 model constraints outside I-01..I-26
  check(
    '§6.2',
    'Project',
    'project_physical_progress_percent_check',
    `"physicalProgressPercent" BETWEEN 0 AND 100`,
  ),
  check(
    '§6.2',
    'Receivable',
    'receivable_source_check',
    `("sourceType" = 'PROGRESS_BILLING') = ("progressBillingId" IS NOT NULL)
  AND ("sourceType" = 'RETENTION_RELEASE') = ("retentionReleaseId" IS NOT NULL)`,
  ),
  check('§6.2', 'BankTransaction', 'bank_transaction_amount_check', `"amount" > 0`),
  check('§6.2', 'PayablePayment', 'payable_payment_amount_check', `"amount" > 0`),
  check('§6.2', 'ReceiptAllocation', 'receipt_allocation_amount_check', `"amount" > 0`),
]);

/**
 * How each §6.4 rule is enforced. `database` lists registry names; `application` lists the parts
 * that §6.4 / §3 assign to the application layer (implemented in later phases, not here).
 */
export interface IntegrityRule {
  readonly id: IntegrityRuleId;
  readonly title: string;
  readonly database: readonly string[];
  readonly application: readonly string[];
}

const namesFor = (source: ConstraintSource): string[] =>
  REGISTRY.filter((entry) => entry.source === source).map((entry) => entry.name);

export const INTEGRITY_RULES: readonly IntegrityRule[] = Object.freeze([
  {
    id: 'I-01',
    title: 'PayablePayment active pair unique',
    database: namesFor('I-01'),
    application: [],
  },
  {
    id: 'I-02',
    title: 'ReceiptAllocation active pair unique',
    database: namesFor('I-02'),
    application: [],
  },
  { id: 'I-03', title: 'System role code unique', database: namesFor('I-03'), application: [] },
  {
    id: 'I-04',
    title: 'Organization role code unique',
    database: namesFor('I-04'),
    application: [],
  },
  {
    id: 'I-05',
    title: 'ExpenseScope ⇔ projectId',
    database: namesFor('I-05'),
    application: [
      'Scope validation in the expense use case (ADR-15)',
      'Payable scope / projectId equal the source Expense (§6.2)',
    ],
  },
  {
    id: 'I-06',
    title: 'POSTED / VOID Expense has a vendor',
    database: namesFor('I-06'),
    application: [],
  },
  {
    id: 'I-07',
    title: 'Payee type ⇔ payee column',
    database: namesFor('I-07'),
    application: [
      'Payable payee equals Expense.vendorId or Expense.advancedByEmployeeId (§3.5)',
      'All active allocations of a Payment share its payee (§3.5, TD-35)',
    ],
  },
  {
    id: 'I-08',
    title: 'Expense status fields consistent',
    database: namesFor('I-08'),
    application: [],
  },
  { id: 'I-09', title: 'Expense amounts', database: namesFor('I-09'), application: [] },
  {
    id: 'I-10',
    title: 'Payable / Receivable amounts',
    database: namesFor('I-10'),
    application: [],
  },
  {
    id: 'I-11',
    title: 'Payment amounts by feeBearer',
    database: namesFor('I-11'),
    application: [],
  },
  {
    id: 'I-12',
    title: 'Receipt amounts by feeBearer',
    database: namesFor('I-12'),
    application: ['MVP API rejects Receipt feeBearer COUNTERPARTY (§3.5)'],
  },
  {
    id: 'I-13',
    title: 'ChangeOrder billed amount within amount',
    database: namesFor('I-13'),
    application: ['Row lock + conditional billedAmount update → CHANGE_ORDER_OVERBILLED (§3.6)'],
  },
  { id: 'I-14', title: 'ProgressBilling formulas', database: namesFor('I-14'), application: [] },
  {
    id: 'I-15',
    title: 'ProgressBillingChangeOrder pair unique and amount > 0',
    database: namesFor('I-15'),
    application: ['Only APPROVED change orders of the same project can be billed (§3.6)'],
  },
  {
    id: 'I-16',
    title: 'One active OWNER_CONTRACT per project',
    database: namesFor('I-16'),
    application: [],
  },
  {
    id: 'I-17',
    title: 'Encrypted field completeness',
    database: namesFor('I-17'),
    application: [],
  },
  {
    id: 'I-18',
    title: 'RevenueEntry source and sourceKey idempotency',
    database: namesFor('I-18'),
    application: ['Automatic recognition uses INSERT … ON CONFLICT DO NOTHING semantics (§3.7)'],
  },
  { id: 'I-19', title: 'clientRequestId idempotency', database: namesFor('I-19'), application: [] },
  {
    id: 'I-20',
    title: 'AuditLog append-only',
    database: namesFor('I-20'),
    application: ['The application connects as app_user, never as the table owner'],
  },
  {
    id: 'I-21',
    title: 'Composite (organizationId, id) foreign keys',
    database: namesFor('I-21'),
    application: ['ReferenceGuard.assertSameOrganization for every reference (§6.4, Phase 3)'],
  },
  {
    id: 'I-22',
    title: 'Allocation void fields consistent',
    database: namesFor('I-22'),
    application: [],
  },
  {
    id: 'I-23',
    title: 'Cheque clearing fields',
    database: namesFor('I-23'),
    application: [
      'PENDING / BOUNCED cheques have no POSTED BankTransaction (application + reconciliation)',
    ],
  },
  {
    id: 'I-24',
    title: 'Employee number / user unique per organization',
    database: namesFor('I-24'),
    application: [],
  },
  { id: 'I-25', title: 'AuditLog schemaVersion ≥ 1', database: namesFor('I-25'), application: [] },
  {
    id: 'I-26',
    title: 'Receivable never stores OVERDUE',
    database: namesFor('I-26'),
    application: [],
  },
]);

/** Names Prisma drafts and drift scripts must never drop or alter (ADR-034). */
export const PROTECTED_OBJECT_NAMES: readonly string[] = Object.freeze(
  REGISTRY.filter((entry) => entry.kind !== 'revoked_privileges').map((entry) => entry.name),
);
