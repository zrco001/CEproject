# Phase 2 實作報告：正式資料結構（packages/db）

**日期**：2026-10-08
**狀態**：程式與離線驗證已完成，等待 Codex 集中審查與 owner 對完成版本的審查。**未對任何資料庫執行 migration、seed 或整合測試。**

**依據**：

- `docs/ARCHITECTURE.md`（Architecture Approved v0.3，未修改）§2.6、§2.7、§5、§6.1–§6.5、§8.2、§8.3、§11、§14
- `docs/adr/ADR-034-prisma-manual-constraints.md`（Gate 0 已接受）
- 授權紀錄：[PR #14 comment 6054603421](https://github.com/zrco001/CEproject/pull/14#issuecomment-6054603421)

## 1. 交付內容

| 項目                | 位置                                                                               | 內容                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workspace 套件      | `packages/db`（`@ceproject/db`）                                                   | Prisma / `@prisma/client` / `@prisma/adapter-pg` 7.10.0、`pg` 8.23.1 固定版本；lockfile 只有新增，既有套件版本未變                                                                                                                                                                                                                                                                                          |
| Schema              | `prisma/schema.prisma`                                                             | §6.2 全部 36 個 model、§6.1 全部 35 個 enum；未建立 FUTURE 的 ProgressBillingItem / ContractItem                                                                                                                                                                                                                                                                                                            |
| Init migration      | `prisma/migrations/20261008120000_init/migration.sql`                              | Prisma 7.10.0 離線產生段（36 表、152 條 FK 全部 RESTRICT / RESTRICT），加上手寫段（38 條 CHECK、13 個 partial unique、I-20 REVOKE）                                                                                                                                                                                                                                                                         |
| Constraint registry | `prisma/constraints.registry.ts`                                                   | 110 項：21 個 composite target、36 條 composite FK、38 條 CHECK、13 個 partial unique、1 個 unique index、1 項權限；含 I-01～I-26 對照                                                                                                                                                                                                                                                                      |
| 約束清冊            | `prisma/constraints.md`                                                            | I-01～I-26 的來源、實作位置、DB 與 application rule 的區分、正反測試；schema ↔ SQL ↔ registry 對照；未執行的 DB 驗證計畫                                                                                                                                                                                                                                                                                    |
| Registry 檢查       | `src/registry/compare.ts`、`src/registry/expression.ts`、`src/registry/catalog.ts` | 以 `pg_constraint`（含 `convalidated`）、`pg_index`（`indisvalid / indisready / indislive`）與 `has_table_privilege` 比對名稱、表、類型、FK 欄位與 actions；CHECK 與 partial index 條件以保留運算順序、括號分組與會改變值的型別轉換的語法樹比對。缺失、弱化、改變分組、加入型別轉換（如 `::integer`）、NOT VALID、DEFERRABLE、CASCADE、MATCH FULL、無效 / 未就緒 / 非 live 的 index、缺少狀態欄位都判定失敗 |
| Migration 安全檢查  | `src/migration/inspect.ts`                                                         | Gate 0 規則：新草稿不得 DROP 或碰到受保護物件；drift script 與 exit code 必須一致                                                                                                                                                                                                                                                                                                                           |
| Seed 程式           | `src/seed/*`                                                                       | Permission、7 個系統角色、§8.3 授權矩陣；各組織的預設成本分類函式。可重複執行、只新增不刪除；CLI 需明確確認字串。**未執行**                                                                                                                                                                                                                                                                                 |
| Client factory      | `src/client.ts`                                                                    | `createPrismaClient(connectionString)`（driver adapter）；不讀 `.env`                                                                                                                                                                                                                                                                                                                                       |
| Shared enums        | `packages/shared/src/enums`                                                        | 補上 §6.1 已列、但 Phase 1 未建立的 `AttachableType`、`AttachmentPurpose`                                                                                                                                                                                                                                                                                                                                   |
| CI / Turbo          | `turbo.json`                                                                       | 新增 `generate` task（`prisma generate`，離線），`build / typecheck / lint / test` 依賴它；CI workflow 本身未修改                                                                                                                                                                                                                                                                                           |
| ADR / 問題清單      | `docs/adr/ADR-034…`、`docs/ARCHITECTURE_ISSUES.md`                                 | ADR 記錄 run 4 與接受決定，保留 run 1–3 真實結論；14 項非阻擋的實作選擇待人工確認                                                                                                                                                                                                                                                                                                                           |

## 2. 工作包驗收對照

| 要求                                                                          | 結果                                                                                                                                                                       |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 36 個 MVP models；不建立 ProgressBillingItem                                  | 完成；`test/schema.test.ts` 以清單比對                                                                                                                                     |
| §6.1 enums 與 shared enums 對齊                                               | 完成；35 個 enum 逐值比對（shared 專用的 SystemRoleCode、AllocationState 除外）                                                                                            |
| §5.1 共用 / version / void 欄位；UUID、TIMESTAMPTZ、Decimal、DATE             | 完成；UUID v7（client 產生）+ `uuid` 型別、instant 為 `Timestamptz(3)`、business date 為 `Date`、金額 18,2、比率 7,4、進度 5,2；不使用 Float                               |
| I-01～I-26 每項有來源、實作、正反測試、DB 與 application 區分                 | 完成；`constraints.md` §2 與 `INTEGRITY_RULES`；含 §6.2 的 physical progress、Receivable 來源、BankTransaction / allocation 金額 CHECK                                     |
| §6.5 composite target 與 native composite FK；禁止 SET NULL / CASCADE         | 完成；14 核心表 + 7 master target；36 條 composite FK；所有 152 條 FK 為 RESTRICT / RESTRICT；離線檢查 generated SQL                                                       |
| Registry 驗證名稱、表、類型、定義、FK 欄位與 actions                          | 完成；缺失或定義變更不會誤過（`test/registry.test.ts`）                                                                                                                    |
| 草稿檢查保留 manual objects；禁止套用 DROP 草稿                               | 完成；`inspectMigrationDraft` 以 Gate 0 的真實失敗草稿作回歸測試；目前只有 init migration                                                                                  |
| 固定 Prisma / Client 7.10.0，不更新無關套件                                   | 完成；lockfile diff 只有新增                                                                                                                                               |
| Seed 只用既有角色、矩陣與分類；不建立帳號或真實資料；不執行                   | 完成；缺口列於 `SEED_GAPS` 與 ARCHITECTURE_ISSUES AI-P2-12，不自行放寬                                                                                                     |
| AuditLog REVOKE 實作與測試計畫；不以 owner 虛報                               | 完成實作與計畫：registry 以 `has_table_privilege('app_user', …)` 檢查，整合測試以 `SET LOCAL ROLE app_user` 驗證 42501。**未執行**                                         |
| 違反、跨 org、nullable FK、作廢重複、金額分支、clear / bounce、冪等、來源一致 | 已寫成 221 個表格化案例（`test/db/cases.ts`），每條 CHECK / partial unique / composite FK 都有拒絕案例，可空 FK 都有 NULL 通過案例。**未執行**，`pnpm test` 顯示為 skipped |
| 離線 validate / generate / format / lint / typecheck / test / build           | 完成；datasource 只用不連線的 placeholder（127.0.0.1:9），不讀 `.env`                                                                                                      |

## 3. 已執行的驗證

| 檢查                                                  | 結果                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| `prisma validate`、`prisma format --check`            | 通過（db 套件的 `lint`）                                            |
| `prisma generate`                                     | 通過（離線）                                                        |
| 已提交 SQL 與 `prisma migrate diff --from-empty` 輸出 | Prisma 產生段逐位元組相同（`test/migration.test.ts`，每次 CI 重跑） |
| `pnpm --filter @ceproject/db test`                    | 599 通過，223 skipped（PostgreSQL 整合測試，未授權資料庫故不執行）  |
| `pnpm format:check / lint / typecheck / test / build` | 全部通過（全 repo）                                                 |

離線測試**沒有**證明 PostgreSQL 實際會接受或拒絕各案例。它們只確認：案例 SQL 與 migration 的表、欄位、NOT NULL、enum 一致，參照都能解析，每條約束都有對應案例。

## 4. 未執行（需另外具體審查與授權）

- 對任何資料庫執行 `prisma migrate deploy / dev / reset`、seed 或 `test/db/constraints.spec.ts`。
- 正式 schema 的 drift 實測（Gate 0 方式的 `migrate diff` 正向對照與無關欄位草稿）。
- 建議的執行環境需求列於 `prisma/constraints.md` §5（拋棄式 loopback DB、`app_user` 佈建、deploy、測試、清理證明）。

**更正（Codex 審查 683606122）**：前一版宣稱 registry 檢查「不會誤判通過」並不正確。原 `normalizeCheck` 會移除所有括號，改變分組的 CHECK（例如 I-14 改成 `gross + (change - (retention - deduction))`）仍被判為相符；FK 與 index 也只比對文字，NOT VALID 的 composite FK 與無效的 unique index 會被判為存在。本版修正：

- CHECK / predicate 解析成保留 PostgreSQL 運算優先順序與分組的語法樹再比較。只移除 PostgreSQL 反解析加入、且不改變值的差異：冗餘括號、`<> ALL (ARRAY[…])`、`BETWEEN` 等固定改寫，以及常數的型別轉換（字串常數轉 enum 或 text、數字常數轉 numeric、由這些常數組成的 ARRAY）。不支援的語法一律判定失敗。
- **第二輪更正（Codex 審查 d62f1b7）**：上一版會無條件移除所有型別轉換，`("billingAmount")::integer = …` 會被判為相符。numeric 轉 integer 會四捨五入，等於容許 85.49 通過應為 85.00 的 I-14 公式。現在欄位、運算結果以及非上述範圍的轉換都保留在語法樹中，因此判定不符；已加回歸測試，含外加括號與連續轉換。
- 讀取並要求 `convalidated = true`，以及 index 的 `indisvalid`、`indisready`、`indislive` 全為 true；狀態缺少時也判定失敗。

反解析格式的樣本是依 PostgreSQL 行為手寫的離線測試，首次 DB 執行時仍需確認；若實際格式不在支援範圍內，結果是判定失敗，而非誤判通過。

## 5. 範圍外（未變更）

- `docs/ARCHITECTURE.md`（blob `73aafe2ae0ca175117de08bb37e52b465c42b0ea`）、AI 協作流程設定、`.github/workflows`、PR #9 / #4。
- Phase 3 auth / RBAC 實作、tenant 規則、金額定義、狀態機。
- Gate 0 PoC（`poc/gate-0`）與其 workflow。
