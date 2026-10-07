// Gate 0 PoC orchestrator (PHASE-2-GATE-0-PLAN.md §5 runbook S3–S9, §6 TC-01..TC-26).
// Runs only inside the confirmed, manually dispatched GitHub Actions job against the
// disposable container. Stops at the first failure and always writes a report.
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { CASES, FK_CASE_IDS, runCases } from './cases.mjs';
import { assertDisposableDatabase, assertDisposableEnvironment, redactUrl } from './guard.mjs';
import {
  MANUAL_CONSTRAINTS,
  NATIVE_VARIANT_NAMES,
  auditForeignKeyActions,
  compareWithRegistry,
  readCatalog,
} from './registry.mjs';

const PRISMA_VERSION = '7.10.0';
const POC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(POC_ROOT, 'out');
const WORK = path.join(OUT, 'work');
const PRISMA_CLI = path.join(POC_ROOT, 'node_modules', 'prisma', 'build', 'index.js');

const URLS = {
  GATE0_MAIN_URL: process.env.GATE0_MAIN_URL,
  GATE0_SHADOW_URL: process.env.GATE0_SHADOW_URL,
  GATE0_FRESH_URL: process.env.GATE0_FRESH_URL,
  GATE0_NATIVE_URL: process.env.GATE0_NATIVE_URL,
};

class Gate0Failure extends Error {}

