import { describe, expect, it } from 'vitest';
import { parseBusinessDate } from '../date/index.js';
import { Money } from '../money/index.js';
import {
  SettlementAmountError,
  deriveSettlementProgress,
  initialClearingStatus,
  payableStatusFor,
  receivableDisplayStatus,
} from './settlement-progress.js';

describe('deriveSettlementProgress', () => {
  const original = Money.of('100000');

  it('derives status from the sum of active allocations', () => {
    expect(deriveSettlementProgress(original, Money.zero())).toBe('UNPAID');
    expect(deriveSettlementProgress(original, Money.of('50000'))).toBe('PARTIALLY_PAID');
    expect(deriveSettlementProgress(original, Money.of('100000'))).toBe('PAID');
  });

  it('reflects a voided allocation by recomputing from remaining allocations', () => {
    const active = [Money.of('30000'), Money.of('20000')];
    expect(deriveSettlementProgress(original, Money.sum(active))).toBe('PARTIALLY_PAID');
    const afterVoidingFirst = active.slice(1);
    expect(original.minus(Money.sum(afterVoidingFirst)).toMoneyString()).toBe('80000.00');
  });

  it('rejects over-payment and invalid originals', () => {
    expect(() => deriveSettlementProgress(original, Money.of('100000.01'))).toThrow(
      SettlementAmountError,
    );
    expect(() => deriveSettlementProgress(Money.zero(), Money.zero())).toThrow(
      SettlementAmountError,
    );
  });

  it('maps UNPAID to the Payable OPEN status', () => {
    expect(payableStatusFor('UNPAID')).toBe('OPEN');
    expect(payableStatusFor('PAID')).toBe('PAID');
  });
});

describe('receivableDisplayStatus', () => {
  const today = parseBusinessDate('2026-10-07');

  it('computes OVERDUE at read time only for outstanding receivables', () => {
    expect(receivableDisplayStatus('UNPAID', parseBusinessDate('2026-10-06'), today)).toBe(
      'OVERDUE',
    );
    expect(receivableDisplayStatus('PARTIALLY_PAID', parseBusinessDate('2026-10-01'), today)).toBe(
      'OVERDUE',
    );
    expect(receivableDisplayStatus('UNPAID', parseBusinessDate('2026-10-07'), today)).toBe(
      'UNPAID',
    );
    expect(receivableDisplayStatus('PAID', parseBusinessDate('2026-01-01'), today)).toBe('PAID');
    expect(receivableDisplayStatus('UNPAID', null, today)).toBe('UNPAID');
  });
});

describe('initialClearingStatus', () => {
  it('only checks start as PENDING', () => {
    expect(initialClearingStatus('CHECK')).toBe('PENDING');
    expect(initialClearingStatus('BANK_TRANSFER')).toBe('NOT_APPLICABLE');
    expect(initialClearingStatus('CASH')).toBe('NOT_APPLICABLE');
  });
});
