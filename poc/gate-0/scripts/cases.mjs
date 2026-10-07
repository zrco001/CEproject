// SQL test cases TC-01..TC-15 (PHASE-2-GATE-0-PLAN.md §6, G0-1..G0-3).
// All cases run inside one transaction that is rolled back at the end, and each case runs in
// its own savepoint, so cases are independent and the database is left unchanged.
// Data is synthetic only.

export const SQLSTATE = Object.freeze({
  CHECK_VIOLATION: '23514',
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  // ON DELETE / ON UPDATE RESTRICT on the referenced side raises restrict_violation;
  // NO ACTION would raise 23503. §6.5 allows either, so TC-14 / TC-15a accept both and record which.
  RESTRICT_VIOLATION: '23001',
});

const BLOCKED_BY_REFERENCED_FK = [SQLSTATE.RESTRICT_VIOLATION, SQLSTATE.FOREIGN_KEY_VIOLATION];

const payment = (id, org, vendor, feeBearer, amount, fee, outflow, received) =>
  `INSERT INTO "PocPayment" ("id","organizationId","vendorId","feeBearer","paymentAmount","feeAmount","bankOutflowAmount","payeeReceivedAmount")
   VALUES ('${id}', '${org}', ${vendor === null ? 'NULL' : `'${vendor}'`}, '${feeBearer}', ${amount}, ${fee}, ${outflow}, ${received})`;

const allocation = (id, org, paymentId, targetKey, amount, voided = null) =>
  `INSERT INTO "PocAllocation" ("id","organizationId","paymentId","targetKey","amount","voidedAt","voidedById","voidReason")
   VALUES ('${id}', '${org}', '${paymentId}', '${targetKey}', ${amount}, ${
     voided ? `now(), '${voided.by}', '${voided.reason}'` : 'NULL, NULL, NULL'
   })`;

const voidAllocation = (id, reason) =>
  `UPDATE "PocAllocation" SET "voidedAt" = now(), "voidedById" = 'user-1', "voidReason" = '${reason}' WHERE "id" = '${id}'`;

/** Baseline data shared by every case (two organizations, synthetic amounts). */
export const SEED = Object.freeze([
  `INSERT INTO "PocOrg" ("id") VALUES ('org_A'), ('org_B')`,
  `INSERT INTO "PocVendor" ("id","organizationId") VALUES ('ven_A', 'org_A'), ('ven_B', 'org_B')`,
  payment('pay_A1', 'org_A', null, 'COMPANY', 100000, 30, 100030, 100000),
  payment('pay_A2', 'org_A', 'ven_A', 'COMPANY', 1000, 0, 1000, 1000),
  payment('pay_B1', 'org_B', null, 'COMPANY', 500, 0, 500, 500),
  allocation('alloc_A1', 'org_A', 'pay_A1', 'payable-1', 30000),
]);

/**
 * Each case: statements run in order; all but the last must succeed. The last statement must
 * either succeed (`expect: 'ok'`) or fail with the given SQLSTATE and one of the constraint
 * names. Optional `verify` queries run after the savepoint is rolled back.
 */
