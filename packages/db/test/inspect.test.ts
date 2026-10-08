// Offline tests of the migration safety checks carried over from Gate 0 (ADR-034 TC-16,
// TC-20 / TC-21). The fixture is the real draft rejected in run 37645666192 (never applied).
import { describe, expect, it } from 'vitest';
import { PROTECTED_OBJECT_NAMES } from '../prisma/constraints.registry.js';
import {
  MANUAL_SECTION_MARKER,
  inspectDriftScript,
  inspectMigrationDraft,
  splitMigration,
  statementLines,
} from '../src/migration/inspect.js';
import { readText } from './support/sources.js';

const gate0Draft = readText('test/fixtures/run-37645666192-hybrid-add-note.sql');
const ADD_COLUMN = '-- AlterTable\nALTER TABLE "Payment" ADD COLUMN     "note2" TEXT;\n';

describe('inspectMigrationDraft', () => {
  it('rejects the real Gate 0 draft because of its DROP statements', () => {
    const result = inspectMigrationDraft(gate0Draft, PROTECTED_OBJECT_NAMES);
    expect(result.ok).toBe(false);
    expect(result.offendingLines).toEqual([
      'ALTER TABLE "PocAllocation" DROP CONSTRAINT "poc_allocation_payment_id_org_fkey";',
      'ALTER TABLE "PocPayment" DROP CONSTRAINT "poc_payment_vendor_id_org_fkey";',
      'DROP INDEX "poc_payment_org_id_key";',
      'DROP INDEX "poc_vendor_org_id_key";',
    ]);
  });

  it('accepts an additive draft', () => {
    expect(inspectMigrationDraft(ADD_COLUMN, PROTECTED_OBJECT_NAMES)).toEqual({
      ok: true,
      offendingLines: [],
      reasons: [],
    });
  });

  it('rejects an empty draft or one with comments only (possible silent engine failure)', () => {
    expect(inspectMigrationDraft('', PROTECTED_OBJECT_NAMES).ok).toBe(false);
    expect(
      inspectMigrationDraft('-- This is an empty migration.\n', PROTECTED_OBJECT_NAMES).ok,
    ).toBe(false);
  });

  it.each([
    'payable_payment_pair_active_key',
    'expense_org_id_key',
    'payable_payment_payable_id_org_fkey',
    'receivable_status_not_overdue_check',
  ])('rejects a draft that touches protected %s', (name) => {
    const draft = `${ADD_COLUMN}ALTER TABLE "X" VALIDATE CONSTRAINT "${name}";\n`;
    expect(inspectMigrationDraft(draft, PROTECTED_OBJECT_NAMES).ok).toBe(false);
  });

  it('protects every registry object except the privilege entry', () => {
    expect(PROTECTED_OBJECT_NAMES).toContain('payment_fee_bearer_amounts_check');
    expect(PROTECTED_OBJECT_NAMES).toContain('expense_vendor_id_org_fkey');
    expect(PROTECTED_OBJECT_NAMES).not.toContain('audit_log_app_user_revoked_privileges');
  });
});

describe('inspectDriftScript', () => {
  it('passes no drift: empty script with exit 0', () => {
    expect(inspectDriftScript('', 0, PROTECTED_OBJECT_NAMES)).toMatchObject({
      ok: true,
      drift: 'none',
    });
    expect(
      inspectDriftScript('-- This is an empty migration.\n', 0, PROTECTED_OBJECT_NAMES).ok,
    ).toBe(true);
  });

  it('records non-destructive drift with exit 2', () => {
    expect(inspectDriftScript(ADD_COLUMN, 2, PROTECTED_OBJECT_NAMES)).toMatchObject({
      ok: true,
      drift: 'non-destructive',
    });
  });

  it('rejects destructive drift, inconsistent exit codes and unexpected codes', () => {
    expect(inspectDriftScript(gate0Draft, 2, PROTECTED_OBJECT_NAMES).ok).toBe(false);
    expect(inspectDriftScript('', 2, PROTECTED_OBJECT_NAMES).ok).toBe(false);
    expect(inspectDriftScript(ADD_COLUMN, 0, PROTECTED_OBJECT_NAMES).ok).toBe(false);
    expect(inspectDriftScript('', 1, PROTECTED_OBJECT_NAMES).ok).toBe(false);
  });
});

describe('splitMigration', () => {
  it('splits at the manual marker and keeps the generated SQL byte-identical', () => {
    const generated = '-- CreateTable\nCREATE TABLE "A" ();\n';
    const manual = `${MANUAL_SECTION_MARKER} (…)\nALTER TABLE "A" ADD CONSTRAINT "a_check" CHECK (true);\n`;
    expect(splitMigration(`${generated}\n${manual}`)).toEqual({ generated, manual });
  });

  it('returns everything as generated SQL when there is no manual section', () => {
    expect(splitMigration('SELECT 1;\n')).toEqual({ generated: 'SELECT 1;\n', manual: '' });
  });

  it('ignores comments and blank lines when listing statements', () => {
    expect(statementLines('-- a\n\n  SELECT 1;\n')).toEqual(['SELECT 1;']);
  });
});
