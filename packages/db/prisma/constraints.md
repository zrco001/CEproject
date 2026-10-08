# Phase 2 約束清冊（Constraint register）

依據：`docs/ARCHITECTURE.md`（Architecture Approved v0.3）§6.4、§6.5、§6.2；`docs/adr/ADR-034-prisma-manual-constraints.md`（已接受）。

本文件是 `prisma/constraints.registry.ts` 的說明版。兩者與 `prisma/migrations/20261008120000_init/migration.sql` 的一致性由離線測試強制：

- `test/integrity.test.ts`：I-01～I-26 對照，以及本文件涵蓋每個 registry 名稱
- `test/migration.test.ts`：registry ↔ migration SQL
- `test/db-plan.test.ts`：每條約束都有違反案例與通過案例

## 1. 實作方式（ADR-034 accepted strategy）

| 物件                                        | 宣告位置                                                   | 為什麼                                                                  |
| ------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------- |
| `(organizationId, id)` target、composite FK | `schema.prisma` 原生宣告（Prisma 產生 UNIQUE INDEX 與 FK） | Gate 0 run 1 證明：schema 未宣告時，Prisma 草稿會 `DROP` 這些物件       |
| CHECK、partial unique index                 | 附加在同一個 `migration.sql` 末尾（§6.5 步驟 1）           | Prisma schema 無法表達；Gate 0 run 37741573406 證明 Prisma 草稿不會移除 |
| `REVOKE`（I-20）                            | 同上                                                       | 權限不屬 schema；`app_user` 須先存在，否則 migration 直接失敗而不是略過 |

**檢查方式**（ADR-034）：

- Prisma diff 偵測不到被刪除的 CHECK（Gate 0 TC-22），因此 **registry 檢查一定要做**。
- Registry 檢查以語法樹比較 CHECK 與 partial index 條件，保留運算順序、括號分組與會改變值的型別轉換（例如 `::integer` 會四捨五入）；只忽略 PostgreSQL 對常數加上的 enum / text / numeric 轉換。不支援的語法判定失敗。它也要求 constraint 已驗證（`convalidated`），index 為 valid / ready / live（`pg_index`）；NOT VALID 的 FK 或無效的 unique index 不算存在。
- 新 migration 草稿：任何 `DROP` 或提到受保護名稱的行，一律停止，交人工審查（`inspectMigrationDraft`）。
- drift script：exit code 與內容必須一致，且不得破壞受保護物件（`inspectDriftScript`）。

## 2. I-01～I-26 對照表

「DB 物件」即 registry 名稱。「Application rule」屬後續 Phase 的 use case，本 PR 不實作。「測試」欄列出 `test/db/cases.ts` 的案例群組；這些案例**尚未在 PostgreSQL 執行**（見 §5）。