export const CASES = Object.freeze([
  // G0-1 CHECK constraints
  {
    id: 'TC-01',
    gate: 'G0-1',
    title: 'COMPANY payment with consistent amounts',
    statements: [payment('tc01', 'org_A', null, 'COMPANY', 100000, 30, 100030, 100000)],
    expect: 'ok',
  },
  {
    id: 'TC-02',
    gate: 'G0-1',
    title: 'COMPANY payment with bankOutflow missing the fee',
    statements: [payment('tc02', 'org_A', null, 'COMPANY', 100000, 30, 100000, 100000)],
    expect: {
      sqlstate: SQLSTATE.CHECK_VIOLATION,
      constraints: ['poc_payment_fee_bearer_amounts_check'],
    },
  },
  {
    id: 'TC-03',
    gate: 'G0-1',
    title: 'COUNTERPARTY payment with consistent amounts',
    statements: [payment('tc03', 'org_A', null, 'COUNTERPARTY', 100000, 30, 100000, 99970)],
    expect: 'ok',
  },
  {
    id: 'TC-04',
    gate: 'G0-1',
    title: 'COUNTERPARTY payment with fee >= payment',
    statements: [payment('tc04', 'org_A', null, 'COUNTERPARTY', 100000, 100000, 100000, 0)],
    expect: {
      sqlstate: SQLSTATE.CHECK_VIOLATION,
      constraints: ['poc_payment_fee_bearer_amounts_check'],
    },
  },
  {
    id: 'TC-05',
    gate: 'G0-1',
    title: 'Allocation amount = 0',
    statements: [allocation('tc05', 'org_A', 'pay_A1', 'payable-5', 0)],
    expect: {
      sqlstate: SQLSTATE.CHECK_VIOLATION,
      constraints: ['poc_allocation_amount_positive_check'],
    },
  },
  {
    id: 'TC-06',
    gate: 'G0-1',
    title: 'Allocation with voidedAt but without voidedById / voidReason',
    statements: [
      `INSERT INTO "PocAllocation" ("id","organizationId","paymentId","targetKey","amount","voidedAt") VALUES ('tc06', 'org_A', 'pay_A1', 'payable-6', 1, now())`,
    ],
    expect: {
      sqlstate: SQLSTATE.CHECK_VIOLATION,
      constraints: ['poc_allocation_void_fields_check'],
    },
  },

  // G0-2 Partial unique index
  {
    id: 'TC-07',
    gate: 'G0-2',
    title: 'Second active allocation for the same (payment, target)',
    statements: [allocation('tc07', 'org_A', 'pay_A1', 'payable-1', 100)],
    expect: {
      sqlstate: SQLSTATE.UNIQUE_VIOLATION,
      constraints: ['poc_allocation_pair_active_key'],
    },
  },
  {
    id: 'TC-08',
    gate: 'G0-2',
    title: 'Void the active allocation, then create a new active one for the same pair',
    statements: [
      voidAllocation('alloc_A1', 'TC-08'),
      allocation('tc08', 'org_A', 'pay_A1', 'payable-1', 100),
    ],
    expect: 'ok',
  },
  {
    id: 'TC-09',
    gate: 'G0-2',
    title: 'Two voided allocations for the same pair',
    statements: [
      voidAllocation('alloc_A1', 'TC-09'),
      allocation('tc09', 'org_A', 'pay_A1', 'payable-1', 100, { by: 'user-1', reason: 'TC-09' }),
    ],
    expect: 'ok',
  },

  // G0-3 Composite FK
  {
    id: 'TC-10',
    gate: 'G0-3',
    title: 'org_A allocation pointing at an org_B payment (required FK)',
    statements: [allocation('tc10', 'org_A', 'pay_B1', 'payable-10', 100)],
    expect: {
      sqlstate: SQLSTATE.FOREIGN_KEY_VIOLATION,
      constraints: ['poc_allocation_payment_id_org_fkey'],
    },
  },
  {
    id: 'TC-11',
    gate: 'G0-3',
    title: 'Same-organization allocation',
    statements: [allocation('tc11', 'org_A', 'pay_A2', 'payable-11', 100)],
    expect: 'ok',
  },
  {
    id: 'TC-12',
    gate: 'G0-3',
    title: 'Payment with NULL vendorId (optional FK, MATCH SIMPLE)',
    statements: [payment('tc12', 'org_A', null, 'COMPANY', 10, 0, 10, 10)],
    expect: 'ok',
  },
  {
    id: 'TC-13',
    gate: 'G0-3',
    title: 'org_A payment pointing at an org_B vendor (optional FK)',
    statements: [payment('tc13', 'org_A', 'ven_B', 'COMPANY', 10, 0, 10, 10)],
    expect: {
      sqlstate: SQLSTATE.FOREIGN_KEY_VIOLATION,
      constraints: ['poc_payment_vendor_id_org_fkey'],
    },
  },
  {
    id: 'TC-14',
    gate: 'G0-3',
    title: 'Delete a payment that has allocations (ON DELETE RESTRICT)',
    statements: [`DELETE FROM "PocPayment" WHERE "id" = 'pay_A1'`],
    // The hybrid schema also has Prisma's single-column FK; either restricting FK proves no cascade.
    expect: {
      sqlstate: BLOCKED_BY_REFERENCED_FK,
      constraints: ['poc_allocation_payment_id_org_fkey', 'PocAllocation_paymentId_fkey'],
    },
    verify: [
      {
        sql: `SELECT count(*)::int AS n FROM "PocPayment" WHERE "id" = 'pay_A1'`,
        expect: { n: 1 },
      },
    ],
  },
  {
    id: 'TC-15a',
    gate: 'G0-3',
    title: 'Change organizationId of a referenced payment (ON UPDATE RESTRICT, referenced side)',
    statements: [`UPDATE "PocPayment" SET "organizationId" = 'org_B' WHERE "id" = 'pay_A1'`],
    expect: {
      sqlstate: BLOCKED_BY_REFERENCED_FK,
      constraints: ['poc_allocation_payment_id_org_fkey'],
    },
    verify: [
      {
        sql: `SELECT "organizationId" AS org FROM "PocPayment" WHERE "id" = 'pay_A1'`,
        expect: { org: 'org_A' },
      },
      {
        sql: `SELECT "organizationId" AS org FROM "PocAllocation" WHERE "id" = 'alloc_A1'`,
        expect: { org: 'org_A' },
      },
    ],
  },
  {
    id: 'TC-15b',
    gate: 'G0-3',
    title: 'Change organizationId of an allocation (referencing side)',
    statements: [`UPDATE "PocAllocation" SET "organizationId" = 'org_B' WHERE "id" = 'alloc_A1'`],
    expect: {
      sqlstate: SQLSTATE.FOREIGN_KEY_VIOLATION,
      constraints: ['poc_allocation_payment_id_org_fkey'],
    },
    verify: [
      {
        sql: `SELECT "organizationId" AS org FROM "PocAllocation" WHERE "id" = 'alloc_A1'`,
        expect: { org: 'org_A' },
      },
    ],
  },
  {
    id: 'TC-15c',
    gate: 'G0-3',
    title:
      'Change organizationId of a payment that references a vendor (optional FK, referencing side)',
    statements: [`UPDATE "PocPayment" SET "organizationId" = 'org_B' WHERE "id" = 'pay_A2'`],
    expect: {
      sqlstate: SQLSTATE.FOREIGN_KEY_VIOLATION,
      constraints: ['poc_payment_vendor_id_org_fkey'],
    },
    verify: [
      {
        sql: `SELECT "organizationId" AS org FROM "PocPayment" WHERE "id" = 'pay_A2'`,
        expect: { org: 'org_A' },
      },
    ],
  },
]);

