// Pure decisions for the Phase 2 disposable-database acceptance runner (./run.ts).
// No I/O here: test/db-acceptance.test.ts covers every rule offline.
//
// Approved limits (CLAUDE-PHASE2-DB-AND-PHASE3-WORK-PACKAGE.md §3 A):
// - at most two attempts, each in a brand-new postgres:16.15-alpine container; the second only
//   after the first failed and a fix was committed (no blind rerun);
// - loopback-only port, tmpfs data, no bind mount or named volume;
// - only databases named ceproject_it_*; cleanup must be proven, a Docker query error is not
//   proof of absence.

export const IMAGE = 'postgres:16.15-alpine';
export const DEFAULT_PORT = 55434;
export const MAX_ATTEMPTS = 2;
export const CONFIRMATION = 'RUN PHASE2 DB ACCEPTANCE ON A NEW DISPOSABLE CONTAINER';
export const DATA_DIR = '/var/lib/postgresql/data';
export const ROLES = {
  admin: 'ceproject_admin',
  migrator: 'ceproject_migrator',
  app: 'app_user',
  tester: 'ceproject_tester',
} as const;

const EXECUTION_ID = /^\d{8}t\d{6}z-[0-9a-f]{8}$/;

/** `20261008t093000z-1a2b3c4d`: UTC timestamp plus random hex, lower case. */
export function makeExecutionId(now: Date, randomHex: string): string {
  if (!/^[0-9a-f]{8}$/.test(randomHex)) throw new Error('random part must be 8 hex characters');
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'z')
    .toLowerCase();
  const id = `${stamp}-${randomHex}`;
  if (!EXECUTION_ID.test(id)) throw new Error('invalid execution id');
  return id;
}

export function containerName(executionId: string): string {
  if (!EXECUTION_ID.test(executionId)) throw new Error('invalid execution id');
  return `ceproject-p2db-${executionId}`;
}

/** Test and shadow database names; both satisfy the integration guard (ceproject_it_*). */
export function databaseNames(executionId: string): { test: string; shadow: string } {
  if (!EXECUTION_ID.test(executionId)) throw new Error('invalid execution id');
  const suffix = executionId.replace('-', '_');
  return { test: `ceproject_it_p2_${suffix}`, shadow: `ceproject_it_p2_${suffix}_shadow` };
}

export function validatePort(port: number): number {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('port must be an integer between 1024 and 65535');
  }
  return port;
}

/** Loopback connection string; the caller never logs it (it contains a password). */
export function loopbackUrl(
  user: string,
  password: string,
  port: number,
  database: string,
): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error('invalid role name');
  if (!/^[0-9a-f]{24,}$/.test(password)) throw new Error('password must be generated hex');
  if (!/^ceproject_it_[a-z0-9_]+$/.test(database) && database !== 'postgres') {
    throw new Error('invalid database name');
  }
  return `postgresql://${user}:${password}@127.0.0.1:${validatePort(port)}/${database}`;
}

/** Replaces every secret with [REDACTED] before text is written to evidence. */
export function redact(text: string, secrets: readonly string[]): string {
  return secrets
    .filter((secret) => secret.length > 0)
    .reduce((result, secret) => result.split(secret).join('[REDACTED]'), text);
}

// ------------------------------------------------------------------------------------------
// Attempt ledger: at most two container attempts, the second only after a failed first one
// with a different commit (a committed fix).
// ------------------------------------------------------------------------------------------

export interface LedgerEntry {
  readonly attempt: number;
  readonly executionId: string;
  readonly commit: string;
  /** PASS / FAIL once finished; STARTED while running (a crash leaves it STARTED). */
  readonly result: 'STARTED' | 'PASS' | 'FAIL';
  readonly cleanup: 'PROVEN' | 'FAILED' | 'PENDING';
}

export function attemptDecision(
  ledger: readonly LedgerEntry[],
  requestedAttempt: number,
  commit: string,
): { allowed: true } | { allowed: false; reason: string } {
  const deny = (reason: string) => ({ allowed: false as const, reason });
  if (requestedAttempt !== ledger.length + 1) {
    return deny(`next attempt is ${ledger.length + 1}, not ${requestedAttempt}`);
  }
  if (requestedAttempt > MAX_ATTEMPTS) return deny('both approved attempts are used');
  const previous = ledger.at(-1);
  if (previous === undefined) return { allowed: true };
  if (previous.cleanup !== 'PROVEN') return deny('previous attempt cleanup was not proven');
  if (previous.result === 'PASS') return deny('previous attempt passed; no rerun');
  if (previous.result !== 'FAIL') return deny('previous attempt did not finish');
  if (previous.commit === commit) return deny('no blind rerun: commit a fix first');
  return { allowed: true };
}

