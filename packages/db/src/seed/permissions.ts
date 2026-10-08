// Reference data for the seed program: permission codes and the default system-role matrix.
//
// Source: ARCHITECTURE.md §8.3 (Permission × Role 預設矩陣) and the permission codes named in
// §8.2. Only grants that §8.3 marks ✔ are seeded. Codes that §8.2 names but §8.3 does not
// assign to any role are seeded without grants, and wildcard families (`customer.*`, …) are
// not expanded; both are listed in SEED_GAPS for the Phase 3 RBAC review instead of guessed.
import { SystemRoleCode } from '@ceproject/shared/enums';

export interface PermissionDefinition {
  readonly code: string;
  /** Module part of the code (text before the first dot). */
  readonly module: string;
  readonly description: string;
}

export interface RoleGrant {
  readonly role: SystemRoleCode;
  /** §8.3 "(scope)": allowed only on projects where the user is a ProjectMember (Phase 3). */
  readonly projectScoped: boolean;
}

export interface MatrixRow {
  /** Row label as written in §8.3. */
  readonly group: string;
  readonly permissions: readonly string[];
  readonly grants: readonly RoleGrant[];
}

const { OWNER, ADMIN, ACCOUNTANT, PROJECT_MANAGER, SITE_MANAGER, PURCHASER, VIEWER } =
  SystemRoleCode;

const all = (...roles: SystemRoleCode[]): RoleGrant[] =>
  roles.map((role) => ({ role, projectScoped: false }));
const scoped = (role: SystemRoleCode): RoleGrant => ({ role, projectScoped: true });

