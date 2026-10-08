// Offline validation of the PostgreSQL integration plan (test/db). It does not connect to any
// database: it checks that the fixtures and every case statement fit the committed migration
// (tables, columns, NOT NULL columns, enum values), that references resolve, and that every
// registry constraint has rejecting and accepting cases. Whether PostgreSQL really accepts or
// rejects each statement is only known once constraints.spec.ts runs in an authorized database.
import { readFileSync } from 'node:fs';
import pg from 'pg';
import { describe, expect, it } from 'vitest';
import { REGISTRY } from '../prisma/constraints.registry.js';
import { COMPOSITE_FK_PLANS, DB_CASES } from './db/cases.js';
import { FIXTURE_ROWS } from './db/fixtures.js';
import { IT_DATABASE_ENV, resolveIntegrationDatabaseConfig } from './db/guard.js';
import { fixtureInsert, stepStatement, type Statement } from './db/sql.js';
import { PACKAGE_ROOT, migrationSql, parseEnums, parseTables } from './support/sources.js';

const tables = parseTables();
const enums = parseEnums();
const sql = migrationSql();

function validate(statement: Statement, where: string, requireAllColumns: boolean): void {
  const columns = tables.get(statement.table);
  expect(columns, `${where}: table ${statement.table}`).toBeDefined();
  for (const [name, value] of Object.entries(statement.values)) {
    const column = columns?.find((c) => c.name === name);
    expect(column, `${where}: column ${statement.table}.${name}`).toBeDefined();
    if (column && value !== null) {
      const values = enums.get(column.type);
      if (values) expect(values, `${where}: ${statement.table}.${name}`).toContain(value);
    }
    if (column?.notNull && value === null) {
      expect.fail(`${where}: NULL in NOT NULL column ${statement.table}.${name}`);
    }
  }
  if (requireAllColumns) {
    for (const column of columns ?? []) {
      if (column.notNull && !column.hasDefault) {
        expect(
          statement.values,
          `${where}: required ${statement.table}.${column.name}`,
        ).toHaveProperty(column.name);
      }
    }
  }
}

