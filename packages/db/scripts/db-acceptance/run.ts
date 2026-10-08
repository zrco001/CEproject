// Phase 2 formal-schema acceptance on ONE brand-new, disposable, local PostgreSQL container.
//
// Approved scope: CLAUDE-PHASE2-DB-AND-PHASE3-WORK-PACKAGE.md §3 A (owner approval 2026-10-08).
// It never touches an existing database: it creates its own uniquely named container (refusing
// to start if the name or the loopback port is taken), creates roles and ceproject_it_*
// databases inside it, applies the committed migrations, runs the existing tests with no skips,
// checks the live catalog against the registry, collects Prisma drift evidence (no DROP draft is
// applied), runs the reference seed twice, and then stops the container and proves it is gone.
//
// Build first, then run from the repository root:
//   pnpm --filter @ceproject/db build
//   node packages/db/dist/scripts/db-acceptance/run.js --attempt 1 \
//     --confirm "RUN PHASE2 DB ACCEPTANCE ON A NEW DISPOSABLE CONTAINER"
// Options: --port 55434, --evidence-root <dir> (default ../ceproject-evidence/phase2-db next to
// the repository), --docker <path to docker CLI>.
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { PROTECTED_OBJECT_NAMES, REGISTRY } from '../../prisma/constraints.registry.js';
import { inspectDriftScript, inspectMigrationDraft } from '../../src/migration/inspect.js';
import { readCatalog } from '../../src/registry/catalog.js';
import { auditForeignKeyActions, compareWithRegistry } from '../../src/registry/compare.js';
import { PERMISSIONS, grantsByRole } from '../../src/seed/permissions.js';
import { resolveIntegrationDatabaseConfig } from '../../test/db/guard.js';
import {
  CONFIRMATION,
  DATA_DIR,
  DEFAULT_PORT,
  IMAGE,
  ROLES,
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
  type VitestReport,
} from './guards.js';

/** Offline tests (599 at the approved head) + 223 PostgreSQL tests; must all run, none skipped. */
const MINIMUM_TESTS = 822;
const POLL_LIMIT = 30;

// dist/scripts/db-acceptance → package root
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');
const PRISMA_CLI = path.join(PACKAGE_ROOT, 'node_modules/prisma/build/index.js');
const VITEST_CLI = path.join(PACKAGE_ROOT, 'node_modules/vitest/vitest.mjs');
const SEED_CLI = path.join(PACKAGE_ROOT, 'dist/src/seed/cli.js');

type StepStatus = 'PASS' | 'FAIL' | 'SKIPPED';
interface Step {
  name: string;
  status: StepStatus;
  detail: unknown;
}

class StepFailure extends Error {
  override readonly name = 'StepFailure';
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
  }
}

const sleep = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

function parseArgs(argv: readonly string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key?.startsWith('--') !== true || value === undefined) {
      throw new Error(`unexpected argument ${key ?? ''}`);
    }
    args.set(key.slice(2), value);
  }
  return args;
}

function findDocker(explicit: string | undefined): string {
  const candidates = [
    explicit,
    process.env['CEPROJECT_DOCKER'],
    process.env['LOCALAPPDATA'] &&
      path.join(process.env['LOCALAPPDATA'], 'Programs/DockerDesktop/resources/bin/docker.exe'),
    'C:/Program Files/Docker/Docker/resources/bin/docker.exe',
    '/usr/local/bin/docker',
    '/usr/bin/docker',
  ];
  const found = candidates.find((candidate) => candidate && existsSync(candidate));
  if (!found) throw new Error('docker CLI not found (use --docker)');
  return found;
}

function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(false);
    });
    server.listen(port, '127.0.0.1', () => {
      server.close(() => {
        resolve(true);
      });
    });
  });
}

