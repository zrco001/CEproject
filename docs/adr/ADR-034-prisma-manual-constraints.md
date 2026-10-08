# ADR-034: Prisma manual constraints (Phase 2 Gate 0)

**Status**：**Accepted**（2026-10-08，repository owner 的明確條件式授權；紀錄見 [PR #14 comment 6054603421](https://github.com/zrco001/CEproject/pull/14#issuecomment-6054603421)）。Native-candidate run [37741573406](https://github.com/zrco001/CEproject/actions/runs/37741573406) 全部 job / step（含 teardown）成功、G0-1..G0-8 通過，證據經 Codex 離線核對。失敗的 runs 37645666192、37730226660、37737556914 依其真實結論保留於下方。

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

Both strategies run the same G0-1..G0-7 steps: the full 8-entry registry (native-candidate allows only the unique targets to be indexes), all 19 violation cases, TC-16 rejection of any DROP or protected-object change, reset rebuild evidence, a fresh deploy, and drift positive and negative controls. G0-7 also rejects a TC-20 / TC-21 drift script that contains any `DROP` or touches a protected object, an empty script reported with exit 2, and SQL statements reported with exit 0; non-destructive drift is recorded only.

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

### Run 2 — `native-candidate` readiness failure（PoC NOT RUN）

- Run：[37730226660](https://github.com/zrco001/CEproject/actions/runs/37730226660), commit `66bcae9d02a4ecddad406d9537fc1d342669e14f`.
- The final Unix-socket readiness probe returned exit 2 before `Run Gate 0 PoC`; G0-1..G0-8 were not executed and no report artifact was produced. Cleanup succeeded. This is not a failed migration result.
- PR #13 changed only the two readiness probes to permanent TCP `127.0.0.1:5432`, with offline regression tests. No run was automatically retried.

### Run 3 — `native-candidate` DB evidence PASS, workflow FAILURE

- Run：[37737556914](https://github.com/zrco001/CEproject/actions/runs/37737556914), manual dispatch after separate human approval, commit `39d18d53a0ba0f91c46c6356bd57e2438e7114bf`.
- Actual Prisma / Client 7.10.0; PostgreSQL 16.15 on x86_64 Alpine; image digest `sha256:721873c34ceb9f8d8fc265984940dc982404c105f19ad51be9fdc5970a6080ea`.
- [Artifact 11532282922](https://github.com/zrco001/CEproject/actions/runs/37737556914/artifacts/11532282922): `gate0-report.json`, `gate0-report.md`, and migration SQL; artifact zip SHA256 `c0d519739d7b7e5f9a93c10007cbb5e257d7b3fc5e9add1a30056c728fba66c6`.

| Gate       | Measured result               | Evidence                                                                                                                                             |
| ---------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0-1..G0-3 | PASS                          | S4 / S6 / S7 each registry 8/8 and 19/19 cases; 57 case executions, all 5 FK actions RESTRICT / RESTRICT                                             |
| G0-4       | PASS                          | TC-16 draft only `ALTER TABLE "PocPayment" ADD COLUMN "note" TEXT`; no DROP or protected-object change; TC-17 registry 8/8 after apply               |
| G0-5       | PASS                          | Marker 1→0; all four table OIDs changed; both migrations finished after the pre-reset snapshot; registry and cases passed after reset                |
| G0-6       | PASS                          | Fresh database deploy, registry and cases passed                                                                                                     |
| G0-7       | PASS                          | Both empty-schema positive controls exit 2; TC-20 / TC-21 no drift, exit 0, empty scripts; registry detected the deliberately missing CHECK in TC-22 |
| G0-8       | PASS                          | Native required / optional composite relations validate, SQL and DB FK actions are RESTRICT / RESTRICT, client generation succeeds                   |
| Cleanup    | **FAIL / absence unverified** | `docker stop` returned the container name; the immediate `docker ps -a` still listed it; cleanup exit 1                                              |

The generated add-note migration matches the report SQL, and the downloaded native init SQL is byte-identical to the reviewed committed init. Codex rechecked the saved evidence and pure guard/reset decisions offline; it did not execute another database run.

**Drift finding:** after TC-22 dropped `poc_payment_fee_bearer_amounts_check`, Prisma diff still exited 0 with "No difference detected". The registry correctly reported that exact missing CHECK. Prisma diff alone is insufficient for CHECK drift; the registry must remain a required check in any proposed strategy.

**Cleanup limitation:** the report was written and uploaded before teardown, so its PASSED outcome covers only the PoC. At 2026-10-08 14:26:23 Asia/Taipei, `docker stop` returned and the next query about 15ms later still found the name. Delayed `--rm` removal is a plausible explanation, but no later inspect / daemon logs prove when removal completed. Do not claim the container or tmpfs was verified gone in this run, or relabel the workflow success.

This PR polls for the same container name to disappear after stop: at most 30 one-second sleeps and 31 queries, failing on any Docker query error or a name still present after the final query. Command execution adds to the elapsed time; a hung Docker command is bounded by the existing 20-minute job timeout, not a separate per-command timeout. It does not prune, force-remove, change any DB guard, or start a new DB run. Real cleanup success with the new code was **not yet measured** at the time; run 4 later measured it as successful.

**Offline preparation（not Gate evidence）：**

- `prisma validate` passed, and the init migration was generated with `migrate diff --from-empty`. Both ran offline; no database was involved.
- The init migration is the generated SQL plus the 3 CHECKs and the partial unique index, appended byte-identically to the baseline.
- Author-reported in-memory PGlite pre-check: in local scratch, PGlite 0.5.8 (embedded PostgreSQL version not recorded) executed the candidate DDL and SQL with registry 8/8 (native UNIQUE INDEX targets), 5 RESTRICT FKs and 19/19 cases. No artifact was saved and it is **not Gate evidence**. No external PostgreSQL or Docker connection, no `gate0-poc.yml` dispatch, no reset and no formal migration.
- A schema-to-schema diff for `note` produced only `ADD COLUMN "note"`. The real shadow-database G0-4 result is now recorded above; the earlier offline diff remains historical preparation evidence.

### Run 4 — `native-candidate` PASS（**accepted evidence**）

- Run：[37741573406](https://github.com/zrco001/CEproject/actions/runs/37741573406)，exactly one manual dispatch on fixed main `4bcccdcbf9dfd7c99c05573947c99b7827b96266`, workflow blob `11fb4eb211c71ffdf313aa980acbcd604000678c`; no automatic retry.
- [Artifact 11533697940](https://github.com/zrco001/CEproject/actions/runs/37741573406/artifacts/11533697940), zip digest `sha256:e7bcd9ee98324d059a818839c8cd81d8e4b7462ae6706ea2b28521d2457cbbe0`, checked offline against the reviewed committed SQL and the pure guard / reset decisions.

| Gate       | Result | Evidence                                                                                                                                             |
| ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0-1..G0-3 | PASS   | Three registry snapshots each 8/8; three batches each 19/19 violation cases (57 executions); all five FK actions RESTRICT / RESTRICT                 |
| G0-4       | PASS   | Init SQL byte-identical to the committed native init（SHA256 `63ad84c0…bf45d`）; add-note SQL only adds `PocPayment.note`（SHA256 `788fbbf8…eabe4`） |
| G0-5       | PASS   | Reset removed the marker, changed all four table OIDs and rebuilt both migrations after the pre-reset snapshot                                       |
| G0-6       | PASS   | Fresh deploy, registry and cases passed                                                                                                              |
| G0-7       | PASS   | Both positive controls exit 2; TC-20 / TC-21 script and exit evidence consistent; TC-22 missing CHECK detected by the registry, Prisma diff exit 0   |
| G0-8       | PASS   | Native required / optional relations validate; client generation succeeds                                                                            |
| Cleanup    | PASS   | Teardown step and log: `Disposable container and its tmpfs data are gone.`                                                                           |

The successful evidence belongs to this run only; it does not relabel runs 1–3.

## Findings before the run（not Gate evidence）

These come from offline Prisma commands and an author-reported, in-memory PGlite 0.5.8 pre-check (embedded PostgreSQL version not recorded; no saved artifact) of the committed SQL. They guided the PoC code but do **not** replace the Gate 0 run.

1. **The CLI can fail silently.**
   - **What happened:** Prisma 7's schema engine needs a datasource even for offline `migrate diff --from-empty`. Without one, the engine errored but the CLI printed nothing and **exited 0**.
   - **Mitigation:** the PoC config always supplies a guarded datasource, and the runner treats empty output as a failure.
   - **For the final strategy:** CI must not trust the exit code alone.
2. **The referenced-side error code differs between engines.**
   - **What happened:** in the author-reported PGlite 0.5.8 pre-check (embedded PostgreSQL version not recorded), `ON DELETE / ON UPDATE RESTRICT` raised `23001` (restrict_violation). In run 37645666192 on PostgreSQL 16.15, TC-14 and TC-15a returned `23503`. The plan originally expected only `23503`.
   - **Resolution:** the cases now accept either code and record which one occurred. TC-25 separately checks that the action is RESTRICT or NO ACTION.
3. **Prisma accepts the native composite relations offline.**
   - **What happened:** Prisma 7.10.0 validated both native composite relations, including the optional one where `organizationId` is required and `vendorId` is nullable. It emitted `ON DELETE RESTRICT ON UPDATE RESTRICT` for them.
   - **One difference:** Prisma created the composite unique targets as unique _indexes_, not unique constraints.
   - **Measured later:** run 37737556914 confirmed this against PostgreSQL 16.15 (TC-23..TC-25); the earlier offline result alone was not Gate evidence.
4. **Prisma has an AI-agent checkpoint on `migrate reset`.**
   - **What happened:** since 7.9.0, `migrate reset` is blocked when Prisma detects an AI-agent environment, until the user consents.
   - **How the PoC handles it:** the PoC does not fake consent or hide detection variables. Human consent is the typed workflow confirmation.
   - **If it blocks in CI:** TC-18 fails and the run stops.

## Decision

**Accepted.** Within the architecture's existing §6.5 options (the core architecture is not changed):

- **Relation style:** native Prisma composite relations, including optional ones (MATCH SIMPLE), with explicit `onDelete: Restrict, onUpdate: Restrict`. The `(organizationId, id)` targets are declared with `@@unique` (Prisma creates unique indexes). Hybrid failed G0-4 in run 1.
- **Migration strategy:** Prisma-generated migration SQL, with CHECK constraints and partial unique indexes appended to the same `migration.sql` (§6.5 step 1). A new migration draft that contains any `DROP` or references a protected object is not applied; it stops for human review.
- **CI drift detection:** the constraint registry check is **mandatory** for presence and definitions, because Prisma diff did not detect the missing CHECK in TC-22. Prisma diff is kept with positive controls and script / exit-code consistency checks.
- **Exit-code handling:** keep spawn / timeout / signal rejection, declared exit codes, non-empty SQL evidence when a difference is claimed, and reset rebuild evidence.
- **Versions:** Prisma / `@prisma/client` 7.10.0 pinned.

**Applied in Phase 2:** `packages/db` (schema, init migration, `prisma/constraints.registry.ts`, `prisma/constraints.md`, offline tests). The formal migration and seed are written but **not applied** to any database; the real-database integration run needs a separately authorized environment.

### Fallback（not adopted; kept for history）

If the native-candidate run fails G0-1..G0-8, or a human decides not to pursue it, the existing §6.5 step 7 alternative applies:

- Prisma only describes the schema and generates the client.
- Migrations are managed SQL-first by a migration tool such as dbmate or Atlas. The constraints registry query stays as the CI drift check.

This would be proposed for human architecture review. It is **not** adopted automatically, and the pinned Prisma version and the official strategy do not change as part of this PoC. Phase 2 does not create the full schema until a strategy is reviewed and accepted.
