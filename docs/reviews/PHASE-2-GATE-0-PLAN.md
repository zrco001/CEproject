# Phase 2 Gate 0 Plan — Prisma Manual Constraint PoC（disposable DB）

**狀態**：計畫文件，**尚未執行任何步驟**。

**依據**：`docs/ARCHITECTURE.md`（Architecture Approved v0.3）

- §11.2 Phase 2 Gate 0
- ADR-34
- §6.4 DB Integrity（I-01、I-11、I-22）
- §6.5 Composite FK 規格與 Migration strategy
- §14 R-13

**基礎提交**：`main` @ `132ca23e6da017d9d716afe7428d67e9c327a97b`

**本文件不做的事**：

- 不建立正式 schema。
- 不執行任何 migration。
- 不連線、不修改任何既有資料庫。
- 不安裝套件，不修改 workflow 或 lockfile。

DB、migration 與 reset 屬於 `CLAUDE.md` 規定的「必須停下等人核准」範圍。本計畫的每個執行步驟都要等第 2 節的決策由人核准後，才能在有人監督的情況下進行。

---

## 1. 目的

在建立完整 Prisma Schema 之前，以最小的拋棄式 PoC 回答以下四個問題：

1. PostgreSQL 的 CHECK、partial unique index、composite FK 能否以「manual SQL 附加在 Prisma migration 檔末尾」的方式建立，且確實生效？
2. `prisma migrate dev`、`migrate reset`、`migrate deploy` 會不會移除或忽略這些 manual constraints？
3. 如何在 CI 偵測 drift，也就是 manual constraint 被移除或遺漏的情況？
4. Prisma 能否原生宣告 composite FK relation（必填與可空兩種）？若不能，§6.5 規則 7 的 Hybrid 策略是否可行？

任何一題答案不理想時，依 §6.5 Migration strategy 步驟 7 停止，先提出替代 migration strategy 送 Review。

---

## 2. 執行前需要人核准的決策

| #   | 決策                                          | 建議                                                                                                                     | 備註                                                                                                                                                                                                                                                         |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D-1 | Prisma 版本                                   | 固定 **`prisma@7.10.0` / `@prisma/client@7.10.0`**，不用 caret                                                           | 2026-10-07 查詢 npm：`latest` dist-tag 指向 `8.0.0-rc.20`（預覽版，不採用），最新穩定版為 `7.10.0`。其 engines 為 Node `^20.19 \|\| ^22.12 \|\| >=24.0`，peer 需求 TypeScript `>=5.4.0`，與本 repo 的 Node 24、TypeScript 6.0 相容。只查了版本資訊，沒有安裝 |
| D-2 | PostgreSQL image                              | **`postgres:16.15-alpine`**（固定 patch 版本），與 compose 的 PostgreSQL 16 一致                                         | Docker Hub 目前有 `16.15` 系列 tag                                                                                                                                                                                                                           |
| D-3 | 執行環境                                      | **方案 A**：在有 Docker 的開發機上由人操作。**方案 B**：新增手動觸發、只用拋棄式 service container 的 GitHub Actions job | 本機開發機目前**沒有 Docker**，無法執行方案 A。方案 B 需要修改 workflow，屬於另一個需要審查的變更                                                                                                                                                            |
| D-4 | PoC 程式碼放哪裡                              | 放在 `poc/gate-0/`，不加入 pnpm workspace、不加入 Turborepo 任務，只存在於 PoC 分支。結論寫入 ADR-034 後即可移除         | 避免 PoC 的 `schema.prisma` 被誤認為正式 schema（正式 schema 預定在 `packages/db`）                                                                                                                                                                          |
| D-5 | 表數量                                        | 4 張：`PocOrg`、`PocVendor`、`PocPayment`、`PocAllocation`                                                               | §11.2 舉例為 2–3 張。為了同時涵蓋「必填」與「可空」的 composite FK，多加一張很小的 `PocVendor` 作為可空 FK 的目標。若堅持 3 張，替代做法是讓 `PocAllocation` 帶一個可空的自我參照 composite FK，但這會把 Prisma 自我關聯的限制混進結果，較不建議             |
| D-6 | 允許在拋棄式 DB 上執行 `prisma migrate reset` | 只允許第 3.3 節的 guard 通過的 DB                                                                                        | G0-5 必須執行 reset。`CLAUDE.md` 禁止的是對既有資料庫 reset，這裡需要人明確核准只對拋棄式 DB 執行                                                                                                                                                            |
| D-7 | 監督者                                        | 由人指定                                                                                                                 | 依 `CLAUDE.md`，DB 與 migration 工作需要人監督                                                                                                                                                                                                               |

