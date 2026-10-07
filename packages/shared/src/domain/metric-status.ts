/**
 * Status whitelists for every financial metric (ARCHITECTURE.md §3.4, ADR-18).
 *
 * Each filter is a total classification: the `Classification<S>` mapped type forces every enum
 * value to be marked 'include' or 'exclude', so adding an enum value is a compile error until
 * every metric decides about it. Queries must use `filter.included` with SQL `IN (...)` —
 * never ordinal comparisons such as `status >= 'SUBMITTED'` or `status <> 'VOID'`.
 */
import type {
  ClearingStatus,
  ContractStatus,
  ChangeOrderStatus,
  ExpenseStatus,
  BankTxnStatus,
  PayableStatus,
  ProgressBillingStatus,
  ProjectStatus,
  ReceivableStatus,
  RetentionReleaseStatus,
  RevenueStatus,
  SettlementStatus,
} from '../enums/index.js';

export type Classification<S extends string> = { readonly [K in S]: 'include' | 'exclude' };

export interface StatusFilter<S extends string> {
  readonly classification: Classification<S>;
  readonly included: readonly S[];
  readonly excluded: readonly S[];
}

export function statusFilter<S extends string>(classification: Classification<S>): StatusFilter<S> {
  const keys = Object.keys(classification) as S[];
  const included = keys.filter((key) => classification[key] === 'include');
  if (included.length === 0) {
    throw new Error('A status filter must include at least one status.');
  }
  return Object.freeze({
    classification: Object.freeze({ ...classification }),
    included: Object.freeze(included),
    excluded: Object.freeze(keys.filter((key) => classification[key] === 'exclude')),
  });
}

// ----------------------------------------------------------------------------------------
// Reusable filters
// ----------------------------------------------------------------------------------------

const settlementPosted = statusFilter<SettlementStatus>({ POSTED: 'include', VOID: 'exclude' });

/** Money committed by the document: excludes bounced checks (§3.5 Clearing). */
const clearingEffective = statusFilter<ClearingStatus>({
  NOT_APPLICABLE: 'include',
  PENDING: 'include',
  CLEARED: 'include',
  BOUNCED: 'exclude',
});

/** Cash that actually moved through a bank / cash account. */
const clearingCashMoved = statusFilter<ClearingStatus>({
  NOT_APPLICABLE: 'include',
  PENDING: 'exclude',
  CLEARED: 'include',
  BOUNCED: 'exclude',
});

const clearingPending = statusFilter<ClearingStatus>({
  NOT_APPLICABLE: 'exclude',
  PENDING: 'include',
  CLEARED: 'exclude',
  BOUNCED: 'exclude',
});

const receivableNotVoid = statusFilter<ReceivableStatus>({
  UNPAID: 'include',
  PARTIALLY_PAID: 'include',
  PAID: 'include',
  OVERDUE: 'exclude', // never persisted
  VOID: 'exclude',
});

const receivableOutstanding = statusFilter<ReceivableStatus>({
  UNPAID: 'include',
  PARTIALLY_PAID: 'include',
  PAID: 'exclude',
  OVERDUE: 'exclude', // never persisted; overdue = outstanding AND dueDate < today
  VOID: 'exclude',
});

const payableOutstanding = statusFilter<PayableStatus>({
  OPEN: 'include',
  PARTIALLY_PAID: 'include',
  PAID: 'exclude',
  VOID: 'exclude',
});

const billingCertified = statusFilter<ProgressBillingStatus>({
  DRAFT: 'exclude',
  SUBMITTED: 'exclude',
  APPROVED: 'include',
  INVOICED: 'include',
  VOID: 'exclude',
});

// ----------------------------------------------------------------------------------------
// Metric definitions
// ----------------------------------------------------------------------------------------

export interface MetricDefinition {
  readonly label: string;
  /** Entity → status filter. Every listed entity's status must be in `included`. */
  readonly filters: Readonly<Record<string, StatusFilter<string>>>;
  /** Only allocations with voidedAt IS NULL count. */
  readonly activeAllocationsOnly?: true;
  /** Non-status conditions, for documentation and query builders. */
  readonly conditions?: readonly string[];
}

