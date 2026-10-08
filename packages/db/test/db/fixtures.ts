// Synthetic two-organization data set for the integrity tests. Every row is meant to satisfy all
// constraints; the cases in ./cases.ts then change one thing at a time. No real customer,
// vendor, bank or financial data: names are placeholders and amounts are round test numbers.
// test/db-plan.test.ts checks offline that every row fits the migration's tables and enums.

export type Scope = 'A' | 'B' | 'global';

/** Reference to another fixture value, resolved per run: [scope, key, field = 'id']. */
export interface Ref {
  readonly ref: readonly [Scope, string, string?];
}
export type Value = string | number | boolean | null | Ref;
export type Values = Readonly<Record<string, Value>>;

export interface FixtureRow {
  readonly scope: Scope;
  readonly key: string;
  readonly table: string;
  readonly values: Values;
}

export const ref = (scope: Scope, key: string, field?: string): Ref =>
  field === undefined ? { ref: [scope, key] } : { ref: [scope, key, field] };

export const isRef = (value: Value): value is Ref =>
  typeof value === 'object' && value !== null && 'ref' in value;

const PREFIX: Record<Scope, string> = { A: 'a', B: 'b', global: 'c' };
export const fixtureId = (scope: Scope, n: number): string =>
  `${PREFIX[scope]}0000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

export const NOW = '2026-10-08T00:00:00.000Z';
export const TODAY = '2026-10-08';

const GLOBAL_ROWS: readonly FixtureRow[] = [
  {
    scope: 'global',
    key: 'user',
    table: 'User',
    values: {
      id: fixtureId('global', 1),
      email: 'it-user-1@example.invalid',
      passwordHash: 'not-a-password-hash',
      name: 'Integration User 1',
      updatedAt: NOW,
    },
  },
  {
    scope: 'global',
    key: 'user2',
    table: 'User',
    values: {
      id: fixtureId('global', 2),
      email: 'it-user-2@example.invalid',
      passwordHash: 'not-a-password-hash',
      name: 'Integration User 2',
      updatedAt: NOW,
    },
  },
  {
    scope: 'global',
    key: 'systemRole',
    table: 'Role',
    values: {
      id: fixtureId('global', 3),
      organizationId: null,
      code: 'IT_SYSTEM_ROLE',
      name: 'IT_SYSTEM_ROLE',
      isSystem: true,
    },
  },
];

function organizationRows(scope: 'A' | 'B'): FixtureRow[] {
  const id = (n: number) => fixtureId(scope, n);
  const org = id(1);
  const user = fixtureId('global', 1);
  const audit = { updatedAt: NOW, createdById: user };
  const row = (key: string, table: string, values: Values): FixtureRow => ({
    scope,
    key,
    table,
    values,
  });

  return [
    row('organization', 'Organization', {
      id: org,
      name: `Integration Org ${scope}`,
      updatedAt: NOW,
    }),
    row('orgRole', 'Role', {
      id: id(2),
      organizationId: org,
      code: 'IT_ORG_ROLE',
      name: 'IT_ORG_ROLE',
    }),
    row('customer', 'Customer', {
      id: id(3),
      organizationId: org,
      name: 'Test Customer',
      ...audit,
    }),
    row('vendor', 'Vendor', {
      id: id(4),
      organizationId: org,
      vendorType: 'SUPPLIER',
      name: 'Test Vendor',
      ...audit,
    }),
    row('employee', 'Employee', {
      id: id(5),
      organizationId: org,
      userId: fixtureId('global', 2),
      employeeNo: 'E001',
      name: 'Test Employee',
      ...audit,
    }),
    row('costCategory', 'CostCategory', {
      id: id(6),
      organizationId: org,
      code: 'PRJ_MATERIAL',
      name: '材料',
      applicableScope: 'PROJECT',
      ...audit,
    }),
    row('bankAccount', 'BankAccount', {
      id: id(7),
      organizationId: org,
      type: 'BANK',
      name: 'Test Bank Account',
      openingBalance: '0.00',
      openingDate: '2026-01-01',
      ...audit,
    }),
    row('project', 'Project', {
      id: id(8),
      organizationId: org,
      projectCode: 'P001',
      name: 'Test Project',
      customerId: id(3),
      retentionRate: '0.0500',
      physicalProgressPercent: '50.00',
      status: 'ACTIVE',
      ...audit,
    }),
    row('contract', 'Contract', {
      id: id(9),
      organizationId: org,
      projectId: id(8),
      contractNo: 'C001',
      type: 'OWNER_CONTRACT',
      title: 'Owner contract',
      amount: '1000000.00',
      taxAmount: '50000.00',
      status: 'SIGNED',
      ...audit,
    }),
    row('changeOrder', 'ChangeOrder', {
      id: id(10),
      organizationId: org,
      projectId: id(8),
      contractId: id(9),
      changeOrderNo: 'CO1',
      type: 'ADDITION',
      description: 'Addition',
      amount: '100000.00',
      billedAmount: '30000.00',
      requestDate: TODAY,
      status: 'APPROVED',
      ...audit,
    }),
    row('changeOrder2', 'ChangeOrder', {
      id: id(11),
      organizationId: org,
      projectId: id(8),
      contractId: id(9),
      changeOrderNo: 'CO2',
      type: 'DEDUCTION',
      description: 'Deduction',
      amount: '50000.00',
      billedAmount: '0.00',
      requestDate: TODAY,
      status: 'APPROVED',
      ...audit,
    }),
    row('expense', 'Expense', {
      id: id(12),
      organizationId: org,
      scope: 'PROJECT',
      projectId: id(8),
      vendorId: id(4),
      advancedByEmployeeId: id(5),
      expenseNo: 'EX-0001',
      expenseDate: TODAY,
      costCategoryId: id(6),
      subtotalAmount: '1000.00',
      taxAmount: '50.00',
      totalAmount: '1050.00',
      documentType: 'UNIFORM_INVOICE',
      inputTaxDeductible: true,
      status: 'POSTED',
      submittedAt: NOW,
      submittedById: user,
      postedAt: NOW,
      postedById: user,
      clientRequestId: id(101),
      ...audit,
    }),
    row('expenseDraft', 'Expense', {
      id: id(13),
      organizationId: org,
      scope: 'OVERHEAD',
      projectId: null,
      vendorId: null,
      expenseDate: TODAY,
      costCategoryId: id(6),
      subtotalAmount: '100.00',
      taxAmount: '0.00',
      totalAmount: '100.00',
      documentType: 'NONE',
      status: 'DRAFT',
      ...audit,
    }),
    row('expenseItem', 'ExpenseItem', {
      id: id(14),
      organizationId: org,
      expenseId: id(12),
      costCategoryId: id(6),
      amount: '1000.00',
      taxAmount: '50.00',
      costAmount: '1000.00',
      costRuleVersion: 1,
    }),
    row('payable', 'Payable', {
      id: id(15),
      organizationId: org,
      sourceType: 'EXPENSE',
      payeeType: 'EMPLOYEE',
      employeeId: id(5),
      expenseId: id(12),
      scope: 'PROJECT',
      projectId: id(8),
      payableNo: 'AP-0001',
      originalAmount: '1050.00',
      paidAmount: '1000.00',
      outstandingAmount: '50.00',
      status: 'PARTIALLY_PAID',
      ...audit,
    }),
    row('payable2', 'Payable', {
      id: id(16),
      organizationId: org,
      sourceType: 'MANUAL',
      payeeType: 'VENDOR',
      vendorId: id(4),
      scope: 'OVERHEAD',
      projectId: null,
      payableNo: 'AP-0002',
      originalAmount: '500.00',
      paidAmount: '0.00',
      outstandingAmount: '500.00',
      status: 'OPEN',
      ...audit,
    }),
    row('payment', 'Payment', {
      id: id(17),
      organizationId: org,
      payeeType: 'EMPLOYEE',
      employeeId: id(5),
      bankAccountId: id(7),
      paymentNo: 'PAY-0001',
      paymentDate: TODAY,
      method: 'BANK_TRANSFER',
      paymentAmount: '1000.00',
      allocatedAmount: '1000.00',
      unallocatedAmount: '0.00',
      feeAmount: '30.00',
      feeBearer: 'COMPANY',
      bankOutflowAmount: '1030.00',
      payeeReceivedAmount: '1000.00',
      clearingStatus: 'NOT_APPLICABLE',
      status: 'POSTED',
      clientRequestId: id(102),
      ...audit,
    }),
    row('payablePayment', 'PayablePayment', {
      id: id(18),
      organizationId: org,
      paymentId: id(17),
      payableId: id(15),
      amount: '1000.00',
      createdById: user,
    }),
    row('progressBilling', 'ProgressBilling', {
      id: id(19),
      organizationId: org,
      projectId: id(8),
      contractId: id(9),
      periodNo: 1,
      billingNo: 'PB-0001',
      grossAmount: '200000.00',
      changeOrderAmount: '30000.00',
      retentionAmount: '10000.00',
      deductionAmount: '0.00',
      billingAmount: '220000.00',
      taxAmount: '11000.00',
      totalAmount: '231000.00',
      billingDate: TODAY,
      status: 'INVOICED',
      invoicedAt: NOW,
      ...audit,
    }),
    row('progressBilling2', 'ProgressBilling', {
      id: id(20),
      organizationId: org,
      projectId: id(8),
      contractId: id(9),
      periodNo: 2,
      billingNo: 'PB-0002',
      grossAmount: '0.00',
      changeOrderAmount: '0.00',
      retentionAmount: '0.00',
      deductionAmount: '0.00',
      billingAmount: '0.00',
      taxAmount: '0.00',
      totalAmount: '0.00',
      billingDate: TODAY,
      status: 'DRAFT',
      ...audit,
    }),
    row('pbco', 'ProgressBillingChangeOrder', {
      id: id(21),
      organizationId: org,
      progressBillingId: id(19),
      changeOrderId: id(10),
      amount: '30000.00',
      createdById: user,
    }),
    row('retentionRelease', 'RetentionRelease', {
      id: id(22),
      organizationId: org,
      projectId: id(8),
      requestDate: TODAY,
      amount: '10000.00',
      status: 'INVOICED',
      ...audit,
    }),
    row('retentionRelease2', 'RetentionRelease', {
      id: id(23),
      organizationId: org,
      projectId: id(8),
      requestDate: TODAY,
      amount: '5000.00',
      status: 'DRAFT',
      ...audit,
    }),
    row('receivable', 'Receivable', {
      id: id(24),
      organizationId: org,
      customerId: id(3),
      projectId: id(8),
      sourceType: 'PROGRESS_BILLING',
      progressBillingId: id(19),
      receivableNo: 'AR-0001',
      originalAmount: '231000.00',
      paidAmount: '100000.00',
      outstandingAmount: '131000.00',
      status: 'PARTIALLY_PAID',
      ...audit,
    }),
    row('receivable2', 'Receivable', {
      id: id(25),
      organizationId: org,
      customerId: id(3),
      projectId: id(8),
      sourceType: 'RETENTION_RELEASE',
      retentionReleaseId: id(22),
      receivableNo: 'AR-0002',
      originalAmount: '10000.00',
      paidAmount: '0.00',
      outstandingAmount: '10000.00',
      status: 'UNPAID',
      ...audit,
    }),
    row('receipt', 'Receipt', {
      id: id(26),
      organizationId: org,
      customerId: id(3),
      projectId: id(8),
      bankAccountId: id(7),
      receiptNo: 'RC-0001',
      receiptDate: TODAY,
      method: 'BANK_TRANSFER',
      receivedAmount: '100000.00',
      allocatedAmount: '100000.00',
      unallocatedAmount: '0.00',
      feeAmount: '15.00',
      feeBearer: 'COMPANY',
      bankInflowAmount: '99985.00',
      clearingStatus: 'NOT_APPLICABLE',
      status: 'POSTED',
      clientRequestId: id(103),
      ...audit,
    }),
    row('receiptAllocation', 'ReceiptAllocation', {
      id: id(27),
      organizationId: org,
      receiptId: id(26),
      receivableId: id(24),
      amount: '100000.00',
      createdById: user,
    }),
    row('revenueEntry', 'RevenueEntry', {
      id: id(28),
      organizationId: org,
      projectId: id(8),
      progressBillingId: id(19),
      sourceKey: `PB_INVOICE:${id(19)}`,
      sourceType: 'PROGRESS_BILLING',
      recognitionDate: TODAY,
      amount: '220000.00',
      taxAmount: '11000.00',
      status: 'POSTED',
      clientRequestId: id(104),
      ...audit,
    }),
    row('bankTransaction', 'BankTransaction', {
      id: id(29),
      organizationId: org,
      bankAccountId: id(7),
      txnDate: TODAY,
      direction: 'OUTFLOW',
      amount: '1000.00',
      sourceType: 'PAYMENT',
      sourceId: id(17),
      status: 'POSTED',
      ...audit,
    }),
    row('pettyCash', 'PettyCashTransaction', {
      id: id(30),
      organizationId: org,
      bankAccountId: id(7),
      custodianId: user,
      type: 'SPEND',
      txnDate: TODAY,
      amount: '100.00',
      expenseId: id(13),
      ...audit,
    }),
    row('dailyLog', 'ProjectDailyLog', {
      id: id(31),
      organizationId: org,
      projectId: id(8),
      logDate: TODAY,
      content: 'Site log',
      clientRequestId: id(105),
      ...audit,
    }),
    row('auditLog', 'AuditLog', {
      id: id(32),
      organizationId: org,
      userId: user,
      action: 'CREATE',
      entityType: 'Expense',
      entityId: id(12),
      diff: '{"schemaVersion":1,"changes":{}}',
      requestId: 'it-request',
    }),
  ];
}

/** Insertion order respects foreign keys: global rows, then organization A, then B. */
export const FIXTURE_ROWS: readonly FixtureRow[] = Object.freeze([
  ...GLOBAL_ROWS,
  ...organizationRows('A'),
  ...organizationRows('B'),
]);

export function fixtureRow(scope: Scope, key: string): FixtureRow {
  const found = FIXTURE_ROWS.find((r) => r.scope === scope && r.key === key);
  if (!found) throw new Error(`fixture ${scope}.${key} not found`);
  return found;
}

export function resolveValue(value: Value): string | number | boolean | null {
  if (!isRef(value)) return value;
  const [scope, key, field = 'id'] = value.ref;
  const resolved = fixtureRow(scope, key).values[field];
  if (resolved === undefined || isRef(resolved)) {
    throw new Error(`fixture ${scope}.${key}.${field} cannot be resolved`);
  }
  return resolved;
}

/**
 * Column overrides applied to every copy, so a copied row does not collide with a unique key of
 * its source row by accident. A case that tests a unique key sets the colliding value again.
 */
export function copyResets(scope: Scope, table: string): Values {
  const resets: Readonly<Record<string, Values>> = {
    Role: { code: 'IT_COPY_ROLE' },
    Employee: { employeeNo: null, userId: null },
    Project: { projectCode: 'P-COPY' },
    Contract: { type: 'SUBCONTRACT' },
    ChangeOrder: { changeOrderNo: 'CO-COPY' },
    Expense: { clientRequestId: null },
    Payable: { expenseId: null },
    Payment: { clientRequestId: null },
    PayablePayment: { payableId: ref(scope, 'payable2') },
    ProgressBilling: { periodNo: 99 },
    ProgressBillingChangeOrder: { changeOrderId: ref(scope, 'changeOrder2') },
    Receivable: { sourceType: 'OTHER', progressBillingId: null, retentionReleaseId: null },
    Receipt: { clientRequestId: null },
    ReceiptAllocation: { receivableId: ref(scope, 'receivable2') },
    RevenueEntry: { sourceKey: null, clientRequestId: null },
    ProjectDailyLog: { clientRequestId: null },
  };
  return resets[table] ?? {};
}
