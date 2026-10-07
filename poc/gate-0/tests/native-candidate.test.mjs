// Offline tests for the native-candidate strategy: committed init migration and the full
// registry with native UNIQUE INDEX targets (no database; does not import the runner).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  MANUAL_CONSTRAINTS,
  auditForeignKeyActions,
  compareWithRegistry,
  normalizeCheck,
} from '../scripts/registry.mjs';
import { STRATEGIES } from '../scripts/strategy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const strategy = STRATEGIES['native-candidate'];
const dirs = readdirSync(path.join(root, strategy.migrations), { withFileTypes: true }).filter(
  (d) => d.isDirectory(),
);
const candidateSql = read(`${strategy.migrations}/${dirs[0].name}/migration.sql`);
const baselineSql = read('prisma/migrations/20261007000000_init/migration.sql');
const options = strategy.registryOptions;

describe('native-candidate init migration', () => {
  it('is a single init migration', () => {
    assert.equal(dirs.length, 1);
  });

  it('declares every registry object exactly once', () => {
    for (const { name } of MANUAL_CONSTRAINTS) {
      assert.equal(candidateSql.split(`"${name}"`).length - 1, 1, name);
    }
  });

  it('creates the composite unique targets natively as UNIQUE INDEXes', () => {
    assert.match(
      candidateSql,
      /CREATE UNIQUE INDEX "poc_vendor_org_id_key" ON "PocVendor"\("organizationId", "id"\);/,
    );
    assert.match(
      candidateSql,
      /CREATE UNIQUE INDEX "poc_payment_org_id_key" ON "PocPayment"\("organizationId", "id"\);/,
    );
  });

  it('declares both composite FKs natively with RESTRICT update/delete', () => {
    assert.match(
      candidateSql,
      /ADD CONSTRAINT "poc_allocation_payment_id_org_fkey" FOREIGN KEY \("organizationId", "paymentId"\) REFERENCES "PocPayment"\("organizationId", "id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/,
    );
    assert.match(
      candidateSql,
      /ADD CONSTRAINT "poc_payment_vendor_id_org_fkey" FOREIGN KEY \("organizationId", "vendorId"\) REFERENCES "PocVendor"\("organizationId", "id"\) ON DELETE RESTRICT ON UPDATE RESTRICT;/,
    );
    // No single-column FK on paymentId / vendorId: the composite FKs replace them.
    assert.doesNotMatch(candidateSql, /FOREIGN KEY \("paymentId"\)|FOREIGN KEY \("vendorId"\)/);
  });

  it('uses RESTRICT for every FK and never CASCADE / SET NULL / SET DEFAULT', () => {
    const fks = candidateSql.split(';').filter((s) => s.includes('FOREIGN KEY'));
    assert.equal(fks.length, 5);
    for (const fk of fks) {
      assert.match(fk, /ON DELETE RESTRICT/);
      assert.match(fk, /ON UPDATE RESTRICT/);
    }
    assert.doesNotMatch(candidateSql, /CASCADE|SET NULL|SET DEFAULT/i);
  });

  it('keeps single-column id primary keys and the nullable vendorId', () => {
    for (const table of ['PocOrg', 'PocVendor', 'PocPayment', 'PocAllocation']) {
      assert.match(candidateSql, new RegExp(`CONSTRAINT "${table}_pkey" PRIMARY KEY \\("id"\\)`));
    }
    assert.match(candidateSql, /"vendorId" TEXT,/);
  });

  it('appends the 3 CHECKs and the partial unique index byte-identical to the baseline', () => {
    const marker = '-- Enum-branch amount CHECK (mirrors I-11)';
    const baselineAppendix = baselineSql.slice(baselineSql.indexOf(marker));
    assert.ok(baselineAppendix.length > 0);
    assert.ok(candidateSql.endsWith(baselineAppendix));
  });

  it('CHECK conditions equal the registry conditions', () => {
    for (const entry of MANUAL_CONSTRAINTS.filter((c) => c.kind === 'check')) {
      const match = new RegExp(`ADD CONSTRAINT "${entry.name}" CHECK ([\\s\\S]*?);\\n`).exec(
        candidateSql,
      );
      assert.ok(match, entry.name);
      assert.equal(normalizeCheck(match[1]), normalizeCheck(entry.condition), entry.name);
    }
  });
});

describe('native-candidate full registry (synthetic PostgreSQL catalog)', () => {
  const fk = (name, table, columns, refTable, extra = {}) => ({
    name,
    type: 'f',
    table,
    definition: `FOREIGN KEY ("organizationId", "${columns}") REFERENCES "${refTable}"("organizationId", id) ON UPDATE RESTRICT ON DELETE RESTRICT`,
    on_update: 'r',
    on_delete: 'r',
    ...extra,
  });
  const catalog = {
    constraints: [
      fk('poc_allocation_payment_id_org_fkey', 'PocAllocation', 'paymentId', 'PocPayment'),
      fk('poc_payment_vendor_id_org_fkey', 'PocPayment', 'vendorId', 'PocVendor'),
      {
        name: 'poc_payment_fee_bearer_amounts_check',
        type: 'c',
        table: 'PocPayment',
        definition:
          'CHECK (((("feeBearer" = \'COMPANY\'::"PocFeeBearer") AND ("bankOutflowAmount" = ("paymentAmount" + "feeAmount")) AND ("payeeReceivedAmount" = "paymentAmount")) OR (("feeBearer" = \'COUNTERPARTY\'::"PocFeeBearer") AND ("feeAmount" < "paymentAmount") AND ("bankOutflowAmount" = "paymentAmount") AND ("payeeReceivedAmount" = ("paymentAmount" - "feeAmount")))))',
      },
      {
        name: 'poc_allocation_amount_positive_check',
        type: 'c',
        table: 'PocAllocation',
        definition: 'CHECK ((amount > (0)::numeric))',
      },
      {
        name: 'poc_allocation_void_fields_check',
        type: 'c',
        table: 'PocAllocation',
        definition:
          'CHECK (((("voidedAt" IS NULL) = ("voidedById" IS NULL)) AND (("voidedAt" IS NULL) = ("voidReason" IS NULL))))',
      },
    ],
    indexes: [
      {
        name: 'poc_vendor_org_id_key',
        table: 'PocVendor',
        definition:
          'CREATE UNIQUE INDEX poc_vendor_org_id_key ON public."PocVendor" USING btree ("organizationId", id)',
      },
      {
        name: 'poc_payment_org_id_key',
        table: 'PocPayment',
        definition:
          'CREATE UNIQUE INDEX poc_payment_org_id_key ON public."PocPayment" USING btree ("organizationId", id)',
      },
      {
        name: 'poc_allocation_pair_active_key',
        table: 'PocAllocation',
        definition:
          'CREATE UNIQUE INDEX poc_allocation_pair_active_key ON public."PocAllocation" USING btree ("paymentId", "targetKey") WHERE ("voidedAt" IS NULL)',
      },
    ],
  };

  const withIndex = (name, definition) => ({
    ...catalog,
    indexes: catalog.indexes.map((i) => (i.name === name ? { ...i, definition } : i)),
  });
  const withConstraint = (name, patch) => ({
    ...catalog,
    constraints: catalog.constraints.map((c) => (c.name === name ? { ...c, ...patch } : c)),
  });

  it('accepts the native catalog against all 8 registry entries', () => {
    const result = compareWithRegistry(catalog, options);
    assert.equal(result.ok, true);
    assert.deepEqual(
      result.present,
      MANUAL_CONSTRAINTS.map((c) => c.name),
    );
  });

  it('does not accept native UNIQUE INDEX targets without uniqueMayBeIndex', () => {
    assert.deepEqual(compareWithRegistry(catalog).missing, [
      'poc_vendor_org_id_key',
      'poc_payment_org_id_key',
    ]);
  });

  const weakened = {
    'partial unique index without the voidedAt predicate': [
      'poc_allocation_pair_active_key',
      withIndex(
        'poc_allocation_pair_active_key',
        'CREATE UNIQUE INDEX poc_allocation_pair_active_key ON public."PocAllocation" USING btree ("paymentId", "targetKey")',
      ),
    ],
    'partial unique index on paymentId only': [
      'poc_allocation_pair_active_key',
      withIndex(
        'poc_allocation_pair_active_key',
        'CREATE UNIQUE INDEX poc_allocation_pair_active_key ON public."PocAllocation" USING btree ("paymentId") WHERE ("voidedAt" IS NULL)',
      ),
    ],
    'partial index that is not unique': [
      'poc_allocation_pair_active_key',
      withIndex(
        'poc_allocation_pair_active_key',
        'CREATE INDEX poc_allocation_pair_active_key ON public."PocAllocation" USING btree ("paymentId", "targetKey") WHERE ("voidedAt" IS NULL)',
      ),
    ],
    'org unique target without organizationId': [
      'poc_payment_org_id_key',
      withIndex(
        'poc_payment_org_id_key',
        'CREATE UNIQUE INDEX poc_payment_org_id_key ON public."PocPayment" USING btree (id)',
      ),
    ],
    'org FK reduced to a single column': [
      'poc_allocation_payment_id_org_fkey',
      withConstraint('poc_allocation_payment_id_org_fkey', {
        definition:
          'FOREIGN KEY ("paymentId") REFERENCES "PocPayment"(id) ON UPDATE RESTRICT ON DELETE RESTRICT',
      }),
    ],
    'org FK with ON UPDATE CASCADE': [
      'poc_allocation_payment_id_org_fkey',
      withConstraint('poc_allocation_payment_id_org_fkey', { on_update: 'c' }),
    ],
    'optional org FK with ON DELETE SET NULL': [
      'poc_payment_vendor_id_org_fkey',
      withConstraint('poc_payment_vendor_id_org_fkey', { on_delete: 'n' }),
    ],
    'void-fields CHECK without the voidReason condition': [
      'poc_allocation_void_fields_check',
      withConstraint('poc_allocation_void_fields_check', {
        definition: 'CHECK ((("voidedAt" IS NULL) = ("voidedById" IS NULL)))',
      }),
    ],
  };
  for (const [label, [name, weakCatalog]] of Object.entries(weakened)) {
    it(`flags ${label}`, () => {
      const result = compareWithRegistry(weakCatalog, options);
      assert.equal(result.ok, false);
      assert.deepEqual(result.mismatched, [name]);
    });
  }

  it('flags a missing native composite FK', () => {
    const missing = {
      ...catalog,
      constraints: catalog.constraints.filter((c) => c.name !== 'poc_payment_vendor_id_org_fkey'),
    };
    assert.deepEqual(compareWithRegistry(missing, options).missing, [
      'poc_payment_vendor_id_org_fkey',
    ]);
  });

  it('FK audit fails on CASCADE / SET NULL', () => {
    assert.equal(auditForeignKeyActions(catalog).ok, true);
    assert.equal(
      auditForeignKeyActions(withConstraint('poc_payment_vendor_id_org_fkey', { on_delete: 'n' }))
        .ok,
      false,
    );
  });
});
