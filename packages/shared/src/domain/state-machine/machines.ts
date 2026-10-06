/** State machines from ARCHITECTURE.md §7 (v0.3). */
import { defineStateMachine } from './state-machine.js';

/** §7.1 Expense: DRAFT ⇄ SUBMITTED → POSTED → VOID. */
export const expenseStateMachine = defineStateMachine({
  name: 'Expense',
  states: ['DRAFT', 'SUBMITTED', 'POSTED', 'VOID'],
  creations: [
    { event: 'CREATE', to: 'DRAFT' },
    { event: 'CREATE_AND_SUBMIT', to: 'SUBMITTED' },
  ],
  transitions: [
    { from: 'DRAFT', event: 'SUBMIT', to: 'SUBMITTED' },
    { from: 'SUBMITTED', event: 'RETURN', to: 'DRAFT', guard: 'rejectionReasonProvided' },
    {
      from: 'SUBMITTED',
      event: 'POST',
      to: 'POSTED',
      guard: 'vendorPresentAndPermissionExpensePost',
    },
    { from: 'POSTED', event: 'VOID', to: 'VOID', guard: 'payableHasNoActiveAllocations' },
  ],
  terminal: ['VOID'],
  deletable: ['DRAFT'],
});

/** §7.2 Payable — status is derived from active allocations; events describe the cause. */
export const payableStateMachine = defineStateMachine({
  name: 'Payable',
  states: ['OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID'],
  creations: [
    { event: 'CREATE_FROM_EXPENSE', to: 'OPEN' },
    { event: 'CREATE_MANUAL', to: 'OPEN' },
  ],
  transitions: [
    { from: 'OPEN', event: 'APPLY_PAYMENT', to: 'PARTIALLY_PAID' },
    { from: 'OPEN', event: 'APPLY_PAYMENT', to: 'PAID' },
    { from: 'PARTIALLY_PAID', event: 'APPLY_PAYMENT', to: 'PAID' },
    { from: 'PARTIALLY_PAID', event: 'REVERSE_PAYMENT', to: 'OPEN' },
    { from: 'PAID', event: 'REVERSE_PAYMENT', to: 'PARTIALLY_PAID' },
    { from: 'PAID', event: 'REVERSE_PAYMENT', to: 'OPEN' },
    { from: 'OPEN', event: 'VOID', to: 'VOID', guard: 'sourceExpenseVoided' },
  ],
  terminal: ['VOID'],
  deletable: [],
});

/** §7.3 Payment / Receipt document status. */
export const settlementStateMachine = defineStateMachine({
  name: 'Settlement',
  states: ['POSTED', 'VOID'],
  creations: [{ event: 'CREATE', to: 'POSTED' }],
  transitions: [{ from: 'POSTED', event: 'VOID', to: 'VOID', guard: 'voidReasonProvided' }],
  terminal: ['VOID'],
  deletable: [],
});

/** §7.3.1 PayablePayment / ReceiptAllocation (ACTIVE ⇔ voidedAt IS NULL). */
export const allocationStateMachine = defineStateMachine({
  name: 'Allocation',
  states: ['ACTIVE', 'VOIDED'],
  creations: [{ event: 'ALLOCATE', to: 'ACTIVE' }],
  transitions: [{ from: 'ACTIVE', event: 'VOID', to: 'VOIDED', guard: 'voidReasonProvided' }],
  terminal: ['VOIDED'],
  deletable: [],
});

/** §7.3.2 Check clearing lifecycle. */
export const checkClearingStateMachine = defineStateMachine({
  name: 'CheckClearing',
  states: ['NOT_APPLICABLE', 'PENDING', 'CLEARED', 'BOUNCED'],
  creations: [
    { event: 'CREATE_NON_CHECK', to: 'NOT_APPLICABLE' },
    { event: 'CREATE_CHECK', to: 'PENDING' },
  ],
  transitions: [
    {
      from: 'PENDING',
      event: 'CLEAR',
      to: 'CLEARED',
      guard: 'documentPostedAndClearedDateProvided',
    },
    {
      from: 'PENDING',
      event: 'BOUNCE',
      to: 'BOUNCED',
      guard: 'documentPostedAndBounceReasonProvided',
    },
  ],
  terminal: ['NOT_APPLICABLE', 'CLEARED', 'BOUNCED'],
  deletable: [],
});

