# 建築工程記帳與專案成本管理系統

Modular Monolith monorepo. Architecture: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (Approved v0.3).

## Workspace

| Path              | Package             | Purpose                                                                |
| ----------------- | ------------------- | ---------------------------------------------------------------------- |
| `apps/web`        | `@ceproject/web`    | Next.js (App Router) mobile-first RWD UI                               |
| `apps/api`        | `@ceproject/api`    | NestJS REST API (`/api/v1`)                                            |
| `packages/shared` | `@ceproject/shared` | Money, business dates, enums, state machines, metric status whitelists |
| `packages/config` | `@ceproject/config` | Shared tsconfig and ESLint presets (architecture rules)                |

## Requirements

- Node.js ≥ 22.12 (24 recommended, see `.nvmrc`)
- pnpm 10 (`corepack enable` or `npm i -g pnpm@10`)
- Docker (for PostgreSQL / MinIO / Mailpit)

## Getting started

```bash
pnpm install
cp .env.example .env            # then replace every <placeholder>
docker compose up -d          # PostgreSQL 16, MinIO (+ bucket), Mailpit
pnpm dev                      # web http://localhost:3000, api http://localhost:4000/api/v1/health
```

Services: MinIO console http://localhost:9001, Mailpit http://localhost:8025.

## Quality gate

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# or everything at once:
pnpm check
```

## Containers

```bash
docker compose --profile app up -d --build   # api + web images alongside the dev services
```
