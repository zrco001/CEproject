// Offline tests for the disposable-database guard (no database, no Docker).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  GuardError,
  assertConfirmedCiRun,
  assertDisposableUrl,
  redactUrl,
} from '../scripts/guard.mjs';

describe('assertDisposableUrl', () => {
  it('accepts the disposable gate0 databases', () => {
    for (const db of ['gate0_main', 'gate0_shadow', 'gate0_fresh', 'gate0_native']) {
      assert.equal(assertDisposableUrl(`postgresql://gate0:pw@127.0.0.1:55432/${db}`), db);
    }
    assert.equal(
      assertDisposableUrl('postgres://gate0:pw@localhost:55432/gate0_main'),
      'gate0_main',
    );
  });

  const rejected = {
    'remote host': 'postgresql://u:p@db.example.com:55432/gate0_main',
    'docker service host': 'postgresql://u:p@postgres:55432/gate0_main',
    'compose port 5432': 'postgresql://u:p@127.0.0.1:5432/gate0_main',
    'default port': 'postgresql://u:p@127.0.0.1/gate0_main',
    'non-gate0 database': 'postgresql://u:p@127.0.0.1:55432/ceproject',
    'admin database': 'postgresql://u:p@127.0.0.1:55432/postgres',
    'prefix trick': 'postgresql://u:p@127.0.0.1:55432/xgate0_main',
    'unsafe characters': 'postgresql://u:p@127.0.0.1:55432/gate0_main%3Bdrop',
    'mysql protocol': 'mysql://u:p@127.0.0.1:55432/gate0_main',
    empty: '',
    'not a url': 'gate0_main',
  };
  for (const [label, url] of Object.entries(rejected)) {
    it(`rejects ${label}`, () => {
      assert.throws(() => assertDisposableUrl(url), GuardError);
    });
  }

  it('rejects an unset URL', () => {
    assert.throws(() => assertDisposableUrl(undefined), GuardError);
  });
});

describe('assertConfirmedCiRun', () => {
  it('requires GitHub Actions and the workflow confirmation flag', () => {
    assert.throws(() => assertConfirmedCiRun({}), GuardError);
    assert.throws(() => assertConfirmedCiRun({ GITHUB_ACTIONS: 'true' }), GuardError);
    assert.throws(() => assertConfirmedCiRun({ GATE0_DISPOSABLE_CONFIRMED: 'true' }), GuardError);
    assert.doesNotThrow(() =>
      assertConfirmedCiRun({ GITHUB_ACTIONS: 'true', GATE0_DISPOSABLE_CONFIRMED: 'true' }),
    );
  });
});

describe('redactUrl', () => {
  it('hides the password', () => {
    const redacted = redactUrl('postgresql://gate0:secret-value@127.0.0.1:55432/gate0_main');
    assert.ok(!redacted.includes('secret-value'));
    assert.ok(redacted.includes('***'));
  });
});