---

## 3. 環境

### 3.1 需求

| 項目                | 規格                                                |
| ------------------- | --------------------------------------------------- |
| Node.js             | 24（`.nvmrc`）                                      |
| pnpm                | 10.x（`packageManager`）                            |
| Prisma CLI / Client | 依 D-1 固定版本，只安裝在 `poc/gate-0/`             |
| PostgreSQL          | 依 D-2，以拋棄式 container 執行                     |
| Docker              | 依 D-3。本機目前沒有，需要先決定環境                |
| 網路                | 只需要拉取 image 與 npm 套件；DB 只綁定 `127.0.0.1` |

### 3.2 拋棄式 DB 規格

- **Container 名稱**：`ceproject-gate0-pg`（不同於 compose 的 `ceproject-postgres-1`），以 `--rm` 啟動。
- **儲存**：`--tmpfs /var/lib/postgresql/data`，不使用任何 named volume，container 停止後資料就消失。
- **連接埠**：`127.0.0.1:55432`（避開 compose 的 5432）。
- **帳密**：一次性的 placeholder（例如 `gate0` / `gate0-local-only`），不寫入任何會被 commit 的檔案；`.env` 不提交。
- **資料庫**：`gate0_main`（主 DB）、`gate0_shadow`（`migrate dev` 的 shadow DB）、`gate0_fresh`（G0-6 用的乾淨 DB）。都由 PoC 腳本在這個 container 內建立。
- **資料**：只有測試案例自己插入的合成資料，沒有任何真實客戶或財務資料。

### 3.3 防呆（guard）

每個會連 DB 的指令執行前都先檢查 `DATABASE_URL` 與 `SHADOW_DATABASE_URL`，任一條件不符就立即中止：

1. Host 必須是 `127.0.0.1` 或 `localhost`。
2. Port 必須是 `55432`。
3. Database 名稱必須以 `gate0_` 開頭。
4. `docker ps` 必須看得到名為 `ceproject-gate0-pg` 的 container。

結束時一律執行 `docker stop ceproject-gate0-pg`。因為用了 `--rm` 與 tmpfs，資料會一併消失。

---

## 4. PoC Schema（最小，僅供驗證）

命名依 §6.5 naming convention；表名是否 `@@map` 成 snake_case 不在本 PoC 範圍，constraint 名稱一律 snake_case。

| 表              | 欄位                                                                                                                                                                                   | 說明                                              |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `PocOrg`        | `id`                                                                                                                                                                                   | tenant                                            |
| `PocVendor`     | `id`、`organizationId`                                                                                                                                                                 | 可空 composite FK 的目標                          |
| `PocPayment`    | `id`、`organizationId`、`vendorId?`、`feeBearer`（enum `COMPANY` \| `COUNTERPARTY`）、`paymentAmount`、`feeAmount`、`bankOutflowAmount`、`payeeReceivedAmount`（皆為 `Decimal(18,2)`） | 必填與可空 composite FK、依 enum 分支的金額 CHECK |
| `PocAllocation` | `id`、`organizationId`、`paymentId`、`targetKey`（text，代表被沖銷的對象）、`amount`、`voidedAt?`、`voidedById?`、`voidReason?`                                                        | partial unique、作廢欄位一致性 CHECK              |

### Manual constraints（附加在第一個 migration 的 `migration.sql` 末尾）