function git(args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed`);
  return result.stdout.trim();
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.get('confirm') !== CONFIRMATION) {
    console.error(`Refusing to run: pass --confirm "${CONFIRMATION}".`);
    return 2;
  }
  const attempt = Number(args.get('attempt'));
  const port = validatePort(Number(args.get('port') ?? DEFAULT_PORT));
  const docker = findDocker(args.get('docker'));
  const evidenceRoot = path.resolve(
    args.get('evidence-root') ?? path.join(REPO_ROOT, '../ceproject-evidence/phase2-db'),
  );
  if (evidenceRoot.startsWith(REPO_ROOT + path.sep)) {
    throw new Error('evidence root must be outside the repository');
  }

  // ---- Source identity: evidence must belong to one exact, clean commit ----
  if (git(['status', '--porcelain']) !== '') {
    console.error('Refusing to run: the working tree has uncommitted changes.');
    return 2;
  }
  const commit = git(['rev-parse', 'HEAD']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);

  // ---- Attempt ledger (approved maximum: two container attempts) ----
  mkdirSync(evidenceRoot, { recursive: true });
  const ledgerPath = path.join(evidenceRoot, 'attempts.json');
  const ledger: LedgerEntry[] = existsSync(ledgerPath)
    ? (JSON.parse(readFileSync(ledgerPath, 'utf8')) as LedgerEntry[])
    : [];
  const decision = attemptDecision(ledger, attempt, commit);
  if (!decision.allowed) {
    console.error(`Refusing to run attempt ${attempt}: ${decision.reason}.`);
    return 2;
  }

  const executionId = makeExecutionId(new Date(), randomBytes(4).toString('hex'));
  const name = containerName(executionId);
  const databases = databaseNames(executionId);
  const evidenceDir = path.join(evidenceRoot, `run-${executionId}`);
  mkdirSync(evidenceDir, { recursive: true });

  const passwords = {
    admin: randomBytes(16).toString('hex'),
    migrator: randomBytes(16).toString('hex'),
    tester: randomBytes(16).toString('hex'),
  };
  const secrets = Object.values(passwords);
  const write = (file: string, content: unknown): void => {
    const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    writeFileSync(path.join(evidenceDir, file), redact(text, secrets));
  };
  const run = (
    command: string,
    commandArgs: readonly string[],
    options: { cwd?: string; env?: NodeJS.ProcessEnv; timeout?: number } = {},
  ): SpawnSyncReturns<string> =>
    spawnSync(command, commandArgs, {
      cwd: options.cwd ?? REPO_ROOT,
      env: options.env ?? process.env,
      encoding: 'utf8',
      timeout: options.timeout ?? 120_000,
      maxBuffer: 256 * 1024 * 1024,
    });
  const dockerRun = (dockerArgs: readonly string[]) => run(docker, dockerArgs);

  // ---- Preflight (no container yet; a stop here does not consume the attempt) ----
  const preflight: Record<string, unknown> = { commit, tree, executionId, container: name, port };
  const info = dockerRun(['info', '--format', '{{.ServerVersion}}|{{.OSType}}']);
  preflight['dockerInfo'] = { exitCode: info.status, stdout: info.stdout.trim() };
  const preflightProblems: string[] = [];
  if (info.status !== 0 || !info.stdout.trim().endsWith('|linux')) {
    preflightProblems.push('Docker Linux engine is not available');
  } else {
    const existing = dockerRun(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.ID}}']);
    if (existing.status !== 0 || existing.stdout.trim() !== '') {
      preflightProblems.push('container name already exists or cannot be queried');
    }
    if (!(await portIsFree(port))) preflightProblems.push(`127.0.0.1:${port} is in use`);
    let image = dockerRun(['image', 'inspect', IMAGE, '--format', '{{json .RepoDigests}}']);
    if (image.status !== 0) {
      const pull = dockerRun(['pull', IMAGE]);
      preflight['imagePull'] = { exitCode: pull.status, output: pull.stdout.slice(-2000) };
      image = dockerRun(['image', 'inspect', IMAGE, '--format', '{{json .RepoDigests}}']);
    }
    preflight['imageDigests'] = image.stdout.trim();
    if (image.status !== 0) preflightProblems.push(`image ${IMAGE} unavailable`);
  }
  preflight['problems'] = preflightProblems;
  write('preflight.json', preflight);
  if (preflightProblems.length > 0) {
    console.error(`Preflight stop (attempt not consumed): ${preflightProblems.join('; ')}`);
    return 2;
  }

  const migratorUrl = (database: string) =>
    loopbackUrl(ROLES.migrator, passwords.migrator, port, database);
  const testerUrl = loopbackUrl(ROLES.tester, passwords.tester, port, databases.test);
  // The tests connect with exactly this validated object (Codex review of 683606122, P1).
  const testerTarget = resolveIntegrationDatabaseConfig({ CEPROJECT_IT_DATABASE_URL: testerUrl });
  if (testerTarget === undefined) throw new Error('tester target did not validate');

  // ---- The attempt starts: record it before creating the container ----
  const entry: LedgerEntry = {
    attempt,
    executionId,
    commit,
    result: 'STARTED',
    cleanup: 'PENDING',
  };
  writeFileSync(ledgerPath, JSON.stringify([...ledger, entry], null, 2));

  const steps: Step[] = [];
  let containerId: string | undefined;
  // Mutated inside step(); an object so the outcome is not narrowed to its initial value.
  const outcome: { failed: boolean; result: LedgerEntry['result'] } = {
    failed: false,
    result: 'FAIL',
  };
  const step = async (stepName: string, body: () => unknown): Promise<void> => {
    if (outcome.failed) {
      steps.push({ name: stepName, status: 'SKIPPED', detail: 'an earlier step failed' });
      return;
    }
    try {
      const detail = await body();
      steps.push({ name: stepName, status: 'PASS', detail });
    } catch (error) {
      outcome.failed = true;
      steps.push({
        name: stepName,
        status: 'FAIL',
        detail: {
          message: redact(error instanceof Error ? error.message : String(error), secrets),
          ...(error instanceof StepFailure ? { evidence: error.detail } : {}),
        },
      });
    }
  };

  const adminClient = (database: string) =>
    new pg.Client({
      host: '127.0.0.1',
      port,
      user: ROLES.admin,
      password: passwords.admin,
      database,
    });

  const childEnv = (extra: Record<string, string>): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
    // Never inherit libpq overrides or another database URL from the caller's environment.
    for (const key of [
      'PGHOST',
      'PGHOSTADDR',
      'PGPORT',
      'PGDATABASE',
      'PGUSER',
      'PGPASSWORD',
      'PGOPTIONS',
      'PGSERVICE',
    ]) {
      Reflect.deleteProperty(env, key);
    }
    for (const key of ['DATABASE_URL', 'SHADOW_DATABASE_URL', 'CEPROJECT_IT_DATABASE_URL']) {
      if (extra[key] === undefined) Reflect.deleteProperty(env, key);
    }
    return env;
  };
  const prisma = (prismaArgs: readonly string[], env: NodeJS.ProcessEnv) =>
    run(process.execPath, [PRISMA_CLI, ...prismaArgs], {
      cwd: PACKAGE_ROOT,
      env,
      timeout: 300_000,
    });

  try {
    await step('container-start', () => {
      const result = dockerRun([
        'run',
        '-d',
        '--rm',
        '--name',
        name,
        '--label',
        `ceproject.execution=${executionId}`,
        '-p',
        `127.0.0.1:${port}:5432`,
        '--tmpfs',
        `${DATA_DIR}:rw,size=1024m`,
        '-e',
        `POSTGRES_USER=${ROLES.admin}`,
        '-e',
        `POSTGRES_PASSWORD=${passwords.admin}`,
        '-e',
        'POSTGRES_DB=postgres',
        IMAGE,
      ]);
      const id = result.stdout.trim();
      if (result.status !== 0 || !/^[0-9a-f]{64}$/.test(id)) {
        // A failed `run` may still have created our uniquely named container: find it to clean it.
        const found = dockerRun([
          'ps',
          '-a',
          '--no-trunc',
          '--filter',
          `name=^/${name}$`,
          '--filter',
          `label=ceproject.execution=${executionId}`,
          '--format',
          '{{.ID}}',
        ]);
        if (/^[0-9a-f]{64}$/.test(found.stdout.trim())) containerId = found.stdout.trim();
        throw new StepFailure('docker run failed', {
          exitCode: result.status,
          stderr: result.stderr,
        });
      }
      containerId = id;
      return { containerId: id, name, port };
    });

    await step('container-boundaries', () => {
      const inspect = dockerRun(['inspect', containerId ?? '']);
      const parsed = (JSON.parse(inspect.stdout) as ContainerInspect[])[0] ?? {};
      const violations = containerViolations(parsed, { id: containerId ?? '', name, port });
      if (violations.length > 0) throw new StepFailure('container boundaries violated', violations);
      return {
        image: parsed.Config?.Image,
        tmpfs: parsed.HostConfig?.Tmpfs,
        portBindings: parsed.HostConfig?.PortBindings,
        mounts: parsed.Mounts ?? [],
      };
    });

    await step('postgres-ready', async () => {
      // TCP on 127.0.0.1 inside the container: the init-time server listens on the socket only.
      let ready = false;
      for (let i = 0; i < 90 && !ready; i += 1) {
        const probe = dockerRun([
          'exec',
          containerId ?? '',
          'pg_isready',
          '-h',
          '127.0.0.1',
          '-p',
          '5432',
          '-U',
          ROLES.admin,
          '-d',
          'postgres',
        ]);
        ready = probe.status === 0;
        if (!ready) sleep(1000);
      }
      if (!ready) throw new StepFailure('PostgreSQL did not become ready within 90 s');
      const client = adminClient('postgres');
      await client.connect();
      try {
        const version = await client.query<{ server_version: string; version: string }>(
          "SELECT current_setting('server_version') AS server_version, version() AS version",
        );
        return version.rows[0];
      } finally {
        await client.end();
      }
    });

    await step('roles-and-databases', async () => {
      const client = adminClient('postgres');
      await client.connect();
      try {
        const literal = (value: string) => client.escapeLiteral(value);
        await client.query(
          `CREATE ROLE ${ROLES.migrator} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD ${literal(passwords.migrator)}`,
        );
        await client.query(`CREATE ROLE ${ROLES.app} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`);
        await client.query(
          `CREATE ROLE ${ROLES.tester} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT IN ROLE ${ROLES.app} PASSWORD ${literal(passwords.tester)}`,
        );
        for (const database of [databases.test, databases.shadow]) {
          await client.query(
            `CREATE DATABASE ${client.escapeIdentifier(database)} OWNER ${ROLES.migrator}`,
          );
        }
      } finally {
        await client.end();
      }
      // Default privileges for tables the migrator creates (constraints.md §5). TRUNCATE is
      // never granted; the init migration revokes UPDATE / DELETE / TRUNCATE on AuditLog.
      const testDb = adminClient(databases.test);
      await testDb.connect();
      try {
        await testDb.query(`GRANT USAGE ON SCHEMA public TO ${ROLES.app}`);
        await testDb.query(
          `ALTER DEFAULT PRIVILEGES FOR ROLE ${ROLES.migrator} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROLES.app}`,
        );
      } finally {
        await testDb.end();
      }
      return { roles: ROLES, databases };
    });

    await step('role-checks', async () => {
      const client = adminClient('postgres');
      await client.connect();
      try {
        const roles = await client.query<{
          rolname: string;
          rolsuper: boolean;
          rolcanlogin: boolean;
          rolinherit: boolean;
          rolcreatedb: boolean;
          rolcreaterole: boolean;
        }>(
          `SELECT rolname, rolsuper, rolcanlogin, rolinherit, rolcreatedb, rolcreaterole
             FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`,
          [[ROLES.migrator, ROLES.app, ROLES.tester]],
        );
        const membership = await client.query<{ member: string; role: string; inherit: boolean }>(
          `SELECT m.rolname AS member, r.rolname AS role, a.inherit_option AS inherit
             FROM pg_auth_members a
             JOIN pg_roles m ON m.oid = a.member
             JOIN pg_roles r ON r.oid = a.roleid
            WHERE r.rolname = $1`,
          [ROLES.app],
        );
        const problems: string[] = [];
        for (const role of roles.rows) {
          if (role.rolsuper || role.rolcreatedb || role.rolcreaterole) {
            problems.push(`${role.rolname} has elevated attributes`);
          }
        }
        if (roles.rows.find((r) => r.rolname === ROLES.app)?.rolcanlogin !== false) {
          problems.push('app_user must be NOLOGIN');
        }
        if (
          membership.rows.length !== 1 ||
          membership.rows[0]?.member !== ROLES.tester ||
          !membership.rows[0].inherit
        ) {
          problems.push('only the tester may be an inheriting member of app_user');
        }
        if (roles.rows.length !== 3) problems.push('expected exactly three roles');
        if (problems.length > 0) throw new StepFailure('role checks failed', problems);
        return { roles: roles.rows, membership: membership.rows };
      } finally {
        await client.end();
      }
    });

    await step('migrate-deploy', async () => {
      const result = prisma(
        ['migrate', 'deploy'],
        childEnv({ DATABASE_URL: migratorUrl(databases.test) }),
      );
      write('migrate-deploy.log', `${result.stdout}\n${result.stderr}`);
      if (result.status !== 0) throw new StepFailure('prisma migrate deploy failed', result.status);
      const client = adminClient(databases.test);
      await client.connect();
      try {
        const applied = await client.query<{
          migration_name: string;
          finished_at: Date | null;
          rolled_back_at: Date | null;
        }>(
          'SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY migration_name',
        );
        const expected = readdirSync(path.join(PACKAGE_ROOT, 'prisma/migrations'), {
          withFileTypes: true,
        })
          .filter((e) => e.isDirectory())
          .map((e) => e.name)
          .sort();
        const names = applied.rows.map((row) => row.migration_name);
        if (
          JSON.stringify(names) !== JSON.stringify(expected) ||
          applied.rows.some((row) => row.finished_at === null || row.rolled_back_at !== null)
        ) {
          throw new StepFailure('applied migrations differ from the committed ones', applied.rows);
        }
        return { applied: applied.rows };
      } finally {
        await client.end();
      }
    });

    await step('ownership-and-privileges', async () => {
      const client = adminClient(databases.test);
      await client.connect();
      try {
        const owners = await client.query<{ table: string; owner: string }>(
          `SELECT c.relname AS table, pg_get_userbyid(c.relowner) AS owner
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`,
        );
        const privileges = await client.query<{ privilege: string; granted: boolean }>(
          `SELECT p AS privilege, has_table_privilege($1, 'public."AuditLog"', p) AS granted
             FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
          [ROLES.app],
        );
        const problems: string[] = [];
        if (owners.rows.length !== 37)
          problems.push(`expected 37 tables, found ${owners.rows.length}`);
        for (const row of owners.rows) {
          if (row.owner !== ROLES.migrator) problems.push(`${row.table} is owned by ${row.owner}`);
        }
        const granted = Object.fromEntries(privileges.rows.map((r) => [r.privilege, r.granted]));
        if (granted['SELECT'] !== true || granted['INSERT'] !== true) {
          problems.push('app_user must be able to SELECT and INSERT AuditLog');
        }
        for (const revoked of ['UPDATE', 'DELETE', 'TRUNCATE']) {
          if (granted[revoked] !== false)
            problems.push(`app_user still has ${revoked} on AuditLog`);
        }
        if (problems.length > 0)
          throw new StepFailure('ownership / privilege checks failed', problems);
        return { tables: owners.rows.length, owner: ROLES.migrator, auditLogPrivileges: granted };
      } finally {
        await client.end();
      }
    });

    await step('tests', () => {
      const reportFile = path.join(evidenceDir, 'vitest-report.json');
      const result = run(
        process.execPath,
        [
          VITEST_CLI,
          'run',
          '--reporter=default',
          '--reporter=json',
          `--outputFile.json=${reportFile}`,
        ],
        {
          cwd: PACKAGE_ROOT,
          env: childEnv({ CEPROJECT_IT_DATABASE_URL: testerUrl }),
          timeout: 900_000,
        },
      );
      write('vitest.log', `${result.stdout}\n${result.stderr}`);
      if (!existsSync(reportFile)) throw new StepFailure('no Vitest JSON report', result.status);
      const report = JSON.parse(readFileSync(reportFile, 'utf8')) as VitestReport;
      const verdict = evaluateTests(report, MINIMUM_TESTS);
      if (!verdict.ok) throw new StepFailure('tests did not all pass', verdict);
      return verdict;
    });

    await step('registry-catalog', async () => {
      const client = new pg.Client({ ...testerTarget });
      await client.connect();
      try {
        const catalog = await readCatalog(client);
        const comparison = compareWithRegistry(catalog);
        const fkAudit = auditForeignKeyActions(catalog);
        const registered = new Set(REGISTRY.map((entry) => entry.name));
        write('catalog.json', {
          comparison,
          fkAudit: {
            ok: fkAudit.ok,
            count: fkAudit.foreignKeys.length,
            violations: fkAudit.violations,
          },
          registryObjects: {
            constraints: catalog.constraints.filter((c) => registered.has(c.name)),
            indexes: catalog.indexes.filter((i) => registered.has(i.name)),
            privileges: catalog.privileges,
          },
        });
        if (!comparison.ok || !fkAudit.ok) {
          throw new StepFailure('catalog does not match the registry', {
            missing: comparison.missing,
            mismatched: comparison.mismatched,
            fkViolations: fkAudit.violations,
          });
        }
        return {
          registryEntries: REGISTRY.length,
          present: comparison.present.length,
          foreignKeys: fkAudit.foreignKeys.length,
        };
      } finally {
        await client.end();
      }
    });

    await step('drift', () => {
      const env = childEnv({
        DATABASE_URL: migratorUrl(databases.test),
        SHADOW_DATABASE_URL: migratorUrl(databases.shadow),
      });
      const diff = (label: string, from: readonly string[], to: readonly string[]) => {
        const script = prisma(['migrate', 'diff', ...from, ...to, '--script'], env);
        const exit = prisma(['migrate', 'diff', ...from, ...to, '--exit-code'], env);
        write(`drift-${label}.sql`, script.stdout);
        write(
          `drift-${label}.log`,
          `${script.stderr}\n--- exit-code run ---\n${exit.stdout}\n${exit.stderr}`,
        );
        if (script.status !== 0)
          throw new StepFailure(`${label}: diff --script failed`, script.status);
        return { script: script.stdout, exitCode: exit.status };
      };
      const fromMigrations = ['--from-migrations', 'prisma/migrations'];
      const fromDatabase = ['--from-config-datasource'];
      const toSchema = ['--to-schema', 'prisma/schema.prisma'];

      // Positive controls: each source must report a difference against an empty schema.
      const controlMigrations = diff('control-migrations', fromMigrations, ['--to-empty']);
      const controlDatabase = diff('control-database', fromDatabase, ['--to-empty']);
      // Drift checks (Gate 0 TC-20 / TC-21 rules).
      const migrationsVsSchema = diff('migrations-vs-schema', fromMigrations, toSchema);
      const databaseVsSchema = diff('database-vs-schema', fromDatabase, toSchema);
      // Unrelated-column draft (G0-4 rule): inspected only, never applied.
      const draftSchema = path.join(evidenceDir, 'draft-add-note.prisma');
      const schema = readFileSync(path.join(PACKAGE_ROOT, 'prisma/schema.prisma'), 'utf8');
      if (!schema.includes('model Payment {\n')) throw new StepFailure('Payment model not found');
      writeFileSync(
        draftSchema,
        schema.replace('model Payment {\n', 'model Payment {\n  note String?\n'),
      );
      const draft = diff('draft-add-note', fromMigrations, ['--to-schema', draftSchema]);

      const result = {
        controlMigrations: {
          exitCode: controlMigrations.exitCode,
          ok: positiveControlOk(controlMigrations.exitCode, controlMigrations.script),
        },
        controlDatabase: {
          exitCode: controlDatabase.exitCode,
          ok: positiveControlOk(controlDatabase.exitCode, controlDatabase.script),
        },
        migrationsVsSchema: inspectDriftScript(
          migrationsVsSchema.script,
          migrationsVsSchema.exitCode ?? -1,
          PROTECTED_OBJECT_NAMES,
        ),
        databaseVsSchema: inspectDriftScript(
          databaseVsSchema.script,
          databaseVsSchema.exitCode ?? -1,
          PROTECTED_OBJECT_NAMES,
        ),
        draft: {
          exitCode: draft.exitCode,
          inspection: inspectMigrationDraft(draft.script, PROTECTED_OBJECT_NAMES),
          addsNote: /ALTER TABLE "Payment" ADD COLUMN\s+"note" TEXT/.test(draft.script),
        },
      };
      write('drift.json', result);
      const ok =
        result.controlMigrations.ok &&
        result.controlDatabase.ok &&
        result.migrationsVsSchema.ok &&
        result.databaseVsSchema.ok &&
        result.draft.exitCode === 2 &&
        result.draft.inspection.ok &&
        result.draft.addsNote;
      if (!ok) throw new StepFailure('drift evidence does not meet the rules', result);
      return {
        controls: [result.controlMigrations.exitCode, result.controlDatabase.exitCode],
        migrationsVsSchema: result.migrationsVsSchema.drift,
        databaseVsSchema: result.databaseVsSchema.drift,
        draftStatements:
          result.draft.inspection.offendingLines.length === 0 ? 'additive only' : 'rejected',
      };
    });

    await step('reference-seed-twice', async () => {
      const seedEnv = childEnv({
        DATABASE_URL: testerUrl,
        CEPROJECT_SEED_CONFIRM: 'SEED REFERENCE DATA',
      });
      const client = new pg.Client({ ...testerTarget });
      await client.connect();
      const snapshot = async () => {
        const grants = await client.query<{ role: string; permission: string }>(
          `SELECT r.code AS role, p.code AS permission
             FROM "RolePermission" rp
             JOIN "Role" r ON r.id = rp."roleId"
             JOIN "Permission" p ON p.id = rp."permissionId"
            ORDER BY r.code, p.code`,
        );
        const permissions = await client.query<{ code: string }>(
          'SELECT code FROM "Permission" ORDER BY code',
        );
        const roles = await client.query<{ code: string; system: boolean }>(
          `SELECT code, ("organizationId" IS NULL AND "isSystem") AS system FROM "Role" ORDER BY code`,
        );
        const business = await client.query<{
          users: string;
          organizations: string;
          categories: string;
        }>(
          `SELECT (SELECT count(*) FROM "User") AS users,
                  (SELECT count(*) FROM "Organization") AS organizations,
                  (SELECT count(*) FROM "CostCategory") AS categories`,
        );
        return {
          grants: grants.rows.map((g) => `${g.role}:${g.permission}`),
          permissions: permissions.rows.map((p) => p.code),
          roles: roles.rows,
          business: business.rows[0],
        };
      };
      try {
        const before = await snapshot();
        const runs = [1, 2].map((n) => {
          const result = run(process.execPath, [SEED_CLI], { cwd: PACKAGE_ROOT, env: seedEnv });
          write(`seed-run-${n}.log`, `${result.stdout}\n${result.stderr}`);
          if (result.status !== 0) throw new StepFailure(`seed run ${n} failed`, result.status);
          return JSON.parse(result.stdout.trim().split('\n').at(-1) ?? '{}') as {
            grantsCreated?: number;
          };
        });
        const after = await snapshot();
        const expectedGrants = [...grantsByRole()]
          .flatMap(([role, codes]) => codes.map((code) => `${role}:${code}`))
          .sort();
        const problems: string[] = [];
        if (before.grants.length + before.permissions.length + before.roles.length !== 0) {
          problems.push('reference tables were not empty before seeding');
        }
        if (
          JSON.stringify(after.permissions) !==
          JSON.stringify(PERMISSIONS.map((p) => p.code).sort())
        ) {
          problems.push('permissions differ from PERMISSIONS');
        }
        if (after.roles.length !== 7 || after.roles.some((r) => !r.system)) {
          problems.push('expected exactly the seven system roles');
        }
        if (JSON.stringify(after.grants) !== JSON.stringify(expectedGrants)) {
          problems.push('role grants differ from the §8.3 matrix');
        }
        if (runs[0]?.grantsCreated !== expectedGrants.length || runs[1]?.grantsCreated !== 0) {
          problems.push('seed is not idempotent');
        }
        if (Object.values(after.business ?? {}).some((count) => count !== '0')) {
          problems.push('seed created users, organizations or categories');
        }
        write('seed.json', { runs, before, after, expectedGrants: expectedGrants.length });
        if (problems.length > 0) throw new StepFailure('reference seed checks failed', problems);
        return {
          permissions: after.permissions.length,
          systemRoles: after.roles.length,
          grants: after.grants.length,
          secondRunGrantsCreated: runs[1]?.grantsCreated,
        };
      } finally {
        await client.end();
      }
    });
  } finally {
    // ---- Cleanup: only the container this execution created; prove it is gone ----
    const cleanup: Record<string, unknown> = { containerId: containerId ?? null, name };
    let proven = containerId === undefined;
    if (containerId !== undefined) {
      const stop = dockerRun(['stop', '-t', '10', containerId]);
      cleanup['stop'] = {
        exitCode: stop.status,
        stdout: stop.stdout.trim(),
        stderr: stop.stderr.trim(),
      };
      const polls: { exitCode: number | null; stdout: string; stderr: string }[] = [];
      for (let i = 0; i < POLL_LIMIT; i += 1) {
        const query = dockerRun([
          'ps',
          '-a',
          '--no-trunc',
          '--filter',
          `id=${containerId}`,
          '--format',
          '{{.ID}}',
        ]);
        polls.push({
          exitCode: query.status,
          stdout: query.stdout.trim(),
          stderr: query.stderr.trim(),
        });
        if (cleanupProven(polls)) break;
        sleep(1000);
      }
      proven = cleanupProven(polls);
      cleanup['polls'] = polls;
    }
    cleanup['proven'] = proven;
    cleanup['portFreeAfterCleanup'] = await portIsFree(port);
    write('cleanup.json', cleanup);

    const result: LedgerEntry['result'] = !outcome.failed && proven ? 'PASS' : 'FAIL';
    outcome.result = result;
    const summary = {
      executionId,
      attempt,
      commit,
      tree,
      image: IMAGE,
      container: name,
      port,
      databases,
      steps,
      cleanup: proven ? 'PROVEN' : 'FAILED',
      result,
    };
    write('summary.json', summary);
    const files = readdirSync(evidenceDir).sort();
    write(
      'manifest.sha256',
      files
        .filter((file) => file !== 'manifest.sha256')
        .map(
          (file) =>
            `${createHash('sha256')
              .update(readFileSync(path.join(evidenceDir, file)))
              .digest('hex')}  ${file}`,
        )
        .join('\n') + '\n',
    );
    writeFileSync(
      ledgerPath,
      JSON.stringify(
        [...ledger, { ...entry, result, cleanup: proven ? 'PROVEN' : 'FAILED' }],
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify(
        {
          result,
          cleanup: proven ? 'PROVEN' : 'FAILED',
          evidenceDir,
          steps: steps.map((s) => `${s.name}: ${s.status}`),
        },
        null,
        2,
      ),
    );
  }
  return outcome.result === 'PASS' ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
