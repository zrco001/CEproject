// Offline checks of prisma/schema.prisma against ARCHITECTURE.md §5.1, §6.1, §6.2 and §6.5.
import * as sharedEnums from '@ceproject/shared/enums';
import { describe, expect, it } from 'vitest';
import { CORE_TABLES, MASTER_TABLES, snakeCase } from '../prisma/constraints.registry.js';
import { mappedNames, parseEnums, parseModels, parseRelations } from './support/sources.js';

const models = parseModels();
const model = (name: string) => {
  const found = models.find((m) => m.name === name);
  if (!found) throw new Error(`model ${name} not found`);
  return found;
};
const field = (modelName: string, fieldName: string) =>
  model(modelName).fields.find((f) => f.name === fieldName);
const relations = parseRelations(models);

/** §6.2: the 36 MVP models (ProgressBillingItem is FUTURE and must not exist). */
const MVP_MODELS = [
  'Organization',
  'User',
  'Membership',
  'Role',
  'Permission',
  'RolePermission',
  'RefreshToken',
  'AuditLog',
  'DocumentSequence',
  'Attachment',
  'AttachmentLink',
  'Customer',
  'Vendor',
  'Employee',
  'CostCategory',
  'BankAccount',
  'Project',
  'ProjectMember',
  'Contract',
  'ChangeOrder',
  'ProjectBudget',
  'ProjectDailyLog',
  'Expense',
  'ExpenseItem',
  'Payable',
  'Payment',
  'PayablePayment',
  'PettyCashTransaction',
  'ProgressBilling',
  'ProgressBillingChangeOrder',
  'RetentionRelease',
  'Receivable',
  'Receipt',
  'ReceiptAllocation',
  'RevenueEntry',
  'BankTransaction',
];

describe('models (§6.2)', () => {
  it('declares exactly the 36 MVP models', () => {
    expect(MVP_MODELS).toHaveLength(36);
    expect(models.map((m) => m.name).sort()).toEqual([...MVP_MODELS].sort());
  });

  it('does not create the FUTURE ProgressBillingItem / ContractItem models (§3.6)', () => {
    expect(models.some((m) => m.name === 'ProgressBillingItem' || m.name === 'ContractItem')).toBe(
      false,
    );
  });

  it('uses client-generated UUID v7 ids stored as uuid (§5.1)', () => {
    for (const m of models) {
      const id = m.fields.find((f) => f.name === 'id');
      if (!id) continue;
      expect(id.attributes, m.name).toMatch(
        /@id\(map: "\w+_pkey"\) @default\(uuid\(7\)\) @db\.Uuid/,
      );
    }
  });

  it('stores every *Id reference column as uuid', () => {
    for (const m of models) {
      // requestId (x-request-id) and taxId (統一編號) are identifiers, not references.
      const references = m.fields.filter(
        (f) =>
          /Id$/.test(f.name) && f.type === 'String' && !['requestId', 'taxId'].includes(f.name),
      );
      for (const f of references) {
        expect(f.attributes, `${m.name}.${f.name}`).toContain('@db.Uuid');
      }
    }
  });

  it('gives every org-scoped model a required organizationId, except system Roles (§5.1)', () => {
    const withoutOrganization = [
      'Organization',
      'User',
      'Permission',
      'RolePermission',
      'RefreshToken',
    ];
    for (const m of models.filter((m) => !withoutOrganization.includes(m.name))) {
      const organizationId = m.fields.find((f) => f.name === 'organizationId');
      expect(organizationId, m.name).toBeDefined();
      expect(organizationId?.optional, m.name).toBe(m.name === 'Role');
    }
  });
});

describe('column types (§2.6, §2.7)', () => {
  it('stores money as Decimal(18,2), rates as Decimal(7,4), progress as Decimal(5,2)', () => {
    for (const m of models) {
      for (const f of m.fields.filter((f) => f.type === 'Decimal')) {
        const expected =
          f.name === 'defaultTaxRate' || f.name === 'retentionRate'
            ? '@db.Decimal(7, 4)'
            : f.name === 'physicalProgressPercent'
              ? '@db.Decimal(5, 2)'
              : f.name === 'quantity'
                ? '@db.Decimal(18, 4)'
                : '@db.Decimal(18, 2)';
        expect(f.attributes, `${m.name}.${f.name}`).toContain(expected);
      }
    }
  });

  it('never uses Float for any column', () => {
    for (const m of models) {
      expect(
        m.fields.filter((f) => f.type === 'Float'),
        m.name,
      ).toEqual([]);
    }
  });

  it('stores instants as TIMESTAMPTZ and business dates as DATE', () => {
    for (const m of models) {
      for (const f of m.fields.filter((f) => f.type === 'DateTime')) {
        const isInstant = /At$/.test(f.name);
        expect(f.attributes, `${m.name}.${f.name}`).toContain(
          isInstant ? '@db.Timestamptz(3)' : '@db.Date',
        );
        if (!isInstant) expect(f.name, `${m.name}.${f.name}`).toMatch(/Date$/);
      }
    }
  });
});

