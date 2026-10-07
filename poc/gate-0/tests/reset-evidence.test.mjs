// Regression tests for Codex review of bf06980, finding 2:
// a reset that exits 0 but does not rebuild the database must fail TC-18.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assessResetEvidence } from '../scripts/reset-evidence.mjs';

const t = (iso) => new Date(iso);
const migrations = (finishedAt) => [
  { name: '20261007000000_init', finished_at: t(finishedAt), rolled_back_at: null },
  { name: '20261007000100_add_note', finished_at: t(finishedAt), rolled_back_at: null },
];

const before = {
  takenAt: t('2026-10-07T10:00:00Z'),
  markerCount: 1,
  tableOids: { PocAllocation: 16401, PocOrg: 16385, PocPayment: 16394, PocVendor: 16388 },
  migrations: migrations('2026-10-07T09:59:00Z'),
};

const rebuilt = {
  takenAt: t('2026-10-07T10:00:05Z'),
  markerCount: 0,
  tableOids: { PocAllocation: 16501, PocOrg: 16485, PocPayment: 16494, PocVendor: 16488 },
  migrations: migrations('2026-10-07T10:00:03Z'),
};

describe('assessResetEvidence', () => {
  it('accepts a real rebuild', () => {
    assert.deepEqual(assessResetEvidence(before, rebuilt, { expectedMigrations: 2 }), {
      ok: true,
      reasons: [],
    });
  });

  it('rejects a no-op reset (nothing changed)', () => {
    const result = assessResetEvidence(before, { ...before }, { expectedMigrations: 2 });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes('marker row still present')));
    assert.ok(result.reasons.some((r) => r.includes('not recreated')));
    assert.ok(result.reasons.some((r) => r.includes('not re-applied')));
  });

  it('rejects a reset that deleted data but kept the tables', () => {
    const truncatedOnly = { ...before, markerCount: 0 };
    const result = assessResetEvidence(before, truncatedOnly, { expectedMigrations: 2 });
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((r) => r.includes('not recreated')));
  });

  it('rejects when migrations were not re-applied after the snapshot', () => {
    const oldMigrations = { ...rebuilt, migrations: migrations('2026-10-07T09:59:00Z') };
    assert.equal(assessResetEvidence(before, oldMigrations, { expectedMigrations: 2 }).ok, false);
  });

  it('rejects a missing or rolled-back migration', () => {
    const missing = { ...rebuilt, migrations: rebuilt.migrations.slice(0, 1) };
    assert.equal(assessResetEvidence(before, missing, { expectedMigrations: 2 }).ok, false);
    const rolledBack = {
      ...rebuilt,
      migrations: rebuilt.migrations.map((m) => ({
        ...m,
        rolled_back_at: t('2026-10-07T10:00:04Z'),
      })),
    };
    assert.equal(assessResetEvidence(before, rolledBack, { expectedMigrations: 2 }).ok, false);
  });

  it('rejects when the marker was never written (invalid setup)', () => {
    const noMarker = { ...before, markerCount: 0 };
    assert.equal(assessResetEvidence(noMarker, rebuilt, { expectedMigrations: 2 }).ok, false);
  });

  it('rejects a changed table set', () => {
    const fewer = { ...rebuilt, tableOids: { PocOrg: 1, PocVendor: 2, PocPayment: 3 } };
    assert.equal(assessResetEvidence(before, fewer, { expectedMigrations: 2 }).ok, false);
  });
});
