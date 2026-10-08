// Table-driven integrity cases for PostgreSQL (§6.4 "每條約束需有 integration test 驗證違反時會失敗").
// Each case starts from the fixture data (./fixtures.ts) inside a rolled-back transaction and
// either expects the last step to be rejected with a specific SQLSTATE and constraint name, or
// expects every step to succeed (positive control). They run only in a separately authorized
// disposable database (constraints.spec.ts); test/db-plan.test.ts validates them offline.
import { REGISTRY, type ConstraintSource } from '../../prisma/constraints.registry.js';
import { NOW, TODAY, ref, type Scope, type Values } from './fixtures.js';

export interface InsertCopyStep {
  readonly op: 'insert';
  readonly scope: Scope;
  /** Fixture row to copy (new id, copyResets applied, then `set`). */
  readonly base: string;
  readonly set: Values;
}
export interface UpdateStep {
  readonly op: 'update';
  readonly scope: Scope;
  readonly target: string;
  readonly set: Values;
}
export interface DeleteStep {
  readonly op: 'delete';
  readonly scope: Scope;
  readonly target: string;
}
export type Step = InsertCopyStep | UpdateStep | DeleteStep;

export type Expectation =
  | { readonly outcome: 'accept' }
  | {
      readonly outcome: 'reject';
      readonly sqlstate: readonly string[];
      readonly constraint?: string;
    };

export interface DbCase {
  readonly id: string;
  readonly source: ConstraintSource;
  /** Registry or native constraint names the case is about. */
  readonly covers: readonly string[];
  readonly steps: readonly Step[];
  readonly expect: Expectation;
}

export const SQLSTATE = {
  check: ['23514'],
  unique: ['23505'],
  foreignKey: ['23503'],
  /** Deleting a referenced row under RESTRICT: 23503 on PostgreSQL 16.15 (ADR-034 run 1). */
  restrict: ['23503', '23001'],
} as const;

const copy = (base: string, set: Values = {}, scope: Scope = 'A'): InsertCopyStep => ({
  op: 'insert',
  scope,
  base,
  set,
});
const update = (target: string, set: Values, scope: Scope = 'A'): UpdateStep => ({
  op: 'update',
  scope,
  target,
  set,
});
const remove = (target: string, scope: Scope = 'A'): DeleteStep => ({
  op: 'delete',
  scope,
  target,
});

const user = ref('global', 'user');
const voided = { voidedAt: NOW, voidedById: user, voidReason: 'IT' };

const sourceOf = (name: string): ConstraintSource => {
  const entry = REGISTRY.find((e) => e.name === name);
  return entry?.source ?? '§6.2';
};

function reject(
  id: string,
  constraint: string,
  sqlstate: readonly string[],
  ...steps: Step[]
): DbCase {
  return {
    id,
    source: sourceOf(constraint),
    covers: [constraint],
    steps,
    expect: { outcome: 'reject', sqlstate, constraint },
  };
}

function accept(id: string, covers: string | readonly string[], ...steps: Step[]): DbCase {
  const names = typeof covers === 'string' ? [covers] : covers;
  return {
    id,
    source: sourceOf(names[0] ?? ''),
    covers: names,
    steps,
    expect: { outcome: 'accept' },
  };
}

const check = SQLSTATE.check;
const unique = SQLSTATE.unique;

// ------------------------------------------------------------------------------------------
// I-21: composite foreign keys — one cross-organization rejection per FK, plus MATCH SIMPLE
// acceptance of NULL for every nullable FK.
// ------------------------------------------------------------------------------------------

interface CompositeFkPlan {
  /** Copy of this org-A fixture row … */
  readonly base: string;
  /** … with these values pointing at organization B. */
  readonly crossOrg: Values;
  /** For nullable FKs: values that make NULL valid for every other constraint. */
  readonly nullAccept?: Values;
}

