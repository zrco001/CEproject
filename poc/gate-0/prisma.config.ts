// Prisma config for the Gate 0 PoC — NOT the production configuration.
// Defense in depth: any Prisma command run with a database URL that is not the disposable
// gate0 database aborts here, before Prisma connects.
import { defineConfig } from 'prisma/config';
import { assertDisposableUrl } from './scripts/guard.mjs';

// Prisma 7's schema engine requires a datasource even for offline commands such as
// `migrate diff --from-empty`. Without DATABASE_URL we fall back to a placeholder that itself
// satisfies the guard and is never a real database.
const OFFLINE_PLACEHOLDER_URL = 'postgresql://offline@127.0.0.1:55432/gate0_offline';

const url = process.env['DATABASE_URL'] ?? OFFLINE_PLACEHOLDER_URL;
const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL'];

assertDisposableUrl(url, 'DATABASE_URL');
if (shadowDatabaseUrl !== undefined) {
  assertDisposableUrl(shadowDatabaseUrl, 'SHADOW_DATABASE_URL');
}

export default defineConfig({
  schema: process.env['GATE0_SCHEMA'] ?? 'prisma/schema.prisma',
  migrations: {
    path: process.env['GATE0_MIGRATIONS'] ?? 'prisma/migrations',
  },
  datasource: {
    url,
    ...(shadowDatabaseUrl !== undefined ? { shadowDatabaseUrl } : {}),
  },
});
