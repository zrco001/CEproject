// Disposable-database guard for the Gate 0 PoC (PHASE-2-GATE-0-PLAN.md §3.3).
// Every database-touching step must pass this guard. It refuses anything that is not the
// isolated, tmpfs-backed, auto-removed PostgreSQL container started by the gate0 workflow.
import { execFileSync } from 'node:child_process';

export const CONTAINER_NAME = 'ceproject-gate0-pg';
export const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost']);
export const ALLOWED_PORT = '55432';
export const DB_PREFIX = 'gate0_';
export const PGDATA = '/var/lib/postgresql/data';

export class GuardError extends Error {
  constructor(message) {
    super(`[gate0 guard] ${message}`);
    this.name = 'GuardError';
  }
}

/** Removes credentials from a connection URL before it is logged. */
export function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.password) url.password = '***';
    return url.toString();
  } catch {
    return '<invalid url>';
  }
}

/**
 * Pure URL check (no I/O): host, port and database-name prefix.
 * @returns {string} the database name
 */
export function assertDisposableUrl(value, label = 'DATABASE_URL') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GuardError(`${label} is not set.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new GuardError(`${label} is not a valid URL.`);
  }
  if (url.protocol !== 'postgresql:' && url.protocol !== 'postgres:') {
    throw new GuardError(`${label} must use the postgresql protocol.`);
  }
  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new GuardError(`${label} host "${url.hostname}" is not a disposable local host.`);
  }
  if (url.port !== ALLOWED_PORT) {
    throw new GuardError(`${label} port "${url.port}" is not the disposable port ${ALLOWED_PORT}.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database.startsWith(DB_PREFIX) || !/^[a-z0-9_]+$/.test(database)) {
    throw new GuardError(`${label} database "${database}" must start with "${DB_PREFIX}".`);
  }
  return database;
}

/** The PoC may only run inside the manually dispatched, confirmed GitHub Actions job. */
export function assertConfirmedCiRun(env = process.env) {
  if (env.GITHUB_ACTIONS !== 'true') {
    throw new GuardError('Refusing to run outside GitHub Actions (D-3: CI-only disposable DB).');
  }
  if (env.GATE0_DISPOSABLE_CONFIRMED !== 'true') {
    throw new GuardError(
      'GATE0_DISPOSABLE_CONFIRMED is not set by the confirmed workflow_dispatch.',
    );
  }
}

/** Verifies the running container is the isolated, auto-removed, tmpfs-backed one. */
export function assertDisposableContainer() {
  let raw;
  try {
    raw = execFileSync('docker', ['inspect', '--format', '{{json .}}', CONTAINER_NAME], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    throw new GuardError(`Container "${CONTAINER_NAME}" is not running.`);
  }
  const info = JSON.parse(raw);
  if (info?.State?.Running !== true) {
    throw new GuardError(`Container "${CONTAINER_NAME}" is not running.`);
  }
  if (info?.HostConfig?.AutoRemove !== true) {
    throw new GuardError(`Container "${CONTAINER_NAME}" was not started with --rm.`);
  }
  const tmpfs = info?.HostConfig?.Tmpfs ?? {};
  if (!Object.hasOwn(tmpfs, PGDATA)) {
    throw new GuardError(`Container "${CONTAINER_NAME}" does not keep ${PGDATA} on tmpfs.`);
  }
  const mounts = info?.Mounts ?? [];
  if (mounts.some((m) => m.Type === 'volume' || m.Type === 'bind')) {
    throw new GuardError(`Container "${CONTAINER_NAME}" has persistent volume or bind mounts.`);
  }
  const bindings = info?.HostConfig?.PortBindings?.['5432/tcp'] ?? [];
  const ok =
    bindings.length > 0 &&
    bindings.every((b) => b.HostIp === '127.0.0.1' && b.HostPort === ALLOWED_PORT);
  if (!ok) {
    throw new GuardError(
      `Container "${CONTAINER_NAME}" must publish 5432 only on 127.0.0.1:${ALLOWED_PORT}.`,
    );
  }
}

/**
 * Connected check: the target really is a disposable gate0 database and contains nothing but
 * PoC objects. `client` is a connected node-postgres client.
 */
export async function assertDisposableDatabase(client) {
  const { rows } = await client.query(
    `SELECT current_database() AS db,
            (SELECT count(*)::int FROM pg_tables
              WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
                AND tablename NOT LIKE 'Poc%'
                AND tablename <> '_prisma_migrations') AS foreign_tables`,
  );
  const [row] = rows;
  if (!row?.db?.startsWith(DB_PREFIX)) {
    throw new GuardError(`Connected database "${row?.db}" is not a gate0 database.`);
  }
  if (row.foreign_tables !== 0) {
    throw new GuardError(`Database "${row.db}" contains non-PoC tables; refusing to continue.`);
  }
}

/** Full guard used before every database-touching step. */
export function assertDisposableEnvironment(urls, env = process.env) {
  assertConfirmedCiRun(env);
  for (const [label, value] of Object.entries(urls)) {
    assertDisposableUrl(value, label);
  }
  assertDisposableContainer();
}
