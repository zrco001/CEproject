# Phase 1 Metric Status Acceptance — P1-09

**範圍**：§3.4 全部指標對照，確認每個指標對應 `METRIC_STATUS` 鍵、衍生依賴，或明確標注無 status 欄位。  
**基礎提交**：`c424745c730afa6cfd3376c69d4a7a315794876f`  
**實作狀態**：Claude 本機提案已由 Codex 審閱並套用；驗證紀錄見文末。最終 PR 批准與合併仍由人工執行。

---

## 合約指標

| 指標代號                 | 中文名稱           | 對應 whitelist / 說明                                                                            | 狀態             |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------ | ---------------- |
| `originalContractAmount` | 原合約金額         | `METRIC_STATUS.originalContractAmount`；Contract ∈ {SIGNED, COMPLETED}；條件 type=OWNER_CONTRACT | 現有             |
| `quotedAmount`           | 報價金額（未簽約） | `METRIC_STATUS.quotedAmount`；Contract ∈ {DRAFT}                                                 | 現有             |
| `approvedAdditions`      | 已核准追加         | `METRIC_STATUS.approvedAdditions`；ChangeOrder ∈ {APPROVED}；條件 type=ADDITION                  | **Phase 1 新增** |
| `approvedDeductions`     | 已核准扣減         | `METRIC_STATUS.approvedDeductions`；ChangeOrder ∈ {APPROVED}；條件 type=DEDUCTION                | **Phase 1 新增** |
| `currentContractAmount`  | 目前合約金額       | 衍生：originalContractAmount + approvedAdditions − approvedDeductions；無獨立 whitelist          | 衍生，不新增     |
| `pendingChangeOrders`    | 審核中追加減       | `METRIC_STATUS.pendingChangeOrders`；ChangeOrder ∈ {SUBMITTED}                                   | 現有             |

---

## 估驗 / 請款 / 收款 / 收入認列

| 指標代號                  | 中文名稱                 | 對應 whitelist / 說明                                                                                                                                                | 狀態           |
| ------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `totalCertified`          | 累計估驗                 | `METRIC_STATUS.totalCertified`；PB ∈ {APPROVED, INVOICED}                                                                                                            | 現有           |
| `billingPendingApproval`  | 請款審核中               | `METRIC_STATUS.billingPendingApproval`；PB ∈ {SUBMITTED}                                                                                                             | 現有           |
| `totalBilled`             | 累計請款（未稅）         | `METRIC_STATUS.totalBilled`；PB ∈ {INVOICED}                                                                                                                         | 現有           |
| `totalBilledWithTax`      | 累計請款（含稅）         | `METRIC_STATUS.totalBilledWithTax`；Receivable ∈ {UNPAID, PARTIALLY_PAID, PAID}；條件 sourceType=PROGRESS_BILLING                                                    | 現有           |
| `totalReceived`           | 累計收款（含待兌現票據） | `METRIC_STATUS.totalReceived`；Receipt ∈ {POSTED}；clearing ∈ {NOT_APPLICABLE, PENDING, CLEARED}；Receivable ∈ {UNPAID, PARTIALLY_PAID, PAID}；activeAllocationsOnly | 現有           |
| `totalCashReceived`       | 累計實收現金             | `METRIC_STATUS.totalCashReceived`；同上但 clearing ∈ {NOT_APPLICABLE, CLEARED}                                                                                       | 現有           |
| `unallocatedReceipts`     | 未分配收款 / 預收        | `METRIC_STATUS.unallocatedReceipts`；Receipt ∈ {POSTED}；clearing ∈ {NOT_APPLICABLE, PENDING, CLEARED}                                                               | 現有           |
| `accountsReceivable`      | 應收帳款                 | `METRIC_STATUS.accountsReceivable`；Receivable ∈ {UNPAID, PARTIALLY_PAID}                                                                                            | 現有           |
| `overdueReceivable`       | 逾期應收                 | `METRIC_STATUS.overdueReceivable`；Receivable ∈ {UNPAID, PARTIALLY_PAID}；條件 dueDate < today(org tz)                                                               | 現有           |
| `recognizedRevenue`       | 已認列收入               | `METRIC_STATUS.recognizedRevenue`；RevenueEntry ∈ {POSTED}                                                                                                           | 現有           |
| `billedProgressPercent`   | 請款進度 %               | 衍生：totalCertified / currentContractAmount × 100；無獨立 whitelist                                                                                                 | 衍生，不新增   |
| `physicalProgressPercent` | 實體進度 %               | 無 status 欄位；Project.physicalProgressPercent（PM 手填）                                                                                                           | 無 status 欄位 |

