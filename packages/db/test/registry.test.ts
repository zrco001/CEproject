// Offline tests of the registry comparison (§6.5 step 3). The catalogs here are synthetic: the
// PostgreSQL-style definitions are written by hand to match pg_get_constraintdef / pg_indexes
// output and are confirmed only when the registry check runs on a real database.
import { describe, expect, it } from 'vitest';
import { REGISTRY, type RegistryEntry } from '../prisma/constraints.registry.js';
import {
  auditForeignKeyActions,
  compareWithRegistry,
  normalizeCheck,
  parseIndexDefinition,
  type Catalog,
  type CatalogConstraint,
} from '../src/registry/compare.js';

const quote = (columns: readonly string[]) => columns.map((c) => `"${c}"`).join(', ');

/** A catalog in which every registry entry exists as written in the migration. */
function idealCatalog(registry: readonly RegistryEntry[] = REGISTRY): Catalog {
  const constraints: CatalogConstraint[] = [];
  const indexes: { name: string; table: string; definition: string }[] = [];
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
        });
        break;
      case 'unique_target':
      case 'unique_index':
        indexes.push({
          name: entry.name,
          table: entry.table,
          definition: `CREATE UNIQUE INDEX ${entry.name} ON public."${entry.table}" USING btree (${quote(entry.columns)})`,
        });
        break;
      case 'partial_unique_index':
        indexes.push({
          name: entry.name,
          table: entry.table,
          definition: `CREATE UNIQUE INDEX ${entry.name} ON public."${entry.table}" USING btree (${quote(entry.columns)}) WHERE (${entry.predicate})`,
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

const replaceConstraint = (catalog: Catalog, name: string, patch: Partial<CatalogConstraint>) => ({
  ...catalog,
  constraints: catalog.constraints.map((c) => (c.name === name ? { ...c, ...patch } : c)),
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

  it('reports a NOT VALID CHECK as mismatched', () => {
    const catalog = idealCatalog();
    const entry = catalog.constraints.find((c) => c.name === 'receivable_status_not_overdue_check');
    const result = compareWithRegistry(
      replaceConstraint(catalog, 'receivable_status_not_overdue_check', {
        definition: `${entry?.definition ?? ''} NOT VALID`,
      }),
    );
    expect(result.mismatched).toEqual(['receivable_status_not_overdue_check']);
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

  it('reports MATCH FULL on a nullable composite FK as mismatched (§6.5 rule 4)', () => {
    const catalog = idealCatalog();
    const fk = catalog.constraints.find((c) => c.name === 'expense_vendor_id_org_fkey');
    const result = compareWithRegistry(
      replaceConstraint(catalog, 'expense_vendor_id_org_fkey', {
        definition: (fk?.definition ?? '').replace(') ON UPDATE', ') MATCH FULL ON UPDATE'),
      }),
    );
    expect(result.mismatched).toEqual(['expense_vendor_id_org_fkey']);
  });

  it('reports a partial unique index without its WHERE clause as mismatched', () => {
    const catalog = idealCatalog();
    const result = compareWithRegistry({
      ...catalog,
      indexes: catalog.indexes.map((i) =>
        i.name === 'payable_payment_pair_active_key'
          ? { ...i, definition: i.definition.replace(/ WHERE .*$/, '') }
          : i,
      ),
    });
    expect(result.mismatched).toEqual(['payable_payment_pair_active_key']);
  });

  it('reports a non-unique composite target index as mismatched', () => {
    const catalog = idealCatalog();
    const result = compareWithRegistry({
      ...catalog,
      indexes: catalog.indexes.map((i) =>
        i.name === 'payment_org_id_key'
          ? { ...i, definition: i.definition.replace('UNIQUE INDEX', 'INDEX') }
          : i,
      ),
    });
    expect(result.mismatched).toEqual(['payment_org_id_key']);
  });

  it('accepts a composite target created as a UNIQUE constraint', () => {
    const catalog = idealCatalog();
    const result = compareWithRegistry({
      ...catalog,
      indexes: catalog.indexes.filter((i) => i.name !== 'vendor_org_id_key'),
      constraints: [
        ...catalog.constraints,
        {
          name: 'vendor_org_id_key',
          table: 'Vendor',
          type: 'u',
          definition: 'UNIQUE ("organizationId", id)',
          onUpdate: ' ',
          onDelete: ' ',
        },
      ],
    });
    expect(result.ok).toBe(true);
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
});

describe('normalizeCheck against PostgreSQL deparsed forms', () => {
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
      'BETWEEN rewritten as >= AND <= with numeric casts',
      `"physicalProgressPercent" BETWEEN 0 AND 100`,
      `CHECK ((("physicalProgressPercent" >= (0)::numeric) AND ("physicalProgressPercent" <= (100)::numeric)))`,
    ],
    [
      'lower-case identifiers left unquoted',
      `"amount" > 0 AND "billedAmount" >= 0 AND "billedAmount" <= "amount"`,
      `CHECK (((amount > (0)::numeric) AND ("billedAmount" >= (0)::numeric) AND ("billedAmount" <= amount)))`,
    ],
  ])('%s', (_label, written, deparsed) => {
    expect(normalizeCheck(deparsed)).toBe(normalizeCheck(written));
  });

  it('still distinguishes a removed condition', () => {
    expect(normalizeCheck(`"amount" > 0 AND "billedAmount" >= 0`)).not.toBe(
      normalizeCheck(`"amount" > 0`),
    );
  });

  it('still distinguishes a changed operator', () => {
    expect(normalizeCheck(`"feeAmount" < "paymentAmount"`)).not.toBe(
      normalizeCheck(`"feeAmount" <= "paymentAmount"`),
    );
  });
});

describe('parseIndexDefinition', () => {
  it('reads a partial unique index', () => {
    expect(
      parseIndexDefinition(
        `CREATE UNIQUE INDEX contract_owner_contract_active_key ON public."Contract" USING btree ("projectId") WHERE ((type = 'OWNER_CONTRACT'::"ContractType") AND (status <> 'TERMINATED'::"ContractStatus"))`,
      ),
    ).toEqual({
      unique: true,
      columns: ['projectid'],
      predicate: `((type = 'owner_contract'::contracttype) and (status <> 'terminated'::contractstatus))`,
    });
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
