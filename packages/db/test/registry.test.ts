// Offline tests of the registry comparison (§6.5 step 3). The catalogs here are synthetic: the
// PostgreSQL-style definitions are written by hand to match pg_get_constraintdef /
// pg_get_indexdef output and are confirmed only when the registry check runs on a real database.
import { describe, expect, it } from 'vitest';
import { REGISTRY, type RegistryEntry } from '../prisma/constraints.registry.js';
import { UnsupportedExpressionError } from '../src/registry/expression.js';
import {
  auditForeignKeyActions,
  compareWithRegistry,
  normalizeCheck,
  parseIndexDefinition,
  sameExpression,
  type Catalog,
  type CatalogConstraint,
  type CatalogIndex,
} from '../src/registry/compare.js';

const quote = (columns: readonly string[]) => columns.map((c) => `"${c}"`).join(', ');
const VALID_INDEX = { valid: true, ready: true, live: true } as const;

/** A catalog in which every registry entry exists as written in the migration. */
function idealCatalog(registry: readonly RegistryEntry[] = REGISTRY): Catalog {
  const constraints: CatalogConstraint[] = [];
  const indexes: CatalogIndex[] = [];
  const privileges: Catalog['privileges'][number][] = [];
  for (const entry of registry) {
    switch (entry.kind) {
      case 'check':
        constraints.push({
          name: entry.name,
          table: entry.table,
          type: 'c',
          definition: `CHECK ((${entry.condition}))`,
          onUpdate: ' ',
          onDelete: ' ',
          validated: true,
        });
        break;
      case 'composite_fk':
        constraints.push({
          name: entry.name,
          table: entry.table,
          type: 'f',
          definition: `FOREIGN KEY (${quote(entry.columns)}) REFERENCES "${entry.references.table}"(${quote(entry.references.columns)}) ON UPDATE RESTRICT ON DELETE RESTRICT`,
          onUpdate: 'r',
          onDelete: 'r',
          validated: true,
        });
        break;
      case 'unique_target':
      case 'unique_index':
        indexes.push({
          name: entry.name,
          table: entry.table,
          definition: `CREATE UNIQUE INDEX ${entry.name} ON public."${entry.table}" USING btree (${quote(entry.columns)})`,
          ...VALID_INDEX,
        });
        break;
      case 'partial_unique_index':
        indexes.push({
          name: entry.name,
          table: entry.table,
          definition: `CREATE UNIQUE INDEX ${entry.name} ON public."${entry.table}" USING btree (${quote(entry.columns)}) WHERE (${entry.predicate})`,
          ...VALID_INDEX,
        });
        break;
      case 'revoked_privileges':
        for (const privilege of entry.privileges) {
          privileges.push({ table: entry.table, role: entry.role, privilege, granted: false });
        }
        break;
    }
  }
  return { constraints, indexes, privileges };
}

const replaceConstraint = (
  catalog: Catalog,
  name: string,
  patch: Partial<CatalogConstraint>,
): Catalog => ({
  ...catalog,
  constraints: catalog.constraints.map((c) => (c.name === name ? { ...c, ...patch } : c)),
});

const replaceIndex = (catalog: Catalog, name: string, patch: Partial<CatalogIndex>): Catalog => ({
  ...catalog,
  indexes: catalog.indexes.map((i) => (i.name === name ? { ...i, ...patch } : i)),
});

