# Gate 0 — native-candidate 驗收說明

**狀態**：程式與離線測試已完成；**資料庫實測尚未執行**。Gate 0 未通過，ADR-034 仍為 Proposed，正式 schema 繼續停止。

**依據**：

- `docs/ARCHITECTURE.md`（Architecture Approved v0.3，未修改）：§6.5 規則 1–7、ADR-24、ADR-34、§11.2
- `docs/reviews/PHASE-2-GATE-0-PLAN.md`
- `docs/adr/ADR-034-prisma-manual-constraints.md`

## 1. 為什麼需要候選策略

`hybrid-baseline` 的實測（run [37645666192](https://github.com/zrco001/CEproject/actions/runs/37645666192)）結果：

- **G0-1～G0-3 通過**：19 個違反案例、registry 8 項全部通過。
- **G0-4 TC-16 失敗**：在 schema 加入無關欄位 `note` 後，Prisma 產生的 `add_note` 草稿想要 `DROP` 以下四個物件：
  - 兩條 composite FK：`poc_allocation_payment_id_org_fkey`、`poc_payment_vendor_id_org_fkey`
  - 兩個 `(organizationId, id)` unique target：`poc_payment_org_id_key`、`poc_vendor_org_id_key`
- **3 條 CHECK 與 partial unique index 沒有被動到。**
- **草稿沒有被套用，reset 沒有執行，G0-5～G0-8 未執行。**

**原因判斷**：被要求刪除的都是 Prisma 能表達、但 Hybrid schema 沒有宣告的物件。`native-candidate` 改為在 Prisma schema 中原生宣告這四個物件；手寫 SQL 只保留 Prisma 無法表達的 3 條 CHECK 與 partial unique index。這是 §6.5 規則 7 已列出的選項，不是新的架構決定。

## 2. 候選內容

| 項目               | 內容                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Schema             | 重用 `poc/gate-0/variants/native/schema.prisma`（未修改）                                                                                                                                                                 |
| Init migration     | `poc/gate-0/native-candidate/migrations/20261008000000_init/migration.sql`：以固定的 Prisma 7.10.0 **離線**執行 `migrate diff --from-empty` 產生，再附加與 baseline **逐位元組相同**的 3 條 CHECK 與 partial unique index |
| 保留的語意         | 單欄 `id` 主鍵；`vendorId` 可空（MATCH SIMPLE）；所有 FK `ON DELETE RESTRICT ON UPDATE RESTRICT`；`(organizationId, id)` unique target；3 條 CHECK；`WHERE "voidedAt" IS NULL` 的 partial unique index                    |
| 與 baseline 的差異 | composite unique target 由 Prisma 建成 UNIQUE INDEX（不是 UNIQUE constraint）；composite FK 取代 `paymentId`／`vendorId` 的單欄 FK                                                                                        |
| 策略選擇           | `scripts/strategy.mjs` 嚴格 allowlist。未設定時為 `hybrid-baseline`；必須明確指定 `native-candidate`；空值或未知值在任何 DB 或暫存操作前就拒絕                                                                            |

baseline 的 schema、init migration、native variant、失敗證據與原有 58 項離線測試都保留未變；`guard.mjs`、`cases.mjs`、`registry.mjs`、`process-result.mjs`、`reset-evidence.mjs` 也沒有修改，版本與 lockfile 不變。

## 3. 候選實測時的通過標準（G0-1～G0-8）

候選與 baseline 走同一套步驟，以下任一項不符就停止：

| Gate                 | 標準                                                                                                                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0-1～G0-3           | 完整 registry 8 項（只允許 unique target 為 index）、FK 動作全部 RESTRICT／NO ACTION、19 個違反案例全部符合預期                                                                                                         |
| G0-4（TC-16、TC-17） | `add_note` 草稿必須包含 `ALTER TABLE "PocPayment" ADD COLUMN "note"`，且不得有任何 `DROP`，也不得提到任何受保護物件；套用後 registry 8 項仍完整                                                                         |
| G0-5（TC-18）        | reset 前寫入標記列；reset 後標記消失、所有 `Poc*` 表 OID 改變、每個 migration 都在快照後重新完成；之後 registry 與 19 案例重跑通過                                                                                      |
| G0-6（TC-19）        | 乾淨 DB `migrate deploy` 後 registry 與 19 案例通過                                                                                                                                                                     |
| G0-7（TC-20～TC-22） | 正向對照必須回傳 2；diff 只接受 0／2；TC-20、TC-21 的 drift script 不得有任何 `DROP` 或提到受保護物件，exit 2 時 script 不得為空、exit 0 時不得有 SQL 敘述（非破壞性差異只記錄）；刪除一條 CHECK 後 registry 必須偵測到 |
| G0-8（TC-23～TC-26） | native validate **必須**成功（不接受「不支援」）；生成 SQL 必須含兩條 composite FK 且為 RESTRICT；主 DB FK 稽核通過；native client 可生成                                                                               |

## 4. 離線驗證（已執行，非 Gate 證據）

| 項目                                    | 結果                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`（`poc/gate-0`）              | 123/123 通過（原有 58 項加新增 65 項）                                                                                                                                                                                                                                                                                                                                                                            |
| 新增測試涵蓋                            | 實測失敗的 DROP 草稿必須被拒；只加 `note` 的草稿通過；缺 `note`、空輸出、任何 DROP、碰到受保護物件都被拒；未知、空白、大小寫或空白字元不同的策略都被拒；弱化的 CHECK、partial uniqueness、組織 FK（單欄化、`ON UPDATE CASCADE`、`ON DELETE SET NULL`）都被判為 mismatched；G0-7 drift 判定：破壞性或碰到受保護物件的 drift、exit 2 配空 script、exit 0 配 SQL、非 0／2 的 exit code 都被拒，非破壞性 drift 只記錄 |
| 本機 PGlite 預檢（作者自述）            | 作者在本機暫存環境，以記憶體內 PGlite 0.5.8（內嵌 PostgreSQL 版本未記錄）執行候選 DDL 與 SQL：registry 8/8、5 條 RESTRICT FK、19/19 案例通過。沒有保存 artifact，**不是 Gate 證據**；未連線任何外部 PostgreSQL／Docker，未觸發 `gate0-poc.yml`，未執行 reset 或正式 migration                                                                                                                                     |
| 離線 schema 對 schema diff（加 `note`） | 只有 `ADD COLUMN "note"`。真正的 G0-4 需要 shadow DB，只能由實測證明                                                                                                                                                                                                                                                                                                                                              |

## 5. 實測方式（需另外的人工核准）

本 PR **不**執行資料庫。核准後由維護者手動操作：

1. **合併：** 由人合併本 PR。
2. **觸發：** Actions → 「Gate 0 PoC (disposable DB)」→ Run workflow，branch 選 `main`。
3. **輸入：**
   - `confirm`：`RUN GATE0 ON DISPOSABLE DB ONLY`
   - `strategy`：`native-candidate`
4. **取回報告：** 下載 `gate0-report-native-candidate` artifact，交付驗收。

一般 CI 只執行 PoC 離線測試，不會啟動資料庫。

## 6. 若候選不可行

依 §6.5 步驟 7 的既有備案：Prisma 只負責 schema 與 client，migration 改由 SQL-first 工具（例如 dbmate 或 Atlas）管理，並保留 registry 查詢作為 CI drift 檢查。

這只是提案，需經人工架構審查。不會自動改變正式策略或 Prisma 版本。
