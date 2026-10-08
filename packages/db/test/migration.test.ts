// Offline checks of the committed migrations (§6.5 migration strategy, ADR-034).
// `prisma migrate diff --from-empty --to-schema` runs locally with an offline placeholder
// datasource; no database is contacted and nothing is applied.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PROTECTED_OBJECT_NAMES,
  REGISTRY,
  type RegistryEntry,
} from '../prisma/constraints.registry.js';
import { inspectMigrationDraft, splitMigration } from '../src/migration/inspect.js';
import { normalizeCheck } from '../src/registry/compare.js';
import {
  INIT_MIGRATION,
  MIGRATIONS_DIR,
  PACKAGE_ROOT,
  migrationNames,
  migrationSql,
  parseTables,
  readText,
} from './support/sources.js';

const OFFLINE_URL = 'postgresql://offline:offline@127.0.0.1:9/ceproject_offline';
const sql = migrationSql();
const { generated, manual } = splitMigration(sql);

function prismaDiffFromEmpty(): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [
      path.join(PACKAGE_ROOT, 'node_modules/prisma/build/index.js'),
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      'prisma/schema.prisma',
      '--script',
    ],
    {
      cwd: PACKAGE_ROOT,
      encoding: 'utf8',
      timeout: 110_000,
      // Only the offline placeholder: never a real database, never a .env file.
      env: { ...process.env, DATABASE_URL: OFFLINE_URL, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    },
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('init migration matches schema.prisma', () => {
  it('has exactly one migration so far, plus the lock file', () => {
    expect(migrationNames()).toEqual([INIT_MIGRATION]);
    expect(readText(path.join(MIGRATIONS_DIR, 'migration_lock.toml'))).toContain(
      'provider = "postgresql"',
    );
  });

  it('starts with the exact SQL Prisma 7.10.0 generates from the schema', () => {
    const diff = prismaDiffFromEmpty();
    expect(diff.status, diff.stderr).toBe(0);
    // Prisma can exit 0 with no output when its engine fails (ADR-034 finding 1).
    expect(diff.stdout.length).toBeGreaterThan(10_000);
    expect(generated.replaceAll('\r\n', '\n')).toBe(diff.stdout.replaceAll('\r\n', '\n'));
  });

  it('appends one manual section after the generated SQL', () => {
    expect(manual.startsWith('-- =====')).toBe(true);
    expect(sql.indexOf('-- Manual constraints')).toBe(sql.lastIndexOf('-- Manual constraints'));
  });

  it('creates the 36 tables', () => {
    expect(parseTables(sql).size).toBe(36);
  });
});

describe('referential actions (§6.5 rule 5)', () => {
  const foreignKeys = sql.split('\n').filter((line) => line.includes('FOREIGN KEY'));

  it('makes every foreign key ON DELETE RESTRICT ON UPDATE RESTRICT', () => {
    expect(foreignKeys.length).toBe(152);
    for (const line of foreignKeys) {
      expect(line).toMatch(/ ON DELETE RESTRICT ON UPDATE RESTRICT;$/);
    }
  });

  it('never uses CASCADE, SET NULL or SET DEFAULT', () => {
    expect(sql).not.toMatch(/\bCASCADE\b|\bSET NULL\b|\bSET DEFAULT\b/);
  });
});

describe('manual section', () => {
  it('contains no DROP, data change or transaction control', () => {
    expect(manual).not.toMatch(
      /\bDROP\b|\bINSERT\b|\bUPDATE\s+"|\bDELETE\s+FROM\b|\bTRUNCATE\s+"/i,
    );
    // The PL/pgSQL BEGIN … END of the I-20 DO block is not transaction control.
    expect(manual).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
  });

  it('only creates objects that are in the registry', () => {
    const created = [...manual.matchAll(/ADD CONSTRAINT "(\w+)"|CREATE UNIQUE INDEX "(\w+)"/g)].map(
      (m) => m[1] ?? m[2],
    );
    const registered = new Set(REGISTRY.map((entry) => entry.name));
    expect(created.length).toBeGreaterThan(50);
    expect(created.filter((name) => name === undefined || !registered.has(name))).toEqual([]);
  });

  it('requires the app_user role before revoking AuditLog privileges (I-20)', () => {
    const guard = manual.indexOf(
      "IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')",
    );
    const revoke = manual.indexOf('REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM app_user;');
    expect(guard).toBeGreaterThan(0);
    expect(revoke).toBeGreaterThan(guard);
    expect(manual).toContain('RAISE EXCEPTION');
  });
});

/** The SQL that creates a registry entry, or undefined. */
function sqlFor(entry: RegistryEntry): string | undefined {
  const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const name = escape(entry.name);
  const table = escape(entry.table);
  const patterns: Record<RegistryEntry['kind'], RegExp> = {
    check: new RegExp(
      `ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK \\(([\\s\\S]*?)\\);\\n`,
    ),
    partial_unique_index: new RegExp(
      `CREATE UNIQUE INDEX "${name}"\\s+ON "${table}" ?\\(([^)]*)\\)\\s+WHERE ([\\s\\S]*?);\\n`,
    ),
    unique_target: new RegExp(`CREATE UNIQUE INDEX "${name}" ON "${table}" ?\\(([^)]*)\\);\\n`),
    unique_index: new RegExp(`CREATE UNIQUE INDEX "${name}" ON "${table}" ?\\(([^)]*)\\);\\n`),
    composite_fk: new RegExp(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY .*;\\n`),
    revoked_privileges: /REVOKE .* ON "AuditLog" FROM app_user;\n/,
  };
  return patterns[entry.kind].exec(sql)?.[0];
}

const quoteList = (columns: readonly string[]) => columns.map((c) => `"${c}"`).join(', ');

describe('registry ↔ migration SQL', () => {
  it.each(REGISTRY.map((entry) => [entry.name, entry] as const))('%s', (_name, entry) => {
    const statement = sqlFor(entry);
    expect(statement, `${entry.name} not found in the init migration`).toBeDefined();
    const text = statement ?? '';
    switch (entry.kind) {
      case 'check': {
        const body = /CHECK \(([\s\S]*)\);\n$/.exec(text)?.[1] ?? '';
        expect(normalizeCheck(body)).toBe(normalizeCheck(entry.condition));
        break;
      }
      case 'partial_unique_index': {
        const match = /\(([^)]*)\)\s+WHERE ([\s\S]*?);\n$/.exec(text);
        expect(match?.[1]).toBe(quoteList(entry.columns));
        expect(normalizeCheck(match?.[2] ?? '')).toBe(normalizeCheck(entry.predicate));
        break;
      }
      case 'unique_target':
      case 'unique_index':
        expect(text).toContain(`(${quoteList(entry.columns)});`);
        break;
      case 'composite_fk':
        expect(text).toBe(
          `ALTER TABLE "${entry.table}" ADD CONSTRAINT "${entry.name}" FOREIGN KEY (${quoteList(entry.columns)}) REFERENCES "${entry.references.table}"(${quoteList(entry.references.columns)}) ON DELETE RESTRICT ON UPDATE RESTRICT;\n`,
        );
        break;
      case 'revoked_privileges':
        expect(text).toBe(
          `REVOKE ${entry.privileges.join(', ')} ON "${entry.table}" FROM ${entry.role};\n`,
        );
        break;
    }
  });

  it('marks nullable composite FKs exactly where the child column is nullable (MATCH SIMPLE)', () => {
    const tables = parseTables(sql);
    for (const entry of REGISTRY) {
      if (entry.kind !== 'composite_fk') continue;
      const column = tables.get(entry.table)?.find((c) => c.name === entry.columns[1]);
      expect(column, `${entry.table}.${entry.columns[1]}`).toBeDefined();
      expect(!column?.notNull, entry.name).toBe(entry.nullable);
    }
  });
});

describe('later migrations (§6.5 steps 1, 4 and 6)', () => {
  it('rejects the real Gate 0 hybrid draft that dropped protected objects', () => {
    const draft = readText('test/fixtures/run-37645666192-hybrid-add-note.sql');
    const inspection = inspectMigrationDraft(draft, [
      ...PROTECTED_OBJECT_NAMES,
      'poc_allocation_payment_id_org_fkey',
      'poc_payment_vendor_id_org_fkey',
      'poc_payment_org_id_key',
      'poc_vendor_org_id_key',
    ]);
    expect(inspection.ok).toBe(false);
    expect(inspection.offendingLines).toHaveLength(4);
  });

  it('every migration after the init one is non-destructive', () => {
    for (const name of migrationNames().filter((n) => n !== INIT_MIGRATION)) {
      const inspection = inspectMigrationDraft(migrationSql(name), PROTECTED_OBJECT_NAMES);
      expect(inspection.reasons, name).toEqual([]);
    }
  });
});