const report = {
  startedAt: new Date().toISOString(),
  prismaVersion: PRISMA_VERSION,
  postgresImage: process.env.GATE0_POSTGRES_IMAGE ?? null,
  commit: process.env.GITHUB_SHA ?? null,
  runUrl:
    process.env.GITHUB_RUN_ID && process.env.GITHUB_REPOSITORY
      ? `${process.env.GITHUB_SERVER_URL ?? 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  steps: [],
  outcome: 'running',
};

const redact = (text) => {
  let out = String(text ?? '');
  for (const value of Object.values(URLS)) {
    if (value) out = out.split(value).join(redactUrl(value));
  }
  return out.replace(/(postgres(?:ql)?:\/\/[^:@\s]+:)[^@\s]+@/g, '$1***@');
};

function guard() {
  assertDisposableEnvironment(URLS);
}

async function withClient(url, fn) {
  guard();
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await assertDisposableDatabase(client);
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** Runs the pinned Prisma CLI in the working copy with an explicit, guarded environment. */
function prisma(args, { databaseUrl, shadowUrl, schema, migrations, allowNonZero = false } = {}) {
  guard();
  // Pass the environment through unchanged (never hide Prisma's AI-agent detection variables;
  // see Prisma's agent-safety checkpoint) and only set the database selection for this call.
  const env = { ...process.env, PRISMA_HIDE_UPDATE_MESSAGE: '1', CHECKPOINT_DISABLE: '1' };
  delete env.DATABASE_URL;
  delete env.SHADOW_DATABASE_URL;
  delete env.GATE0_SCHEMA;
  delete env.GATE0_MIGRATIONS;
  if (databaseUrl) env.DATABASE_URL = databaseUrl;
  if (shadowUrl) env.SHADOW_DATABASE_URL = shadowUrl;
  if (schema) env.GATE0_SCHEMA = schema;
  if (migrations) env.GATE0_MIGRATIONS = migrations;
  const result = spawnSync(process.execPath, [PRISMA_CLI, ...args], {
    cwd: WORK,
    env,
    encoding: 'utf8',
    timeout: 180_000,
  });
  const record = {
    command: `prisma ${args.join(' ')}`,
    exitCode: result.status,
    stdout: redact(result.stdout),
    stderr: redact(result.stderr),
  };
  if (!allowNonZero && result.status !== 0) {
    throw new Gate0Failure(
      `${record.command} exited with ${result.status}\n${record.stderr || record.stdout}`,
    );
  }
  return record;
}

async function step(id, title, fn) {
  const entry = { id, title, status: 'running', evidence: {} };
  report.steps.push(entry);
  console.log(`\n▶ ${id} ${title}`);
  try {
    await fn(entry.evidence);
    entry.status = 'passed';
    console.log(`✔ ${id}`);
  } catch (error) {
    entry.status = 'failed';
    entry.error = redact(error instanceof Error ? error.message : String(error));
    console.log(`✖ ${id}: ${entry.error}`);
    throw error;
  }
}

function requireCases(results, label) {
  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    throw new Gate0Failure(`${label}: ${failed.map((r) => `${r.id} (${r.detail})`).join('; ')}`);
  }
}

function requireRegistry(comparison, label) {
  if (!comparison.ok) {
    throw new Gate0Failure(
      `${label}: missing [${comparison.missing.join(', ')}], mismatched [${comparison.mismatched.join(', ')}]`,
    );
  }
}

async function verifyDatabase(url, label, evidence) {
  return withClient(url, async (client) => {
    const catalog = await readCatalog(client);
    const registry = compareWithRegistry(catalog);
    const fkActions = auditForeignKeyActions(catalog);
    evidence[`${label}.registry`] = registry;
    evidence[`${label}.fkActions`] = fkActions;
    requireRegistry(registry, `${label} registry`);
    if (!fkActions.ok)
      throw new Gate0Failure(`${label} FK actions: ${fkActions.violations.join('; ')}`);
    const cases = await runCases(client);
    evidence[`${label}.cases`] = cases;
    requireCases(cases, `${label} TC-01..TC-15`);
  });
}

function newMigrationDirs(before) {
  const dir = path.join(WORK, 'prisma', 'migrations');
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !before.includes(d.name))
    .map((d) => d.name);
}

function prepareWorkingCopy() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  for (const entry of ['prisma', 'variants', 'scripts', 'prisma.config.ts', 'package.json']) {
    cpSync(path.join(POC_ROOT, entry), path.join(WORK, entry), { recursive: true });
  }
}

async function main() {
  // ---------------------------------------------------------------------------------- P0
  await step(
    'P0',
    'Preflight: guard, pinned Prisma version, empty disposable databases',
    async (ev) => {
      guard();
      ev.urls = Object.fromEntries(Object.entries(URLS).map(([k, v]) => [k, redactUrl(v)]));
      prepareWorkingCopy();
      const version = prisma(['--version']);
      const match = /^prisma\s*:\s*(\S+)/m.exec(version.stdout);
      ev.prismaVersion = match?.[1] ?? null;
      if (ev.prismaVersion !== PRISMA_VERSION) {
        throw new Gate0Failure(`Expected prisma ${PRISMA_VERSION}, got ${ev.prismaVersion}`);
      }
      for (const url of Object.values(URLS)) {
        await withClient(url, async (client) => {
          const { rows } = await client.query(
            `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema')`,
          );
          if (rows[0].n !== 0) throw new Gate0Failure(`${redactUrl(url)} is not empty`);
        });
      }
      ev.registrySize = MANUAL_CONSTRAINTS.length;
      ev.caseCount = CASES.length;
    },
  );

  // ---------------------------------------------------------------------------------- S3
  await step(
    'S3',
    'Apply init migration (Prisma SQL + appended manual constraints) to gate0_main',
    async (ev) => {
      ev.deploy = prisma(['migrate', 'deploy'], { databaseUrl: URLS.GATE0_MAIN_URL });
    },
  );

  // ---------------------------------------------------------------------------------- S4
  await step('S4', 'G0-1..G0-3: registry and TC-01..TC-15 on gate0_main', async (ev) => {
    await verifyDatabase(URLS.GATE0_MAIN_URL, 'main', ev);
  });

  // ---------------------------------------------------------------------------------- S5
  await step(
    'S5',
    'G0-4: migrate dev --create-only with an unrelated column (TC-16, TC-17)',
    async (ev) => {
      const schemaPath = path.join(WORK, 'prisma', 'schema.prisma');
      const schema = readFileSync(schemaPath, 'utf8');
      const anchor = '  payeeReceivedAmount Decimal         @db.Decimal(18, 2)\n';
      if (!schema.includes(anchor))
        throw new Gate0Failure('Could not find the PocPayment anchor line.');
      writeFileSync(schemaPath, schema.replace(anchor, `${anchor}  note                String?\n`));

      const before = readdirSync(path.join(WORK, 'prisma', 'migrations'));
      ev.createOnly = prisma(['migrate', 'dev', '--create-only', '--name', 'add_note'], {
        databaseUrl: URLS.GATE0_MAIN_URL,
        shadowUrl: URLS.GATE0_SHADOW_URL,
      });
      const created = newMigrationDirs(before);
      if (created.length !== 1)
        throw new Gate0Failure(`Expected one new migration, found [${created.join(', ')}]`);
      const sql = readFileSync(
        path.join(WORK, 'prisma', 'migrations', created[0], 'migration.sql'),
        'utf8',
      );
      ev.migration2 = { name: created[0], sql };

      // TC-16
      const manualNames = MANUAL_CONSTRAINTS.map((c) => c.name);
      const offending = sql
        .split('\n')
        .filter((line) => /\bDROP\b/i.test(line) || manualNames.some((n) => line.includes(n)));
      const addsNote = /ADD COLUMN\s+"note"/i.test(sql);
      ev.tc16 = { addsNote, offendingLines: offending };
      if (!addsNote) throw new Gate0Failure('TC-16: migration 2 does not add the "note" column.');
      if (offending.length > 0) {
        throw new Gate0Failure(
          `TC-16: migration 2 touches manual constraints or drops objects:\n${offending.join('\n')}`,
        );
      }

      // TC-17
      ev.apply = prisma(['migrate', 'deploy'], { databaseUrl: URLS.GATE0_MAIN_URL });
      await withClient(URLS.GATE0_MAIN_URL, async (client) => {
        const registry = compareWithRegistry(await readCatalog(client));
        ev.tc17 = registry;
        requireRegistry(registry, 'TC-17');
      });
    },
  );

  // ---------------------------------------------------------------------------------- S6
  await step('S6', 'G0-5: migrate reset on the isolated gate0_main only (TC-18)', async (ev) => {
    // Re-confirm isolation immediately before the destructive command (D-6).
    await withClient(URLS.GATE0_MAIN_URL, async (client) => {
      const { rows } = await client.query('SELECT current_database() AS db');
      if (rows[0].db !== 'gate0_main')
        throw new Gate0Failure(`reset target is ${rows[0].db}, not gate0_main`);
    });
    ev.reset = prisma(['migrate', 'reset', '--force'], { databaseUrl: URLS.GATE0_MAIN_URL });
    await verifyDatabase(URLS.GATE0_MAIN_URL, 'main-after-reset', ev);
  });

  // ---------------------------------------------------------------------------------- S7
  await step('S7', 'G0-6: migrate deploy on the clean gate0_fresh (TC-19)', async (ev) => {
    ev.deploy = prisma(['migrate', 'deploy'], { databaseUrl: URLS.GATE0_FRESH_URL });
    await verifyDatabase(URLS.GATE0_FRESH_URL, 'fresh', ev);
  });

  // ---------------------------------------------------------------------------------- S8
  await step('S8', 'G0-7: drift checks (TC-20, TC-21, TC-22)', async (ev) => {
    const migrationsDir = path.join(WORK, 'prisma', 'migrations');
    const schemaPath = path.join(WORK, 'prisma', 'schema.prisma');

    // TC-20: migrations → schema (needs the shadow database). Recorded, must not error.
    ev.tc20 = prisma(
      [
        'migrate',
        'diff',
        '--from-migrations',
        migrationsDir,
        '--to-schema',
        schemaPath,
        '--script',
      ],
      {
        databaseUrl: URLS.GATE0_MAIN_URL,
        shadowUrl: URLS.GATE0_SHADOW_URL,
      },
    );
    ev.tc20ExitCode = prisma(
      [
        'migrate',
        'diff',
        '--from-migrations',
        migrationsDir,
        '--to-schema',
        schemaPath,
        '--exit-code',
      ],
      { databaseUrl: URLS.GATE0_MAIN_URL, shadowUrl: URLS.GATE0_SHADOW_URL, allowNonZero: true },
    );
    if (ev.tc20ExitCode.exitCode === 1) throw new Gate0Failure('TC-20: migrate diff errored.');

    // TC-21: live database → schema. Recorded, must not error.
    ev.tc21 = prisma(
      ['migrate', 'diff', '--from-config-datasource', '--to-schema', schemaPath, '--script'],
      {
        databaseUrl: URLS.GATE0_FRESH_URL,
      },
    );
    ev.tc21ExitCode = prisma(
      ['migrate', 'diff', '--from-config-datasource', '--to-schema', schemaPath, '--exit-code'],
      {
        databaseUrl: URLS.GATE0_FRESH_URL,
        allowNonZero: true,
      },
    );
    if (ev.tc21ExitCode.exitCode === 1) throw new Gate0Failure('TC-21: migrate diff errored.');

    // TC-22: drop one manual CHECK on the disposable gate0_fresh, then see which method notices.
    const dropped = 'poc_payment_fee_bearer_amounts_check';
    await withClient(URLS.GATE0_FRESH_URL, async (client) => {
      await client.query(`ALTER TABLE "PocPayment" DROP CONSTRAINT "${dropped}"`);
    });
    ev.tc22 = { dropped };
    ev.tc22.prismaDiffAfterDrop = prisma(
      ['migrate', 'diff', '--from-config-datasource', '--to-schema', schemaPath, '--exit-code'],
      { databaseUrl: URLS.GATE0_FRESH_URL, allowNonZero: true },
    );
    ev.tc22.prismaDetects =
      ev.tc22.prismaDiffAfterDrop.exitCode !== ev.tc21ExitCode.exitCode
        ? 'exit code changed'
        : 'no change';
    await withClient(URLS.GATE0_FRESH_URL, async (client) => {
      const registry = compareWithRegistry(await readCatalog(client));
      ev.tc22.registry = registry;
      if (!registry.missing.includes(dropped)) {
        throw new Gate0Failure('TC-22: the registry check did not detect the dropped constraint.');
      }
    });
  });

  // ---------------------------------------------------------------------------------- S9
  await step('S9', 'G0-8: native composite relations and Hybrid (TC-23..TC-26)', async (ev) => {
    const nativeSchema = path.join(WORK, 'variants', 'native', 'schema.prisma');
    const nativeMigrations = path.join(WORK, 'variants', 'native', 'migrations');

    // TC-23 / TC-24: does Prisma accept the composite relations? (recorded outcome)
    ev.validate = prisma(['validate'], { schema: nativeSchema, allowNonZero: true });
    ev.nativeSupported = ev.validate.exitCode === 0;

    if (ev.nativeSupported) {
      const diff = prisma(
        ['migrate', 'diff', '--from-empty', '--to-schema', nativeSchema, '--script'],
        {
          schema: nativeSchema,
        },
      );
      if (!diff.stdout.includes('CREATE TABLE')) {
        throw new Gate0Failure(
          'TC-23/24: migrate diff produced no SQL (engine failure is silent; see ADR-034).',
        );
      }
      ev.nativeSql = diff.stdout;
      const fkLines = diff.stdout.split('\n').filter((l) => l.includes('FOREIGN KEY'));
      ev.tc23 = fkLines.filter((l) => l.includes('poc_allocation_payment_id_org_fkey'));
      ev.tc24 = fkLines.filter((l) => l.includes('poc_payment_vendor_id_org_fkey'));

      // TC-25 (SQL text): every emitted FK must be RESTRICT / NO ACTION for delete and update.
      const badSql = fkLines.filter(
        (l) =>
          !/ON DELETE (RESTRICT|NO ACTION)/.test(l) || !/ON UPDATE (RESTRICT|NO ACTION)/.test(l),
      );
      ev.tc25Sql = { fkLines, violations: badSql };
      if (badSql.length > 0)
        throw new Gate0Failure(`TC-25: FK actions in generated SQL:\n${badSql.join('\n')}`);

      mkdirSync(path.join(nativeMigrations, '20261007000000_init'), { recursive: true });
      writeFileSync(
        path.join(nativeMigrations, '20261007000000_init', 'migration.sql'),
        diff.stdout,
      );
      writeFileSync(
        path.join(nativeMigrations, 'migration_lock.toml'),
        'provider = "postgresql"\n',
      );
      ev.nativeDeploy = prisma(['migrate', 'deploy'], {
        databaseUrl: URLS.GATE0_NATIVE_URL,
        schema: nativeSchema,
        migrations: nativeMigrations,
      });
      await withClient(URLS.GATE0_NATIVE_URL, async (client) => {
        const catalog = await readCatalog(client);
        const registry = compareWithRegistry(catalog, {
          only: NATIVE_VARIANT_NAMES,
          uniqueMayBeIndex: true,
        });
        ev.nativeRegistry = registry;
        requireRegistry(registry, 'native registry');
        ev.nativeFkActions = auditForeignKeyActions(catalog);
        if (!ev.nativeFkActions.ok) {
          throw new Gate0Failure(`TC-25 native: ${ev.nativeFkActions.violations.join('; ')}`);
        }
        const cases = await runCases(client, FK_CASE_IDS);
        ev.nativeCases = cases;
        requireCases(cases, 'native TC-10..TC-15');
      });
    }

    // TC-25 (database): Hybrid schema on gate0_main after reset.
    await withClient(URLS.GATE0_MAIN_URL, async (client) => {
      ev.hybridFkActions = auditForeignKeyActions(await readCatalog(client));
      if (!ev.hybridFkActions.ok)
        throw new Gate0Failure(`TC-25 hybrid: ${ev.hybridFkActions.violations.join('; ')}`);
    });

    // TC-26: Hybrid — composite FKs proven by S4/S6/S7 (TC-10..TC-17); client generation works.
    ev.generate = prisma(['generate']);
    const generated = path.join(WORK, 'generated', 'prisma');
    if (!existsSync(generated))
      throw new Gate0Failure('TC-26: prisma generate produced no client.');
    ev.tc26 = { generatedClient: true };
  });

  report.outcome = 'passed';
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, 'gate0-report.json'), JSON.stringify(report, null, 2));
  const lines = [
    '# Gate 0 PoC run report',
    '',
    `- Outcome: **${report.outcome.toUpperCase()}**`,
    `- Commit: ${report.commit ?? 'n/a'}`,
    `- Run: ${report.runUrl ?? 'n/a'}`,
    `- Prisma: ${report.prismaVersion}; PostgreSQL image: ${report.postgresImage ?? 'n/a'}`,
    `- Started: ${report.startedAt}; finished: ${report.finishedAt}`,
    '',
    '| Step | Title | Status |',
    '| --- | --- | --- |',
    ...report.steps.map((s) => `| ${s.id} | ${s.title} | ${s.status.toUpperCase()} |`),
    '',
  ];
  for (const s of report.steps) {
    for (const [key, value] of Object.entries(s.evidence)) {
      if (Array.isArray(value) && value[0]?.id?.startsWith('TC-')) {
        lines.push(
          `## ${s.id} ${key}`,
          '',
          '| TC | Gate | Result | Detail |',
          '| --- | --- | --- | --- |',
        );
        for (const r of value)
          lines.push(`| ${r.id} | ${r.gate} | ${r.passed ? 'PASS' : 'FAIL'} | ${r.detail} |`);
        lines.push('');
      }
    }
    if (s.error) lines.push(`## ${s.id} failure`, '', '```', s.error, '```', '');
  }
  lines.push('Full evidence (commands, outputs, generated SQL): `gate0-report.json`.');
  writeFileSync(path.join(OUT, 'gate0-report.md'), `${lines.join('\n')}\n`);
}

try {
  await main();
} catch (error) {
  report.outcome = 'failed';
  if (!(error instanceof Gate0Failure)) {
    report.unexpectedError = redact(
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  }
  process.exitCode = 1;
} finally {
  writeReport();
  console.log(
    `\nGate 0 outcome: ${report.outcome.toUpperCase()} — report written to out/gate0-report.{md,json}`,
  );
}