/** §7.4 Receivable — OVERDUE is display-only and therefore not a state here. */
export const receivableStateMachine = defineStateMachine({
  name: 'Receivable',
  states: ['UNPAID', 'PARTIALLY_PAID', 'PAID', 'VOID'],
  creations: [
    { event: 'CREATE_FROM_PROGRESS_BILLING', to: 'UNPAID' },
    { event: 'CREATE_FROM_RETENTION_RELEASE', to: 'UNPAID' },
    { event: 'CREATE_OTHER', to: 'UNPAID' },
  ],
  transitions: [
    { from: 'UNPAID', event: 'APPLY_RECEIPT', to: 'PARTIALLY_PAID' },
    { from: 'UNPAID', event: 'APPLY_RECEIPT', to: 'PAID' },
    { from: 'PARTIALLY_PAID', event: 'APPLY_RECEIPT', to: 'PAID' },
    { from: 'PARTIALLY_PAID', event: 'REVERSE_RECEIPT', to: 'UNPAID' },
    { from: 'PAID', event: 'REVERSE_RECEIPT', to: 'PARTIALLY_PAID' },
    { from: 'PAID', event: 'REVERSE_RECEIPT', to: 'UNPAID' },
    { from: 'UNPAID', event: 'VOID', to: 'VOID', guard: 'sourceVoidedAndNoActiveAllocations' },
  ],
  terminal: ['VOID'],
  deletable: [],
});

/** §7.5 ProgressBilling. */
export const progressBillingStateMachine = defineStateMachine({
  name: 'ProgressBilling',
  states: ['DRAFT', 'SUBMITTED', 'APPROVED', 'INVOICED', 'VOID'],
  creations: [{ event: 'CREATE', to: 'DRAFT' }],
  transitions: [
    { from: 'DRAFT', event: 'SUBMIT', to: 'SUBMITTED' },
    { from: 'SUBMITTED', event: 'RETURN', to: 'DRAFT' },
    { from: 'SUBMITTED', event: 'APPROVE', to: 'APPROVED' },
    { from: 'APPROVED', event: 'INVOICE', to: 'INVOICED', guard: 'invoiceNumberAndDateProvided' },
    { from: 'SUBMITTED', event: 'VOID', to: 'VOID' },
    { from: 'APPROVED', event: 'VOID', to: 'VOID' },
    { from: 'INVOICED', event: 'VOID', to: 'VOID', guard: 'receivableHasNoActiveAllocations' },
  ],
  terminal: ['VOID'],
  deletable: ['DRAFT'],
});

/** §7.6 ChangeOrder. */
export const changeOrderStateMachine = defineStateMachine({
  name: 'ChangeOrder',
  states: ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'],
  creations: [{ event: 'CREATE', to: 'DRAFT' }],
  transitions: [
    { from: 'DRAFT', event: 'SUBMIT', to: 'SUBMITTED' },
    { from: 'SUBMITTED', event: 'RETURN', to: 'DRAFT' },
    { from: 'SUBMITTED', event: 'APPROVE', to: 'APPROVED', guard: 'permissionChangeOrderApprove' },
    { from: 'SUBMITTED', event: 'REJECT', to: 'REJECTED' },
    { from: 'DRAFT', event: 'CANCEL', to: 'CANCELLED' },
    { from: 'SUBMITTED', event: 'CANCEL', to: 'CANCELLED' },
    { from: 'APPROVED', event: 'CANCEL', to: 'CANCELLED', guard: 'billedAmountIsZero' },
  ],
  terminal: ['REJECTED', 'CANCELLED'],
  deletable: [],
});

/** §7.7 RetentionRelease. */
export const retentionReleaseStateMachine = defineStateMachine({
  name: 'RetentionRelease',
  states: ['DRAFT', 'INVOICED', 'VOID'],
  creations: [{ event: 'CREATE', to: 'DRAFT' }],
  transitions: [
    { from: 'DRAFT', event: 'INVOICE', to: 'INVOICED', guard: 'amountWithinUnclaimedRetention' },
    { from: 'INVOICED', event: 'VOID', to: 'VOID', guard: 'receivableHasNoActiveAllocations' },
  ],
  terminal: ['VOID'],
  deletable: ['DRAFT'],
});

/** §7.7 RevenueEntry. */
export const revenueEntryStateMachine = defineStateMachine({
  name: 'RevenueEntry',
  states: ['POSTED', 'VOID'],
  creations: [
    { event: 'RECOGNIZE_PROGRESS_BILLING', to: 'POSTED' },
    { event: 'CREATE_OTHER_INCOME', to: 'POSTED' },
    { event: 'CREATE_ADJUSTMENT', to: 'POSTED' },
  ],
  transitions: [
    {
      from: 'POSTED',
      event: 'VOID',
      to: 'VOID',
      guard: 'manualEntryOrSourceProgressBillingVoided',
    },
  ],
  terminal: ['VOID'],
  deletable: [],
});

export const ALL_STATE_MACHINES = [
  expenseStateMachine,
  payableStateMachine,
  settlementStateMachine,
  allocationStateMachine,
  checkClearingStateMachine,
  receivableStateMachine,
  progressBillingStateMachine,
  changeOrderStateMachine,
  retentionReleaseStateMachine,
  revenueEntryStateMachine,
] as const;
