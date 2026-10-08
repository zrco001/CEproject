// Offline tests of the disposable-database acceptance runner's decisions
// (scripts/db-acceptance/guards.ts). No Docker or database is used here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CONFIRMATION,
  DATA_DIR,
  IMAGE,
  attemptDecision,
  cleanupProven,
  containerName,
  containerViolations,
  databaseNames,
  evaluateTests,
  loopbackUrl,
  makeExecutionId,
  positiveControlOk,
  redact,
  validatePort,
  type ContainerInspect,
  type LedgerEntry,
} from '../scripts/db-acceptance/guards.js';
import { IT_DATABASE_ENV, resolveIntegrationDatabaseConfig } from './db/guard.js';
import { PACKAGE_ROOT } from './support/sources.js';

const ID = makeExecutionId(new Date('2026-10-08T09:30:00.123Z'), '1a2b3c4d');
const COMMIT_A = 'a'.repeat(40);
const COMMIT_B = 'b'.repeat(40);
const PASSWORD = '0123456789abcdef0123456789abcdef';

describe('names and connection targets', () => {
  it('builds a timestamped execution id, container and ceproject_it_* databases', () => {
    expect(ID).toBe('20261008t093000z-1a2b3c4d');
    expect(containerName(ID)).toBe('ceproject-p2db-20261008t093000z-1a2b3c4d');
    expect(databaseNames(ID)).toEqual({
      test: 'ceproject_it_p2_20261008t093000z_1a2b3c4d',
      shadow: 'ceproject_it_p2_20261008t093000z_1a2b3c4d_shadow',
    });
  });

  it('rejects malformed execution ids and random parts', () => {
    expect(() => containerName('x; docker rm -f all')).toThrow();
    expect(() => databaseNames('20261008t093000z-ZZ')).toThrow();
    expect(() => makeExecutionId(new Date(), 'nothex!!')).toThrow();
  });

  it('accepts only unprivileged ports', () => {
    expect(validatePort(55434)).toBe(55434);
    for (const port of [0, 80, 5432.5, 70000, Number.NaN]) {
      expect(() => validatePort(port)).toThrow();
    }
  });

  it('builds loopback URLs that the integration guard accepts', () => {
    const url = loopbackUrl('ceproject_tester', PASSWORD, 55434, databaseNames(ID).test);
    expect(resolveIntegrationDatabaseConfig({ [IT_DATABASE_ENV]: url })).toEqual({
      host: '127.0.0.1',
      port: 55434,
      database: databaseNames(ID).test,
      user: 'ceproject_tester',
      password: PASSWORD,
    });
  });

  it('refuses names or passwords that could change the target', () => {
    expect(() => loopbackUrl('x@evil', PASSWORD, 55434, 'ceproject_it_x')).toThrow();
    expect(() =>
      loopbackUrl('ceproject_tester', 'pw@db.example.com', 55434, 'ceproject_it_x'),
    ).toThrow();
    expect(() => loopbackUrl('ceproject_tester', PASSWORD, 55434, 'ceproject')).toThrow();
  });

  it('redacts every secret from evidence text', () => {
    expect(redact(`url postgresql://u:${PASSWORD}@127.0.0.1 and ${PASSWORD}`, [PASSWORD, ''])).toBe(
      'url postgresql://u:[REDACTED]@127.0.0.1 and [REDACTED]',
    );
  });
});

describe('attempt ledger (at most two attempts, no blind rerun)', () => {
  const entry = (patch: Partial<LedgerEntry>): LedgerEntry => ({
    attempt: 1,
    executionId: ID,
    commit: COMMIT_A,
    result: 'FAIL',
    cleanup: 'PROVEN',
    ...patch,
  });

  it('allows only attempt 1 on an empty ledger', () => {
    expect(attemptDecision([], 1, COMMIT_A)).toEqual({ allowed: true });
    expect(attemptDecision([], 2, COMMIT_A).allowed).toBe(false);
  });

  it('allows attempt 2 only after a failed, cleaned-up attempt 1 and a new commit', () => {
    expect(attemptDecision([entry({})], 2, COMMIT_B)).toEqual({ allowed: true });
    expect(attemptDecision([entry({})], 2, COMMIT_A)).toMatchObject({ allowed: false });
    expect(attemptDecision([entry({ result: 'PASS' })], 2, COMMIT_B)).toMatchObject({
      allowed: false,
    });
    expect(attemptDecision([entry({ cleanup: 'FAILED' })], 2, COMMIT_B)).toMatchObject({
      allowed: false,
    });
    expect(
      attemptDecision([entry({ result: 'STARTED', cleanup: 'PENDING' })], 2, COMMIT_B),
    ).toMatchObject({ allowed: false });
  });

  it('never allows a third attempt or a repeated number', () => {
    const two = [entry({}), entry({ attempt: 2, commit: COMMIT_B })];
    expect(attemptDecision(two, 3, 'c'.repeat(40))).toMatchObject({ allowed: false });
    expect(attemptDecision(two, 2, 'c'.repeat(40))).toMatchObject({ allowed: false });
    expect(attemptDecision([entry({})], 1, COMMIT_B)).toMatchObject({ allowed: false });
  });
});