| 名稱                                   | 類型                  | 內容                                                                                                                                                                             | 對應              |
| -------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `poc_vendor_org_id_key`                | UNIQUE                | `("organizationId","id")`                                                                                                                                                        | §6.5 規則 1       |
| `poc_payment_org_id_key`               | UNIQUE                | `("organizationId","id")`                                                                                                                                                        | §6.5 規則 1       |
| `poc_allocation_payment_id_org_fkey`   | Composite FK（必填）  | `("organizationId","paymentId") → PocPayment("organizationId","id") ON DELETE RESTRICT ON UPDATE RESTRICT`                                                                       | §6.5 規則 2、5、6 |
| `poc_payment_vendor_id_org_fkey`       | Composite FK（可空）  | `("organizationId","vendorId") → PocVendor("organizationId","id") ON DELETE RESTRICT ON UPDATE RESTRICT`，MATCH SIMPLE                                                           | §6.5 規則 4、5、6 |
| `poc_payment_fee_bearer_amounts_check` | CHECK（依 enum 分支） | 與 I-11 相同：COMPANY → `bankOutflow = payment + fee` 且 `payeeReceived = payment`；COUNTERPARTY → `fee < payment` 且 `bankOutflow = payment` 且 `payeeReceived = payment − fee` | I-11              |
| `poc_allocation_amount_positive_check` | CHECK                 | `amount > 0`                                                                                                                                                                     | §6.2              |
| `poc_allocation_void_fields_check`     | CHECK                 | `voidedAt`、`voidedById`、`voidReason` 必須同為 NULL 或同為非 NULL                                                                                                               | I-22              |
| `poc_allocation_pair_active_key`       | Partial UNIQUE INDEX  | `("paymentId","targetKey") WHERE "voidedAt" IS NULL`                                                                                                                             | I-01              |

所有 manual constraint 都登錄在 PoC 的 `constraints.registry`（名稱、表、類型），格式比照 §6.5 步驟 2。

---

## 5. 執行步驟（runbook，尚未執行）

| 步驟 | 內容                                                                                                                                                  | 產出                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| S0   | 確認 D-1～D-7 已核准；確認工作目錄乾淨、在 PoC 專用分支                                                                                               | 核准紀錄                            |
| S1   | 依 3.2 啟動拋棄式 container，建立 `gate0_main`、`gate0_shadow`、`gate0_fresh`；執行 guard                                                             | container 資訊、guard 輸出          |
| S2   | 在 `poc/gate-0/` 安裝固定版本的 Prisma，撰寫第 4 節的 `schema.prisma`（不含 manual constraints）                                                      | `schema.prisma`、Prisma 版本輸出    |
| S3   | `prisma migrate dev --create-only --name init` → 把 manual constraints 附加到 `migration.sql` 末尾 → `prisma migrate dev` 套用                        | migration 1                         |
| S4   | 執行第 6 節的 G0-1～G0-3 測試案例                                                                                                                     | 測試輸出                            |
| S5   | G0-4：在 schema 加一個無關欄位（例如 `PocPayment.note String?`），執行 `prisma migrate dev --create-only --name add_note`，**先檢查產生的 SQL**再套用 | migration 2 的 SQL 全文             |
| S6   | G0-5：只對 `gate0_main` 執行 `prisma migrate reset --force`（需 D-6 核准，且 guard 通過）→ 查詢 registry → 重跑 G0-1～G0-3                            | 查詢結果、測試輸出                  |
| S7   | G0-6：對 `gate0_fresh` 執行 `prisma migrate deploy` → 查詢 registry → 重跑 G0-1～G0-3                                                                 | 查詢結果、測試輸出                  |
| S8   | G0-7：drift 檢查（第 6 節 TC-20～TC-22）                                                                                                              | `migrate diff` 輸出全文             |
| S9   | G0-8：composite relation 宣告與 Hybrid 驗證（TC-23～TC-26）                                                                                           | `prisma validate` / `generate` 輸出 |
| S10  | `docker stop ceproject-gate0-pg`，確認 container 與資料已移除                                                                                         | 清理紀錄                            |
| S11  | 撰寫 `docs/adr/ADR-034-prisma-manual-constraints.md`：結果、最終 migration strategy、CI drift 檢查方式；任何一項失敗時改寫為替代方案提案              | ADR-034                             |