export const METRIC_STATUS = {
  // 合約
  originalContractAmount: {
    label: '原合約金額',
    filters: {
      contract: statusFilter<ContractStatus>({
        DRAFT: 'exclude',
        SIGNED: 'include',
        TERMINATED: 'exclude',
        COMPLETED: 'include',
      }),
    },
    conditions: ['contract.type = OWNER_CONTRACT'],
  },
  quotedAmount: {
    label: '報價金額（未簽約）',
    filters: {
      contract: statusFilter<ContractStatus>({
        DRAFT: 'include',
        SIGNED: 'exclude',
        TERMINATED: 'exclude',
        COMPLETED: 'exclude',
      }),
    },
  },
  approvedChangeOrders: {
    label: '已核准追加減',
    filters: {
      changeOrder: statusFilter<ChangeOrderStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'exclude',
        APPROVED: 'include',
        REJECTED: 'exclude',
        CANCELLED: 'exclude',
      }),
    },
  },
  pendingChangeOrders: {
    label: '審核中追加減',
    filters: {
      changeOrder: statusFilter<ChangeOrderStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'include',
        APPROVED: 'exclude',
        REJECTED: 'exclude',
        CANCELLED: 'exclude',
      }),
    },
  },
  approvedAdditions: {
    label: '已核准追加',
    filters: {
      changeOrder: statusFilter<ChangeOrderStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'exclude',
        APPROVED: 'include',
        REJECTED: 'exclude',
        CANCELLED: 'exclude',
      }),
    },
    conditions: ['changeOrder.type = ADDITION'],
  },
  approvedDeductions: {
    label: '已核准扣減',
    filters: {
      changeOrder: statusFilter<ChangeOrderStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'exclude',
        APPROVED: 'include',
        REJECTED: 'exclude',
        CANCELLED: 'exclude',
      }),
    },
    conditions: ['changeOrder.type = DEDUCTION'],
  },

  // 估驗 / 請款 / 收款 / 收入認列
  totalCertified: { label: '累計估驗', filters: { progressBilling: billingCertified } },
  billingPendingApproval: {
    label: '請款審核中',
    filters: {
      progressBilling: statusFilter<ProgressBillingStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'include',
        APPROVED: 'exclude',
        INVOICED: 'exclude',
        VOID: 'exclude',
      }),
    },
  },
  totalBilled: {
    label: '累計請款（未稅）',
    filters: {
      progressBilling: statusFilter<ProgressBillingStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'exclude',
        APPROVED: 'exclude',
        INVOICED: 'include',
        VOID: 'exclude',
      }),
    },
  },
  totalBilledWithTax: {
    label: '累計請款（含稅）',
    filters: { receivable: receivableNotVoid },
    conditions: ['receivable.sourceType = PROGRESS_BILLING'],
  },
  totalReceived: {
    label: '累計收款',
    filters: {
      receipt: settlementPosted,
      clearing: clearingEffective,
      receivable: receivableNotVoid,
    },
    activeAllocationsOnly: true,
  },
  totalCashReceived: {
    label: '累計實收現金',
    filters: {
      receipt: settlementPosted,
      clearing: clearingCashMoved,
      receivable: receivableNotVoid,
    },
    activeAllocationsOnly: true,
  },
  unallocatedReceipts: {
    label: '未分配收款',
    filters: { receipt: settlementPosted, clearing: clearingEffective },
  },
  accountsReceivable: { label: '應收帳款', filters: { receivable: receivableOutstanding } },
  overdueReceivable: {
    label: '逾期應收',
    filters: { receivable: receivableOutstanding },
    conditions: ['receivable.dueDate < today(organization timezone)'],
  },
  recognizedRevenue: {
    label: '已認列收入',
    filters: { revenueEntry: statusFilter<RevenueStatus>({ POSTED: 'include', VOID: 'exclude' }) },
  },

  // 保留款
  retentionHeld: { label: '累計保留款', filters: { progressBilling: billingCertified } },
  retentionClaimed: {
    label: '已請領保留款',
    filters: {
      retentionRelease: statusFilter<RetentionReleaseStatus>({
        DRAFT: 'exclude',
        INVOICED: 'include',
        VOID: 'exclude',
      }),
    },
  },
  retentionReceived: {
    label: '已收回保留款',
    filters: {
      receipt: settlementPosted,
      clearing: clearingEffective,
      receivable: receivableNotVoid,
    },
    activeAllocationsOnly: true,
    conditions: ['receivable.sourceType = RETENTION_RELEASE'],
  },
  retentionExpectedReleaseDate: {
    label: '預計退還日',
    filters: {
      retentionRelease: statusFilter<RetentionReleaseStatus>({
        DRAFT: 'include',
        INVOICED: 'include',
        VOID: 'exclude',
      }),
    },
    conditions: [
      'when RetentionRelease ∈ {DRAFT, INVOICED} exists: source = RetentionRelease.expectedReleaseDate',
      'fallback: source = Project.retentionExpectedReleaseDate',
    ],
  },

  // 成本
  actualCost: {
    label: '實際成本',
    filters: {
      expense: statusFilter<ExpenseStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'exclude',
        POSTED: 'include',
        VOID: 'exclude',
      }),
    },
    conditions: ['expense.scope = PROJECT'],
  },
  pendingReviewCost: {
    label: '待審成本',
    filters: {
      expense: statusFilter<ExpenseStatus>({
        DRAFT: 'exclude',
        SUBMITTED: 'include',
        POSTED: 'exclude',
        VOID: 'exclude',
      }),
    },
  },
  accountsPayable: { label: '應付帳款', filters: { payable: payableOutstanding } },
  employeeAdvancesPayable: {
    label: '應付員工代墊',
    filters: { payable: payableOutstanding },
    conditions: ['payable.payeeType = EMPLOYEE'],
  },
  unallocatedPayments: {
    label: '未分配付款',
    filters: { payment: settlementPosted, clearing: clearingEffective },
  },

  // Company dashboard / cash
  activeProjects: {
    label: '施工中工程數',
    filters: {
      project: statusFilter<ProjectStatus>({
        DRAFT: 'exclude',
        QUOTATION: 'exclude',
        ACTIVE: 'include',
        PAUSED: 'exclude',
        INSPECTION: 'exclude',
        COMPLETED: 'exclude',
        CLOSED: 'exclude',
      }),
    },
  },
  receivableDueThisMonth: {
    label: '本月待收',
    filters: { receivable: receivableOutstanding },
    conditions: ['receivable.dueDate within current month (organization timezone)'],
  },
  payableDueThisMonth: {
    label: '本月待付',
    filters: { payable: payableOutstanding },
    conditions: ['payable.dueDate within current month (organization timezone)'],
  },
  bankBalance: {
    label: '銀行 / 現金餘額',
    filters: {
      bankTransaction: statusFilter<BankTxnStatus>({ POSTED: 'include', VOID: 'exclude' }),
    },
  },
  pendingChecksPayable: {
    label: '待兌現應付票據',
    filters: { payment: settlementPosted, clearing: clearingPending },
    conditions: ['payment.method = CHECK'],
  },
  pendingChecksReceivable: {
    label: '待兌現應收票據',
    filters: { receipt: settlementPosted, clearing: clearingPending },
    conditions: ['receipt.method = CHECK'],
  },
  bouncedChecks: {
    label: '退票',
    filters: {
      settlement: settlementPosted,
      clearing: statusFilter<ClearingStatus>({
        NOT_APPLICABLE: 'exclude',
        PENDING: 'exclude',
        CLEARED: 'exclude',
        BOUNCED: 'include',
      }),
    },
  },
} as const satisfies Record<string, MetricDefinition>;

export type MetricName = keyof typeof METRIC_STATUS;