| #    | 規則                              | DB 物件                                                                                                                                                                                                                     | Application rule                                                                | 測試（拒絕 / 通過）                                                                  |
| ---- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| I-01 | PayablePayment 有效 pair 唯一     | `payable_payment_pair_active_key`                                                                                                                                                                                           | —                                                                               | 重複有效 pair → 23505；作廢後重建 → 通過                                             |
| I-02 | ReceiptAllocation 有效 pair 唯一  | `receipt_allocation_pair_active_key`                                                                                                                                                                                        | —                                                                               | 同上                                                                                 |
| I-03 | 系統 Role code 唯一               | `role_system_code_uq`                                                                                                                                                                                                       | —                                                                               | 重複系統 code → 23505；組織 role 沿用系統 code → 通過                                |
| I-04 | 組織 Role code 唯一               | `role_org_code_uq`                                                                                                                                                                                                          | —                                                                               | 同組織重複 → 23505；兩組織同 code → 通過                                             |
| I-05 | ExpenseScope ⇔ projectId          | `expense_scope_project_check`、`payable_scope_project_check`                                                                                                                                                                | Expense use case 驗證 scope；Payable 的 scope / projectId 同 Expense            | PROJECT 無工程、OVERHEAD 有工程 → 23514；OVERHEAD 無工程 → 通過                      |
| I-06 | POSTED / VOID Expense 必有 vendor | `expense_posted_vendor_check`                                                                                                                                                                                               | —                                                                               | POSTED、VOID 無 vendor → 23514；SUBMITTED 無 vendor → 通過（D-22）                   |
| I-07 | Payee 規則                        | `payable_payee_check`、`payment_payee_check`                                                                                                                                                                                | Payable payee 對應 Expense；同一 Payment 的有效分配必須同 payee（TD-35）        | 兩個 payee 欄位同時有值、VENDOR 缺 vendor → 23514                                    |
| I-08 | Expense 狀態欄位一致              | `expense_submitted_fields_check`、`expense_posted_fields_check`、`expense_void_fields_check`                                                                                                                                | —                                                                               | 缺 submittedAt、expenseNo、postedAt、voidedAt → 23514                                |
| I-09 | Expense 金額                      | `expense_amounts_check`                                                                                                                                                                                                     | —                                                                               | total ≠ subtotal + tax、負數 → 23514                                                 |
| I-10 | Payable / Receivable 金額         | `payable_amounts_check`、`receivable_amounts_check`                                                                                                                                                                         | —                                                                               | 合計不符、paid 或 outstanding 為負 → 23514；付清 → 通過                              |
| I-11 | Payment 金額（feeBearer）         | `payment_amounts_check`、`payment_fee_bearer_amounts_check`                                                                                                                                                                 | —                                                                               | 合計不符、金額 0、手續費負數、COMPANY / COUNTERPARTY 分支錯誤 → 23514                |
| I-12 | Receipt 金額（feeBearer）         | `receipt_amounts_check`、`receipt_fee_bearer_amounts_check`                                                                                                                                                                 | MVP API 拒絕 COUNTERPARTY                                                       | 同上；COUNTERPARTY 無手續費 → DB 通過（API 另擋）                                    |
| I-13 | ChangeOrder 請款額度              | `change_order_billed_amount_check`                                                                                                                                                                                          | Row lock + 條件式 UPDATE → `CHANGE_ORDER_OVERBILLED`（§3.6）                    | billed 超過 amount、負數、amount 0 → 23514                                           |
| I-14 | ProgressBilling 公式              | `progress_billing_billing_amount_check`、`progress_billing_total_amount_check`                                                                                                                                              | —                                                                               | 公式不符 → 23514；扣款、負數追減 → 通過                                              |
| I-15 | PBCO pair 唯一、金額 > 0          | `progress_billing_change_order_pair_key`、`progress_billing_change_order_amount_check`                                                                                                                                      | 只能請 APPROVED、同工程的 CO（§3.6）                                            | 重複 pair → 23505；金額 0 → 23514                                                    |
| I-16 | 一工程一份有效業主合約            | `contract_owner_contract_active_key`                                                                                                                                                                                        | —                                                                               | 第二份有效 OWNER_CONTRACT → 23505；TERMINATED、SUBCONTRACT → 通過                    |
| I-17 | 加密欄位完整性                    | `vendor_bank_account_no_fields_check`、`employee_bank_account_no_fields_check`、`bank_account_account_no_fields_check`                                                                                                      | 加密與遮罩（Phase 4）                                                           | 只填部分欄位 → 23514；三欄齊全 → 通過                                                |
| I-18 | RevenueEntry 來源與冪等           | `revenue_entry_source_check`、`revenue_entry_source_key_active_key`                                                                                                                                                         | 自動認列採 `ON CONFLICT DO NOTHING` 語意（§3.7）                                | 來源不符 → 23514；重複有效 sourceKey → 23505；同一估驗多筆 → 通過                    |
| I-19 | clientRequestId 冪等              | `expense_client_request_id_partial_key`、`payment_client_request_id_partial_key`、`receipt_client_request_id_partial_key`、`project_daily_log_client_request_id_partial_key`、`revenue_entry_client_request_id_partial_key` | —                                                                               | 同組織重複 → 23505；跨組織相同、多筆 NULL → 通過                                     |
| I-20 | AuditLog append-only              | `audit_log_app_user_revoked_privileges`（`REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM app_user`）                                                                                                                    | 應用程式以 `app_user` 連線，不以 table owner 連線                               | 以 `SET LOCAL ROLE app_user` 執行 UPDATE / DELETE / TRUNCATE → 42501；INSERT → 通過  |
| I-21 | Composite FK                      | 見 §3 全部 21 個 target 與 36 條 FK                                                                                                                                                                                         | ReferenceGuard（Phase 3）                                                       | 每條 FK 跨組織引用 → 23503；每條可空 FK 為 NULL → 通過；刪除被引用列 → 23503 / 23001 |
| I-22 | Allocation 作廢欄位一致           | `payable_payment_void_fields_check`、`receipt_allocation_void_fields_check`                                                                                                                                                 | —                                                                               | 只填部分作廢欄位 → 23514；三欄齊全 → 通過                                            |
| I-23 | 支票 Clearing                     | `payment_clearing_method_check`、`payment_cleared_fields_check`、`payment_bounced_fields_check`、`receipt_clearing_method_check`、`receipt_cleared_fields_check`、`receipt_bounced_fields_check`                            | PENDING / BOUNCED 不得有 POSTED BankTransaction（application + reconciliation） | method 與狀態不符、欄位缺漏或多填 → 23514                                            |
| I-24 | Employee 唯一                     | `employee_employee_no_partial_key`、`employee_user_id_partial_key`                                                                                                                                                          | —                                                                               | 同組織重複 → 23505；跨組織、NULL → 通過                                              |
| I-25 | AuditLog schemaVersion            | `audit_log_schema_version_check`（`NOT NULL DEFAULT 1` 在 schema）                                                                                                                                                          | —                                                                               | 0 → 23514；預設 1 → 通過                                                             |
| I-26 | Receivable 不持久化 OVERDUE       | `receivable_status_not_overdue_check`                                                                                                                                                                                       | displayStatus 由讀取時計算（TD-12）                                             | OVERDUE → 23514                                                                      |