export const COMPOSITE_FK_PLANS: Readonly<Record<string, CompositeFkPlan>> = {
  expense_project_id_org_fkey: {
    base: 'expense',
    crossOrg: { projectId: ref('B', 'project') },
    nullAccept: { scope: 'OVERHEAD', projectId: null },
  },
  expense_vendor_id_org_fkey: {
    base: 'expense',
    crossOrg: { vendorId: ref('B', 'vendor') },
    nullAccept: { status: 'DRAFT', vendorId: null },
  },
  expense_advanced_by_employee_id_org_fkey: {
    base: 'expense',
    crossOrg: { advancedByEmployeeId: ref('B', 'employee') },
    nullAccept: { advancedByEmployeeId: null },
  },
  expense_cost_category_id_org_fkey: {
    base: 'expense',
    crossOrg: { costCategoryId: ref('B', 'costCategory') },
  },
  expense_item_expense_id_org_fkey: {
    base: 'expenseItem',
    crossOrg: { expenseId: ref('B', 'expense') },
  },
  expense_item_cost_category_id_org_fkey: {
    base: 'expenseItem',
    crossOrg: { costCategoryId: ref('B', 'costCategory') },
  },
  payable_vendor_id_org_fkey: {
    base: 'payable2',
    crossOrg: { vendorId: ref('B', 'vendor') },
    nullAccept: { payeeType: 'EMPLOYEE', vendorId: null, employeeId: ref('A', 'employee') },
  },
  payable_employee_id_org_fkey: {
    base: 'payable',
    crossOrg: { employeeId: ref('B', 'employee') },
    nullAccept: { payeeType: 'VENDOR', employeeId: null, vendorId: ref('A', 'vendor') },
  },
  payable_expense_id_org_fkey: {
    base: 'payable',
    // B's draft expense has no Payable, so payable_expense_id_key cannot fire first.
    crossOrg: { expenseId: ref('B', 'expenseDraft') },
    nullAccept: { expenseId: null },
  },
  payable_project_id_org_fkey: {
    base: 'payable',
    crossOrg: { projectId: ref('B', 'project') },
    nullAccept: { scope: 'OVERHEAD', projectId: null },
  },
  payment_vendor_id_org_fkey: {
    base: 'payment',
    crossOrg: { payeeType: 'VENDOR', employeeId: null, vendorId: ref('B', 'vendor') },
    nullAccept: { vendorId: null },
  },
  payment_employee_id_org_fkey: {
    base: 'payment',
    crossOrg: { employeeId: ref('B', 'employee') },
    nullAccept: { payeeType: 'VENDOR', employeeId: null, vendorId: ref('A', 'vendor') },
  },
  payment_project_id_org_fkey: {
    base: 'payment',
    crossOrg: { projectId: ref('B', 'project') },
    nullAccept: { projectId: null },
  },
  payment_bank_account_id_org_fkey: {
    base: 'payment',
    crossOrg: { bankAccountId: ref('B', 'bankAccount') },
  },
  payable_payment_payment_id_org_fkey: {
    base: 'payablePayment',
    crossOrg: { paymentId: ref('B', 'payment') },
  },
  payable_payment_payable_id_org_fkey: {
    base: 'payablePayment',
    crossOrg: { payableId: ref('B', 'payable') },
  },
  progress_billing_project_id_org_fkey: {
    base: 'progressBilling',
    crossOrg: { projectId: ref('B', 'project') },
  },
  progress_billing_contract_id_org_fkey: {
    base: 'progressBilling',
    crossOrg: { contractId: ref('B', 'contract') },
  },
  progress_billing_change_order_progress_billing_id_org_fkey: {
    base: 'pbco',
    crossOrg: { progressBillingId: ref('B', 'progressBilling') },
  },
  progress_billing_change_order_change_order_id_org_fkey: {
    base: 'pbco',
    crossOrg: { changeOrderId: ref('B', 'changeOrder') },
  },
  receivable_customer_id_org_fkey: {
    base: 'receivable2',
    crossOrg: { customerId: ref('B', 'customer') },
  },
  receivable_project_id_org_fkey: {
    base: 'receivable2',
    crossOrg: { projectId: ref('B', 'project') },
    nullAccept: { projectId: null },
  },
  receivable_progress_billing_id_org_fkey: {
    base: 'receivable2',
    // B's second billing has no Receivable, so receivable_progress_billing_id_key cannot fire.
    crossOrg: { sourceType: 'PROGRESS_BILLING', progressBillingId: ref('B', 'progressBilling2') },
    nullAccept: { sourceType: 'OTHER', progressBillingId: null },
  },
  receivable_retention_release_id_org_fkey: {
    base: 'receivable2',
    crossOrg: {
      sourceType: 'RETENTION_RELEASE',
      retentionReleaseId: ref('B', 'retentionRelease2'),
    },
    nullAccept: { sourceType: 'OTHER', retentionReleaseId: null },
  },
  receipt_customer_id_org_fkey: {
    base: 'receipt',
    crossOrg: { customerId: ref('B', 'customer') },
  },
  receipt_project_id_org_fkey: {
    base: 'receipt',
    crossOrg: { projectId: ref('B', 'project') },
    nullAccept: { projectId: null },
  },
  receipt_bank_account_id_org_fkey: {
    base: 'receipt',
    crossOrg: { bankAccountId: ref('B', 'bankAccount') },
  },
  receipt_allocation_receipt_id_org_fkey: {
    base: 'receiptAllocation',
    crossOrg: { receiptId: ref('B', 'receipt') },
  },
  receipt_allocation_receivable_id_org_fkey: {
    base: 'receiptAllocation',
    crossOrg: { receivableId: ref('B', 'receivable') },
  },
  change_order_project_id_org_fkey: {
    base: 'changeOrder',
    crossOrg: { projectId: ref('B', 'project') },
  },
  change_order_contract_id_org_fkey: {
    base: 'changeOrder',
    crossOrg: { contractId: ref('B', 'contract') },
  },
  revenue_entry_project_id_org_fkey: {
    base: 'revenueEntry',
    crossOrg: { projectId: ref('B', 'project') },
    nullAccept: { projectId: null },
  },
  revenue_entry_progress_billing_id_org_fkey: {
    base: 'revenueEntry',
    crossOrg: { progressBillingId: ref('B', 'progressBilling') },
    nullAccept: { sourceType: 'OTHER_INCOME', progressBillingId: null },
  },
  retention_release_project_id_org_fkey: {
    base: 'retentionRelease',
    crossOrg: { projectId: ref('B', 'project') },
  },
  bank_transaction_bank_account_id_org_fkey: {
    base: 'bankTransaction',
    crossOrg: { bankAccountId: ref('B', 'bankAccount') },
  },
  petty_cash_transaction_expense_id_org_fkey: {
    base: 'pettyCash',
    crossOrg: { expenseId: ref('B', 'expense') },
    nullAccept: { expenseId: null },
  },
};