describe('compareWithRegistry', () => {
  it('passes when every entry is present as defined', () => {
    const result = compareWithRegistry(idealCatalog());
    expect(result.missing).toEqual([]);
    expect(result.mismatched).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.present).toHaveLength(REGISTRY.length);
  });

  it('reports a dropped CHECK as missing (the Gate 0 TC-22 case Prisma diff cannot see)', () => {
    const catalog = idealCatalog();
    const result = compareWithRegistry({
      ...catalog,
      constraints: catalog.constraints.filter((c) => c.name !== 'payment_fee_bearer_amounts_check'),
    });
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['payment_fee_bearer_amounts_check']);
  });

  it('reports a weakened CHECK with the same name as mismatched', () => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'payable_amounts_check', {
        definition: 'CHECK (("paidAmount" + "outstandingAmount") = "originalAmount")',
      }),
    );
    expect(result.mismatched).toEqual(['payable_amounts_check']);
  });

  it('reports a NOT VALID CHECK as mismatched, by text and by convalidated', () => {
    const catalog = idealCatalog();
    const entry = catalog.constraints.find((c) => c.name === 'receivable_status_not_overdue_check');
    const byText = compareWithRegistry(
      replaceConstraint(catalog, 'receivable_status_not_overdue_check', {
        definition: `${entry?.definition ?? ''} NOT VALID`,
      }),
    );
    expect(byText.mismatched).toEqual(['receivable_status_not_overdue_check']);
    const byState = compareWithRegistry(
      replaceConstraint(catalog, 'receivable_status_not_overdue_check', { validated: false }),
    );
    expect(byState.mismatched).toEqual(['receivable_status_not_overdue_check']);
  });

  it.each([
    ['CASCADE on delete', { onDelete: 'c' as const }],
    ['SET NULL on delete', { onDelete: 'n' as const }],
    ['CASCADE on update', { onUpdate: 'c' as const }],
  ])('reports a composite FK with %s as mismatched', (_label, patch) => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'payable_payment_payable_id_org_fkey', patch),
    );
    expect(result.mismatched).toEqual(['payable_payment_payable_id_org_fkey']);
  });

  it('reports a composite FK narrowed to a single column as mismatched', () => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'expense_vendor_id_org_fkey', {
        definition:
          'FOREIGN KEY ("vendorId") REFERENCES "Vendor"(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      }),
    );
    expect(result.mismatched).toEqual(['expense_vendor_id_org_fkey']);
  });

  // Codex review of 683606122, finding P2: a matching definition is not enough.
  it('reports a NOT VALID composite FK as mismatched (convalidated = false)', () => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'expense_vendor_id_org_fkey', { validated: false }),
    );
    expect(result.mismatched).toEqual(['expense_vendor_id_org_fkey']);
  });

  it.each([
    ['NOT VALID', ' NOT VALID'],
    ['MATCH FULL (§6.5 rule 4)', ' MATCH FULL'],
    ['DEFERRABLE', ' DEFERRABLE INITIALLY DEFERRED'],
  ])('reports a composite FK definition with %s as mismatched', (_label, suffix) => {
    const catalog = idealCatalog();
    const fk = catalog.constraints.find((c) => c.name === 'expense_vendor_id_org_fkey');
    const result = compareWithRegistry(
      replaceConstraint(catalog, 'expense_vendor_id_org_fkey', {
        definition: `${fk?.definition ?? ''}${suffix}`,
      }),
    );
    expect(result.mismatched).toEqual(['expense_vendor_id_org_fkey']);
  });

  it.each([
    ['invalid', { valid: false }],
    ['not ready', { ready: false }],
    ['not live', { live: false }],
  ])('reports a %s partial unique index as mismatched', (_label, patch) => {
    const result = compareWithRegistry(
      replaceIndex(idealCatalog(), 'payable_payment_pair_active_key', patch),
    );
    expect(result.mismatched).toEqual(['payable_payment_pair_active_key']);
  });

  it.each([
    ['invalid', { valid: false }],
    ['not ready', { ready: false }],
    ['not live', { live: false }],
  ])('reports a %s composite target index as mismatched', (_label, patch) => {
    const result = compareWithRegistry(replaceIndex(idealCatalog(), 'payment_org_id_key', patch));
    expect(result.mismatched).toEqual(['payment_org_id_key']);
  });

  it('fails closed when index or constraint state is missing', () => {
    const catalog = idealCatalog();
    const withoutState = (name: string): Catalog => ({
      ...catalog,
      indexes: catalog.indexes.map((i) => {
        if (i.name !== name) return i;
        const { valid: _valid, ready: _ready, live: _live, ...rest } = i;
        return rest;
      }),
      constraints: catalog.constraints.map((c) => {
        if (c.name !== name) return c;
        const { validated: _validated, ...rest } = c;
        return rest;
      }),
    });
    expect(
      compareWithRegistry(withoutState('receipt_allocation_pair_active_key')).mismatched,
    ).toEqual(['receipt_allocation_pair_active_key']);
    expect(compareWithRegistry(withoutState('receipt_customer_id_org_fkey')).mismatched).toEqual([
      'receipt_customer_id_org_fkey',
    ]);
    expect(compareWithRegistry(withoutState('expense_amounts_check')).mismatched).toEqual([
      'expense_amounts_check',
    ]);
  });

  it('reports a partial unique index without its WHERE clause as mismatched', () => {
    const catalog = idealCatalog();
    const index = catalog.indexes.find((i) => i.name === 'payable_payment_pair_active_key');
    const result = compareWithRegistry(
      replaceIndex(catalog, 'payable_payment_pair_active_key', {
        definition: (index?.definition ?? '').replace(/ WHERE .*$/, ''),
      }),
    );
    expect(result.mismatched).toEqual(['payable_payment_pair_active_key']);
  });

  it('reports a partial unique index whose predicate changed literal case as mismatched', () => {
    const catalog = idealCatalog();
    const index = catalog.indexes.find((i) => i.name === 'contract_owner_contract_active_key');
    const result = compareWithRegistry(
      replaceIndex(catalog, 'contract_owner_contract_active_key', {
        definition: (index?.definition ?? '').replace("'TERMINATED'", "'terminated'"),
      }),
    );
    expect(result.mismatched).toEqual(['contract_owner_contract_active_key']);
  });

  it('reports a non-unique composite target index as mismatched', () => {
    const catalog = idealCatalog();
    const index = catalog.indexes.find((i) => i.name === 'payment_org_id_key');
    const result = compareWithRegistry(
      replaceIndex(catalog, 'payment_org_id_key', {
        definition: (index?.definition ?? '').replace('UNIQUE INDEX', 'INDEX'),
      }),
    );
    expect(result.mismatched).toEqual(['payment_org_id_key']);
  });

  it('accepts a composite target created as a validated UNIQUE constraint with a usable index', () => {
    const catalog = idealCatalog();
    const asConstraint = (indexState: Partial<CatalogIndex>): Catalog => ({
      ...replaceIndex(catalog, 'vendor_org_id_key', indexState),
      constraints: [
        ...catalog.constraints,
        {
          name: 'vendor_org_id_key',
          table: 'Vendor',
          type: 'u',
          definition: 'UNIQUE ("organizationId", id)',
          onUpdate: ' ',
          onDelete: ' ',
          validated: true,
        },
      ],
    });
    expect(compareWithRegistry(asConstraint({})).ok).toBe(true);
    expect(compareWithRegistry(asConstraint({ valid: false })).mismatched).toEqual([
      'vendor_org_id_key',
    ]);
  });

  it('reports a re-granted AuditLog UPDATE as mismatched and a missing role as missing (I-20)', () => {
    const catalog = idealCatalog();
    const granted = compareWithRegistry({
      ...catalog,
      privileges: catalog.privileges.map((p) =>
        p.privilege === 'UPDATE' ? { ...p, granted: true } : p,
      ),
    });
    expect(granted.mismatched).toEqual(['audit_log_app_user_revoked_privileges']);
    const noRole = compareWithRegistry({ ...catalog, privileges: [] });
    expect(noRole.missing).toEqual(['audit_log_app_user_revoked_privileges']);
  });

  // Codex review of 683606122, finding P1.
  it('reports a regrouped I-14 formula as mismatched', () => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'progress_billing_billing_amount_check', {
        definition: `CHECK (("billingAmount" = ("grossAmount" + ("changeOrderAmount" - ("retentionAmount" - "deductionAmount")))))`,
      }),
    );
    expect(result.mismatched).toEqual(['progress_billing_billing_amount_check']);
  });

  // Codex review of d62f1b7, finding P1: numeric → integer rounds, so 85.49 would pass.
  it('accepts the deparsed I-14 formula with presentation-only parentheses', () => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'progress_billing_billing_amount_check', {
        definition: `CHECK (("billingAmount" = ((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount")))`,
      }),
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    [
      'an integer cast on billingAmount',
      `CHECK ((("billingAmount")::integer = ((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount")))`,
    ],
    [
      'the same cast inside extra parentheses',
      `CHECK (((("billingAmount")::integer) = ((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount")))`,
    ],
    [
      'chained casts ending in integer',
      `CHECK ((("billingAmount")::numeric::integer = ((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount")))`,
    ],
    [
      'an integer cast on the computed right-hand side',
      `CHECK (("billingAmount" = (((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount"))::integer))`,
    ],
    [
      'a numeric cast on a column (not a constant)',
      `CHECK ((("billingAmount")::numeric = ((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount")))`,
    ],
  ])('reports the I-14 formula with %s as mismatched', (_label, definition) => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'progress_billing_billing_amount_check', { definition }),
    );
    expect(result.ok).toBe(false);
    expect(result.mismatched).toEqual(['progress_billing_billing_amount_check']);
  });

  it('reports a CHECK with unsupported syntax as mismatched (fail closed)', () => {
    const result = compareWithRegistry(
      replaceConstraint(idealCatalog(), 'receivable_status_not_overdue_check', {
        definition: `CHECK ((lower((status)::text) <> 'overdue'::text))`,
      }),
    );
    expect(result.mismatched).toEqual(['receivable_status_not_overdue_check']);
  });
});