describe('common fields (§5.1, §6.2 markers)', () => {
  const VOIDABLE = [
    'Expense',
    'Payment',
    'PettyCashTransaction',
    'ProgressBilling',
    'RetentionRelease',
    'Receipt',
    'RevenueEntry',
    'BankTransaction',
    'PayablePayment',
    'ReceiptAllocation',
  ];
  const VERSIONED = [
    'Project',
    'Contract',
    'ChangeOrder',
    'Expense',
    'Payable',
    'Payment',
    'ProgressBilling',
    'Receivable',
    'Receipt',
  ];
  const COMMON = [
    'Membership',
    'Attachment',
    'Customer',
    'Vendor',
    'CostCategory',
    'BankAccount',
    'Project',
    'Contract',
    'ChangeOrder',
    'ProjectBudget',
    'ProjectDailyLog',
    'Expense',
    'Payable',
    'Payment',
    'PettyCashTransaction',
    'ProgressBilling',
    'RetentionRelease',
    'Receivable',
    'Receipt',
    'RevenueEntry',
    'BankTransaction',
  ];

  it.each(VOIDABLE)('%s has voidedAt / voidedById / voidReason [V]', (name) => {
    for (const f of ['voidedAt', 'voidedById', 'voidReason']) {
      expect(field(name, f)?.optional, `${name}.${f}`).toBe(true);
    }
  });

  it.each(VERSIONED)('%s has an optimistic-lock version [L]', (name) => {
    expect(field(name, 'version')?.attributes).toContain('@default(1)');
  });

  it.each(COMMON)('%s has createdAt / updatedAt / createdById / updatedById? [C]', (name) => {
    expect(field(name, 'createdAt')?.attributes).toContain('@default(now())');
    expect(field(name, 'updatedAt')?.attributes).toContain('@updatedAt');
    expect(field(name, 'createdById')?.optional).toBe(false);
    expect(field(name, 'updatedById')?.optional).toBe(true);
  });

  it('uses idempotency keys where §6.2 lists clientRequestId', () => {
    for (const name of ['Expense', 'Payment', 'Receipt', 'ProjectDailyLog', 'RevenueEntry']) {
      expect(field(name, 'clientRequestId')?.optional, name).toBe(true);
    }
  });
});

describe('model rules (§6.2, ADR-24..ADR-33)', () => {
  it('keeps projectId off ExpenseItem (ADR-31)', () => {
    expect(field('ExpenseItem', 'projectId')).toBeUndefined();
  });

  it('has no plaintext bank account number column (§2.8, ADR-20)', () => {
    for (const m of models) {
      for (const f of m.fields) {
        expect(f.name, `${m.name}.${f.name}`).not.toMatch(/^(bankAccountNo|accountNo)$/);
      }
    }
  });

  it('does not make RevenueEntry.progressBillingId unique (ADR-29)', () => {
    expect(field('RevenueEntry', 'progressBillingId')?.attributes).not.toContain('@unique');
  });

  it('keeps the 1 : 0..1 source links unique (§6.2)', () => {
    expect(field('Payable', 'expenseId')?.attributes).toContain('@unique');
    expect(field('Receivable', 'progressBillingId')?.attributes).toContain('@unique');
    expect(field('Receivable', 'retentionReleaseId')?.attributes).toContain('@unique');
  });

  it('requires ProgressBilling.contractId (§6.2)', () => {
    expect(field('ProgressBilling', 'contractId')?.optional).toBe(false);
  });

  it('defaults Payment / Receipt feeBearer to COMPANY and clearing to NOT_APPLICABLE', () => {
    for (const name of ['Payment', 'Receipt']) {
      expect(field(name, 'feeBearer')?.attributes).toContain('@default(COMPANY)');
      expect(field(name, 'clearingStatus')?.attributes).toContain('@default(NOT_APPLICABLE)');
    }
  });

  it('declares the plain unique keys of §6.2', () => {
    const blocks = (name: string) => model(name).blockAttributes.join('\n');
    expect(blocks('Membership')).toContain('@@unique([organizationId, userId]');
    expect(blocks('RolePermission')).toContain('@@id([roleId, permissionId]');
    expect(blocks('DocumentSequence')).toContain('@@id([organizationId, docType, year]');
    expect(blocks('CostCategory')).toContain('@@unique([organizationId, code]');
    expect(blocks('Project')).toContain('@@unique([organizationId, projectCode]');
    expect(blocks('ProjectMember')).toContain('@@id([projectId, userId]');
    expect(blocks('ChangeOrder')).toContain('@@unique([organizationId, projectId, changeOrderNo]');
    expect(blocks('ProjectBudget')).toContain('@@unique([projectId, costCategoryId]');
    expect(blocks('ProgressBilling')).toContain('@@unique([projectId, periodNo]');
    expect(blocks('ProgressBillingChangeOrder')).toContain(
      '@@unique([progressBillingId, changeOrderId]',
    );
    expect(blocks('AttachmentLink')).toContain('@@index([organizationId, entityType, entityId]');
    expect(blocks('BankTransaction')).toContain('@@index([bankAccountId, txnDate]');
    expect(blocks('BankTransaction')).toContain('@@index([organizationId, sourceType, sourceId]');
  });

  it('does not use a Prisma @@unique for Role codes (partial indexes I-03 / I-04)', () => {
    expect(model('Role').blockAttributes).toEqual([]);
  });
});