describe('container boundaries', () => {
  const id = 'f'.repeat(64);
  const good: ContainerInspect = {
    Id: id,
    Name: `/${containerName(ID)}`,
    Config: { Image: IMAGE },
    State: { Running: true },
    Mounts: [],
    HostConfig: {
      AutoRemove: true,
      Tmpfs: { [DATA_DIR]: 'rw,size=1024m' },
      PortBindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55434' }] },
      Binds: null,
    },
  };
  const expected = { id, name: containerName(ID), port: 55434 };

  it('accepts the approved container', () => {
    expect(containerViolations(good, expected)).toEqual([]);
  });

  it.each<[string, ContainerInspect]>([
    ['another container id', { ...good, Id: '0'.repeat(64) }],
    ['another image', { ...good, Config: { Image: 'postgres:latest' } }],
    ['no --rm', { ...good, HostConfig: { ...good.HostConfig, AutoRemove: false } }],
    ['data not on tmpfs', { ...good, HostConfig: { ...good.HostConfig, Tmpfs: {} } }],
    [
      'a named or anonymous volume',
      { ...good, Mounts: [{ Type: 'volume', Destination: DATA_DIR }] },
    ],
    [
      'a host bind mount',
      { ...good, HostConfig: { ...good.HostConfig, Binds: ['C:\\data:/data'] } },
    ],
    [
      'a port on all interfaces',
      {
        ...good,
        HostConfig: {
          ...good.HostConfig,
          PortBindings: { '5432/tcp': [{ HostIp: '0.0.0.0', HostPort: '55434' }] },
        },
      },
    ],
    [
      'an extra published port',
      {
        ...good,
        HostConfig: {
          ...good.HostConfig,
          PortBindings: {
            '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55434' }],
            '22/tcp': [{ HostIp: '127.0.0.1', HostPort: '2222' }],
          },
        },
      },
    ],
  ])('rejects %s', (_label, inspect) => {
    expect(containerViolations(inspect, expected).length).toBeGreaterThan(0);
  });
});

describe('result rules', () => {
  const report = {
    success: true,
    numTotalTests: 830,
    numPassedTests: 830,
    numFailedTests: 0,
    numPendingTests: 0,
    numTodoTests: 0,
  };

  it('passes only when every test ran and passed', () => {
    expect(evaluateTests(report, 822).ok).toBe(true);
    expect(evaluateTests({ ...report, numPendingTests: 223, numPassedTests: 607 }, 822).ok).toBe(
      false,
    );
    expect(evaluateTests({ ...report, numFailedTests: 1, numPassedTests: 829 }, 822).ok).toBe(
      false,
    );
    expect(evaluateTests({ ...report, success: false }, 822).ok).toBe(false);
    expect(evaluateTests({ ...report, numTotalTests: 599, numPassedTests: 599 }, 822).ok).toBe(
      false,
    );
    expect(evaluateTests({}, 822).ok).toBe(false);
  });

  it('requires positive drift controls to report a real difference', () => {
    expect(positiveControlOk(2, '-- DropTable\nDROP TABLE "Expense";\n')).toBe(true);
    expect(positiveControlOk(0, '')).toBe(false);
    expect(positiveControlOk(2, '')).toBe(false);
    expect(positiveControlOk(2, '-- This is an empty migration.\n')).toBe(false);
    expect(positiveControlOk(1, 'DROP TABLE "Expense";')).toBe(false);
  });

  it('proves cleanup only with a successful, empty Docker query', () => {
    expect(cleanupProven([{ exitCode: 0, stdout: '' }])).toBe(true);
    expect(cleanupProven([{ exitCode: 0, stdout: 'f'.repeat(64) }])).toBe(false);
    expect(cleanupProven([{ exitCode: 1, stdout: '' }])).toBe(false);
    expect(cleanupProven([{ exitCode: null, stdout: '' }])).toBe(false);
    expect(cleanupProven([])).toBe(false);
  });
});

describe('runner source', () => {
  const source = readFileSync(`${PACKAGE_ROOT}/scripts/db-acceptance/run.ts`, 'utf8');

  it('requires the confirmation text and never uses destructive Docker or Prisma commands', () => {
    expect(source).toContain('CONFIRMATION');
    expect(CONFIRMATION).toContain('DISPOSABLE');
    expect(source).not.toMatch(/'(prune|rm|kill|system|volume)'/);
    expect(source).not.toMatch(/'reset'|'migrate', 'dev'|db push|['`"]DROP\s/);
  });

  it('removes inherited database targets from child processes', () => {
    expect(source).toContain("'PGHOST'");
    expect(source).toContain("'DATABASE_URL', 'SHADOW_DATABASE_URL', 'CEPROJECT_IT_DATABASE_URL'");
  });
});
