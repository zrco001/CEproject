// Offline consistency tests: schema, migration SQL, registry, cases and workflow agree with
// PHASE-2-GATE-0-PLAN.md and ARCHITECTURE.md §6.5 (no database needed).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { CASES, FK_CASE_IDS } from '../scripts/cases.mjs';
import {
  MANUAL_CONSTRAINTS,
  NATIVE_VARIANT_NAMES,
  compareWithRegistry,
  auditForeignKeyActions,
} from '../scripts/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const migrationDirs = readdirSync(path.join(root, 'prisma/migrations'), {
  withFileTypes: true,
}).filter((d) => d.isDirectory());
const initSql = read(`prisma/migrations/${migrationDirs[0].name}/migration.sql`);
const hybridSchema = read('prisma/schema.prisma');
const nativeSchema = read('variants/native/schema.prisma');

describe('committed migration', () => {
  it('has exactly one migration (the init migration)', () => {
    assert.equal(migrationDirs.length, 1);
  });

  it('declares every registry constraint exactly once', () => {
    for (const { name } of MANUAL_CONSTRAINTS) {
      const occurrences = initSql.split(`"${name}"`).length - 1;
      assert.equal(occurrences, 1, `${name} appears ${occurrences} times`);
    }
    assert.equal(MANUAL_CONSTRAINTS.length, 8);
  });

  it('uses ON DELETE RESTRICT ON UPDATE RESTRICT for every foreign key and never CASCADE / SET NULL', () => {
    const fks = initSql.split(';').filter((s) => s.includes('FOREIGN KEY'));
    assert.equal(fks.length, 7);
    for (const fk of fks) {
      assert.match(fk, /ON DELETE RESTRICT/);
      assert.match(fk, /ON UPDATE RESTRICT/);
    }
    assert.doesNotMatch(initSql, /CASCADE|SET NULL|SET DEFAULT/i);
  });

  it('keeps the partial unique index predicate', () => {
    assert.match(
      initSql,
      /CREATE UNIQUE INDEX "poc_allocation_pair_active_key"[\s\S]*WHERE "voidedAt" IS NULL/,
    );
  });
});