---

## 6. 測試案例

**預期錯誤碼（PostgreSQL SQLSTATE）**：

- `23514`：check_violation
- `23505`：unique_violation
- `23503`：foreign_key_violation

測試資料以兩個組織（`org_A`、`org_B`）建立，各有一個 vendor 與數筆 payment。

### G0-1 CHECK constraint

| TC    | 情境                                                                          | 預期                                            |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| TC-01 | COMPANY：payment 100000、fee 30、bankOutflow 100030、payeeReceived 100000     | INSERT 成功                                     |
| TC-02 | COMPANY：bankOutflow 100000（少算 fee）                                       | `23514`，`poc_payment_fee_bearer_amounts_check` |
| TC-03 | COUNTERPARTY：payment 100000、fee 30、bankOutflow 100000、payeeReceived 99970 | INSERT 成功                                     |
| TC-04 | COUNTERPARTY：fee ≥ payment                                                   | `23514`                                         |
| TC-05 | Allocation amount = 0                                                         | `23514`，`poc_allocation_amount_positive_check` |
| TC-06 | Allocation 只設定 `voidedAt`，沒有 `voidedById`、`voidReason`                 | `23514`，`poc_allocation_void_fields_check`     |

### G0-2 Partial unique index

| TC    | 情境                                                            | 預期                                      |
| ----- | --------------------------------------------------------------- | ----------------------------------------- |
| TC-07 | 同一個 payment、同一個 targetKey，建立第二筆有效 allocation     | `23505`，`poc_allocation_pair_active_key` |
| TC-08 | 作廢第一筆（三個作廢欄位都填）後，再建立同一組的有效 allocation | 成功                                      |
| TC-09 | 同一組有兩筆已作廢的 allocation                                 | 成功（作廢的列不受唯一約束）              |

### G0-3 Composite FK

| TC    | 情境                                                                                                                                                                                                                                                                                                        | 預期                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-10 | `org_A` 的 allocation 指向 `org_B` 的 payment（必填 FK）                                                                                                                                                                                                                                                    | `23503`，`poc_allocation_payment_id_org_fkey`                                                                                                         |
| TC-11 | 同 org 的 allocation → payment                                                                                                                                                                                                                                                                              | 成功                                                                                                                                                  |
| TC-12 | Payment 的 `vendorId` 為 NULL（可空 FK）                                                                                                                                                                                                                                                                    | 成功（MATCH SIMPLE）                                                                                                                                  |
| TC-13 | `org_A` 的 payment 指向 `org_B` 的 vendor                                                                                                                                                                                                                                                                   | `23503`，`poc_payment_vendor_id_org_fkey`                                                                                                             |
| TC-14 | 刪除已有 allocation 的 payment                                                                                                                                                                                                                                                                              | `23503`（ON DELETE RESTRICT，不得連鎖刪除）                                                                                                           |
| TC-15 | 不得透過修改 `organizationId` 繞過同組織限制（依賴 `ON UPDATE RESTRICT`）：(a) 把已有 allocation 的 payment 的 `organizationId` 改成 `org_B`（被參照端）；(b) 把 allocation 的 `organizationId` 改成 `org_B`（參照端）；(c) 把已設定 vendor 的 payment 的 `organizationId` 改成 `org_B`（可空 FK 的參照端） | 三者皆 `23503`；資料不變。(a) 若 FK 是 `ON UPDATE CASCADE`，會把子表的 `organizationId` 一併改掉而不報錯，因此本案例同時驗證 `ON UPDATE` 不是 CASCADE |

### G0-4 `migrate dev` 不得移除 manual constraints

| TC    | 情境                                                   | 預期                                                                                                                   |
| ----- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| TC-16 | 在 schema 加無關欄位後執行 `migrate dev --create-only` | 產生的 SQL **只有** `ALTER TABLE ... ADD COLUMN "note"`；不得出現對第 4 節任何 constraint 或 index 的 `DROP` / `ALTER` |
| TC-17 | 套用 migration 2 後查詢 registry                       | 8 條 manual constraint 全部存在                                                                                        |

