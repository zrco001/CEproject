import { describe, expect, it } from 'vitest';
import {
  ChangeOrderStatus,
  ClearingStatus,
  ExpenseStatus,
  PayableStatus,
  ProgressBillingStatus,
  ReceivableStatus,
  RetentionReleaseStatus,
  RevenueStatus,
  SettlementStatus,
  AllocationState,
  enumValues,
} from '../../enums/index.js';
import {
  ALL_STATE_MACHINES,
  IllegalStateTransitionError,
  StateMachineDefinitionError,
  allocationStateMachine,
  assertTransition,
  availableEvents,
  changeOrderStateMachine,
  checkClearingStateMachine,
  defineStateMachine,
  expenseStateMachine,
  initialState,
  isDeletable,
  isTerminal,
  payableStateMachine,
  progressBillingStateMachine,
  receivableStateMachine,
  resolveTransition,
  retentionReleaseStateMachine,
  revenueEntryStateMachine,
  settlementStateMachine,
} from '../index.js';

const sorted = (values: readonly string[]): string[] => [...values].sort();

describe('state machines match persisted enums', () => {
  it.each([
    [expenseStateMachine, enumValues(ExpenseStatus)],
    [payableStateMachine, enumValues(PayableStatus)],
    [settlementStateMachine, enumValues(SettlementStatus)],
    [allocationStateMachine, enumValues(AllocationState)],
    [checkClearingStateMachine, enumValues(ClearingStatus)],
    [receivableStateMachine, enumValues(ReceivableStatus).filter((s) => s !== 'OVERDUE')],
    [progressBillingStateMachine, enumValues(ProgressBillingStatus)],
    [changeOrderStateMachine, enumValues(ChangeOrderStatus)],
    [retentionReleaseStateMachine, enumValues(RetentionReleaseStatus)],
    [revenueEntryStateMachine, enumValues(RevenueStatus)],
  ] as const)('%s', (machine, values) => {
    expect(sorted(machine.states)).toEqual(sorted(values));
  });

  it('defines all ten machines from §7', () => {
    expect(ALL_STATE_MACHINES).toHaveLength(10);
  });

  it('never models OVERDUE as a persisted receivable state', () => {
    expect(receivableStateMachine.states).not.toContain('OVERDUE');
  });
});

describe('Expense (§7.1)', () => {
  const m = expenseStateMachine;

  it('supports the DRAFT → SUBMITTED → POSTED → VOID happy path', () => {
    expect(initialState(m, 'CREATE')).toBe('DRAFT');
    expect(resolveTransition(m, 'DRAFT', 'SUBMIT').to).toBe('SUBMITTED');
    expect(resolveTransition(m, 'SUBMITTED', 'POST').to).toBe('POSTED');
    expect(resolveTransition(m, 'POSTED', 'VOID').to).toBe('VOID');
  });

  it('allows quick-expense creation directly into SUBMITTED', () => {
    expect(initialState(m, 'CREATE_AND_SUBMIT')).toBe('SUBMITTED');
  });

  it('allows the reviewer to return SUBMITTED to DRAFT', () => {
    const t = resolveTransition(m, 'SUBMITTED', 'RETURN');
    expect(t.to).toBe('DRAFT');
    expect(t.guard).toBe('rejectionReasonProvided');
  });

  it.each([
    ['DRAFT', 'POST'],
    ['DRAFT', 'VOID'],
    ['SUBMITTED', 'VOID'],
    ['POSTED', 'RETURN'],
    ['POSTED', 'SUBMIT'],
    ['VOID', 'POST'],
  ] as const)('rejects %s + %s', (from, event) => {
    expect(() => resolveTransition(m, from, event)).toThrow(IllegalStateTransitionError);
  });

  it('only DRAFT is deletable and VOID is terminal', () => {
    expect(isDeletable(m, 'DRAFT')).toBe(true);
    expect(isDeletable(m, 'POSTED')).toBe(false);
    expect(isTerminal(m, 'VOID')).toBe(true);
    expect(availableEvents(m, 'SUBMITTED')).toEqual(['RETURN', 'POST']);
  });
});

