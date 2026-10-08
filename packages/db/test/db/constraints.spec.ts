// PostgreSQL integration tests for the Phase 2 schema (§6.4, §6.5 step 3).
//
// NOT EXECUTED in Phase 2: they are skipped unless CEPROJECT_IT_DATABASE_URL names a disposable
// loopback database (./guard.ts). Running them needs a separately authorized environment that
// (see prisma/constraints.md §5):
//   1. creates a fresh ceproject_it_* database and the app_user role (NOLOGIN, not superuser),
//      grants SELECT / INSERT on future tables to app_user and app_user membership to the tester;
//   2. applies prisma/migrations with `prisma migrate deploy`;
//   3. runs `pnpm --filter @ceproject/db test`.
// Every test runs inside a transaction that is rolled back, so no fixture data persists.
import pg from 'pg';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditForeignKeyActions, compareWithRegistry } from '../../src/registry/compare.js';
import { readCatalog } from '../../src/registry/catalog.js';
import { DB_CASES } from './cases.js';
import { FIXTURE_ROWS } from './fixtures.js';
import { resolveIntegrationDatabaseConfig } from './guard.js';
import { fixtureInsert, stepStatement } from './sql.js';

// Validated, explicit target (host / port / database / user); never the raw URL string.
const target = resolveIntegrationDatabaseConfig(process.env);

interface PgError {
  readonly code?: string;
  readonly constraint?: string;
}

describe.skipIf(target === undefined)(
  'PostgreSQL integrity (authorized disposable database only)',
  () => {
    let client: pg.Client;

    beforeAll(async () => {
      client = new pg.Client({ ...target });
      await client.connect();
    });

    afterAll(async () => {
      await client.end();
    });

    beforeEach(async () => {
      await client.query('BEGIN');
      for (const row of FIXTURE_ROWS) {
        const statement = fixtureInsert(row);
        await client.query(statement.text, [...statement.params]);
      }
    });

    afterEach(async () => {
      await client.query('ROLLBACK');
    });

    it('has every registry object with its expected definition (§6.5 step 3)', async () => {
      const catalog = await readCatalog(client);
      const comparison = compareWithRegistry(catalog);
      expect(comparison.missing).toEqual([]);
      expect(comparison.mismatched).toEqual([]);
      expect(auditForeignKeyActions(catalog).violations).toEqual([]);
    });

    it('I-20: app_user cannot UPDATE, DELETE or TRUNCATE AuditLog but can INSERT', async () => {
      const role = await client.query<{ rolsuper: boolean }>(
        "SELECT rolsuper FROM pg_roles WHERE rolname = 'app_user'",
      );
      expect(role.rows).toEqual([{ rolsuper: false }]);
      const owner = await client.query<{ owner: string }>(
        `SELECT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relname = 'AuditLog'`,
      );
      expect(owner.rows[0]?.owner).not.toBe('app_user');

      await client.query('SET LOCAL ROLE app_user');
      for (const statement of [
        `UPDATE "AuditLog" SET "requestId" = 'changed'`,
        'DELETE FROM "AuditLog"',
        'TRUNCATE "AuditLog"',
      ]) {
        await client.query('SAVEPOINT revoked');
        const error = await client.query(statement).then(
          () => undefined,
          (caught: unknown) => caught as PgError,
        );
        expect(error?.code, statement).toBe('42501');
        await client.query('ROLLBACK TO SAVEPOINT revoked');
      }
      const auditInsert = fixtureInsert({
        ...FIXTURE_ROWS.find((r) => r.scope === 'A' && r.key === 'auditLog')!,
        values: {
          ...FIXTURE_ROWS.find((r) => r.scope === 'A' && r.key === 'auditLog')!.values,
          id: 'a0000000-0000-7000-8000-000000000999',
        },
      });
      await client.query(auditInsert.text, [...auditInsert.params]);
    });

    it.each(DB_CASES.map((c) => [c.id, c] as const))('%s', async (_id, dbCase) => {
      const statements = dbCase.steps.map((step, i) => stepStatement(step, i));
      const last = statements.at(-1)!;
      for (const statement of statements.slice(0, -1)) {
        await client.query(statement.text, [...statement.params]);
      }
      const error = await client.query(last.text, [...last.params]).then(
        () => undefined,
        (caught: unknown) => caught as PgError,
      );
      if (dbCase.expect.outcome === 'accept') {
        expect(error).toBeUndefined();
        return;
      }
      expect(error, 'statement was accepted').toBeDefined();
      expect(dbCase.expect.sqlstate).toContain(error?.code);
      if (dbCase.expect.constraint !== undefined) {
        expect(error?.constraint).toBe(dbCase.expect.constraint);
      }
    });
  },
);