### G0-5 `migrate reset`（只限拋棄式 DB）

| TC    | 情境                                                            | 預期                             |
| ----- | --------------------------------------------------------------- | -------------------------------- |
| TC-18 | 對 `gate0_main` 執行 reset 後查詢 registry，並重跑 TC-01～TC-15 | 8 條全部存在；測試結果與 S4 相同 |

### G0-6 `migrate deploy`（乾淨 DB）

| TC    | 情境                                                              | 預期                             |
| ----- | ----------------------------------------------------------------- | -------------------------------- |
| TC-19 | 對 `gate0_fresh` 執行 deploy 後查詢 registry，並重跑 TC-01～TC-15 | 8 條全部存在；測試結果與 S4 相同 |

### G0-7 Drift 檢查

| TC    | 情境                                                                                                                                              | 預期                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TC-20 | `prisma migrate diff --from-migrations <dir> --to-schema-datamodel <schema> --shadow-database-url <shadow>`（實際旗標依 D-1 版本的 CLI 說明調整） | 記錄完整輸出。理想結果是空的；若 Prisma 把 partial index 或 composite unique 判定為差異，要記下差異內容                                                |
| TC-21 | `prisma migrate diff`：已套用的 DB 對 schema                                                                                                      | 記錄完整輸出，判斷能否用於 CI                                                                                                                          |
| TC-22 | 故意在 `gate0_main` 手動 `DROP` 一條 manual constraint，再分別執行 TC-20、TC-21 與 registry 查詢                                                  | 記錄哪一種方法偵測得到。預期 Prisma diff 可能偵測不到 CHECK，因為 Prisma schema 不表達 CHECK，所以 registry 查詢必須偵測到。據此決定 CI drift 檢查方式 |

### G0-8 Composite FK 的 Prisma relation 宣告

| TC    | 情境                                                                                                                                                                                                       | 預期與紀錄                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TC-23 | 必填：`payment PocPayment @relation(fields: [organizationId, paymentId], references: [organizationId, id], onDelete: Restrict, onUpdate: Restrict)`，並在 `PocPayment` 加 `@@unique([organizationId, id])` | 記錄 `prisma validate` 與 `migrate dev --create-only` 的結果，以及 Prisma 產生的 FK SQL 與 manual 版本是否等價                                                                                                                                                                                                                                                                                                                                                            |
| TC-24 | 可空：`vendor PocVendor? @relation(fields: [organizationId, vendorId], references: [organizationId, id], onDelete: Restrict, onUpdate: Restrict)`，其中 `organizationId` 必填、`vendorId` 可空             | 記錄 Prisma 是否接受「部分欄位必填」的 optional composite relation（§6.5 規則 7 已知可能有限制）                                                                                                                                                                                                                                                                                                                                                                          |
| TC-25 | 檢查 TC-23、TC-24 產生的 FK 的 `ON DELETE` 與 `ON UPDATE`                                                                                                                                                  | 必須是 `RESTRICT` / `NO ACTION`。Prisma 對 optional relation 的預設 referential action 可能是 `SetNull`，套在 composite FK 上會把 `organizationId` 一起清成 NULL，違反 §6.5 規則 5。Prisma 的預設 `onUpdate` 可能是 `Cascade`，會讓修改父表的 `organizationId` 連帶改寫子表，使 TC-15 失效。因此 schema 一律明確寫出 `onDelete: Restrict` 與 `onUpdate: Restrict`（或 `NoAction`），並記錄實際產生的 SQL，兩者都必須是 `RESTRICT` 或 `NO ACTION`；改寫後重跑 TC-14、TC-15 |
| TC-26 | 若 TC-23 或 TC-24 不被支援：改用 Hybrid 策略，Prisma 宣告單欄 relation、composite FK 以 manual SQL 追加，再重跑 TC-10～TC-17                                                                               | Hybrid 下 `migrate dev` 不會移除 manual composite FK，Prisma Client 的型別仍可用                                                                                                                                                                                                                                                                                                                                                                                          |

