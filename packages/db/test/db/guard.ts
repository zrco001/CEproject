// Guard for the PostgreSQL integration tests. They run only when CEPROJECT_IT_DATABASE_URL names
// a disposable database on the loopback interface whose name starts with `ceproject_it_`.
// Phase 2 does not provide such a database: the execution environment needs a separate,
// concrete authorization (prisma/constraints.md §5). Error messages never echo the URL.

export const IT_DATABASE_ENV = 'CEPROJECT_IT_DATABASE_URL';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);
const DATABASE_NAME = /^ceproject_it_[a-z0-9_]+$/;

/** undefined → skip the integration tests; a string → a URL that passed every check. */
export function resolveIntegrationDatabaseUrl(
  env: Readonly<Record<string, string | undefined>>,
): string | undefined {
  const raw = env[IT_DATABASE_ENV];
  if (raw === undefined || raw.length === 0) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${IT_DATABASE_ENV} is not a valid URL`);
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(`${IT_DATABASE_ENV} must be a postgresql:// URL`);
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${IT_DATABASE_ENV} must point at a loopback host`);
  }
  if (!DATABASE_NAME.test(decodeURIComponent(url.pathname.replace(/^\//, '')))) {
    throw new Error(`${IT_DATABASE_ENV} must name a disposable ceproject_it_* database`);
  }
  return raw;
}
