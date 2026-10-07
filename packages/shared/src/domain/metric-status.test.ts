import { describe, expect, it } from 'vitest';
import {
  BankTxnStatus,
  ChangeOrderStatus,
  ClearingStatus,
  ContractStatus,
  ExpenseStatus,
  PayableStatus,
  ProgressBillingStatus,
  ProjectStatus,
  ReceivableStatus,
  RetentionReleaseStatus,
  RevenueStatus,
  SettlementStatus,
  enumValues,
} from '../enums/index.js';
import { METRIC_STATUS, statusFilter, type MetricDefinition } from './metric-status.js';

/** Which enum each filter key classifies. */
const ENUM_BY_FILTER_KEY: Record<string, readonly string[]> = {
  contract: enumValues(ContractStatus),
  changeOrder: enumValues(ChangeOrderStatus),
  progressBilling: enumValues(ProgressBillingStatus),
  receivable: enumValues(ReceivableStatus),
  receipt: enumValues(SettlementStatus),
  payment: enumValues(SettlementStatus),
  settlement: enumValues(SettlementStatus),
  clearing: enumValues(ClearingStatus),
  revenueEntry: enumValues(RevenueStatus),
  retentionRelease: enumValues(RetentionReleaseStatus),
  expense: enumValues(ExpenseStatus),
  payable: enumValues(PayableStatus),
  project: enumValues(ProjectStatus),
  bankTransaction: enumValues(BankTxnStatus),
};

const metrics = Object.entries(METRIC_STATUS) as [string, MetricDefinition][];

describe('metric status whitelists (ADR-18)', () => {
  it.each(metrics)('%s classifies every enum value exactly once', (_name, metric) => {
    for (const [key, filter] of Object.entries(metric.filters)) {
      const values = ENUM_BY_FILTER_KEY[key];
      expect(values, `unknown filter key "${key}"`).toBeDefined();
      expect([...filter.included, ...filter.excluded].sort()).toEqual([...(values ?? [])].sort());
      expect(filter.included.length).toBeGreaterThan(0);
    }
  });

  it('never counts VOID or the display-only OVERDUE status', () => {
    for (const [, metric] of metrics) {
      for (const filter of Object.values(metric.filters)) {
        expect(filter.included).not.toContain('VOID');
        expect(filter.included).not.toContain('OVERDUE');
      }
    }
  });

  it('actualCost counts POSTED expenses only', () => {
    expect(METRIC_STATUS.actualCost.filters.expense.included).toEqual(['POSTED']);
  });

  it('retentionHeld counts APPROVED and INVOICED billings only', () => {
    expect([...METRIC_STATUS.retentionHeld.filters.progressBilling.included].sort()).toEqual([
      'APPROVED',
      'INVOICED',
    ]);
  });

  it('separates certified, billed and received amounts', () => {
    expect(METRIC_STATUS.totalBilled.filters.progressBilling.included).toEqual(['INVOICED']);
    expect(METRIC_STATUS.totalReceived.activeAllocationsOnly).toBe(true);
    expect(METRIC_STATUS.totalReceived.filters.clearing.included).not.toContain('BOUNCED');
  });

  it('keeps pending checks out of cash metrics', () => {
    expect(METRIC_STATUS.totalCashReceived.filters.clearing.included).not.toContain('PENDING');
    expect(METRIC_STATUS.pendingChecksPayable.filters.clearing.included).toEqual(['PENDING']);
    expect(METRIC_STATUS.pendingChecksReceivable.filters.clearing.included).toEqual(['PENDING']);
  });

  it('statusFilter rejects a filter that includes nothing', () => {
    expect(() => statusFilter<SettlementStatus>({ POSTED: 'exclude', VOID: 'exclude' })).toThrow();
  });

  it('approvedAdditions counts only APPROVED change orders and carries type=ADDITION condition', () => {
    expect(METRIC_STATUS.approvedAdditions.filters.changeOrder.included).toEqual(['APPROVED']);
    expect(METRIC_STATUS.approvedAdditions.conditions).toEqual(['changeOrder.type = ADDITION']);
  });

  it('approvedDeductions counts only APPROVED change orders and carries type=DEDUCTION condition', () => {
    expect(METRIC_STATUS.approvedDeductions.filters.changeOrder.included).toEqual(['APPROVED']);
    expect(METRIC_STATUS.approvedDeductions.conditions).toEqual(['changeOrder.type = DEDUCTION']);
  });

  it('retentionExpectedReleaseDate includes DRAFT and INVOICED releases, excludes VOID', () => {
    expect(
      [...METRIC_STATUS.retentionExpectedReleaseDate.filters.retentionRelease.included].sort(),
    ).toEqual(['DRAFT', 'INVOICED']);
    expect(METRIC_STATUS.retentionExpectedReleaseDate.filters.retentionRelease.excluded).toContain(
      'VOID',
    );
  });

  it('retentionExpectedReleaseDate documents exact source priority and Project fallback in conditions', () => {
    expect(METRIC_STATUS.retentionExpectedReleaseDate.conditions).toEqual([
      'when RetentionRelease ∈ {DRAFT, INVOICED} exists: source = RetentionRelease.expectedReleaseDate',
      'fallback: source = Project.retentionExpectedReleaseDate',
    ]);
  });
});