**§6.2 其他模型約束**（不在 I-01～I-26 內，但 §6.2 有寫）：

| DB 物件                                   | 來源                                                 | 測試                                       |
| ----------------------------------------- | ---------------------------------------------------- | ------------------------------------------ |
| `project_physical_progress_percent_check` | Project：`physicalProgressPercent BETWEEN 0 AND 100` | 100.01、-0.01 → 23514；0、100、NULL → 通過 |
| `receivable_source_check`                 | Receivable：「CHECK sourceType 與來源 FK 對應」      | 來源不符 → 23514                           |
| `bank_transaction_amount_check`           | BankTransaction：`amount (>0)`                       | 0、負數 → 23514                            |
| `payable_payment_amount_check`            | PayablePayment：`amount (>0)`                        | 0 → 23514                                  |
| `receipt_allocation_amount_check`         | ReceiptAllocation：`amount (>0)`                     | 0 → 23514                                  |

Prisma 原生的 §6.2 unique key（`payable_expense_id_key`、`receivable_progress_billing_id_key`、`receivable_retention_release_id_key` 等）由 Prisma 管理，也有重複案例，但不列入 registry。

## 3. I-21 composite key 清單

**Composite target**（§6.5 規則 1、2；Prisma 建成 UNIQUE INDEX）：

- 財務核心表（14）：`expense_org_id_key`、`expense_item_org_id_key`、`payable_org_id_key`、`payment_org_id_key`、`payable_payment_org_id_key`、`progress_billing_org_id_key`、`progress_billing_change_order_org_id_key`、`receivable_org_id_key`、`receipt_org_id_key`、`receipt_allocation_org_id_key`、`change_order_org_id_key`、`revenue_entry_org_id_key`、`retention_release_org_id_key`、`bank_transaction_org_id_key`
- 被參照的 master data（7）：`project_org_id_key`、`contract_org_id_key`、`customer_org_id_key`、`vendor_org_id_key`、`employee_org_id_key`、`cost_category_org_id_key`、`bank_account_org_id_key`

**Composite FK**（全部 `ON DELETE RESTRICT ON UPDATE RESTRICT`；可空者為 MATCH SIMPLE）：

| 子表                       | FK（可空者標 ?）                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Expense                    | `expense_project_id_org_fkey`?、`expense_vendor_id_org_fkey`?、`expense_advanced_by_employee_id_org_fkey`?、`expense_cost_category_id_org_fkey`               |
| ExpenseItem                | `expense_item_expense_id_org_fkey`、`expense_item_cost_category_id_org_fkey`                                                                                  |
| Payable                    | `payable_vendor_id_org_fkey`?、`payable_employee_id_org_fkey`?、`payable_expense_id_org_fkey`?、`payable_project_id_org_fkey`?                                |
| Payment                    | `payment_vendor_id_org_fkey`?、`payment_employee_id_org_fkey`?、`payment_project_id_org_fkey`?、`payment_bank_account_id_org_fkey`                            |
| PayablePayment             | `payable_payment_payment_id_org_fkey`、`payable_payment_payable_id_org_fkey`                                                                                  |
| ProgressBilling            | `progress_billing_project_id_org_fkey`、`progress_billing_contract_id_org_fkey`                                                                               |
| ProgressBillingChangeOrder | `progress_billing_change_order_progress_billing_id_org_fkey`、`progress_billing_change_order_change_order_id_org_fkey`                                        |
| Receivable                 | `receivable_customer_id_org_fkey`、`receivable_project_id_org_fkey`?、`receivable_progress_billing_id_org_fkey`?、`receivable_retention_release_id_org_fkey`? |
| Receipt                    | `receipt_customer_id_org_fkey`、`receipt_project_id_org_fkey`?、`receipt_bank_account_id_org_fkey`                                                            |
| ReceiptAllocation          | `receipt_allocation_receipt_id_org_fkey`、`receipt_allocation_receivable_id_org_fkey`                                                                         |
| ChangeOrder                | `change_order_project_id_org_fkey`、`change_order_contract_id_org_fkey`                                                                                       |
| RevenueEntry               | `revenue_entry_project_id_org_fkey`?、`revenue_entry_progress_billing_id_org_fkey`?                                                                           |
| RetentionRelease           | `retention_release_project_id_org_fkey`                                                                                                                       |
| BankTransaction            | `bank_transaction_bank_account_id_org_fkey`                                                                                                                   |
| PettyCashTransaction       | `petty_cash_transaction_expense_id_org_fkey`?（§6.5 未強制；因指向財務核心表 Expense 而一併採用）                                                             |