### 共用：registry 查詢

S6、S7、S8 都使用同一組唯讀查詢：

- 查 `pg_constraint`（`conname`、`contype`、`pg_get_constraintdef(oid)`）。
- 查 `pg_indexes`（`indexname`、`indexdef`，確認含 `WHERE ("voidedAt" IS NULL)`）。

兩者都只篩選 `Poc*` 表，並與 registry 逐條比對名稱與定義。

---

## 7. 通過標準

Gate 0 **通過**的條件是以下全部成立：

1. TC-01～TC-19 全部符合預期。
2. TC-16 產生的 SQL 不含任何對 manual constraint 的 DROP 或 ALTER。
3. TC-20～TC-22 完成並記錄，且已確定一種能在 CI 偵測「manual constraint 遺失」的方法（registry 查詢、Prisma diff，或兩者並用）。
4. TC-23～TC-26 完成並記錄：明確寫出最終採用「原生 composite relation」或「Hybrid」；產生的 FK 的 `ON DELETE` 與 `ON UPDATE` 都是 `RESTRICT` 或 `NO ACTION`，沒有 `SET NULL` 或 `CASCADE`。
5. ADR-034 已撰寫並經人 Review 核准。

**失敗處理**：任何一項不符合（例如 `migrate dev` 會 DROP manual constraint、reset 後約束消失、無法可靠偵測 drift），就停止 Phase 2，並依 §6.5 步驟 7 在 ADR-034 提出替代方案，例如：

- Prisma 只負責 schema 與 client 生成，migration 改由 SQL-first 工具（dbmate、Atlas）管理。
- 以獨立、可重複執行的 SQL 步驟在每次 migrate 後補上約束，並以 registry 查詢把關。

替代方案經 Review 核准前，不建立完整 schema。

---

## 8. 產出

| 產出                                            | 說明                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `docs/adr/ADR-034-prisma-manual-constraints.md` | §11.2 指定的正式產出：實際版本、每個 TC 的結果、最終 migration strategy、CI drift 檢查方式 |
| PoC 執行紀錄                                    | 指令、輸出、產生的 SQL 全文，作為 ADR-034 附錄                                             |
| `poc/gate-0/`                                   | 拋棄式 PoC 程式碼（依 D-4）。不是正式 schema，不併入 `packages/db`                         |

---

## 9. 風險與限制

| 風險                                                            | 處理                                                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 本機沒有 Docker                                                 | 依 D-3 選擇環境；決定前無法執行                                                       |
| Prisma 主要版本更迭（8.0 RC 已出）                              | 結論只適用於 D-1 固定的版本。未來升級 Prisma 時需要重跑本 PoC 的 G0-4～G0-8           |
| Prisma 7 的 CLI 旗標、設定檔、driver adapter 用法可能與舊版不同 | 執行時以該版本的官方說明為準。本計畫的指令名稱以 §11.2 為準，實際旗標在執行紀錄中註明 |
| 誤連到非拋棄式 DB                                               | 第 3.3 節的 guard；container 與 port 都與 compose 分開                                |
| PoC 的 schema 被誤用為正式 schema                               | 依 D-4 隔離在 `poc/gate-0/`，並在檔頭標註 PoC                                         |

---

## 10. 本次執行紀錄

- **做了什麼**：唯讀閱讀 `ARCHITECTURE.md` 的 §11.2、ADR-34、§6.4、§6.5 與 `CLAUDE.md`、`docs/AI-DEVELOPMENT-LOOP.md`；以 `npm view` 查詢 Prisma 版本資訊、以 Docker Hub API 查詢 PostgreSQL tag，都沒有安裝。
- **沒有做的事**：沒有建立 schema、沒有執行 migration、沒有啟動或連線任何 DB、沒有修改程式碼、套件、lockfile 或 workflow。
- **檢查**：只對本文件執行既有的格式檢查。

---

READY FOR REVIEW
