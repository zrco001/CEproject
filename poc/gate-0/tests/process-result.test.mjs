// Regression tests for Codex review of bf06980, finding 1:
// timeouts, signals, spawn errors and unexpected exit codes must never count as a result.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import {
  DIFF_EXIT_CODES,
  ProcessResultError,
  checkProcessResult,
} from '../scripts/process-result.mjs';

const diff = { label: 'prisma migrate diff --exit-code', allowedExitCodes: DIFF_EXIT_CODES };

describe('checkProcessResult (simulated results)', () => {
  it('accepts only the declared exit codes', () => {
    assert.equal(checkProcessResult({ status: 0, signal: null }, diff), 0);
    assert.equal(checkProcessResult({ status: 2, signal: null }, diff), 2);
    assert.equal(checkProcessResult({ status: 0, signal: null }, { label: 'deploy' }), 0);
  });

  it('rejects a timeout (status null, ETIMEDOUT)', () => {
    const timedOut = {
      status: null,
      signal: 'SIGTERM',
      error: Object.assign(new Error('spawnSync node ETIMEDOUT'), { code: 'ETIMEDOUT' }),
    };
    assert.throws(() => checkProcessResult(timedOut, diff), /timed out/);
  });

  it('rejects termination by signal', () => {
    assert.throws(
      () => checkProcessResult({ status: null, signal: 'SIGKILL' }, diff),
      /terminated by signal SIGKILL/,
    );
  });

  it('rejects a null status without signal or error', () => {
    assert.throws(() => checkProcessResult({ status: null, signal: null }, diff), /no exit status/);
  });

  it('rejects a spawn failure', () => {
    const notFound = {
      status: null,
      signal: null,
      error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
    };
    assert.throws(() => checkProcessResult(notFound, diff), /could not run \(ENOENT\)/);
  });

  for (const status of [1, 3, 127, 137, 255]) {
    it(`rejects diff exit code ${status}`, () => {
      assert.throws(() => checkProcessResult({ status, signal: null }, diff), ProcessResultError);
    });
  }

  it('rejects exit 2 where only 0 is allowed', () => {
    assert.throws(() => checkProcessResult({ status: 2, signal: null }, { label: 'deploy' }));
  });
});

describe('checkProcessResult (real child processes)', () => {
  const node = (code, options = {}) =>
    spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', ...options });

  it('rejects a child that exceeds the timeout', () => {
    const result = node('setTimeout(() => {}, 10_000)', { timeout: 200 });
    assert.throws(() => checkProcessResult(result, diff), ProcessResultError);
  });

  it('rejects a child exiting with 137', () => {
    assert.throws(() => checkProcessResult(node('process.exit(137)'), diff), /exited with 137/);
  });

  it('accepts a child exiting with 2 for diff', () => {
    assert.equal(checkProcessResult(node('process.exit(2)'), diff), 2);
  });
});
