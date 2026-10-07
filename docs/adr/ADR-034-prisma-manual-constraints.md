# ADR-034: Prisma manual constraints (Phase 2 Gate 0)

**Status**：**Proposed — not accepted.** The `hybrid-baseline` run [37645666192](https://github.com/zrco001/CEproject/actions/runs/37645666192) **failed G0-4**; the `native-candidate` strategy is prepared but **not yet run**. Results and the decision are filled in only from manually dispatched `gate0-poc.yml` runs and are then reviewed by a person. The full schema remains stopped.

**Related**：

- `docs/ARCHITECTURE.md`（Architecture Approved v0.3）：ADR-24、ADR-34、§6.4、§6.5、§11.2、§14 R-13
- Plan：`docs/reviews/PHASE-2-GATE-0-PLAN.md`
- PoC：`poc/gate-0/`
- Workflow：`.github/workflows/gate0-poc.yml`（manual input `strategy`：`hybrid-baseline` default, `native-candidate` explicit）
- Candidate acceptance：`docs/reviews/GATE-0-NATIVE-CANDIDATE.md`

## Context

The architecture needs PostgreSQL constraints that Prisma's schema language does not express: CHECK constraints, a partial unique index, and composite `(organizationId, xId)` foreign keys. These are added as manual SQL appended to Prisma migrations (§6.5 step 1).

Before writing the full schema, we must confirm that Prisma's migration workflow keeps those constraints, that CI can detect when one goes missing, and whether Prisma can declare the composite relations natively (§6.5 rule 7).

## Approved parameters（this round）

| Item            | Value                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Prisma          | `prisma@7.10.0`、`@prisma/client@7.10.0`（exact versions）                                                |
| PostgreSQL      | `postgres:16.15-alpine`                                                                                   |
| Environment     | Manually dispatched GitHub Actions job; throwaway container with `--rm`, tmpfs data and `127.0.0.1:55432` |
| Tables          | 4：`PocOrg`、`PocVendor`、`PocPayment`、`PocAllocation`                                                   |
| `migrate reset` | Only on the guarded, isolated `gate0_main`                                                                |

## Method

`poc/gate-0/scripts/run-gate0.mjs` runs plan steps S3–S9. It covers TC-01..TC-26 for G0-1..G0-8 and stops at the first failure. Evidence goes to the `gate0-report-<strategy>` artifact.

**Strategies**（`scripts/strategy.mjs`, strict allowlist resolved before any database or scratch operation; empty or unknown values stop the run）：

| Strategy                     | Schema                          | Migrations                    | Composite unique targets / FKs                                      | G0-8                                                     |
| ---------------------------- | ------------------------------- | ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| `hybrid-baseline`（default） | `prisma/schema.prisma`          | `prisma/migrations`           | Manual SQL                                                          | Records whether the separate native variant is supported |
| `native-candidate`           | `variants/native/schema.prisma` | `native-candidate/migrations` | Declared natively in Prisma（unique targets become UNIQUE INDEXes） | Native validate must succeed                             |

Both strategies run the same G0-1..G0-7 steps: the full 8-entry registry (native-candidate allows only the unique targets to be indexes), all 19 violation cases, TC-16 rejection of any DROP or protected-object change, reset rebuild evidence, a fresh deploy, and drift positive and negative controls.

**Run-validity rules**（added after the Codex review of `bf06980`, so the PoC cannot report a false pass）：

1. **Process results：** spawn errors, timeouts, signals and missing exit statuses always fail. Each command accepts only its declared exit codes, e.g. `migrate diff --exit-code` accepts only 0 or 2.
2. **Positive controls：** before an exit 0 from `migrate diff` is trusted as "no drift", the same source must report a difference (exit 2) against an empty schema.
3. **Reset evidence（TC-18）：** a synthetic marker row is written before `migrate reset`. After the reset, the marker must be gone, every `Poc*` table must have a new OID, and every migration must have finished after the pre-reset snapshot.
4. **CHECK definitions：** the registry compares each normalized `pg_get_constraintdef` with the expected condition, not only the name and type. TC-06b and TC-06c cover incomplete void fields.

## Results

### Run 1 — `hybrid-baseline`（measured, **FAILED**）

- Run：[37645666192](https://github.com/zrco001/CEproject/actions/runs/37645666192)（manual dispatch, 2026-10-07）
- Commit：`11338975d2dbb97ee3205b42986c105f281a15a6`
- Prisma 7.10.0；`postgres:16.15-alpine`

| Gate                             | Test cases           | Result   | Evidence                                                                                                                 |
| -------------------------------- | -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| G0-1 CHECK                       | TC-01..TC-06c        | PASS     | S4: 19/19 cases, registry 8/8                                                                                            |
| G0-2 Partial unique              | TC-07..TC-09         | PASS     | S4                                                                                                                       |
| G0-3 Composite FK                | TC-10..TC-15 (a/b/c) | PASS     | S4（TC-14 and TC-15a returned `23503` on PostgreSQL 16.15）                                                              |
| G0-4 `migrate dev`               | TC-16, TC-17         | **FAIL** | TC-16 blocked the `add_note` draft: it tried to `DROP` both composite FKs and both `(organizationId, id)` unique targets |
| G0-5 `migrate reset`             | TC-18                | NOT RUN  | Stopped at S5                                                                                                            |
| G0-6 `migrate deploy`            | TC-19                | NOT RUN  |                                                                                                                          |
| G0-7 Drift                       | TC-20..TC-22         | NOT RUN  |                                                                                                                          |
| G0-8 Composite relation / Hybrid | TC-23..TC-26         | NOT RUN  |                                                                                                                          |

**About the failure：**

- **The DROP statements were not applied.** TC-16 inspected the draft and stopped the run before `migrate deploy`.
- **Reset was not run.**
- **The disposable container and its tmpfs data were removed.**
- **The rejected draft is kept** as the offline regression fixture `poc/gate-0/tests/fixtures/run-37645666192-hybrid-add-note.sql`.
- **The draft did not touch the 3 CHECKs or the partial unique index.** Prisma dropped only objects it models (FKs, unique indexes) but that the Hybrid schema did not declare.

### Candidate — `native-candidate`（**not yet run**）

| Gate       | Test cases   | Result                                                    |
| ---------- | ------------ | --------------------------------------------------------- |
| G0-1..G0-8 | TC-01..TC-26 | PENDING（requires a separately approved manual dispatch） |

**Offline preparation（not Gate evidence）：**

- `prisma validate` passed, and the init migration was generated with `migrate diff --from-empty`. Both ran offline; no database was involved.
- The init migration is the generated SQL plus the 3 CHECKs and the partial unique index, appended byte-identically to the baseline.
- An in-memory PGlite pre-check passed: registry 8/8 with native UNIQUE INDEX targets, 5 RESTRICT FKs, and 19/19 cases.
- A schema-to-schema diff for `note` produced only `ADD COLUMN "note"`. The real G0-4 test needs the shadow database and only the run can show it.

## Findings before the run（not Gate evidence）

These come from offline Prisma commands and an in-memory PGlite (PostgreSQL in WebAssembly) pre-check of the committed SQL. They guided the PoC code but do **not** replace the Gate 0 run.

1. **The CLI can fail silently.**
   - **What happened:** Prisma 7's schema engine needs a datasource even for offline `migrate diff --from-empty`. Without one, the engine errored but the CLI printed nothing and **exited 0**.
   - **Mitigation:** the PoC config always supplies a guarded datasource, and the runner treats empty output as a failure.
   - **For the final strategy:** CI must not trust the exit code alone.
2. **The referenced-side error code differs between engines.**
   - **What happened:** in the PGlite pre-check (PostgreSQL 17 in WebAssembly), `ON DELETE / ON UPDATE RESTRICT` raised `23001` (restrict_violation). In run 37645666192 on PostgreSQL 16.15, TC-14 and TC-15a returned `23503`. The plan originally expected only `23503`.
   - **Resolution:** the cases now accept either code and record which one occurred. TC-25 separately checks that the action is RESTRICT or NO ACTION.
3. **Prisma accepts the native composite relations offline.**
   - **What happened:** Prisma 7.10.0 validated both native composite relations, including the optional one where `organizationId` is required and `vendorId` is nullable. It emitted `ON DELETE RESTRICT ON UPDATE RESTRICT` for them.
   - **One difference:** Prisma created the composite unique targets as unique _indexes_, not unique constraints.
   - **Still to confirm:** the run must confirm this against a real database (TC-23..TC-25).
4. **Prisma has an AI-agent checkpoint on `migrate reset`.**
   - **What happened:** since 7.9.0, `migrate reset` is blocked when Prisma detects an AI-agent environment, until the user consents.
   - **How the PoC handles it:** the PoC does not fake consent or hide detection variables. Human consent is the typed workflow confirmation.
   - **If it blocks in CI:** TC-18 fails and the run stops.

## Decision

**PENDING.** The `hybrid-baseline` result alone is not a decision. The decision is written only after the `native-candidate` run (or a human decision not to run it), covering:

- **Relation style:** native composite relations or Hybrid (§6.5 rule 7). Hybrid failed G0-4 in run 37645666192.
- **Migration strategy:** manual SQL appended to Prisma migrations (§6.5 steps 1–6) or the §6.5 step 7 alternative.
- **CI drift detection:** Prisma `migrate diff`, the constraints registry query, or both.
- **Exit-code handling:** how CI handles Prisma's silent-failure behaviour.

### Fallback if `native-candidate` is not viable（proposal only, not adopted）

If the native-candidate run fails G0-1..G0-8, or a human decides not to pursue it, the existing §6.5 step 7 alternative applies:

- Prisma only describes the schema and generates the client.
- Migrations are managed SQL-first by a migration tool such as dbmate or Atlas. The constraints registry query stays as the CI drift check.

This would be proposed for human architecture review. It is **not** adopted automatically, and the pinned Prisma version and the official strategy do not change as part of this PoC. Phase 2 does not create the full schema until a strategy is reviewed and accepted.
