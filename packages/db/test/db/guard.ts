// Guard for the PostgreSQL integration tests. They run only when CEPROJECT_IT_DATABASE_URL names
// a disposable database on a loopback IP whose name starts with `ceproject_it_`.
// Phase 2 does not provide such a database: the execution environment needs a separate,
// concrete authorization (prisma/constraints.md §5). Error messages never echo the URL.
//
// The guard returns an explicit pg configuration instead of the URL string, so pg cannot pick a
// different target than the one validated here (Codex review of 683606122, finding P1): a
// connection string may override the host through query parameters (`?host=…`), select a
// Unix socket, or change options, and pg would honour them. Any query string, fragment,
// socket form or non-loopback host is therefore rejected, and the spec connects with this
// object only.

export const IT_DATABASE_ENV = 'CEPROJECT_IT_DATABASE_URL';

/** Literal loopback addresses only: a host name could resolve elsewhere. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);
const DATABASE_NAME = /^ceproject_it_[a-z0-9_]+$/;

export interface IntegrationDatabaseConfig {
  readonly host: '127.0.0.1' | '::1';
  readonly port: number;
  readonly database: string;
  readonly user: string;
  readonly password?: string;
}

/** undefined → skip the integration tests; a config → a target that passed every check. */
export function resolveIntegrationDatabaseConfig(
  env: Readonly<Record<string, string | undefined>>,
): IntegrationDatabaseConfig | undefined {
  const raw = env[IT_DATABASE_ENV];
  if (raw === undefined || raw.length === 0) return undefined;
  const fail = (reason: string): never => {
    throw new Error(`${IT_DATABASE_ENV} ${reason}`);
  };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return fail('is not a valid URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    fail('must be a postgresql:// URL');
  }
  if (url.search !== '' || raw.includes('?')) {
    fail('must not contain query parameters (they can override the connection target)');
  }
  if (url.hash !== '' || raw.includes('#')) fail('must not contain a fragment');
  if (!LOOPBACK_HOSTS.has(url.hostname)) fail('must point at a literal loopback IP');

  const port = url.port === '' ? 5432 : Number(url.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('has an invalid port');

  let database = '';
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  } catch {
    fail('has an invalid database name');
  }
  if (!DATABASE_NAME.test(database)) fail('must name a disposable ceproject_it_* database');

  const user = decodeURIComponent(url.username);
  if (user.length === 0) fail('must name a user');
  const password = url.password === '' ? undefined : decodeURIComponent(url.password);

  return {
    host: url.hostname === '[::1]' ? '::1' : '127.0.0.1',
    port,
    database,
    user,
    ...(password === undefined ? {} : { password }),
  };
}