/** Composite-FK cases re-run against the native-relation variant (TC-23/24). */
export const FK_CASE_IDS = Object.freeze([
  'TC-10',
  'TC-11',
  'TC-12',
  'TC-13',
  'TC-14',
  'TC-15a',
  'TC-15b',
  'TC-15c',
]);

/**
 * Runs cases with any client exposing `query(sql)` that rejects with an error carrying
 * `code` (SQLSTATE) and `constraint`. Leaves the database unchanged.
 */
export async function runCases(client, ids = null) {
  const selected = ids ? CASES.filter((c) => ids.includes(c.id)) : CASES;
  const results = [];
  await client.query('BEGIN');
  try {
    for (const sql of SEED) await client.query(sql);
    for (const testCase of selected) {
      results.push(await runCase(client, testCase));
    }
  } finally {
    await client.query('ROLLBACK');
  }
  return results;
}

async function runCase(client, testCase) {
  const result = {
    id: testCase.id,
    gate: testCase.gate,
    title: testCase.title,
    passed: false,
    detail: '',
  };
  await client.query('SAVEPOINT tc');
  let outcome;
  try {
    for (const [i, sql] of testCase.statements.entries()) {
      try {
        await client.query(sql);
      } catch (error) {
        if (i < testCase.statements.length - 1) {
          result.detail = `setup statement ${i + 1} failed unexpectedly: ${error.code ?? ''} ${error.message}`;
          return result;
        }
        outcome = {
          error: { code: error.code, constraint: error.constraint, message: error.message },
        };
      }
    }
    outcome ??= { ok: true };
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT tc');
  }

  if (testCase.expect === 'ok') {
    result.passed = outcome.ok === true;
    result.detail = outcome.ok
      ? 'succeeded as expected'
      : `expected success, got ${outcome.error.code} ${outcome.error.constraint ?? ''}`;
  } else {
    const { sqlstate, constraints } = testCase.expect;
    const sqlstates = Array.isArray(sqlstate) ? sqlstate : [sqlstate];
    result.passed =
      !!outcome.error &&
      sqlstates.includes(outcome.error.code) &&
      constraints.includes(outcome.error.constraint);
    result.detail = outcome.error
      ? `got ${outcome.error.code} ${outcome.error.constraint ?? '(no constraint name)'}`
      : `expected ${sqlstates.join(' or ')}, but the statement succeeded`;
  }

  for (const check of testCase.verify ?? []) {
    const { rows } = await client.query(check.sql);
    const actual = rows[0] ?? {};
    const matches = Object.entries(check.expect).every(([key, value]) => actual[key] === value);
    if (!matches) {
      result.passed = false;
      result.detail += `; verify failed: ${JSON.stringify(actual)} != ${JSON.stringify(check.expect)}`;
    }
  }
  return result;
}