const compositeFkCases: DbCase[] = Object.entries(COMPOSITE_FK_PLANS).flatMap(([name, plan]) => [
  reject(
    `I-21 ${name}: cross-organization reference`,
    name,
    SQLSTATE.foreignKey,
    copy(plan.base, plan.crossOrg),
  ),
  ...(plan.nullAccept
    ? [accept(`I-21 ${name}: NULL passes (MATCH SIMPLE)`, name, copy(plan.base, plan.nullAccept))]
    : []),
]);

// ------------------------------------------------------------------------------------------
// I-19: idempotency keys
// ------------------------------------------------------------------------------------------

const idempotencyCases: DbCase[] = (
  [
    ['expense', 'expense_client_request_id_partial_key'],
    ['payment', 'payment_client_request_id_partial_key'],
    ['receipt', 'receipt_client_request_id_partial_key'],
    ['revenueEntry', 'revenue_entry_client_request_id_partial_key'],
    ['dailyLog', 'project_daily_log_client_request_id_partial_key'],
  ] as const
).flatMap(([base, name]) => [
  reject(
    `I-19 ${name}: duplicate clientRequestId in one organization`,
    name,
    unique,
    copy(base, { clientRequestId: ref('A', base, 'clientRequestId') }),
  ),
  accept(
    `I-19 ${name}: same clientRequestId in another organization`,
    name,
    copy(base, { clientRequestId: ref('A', base, 'clientRequestId') }, 'B'),
  ),
  accept(`I-19 ${name}: several NULL clientRequestIds`, name, copy(base), copy(base)),
]);

// ------------------------------------------------------------------------------------------
// I-23: cheque clearing, identical for Payment and Receipt
// ------------------------------------------------------------------------------------------

const clearingCases: DbCase[] = (['payment', 'receipt'] as const).flatMap((base) => {
  const table = base;
  const cleared = { clearedAt: NOW, clearedById: user, clearedDate: TODAY };
  const bounced = { bouncedAt: NOW, bouncedById: user, bounceReason: 'IT' };
  return [
    reject(
      `I-23 ${table}: CHECK method with NOT_APPLICABLE`,
      `${table}_clearing_method_check`,
      check,
      copy(base, { method: 'CHECK' }),
    ),
    reject(
      `I-23 ${table}: bank transfer with PENDING`,
      `${table}_clearing_method_check`,
      check,
      copy(base, { clearingStatus: 'PENDING' }),
    ),
    accept(
      `I-23 ${table}: CHECK method PENDING`,
      `${table}_clearing_method_check`,
      copy(base, { method: 'CHECK', clearingStatus: 'PENDING' }),
    ),
    reject(
      `I-23 ${table}: CLEARED without clearedDate`,
      `${table}_cleared_fields_check`,
      check,
      copy(base, { method: 'CHECK', clearingStatus: 'CLEARED', clearedAt: NOW, clearedById: user }),
    ),
    reject(
      `I-23 ${table}: clearing fields on a PENDING cheque`,
      `${table}_cleared_fields_check`,
      check,
      copy(base, { method: 'CHECK', clearingStatus: 'PENDING', ...cleared }),
    ),
    accept(
      `I-23 ${table}: CLEARED with every clearing field`,
      `${table}_cleared_fields_check`,
      copy(base, { method: 'CHECK', clearingStatus: 'CLEARED', ...cleared }),
    ),
    reject(
      `I-23 ${table}: BOUNCED without bouncedById`,
      `${table}_bounced_fields_check`,
      check,
      copy(base, { method: 'CHECK', clearingStatus: 'BOUNCED', bouncedAt: NOW }),
    ),
    reject(
      `I-23 ${table}: bounce fields on a PENDING cheque`,
      `${table}_bounced_fields_check`,
      check,
      copy(base, { method: 'CHECK', clearingStatus: 'PENDING', ...bounced }),
    ),
    accept(
      `I-23 ${table}: BOUNCED with every bounce field`,
      `${table}_bounced_fields_check`,
      copy(base, { method: 'CHECK', clearingStatus: 'BOUNCED', ...bounced }),
    ),
  ];
});

// ------------------------------------------------------------------------------------------
// I-17: encrypted bank account fields
// ------------------------------------------------------------------------------------------