describe('normalizeCheck: PostgreSQL deparsed forms compare equal', () => {
  it.each([
    [
      'enum casts and added parentheses',
      `("feeBearer" = 'COMPANY' AND "bankOutflowAmount" = "paymentAmount" + "feeAmount")`,
      `CHECK ((("feeBearer" = 'COMPANY'::"FeeBearer") AND ("bankOutflowAmount" = ("paymentAmount" + "feeAmount"))))`,
    ],
    [
      'NOT IN rewritten as <> ALL (ARRAY[…])',
      `"status" NOT IN ('POSTED', 'VOID') OR "vendorId" IS NOT NULL`,
      `CHECK (((status <> ALL (ARRAY['POSTED'::"ExpenseStatus", 'VOID'::"ExpenseStatus"])) OR ("vendorId" IS NOT NULL)))`,
    ],
    [
      'NOT IN with a cast array',
      `"status" NOT IN ('POSTED', 'VOID')`,
      `CHECK ((status <> ALL ((ARRAY['POSTED'::"ExpenseStatus", 'VOID'::"ExpenseStatus"])::"ExpenseStatus"[])))`,
    ],
    [
      'BETWEEN rewritten as >= AND <= with numeric casts',
      `"physicalProgressPercent" BETWEEN 0 AND 100`,
      `CHECK ((("physicalProgressPercent" >= (0)::numeric) AND ("physicalProgressPercent" <= (100)::numeric)))`,
    ],
    [
      'lower-case identifiers left unquoted and left-associative arithmetic',
      `"billingAmount" = "grossAmount" + "changeOrderAmount" - "retentionAmount" - "deductionAmount"`,
      `CHECK (("billingAmount" = ((("grossAmount" + "changeOrderAmount") - "retentionAmount") - "deductionAmount")))`,
    ],
    [
      'AND chains regardless of redundant parentheses',
      `"amount" > 0 AND "billedAmount" >= 0 AND "billedAmount" <= "amount"`,
      `CHECK (((amount > (0)::numeric) AND ("billedAmount" >= (0)::numeric) AND ("billedAmount" <= amount)))`,
    ],
    [
      'boolean equality of IS NULL tests',
      `("voidedAt" IS NULL) = ("voidedById" IS NULL) AND ("voidedAt" IS NULL) = ("voidReason" IS NULL)`,
      `CHECK (((("voidedAt" IS NULL) = ("voidedById" IS NULL)) AND (("voidedAt" IS NULL) = ("voidReason" IS NULL))))`,
    ],
  ])('%s', (_label, written, deparsed) => {
    expect(normalizeCheck(deparsed)).toBe(normalizeCheck(written));
  });

  it('matches every registry CHECK against its own parenthesized form', () => {
    for (const entry of REGISTRY) {
      if (entry.kind === 'check') {
        expect(sameExpression(`CHECK ((${entry.condition}))`, entry.condition), entry.name).toBe(
          true,
        );
      }
    }
  });
});

