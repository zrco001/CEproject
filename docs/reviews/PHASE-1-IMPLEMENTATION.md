# Phase 1 Implementation Review Package

## Summary

Phase 1 sets up the project foundation defined in _Architecture Approved v0.3_ §11 and §11.1:
the monorepo, the toolchain, a NestJS API skeleton, a mobile-first Next.js shell, the
framework-free domain primitives in `packages/shared`, Docker services and CI.

No business features were implemented. There is no Prisma schema, no database model, no auth,
and no Project / Expense / Payment / Billing CRUD.

This package also covers the fixes from the first Phase 1 review (result: CONDITIONAL PASS):

- `CLAUDE.md` working rules
- `Rate` limited to `NUMERIC(7,4)`
- Docker runtime smoke test in CI
- GitHub Actions upgraded to Node 24 versions

## Commit

| Purpose                                           | Commit                                                                                  |
| ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Baseline (Phase 1 initial implementation, `main`) | `fb07031f70f5788d9f6a171aa97553336522fe32`                                              |
| Review fix                                        | `40e73be9b4a8535476bb816af2eec8c58793454d` — `fix: address phase 1 architecture review` |
| This report                                       | Docs-only commit on top of the review fix, on the same branch                           |

- Branch: `claude/phase-1-review-fixes` (not merged into `main`)
- CI run for the review fix commit: https://github.com/zrco001/CEproject/actions/runs/37519413233 (success)

## Architecture

The implementation follows `docs/ARCHITECTURE.md`, **Architecture Approved v0.3**. No
architecture decision was changed.

## Implemented