---

## 保留款

| 指標代號                       | 中文名稱       | 對應 whitelist / 說明                                                                                                                                                                                                                                                      | 狀態             |
| ------------------------------ | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `retentionHeld`                | 累計保留款     | `METRIC_STATUS.retentionHeld`；PB ∈ {APPROVED, INVOICED}                                                                                                                                                                                                                   | 現有             |
| `retentionClaimed`             | 已請領保留款   | `METRIC_STATUS.retentionClaimed`；RetentionRelease ∈ {INVOICED}                                                                                                                                                                                                            | 現有             |
| `retentionUnclaimed`           | 尚未請領保留款 | 衍生：retentionHeld − retentionClaimed；無獨立 whitelist                                                                                                                                                                                                                   | 衍生，不新增     |
| `retentionReceived`            | 已收回保留款   | `METRIC_STATUS.retentionReceived`；Receipt ∈ {POSTED}；clearingEffective；Receivable ∈ {UNPAID, PARTIALLY_PAID, PAID}；條件 sourceType=RETENTION_RELEASE；activeAllocationsOnly                                                                                            | 現有             |
| `retentionExpectedReleaseDate` | 預計退還日     | `METRIC_STATUS.retentionExpectedReleaseDate`；RetentionRelease ∈ {DRAFT, INVOICED}（DRAFT 表示尚未請領但已建立預計日期，與 retentionClaimed 的 INVOICED-only 不同）；有符合 release 時取 RetentionRelease.expectedReleaseDate，否則取 Project.retentionExpectedReleaseDate | **Phase 1 新增** |

---

## 成本

| 指標代號                  | 中文名稱             | 對應 whitelist / 說明                                                                              | 狀態           |
| ------------------------- | -------------------- | -------------------------------------------------------------------------------------------------- | -------------- |
| `budgetCost`              | 預算成本             | 無 status 欄位；未來 BudgetRevision 再加 whitelist                                                 | 無 status 欄位 |
| `actualCost`              | 實際成本             | `METRIC_STATUS.actualCost`；Expense ∈ {POSTED}；條件 scope=PROJECT                                 | 現有           |
| `pendingReviewCost`       | 待審成本（僅提示用） | `METRIC_STATUS.pendingReviewCost`；Expense ∈ {SUBMITTED}                                           | 現有           |
| `accountsPayable`         | 應付帳款             | `METRIC_STATUS.accountsPayable`；Payable ∈ {OPEN, PARTIALLY_PAID}                                  | 現有           |
| `unallocatedPayments`     | 未分配付款 / 預付    | `METRIC_STATUS.unallocatedPayments`；Payment ∈ {POSTED}；clearingEffective                         | 現有           |
| `employeeAdvancesPayable` | 應付員工代墊         | `METRIC_STATUS.employeeAdvancesPayable`；Payable ∈ {OPEN, PARTIALLY_PAID}；條件 payeeType=EMPLOYEE | 現有           |
| `variance(category)`      | 預算差異（各分類）   | 衍生：budgetCost − actualCost；依賴 actualCost whitelist                                           | 衍生，不新增   |
| `estimatedFinalCost`      | 預估完工成本         | 衍生：Σ_category max(budget, actual)；依賴 actualCost whitelist                                    | 衍生，不新增   |

---

## 損益（四項，命名嚴格分開）