const encryptedFieldCases: DbCase[] = (
  [
    ['vendor', 'vendor_bank_account_no_fields_check', 'bankAccountNo'],
    ['employee', 'employee_bank_account_no_fields_check', 'bankAccountNo'],
    ['bankAccount', 'bank_account_account_no_fields_check', 'accountNo'],
  ] as const
).flatMap(([target, name, prefix]) => [
  reject(
    `I-17 ${name}: ciphertext only`,
    name,
    check,
    update(target, { [`${prefix}Ciphertext`]: 'Y2lwaGVydGV4dA==' }),
  ),
  reject(
    `I-17 ${name}: ciphertext and key version without last4`,
    name,
    check,
    update(target, { [`${prefix}Ciphertext`]: 'Y2lwaGVydGV4dA==', [`${prefix}KeyVersion`]: 1 }),
  ),
  reject(`I-17 ${name}: last4 only`, name, check, update(target, { [`${prefix}Last4`]: '0000' })),
  accept(
    `I-17 ${name}: all three set`,
    name,
    update(target, {
      [`${prefix}Ciphertext`]: 'Y2lwaGVydGV4dA==',
      [`${prefix}KeyVersion`]: 1,
      [`${prefix}Last4`]: '0000',
    }),
  ),
]);

// ------------------------------------------------------------------------------------------
// Remaining rules, in §6.4 order
// ------------------------------------------------------------------------------------------

