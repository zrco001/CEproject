import type { Money } from '../money/index.js';
import { isBeforeBusinessDate, type BusinessDate } from '../date/index.js';
import type {
  PaymentMethod,
  PaymentStatus,
  PersistedReceivableStatus,
  ReceivableStatus,
} from '../enums/index.js';

export class SettlementAmountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettlementAmountError';
  }
}

/**
 * Payment progress from the original amount and the sum of ACTIVE allocations.
 * Always recompute from allocations; never adjust incrementally (§7.2).
 */
export function deriveSettlementProgress(original: Money, paid: Money): PaymentStatus {
  if (!original.isPositive()) {
    throw new SettlementAmountError('Original amount must be positive.');
  }
  if (paid.isNegative() || paid.greaterThan(original)) {
    throw new SettlementAmountError('Paid amount must be between 0 and the original amount.');
  }
  if (paid.isZero()) {
    return 'UNPAID';
  }
  return paid.equals(original) ? 'PAID' : 'PARTIALLY_PAID';
}

export function payableStatusFor(progress: PaymentStatus): 'OPEN' | 'PARTIALLY_PAID' | 'PAID' {
  return progress === 'UNPAID' ? 'OPEN' : progress;
}

/** Display status for receivables: OVERDUE is computed, never stored (TD-12). */
export function receivableDisplayStatus(
  status: PersistedReceivableStatus,
  dueDate: BusinessDate | null,
  today: BusinessDate,
): ReceivableStatus {
  const open = status === 'UNPAID' || status === 'PARTIALLY_PAID';
  return open && dueDate !== null && isBeforeBusinessDate(dueDate, today) ? 'OVERDUE' : status;
}

/** Initial clearing status for a new Payment / Receipt (§3.5 Clearing). */
export function initialClearingStatus(method: PaymentMethod): 'NOT_APPLICABLE' | 'PENDING' {
  return method === 'CHECK' ? 'PENDING' : 'NOT_APPLICABLE';
}