其餘關聯（例如 Project → Customer、Contract → Project、ProjectBudget → CostCategory）依 §6.5 不在 composite 範圍內，使用單欄 FK 加 ReferenceGuard。指向 `User` 的欄位一律單欄 FK（§6.5 規則 3）。所有 152 條 FK 都是 `RESTRICT / RESTRICT`。

## 4. Schema ↔ SQL ↔ registry 對照

| 項目                     | schema.prisma                                                              | migration.sql                                                  | registry                        | 離線驗證                                 |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------- | ---------------------------------------- |
| 36 個 model、35 個 enum  | `model` / `enum`                                                           | Prisma 產生段                                                  | —                               | `schema.test.ts`（含 shared enums 一致） |
| Prisma 產生段            | 全部                                                                       | 與 `prisma migrate diff --from-empty` 輸出逐位元組相同         | —                               | `migration.test.ts`                      |
| Composite target / FK    | `@@unique([organizationId, id])`、`@relation(fields: [organizationId, …])` | `CREATE UNIQUE INDEX … _org_id_key`、`FOREIGN KEY … _org_fkey` | `unique_target`、`composite_fk` | `schema.test.ts`、`migration.test.ts`    |
| CHECK                    | —（以 `///` 註解指向本文件）                                               | 手寫段 `ADD CONSTRAINT … CHECK`                                | `check`（含條件全文）           | 正規化後與 SQL 相同                      |
| Partial unique           | —                                                                          | 手寫段 `CREATE UNIQUE INDEX … WHERE`                           | `partial_unique_index`          | 欄位與 WHERE 相同                        |
| I-20 權限                | —                                                                          | 手寫段角色檢查 + `REVOKE`                                      | `revoked_privileges`            | SQL 文字相同                             |
| 手寫段只能建立已登記物件 | —                                                                          | 不含 DROP、資料變更、交易控制                                  | 名稱全部在 registry             | `migration.test.ts`                      |

## 5. 尚未執行：PostgreSQL 驗證計畫（需另外具體授權）

本 PR **沒有**對任何資料庫執行 migration、seed 或測試。`test/db/constraints.spec.ts` 在 `CEPROJECT_IT_DATABASE_URL` 未設定時整組跳過（pnpm test 顯示為 skipped），不以 stub 或 PGlite 取代。

未來執行環境（待審查與授權）至少需要：

1. 全新的拋棄式 PostgreSQL 16.15，僅綁定 loopback，資料庫名稱 `ceproject_it_*`。`test/db/guard.ts` 只接受字面 loopback IP（127.0.0.1 / ::1），拒絕任何 query 參數（如 `?host=`）、fragment 與 Unix socket 形式，並把驗證後的 host / port / database / user 物件交給 pg，不傳原始 URL。
2. 部署前建立 `app_user`（NOLOGIN、非 superuser、非 table owner），設定預設權限讓之後建立的表授予 `SELECT, INSERT, UPDATE, DELETE`，並讓測試帳號成為 `app_user` 成員。init migration 的 REVOKE 會移除 AuditLog 的 UPDATE / DELETE / TRUNCATE。
3. `prisma migrate deploy` 套用 `prisma/migrations`，再執行 `pnpm --filter @ceproject/db test`：
   - registry 全部存在且定義相符、所有 FK 為 RESTRICT / NO ACTION；
   - I-20 以 `app_user` 身分驗證，不以 owner 身分虛報；
   - `test/db/cases.ts` 全部案例（每個測試在 rollback 的 transaction 內執行）。
4. 另以 Gate 0 相同方式驗證 drift：`migrate diff` 正向對照、`inspectDriftScript`、加無關欄位草稿的 `inspectMigrationDraft`。
5. 執行後確認容器與資料已清除，並保存報告。