const ruleCases: DbCase[] = [
  // I-01 / I-02
  reject(
    'I-01 duplicate active PayablePayment pair',
    'payable_payment_pair_active_key',
    unique,
    copy('payablePayment', { payableId: ref('A', 'payable') }),
  ),
  accept(
    'I-01 re-allocation after voiding the active pair',
    'payable_payment_pair_active_key',
    update('payablePayment', voided),
    copy('payablePayment', { payableId: ref('A', 'payable') }),
  ),
  reject(
    'I-02 duplicate active ReceiptAllocation pair',
    'receipt_allocation_pair_active_key',
    unique,
    copy('receiptAllocation', { receivableId: ref('A', 'receivable') }),
  ),
  accept(
    'I-02 re-allocation after voiding the active pair',
    'receipt_allocation_pair_active_key',
    update('receiptAllocation', voided),
    copy('receiptAllocation', { receivableId: ref('A', 'receivable') }),
  ),

  // I-03 / I-04
  reject(
    'I-03 duplicate system role code',
    'role_system_code_uq',
    unique,
    copy('systemRole', { code: 'IT_SYSTEM_ROLE' }, 'global'),
  ),
  accept(
    'I-03 organization role may reuse a system role code',
    ['role_system_code_uq', 'role_org_code_uq'],
    copy('orgRole', { code: 'IT_SYSTEM_ROLE' }),
  ),
  reject(
    'I-04 duplicate role code in one organization',
    'role_org_code_uq',
    unique,
    copy('orgRole', { code: 'IT_ORG_ROLE' }),
  ),
  accept(
    'I-04 same role code in two organizations',
    'role_org_code_uq',
    copy('orgRole', { code: 'IT_ONLY_ONCE' }),
    copy('orgRole', { code: 'IT_ONLY_ONCE' }, 'B'),
  ),

  // I-05
  reject(
    'I-05 PROJECT expense without project',
    'expense_scope_project_check',
    check,
    copy('expense', { projectId: null }),
  ),
  reject(
    'I-05 OVERHEAD expense with project',
    'expense_scope_project_check',
    check,
    copy('expenseDraft', { projectId: ref('A', 'project') }),
  ),
  accept(
    'I-05 OVERHEAD expense without project',
    'expense_scope_project_check',
    copy('expenseDraft'),
  ),
  reject(
    'I-05 PROJECT payable without project',
    'payable_scope_project_check',
    check,
    copy('payable', { projectId: null }),
  ),
  reject(
    'I-05 OVERHEAD payable with project',
    'payable_scope_project_check',
    check,
    copy('payable2', { projectId: ref('A', 'project') }),
  ),
  accept('I-05 OVERHEAD payable without project', 'payable_scope_project_check', copy('payable2')),

  // I-06
  reject(
    'I-06 POSTED expense without vendor',
    'expense_posted_vendor_check',
    check,
    copy('expense', { vendorId: null }),
  ),
  reject(
    'I-06 VOID expense without vendor',
    'expense_posted_vendor_check',
    check,
    copy('expense', { vendorId: null, status: 'VOID', ...voided }),
  ),
  accept(
    'I-06 SUBMITTED expense without vendor (D-22)',
    ['expense_posted_vendor_check', 'expense_submitted_fields_check'],
    copy('expenseDraft', { status: 'SUBMITTED', submittedAt: NOW, submittedById: user }),
  ),

  // I-07
  reject(
    'I-07 EMPLOYEE payable that also has a vendor',
    'payable_payee_check',
    check,
    copy('payable', { vendorId: ref('A', 'vendor') }),
  ),
  reject(
    'I-07 VENDOR payable that also has an employee',
    'payable_payee_check',
    check,
    copy('payable2', { employeeId: ref('A', 'employee') }),
  ),
  reject(
    'I-07 VENDOR payable without vendor',
    'payable_payee_check',
    check,
    copy('payable2', { vendorId: null }),
  ),
  accept(
    'I-07 VENDOR and EMPLOYEE payables',
    'payable_payee_check',
    copy('payable'),
    copy('payable2'),
  ),
  reject(
    'I-07 EMPLOYEE payment that also has a vendor',
    'payment_payee_check',
    check,
    copy('payment', { vendorId: ref('A', 'vendor') }),
  ),
  reject(
    'I-07 VENDOR payment without vendor',
    'payment_payee_check',
    check,
    copy('payment', { payeeType: 'VENDOR' }),
  ),
  accept(
    'I-07 VENDOR payment',
    'payment_payee_check',
    copy('payment', { payeeType: 'VENDOR', employeeId: null, vendorId: ref('A', 'vendor') }),
  ),

  // I-08
  reject(
    'I-08 SUBMITTED expense without submittedAt / submittedById',
    'expense_submitted_fields_check',
    check,
    copy('expenseDraft', { status: 'SUBMITTED' }),
  ),
  reject(
    'I-08 POSTED expense without expenseNo',
    'expense_posted_fields_check',
    check,
    copy('expense', { expenseNo: null }),
  ),
  reject(
    'I-08 POSTED expense without postedAt',
    'expense_posted_fields_check',
    check,
    copy('expense', { postedAt: null }),
  ),
  accept('I-08 POSTED expense with posting fields', 'expense_posted_fields_check', copy('expense')),
  reject(
    'I-08 VOID expense without voidedAt',
    'expense_void_fields_check',
    check,
    copy('expense', { status: 'VOID' }),
  ),
  accept(
    'I-08 VOID expense with void fields',
    'expense_void_fields_check',
    copy('expense', { status: 'VOID', ...voided }),
  ),

  // I-09
  reject(
    'I-09 total ≠ subtotal + tax',
    'expense_amounts_check',
    check,
    copy('expense', { totalAmount: '1049.00' }),
  ),
  reject(
    'I-09 negative subtotal',
    'expense_amounts_check',
    check,
    copy('expense', { subtotalAmount: '-10.00', taxAmount: '10.00', totalAmount: '0.00' }),
  ),
  reject(
    'I-09 negative tax',
    'expense_amounts_check',
    check,
    copy('expense', { subtotalAmount: '1100.00', taxAmount: '-50.00', totalAmount: '1050.00' }),
  ),
  accept(
    'I-09 consistent amounts',
    'expense_amounts_check',
    copy('expense', { subtotalAmount: '0.00', taxAmount: '0.00', totalAmount: '0.00' }),
  ),

  // I-10
  reject(
    'I-10 payable paid + outstanding ≠ original',
    'payable_amounts_check',
    check,
    copy('payable2', { paidAmount: '100.00' }),
  ),
  reject(
    'I-10 payable negative paid',
    'payable_amounts_check',
    check,
    copy('payable2', { paidAmount: '-100.00', outstandingAmount: '600.00' }),
  ),
  reject(
    'I-10 payable negative outstanding (overpaid)',
    'payable_amounts_check',
    check,
    copy('payable2', { paidAmount: '600.00', outstandingAmount: '-100.00' }),
  ),
  accept(
    'I-10 payable fully paid',
    'payable_amounts_check',
    copy('payable2', { paidAmount: '500.00', outstandingAmount: '0.00', status: 'PAID' }),
  ),
  reject(
    'I-10 receivable paid + outstanding ≠ original',
    'receivable_amounts_check',
    check,
    copy('receivable2', { paidAmount: '100.00' }),
  ),
  reject(
    'I-10 receivable negative paid',
    'receivable_amounts_check',
    check,
    copy('receivable2', { paidAmount: '-100.00', outstandingAmount: '10100.00' }),
  ),
  reject(
    'I-10 receivable negative outstanding (overpaid)',
    'receivable_amounts_check',
    check,
    copy('receivable2', { paidAmount: '10100.00', outstandingAmount: '-100.00' }),
  ),
  accept(
    'I-10 receivable fully paid',
    'receivable_amounts_check',
    copy('receivable2', { paidAmount: '10000.00', outstandingAmount: '0.00', status: 'PAID' }),
  ),

  // I-11
  reject(
    'I-11 allocated + unallocated ≠ payment',
    'payment_amounts_check',
    check,
    copy('payment', { unallocatedAmount: '1.00' }),
  ),
  reject(
    'I-11 negative unallocated',
    'payment_amounts_check',
    check,
    copy('payment', { allocatedAmount: '1100.00', unallocatedAmount: '-100.00' }),
  ),
  reject(
    'I-11 zero payment amount',
    'payment_amounts_check',
    check,
    copy('payment', {
      paymentAmount: '0.00',
      allocatedAmount: '0.00',
      unallocatedAmount: '0.00',
      bankOutflowAmount: '30.00',
      payeeReceivedAmount: '0.00',
    }),
  ),
  reject(
    'I-11 negative fee',
    'payment_amounts_check',
    check,
    copy('payment', { feeAmount: '-1.00', bankOutflowAmount: '999.00' }),
  ),
  accept(
    'I-11 partially allocated payment (ADR-08)',
    'payment_amounts_check',
    copy('payment', { allocatedAmount: '400.00', unallocatedAmount: '600.00' }),
  ),
  reject(
    'I-11 COMPANY fee not added to bank outflow',
    'payment_fee_bearer_amounts_check',
    check,
    copy('payment', { bankOutflowAmount: '1000.00' }),
  ),
  reject(
    'I-11 COMPANY fee deducted from payee',
    'payment_fee_bearer_amounts_check',
    check,
    copy('payment', { payeeReceivedAmount: '970.00' }),
  ),
  reject(
    'I-11 COUNTERPARTY with COMPANY amounts',
    'payment_fee_bearer_amounts_check',
    check,
    copy('payment', { feeBearer: 'COUNTERPARTY' }),
  ),
  reject(
    'I-11 COUNTERPARTY fee not below payment amount',
    'payment_fee_bearer_amounts_check',
    check,
    copy('payment', {
      feeBearer: 'COUNTERPARTY',
      feeAmount: '1000.00',
      bankOutflowAmount: '1000.00',
      payeeReceivedAmount: '0.00',
    }),
  ),
  accept(
    'I-11 COUNTERPARTY fee deducted from payee (ADR-27 example)',
    'payment_fee_bearer_amounts_check',
    copy('payment', {
      feeBearer: 'COUNTERPARTY',
      bankOutflowAmount: '1000.00',
      payeeReceivedAmount: '970.00',
    }),
  ),

  // I-12
  reject(
    'I-12 allocated + unallocated ≠ received',
    'receipt_amounts_check',
    check,
    copy('receipt', { unallocatedAmount: '1.00' }),
  ),
  accept(
    'I-12 unallocated receipt (deposit, ADR-33)',
    'receipt_amounts_check',
    copy('receipt', { allocatedAmount: '0.00', unallocatedAmount: '100000.00' }),
  ),
  reject(
    'I-12 zero received amount',
    'receipt_amounts_check',
    check,
    copy('receipt', {
      receivedAmount: '0.00',
      allocatedAmount: '0.00',
      unallocatedAmount: '0.00',
      feeAmount: '0.00',
      feeBearer: 'COUNTERPARTY',
      bankInflowAmount: '0.00',
    }),
  ),
  reject(
    'I-12 negative fee',
    'receipt_amounts_check',
    check,
    copy('receipt', { feeAmount: '-1.00', bankInflowAmount: '100001.00' }),
  ),
  reject(
    'I-12 COMPANY fee not deducted from inflow',
    'receipt_fee_bearer_amounts_check',
    check,
    copy('receipt', { bankInflowAmount: '100000.00' }),
  ),
  reject(
    'I-12 COMPANY fee not below received amount',
    'receipt_fee_bearer_amounts_check',
    check,
    copy('receipt', { feeAmount: '100000.00', bankInflowAmount: '0.00' }),
  ),
  reject(
    'I-12 COUNTERPARTY with a fee',
    'receipt_fee_bearer_amounts_check',
    check,
    copy('receipt', { feeBearer: 'COUNTERPARTY', bankInflowAmount: '100000.00' }),
  ),
  accept(
    'I-12 COUNTERPARTY without fee (allowed by the DB; rejected by the MVP API)',
    'receipt_fee_bearer_amounts_check',
    copy('receipt', {
      feeBearer: 'COUNTERPARTY',
      feeAmount: '0.00',
      bankInflowAmount: '100000.00',
    }),
  ),

  // I-13
  reject(
    'I-13 billed amount above change order amount',
    'change_order_billed_amount_check',
    check,
    update('changeOrder', { billedAmount: '100000.01' }),
  ),
  reject(
    'I-13 negative billed amount',
    'change_order_billed_amount_check',
    check,
    update('changeOrder', { billedAmount: '-1.00' }),
  ),
  reject(
    'I-13 zero change order amount',
    'change_order_billed_amount_check',
    check,
    copy('changeOrder', { amount: '0.00', billedAmount: '0.00' }),
  ),
  accept(
    'I-13 fully billed change order',
    'change_order_billed_amount_check',
    update('changeOrder', { billedAmount: '100000.00' }),
  ),

  // I-14
  reject(
    'I-14 billing amount ≠ formula',
    'progress_billing_billing_amount_check',
    check,
    copy('progressBilling', { billingAmount: '220001.00', totalAmount: '231001.00' }),
  ),
  reject(
    'I-14 deduction not subtracted',
    'progress_billing_billing_amount_check',
    check,
    copy('progressBilling', { deductionAmount: '5000.00' }),
  ),
  accept(
    'I-14 deduction subtracted',
    'progress_billing_billing_amount_check',
    copy('progressBilling', {
      deductionAmount: '5000.00',
      billingAmount: '215000.00',
      totalAmount: '226000.00',
    }),
  ),
  accept(
    'I-14 negative (deduction) change order amount',
    'progress_billing_billing_amount_check',
    copy('progressBilling', {
      changeOrderAmount: '-30000.00',
      billingAmount: '160000.00',
      totalAmount: '171000.00',
    }),
  ),
  reject(
    'I-14 total ≠ billing + tax',
    'progress_billing_total_amount_check',
    check,
    copy('progressBilling', { totalAmount: '220000.00' }),
  ),
  accept(
    'I-14 tax-free billing',
    'progress_billing_total_amount_check',
    copy('progressBilling', { taxAmount: '0.00', totalAmount: '220000.00' }),
  ),

  // I-15
  reject(
    'I-15 duplicate billing / change order pair',
    'progress_billing_change_order_pair_key',
    unique,
    copy('pbco', { changeOrderId: ref('A', 'changeOrder') }),
  ),
  accept(
    'I-15 another change order on the same billing',
    'progress_billing_change_order_pair_key',
    copy('pbco'),
  ),
  reject(
    'I-15 zero amount',
    'progress_billing_change_order_amount_check',
    check,
    copy('pbco', { amount: '0.00' }),
  ),
  accept(
    'I-15 positive amount',
    'progress_billing_change_order_amount_check',
    copy('pbco', { amount: '0.01' }),
  ),

  // I-16
  reject(
    'I-16 second active OWNER_CONTRACT',
    'contract_owner_contract_active_key',
    unique,
    copy('contract', { type: 'OWNER_CONTRACT' }),
  ),
  accept(
    'I-16 terminated OWNER_CONTRACT alongside the active one',
    'contract_owner_contract_active_key',
    copy('contract', { type: 'OWNER_CONTRACT', status: 'TERMINATED' }),
  ),
  accept(
    'I-16 SUBCONTRACT alongside the OWNER_CONTRACT',
    'contract_owner_contract_active_key',
    copy('contract'),
  ),
  accept(
    'I-16 new OWNER_CONTRACT after terminating the old one',
    'contract_owner_contract_active_key',
    update('contract', { status: 'TERMINATED' }),
    copy('contract', { type: 'OWNER_CONTRACT' }),
  ),

  // I-18
  reject(
    'I-18 PROGRESS_BILLING revenue without billing',
    'revenue_entry_source_check',
    check,
    copy('revenueEntry', { progressBillingId: null }),
  ),
  reject(
    'I-18 OTHER_INCOME revenue with billing',
    'revenue_entry_source_check',
    check,
    copy('revenueEntry', { sourceType: 'OTHER_INCOME' }),
  ),
  accept(
    'I-18 OTHER_INCOME revenue without billing',
    'revenue_entry_source_check',
    copy('revenueEntry', { sourceType: 'OTHER_INCOME', progressBillingId: null }),
  ),
  reject(
    'I-18 duplicate active sourceKey',
    'revenue_entry_source_key_active_key',
    unique,
    copy('revenueEntry', { sourceKey: ref('A', 'revenueEntry', 'sourceKey') }),
  ),
  accept(
    'I-18 sourceKey reused after voiding',
    'revenue_entry_source_key_active_key',
    update('revenueEntry', { status: 'VOID', ...voided }),
    copy('revenueEntry', { sourceKey: ref('A', 'revenueEntry', 'sourceKey') }),
  ),
  accept(
    'I-18 second revenue entry for one billing (ADR-29 1:N)',
    'revenue_entry_source_key_active_key',
    copy('revenueEntry'),
  ),

  // I-22
  reject(
    'I-22 PayablePayment voidedAt only',
    'payable_payment_void_fields_check',
    check,
    update('payablePayment', { voidedAt: NOW }),
  ),
  reject(
    'I-22 PayablePayment without voidReason',
    'payable_payment_void_fields_check',
    check,
    update('payablePayment', { voidedAt: NOW, voidedById: user }),
  ),
  reject(
    'I-22 PayablePayment voidReason only',
    'payable_payment_void_fields_check',
    check,
    update('payablePayment', { voidReason: 'IT' }),
  ),
  accept(
    'I-22 PayablePayment fully voided',
    'payable_payment_void_fields_check',
    update('payablePayment', voided),
  ),
  reject(
    'I-22 ReceiptAllocation voidedAt only',
    'receipt_allocation_void_fields_check',
    check,
    update('receiptAllocation', { voidedAt: NOW }),
  ),
  reject(
    'I-22 ReceiptAllocation without voidedById',
    'receipt_allocation_void_fields_check',
    check,
    update('receiptAllocation', { voidedAt: NOW, voidReason: 'IT' }),
  ),
  accept(
    'I-22 ReceiptAllocation fully voided',
    'receipt_allocation_void_fields_check',
    update('receiptAllocation', voided),
  ),

  // I-24
  reject(
    'I-24 duplicate employeeNo in one organization',
    'employee_employee_no_partial_key',
    unique,
    copy('employee', { employeeNo: 'E001' }),
  ),
  accept(
    'I-24 same employeeNo in two organizations',
    'employee_employee_no_partial_key',
    copy('employee', { employeeNo: 'E900' }),
    copy('employee', { employeeNo: 'E900' }, 'B'),
  ),
  accept(
    'I-24 several employees without employeeNo',
    'employee_employee_no_partial_key',
    copy('employee'),
    copy('employee'),
  ),
  reject(
    'I-24 one user linked to two employees of one organization',
    'employee_user_id_partial_key',
    unique,
    copy('employee', { userId: ref('global', 'user2') }),
  ),
  accept(
    'I-24 one user linked to an employee in each organization',
    'employee_user_id_partial_key',
    copy('employee', { userId: user }),
    copy('employee', { userId: user }, 'B'),
  ),

  // I-25 / I-26
  reject(
    'I-25 schemaVersion 0',
    'audit_log_schema_version_check',
    check,
    copy('auditLog', { schemaVersion: 0 }),
  ),
  accept('I-25 default schemaVersion 1', 'audit_log_schema_version_check', copy('auditLog')),
  reject(
    'I-26 OVERDUE stored',
    'receivable_status_not_overdue_check',
    check,
    update('receivable', { status: 'OVERDUE' }),
  ),
  accept(
    'I-26 PAID stored',
    'receivable_status_not_overdue_check',
    update('receivable', { status: 'PAID', paidAmount: '231000.00', outstandingAmount: '0.00' }),
  ),

  // §6.2 model constraints
  reject(
    '§6.2 physical progress above 100',
    'project_physical_progress_percent_check',
    check,
    update('project', { physicalProgressPercent: '100.01' }),
  ),
  reject(
    '§6.2 negative physical progress',
    'project_physical_progress_percent_check',
    check,
    update('project', { physicalProgressPercent: '-0.01' }),
  ),
  accept(
    '§6.2 physical progress 0 and 100',
    'project_physical_progress_percent_check',
    update('project', { physicalProgressPercent: '100.00' }),
    update('project', { physicalProgressPercent: '0.00' }),
  ),
  accept(
    '§6.2 physical progress not reported',
    'project_physical_progress_percent_check',
    update('project', { physicalProgressPercent: null }),
  ),
  reject(
    '§6.2 PROGRESS_BILLING receivable without billing',
    'receivable_source_check',
    check,
    copy('receivable2', { sourceType: 'PROGRESS_BILLING' }),
  ),
  reject(
    '§6.2 OTHER receivable with retention release',
    'receivable_source_check',
    check,
    copy('receivable2', { retentionReleaseId: ref('A', 'retentionRelease2') }),
  ),
  accept('§6.2 OTHER receivable without source', 'receivable_source_check', copy('receivable2')),
  reject(
    '§6.2 zero bank transaction amount',
    'bank_transaction_amount_check',
    check,
    copy('bankTransaction', { amount: '0.00' }),
  ),
  reject(
    '§6.2 negative bank transaction amount',
    'bank_transaction_amount_check',
    check,
    copy('bankTransaction', { amount: '-1.00', direction: 'INFLOW' }),
  ),
  accept(
    '§6.2 positive bank transaction amount',
    'bank_transaction_amount_check',
    copy('bankTransaction'),
  ),
  reject(
    '§6.2 zero PayablePayment amount',
    'payable_payment_amount_check',
    check,
    copy('payablePayment', { amount: '0.00' }),
  ),
  accept(
    '§6.2 positive PayablePayment amount',
    'payable_payment_amount_check',
    copy('payablePayment', { amount: '0.01' }),
  ),
  reject(
    '§6.2 zero ReceiptAllocation amount',
    'receipt_allocation_amount_check',
    check,
    copy('receiptAllocation', { amount: '0.00' }),
  ),
  accept(
    '§6.2 positive ReceiptAllocation amount',
    'receipt_allocation_amount_check',
    copy('receiptAllocation', { amount: '0.01' }),
  ),

  // §6.2 native unique keys of the 1 : 0..1 source links
  reject(
    '§6.2 second payable for one expense',
    'payable_expense_id_key',
    unique,
    copy('payable', { expenseId: ref('A', 'expense') }),
  ),
  reject(
    '§6.2 second receivable for one billing',
    'receivable_progress_billing_id_key',
    unique,
    copy('receivable2', {
      sourceType: 'PROGRESS_BILLING',
      progressBillingId: ref('A', 'progressBilling'),
    }),
  ),
  reject(
    '§6.2 second receivable for one retention release',
    'receivable_retention_release_id_key',
    unique,
    copy('receivable2', {
      sourceType: 'RETENTION_RELEASE',
      retentionReleaseId: ref('A', 'retentionRelease'),
    }),
  ),
];

// ------------------------------------------------------------------------------------------
// §6.5 rule 5: deleting referenced rows is restricted (no cascading deletes of accounting data)
// ------------------------------------------------------------------------------------------

const restrictCases: DbCase[] = (
  [
    ['project', 'A'],
    ['payment', 'A'],
    ['expense', 'A'],
    ['progressBilling', 'A'],
    ['organization', 'A'],
    ['user', 'global'],
  ] as const
).map(([target, scope]) => ({
  id: `§6.5 RESTRICT: deleting referenced ${target}`,
  source: 'I-21' as const,
  covers: [],
  steps: [remove(target, scope)],
  expect: { outcome: 'reject', sqlstate: SQLSTATE.restrict },
}));

export const DB_CASES: readonly DbCase[] = Object.freeze([
  ...ruleCases,
  ...idempotencyCases,
  ...encryptedFieldCases,
  ...clearingCases,
  ...compositeFkCases,
  ...restrictCases,
]);