describe('integration database guard', () => {
  const resolve = (value: string) => resolveIntegrationDatabaseConfig({ [IT_DATABASE_ENV]: value });

  it('skips when no URL is configured', () => {
    expect(resolveIntegrationDatabaseConfig({})).toBeUndefined();
    expect(resolve('')).toBeUndefined();
  });

  it('returns an explicit loopback configuration for a ceproject_it_* database', () => {
    expect(resolve('postgresql://it:pw@127.0.0.1:55433/ceproject_it_phase2')).toEqual({
      host: '127.0.0.1',
      port: 55433,
      database: 'ceproject_it_phase2',
      user: 'it',
      password: 'pw',
    });
    expect(resolve('postgres://it@[::1]/ceproject_it_x')).toEqual({
      host: '::1',
      port: 5432,
      database: 'ceproject_it_x',
      user: 'it',
    });
  });

  // Codex review of 683606122, finding P1: pg honours ?host=… and other query overrides.
  it('makes pg target exactly the validated host, port and database (no connection is made)', () => {
    const config = resolve('postgresql://it:pw@127.0.0.1:55433/ceproject_it_phase2');
    const client = new pg.Client({ ...config });
    expect([client.host, client.port, client.database, client.user]).toEqual([
      '127.0.0.1',
      55433,
      'ceproject_it_phase2',
      'it',
    ]);
  });

  it.each([
    ['a remote host', 'postgresql://it:secret@db.example.com/ceproject_it_x'],
    ['a host name instead of a loopback IP', 'postgresql://it:secret@localhost/ceproject_it_x'],
    ['a look-alike host', 'postgresql://it:secret@127.0.0.1.example.com/ceproject_it_x'],
    [
      'a ?host= override (Codex reproduction)',
      'postgresql://it:secret@127.0.0.1:55433/ceproject_it_review?host=db.example.invalid',
    ],
    ['a ?hostaddr= override', 'postgresql://it:secret@127.0.0.1/ceproject_it_x?hostaddr=192.0.2.1'],
    ['a ?port= override', 'postgresql://it:secret@127.0.0.1/ceproject_it_x?port=6543'],
    ['a ?options= override', 'postgresql://it:secret@127.0.0.1/ceproject_it_x?options=-c%20x%3Dy'],
    ['an empty query string', 'postgresql://it:secret@127.0.0.1/ceproject_it_x?'],
    ['a Unix socket via query', 'postgresql:///ceproject_it_x?host=/var/run/postgresql'],
    [
      'an encoded Unix socket host',
      'postgresql://it:secret@%2Fvar%2Frun%2Fpostgresql/ceproject_it_x',
    ],
    ['a fragment', 'postgresql://it:secret@127.0.0.1/ceproject_it_x#secret'],
    ['a missing user', 'postgresql://127.0.0.1/ceproject_it_x'],
    ['a non-disposable database name', 'postgresql://it:secret@127.0.0.1/ceproject'],
    ['an extra path segment', 'postgresql://it:secret@127.0.0.1/ceproject_it_x/other'],
    ['another scheme', 'mysql://it:secret@127.0.0.1/ceproject_it_x'],
    ['an invalid URL', 'not a url secret'],
  ])('rejects %s before any connection, without echoing the URL', (_label, value) => {
    expect(() => resolve(value)).toThrow(IT_DATABASE_ENV);
    try {
      resolve(value);
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });

  it('connects the spec with the validated object, never the raw URL', () => {
    const spec = readFileSync(`${PACKAGE_ROOT}/test/db/constraints.spec.ts`, 'utf8');
    expect(spec).toContain('new pg.Client({ ...target })');
    expect(spec).not.toContain('connectionString');
  });
});

describe('fixtures', () => {
  it('uses unique keys and ids', () => {
    const keys = FIXTURE_ROWS.map((r) => `${r.scope}.${r.key}`);
    expect(new Set(keys).size).toBe(keys.length);
    const ids = FIXTURE_ROWS.map((r) => r.values['id']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(FIXTURE_ROWS.map((row) => [`${row.scope}.${row.key}`, row] as const))(
    '%s fits its table and enums',
    (where, row) => {
      validate(fixtureInsert(row), where, true);
    },
  );

  it('contains only placeholder identities', () => {
    for (const row of FIXTURE_ROWS) {
      const email = row.values['email'];
      if (typeof email === 'string') expect(email).toMatch(/@example\.invalid$/);
    }
  });
});

describe('integrity cases', () => {
  it('have unique ids', () => {
    const ids = DB_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(DB_CASES.map((c) => [c.id, c] as const))('%s builds valid statements', (id, dbCase) => {
    dbCase.steps.forEach((step, i) => {
      const statement = stepStatement(step, i);
      validate(statement, id, statement.kind === 'insert');
    });
  });

  it('name only constraints that exist in the migration', () => {
    const created = new Set(
      [...sql.matchAll(/CONSTRAINT "(\w+)"|CREATE UNIQUE INDEX "(\w+)"/g)].map((m) => m[1] ?? m[2]),
    );
    for (const dbCase of DB_CASES) {
      if (dbCase.expect.outcome === 'reject' && dbCase.expect.constraint !== undefined) {
        expect(created, dbCase.id).toContain(dbCase.expect.constraint);
      }
    }
  });

  it('plan exactly one cross-organization case per registry composite FK', () => {
    const compositeFks = REGISTRY.filter((e) => e.kind === 'composite_fk').map((e) => e.name);
    expect(Object.keys(COMPOSITE_FK_PLANS).sort()).toEqual([...compositeFks].sort());
    for (const entry of REGISTRY) {
      if (entry.kind !== 'composite_fk') continue;
      expect(Boolean(COMPOSITE_FK_PLANS[entry.name]?.nullAccept), entry.name).toBe(entry.nullable);
    }
  });

  it('reject and accept every CHECK, partial unique and plain unique registry entry', () => {
    const tested = REGISTRY.filter(
      (e) => e.kind !== 'unique_target' && e.kind !== 'revoked_privileges',
    );
    for (const entry of tested) {
      const rejecting = DB_CASES.filter(
        (c) => c.expect.outcome === 'reject' && c.expect.constraint === entry.name,
      );
      expect(rejecting.length, `${entry.name} has no rejecting case`).toBeGreaterThan(0);
      if (entry.kind !== 'composite_fk' || entry.nullable) {
        const accepting = DB_CASES.filter(
          (c) => c.expect.outcome === 'accept' && c.covers.includes(entry.name),
        );
        expect(accepting.length, `${entry.name} has no accepting case`).toBeGreaterThan(0);
      }
    }
  });

  it('test the I-20 privileges in constraints.spec.ts', () => {
    const spec = readFileSync(`${PACKAGE_ROOT}/test/db/constraints.spec.ts`, 'utf8');
    expect(spec).toContain('SET LOCAL ROLE app_user');
    expect(spec).toContain("'42501'");
  });
});
