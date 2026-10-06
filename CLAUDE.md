# CLAUDE.md — Working Rules for Claude Code

This repository is built in reviewed phases. These rules apply to every Claude Code session.
`AGENTS.md` (Turborepo-managed guidance) stays in place and also applies; do not delete or edit
its managed block.

## Roles

- **Claude Code = Implementation Engineer.** Implement what the approved architecture and the
  current phase instructions specify. Do not make architecture decisions.
- **`docs/ARCHITECTURE.md` = Architecture Source of Truth** (currently _Architecture Approved v0.3_).
- An external Architecture / Code Reviewer approves each phase. Only the reviewer can approve.

## Architecture changes and conflicts

- Do **not** change core architecture decisions (ADRs, data model, financial rules, API domain
  concepts, state machines, metric definitions) on your own initiative.
- If the architecture and the implementation conflict, or the architecture is ambiguous or
  infeasible:
  1. Create or append to `docs/ARCHITECTURE_ISSUES.md` (context, conflict, options, impact).
  2. **Stop** and wait for Architecture Review. Do not work around the conflict silently.

## Phase workflow

- Work only on the current phase. **Never start the next phase on your own.**
- Before a phase is reported complete, all of these must pass:
  ```bash
  pnpm format:check
  pnpm lint
  pnpm typecheck
  pnpm test
  pnpm build
  ```
- A finished phase may only be marked **READY FOR REVIEW**. Never mark anything **APPROVED**.
- Write the phase report under `docs/reviews/` (e.g. `PHASE-1-IMPLEMENTATION.md`).
- After the phase is complete: **STOP** and wait for review.
- Work on a dedicated branch; do not merge into `main` unless explicitly instructed.

## Non-negotiable engineering rules

- **Posted financial records are immutable.** Never update their financial content or hard-delete
  them; use the defined state transitions (`VOID`, `CANCELLED`, allocation void) with an audit log.
- **No business logic in React components.** Components render and collect input; logic lives in
  `packages/shared` (pure domain) or the API.
- **No domain business logic in NestJS controllers.** Controllers only parse input, call a use case
  and map the response.
- **No JavaScript floating point for money.** Use `Money` / `Rate` from `@ceproject/shared`
  (decimal.js). Money is `NUMERIC(18,2)`, rates are `NUMERIC(7,4)`, and amounts travel as strings.
- **No arbitrary raw SQL.** `$queryRawUnsafe` / `$executeRawUnsafe` are forbidden everywhere;
  `$queryRaw` is allowed only in `apps/api/src/modules/reporting/infrastructure/**` through the
  tenant-guarded `ReportingRepository` (ADR-19).
- **Never bypass tenant isolation.** Every query is scoped by `organizationId` (and project scope
  where applicable); cross-organization references must be rejected (ADR-06, ADR-24).
- **Never commit `.env`, credentials or secrets.** Only `.env.example` with placeholders is
  committed. CI uses throwaway placeholder values only.

## Repository map

| Path                   | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `apps/web`             | Next.js mobile-first UI                                         |
| `apps/api`             | NestJS modular monolith (`/api/v1`)                             |
| `packages/shared`      | Money, dates, enums, state machines, metric status whitelists   |
| `packages/config`      | Shared tsconfig and ESLint presets (architecture rules + tests) |
| `docs/ARCHITECTURE.md` | Architecture source of truth                                    |
| `docs/reviews/`        | Phase implementation reports                                    |