describe('normalizeCheck: different expression trees stay different', () => {
  it.each([
    [
      'arithmetic regrouping (I-14)',
      `"billingAmount" = "grossAmount" + "changeOrderAmount" - "retentionAmount" - "deductionAmount"`,
      `"billingAmount" = "grossAmount" + ("changeOrderAmount" - ("retentionAmount" - "deductionAmount"))`,
    ],
    ['subtraction regrouping', `"a" - "b" - "c"`, `"a" - ("b" - "c")`],
    [
      'boolean regrouping',
      `"a" IS NULL AND ("b" IS NULL OR "c" IS NULL)`,
      `("a" IS NULL AND "b" IS NULL) OR "c" IS NULL`,
    ],
    [
      'boolean equality regrouping',
      `("a" IS NULL) = ("b" IS NULL) AND "c" IS NULL`,
      `("a" IS NULL) = ("b" IS NULL AND "c" IS NULL)`,
    ],
    ['removed condition', `"amount" > 0 AND "billedAmount" >= 0`, `"amount" > 0`],
    ['changed operator', `"feeAmount" < "paymentAmount"`, `"feeAmount" <= "paymentAmount"`],
    ['swapped operands', `"feeAmount" < "paymentAmount"`, `"paymentAmount" < "feeAmount"`],
    ['literal case', `"status" <> 'OVERDUE'`, `"status" <> 'overdue'`],
    ['NOT IN vs IN', `"status" NOT IN ('POSTED')`, `"status" IN ('POSTED')`],
    [
      'an integer cast on a column',
      `"billingAmount" = "grossAmount"`,
      `("billingAmount")::integer = "grossAmount"`,
    ],
    ['an integer cast on a constant', `"amount" > 0`, `"amount" > (0)::integer`],
    ['a numeric cast on a string constant', `"amount" > 0`, `"amount" > ('0')::numeric`],
    ['a text cast on a column', `"status" <> 'OVERDUE'`, `("status")::text <> 'OVERDUE'`],
  ])('%s', (_label, expected, changed) => {
    expect(sameExpression(changed, expected)).toBe(false);
  });

  it.each([
    ['a function call', `lower("email") = "email"`],
    ['LIKE', `"code" LIKE 'A%'`],
    ['a trailing NOT VALID', `CHECK (("amount" > 0)) NOT VALID`],
    ['unbalanced parentheses', `("amount" > 0`],
  ])('rejects %s as unsupported', (_label, sql) => {
    expect(() => normalizeCheck(sql)).toThrow(UnsupportedExpressionError);
    expect(sameExpression(sql, sql)).toBe(false);
  });
});