describe('Payable / Receivable derived statuses (§7.2, §7.4)', () => {
  it('allows reversal edges caused by allocation void, payment void or bounced checks', () => {
    expect(() => {
      assertTransition(payableStateMachine, 'PAID', 'PARTIALLY_PAID');
    }).not.toThrow();
    expect(() => {
      assertTransition(payableStateMachine, 'PAID', 'OPEN');
    }).not.toThrow();
    expect(() => {
      assertTransition(receivableStateMachine, 'PAID', 'UNPAID');
    }).not.toThrow();
  });

  it('only voids when nothing has been paid', () => {
    expect(() => {
      assertTransition(payableStateMachine, 'PARTIALLY_PAID', 'VOID');
    }).toThrow(IllegalStateTransitionError);
    expect(() => {
      assertTransition(receivableStateMachine, 'PAID', 'VOID');
    }).toThrow(IllegalStateTransitionError);
  });

  it('APPLY_PAYMENT from OPEN is ambiguous by design (target derived from amounts)', () => {
    expect(() => resolveTransition(payableStateMachine, 'OPEN', 'APPLY_PAYMENT')).toThrow(
      IllegalStateTransitionError,
    );
  });
});

describe('Allocation and check clearing (§7.3.1, §7.3.2)', () => {
  it('voids a single allocation', () => {
    expect(resolveTransition(allocationStateMachine, 'ACTIVE', 'VOID').to).toBe('VOIDED');
    expect(isTerminal(allocationStateMachine, 'VOIDED')).toBe(true);
  });

  it('clears or bounces only pending checks', () => {
    const m = checkClearingStateMachine;
    expect(initialState(m, 'CREATE_CHECK')).toBe('PENDING');
    expect(initialState(m, 'CREATE_NON_CHECK')).toBe('NOT_APPLICABLE');
    expect(resolveTransition(m, 'PENDING', 'CLEAR').to).toBe('CLEARED');
    expect(resolveTransition(m, 'PENDING', 'BOUNCE').to).toBe('BOUNCED');
    expect(() => resolveTransition(m, 'CLEARED', 'BOUNCE')).toThrow(IllegalStateTransitionError);
    expect(() => resolveTransition(m, 'NOT_APPLICABLE', 'CLEAR')).toThrow(
      IllegalStateTransitionError,
    );
    expect(() => resolveTransition(m, 'BOUNCED', 'CLEAR')).toThrow(IllegalStateTransitionError);
  });

  it('settlement documents can only be voided once', () => {
    expect(resolveTransition(settlementStateMachine, 'POSTED', 'VOID').to).toBe('VOID');
    expect(() => resolveTransition(settlementStateMachine, 'VOID', 'VOID')).toThrow(
      IllegalStateTransitionError,
    );
  });
});

describe('ProgressBilling / ChangeOrder / Retention / Revenue (§7.5–§7.7)', () => {
  it('requires approval before invoicing', () => {
    expect(() => resolveTransition(progressBillingStateMachine, 'SUBMITTED', 'INVOICE')).toThrow();
    expect(resolveTransition(progressBillingStateMachine, 'APPROVED', 'INVOICE').to).toBe(
      'INVOICED',
    );
    expect(isDeletable(progressBillingStateMachine, 'DRAFT')).toBe(true);
    expect(() => resolveTransition(progressBillingStateMachine, 'DRAFT', 'VOID')).toThrow();
  });

  it('cancels an approved change order only with the billedAmountIsZero guard', () => {
    expect(resolveTransition(changeOrderStateMachine, 'APPROVED', 'CANCEL').guard).toBe(
      'billedAmountIsZero',
    );
    expect(() => resolveTransition(changeOrderStateMachine, 'REJECTED', 'SUBMIT')).toThrow();
  });

  it('retention release invoices within unclaimed retention', () => {
    expect(resolveTransition(retentionReleaseStateMachine, 'DRAFT', 'INVOICE').guard).toBe(
      'amountWithinUnclaimedRetention',
    );
  });

  it('revenue entries are created POSTED and can be voided', () => {
    expect(initialState(revenueEntryStateMachine, 'RECOGNIZE_PROGRESS_BILLING')).toBe('POSTED');
    expect(resolveTransition(revenueEntryStateMachine, 'POSTED', 'VOID').to).toBe('VOID');
  });
});

describe('defineStateMachine validation', () => {
  it('rejects unknown states, terminal exits and unreachable states', () => {
    expect(() =>
      defineStateMachine({
        name: 'Bad',
        states: ['A', 'B'],
        creations: [{ event: 'C', to: 'A' }],
        transitions: [{ from: 'A', event: 'GO', to: 'B' }],
        terminal: ['A'],
        deletable: [],
      }),
    ).toThrow(StateMachineDefinitionError);

    expect(() =>
      defineStateMachine({
        name: 'Unreachable',
        states: ['A', 'B'],
        creations: [{ event: 'C', to: 'A' }],
        transitions: [],
        terminal: [],
        deletable: [],
      }),
    ).toThrow(/unreachable/);
  });
});
