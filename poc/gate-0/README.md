# Phase 2 Gate 0 PoC — Prisma manual constraints (disposable DB)

**This is not the production schema.** It is the disposable proof of concept that ADR-34 /
`docs/ARCHITECTURE.md` §11.2 require before any full Prisma schema is written. Results go into
`docs/adr/ADR-034-prisma-manual-constraints.md`.

Plan: `docs/reviews/PHASE-2-GATE-0-PLAN.md`

## What runs where

- The PoC runs **only** in the manually dispatched GitHub Actions workflow
  `.github/workflows/gate0-poc.yml`. The person dispatching it must type
  `RUN GATE0 ON DISPOSABLE DB ONLY`.
- The workflow starts `postgres:16.15-alpine` as `ceproject-gate0-pg` with `--rm`, data on
  tmpfs and the port published only on `127.0.0.1:55432`. It creates `gate0_main`,
  `gate0_shadow`, `gate0_fresh` and `gate0_native`, and stops the container at the end.
- It is isolated from the pnpm workspace: it has its own `package.json` and
  `package-lock.json` with exact versions (`prisma@7.10.0`, `@prisma/client@7.10.0`, `pg@8.23.1`),
  and is not part of Turborepo or the root lockfile.

## Strategies (`scripts/strategy.mjs`)

The workflow's `strategy` input selects one of two allowlisted strategies. The runner resolves
`GATE0_STRATEGY` before any database or scratch operation. An unset variable means
`hybrid-baseline`; an empty or unknown value stops the run.

| Strategy                    | Status                                                                                                                                                                                          | Schema / migrations                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `hybrid-baseline` (default) | Run [37645666192](https://github.com/zrco001/CEproject/actions/runs/37645666192) **failed G0-4** (TC-16 blocked a draft that dropped the composite FKs and unique targets). G0-5..G0-8 not run. | `prisma/schema.prisma`, `prisma/migrations`                    |
| `native-candidate`          | **Not yet run.**                                                                                                                                                                                | `variants/native/schema.prisma`, `native-candidate/migrations` |

Both strategies use the same steps, guards, the full 8-entry registry and all 19 violation
cases. Details and acceptance criteria: `docs/reviews/GATE-0-NATIVE-CANDIDATE.md`.

## Guards (`scripts/guard.mjs`)

Before every database step the runner checks all of the following and aborts otherwise:

1. It is running in GitHub Actions, and the dispatch confirmation was given.
2. Every URL uses host `127.0.0.1` or `localhost`, port `55432`, and a database named `gate0_*`.
3. The container `ceproject-gate0-pg` is running with `--rm`, has its data directory on tmpfs,
   has no volume or bind mounts, and publishes only `127.0.0.1:55432`.
4. The connected database is a `gate0_*` database containing nothing but `Poc*` tables and
   `_prisma_migrations`.

`prisma.config.ts` also applies check 2, so a Prisma command run in this folder with any other
database URL fails before connecting. Without `DATABASE_URL`, the config uses an offline
placeholder (`gate0_offline`) because Prisma 7's schema engine requires a datasource even for
offline commands.

`migrate reset` (G0-5) runs only against `gate0_main` after all guards pass and the current
database name is re-checked. The runner does not set or fake Prisma's AI-agent consent variable
and passes the environment through unchanged.

## Contents

| Path                                                            | Purpose                                                                                                                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prisma/schema.prisma`                                          | "Hybrid" schema: single-column Prisma relations (all `onDelete`/`onUpdate: Restrict`)                                                                              |
| `prisma/migrations/20261007000000_init/migration.sql`           | Prisma-generated SQL, followed by the 8 manual constraints from the plan §4                                                                                        |
| `variants/native/schema.prisma`                                 | G0-8 variant with native composite relations (TC-23 required, TC-24 optional); also the `native-candidate` schema                                                  |
| `native-candidate/migrations/20261008000000_init/migration.sql` | `native-candidate` init: offline Prisma SQL plus the 3 CHECKs and partial unique index (byte-identical to the baseline)                                            |
| `scripts/strategy.mjs`                                          | Strategy allowlist and the G0-4 `note` column edit                                                                                                                 |
| `scripts/migration-guard.mjs`                                   | TC-16 inspection of the `add_note` draft                                                                                                                           |
| `tests/fixtures/run-37645666192-hybrid-add-note.sql`            | The real rejected `add_note` draft from the failed hybrid run (never applied)                                                                                      |
| `scripts/guard.mjs`                                             | Disposable-database guard                                                                                                                                          |
| `scripts/registry.mjs`                                          | Manual-constraint registry, catalog comparison, FK action audit (TC-25)                                                                                            |
| `scripts/cases.mjs`                                             | TC-01..TC-15 SQL cases (transaction + savepoints, always rolled back)                                                                                              |
| `scripts/run-gate0.mjs`                                         | Orchestrator for S3–S9; stops at the first failure; writes `out/gate0-report.{md,json}`                                                                            |
| `tests/*.test.mjs`                                              | Offline tests (`npm test`): guard, strategy, TC-16 fixture, migration/schema/registry/case consistency. Also run by the regular CI `verify` job without a database |

## Local commands (no database)

```bash
npm ci
npm test          # offline tests only
npx prisma validate
```

`npm run gate0` refuses to run outside the confirmed GitHub Actions job.