/** §8.3, row by row. */
export const PERMISSION_MATRIX: readonly MatrixRow[] = Object.freeze([
  {
    group: 'settings / user / role manage',
    permissions: ['settings.manage', 'user.manage', 'role.manage'],
    grants: all(OWNER, ADMIN),
  },
  {
    group: 'customer / vendor write',
    permissions: ['customer.write'],
    grants: all(OWNER, ADMIN, ACCOUNTANT, PROJECT_MANAGER),
  },
  {
    group: 'customer / vendor write',
    permissions: ['vendor.write'],
    grants: all(OWNER, ADMIN, ACCOUNTANT, PROJECT_MANAGER, PURCHASER),
  },
  {
    group: 'vendor.bank.write / reveal',
    permissions: ['vendor.bank.write', 'vendor.bank.reveal'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'employee.read (v0.3)',
    permissions: ['employee.read'],
    grants: all(OWNER, ADMIN, ACCOUNTANT, PROJECT_MANAGER, SITE_MANAGER, PURCHASER),
  },
  {
    group: 'employee.write (v0.3)',
    permissions: ['employee.write'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'employee.bank.reveal (v0.3)',
    permissions: ['employee.bank.reveal'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'project write',
    permissions: ['project.write'],
    grants: [...all(OWNER, ADMIN), scoped(PROJECT_MANAGER)],
  },
  {
    group: 'contract / change order write',
    permissions: ['contract.write', 'change_order.write'],
    grants: [...all(OWNER, ADMIN, ACCOUNTANT), scoped(PROJECT_MANAGER)],
  },
  {
    group: 'change order approve',
    permissions: ['change_order.approve'],
    grants: all(OWNER, ADMIN),
  },
  {
    group: 'budget write',
    permissions: ['budget.write'],
    grants: [...all(OWNER, ADMIN, ACCOUNTANT), scoped(PROJECT_MANAGER)],
  },
  {
    group: 'expense.create / submit（PROJECT）',
    permissions: ['expense.create', 'expense.submit'],
    grants: [
      ...all(OWNER, ADMIN, ACCOUNTANT),
      scoped(PROJECT_MANAGER),
      scoped(SITE_MANAGER),
      ...all(PURCHASER),
    ],
  },
  {
    group: 'expense.overhead（建立管銷支出）',
    permissions: ['expense.overhead'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'expense.review / post',
    permissions: ['expense.review', 'expense.post'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'expense.void',
    permissions: ['expense.void'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'payment / receipt create / allocate / void（含單筆 allocation void）',
    permissions: [
      'payment.create',
      'payment.allocate',
      'payment.void',
      'receipt.create',
      'receipt.allocate',
      'receipt.void',
    ],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'payment.clear / receipt.clear（兌現、退票） (v0.3)',
    permissions: ['payment.clear', 'receipt.clear'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'billing create',
    permissions: ['billing.create'],
    grants: [...all(OWNER, ADMIN, ACCOUNTANT), scoped(PROJECT_MANAGER)],
  },
  {
    group: 'billing approve / invoice / void',
    permissions: ['billing.approve', 'billing.invoice', 'billing.void'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'revenue.write（其他收入）',
    permissions: ['revenue.write'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'daily log write',
    permissions: ['daily_log.write'],
    grants: [...all(OWNER, ADMIN), scoped(PROJECT_MANAGER), scoped(SITE_MANAGER)],
  },
  {
    group: 'report.financial.read',
    permissions: ['report.financial.read'],
    grants: [...all(OWNER, ADMIN, ACCOUNTANT), scoped(PROJECT_MANAGER), ...all(VIEWER)],
  },
  {
    group: 'report.overhead.read',
    permissions: ['report.overhead.read'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
  {
    group: 'audit.read',
    permissions: ['audit.read'],
    grants: all(OWNER, ADMIN, ACCOUNTANT),
  },
]);

/** Codes named in §8.2 that §8.3 assigns to no role: seeded, but granted to nobody. */
export const UNASSIGNED_PERMISSION_CODES: readonly string[] = Object.freeze([
  'bank.manage',
  'payable.read',
  'receivable.read',
  'petty_cash.manage',
  'report.project.read',
  'dashboard.read',
]);

/** Open RBAC questions for the Phase 3 review; the seed does not resolve them. */
export const SEED_GAPS: readonly string[] = Object.freeze([
  '§8.2 uses bank.manage, payable.read, receivable.read, petty_cash.manage, report.project.read and dashboard.read, but §8.3 grants them to no role; they are seeded without grants.',
  '§8.2 uses wildcard families customer.*, vendor.*, project.* and billing.*; only the codes named in §8.3 (customer.write, vendor.write, project.write, billing.create/approve/invoice/void) are seeded. Read permissions for customers, vendors, projects, expenses, payments and receipts are not defined.',
  '§8.2 bank-account and employee bank-account write endpoints name no write-specific code (bank.manage / employee.write are the closest); no extra code is created.',
  '§8.3 "(scope)" grants need ProjectMember scope enforcement (ProjectAccessService, Phase 3). RolePermission has no scope column, so the seed stores the grant and the scope flag lives in this module only.',
  'System role display names are not defined in the architecture; the seed uses the role code as the name.',
  'Default cost category codes are not defined in the architecture; DEFAULT_COST_CATEGORIES proposes codes for review.',
]);

const describe = (code: string): string => {
  const row = PERMISSION_MATRIX.find((r) => r.permissions.includes(code));
  return row ? row.group : 'Named in ARCHITECTURE.md §8.2; not assigned by §8.3';
};

const moduleOf = (code: string): string => code.slice(0, code.indexOf('.'));

/** Every seeded permission, in matrix order, without duplicates. */
export const PERMISSIONS: readonly PermissionDefinition[] = Object.freeze(
  [
    ...new Set([
      ...PERMISSION_MATRIX.flatMap((row) => row.permissions),
      ...UNASSIGNED_PERMISSION_CODES,
    ]),
  ].map((code) => ({ code, module: moduleOf(code), description: describe(code) })),
);

/** role → permission codes (flattened §8.3). */
export function grantsByRole(): ReadonlyMap<SystemRoleCode, readonly string[]> {
  const result = new Map<SystemRoleCode, string[]>(
    Object.values(SystemRoleCode).map((role) => [role, []]),
  );
  for (const row of PERMISSION_MATRIX) {
    for (const grant of row.grants) {
      result.get(grant.role)?.push(...row.permissions);
    }
  }
  return result;
}