describe('parseIndexDefinition', () => {
  it('reads a partial unique index and keeps the predicate text', () => {
    const predicate = `((type = 'OWNER_CONTRACT'::"ContractType") AND (status <> 'TERMINATED'::"ContractStatus"))`;
    expect(
      parseIndexDefinition(
        `CREATE UNIQUE INDEX contract_owner_contract_active_key ON public."Contract" USING btree ("projectId") WHERE ${predicate}`,
      ),
    ).toEqual({ unique: true, columns: ['projectid'], predicate });
  });

  it('returns null for an expression index it cannot read', () => {
    expect(
      parseIndexDefinition('CREATE INDEX x ON public.t USING btree (lower(email))'),
    ).toBeNull();
  });
});

describe('auditForeignKeyActions', () => {
  it('accepts RESTRICT / NO ACTION only', () => {
    const catalog = idealCatalog();
    expect(auditForeignKeyActions(catalog).ok).toBe(true);
    const bad = replaceConstraint(catalog, 'receipt_bank_account_id_org_fkey', { onDelete: 'c' });
    expect(auditForeignKeyActions(bad).violations).toEqual([
      'Receipt.receipt_bank_account_id_org_fkey: ON UPDATE RESTRICT, ON DELETE CASCADE',
    ]);
  });

  it('fails when there is no foreign key at all', () => {
    expect(auditForeignKeyActions({ constraints: [], indexes: [], privileges: [] }).ok).toBe(false);
  });
});