// ------------------------------------------------------------------------------------------
// Container inspection
// ------------------------------------------------------------------------------------------

/** Subset of `docker inspect` output the runner checks. */
export interface ContainerInspect {
  readonly Id?: string;
  readonly Name?: string;
  readonly Config?: { readonly Image?: string };
  readonly State?: { readonly Running?: boolean };
  readonly Mounts?: readonly { readonly Type?: string; readonly Destination?: string }[];
  readonly HostConfig?: {
    readonly AutoRemove?: boolean;
    readonly Tmpfs?: Readonly<Record<string, string>>;
    readonly PortBindings?: Readonly<
      Record<string, readonly { readonly HostIp?: string; readonly HostPort?: string }[] | null>
    >;
    readonly Binds?: readonly string[] | null;
  };
}

/** Every reason the started container violates the approved boundaries (empty = ok). */
export function containerViolations(
  inspect: ContainerInspect,
  expected: { id: string; name: string; port: number },
): string[] {
  const violations: string[] = [];
  if (inspect.Id !== expected.id) violations.push('container id differs from the one started');
  if (inspect.Name !== `/${expected.name}`) violations.push('container name differs');
  if (inspect.Config?.Image !== IMAGE) violations.push(`image is not ${IMAGE}`);
  if (inspect.State?.Running !== true) violations.push('container is not running');
  if (inspect.HostConfig?.AutoRemove !== true) violations.push('container is not --rm');
  if (inspect.HostConfig?.Tmpfs?.[DATA_DIR] === undefined) {
    violations.push(`${DATA_DIR} is not a tmpfs`);
  }
  if ((inspect.HostConfig?.Binds ?? []).length > 0) violations.push('host bind mounts present');
  for (const mount of inspect.Mounts ?? []) {
    violations.push(`unexpected ${mount.Type ?? 'unknown'} mount at ${mount.Destination ?? '?'}`);
  }
  const bindings = Object.entries(inspect.HostConfig?.PortBindings ?? {});
  const published = bindings.flatMap(([containerPort, hosts]) =>
    (hosts ?? []).map((host) => ({ containerPort, ...host })),
  );
  if (
    published.length !== 1 ||
    published[0]?.containerPort !== '5432/tcp' ||
    published[0].HostIp !== '127.0.0.1' ||
    published[0].HostPort !== String(expected.port)
  ) {
    violations.push(`port binding must be exactly 127.0.0.1:${expected.port}->5432/tcp`);
  }
  return violations;
}

// ------------------------------------------------------------------------------------------
// Results
// ------------------------------------------------------------------------------------------

/** Subset of Vitest's JSON reporter output. */
export interface VitestReport {
  readonly numTotalTests?: number;
  readonly numPassedTests?: number;
  readonly numFailedTests?: number;
  readonly numPendingTests?: number;
  readonly numTodoTests?: number;
  readonly success?: boolean;
}

export interface TestVerdict {
  readonly ok: boolean;
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly reasons: readonly string[];
}

/** Every test must run and pass: no failure, no skipped / todo test, and at least `minimum`. */
export function evaluateTests(report: VitestReport, minimum: number): TestVerdict {
  const total = report.numTotalTests ?? 0;
  const passed = report.numPassedTests ?? 0;
  const failed = report.numFailedTests ?? 0;
  const skipped = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
  const reasons: string[] = [];
  if (report.success !== true) reasons.push('test run did not succeed');
  if (failed > 0) reasons.push(`${failed} failed`);
  if (skipped > 0) reasons.push(`${skipped} skipped or todo`);
  if (total < minimum) reasons.push(`only ${total} tests ran, expected at least ${minimum}`);
  if (passed !== total) reasons.push(`passed ${passed} of ${total}`);
  return { ok: reasons.length === 0, total, passed, failed, skipped, reasons };
}

/** A positive control must show a difference: exit 2 and a non-empty script. */
export function positiveControlOk(exitCode: number | null, script: string): boolean {
  return exitCode === 2 && script.split('\n').some((line) => /^\s*[A-Z]/.test(line));
}

/** `docker ps -a --filter id=…` polling: absent only after a successful, empty query. */
export function cleanupProven(
  polls: readonly { readonly exitCode: number | null; readonly stdout: string }[],
): boolean {
  const last = polls.at(-1);
  return last !== undefined && last.exitCode === 0 && last.stdout.trim() === '';
}