| Item                | Implementation                                                                                                                                                                                                                                           |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo            | `apps/web`, `apps/api`, `packages/shared`, `packages/config`                                                                                                                                                                                             |
| pnpm workspace      | pnpm 10, `pnpm-workspace.yaml`, `onlyBuiltDependencies` allow-list                                                                                                                                                                                       |
| Turborepo           | `build` / `typecheck` / `lint` / `test` / `dev` tasks; `^build` dependency ordering                                                                                                                                                                      |
| TypeScript strict   | Shared `base.json`: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. TypeScript is pinned to 6.0 because typescript-eslint requires `<6.1`                                                                      |
| ESLint / boundaries | `strictTypeChecked`, no `any`, `$queryRawUnsafe` banned, `$queryRaw` only in `reporting/infrastructure`, cross-module imports only through a public entry, `common` must not depend on modules. Covered by fixture regression tests in `packages/config` |
| Next.js Shell       | Next.js 16 App Router, Tailwind 4, shadcn-style `Button` / `Sheet`, standalone output, `/api/*` rewrite to the API                                                                                                                                       |
| NestJS Skeleton     | NestJS 12 (ESM), `EnvModule` (Zod-validated env), global exception filter, `ZodValidationPipe` (strict, never echoes input values), helmet, exact-origin CORS                                                                                            |
| RWD AppShell        | Below 768px: bottom navigation. 768–1023px: icon rail. 1024px and up: full sidebar. Safe-area padding, no horizontal scroll                                                                                                                              |
| BottomNav           | 首頁 / 工程 / 新增 / 帳務 / 我的, with a 56px centre CTA and `aria-current` on the active tab                                                                                                                                                            |
| Sidebar             | Groups follow 規格 §五, with the v0.2 names (收入認列, 支出審核)                                                                                                                                                                                         |
| QuickAddSheet       | Radix Dialog: bottom sheet on mobile, centred dialog on desktop. Uses the v0.2 labels (新增收款, 其他收入 / 收入認列)                                                                                                                                    |
| Money               | `Money` built on decimal.js. Constructing from `number` is impossible and `valueOf` throws. `NUMERIC(18,2)` string format, TWD tax split, zh-TW formatting                                                                                               |
| Rate                | `Rate.of` accepts only values that fit `NUMERIC(7,4)`: non-negative, at most 3 integer and 4 fraction digits. Domain limits such as rate ≤ 1 are not enforced here (review fix #3)                                                                       |
| BusinessDate        | `YYYY-MM-DD` dates, "today" and month ranges in the organization's timezone (default `Asia/Taipei`), conversion to UTC instants, DST-safe                                                                                                                |
| Enums               | All enums from §6.1, as const objects plus types                                                                                                                                                                                                         |
| State Machines      | The 10 machines from §7, as pure data, validated when defined. Allowed and illegal transitions are tested                                                                                                                                                |
| Metric Status       | Every metric from §3.4 has a status whitelist. A mapped type forces every enum value to be classified, and no metric uses enum-order comparisons                                                                                                         |
| Error Handling      | Consistent `{ error: { code, message, details?, requestId } }` responses. 5xx responses never expose internal details                                                                                                                                    |
| Logging             | pino through nestjs-pino. Cookies, authorization, CSRF tokens, passwords, tokens and bank account numbers are redacted, and request bodies are not logged                                                                                                |
| Request ID          | `x-request-id` is generated, or echoed if the client sends a safe value, and included in error responses                                                                                                                                                 |
| Docker              | `docker-compose.yml` (PostgreSQL 16, MinIO, minio-init, Mailpit, plus api/web under the `app` profile) and multi-stage Dockerfiles for api and web                                                                                                       |
| CI                  | GitHub Actions. `verify` job: format, lint, typecheck, test, build. `docker` job: compose validation, image build, runtime smoke test, teardown                                                                                                          |
| Repository rules    | `CLAUDE.md` (review fix #1); the Turborepo-managed `AGENTS.md` is kept                                                                                                                                                                                   |

## Tests

Run locally on Windows 11 with Node 24.19.0 and pnpm 10.34.6 at the review fix commit, and
repeated in CI on `ubuntu-latest`:

| Command             | Local                                                   | CI   |
| ------------------- | ------------------------------------------------------- | ---- |
| `pnpm format:check` | PASS                                                    | PASS |
| `pnpm lint`         | PASS (4/4 tasks)                                        | PASS |
| `pnpm typecheck`    | PASS (4/4 tasks)                                        | PASS |
| `pnpm test`         | PASS — 190 tests (shared 148, api 20, web 15, config 7) | PASS |
| `pnpm build`        | PASS (3/3 tasks; web prerenders 31 routes)              | PASS |

## Docker

Results from the CI `docker` job: https://github.com/zrco001/CEproject/actions/runs/37519413233 (job ID 112460977367).

| Check                                                                  | Result                                 |
| ---------------------------------------------------------------------- | -------------------------------------- |
| Compose validation (`docker compose --profile app config`)             | PASS                                   |
| API image build (`apps/api/Dockerfile`)                                | PASS                                   |
| Web image build (`apps/web/Dockerfile`)                                | PASS                                   |
| PostgreSQL started and healthy                                         | PASS                                   |
| MinIO started and healthy (`/minio/health/live`)                       | PASS                                   |
| MinIO init completed (bucket created, exit 0)                          | PASS                                   |
| Mailpit started (UI returns HTTP 200)                                  | PASS                                   |
| API container started and healthy                                      | PASS                                   |
| Web container started                                                  | PASS                                   |
| `GET /api/v1/health` on the API returns HTTP 200                       | PASS                                   |
| `GET /` on the web returns HTTP 200                                    | PASS                                   |
| `GET /api/v1/health` through the web's `/api` rewrite returns HTTP 200 | PASS                                   |
| Teardown (`docker compose down -v`)                                    | PASS (runs even if earlier steps fail) |

CI uses placeholder credentials only (`ci-placeholder-*`).

The runtime fix this required: the official `minio/minio` and `minio/mc` images can no longer be
pulled (Docker Hub returns "not found" and quay.io requires authentication). They were replaced
with Chainguard's open-source MinIO builds (`chainguard/minio`, `chainguard/minio-client`). The
storage architecture is unchanged: dev still uses a MinIO server behind the S3 API.

## Known Issues

1. **MinIO image tags are not pinned.** Chainguard's public images only provide the rolling
   `latest` / `latest-dev` tags, so a future upstream change could alter dev behaviour.
2. **The dev MinIO container runs as root (`user: '0:0'`).** The image's default uid 65532
   cannot write to a root-owned named volume. This applies to the development compose file
   only.
3. **The web container has no Docker `HEALTHCHECK`.** Its availability is verified by the smoke
   test's HTTP checks instead.
4. **The web `/api` rewrite target is fixed at build time.** It comes from the
   `API_INTERNAL_URL` build argument, so a different API host needs a rebuild.
5. **RWD is verified only with jsdom component tests and HTML responses.** There are no
   browser-based visual or end-to-end tests (e.g. Playwright) yet.
6. **`GET /api/v1/health` is liveness only.** A database readiness check depends on Phase 2.
7. **The API watch mode (`pnpm dev` via Nest CLI) has not been exercised.** Build, start and
   container runtime have been verified.
8. **Docker is not installed on the local development machine.** Docker is validated only in CI.
9. **API tests contain fake credential-like strings** (e.g. `hunter2`) that check log redaction and
   error masking. They are not real secrets, but a secret scanner may flag them.
10. **GitHub runner notice:** `ubuntu-latest` moves to Ubuntu 26 from 2026-10-19. This is an
    informational notice only. The earlier Node.js 20 deprecation warning is resolved by
    upgrading to `actions/checkout@v7`, `actions/setup-node@v7`, `pnpm/action-setup@v6` and
    `docker/setup-buildx-action@v4`, all stable releases on the Node 24 runtime.

## Architecture Questions

None.

## Next Phase Readiness

READY FOR REVIEW
