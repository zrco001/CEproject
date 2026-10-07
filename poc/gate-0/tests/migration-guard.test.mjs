// Offline TC-16 regression tests. The fixture is the actual `migrate dev --create-only` draft
// that run 37645666192 (hybrid-baseline) generated and the runner rejected; it was never applied.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { inspectAddNoteMigration } from '../scripts/migration-guard.mjs';
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
