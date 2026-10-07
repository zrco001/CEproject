# ADR-034: Prisma manual constraints (Phase 2 Gate 0)

**Status**：**Proposed — awaiting the Gate 0 run.** Not accepted. The results and decision sections are filled in from the manually dispatched `gate0-poc.yml` run and then reviewed by a person.

**Related**：

- `docs/ARCHITECTURE.md`（Architecture Approved v0.3）：ADR-24、ADR-34、§6.4、§6.5、§11.2、§14 R-13
- Plan：`docs/reviews/PHASE-2-GATE-0-PLAN.md`
- PoC：`poc/gate-0/`
- Workflow：`.github/workflows/gate0-poc.yml`

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

`poc/gate-0/scripts/run-gate0.mjs` runs plan steps S3–S9. It covers TC-01..TC-26 for G0-1..G0-8 and stops at the first failure. Evidence goes to the `gate0-report` artifact.

## Results

**Not executed yet.** Each row is filled in from the run report.

| Gate                             | Test cases           | Result  | Evidence |
| -------------------------------- | -------------------- | ------- | -------- |
| G0-1 CHECK                       | TC-01..TC-06         | PENDING |          |
| G0-2 Partial unique              | TC-07..TC-09         | PENDING |          |
| G0-3 Composite FK                | TC-10..TC-15 (a/b/c) | PENDING |          |
| G0-4 `migrate dev`               | TC-16, TC-17         | PENDING |          |
| G0-5 `migrate reset`             | TC-18                | PENDING |          |
| G0-6 `migrate deploy`            | TC-19                | PENDING |          |
| G0-7 Drift                       | TC-20..TC-22         | PENDING |          |
| G0-8 Composite relation / Hybrid | TC-23..TC-26         | PENDING |          |

- Run URL：PENDING
- Commit：PENDING

## Findings before the run（not Gate evidence）

These come from offline Prisma commands and an in-memory PGlite (PostgreSQL in WebAssembly) pre-check of the committed SQL. They guided the PoC code but do **not** replace the Gate 0 run.

1. **The CLI can fail silently.**
   - **What happened:** Prisma 7's schema engine needs a datasource even for offline `migrate diff --from-empty`. Without one, the engine errored but the CLI printed nothing and **exited 0**.
   - **Mitigation:** the PoC config always supplies a guarded datasource, and the runner treats empty output as a failure.
   - **For the final strategy:** CI must not trust the exit code alone.
2. **RESTRICT raises `23001`, not `23503`.**
   - **What happened:** blocking a delete or update on the referenced side under `ON DELETE / ON UPDATE RESTRICT` raises `23001` (restrict_violation). `NO ACTION` would raise `23503`. The plan originally expected `23503` for TC-14 and TC-15(a).
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

**PENDING.** To be written after the run, covering:

- **Relation style:** native composite relations or Hybrid (§6.5 rule 7).
- **Migration strategy:** manual SQL appended to Prisma migrations (§6.5 steps 1–6) or the §6.5 step 7 alternative (SQL-first migrations).
- **CI drift detection:** Prisma `migrate diff`, the constraints registry query, or both.
- **Exit-code handling:** how CI handles Prisma's silent-failure behaviour.

If any gate fails, this ADR becomes a proposal for an alternative migration strategy. Phase 2 does not create the full schema until that alternative is reviewed and accepted.