describe('schemas', () => {
  for (const [label, schema] of [
    ['hybrid', hybridSchema],
    ['native', nativeSchema],
  ]) {
    it(`${label}: every relation sets onDelete: Restrict and onUpdate: Restrict`, () => {
      const relations = schema.split('\n').filter((l) => l.includes('@relation(fields'));
      assert.ok(relations.length >= 5);
      for (const line of relations) {
        assert.match(line, /onDelete: Restrict/, line);
        assert.match(line, /onUpdate: Restrict/, line);
      }
      assert.doesNotMatch(schema, /SetNull|Cascade|SetDefault/);
    });
  }

  it('native variant declares the required and the optional composite relation', () => {
    assert.match(
      nativeSchema,
      /payment\s+PocPayment\s+@relation\(fields: \[organizationId, paymentId\]/,
    );
    assert.match(
      nativeSchema,
      /vendor\s+PocVendor\?\s+@relation\(fields: \[organizationId, vendorId\]/,
    );
  });

  it('is marked as a PoC, not the production schema', () => {
    assert.match(hybridSchema, /NOT the production schema/);
    assert.match(nativeSchema, /NOT the production schema/);
  });
});

describe('test cases', () => {
  it('cover TC-01..TC-15 (TC-15 split into a/b/c)', () => {
    const ids = CASES.map((c) => c.id);
    const expected = [
      'TC-01',
      'TC-02',
      'TC-03',
      'TC-04',
      'TC-05',
      'TC-06',
      'TC-07',
      'TC-08',
      'TC-09',
      'TC-10',
      'TC-11',
      'TC-12',
      'TC-13',
      'TC-14',
      'TC-15a',
      'TC-15b',
      'TC-15c',
    ];
    assert.deepEqual(ids, expected);
  });

  it('only expect constraint names that exist in the migration', () => {
    for (const testCase of CASES) {
      if (testCase.expect === 'ok') continue;
      for (const name of testCase.expect.constraints) {
        assert.ok(
          initSql.includes(`"${name}"`),
          `${testCase.id} expects unknown constraint ${name}`,
        );
      }
    }
  });

  it('native re-run uses only composite-FK cases', () => {
    for (const id of FK_CASE_IDS) assert.ok(CASES.some((c) => c.id === id && c.gate === 'G0-3'));
    for (const name of NATIVE_VARIANT_NAMES)
      assert.ok(MANUAL_CONSTRAINTS.some((c) => c.name === name));
  });
});

describe('registry comparison (synthetic catalog)', () => {
  const catalog = {
    constraints: [
      {
        name: 'poc_vendor_org_id_key',
        type: 'u',
        table: 'PocVendor',
        definition: 'UNIQUE ("organizationId", id)',
      },
      {
        name: 'poc_payment_org_id_key',
        type: 'u',
        table: 'PocPayment',
        definition: 'UNIQUE ("organizationId", id)',
      },
      {
        name: 'poc_allocation_payment_id_org_fkey',
        type: 'f',
        table: 'PocAllocation',
        definition:
          'FOREIGN KEY ("organizationId", "paymentId") REFERENCES "PocPayment"("organizationId", id) ON UPDATE RESTRICT ON DELETE RESTRICT',
        on_update: 'r',
        on_delete: 'r',
      },
      {
        name: 'poc_payment_vendor_id_org_fkey',
        type: 'f',
        table: 'PocPayment',
        definition:
          'FOREIGN KEY ("organizationId", "vendorId") REFERENCES "PocVendor"("organizationId", id) ON UPDATE RESTRICT ON DELETE RESTRICT',
        on_update: 'r',
        on_delete: 'r',
      },
      {
        name: 'poc_payment_fee_bearer_amounts_check',
        type: 'c',
        table: 'PocPayment',
        definition: 'CHECK (...)',
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
        definition: 'CHECK (...)',
      },
    ],
    indexes: [
      {
        name: 'poc_allocation_pair_active_key',
        table: 'PocAllocation',
        definition:
          'CREATE UNIQUE INDEX poc_allocation_pair_active_key ON public."PocAllocation" USING btree ("paymentId", "targetKey") WHERE ("voidedAt" IS NULL)',
      },
    ],
  };

  it('accepts a complete catalog', () => {
    assert.deepEqual(compareWithRegistry(catalog), {
      ok: true,
      present: MANUAL_CONSTRAINTS.map((c) => c.name),
      missing: [],
      mismatched: [],
    });
  });

  it('reports a dropped constraint as missing (TC-22 logic)', () => {
    const dropped = {
      ...catalog,
      constraints: catalog.constraints.filter(
        (c) => c.name !== 'poc_payment_fee_bearer_amounts_check',
      ),
    };
    const result = compareWithRegistry(dropped);
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ['poc_payment_fee_bearer_amounts_check']);
  });

  it('flags a composite FK with ON UPDATE CASCADE (TC-25 logic)', () => {
    const cascading = {
      ...catalog,
      constraints: catalog.constraints.map((c) =>
        c.name === 'poc_allocation_payment_id_org_fkey' ? { ...c, on_update: 'c' } : c,
      ),
    };
    assert.deepEqual(compareWithRegistry(cascading).mismatched, [
      'poc_allocation_payment_id_org_fkey',
    ]);
    assert.equal(auditForeignKeyActions(cascading).ok, false);
  });

  it('flags a partial index that lost its predicate', () => {
    const noPredicate = {
      ...catalog,
      indexes: [
        {
          ...catalog.indexes[0],
          definition:
            'CREATE UNIQUE INDEX poc_allocation_pair_active_key ON public."PocAllocation" USING btree ("paymentId", "targetKey")',
        },
      ],
    };
    assert.deepEqual(compareWithRegistry(noPredicate).mismatched, [
      'poc_allocation_pair_active_key',
    ]);
  });
});