| 指標代號                 | UI 名稱                                  | 公式 / 依賴                                                                            | 狀態         |
| ------------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------- | ------------ |
| `estimatedProjectProfit` | 預估工程毛利（Estimated Project Profit） | 衍生：currentContractAmount − estimatedFinalCost；無獨立 whitelist                     | 衍生，不新增 |
| `estimatedMargin`        | 預估毛利率（Estimated Margin）           | 衍生：estimatedProjectProfit / currentContractAmount；currentContractAmount = 0 → null | 衍生，不新增 |
| `recognizedProfit`       | 已認列損益（Recognized Profit）          | 衍生：recognizedRevenue − actualCost；工程前期常為負值，UI 需附說明                    | 衍生，不新增 |
| `recognizedMargin`       | 已認列毛利率                             | 衍生：recognizedProfit / recognizedRevenue；recognizedRevenue = 0 → null               | 衍生，不新增 |

> v0.1 的 `actualProfit` 名稱已廢除。Project Card 顯示「預估毛利 %」（estimatedMargin）；工程損益頁兩組並列並以不同區塊呈現。

---

## Company Dashboard

| 顯示名稱        | 對應鍵                   | 對應 whitelist / 說明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 狀態                             |
| --------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| 施工中工程數    | `activeProjects`         | `METRIC_STATUS.activeProjects`；Project ∈ {ACTIVE}                                                                                                                                                                                                                                                                                                                                                                                                                                                           | 現有                             |
| 本月待收        | `receivableDueThisMonth` | `METRIC_STATUS.receivableDueThisMonth`；Receivable ∈ {UNPAID, PARTIALLY_PAID}；條件 dueDate ∈ 本月(org tz)                                                                                                                                                                                                                                                                                                                                                                                                   | 現有                             |
| 本月待付        | `payableDueThisMonth`    | `METRIC_STATUS.payableDueThisMonth`；Payable ∈ {OPEN, PARTIALLY_PAID}；條件 dueDate ∈ 本月(org tz)                                                                                                                                                                                                                                                                                                                                                                                                           | 現有                             |
| 逾期應收        | `overdueReceivable`      | `METRIC_STATUS.overdueReceivable`（共用）；Receivable ∈ {UNPAID, PARTIALLY_PAID}；條件 dueDate < today                                                                                                                                                                                                                                                                                                                                                                                                       | 現有                             |
| 今日待處理      | （複合，後期查詢）       | 規格映射：① `accountsReceivable`（Receivable ∈ {UNPAID, PARTIALLY_PAID}，dueDate = today(org tz)）；② `accountsPayable`（Payable ∈ {OPEN, PARTIALLY_PAID}，dueDate = today(org tz)）；③ `pendingReviewCost`（Expense ∈ {SUBMITTED}，需 expense.post 權限）；④ 我的 Expense ∈ {DRAFT} 且 rejectionReason 非空（被退回）；⑤ Payment/Receipt clearingStatus ∈ {PENDING} 且 checkDueDate = today（到期支票）。④⑤ 無專屬 METRIC_STATUS 鍵；員工身份過濾與 permission 評估屬後期業務查詢，Phase 1 不新增執行邏輯。 | 依規格映射；複合查詢／權限未實作 |
| 銀行 / 現金餘額 | `bankBalance`            | `METRIC_STATUS.bankBalance`；BankTransaction ∈ {POSTED}（支票 PENDING 時尚無 BankTransaction，天然排除）                                                                                                                                                                                                                                                                                                                                                                                                     | 現有                             |

---

## 票據（Cash Flow 用；Phase 8 後報表）

| 指標代號                  | 中文名稱       | 對應 whitelist / 說明                                                                                | 狀態         |
| ------------------------- | -------------- | ---------------------------------------------------------------------------------------------------- | ------------ |
| `pendingChecksPayable`    | 待兌現應付票據 | `METRIC_STATUS.pendingChecksPayable`；Payment ∈ {POSTED}；clearing ∈ {PENDING}；條件 method=CHECK    | 現有         |
| `pendingChecksReceivable` | 待兌現應收票據 | `METRIC_STATUS.pendingChecksReceivable`；Receipt ∈ {POSTED}；clearing ∈ {PENDING}；條件 method=CHECK | 現有         |
| `bouncedChecks`           | 退票           | `METRIC_STATUS.bouncedChecks`；Settlement ∈ {POSTED}；clearing ∈ {BOUNCED}                           | 現有         |
| `projectedCashBalance`    | 預估可用資金   | 衍生：bankBalance + pendingChecksReceivable − pendingChecksPayable；無獨立 whitelist                 | 衍生，不新增 |