describe('enums (§6.1)', () => {
  const prismaEnums = parseEnums();
  const shared = new Map(
    Object.entries(sharedEnums).filter(
      ([, value]) => typeof value === 'object' && Object.isFrozen(value),
    ) as [string, Record<string, string>][],
  );
  /** Shared-only enums that are not database columns. */
  const SHARED_ONLY = ['SystemRoleCode', 'AllocationState'];

  it('declares the 35 enums of §6.1', () => {
    expect(prismaEnums.size).toBe(35);
  });

  it('matches packages/shared enums value for value (TD-23)', () => {
    for (const [name, values] of prismaEnums) {
      const sharedEnum = shared.get(name);
      expect(sharedEnum, `shared enum ${name}`).toBeDefined();
      expect(Object.values(sharedEnum ?? {}), name).toEqual(values);
    }
  });

  it('has a Prisma enum for every shared enum except the shared-only ones', () => {
    const missing = [...shared.keys()].filter(
      (name) => !prismaEnums.has(name) && !SHARED_ONLY.includes(name),
    );
    expect(missing).toEqual([]);
  });
});

describe('relations and composite foreign keys (§6.5)', () => {
  it('uses RESTRICT for every relation on delete and update (§6.5 rule 5)', () => {
    for (const relation of relations) {
      const where = `${relation.model}.${relation.field}`;
      expect(relation.onDelete, where).toBe('Restrict');
      expect(relation.onUpdate, where).toBe('Restrict');
    }
  });

  it('gives every core and master table an (organizationId, id) target', () => {
    for (const table of [...CORE_TABLES, ...MASTER_TABLES]) {
      expect(model(table).blockAttributes, table).toContain(
        `@@unique([organizationId, id], map: "${snakeCase(table)}_org_id_key")`,
      );
    }
  });

  it('uses composite (organizationId, xId) relations from core tables to core / master tables', () => {
    const scoped = new Set<string>([...CORE_TABLES, ...MASTER_TABLES]);
    const core = new Set<string>(CORE_TABLES);
    const required = relations.filter(
      (r) => (core.has(r.model) || core.has(r.target)) && scoped.has(r.target),
    );
    expect(required.length).toBeGreaterThan(30);
    for (const relation of required) {
      const where = `${relation.model}.${relation.field}`;
      expect(relation.fields[0], where).toBe('organizationId');
      expect(relation.references, where).toEqual(['organizationId', 'id']);
      expect(relation.map, where).toBe(
        `${snakeCase(relation.model)}_${snakeCase(relation.fields[1] ?? '')}_org_fkey`,
      );
    }
  });

  it('points User references at the single-column id (§6.5 rule 3)', () => {
    for (const relation of relations.filter((r) => r.target === 'User')) {
      expect(relation.fields, `${relation.model}.${relation.field}`).toHaveLength(1);
    }
  });

  it('names every constraint and index in snake_case within 63 bytes (§6.5 naming)', () => {
    const names = mappedNames();
    expect(names.length).toBeGreaterThan(200);
    for (const name of names) {
      expect(name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(Buffer.byteLength(name), name).toBeLessThanOrEqual(63);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
