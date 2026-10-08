// Offline TC-16 regression tests. The fixture is the actual `migrate dev --create-only` draft
// that run 37645666192 (hybrid-baseline) generated and the runner rejected; it was never applied.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectAddNoteMigration, inspectDriftScript } from '../scripts/migration-guard.mjs';
import { MANUAL_CONSTRAINTS } from '../scripts/registry.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failedDraft = readFileSync(
  path.join(root, 'tests/fixtures/run-37645666192-hybrid-add-note.sql'),
  'utf8',
);
const protectedNames = MANUAL_CONSTRAINTS.map((c) => c.name);
const SAFE_ADD_NOTE = '-- AlterTable\nALTER TABLE "PocPayment" ADD COLUMN     "note" TEXT;\n';

describe('inspectAddNoteMigration', () => {
  it('rejects the real failed hybrid draft from run 37645666192', () => {
    const result = inspectAddNoteMigration(failedDraft, protectedNames);
    assert.equal(result.ok, false);
    assert.equal(result.addsNote, true);
    assert.deepEqual(result.offendingLines, [
      'ALTER TABLE "PocAllocation" DROP CONSTRAINT "poc_allocation_payment_id_org_fkey";',
      'ALTER TABLE "PocPayment" DROP CONSTRAINT "poc_payment_vendor_id_org_fkey";',
      'DROP INDEX "poc_payment_org_id_key";',
      'DROP INDEX "poc_vendor_org_id_key";',
    ]);
  });

  it('accepts a draft that only adds the note column', () => {
    assert.deepEqual(inspectAddNoteMigration(SAFE_ADD_NOTE, protectedNames), {
      ok: true,
      addsNote: true,
      offendingLines: [],
      reasons: [],
    });
  });

  it('rejects a draft without the note column', () => {
    const result = inspectAddNoteMigration('-- nothing to do\n', protectedNames);
    assert.equal(result.ok, false);
    assert.equal(result.addsNote, false);
  });

  it('rejects a note column on another table', () => {
    const result = inspectAddNoteMigration(
      'ALTER TABLE "PocVendor" ADD COLUMN "note" TEXT;\n',
      protectedNames,
    );
    assert.equal(result.ok, false);
  });

  it('rejects an empty draft (possible silent engine failure)', () => {
    assert.equal(inspectAddNoteMigration('', protectedNames).ok, false);
    assert.equal(inspectAddNoteMigration('   \n', protectedNames).ok, false);
  });

  it('rejects any DROP, even of an unprotected object', () => {
    const result = inspectAddNoteMigration(
      `${SAFE_ADD_NOTE}DROP INDEX "some_other_index";\n`,
      protectedNames,
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.offendingLines, ['DROP INDEX "some_other_index";']);
  });

  for (const name of protectedNames) {
    it(`rejects a draft that touches protected ${name}`, () => {
      const result = inspectAddNoteMigration(
        `${SAFE_ADD_NOTE}ALTER TABLE "PocPayment" VALIDATE CONSTRAINT "${name}";\n`,
        protectedNames,
      );
      assert.equal(result.ok, false);
    });
  }
});

// Regression tests for Codex review of 052021b, finding P1: G0-7 (TC-20 / TC-21) must not pass
// destructive drift, and an empty script must not be accepted together with exit 2.
describe('inspectDriftScript (G0-7, TC-20 / TC-21)', () => {
  it('passes no drift: empty script with exit 0', () => {
    const result = inspectDriftScript('', 0, protectedNames);
    assert.equal(result.ok, true);
    assert.equal(result.drift, 'none');
  });

  it("passes Prisma's empty-migration comment with exit 0", () => {
    const result = inspectDriftScript('-- This is an empty migration.\n', 0, protectedNames);
    assert.equal(result.ok, true);
    assert.equal(result.drift, 'none');
  });

  it('rejects the real destructive draft as drift with exit 2', () => {
    const result = inspectDriftScript(failedDraft, 2, protectedNames);
    assert.equal(result.ok, false);
    assert.equal(result.offendingLines.length, 4);
    assert.ok(result.reasons.some((r) => r.includes('drop objects')));
  });

  it('rejects a DROP of an unprotected object with exit 2', () => {
    const result = inspectDriftScript('DROP INDEX "something_else";\n', 2, protectedNames);
    assert.equal(result.ok, false);
  });

  it('rejects a change that touches a protected object with exit 2', () => {
    const result = inspectDriftScript(
      'ALTER TABLE "PocPayment" RENAME CONSTRAINT "poc_payment_fee_bearer_amounts_check" TO "x";\n',
      2,
      protectedNames,
    );
    assert.equal(result.ok, false);
  });

  it('rejects an empty script paired with exit 2 (inconsistent / silent failure)', () => {
    assert.equal(inspectDriftScript('', 2, protectedNames).ok, false);
    assert.equal(
      inspectDriftScript('-- This is an empty migration.\n', 2, protectedNames).ok,
      false,
    );
    assert.equal(inspectDriftScript(undefined, 2, protectedNames).ok, false);
  });

  it('rejects SQL statements paired with exit 0 (inconsistent)', () => {
    assert.equal(inspectDriftScript(SAFE_ADD_NOTE, 0, protectedNames).ok, false);
  });

  it('allows and records non-destructive drift with exit 2', () => {
    const result = inspectDriftScript(SAFE_ADD_NOTE, 2, protectedNames);
    assert.equal(result.ok, true);
    assert.equal(result.drift, 'non-destructive');
    assert.deepEqual(result.statements, ['ALTER TABLE "PocPayment" ADD COLUMN     "note" TEXT;']);
  });

  it('rejects exit codes other than 0 / 2', () => {
    assert.equal(inspectDriftScript('', 1, protectedNames).ok, false);
    assert.equal(inspectDriftScript('', 137, protectedNames).ok, false);
  });
});

describe('runner wiring (static check; the runner is not imported)', () => {
  const runner = readFileSync(path.join(root, 'scripts/run-gate0.mjs'), 'utf8');

  it('inspects both TC-20 and TC-21 drift scripts before the TC-22 negative control', () => {
    const inspect = runner.indexOf('inspectDriftScript(script, exitCode, protectedNames)');
    const tc20 = runner.indexOf("['tc20', ev.tc20.stdout, ev.tc20ExitCode.exitCode]");
    const tc21 = runner.indexOf("['tc21', ev.tc21.stdout, ev.tc21ExitCode.exitCode]");
    const tc22 = runner.indexOf('// TC-22: drop one manual CHECK');
    assert.ok(inspect > 0 && tc20 > 0 && tc21 > 0 && tc22 > 0);
    assert.ok(tc20 < tc22 && tc21 < tc22 && inspect < tc22);
  });

  it('keeps the exit-2 positive controls', () => {
    assert.equal(runner.split('prismaPositiveControl(').length - 1, 3);
  });
});