---

## 實作說明

### Phase 1 新增三項

- **`approvedAdditions`**：複用 ChangeOrder APPROVED whitelist（與 `approvedChangeOrders` 相同 status 集合），以 `conditions` 區分 `changeOrder.type = ADDITION`。
- **`approvedDeductions`**：同上，條件 `changeOrder.type = DEDUCTION`。
- **`retentionExpectedReleaseDate`**：RetentionRelease ∈ {DRAFT, INVOICED}，比 `retentionClaimed` 多納入 DRAFT（已建立預計退還日但尚未請領的 release）。來源優先序：RetentionRelease.expectedReleaseDate → Project.retentionExpectedReleaseDate（fallback）。

  > **日期篩選注意事項**：RetentionRelease ∈ {DRAFT, INVOICED} 僅篩選候選 release，不應透過 INNER JOIN 或全域條件排除沒有符合 release 的 Project。沒有候選時，metadata 指定回退到 Project.retentionExpectedReleaseDate；執行查詢尚未實作。多筆符合 release 的選取順序尚未指定，不在本次實作範圍。Runtime query 驗證及 golden/tenant 驗證待後續進行。

29 個既有公開鍵的 label、filters、conditions、activeAllocationsOnly 均保留；其中 `approvedChangeOrders` 仍是既有追加減合計，`bouncedChecks` 仍保留 POSTED + BOUNCED 條件。衍生指標沿表中依賴追溯至相應 whitelist，本次沒有新增計算函式或變更既有規則。

### 明確排除範圍

- 衍生指標計算函數（currentContractAmount、estimatedFinalCost、四項損益/毛利率）
- 今日待處理業務查詢與 permission 評估
- DB schema / migration / Prisma model
- State machine 變更、Money/Rate 計算
- Golden value / tenant / runtime query 驗證

### 測試驗收狀態

測試由 Claude 撰寫，**未由 Claude 執行**。Codex 已獨立核對完整差異與 §3.4 語意，並完成下列本機驗證：  
泛型分類迴圈測試（現有）自動覆蓋全部 32 個 `METRIC_STATUS` 鍵，含三個新增項。  
新增四項具名測試**僅驗證 metadata 定義**（conditions 陣列等值、changeOrder status 集合、RetentionRelease 白名單、來源優先序字串），不涉及金額計算或 runtime 日期選擇。

- 格式、lint、typecheck 通過；shared 132、API 20、web 15、config 7，共 174 項測試通過，其中 metric-status 為 42 項。
- 本機 `pnpm test` 起初受 Windows SWC 預設快取 DACL 檢查阻擋；API 改以工作區內較短的 `SWC_NATIVE_BINDING_CACHE` 路徑單獨執行後通過。沒有修改 DACL、依賴或專案設定，其餘套件也完成測試。
- 編譯後逐項深度比較：29 個既有 metadata 定義完全一致，新增鍵僅三項；對照表包含規格全部 45 列。
- AI loop 保護測試 41 項、現有 workflows 的 actionlint 檢查通過。GitHub 的完整 CI（含 build、Docker images/compose）須以發布 commit 的 Actions 結果確認；不以本機 Windows 環境代替。
- Claude 使用現有 Pro 訂閱，共三次嘗試；第二次在 600 秒後停止，第三次修正提案通過。未重設 ledger，未修改一般 exporter 的財務路徑保護。

---

CODEX REVIEW COMPLETED — 修改限於此份文件及 `metric-status.ts`、`metric-status.test.ts`。財務 metadata 的實作方案已由人批准；這不代表對發布 commit 的 PR APPROVED review。仍須完整 CI、當前 SHA 的獨立真人 PR 批准與人工最終合併。Runtime/golden/tenant 查詢、iOS Safari、DB/Phase 2 不在本次驗收範圍。
